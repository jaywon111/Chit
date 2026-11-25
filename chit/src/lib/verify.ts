import { HYBRID_SIG_TYPE_URL, qorechainTypes } from "@qorechain/sdk";
import { CHAIN_ID, REST_BASE, REST_URL } from "./network.js";
import { normalizeIssuerAddress, normalizeIssuerPolicy, type IssuerPolicy } from "./issuers.js";
import { normalizeTxHash } from "./receipt.js";

export interface HybridEvidence {
  present: boolean;
  typeUrl: string | null;
  placement: "critical" | "non-critical" | null;
  algorithmId: number | null;
  signatureBytes: number | null;
  validShape: boolean;
}

export interface ChainEvidence {
  txHash: string;
  chainId: string;
  success: boolean;
  code: number | null;
  height: string;
  timestamp: string;
  memo: string;
  signerAddress: string | null;
  anchoredHash: string | null;
  extension: HybridEvidence;
  classicalSignatureBytes: number | null;
  classicalSignatureValid: boolean;
  pqcEventStatus: string;
  pqcEventVerified: boolean;
  hybridVerified: boolean;
  sourceUrl: string;
}

export interface VerificationVerdict {
  kind: "pending" | "verified" | "tampered" | "failed" | "incomplete" | "unauthorized";
  title: string;
  detail: string;
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const typeUrl = (value: JsonObject): string => str(value["@type"] ?? value.type_url ?? value.typeUrl);

export function decodeBase64(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.length <= 20_000 && value.every((byte) => Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255)) return new Uint8Array(value as number[]);
  if (typeof value !== "string" || value.length > 30_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error("Invalid signature encoding");
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function signatureLength(value: unknown): number | null {
  try { return decodeBase64(value).length; } catch { return null; }
}

function extensionEvidence(body: JsonObject): HybridEvidence {
  const critical = array(body.extension_options ?? body.extensionOptions).map(object);
  const nonCritical = array(body.non_critical_extension_options ?? body.nonCriticalExtensionOptions).map(object);
  const matching = [...critical, ...nonCritical].filter((entry) => typeUrl(entry) === HYBRID_SIG_TYPE_URL);
  const otherPqc = [...critical, ...nonCritical].find((entry) => /pqc.*signature/i.test(typeUrl(entry)));
  const extension = matching[0] ?? otherPqc;
  const evidence: HybridEvidence = { present: !!extension, typeUrl: extension ? typeUrl(extension) : null, placement: extension ? critical.includes(extension) ? "critical" : "non-critical" : null, algorithmId: null, signatureBytes: null, validShape: false };
  if (!extension || typeUrl(extension) !== HYBRID_SIG_TYPE_URL) return evidence;
  try {
    if (extension.value !== undefined) {
      // Cosmos Any can be returned as protobuf bytes rather than expanded JSON.
      const decoded = qorechainTypes.pqcHybrid.PQCHybridSignature.decode(decodeBase64(extension.value));
      evidence.algorithmId = decoded.algorithmId;
      evidence.signatureBytes = decoded.pqcSignature.length;
    } else {
      const algorithm = extension.algorithm_id ?? extension.algorithmId;
      evidence.algorithmId = (typeof algorithm === "number" || typeof algorithm === "string") && Number.isInteger(Number(algorithm)) ? Number(algorithm) : null;
      evidence.signatureBytes = signatureLength(extension.pqc_signature ?? extension.pqcSignature);
    }
    // A signature-sized string is not itself cryptographic proof: the event and
    // successful delivery are required too. Critical placement is chain-specific.
    evidence.validShape = matching.length === 1 && evidence.placement === "critical" && evidence.algorithmId === 1 && evidence.signatureBytes === 4627;
  } catch { /* Malformed or unsupported evidence fails closed. */ }
  return evidence;
}

function eventText(value: unknown, isKey = false): string {
  const raw = str(value).trim().toLowerCase();
  const known = isKey ? ["status", "algorithm_id"] : ["verified", "success", "valid", "passed", "true", "failed", "false", "invalid", "rejected", "dilithium5", "ml-dsa-87", "mldsa87", "1"];
  if (known.includes(raw)) return raw;
  try {
    const decoded = new TextDecoder().decode(decodeBase64(str(value))).trim().toLowerCase();
    if (known.includes(decoded)) return decoded;
  } catch { /* LCD returns plain strings; older RPCs sometimes return base64. */ }
  return raw.length <= 32 && /^[a-z0-9_-]+$/.test(raw) ? raw : "unrecognized";
}

function hybridEvent(response: JsonObject): { status: string; verified: boolean } {
  const direct = array(response.events);
  // Both LCD event surfaces can be present. Never ignore contradictory logs.
  const events = [...direct, ...array(response.logs).flatMap((log) => array(object(log).events))].map(object);
  const hybrid = events.filter((event) => str(event.type) === "pqc_hybrid_verify");
  if (!hybrid.length) return { status: "missing", verified: false };
  const statuses = hybrid.map((event) => {
    const attrs = array(event.attributes).map(object);
    const statusAttrs = attrs.filter((attr) => eventText(attr.key, true) === "status");
    const status = statusAttrs.length === 1 ? eventText(statusAttrs[0].value) : "missing";
    const algorithms = attrs.filter((attr) => eventText(attr.key, true) === "algorithm_id").map((attr) => eventText(attr.value));
    const algorithmValid = algorithms.length === 1 && ["1", "dilithium5", "ml-dsa-87", "mldsa87"].includes(algorithms[0]);
    // Diana's actual success status is "verified". Unproven legacy-looking
    // aliases (including "true"/"success") must not produce a success claim.
    return { status, valid: algorithmValid && status === "verified" };
  });
  return { status: [...new Set(statuses.map((entry) => entry.status))].join(", "), verified: statuses.every((entry) => entry.valid) };
}

function transactionSigner(body: JsonObject): string | null {
  // Only the sender of exactly one supported on-chain message is unambiguous.
  // Never infer an issuer from fee payer, recipient, events, or pasted metadata.
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length !== 1) return null;
  const send = object(messages[0]);
  const types = [send["@type"], send.type_url, send.typeUrl].filter((value) => value !== undefined);
  if (!types.length || types.some((value) => value !== "/cosmos.bank.v1beta1.MsgSend")) return null;
  try { return normalizeIssuerAddress(send.from_address); } catch { return null; }
}

/** Never uses a supplied receiptHash/issuer as chain evidence. Only the on-chain transaction. */
export function inspectTransaction(payload: unknown, requestedTxHash: string, network: string = CHAIN_ID, sourceUrl?: string): ChainEvidence {
  const root = object(payload);
  const response = object(root.tx_response);
  if (!Object.keys(response).length) throw new Error("The REST response does not contain a transaction result.");
  const txHash = normalizeTxHash(requestedTxHash);
  let returnedHash: string;
  try { returnedHash = normalizeTxHash(response.txhash); } catch { throw new Error("The node did not return a valid transaction hash; verification is incomplete."); }
  if (returnedHash !== txHash) throw new Error("The node returned a different transaction. This evidence was rejected.");
  const tx = object(root.tx ?? response.tx);
  const body = object(tx.body);
  const code = typeof response.code === "number" && Number.isInteger(response.code) ? response.code : null;
  const height = str(response.height);
  const committed = /^\d+$/.test(height) && BigInt(height) > 0n;
  const memo = str(body.memo);
  const candidate = /^CHIT:v1:([a-fA-F0-9]{64})$/.exec(memo);
  const match = candidate?.[0] === memo ? candidate : null;
  const extension = extensionEvidence(body);
  const signatures = array(tx.signatures);
  const auth = object(tx.auth_info ?? tx.authInfo);
  const signerInfos = array(auth.signer_infos ?? auth.signerInfos).map(object);
  const publicKey = object(signerInfos[0]?.public_key ?? signerInfos[0]?.publicKey);
  const classicalSignatureBytes = signatures.length === 1 ? signatureLength(signatures[0]) : null;
  let classicalPublicKeyValid = false;
  try {
    const key = decodeBase64(publicKey.key);
    classicalPublicKeyValid = key.length === 33 && (key[0] === 2 || key[0] === 3);
  } catch { /* A type URL alone is not public-key evidence. */ }
  // Eth-native QoreX keys also use secp256k1, with a 65-byte recoverable sig.
  const classicalSignatureValid = signerInfos.length === 1 && classicalPublicKeyValid && /\.(?:eth_?)?secp256k1\.PubKey$/.test(typeUrl(publicKey)) && (classicalSignatureBytes === 64 || classicalSignatureBytes === 65);
  const event = hybridEvent(response);
  const success = code === 0 && committed;
  return {
    txHash, chainId: network, success, code, height,
    timestamp: str(response.timestamp),
    memo, signerAddress: transactionSigner(body),
    anchoredHash: match?.[1].toLowerCase() ?? null,
    extension, classicalSignatureBytes, classicalSignatureValid,
    pqcEventStatus: event.status, pqcEventVerified: event.verified,
    hybridVerified: extension.validShape && classicalSignatureValid && event.verified,
    // Pure classification defaults to the public reference; live reads pass their actual URL.
    sourceUrl: sourceUrl ?? `${REST_URL}/cosmos/tx/v1beta1/txs/${txHash}`,
  };
}

export function verificationVerdict(evidence: ChainEvidence | null, computedHash: string | null, policy?: IssuerPolicy): VerificationVerdict {
  if (!evidence) return { kind: "pending", title: "NOT YET VERIFIED", detail: "Fetch the transaction to check the receipt against its on-chain proof." };
  if (evidence.chainId !== CHAIN_ID) return { kind: "failed", title: "WRONG NETWORK", detail: "The node is not on qorechain-diana. No verification claim can be made." };
  if (!evidence.success) return { kind: "failed", title: "TRANSACTION NOT SUCCESSFUL", detail: evidence.code === 0 ? "The transaction has not been committed at a positive block height." : `The node reports transaction code ${evidence.code ?? "unknown"}, not 0.` };
  if (!evidence.anchoredHash) return { kind: "incomplete", title: "NO CHIT ANCHOR", detail: "This transaction has no supported CHIT:v1 hash in its memo. A hash in receipt JSON is not on-chain evidence." };
  if (!computedHash) return { kind: "pending", title: "COMPUTING HASH", detail: "Recomputing the normalized receipt. The previous verification result is not reused." };
  if (evidence.anchoredHash !== computedHash) return { kind: "tampered", title: "HASH MISMATCH — TAMPER DETECTED", detail: "These receipt fields do not match the hash in the transaction. Reset the fields to compare the original." };
  if (!evidence.hybridVerified) return { kind: "incomplete", title: "HYBRID PROOF INCOMPLETE", detail: "The hashes match, but a supported ML-DSA-87 extension, secp256k1 signature, and successful pqc_hybrid_verify event are all required." };
  if (policy !== undefined) {
    let clean: IssuerPolicy;
    try { clean = normalizeIssuerPolicy(policy); } catch {
      return { kind: "unauthorized", title: "ISSUER NOT AUTHORIZED", detail: "The local issuer policy is invalid. Permissioned verification fails closed." };
    }
    if (clean.enabled) {
      let signer: string | null = null;
      try { signer = normalizeIssuerAddress(evidence.signerAddress); } catch { /* Missing/unsupported signer remains unauthorized. */ }
      if (!signer || !clean.addresses.includes(signer)) {
        return { kind: "unauthorized", title: "ISSUER NOT AUTHORIZED", detail: signer
          ? "The hybrid-signed receipt matches, but its on-chain MsgSend sender is not in this browser's enabled issuer allowlist. This is local policy, not proof of a clinic's identity."
          : "The hybrid-signed receipt matches, but no unique supported MsgSend sender was established from the on-chain transaction. Permissioned verification fails closed." };
      }
    }
  }
  return { kind: "verified", title: "VERIFIED", detail: "The receipt matches a successful, hybrid-signed hash anchor on QoreChain Diana." };
}

async function readJSON(url: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { signal, headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit" }); } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Could not reach QoreChain. Check your connection and the REST /lcd proxy (or production CORS configuration), then retry verification—not issuance.");
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error("Transaction not found or not indexed yet. Wait for a block and retry verification. Do not send another transaction.");
    if (response.status === 429) throw new Error("The testnet API is rate-limiting requests. Retry verification shortly.");
    throw new Error(`QoreChain REST returned HTTP ${response.status}. No verification result is assumed.`);
  }
  try { return await response.json(); } catch { throw new Error("QoreChain returned unreadable JSON. Verification is incomplete."); }
}

export async function fetchChainEvidence(txHashInput: string, signal?: AbortSignal): Promise<ChainEvidence> {
  const txHash = normalizeTxHash(txHashInput);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), 25_000);
  const base = REST_BASE.replace(/\/$/, "");
  const txUrl = `${base}/cosmos/tx/v1beta1/txs/${txHash}`;
  try {
    // The default /lcd proxy forwards these public chain paths. Preserve the
    // actual requested URL, rather than attributing a configurable node to REST_URL.
    const [tx, node] = await Promise.all([
      readJSON(txUrl, controller.signal),
      readJSON(`${base}/cosmos/base/tendermint/v1beta1/node_info`, controller.signal),
    ]);
    const nodeInfo = object(object(node).default_node_info);
    const chainId = str(nodeInfo.network);
    if (chainId !== CHAIN_ID) throw new Error("The REST node is not qorechain-diana. Its response was rejected.");
    return inspectTransaction(tx, txHash, chainId, txUrl);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("The testnet verification request timed out. Retry this transaction hash; do not rebroadcast.");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
