import {
  AlgorithmDilithium5,
  HYBRID_SIG_TYPE_URL,
  ML_DSA_87_PUBLIC_KEY_LENGTH,
  ML_DSA_87_SIGNATURE_LENGTH,
  RestClient,
  bech32ToHex,
  isDegeneratePqcPublicKey,
  isValidBech32,
  msg,
  qorechainRegistry,
  qorechainTypes,
  waitForTx,
  type GetTxResponse,
} from "@qorechain/sdk";

import { CHAIN_ID, EVM_CHAIN_ID, REST_BASE } from "./network.js";

/** Public address only; the provider and public keys stay in ephemeral memory. */
export interface WalletConnection {
  readonly address: string;
}

/** The wallet returned a real hash, but submission is not proof of an anchor. */
export class SubmittedAnchorError extends Error {
  readonly txHash: string;
  readonly cause?: unknown;

  constructor(message: string, txHash: string, cause?: unknown) {
    super(message);
    this.name = "SubmittedAnchorError";
    this.txHash = txHash;
    this.cause = cause;
  }
}

/** A wallet error may follow broadcast without exposing a transaction hash. */
export class AnchorSubmissionUnknownError extends Error {
  readonly mayHaveBeenSubmitted = true;
  readonly cause?: unknown;

  constructor(cause?: unknown) {
    super(
      "QoreX did not return a usable transaction hash. Submission is uncertain: " +
        "do not retry blindly. Check QoreX history and recover the real hash before verifying.",
    );
    this.name = "AnchorSubmissionUnknownError";
    this.cause = cause;
  }
}

export const ANCHOR_FEE_EXPLANATION =
  "One 1 uqor (0.000001 QOR) self-transfer carries the hash memo. " +
  "The transfer stays yours; a separate QoreX-set gas fee is charged. " +
  "Review the exact fee in QoreX before approving. A funded account with an " +
  "existing ML-DSA-87 key is required; Chit never registers keys.";

/*
 * Authoritative provider contract (not a Keplr/Ethereum API guess):
 * https://github.com/qorechain/qorex-integrations/blob/main/packages/types/src/providers.ts
 * https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/add-to-keplr-integration.md
 * https://docs.qorechain.io/qorex/browser-extension/#sign-and-broadcast
 *
 * Current QoreX signDirect cannot add the PQC layer; EVM eth_sendTransaction
 * is unsupported. signAndBroadcast builds both signatures inside the wallet.
 * It exposes no unsigned/signed TxRaw before broadcast, so the app cannot
 * audit the hybrid signature before submission. Only read-back inspection is
 * possible. QoreX source is not public; an injected provider's claimed identity
 * cannot be cryptographically authenticated by a web page.
 */
interface QoreXAnchorRequest {
  chainId: typeof CHAIN_ID;
  messages: [{ typeUrl: string; value: number[] }];
  memo: string;
}

interface QoreXNativeProvider {
  readonly isQoreX: true;
  readonly capabilities: readonly string[];
  enable(chainId: string): Promise<unknown>;
  getKey(chainId: string): Promise<unknown>;
  signAndBroadcast(request: QoreXAnchorRequest): Promise<unknown>;
}

interface QoreXEvmProvider {
  readonly isQoreX: true;
  request(request: { method: "eth_chainId" }): Promise<unknown>;
}

interface Providers {
  native: QoreXNativeProvider;
  evm: QoreXEvmProvider;
}

interface Session extends Providers {
  publicKey: Uint8Array;
}

const sessions = new WeakMap<WalletConnection, Session>();
// Ephemeral duplicate guard, retained across reconnects in this page. The UI
// must separately save a non-PII pending draft before calling anchorReceipt.
const attempts = new Map<string, { txHash?: string }>();
let anchoring = false;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function injectedQoreX(): Providers {
  if (typeof window === "undefined") {
    throw new Error("Connect using a browser with the real QoreX wallet installed.");
  }
  const injected = object((window as Window & { qorex?: unknown }).qorex);
  const native = object(injected?.native);
  const evm = object(injected?.evm);
  if (
    native?.isQoreX !== true ||
    evm?.isQoreX !== true ||
    typeof native.enable !== "function" ||
    typeof native.getKey !== "function" ||
    typeof evm.request !== "function"
  ) {
    throw new Error("QoreX was not found. Other wallets and classical-only providers are unsupported.");
  }
  if (
    !Array.isArray(native.capabilities) ||
    !native.capabilities.includes("signAndBroadcast") ||
    typeof native.signAndBroadcast !== "function"
  ) {
    throw new Error("Update QoreX: native hybrid signAndBroadcast support is required. There is no classical fallback.");
  }
  return { native: native as unknown as QoreXNativeProvider, evm: evm as unknown as QoreXEvmProvider };
}

async function assertWalletNetwork(evm: QoreXEvmProvider): Promise<void> {
  const selected = await evm.request({ method: "eth_chainId" });
  if (typeof selected !== "string" || !/^0x[0-9a-f]+$/i.test(selected) || BigInt(selected) !== BigInt(EVM_CHAIN_ID)) {
    throw new Error(`Select QoreChain Diana testnet (${CHAIN_ID}, EVM ${EVM_CHAIN_ID}) inside QoreX, then reconnect. Chit will not switch networks.`);
  }
}

function bridgeBytes(value: unknown, length: number): Uint8Array {
  if (
    !Array.isArray(value) || value.length !== length ||
    !value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error("QoreX returned an unsupported account-key format.");
  }
  return Uint8Array.from(value);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

async function walletKey(native: QoreXNativeProvider): Promise<{ address: string; publicKey: Uint8Array }> {
  const key = object(await native.getKey(CHAIN_ID));
  const address = key?.bech32Address;
  if (
    key?.name !== "QoreX" || key.algo !== "secp256k1" ||
    typeof address !== "string" || address !== address.toLowerCase() ||
    !isValidBech32(address, "qor") || bech32ToHex(address).length !== 42
  ) {
    throw new Error("QoreX returned an unsupported account. A real qor1… secp256k1 account is required.");
  }
  const publicKey = bridgeBytes(key.pubKey, 33);
  const addressBytes = bridgeBytes(key.address, 20);
  const addressHex = "0x" + Array.from(addressBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if ((publicKey[0] !== 2 && publicKey[0] !== 3) || bech32ToHex(address) !== addressHex) {
    throw new Error("QoreX returned inconsistent public account data; reconnect with a supported account.");
  }
  return { address, publicKey };
}

export async function connectQoreX(): Promise<WalletConnection> {
  const providers = injectedQoreX();
  await assertWalletNetwork(providers.evm);
  await providers.native.enable(CHAIN_ID);
  const key = await walletKey(providers.native);
  await assertWalletNetwork(providers.evm);
  const connection: WalletConnection = Object.freeze({ address: key.address });
  sessions.set(connection, { ...providers, publicKey: key.publicKey });
  return connection;
}

function base64Bytes(value: unknown): Uint8Array {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 16384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error("The node returned unreadable signature/public-key bytes.");
  }
  const binary = atob(value);
  if (btoa(binary) !== value) throw new Error("The node returned non-canonical base64 bytes.");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function assertAnchorPreconditions(rest: RestClient, address: string, publicKey: Uint8Array): Promise<Uint8Array> {
  const info = object(await rest.get<unknown>("/cosmos/base/tendermint/v1beta1/node_info"));
  if (object(info?.default_node_info)?.network !== CHAIN_ID) {
    throw new Error(`REST did not identify ${CHAIN_ID}; nothing was sent.`);
  }
  const policy = object(object(await rest.get<unknown>("/qorechain/pqc/v1/params"))?.params);
  if (
    policy?.hybrid_signature_mode !== 2 || policy.allow_classical_fallback !== false ||
    policy.pqc_primary !== true
  ) {
    throw new Error("Cannot confirm required hybrid signing with classical fallback disabled; nothing was sent.");
  }
  // QoreX otherwise bootstraps a first key registration before the requested
  // send. There is no public no-bootstrap option. Do a fresh, uncached read and
  // refuse a missing/unusable key instead of requesting that extra broadcast.
  const registration = object(await rest.getPqcAccount<unknown>(address));
  if (registration?.found !== true) {
    throw new Error("An existing ML-DSA-87 key registration is required. Set up this account in QoreX separately, then reconnect. Chit will not register a key or broadcast a bootstrap transaction.");
  }
  const account = object(registration.account);
  if (
    account?.address !== address || account.algorithm_id !== AlgorithmDilithium5 ||
    (account.key_type !== "hybrid" && account.key_type !== "pqc_only")
  ) {
    throw new Error("The existing PQC account is incompatible with ML-DSA-87 hybrid signing; nothing was sent.");
  }
  const pqcKey = base64Bytes(account.public_key);
  if (pqcKey.length !== ML_DSA_87_PUBLIC_KEY_LENGTH || isDegeneratePqcPublicKey(pqcKey)) {
    throw new Error("The registered ML-DSA-87 public key is missing or unusable; nothing was sent.");
  }
  if (typeof account.ecdsa_pubkey === "string" && account.ecdsa_pubkey !== "") {
    if (!equalBytes(base64Bytes(account.ecdsa_pubkey), publicKey)) {
      throw new Error("QoreX's public account key differs from the on-chain account; nothing was sent.");
    }
  }
  return pqcKey;
}

function nativeTxHash(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const hash = value.replace(/^0x/i, "");
  // Length rejects the trailing-newline exception of JavaScript's $ anchor.
  return hash.length === 64 && /^[0-9a-f]{64}$/i.test(hash) ? hash.toUpperCase() : undefined;
}

function knownPreSubmissionRefusal(error: unknown): boolean {
  const info = object(error);
  if (info?.code === 4001) return true;
  const text = error instanceof Error ? error.message : info?.message;
  return typeof text === "string" && (
    /^QoreX: (?:connection rejected|signature rejected|wallet is locked|unknown signer address)$/.test(text) ||
    /^QoreX: (?:unsupported chain |(?:signature )?chain .* does not match the active network |send between 1 and 32 messages|the memo may be at most 256 bytes)/.test(text) ||
    /^QoreX: .* is managed by the wallet itself, not by a website$/.test(text)
  );
}

/** Inspect structure only, not an independent cryptographic/inclusion proof. */
function inspectCommittedAnchor(raw: GetTxResponse, txHash: string, memo: string, address: string, pqcKey: Uint8Array): void {
  if (
    raw.tx_response?.code !== 0 || nativeTxHash(raw.tx_response.txhash) !== txHash ||
    typeof raw.tx_response.height !== "string" || !/^[1-9][0-9]*$/.test(raw.tx_response.height)
  ) {
    throw new Error("The node did not confirm a successful included transaction with this hash.");
  }
  const tx = object(raw.tx);
  const body = object(tx?.body);
  if (body?.memo !== memo) throw new Error("The committed memo differs from the requested CHIT hash.");
  const messages = body.messages;
  const send = Array.isArray(messages) && messages.length === 1 ? object(messages[0]) : undefined;
  const coins = send?.amount;
  const coin = Array.isArray(coins) && coins.length === 1 ? object(coins[0]) : undefined;
  if (
    send?.["@type"] !== "/cosmos.bank.v1beta1.MsgSend" ||
    send.from_address !== address || send.to_address !== address ||
    coin?.denom !== "uqor" || coin.amount !== "1"
  ) {
    throw new Error("The committed transaction is not the single requested 1 uqor self-transfer.");
  }
  const extensions = body.extension_options;
  const extension = Array.isArray(extensions) && extensions.length === 1 ? object(extensions[0]) : undefined;
  if (!extension) throw new Error("The committed transaction has no single critical hybrid extension.");
  let hybrid: ReturnType<typeof qorechainTypes.pqcHybrid.PQCHybridSignature.decode>;
  if (extension["@type"] === HYBRID_SIG_TYPE_URL) {
    if (extension.algorithm_id !== AlgorithmDilithium5) throw new Error("Unsupported hybrid signature algorithm.");
    hybrid = qorechainTypes.pqcHybrid.PQCHybridSignature.create({
      algorithmId: extension.algorithm_id,
      pqcSignature: base64Bytes(extension.pqc_signature),
      pqcPublicKey: extension.pqc_public_key == null || extension.pqc_public_key === ""
        ? new Uint8Array() : base64Bytes(extension.pqc_public_key),
    });
  } else if (extension.type_url === HYBRID_SIG_TYPE_URL) {
    // Standard protobuf Any form; its value is protobuf, never JSON bytes.
    hybrid = qorechainTypes.pqcHybrid.PQCHybridSignature.decode(base64Bytes(extension.value));
  } else {
    throw new Error("The committed critical extension is not PQCHybridSignature.");
  }
  if (
    hybrid.algorithmId !== AlgorithmDilithium5 || hybrid.pqcSignature.length !== ML_DSA_87_SIGNATURE_LENGTH ||
    (hybrid.pqcPublicKey.length !== 0 && !equalBytes(hybrid.pqcPublicKey, pqcKey))
  ) {
    throw new Error("The committed ML-DSA-87 extension is malformed or uses an unexpected public key.");
  }
  const nonCritical = body.non_critical_extension_options;
  if (nonCritical !== undefined && (!Array.isArray(nonCritical) || nonCritical.length !== 0)) {
    throw new Error("Unexpected non-critical extensions in the committed transaction.");
  }
  const signatures = tx?.signatures;
  if (!Array.isArray(signatures) || signatures.length !== 1) throw new Error("Missing classical half of the hybrid signature.");
  const classicalLength = base64Bytes(signatures[0]).length;
  if (classicalLength !== 64 && classicalLength !== 65) throw new Error("Malformed classical half of the hybrid signature.");
}

/**
 * Send exactly one wallet transaction containing only a hash memo and the
 * minimal self-transfer. No receipt fields, key-registration messages, secrets,
 * page-side signatures, automatic retries, or classical-signing path exist.
 * Save the pending draft before invoking this function; all known hashes remain
 * recoverable in SubmittedAnchorError even if REST indexing/checks fail.
 */
export async function anchorReceipt(connection: WalletConnection, receiptHash: string): Promise<{ txHash: string }> {
  if (typeof receiptHash !== "string" || receiptHash.length !== 64 || !/^[0-9a-f]{64}$/.test(receiptHash)) {
    throw new Error("receiptHash must be exactly 64 lowercase SHA-256 hexadecimal characters.");
  }
  const session = sessions.get(connection);
  if (!session) throw new Error("Connect to QoreX in this page before anchoring. Saved addresses are not wallet connections.");
  const attemptKey = `${CHAIN_ID}:${connection.address}:${receiptHash}`;
  const previous = attempts.get(attemptKey);
  if (previous) {
    if (previous.txHash) throw new SubmittedAnchorError("This receipt was already submitted. Verify/recover the existing transaction instead of broadcasting again.", previous.txHash);
    throw new AnchorSubmissionUnknownError();
  }
  if (anchoring) throw new Error("Another anchor request is in progress. Wait for QoreX; do not submit twice.");
  anchoring = true;
  try {
    const providers = injectedQoreX();
    if (providers.native !== session.native || providers.evm !== session.evm) {
      throw new Error("The QoreX provider changed. Reconnect before anchoring.");
    }
    await assertWalletNetwork(session.evm);
    const rest = new RestClient(REST_BASE, { timeoutMs: 12000, retries: 0 });
    const pqcKey = await assertAnchorPreconditions(rest, connection.address, session.publicKey);
    // QoreX currently emits no keystore-change event. Re-read at the last
    // possible point instead of using a connected address as a signing oracle.
    const current = await walletKey(session.native);
    if (current.address !== connection.address || !equalBytes(current.publicKey, session.publicKey)) {
      throw new Error("The active QoreX account changed. Reconnect before anchoring.");
    }
    await assertWalletNetwork(session.evm);
    const message = msg.bank.send({
      fromAddress: current.address,
      toAddress: current.address,
      amount: [{ denom: "uqor", amount: "1" }],
    });
    const memo = `CHIT:v1:${receiptHash}`;
    const request: QoreXAnchorRequest = {
      chainId: CHAIN_ID,
      messages: [{ typeUrl: message.typeUrl, value: Array.from(qorechainRegistry().encode(message)) }],
      memo,
    };
    // The only call in Chit that can broadcast. Never retry this call. The
    // wallet owns fee estimation and displays its exact fee before approval.
    attempts.set(attemptKey, {});
    let result: unknown;
    try {
      result = await session.native.signAndBroadcast(request);
    } catch (error) {
      const txHash = nativeTxHash(object(error)?.txHash);
      if (txHash) {
        attempts.set(attemptKey, { txHash });
        throw new SubmittedAnchorError("QoreX reported a transaction hash but then failed. Recover and verify this hash; do not rebroadcast.", txHash, error);
      }
      if (knownPreSubmissionRefusal(error)) {
        attempts.delete(attemptKey);
        throw error;
      }
      throw new AnchorSubmissionUnknownError(error);
    }
    const response = object(result);
    const txHash = nativeTxHash(response?.txHash);
    if (!txHash) throw new AnchorSubmissionUnknownError();
    attempts.set(attemptKey, { txHash });
    try {
      if (response?.code !== 0) throw new Error("QoreX did not return a successful transaction code.");
      if (response.shield === "downgraded" || response.shield === "classical") {
        throw new Error("QoreX reported a missing hybrid layer. This transaction must not be treated as an anchor.");
      }
      const included = await waitForTx(rest, txHash, { timeoutMs: 20000, pollIntervalMs: 1500 });
      inspectCommittedAnchor(included.raw, txHash, memo, current.address, pqcKey);
      // Structural read-back is not independent verification. App should label
      // this Submitted until its separate verifier confirms the chain evidence.
      return { txHash };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Read-back could not be inspected.";
      throw new SubmittedAnchorError(`Transaction submitted, but anchor confirmation failed: ${reason} Verify/recover this hash; do not rebroadcast.`, txHash, error);
    }
  } finally {
    anchoring = false;
  }
}
