import { webcrypto } from "node:crypto";
import { HYBRID_SIG_TYPE_URL, qorechainTypes } from "@qorechain/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAIN_ID, REST_BASE, REST_URL } from "../src/lib/network.js";
import { DEMO_ISSUERS, type IssuerPolicy } from "../src/lib/issuers.js";
import { hashReceipt, type ReceiptFields } from "../src/lib/receipt.js";
import {
  decodeBase64,
  fetchChainEvidence,
  inspectTransaction,
  verificationVerdict,
  type ChainEvidence,
} from "../src/lib/verify.js";

/*
 * CLEARLY SYNTHETIC, TEST-ONLY LCD FIXTURES.
 * Signatures and public-key bytes below are fabricated shape fixtures. They are
 * NOT asserted to be cryptographically valid, and no real transaction occurred.
 * These tests exercise the REST-evidence classifier's trust in node code/events,
 * not local signature verification, transaction inclusion, or RPC authenticity.
 * The SDK's actual exported PQCHybridSignature codec is intentionally not mocked.
 */
const codec = qorechainTypes.pqcHybrid.PQCHybridSignature;
const TEST_HASH = "ab".repeat(32);
const TEST_TX_HASH = "CD".repeat(32);
const OTHER_TX_HASH = "EF".repeat(32);
const SEND_TYPE = "/cosmos.bank.v1beta1.MsgSend";
// Deterministic synthetic addresses, not actual clinics or cryptographic fixtures.
const TEST_SIGNER = DEMO_ISSUERS[1].address;
const OTHER_SIGNER = DEMO_ISSUERS[2].address;
const PERMISSIONED_POLICY: IssuerPolicy = { version: 1, enabled: true, addresses: [TEST_SIGNER] };
const SECP_TYPE = "/cosmos.crypto.secp256k1.PubKey";
const ETHSECP_TYPE = "/ethermint.crypto.v1.ethsecp256k1.PubKey";
const NODE_PATH = "/cosmos/base/tendermint/v1beta1/node_info";
const TX_PATH = `/cosmos/tx/v1beta1/txs/${TEST_TX_HASH}`;
const TEST_RECEIPT: ReceiptFields = {
  receiptCode: "CHT-4821", scanCategory: "Chest X-Ray", visitDate: "2024-02-29", facilityTag: "CLINIC-A", note: "",
};
type JsonObject = Record<string, unknown>;
type Encoding = "expanded-snake" | "expanded-camel" | "any-base64" | "any-uint8" | "any-array";

interface SyntheticLCD {
  tx: {
    body: {
      memo: unknown;
      messages: unknown[];
      extension_options: unknown[];
      non_critical_extension_options: unknown[];
    };
    auth_info: { signer_infos: Array<{ public_key: JsonObject }> };
    signatures: unknown[];
  };
  tx_response: {
    txhash: unknown;
    code: unknown;
    height: unknown;
    timestamp: string;
    events: unknown[];
    logs?: unknown[];
  };
}

function syntheticBytes(length: number, seed = 17): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (seed + index * 29) % 256);
}

function base64(bytes: Uint8Array): string {
  return globalThis.btoa(String.fromCharCode(...bytes));
}

function textBase64(text: string): string {
  return base64(new TextEncoder().encode(text));
}

const TEST_COMPRESSED_KEY = Uint8Array.from([2, ...syntheticBytes(32)]);

function syntheticExtension(encoding: Encoding = "expanded-snake", algorithmId = 1, signatureBytes = 4627): JsonObject {
  const model = codec.create({ algorithmId, pqcSignature: syntheticBytes(signatureBytes), pqcPublicKey: new Uint8Array() });
  if (encoding === "expanded-snake") {
    return { "@type": HYBRID_SIG_TYPE_URL, algorithm_id: model.algorithmId, pqc_signature: base64(model.pqcSignature) };
  }
  if (encoding === "expanded-camel") {
    return { "@type": HYBRID_SIG_TYPE_URL, ...(codec.toJSON(model) as JsonObject) };
  }
  const encoded = codec.encode(model).finish();
  if (encoding === "any-base64") return { type_url: HYBRID_SIG_TYPE_URL, value: base64(encoded) };
  if (encoding === "any-array") return { type_url: HYBRID_SIG_TYPE_URL, value: Array.from(encoded) };
  return { typeUrl: HYBRID_SIG_TYPE_URL, value: encoded };
}

function syntheticEvent(status: unknown = "verified", algorithm: unknown = "dilithium5"): JsonObject {
  // Documented Diana success shape; missing/duplicate attributes are explicit negative fixtures below.
  return {
    type: "pqc_hybrid_verify",
    attributes: [{ key: "status", value: status }, { key: "algorithm_id", value: algorithm }],
  };
}

function syntheticLCD(hash = TEST_HASH, encoding: Encoding = "expanded-snake"): SyntheticLCD {
  return {
    tx: {
      body: {
        memo: `CHIT:v1:${hash}`,
        messages: [{ "@type": SEND_TYPE, from_address: TEST_SIGNER, to_address: TEST_SIGNER, amount: [{ denom: "uqor", amount: "1" }] }],
        extension_options: [syntheticExtension(encoding)],
        non_critical_extension_options: [],
      },
      auth_info: { signer_infos: [{ public_key: { "@type": SECP_TYPE, key: base64(TEST_COMPRESSED_KEY) } }] },
      signatures: [base64(syntheticBytes(64, 23))],
    },
    tx_response: {
      txhash: TEST_TX_HASH, code: 0, height: "12345", timestamp: "2024-02-29T12:00:00Z",
      events: [syntheticEvent()],
    },
  };
}

function expectIncompleteHybrid(payload: unknown): ChainEvidence {
  const evidence = inspectTransaction(payload, TEST_TX_HASH);
  expect(evidence.hybridVerified).toBe(false);
  expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("incomplete");
  // An allowlisted MsgSend signer must never rescue any existing hybrid gate.
  expect(verificationVerdict(evidence, TEST_HASH, PERMISSIONED_POLICY).kind).toBe("incomplete");
  return evidence;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function mockLCD(payload: unknown = syntheticLCD(), network: string = CHAIN_ID) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith(NODE_PATH)) return jsonResponse({ default_node_info: { network } });
    if (url.endsWith(TX_PATH)) return jsonResponse(payload);
    throw new Error(`Unexpected URL in synthetic-only test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockAbortableFetch() {
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) throw new Error("Synthetic fetch requires an AbortSignal");
    const rejectAbort = () => reject(new DOMException("SYNTHETIC test fetch aborted", "AbortError"));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener("abort", rejectAbort, { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  // Even an accidental fetch is blocked; individual REST tests install explicit mocks.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed: install a synthetic LCD mock"); }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("synthetic LCD classifier: supported hybrid evidence", () => {
  it("uses the real SDK export and protobuf codec, not JSON bytes masquerading as Any", () => {
    expect(HYBRID_SIG_TYPE_URL).toBe("/qorechain.pqc.v1.PQCHybridSignature");
    const model = codec.create({ algorithmId: 1, pqcSignature: syntheticBytes(4627) });
    const encoded = codec.encode(model).finish();
    expect(encoded[0]).toBe(0x08);
    expect(codec.decode(encoded)).toEqual(model);
    expect(codec.decode(encoded).pqcSignature).toHaveLength(4627);
  });

  it.each<Encoding>(["expanded-snake", "expanded-camel", "any-base64", "any-uint8", "any-array"])(
    "classifies supported TEST-ONLY %s extension plus trusted synthetic success event", (encoding) => {
      const evidence = inspectTransaction(syntheticLCD(TEST_HASH, encoding), TEST_TX_HASH);
      expect(evidence).toMatchObject({
        txHash: TEST_TX_HASH, chainId: CHAIN_ID, success: true, code: 0, height: "12345", anchoredHash: TEST_HASH,
        memo: `CHIT:v1:${TEST_HASH}`, signerAddress: TEST_SIGNER,
        classicalSignatureBytes: 64, classicalSignatureValid: true,
        pqcEventStatus: "verified", pqcEventVerified: true, hybridVerified: true,
      });
      expect(evidence.extension).toEqual({
        present: true, typeUrl: HYBRID_SIG_TYPE_URL, placement: "critical", algorithmId: 1, signatureBytes: 4627, validShape: true,
      });
      expect(evidence.sourceUrl).toBe(`${REST_URL}${TX_PATH}`);
      expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("verified");
    },
  );

  it("gets identical shape evidence from expanded JSON and SDK-encoded raw protobuf Any", () => {
    const typed = inspectTransaction(syntheticLCD(TEST_HASH, "expanded-snake"), TEST_TX_HASH);
    const raw = inspectTransaction(syntheticLCD(TEST_HASH, "any-base64"), TEST_TX_HASH);
    expect(raw).toEqual(typed);
  });

  it.each([[SECP_TYPE, 64], [ETHSECP_TYPE, 65]] as const)(
    "supports TEST-ONLY %s with a %i-byte classical signature", (typeUrl, size) => {
      const payload = syntheticLCD();
      payload.tx.auth_info.signer_infos[0].public_key["@type"] = typeUrl;
      payload.tx.signatures = [base64(syntheticBytes(size))];
      const evidence = inspectTransaction(payload, TEST_TX_HASH);
      expect(evidence.classicalSignatureBytes).toBe(size);
      expect(evidence.classicalSignatureValid).toBe(true);
      expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("verified");
    },
  );

  it("accepts the LCD camelCase body/auth/public-key aliases", () => {
    const payload = syntheticLCD(TEST_HASH, "expanded-camel");
    const camel = {
      ...payload,
      tx: {
        body: { memo: payload.tx.body.memo, messages: payload.tx.body.messages, extensionOptions: payload.tx.body.extension_options, nonCriticalExtensionOptions: [] },
        authInfo: { signerInfos: [{ publicKey: { typeUrl: SECP_TYPE, key: base64(TEST_COMPRESSED_KEY) } }] },
        signatures: payload.tx.signatures,
      },
    };
    expect(verificationVerdict(inspectTransaction(camel, TEST_TX_HASH), TEST_HASH).kind).toBe("verified");
  });

  it("can inspect a tx nested within tx_response", () => {
    const payload = syntheticLCD();
    const nested = { tx_response: { ...payload.tx_response, tx: payload.tx } };
    expect(verificationVerdict(inspectTransaction(nested, TEST_TX_HASH), TEST_HASH).kind).toBe("verified");
  });
});

describe("hybrid extension fail-closed guards", () => {
  it("rejects missing or non-array critical extension data", () => {
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [];
    expect(expectIncompleteHybrid(payload).extension.present).toBe(false);
    const malformed = { ...payload, tx: { ...payload.tx, body: { ...payload.tx.body, extension_options: syntheticExtension() } } };
    expect(expectIncompleteHybrid(malformed).extension.validShape).toBe(false);
  });

  it.each(["/qorechain.pqc.v2.PQCHybridSignature", "/test.other.Signature"])("rejects unsupported extension type %s", (typeUrl) => {
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [{ ...syntheticExtension(), "@type": typeUrl }];
    expectIncompleteHybrid(payload);
  });

  it.each([undefined, null, true, 0, 2, -1, 1.5, "not-an-algorithm"])("rejects missing/malformed/unsupported algorithm %j", (algorithm) => {
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [{ ...syntheticExtension(), algorithm_id: algorithm }];
    expect(expectIncompleteHybrid(payload).extension.validShape).toBe(false);
  });

  it.each([0, 1, 4626, 4628])("rejects a typed PQC signature of %i bytes", (size) => {
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [syntheticExtension("expanded-snake", 1, size)];
    expect(expectIncompleteHybrid(payload).extension.signatureBytes).toBe(size);
  });

  it.each(["any-base64", "any-uint8", "any-array"] as const)("also rejects wrong algorithm/length in raw %s", (encoding) => {
    for (const [algorithm, size] of [[0, 4627], [2, 4627], [1, 4626], [1, 4628]]) {
      const payload = syntheticLCD();
      payload.tx.body.extension_options = [syntheticExtension(encoding, algorithm, size)];
      expectIncompleteHybrid(payload);
    }
  });

  it.each([
    ["missing", undefined], ["null", null], ["invalid base64", "%%%invalid"],
    ["out-of-range byte", [256]], ["negative byte", [-1]], ["fractional byte", [1.5]],
    ["string byte", ["1"]], ["oversized base64", "A".repeat(30_001)],
  ])(
    "rejects missing/malformed typed PQC signature encoding: %s", (_label, signature) => {
      const payload = syntheticLCD();
      payload.tx.body.extension_options = [{ ...syntheticExtension(), pqc_signature: signature }];
      expectIncompleteHybrid(payload);
    },
  );

  it("rejects malformed base64, truncated protobuf, empty protobuf, and JSON-as-Any bytes", () => {
    const malformed = [
      "%%%invalid", base64(Uint8Array.of(8, 1, 18, 0x93, 0x24, 17)),
      "", base64(new TextEncoder().encode(JSON.stringify({ algorithm_id: 1, pqc_signature: "TEST ONLY" }))),
    ];
    for (const value of malformed) {
      const payload = syntheticLCD();
      payload.tx.body.extension_options = [{ type_url: HYBRID_SIG_TYPE_URL, value }];
      expectIncompleteHybrid(payload);
    }
  });

  it("does not let valid-looking expanded fields rescue an invalid raw Any value", () => {
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [{ ...syntheticExtension(), value: "%%%invalid" }];
    expectIncompleteHybrid(payload);
  });

  it("rejects a supported extension placed only in non-critical options", () => {
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [];
    payload.tx.body.non_critical_extension_options = [syntheticExtension()];
    expect(expectIncompleteHybrid(payload).extension.placement).toBe("non-critical");
  });

  it.each(["critical", "mixed"] as const)("rejects duplicate supported extensions (%s)", (placement) => {
    const payload = syntheticLCD();
    if (placement === "critical") payload.tx.body.extension_options.push(syntheticExtension("any-base64"));
    else payload.tx.body.non_critical_extension_options.push(syntheticExtension());
    expectIncompleteHybrid(payload);
  });
});

describe("classical signature/public-key shape guards", () => {
  it.each([0, 1, 63, 66])("rejects a %i-byte classical signature", (size) => {
    const payload = syntheticLCD();
    payload.tx.signatures = [base64(syntheticBytes(size))];
    expect(expectIncompleteHybrid(payload).classicalSignatureValid).toBe(false);
  });

  it("rejects missing, malformed, or multiple classical signatures", () => {
    for (const signatures of [[], ["%%%invalid"], [base64(syntheticBytes(64)), base64(syntheticBytes(64))]]) {
      const payload = syntheticLCD();
      payload.tx.signatures = signatures;
      expectIncompleteHybrid(payload);
    }
  });

  it("requires exactly one signer and a supported secp256k1 type", () => {
    const payload = syntheticLCD();
    payload.tx.auth_info.signer_infos = [];
    expectIncompleteHybrid(payload);
    const duplicate = syntheticLCD();
    duplicate.tx.auth_info.signer_infos.push({ public_key: { "@type": SECP_TYPE, key: base64(TEST_COMPRESSED_KEY) } });
    expectIncompleteHybrid(duplicate);
    for (const public_key of [{}, { "@type": "/cosmos.crypto.ed25519.PubKey", key: base64(TEST_COMPRESSED_KEY) }]) {
      const unsupported = syntheticLCD();
      unsupported.tx.auth_info.signer_infos[0].public_key = public_key;
      expectIncompleteHybrid(unsupported);
    }
  });

  it.each([undefined, null, "", "%%%invalid", base64(syntheticBytes(32)), base64(syntheticBytes(34)), base64(Uint8Array.from([4, ...syntheticBytes(32)]))])(
    "a public-key type URL without a valid compressed 33-byte key is not proof (%j)", (key) => {
      const payload = syntheticLCD();
      payload.tx.auth_info.signer_infos[0].public_key.key = key;
      expect(expectIncompleteHybrid(payload).classicalSignatureValid).toBe(false);
    },
  );
});

describe("pqc_hybrid_verify event guards", () => {
  it("requires the exact hybrid event type and a status attribute", () => {
    for (const events of [
      [], [{ ...syntheticEvent(), type: "transfer" }],
      [{ type: "pqc_hybrid_verify", attributes: [] }],
      [{ type: "pqc_hybrid_verify", attributes: [{ key: "algorithm_id", value: "dilithium5" }] }],
    ]) {
      const payload = syntheticLCD();
      payload.tx_response.events = events;
      expect(expectIncompleteHybrid(payload).pqcEventStatus).toBe("missing");
    }
  });

  it.each(["failed", "false", "invalid", "rejected", "pending", "quantum-approved", "unknown-status", true, null])(
    "does not trust failing/unrecognized status %j", (status) => {
      const payload = syntheticLCD();
      payload.tx_response.events = [syntheticEvent(status)];
      expect(expectIncompleteHybrid(payload).pqcEventVerified).toBe(false);
    },
  );

  it("recognizes only documented status verified with the documented dilithium5 algorithm", () => {
    const payload = syntheticLCD();
    expect(payload.tx_response.events).toEqual([{
      type: "pqc_hybrid_verify",
      attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "dilithium5" }],
    }]);
    expect(verificationVerdict(inspectTransaction(payload, TEST_TX_HASH), TEST_HASH).kind).toBe("verified");
  });

  it.each(["success", "valid", "passed", "true"])("rejects undocumented success alias %s, plain or base64", (status) => {
    for (const encoded of [false, true]) {
      const payload = syntheticLCD();
      payload.tx_response.events = encoded ? [{
        type: "pqc_hybrid_verify", attributes: [
          { key: textBase64("status"), value: textBase64(status) },
          { key: textBase64("algorithm_id"), value: textBase64("dilithium5") },
        ],
      }] : [syntheticEvent(status)];
      expect(expectIncompleteHybrid(payload).pqcEventStatus).toBe(status);
    }
  });

  it.each(["1", "dilithium5", "ml-dsa-87", "mldsa87"])("accepts one recognized event algorithm %s", (algorithm) => {
    const payload = syntheticLCD();
    payload.tx_response.events = [syntheticEvent("verified", algorithm)];
    expect(inspectTransaction(payload, TEST_TX_HASH).pqcEventVerified).toBe(true);
  });

  it.each(["2", "ml-dsa-44", "unknown", "", null, true, 1, []].map((algorithm) => ({ algorithm })))(
    "rejects contradictory/unrecognized/malformed event algorithm $algorithm", ({ algorithm }) => {
      const payload = syntheticLCD();
      payload.tx_response.events = [syntheticEvent("verified", algorithm)];
      expectIncompleteHybrid(payload);
    },
  );

  it.each([
    { label: "missing algorithm", attributes: [{ key: "status", value: "verified" }] },
    { label: "missing algorithm value", attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: undefined }] },
    { label: "wrong algorithm key", attributes: [{ key: "status", value: "verified" }, { key: "algorithm", value: "dilithium5" }] },
    { label: "duplicate identical algorithms", attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "dilithium5" }, { key: "algorithm_id", value: "dilithium5" }] },
    { label: "duplicate equivalent supported algorithms", attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "1" }, { key: "algorithm_id", value: "ml-dsa-87" }] },
    { label: "conflicting algorithms", attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "1" }, { key: "algorithm_id", value: "2" }] },
    { label: "mixed plain/base64 duplicate algorithms", attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "dilithium5" }, { key: textBase64("algorithm_id"), value: textBase64("dilithium5") }] },
  ])("requires exactly one recognized algorithm attribute: $label", ({ attributes }) => {
    const payload = syntheticLCD();
    payload.tx_response.events = [{ type: "pqc_hybrid_verify", attributes }];
    expect(expectIncompleteHybrid(payload).pqcEventStatus).toBe("verified");
  });

  it.each([["verified", "failed"], ["verified", "verified"]])(
    "rejects duplicate/conflicting status attributes %s/%s even with a valid algorithm", (first, second) => {
      const payload = syntheticLCD();
      payload.tx_response.events = [{ type: "pqc_hybrid_verify", attributes: [
        { key: "status", value: first }, { key: "status", value: second },
        { key: "algorithm_id", value: "dilithium5" },
      ] }];
      expect(expectIncompleteHybrid(payload).pqcEventStatus).toBe("missing");
    },
  );

  it.each(["failed", "unrecognized", undefined])("rejects conflicting multiple hybrid events, including status %j", (status) => {
    const payload = syntheticLCD();
    const second = status === undefined
      ? { type: "pqc_hybrid_verify", attributes: [{ key: "algorithm_id", value: "dilithium5" }] }
      : syntheticEvent(status);
    payload.tx_response.events = [syntheticEvent("verified"), second];
    expectIncompleteHybrid(payload);
  });

  it("decodes documented base64 event attribute keys and values", () => {
    const payload = syntheticLCD();
    payload.tx_response.events = [{
      type: "pqc_hybrid_verify", attributes: [
        { key: textBase64("status"), value: textBase64("verified") },
        { key: textBase64("algorithm_id"), value: textBase64("dilithium5") },
      ],
    }];
    expect(inspectTransaction(payload, TEST_TX_HASH).pqcEventStatus).toBe("verified");
    expect(verificationVerdict(inspectTransaction(payload, TEST_TX_HASH), TEST_HASH).kind).toBe("verified");
  });

  it("rejects base64-encoded failure even with the documented algorithm", () => {
    const payload = syntheticLCD();
    payload.tx_response.events = [{ type: "pqc_hybrid_verify", attributes: [
      { key: textBase64("status"), value: textBase64("failed") },
      { key: textBase64("algorithm_id"), value: textBase64("dilithium5") },
    ] }];
    expect(expectIncompleteHybrid(payload).pqcEventStatus).toBe("failed");
  });

  it("accepts logs-only hybrid evidence even when unrelated direct events exist", () => {
    for (const events of [[], [{ type: "transfer", attributes: [] }]]) {
      const payload = syntheticLCD();
      payload.tx_response.events = events;
      payload.tx_response.logs = [{ events: [syntheticEvent()] }];
      expect(verificationVerdict(inspectTransaction(payload, TEST_TX_HASH), TEST_HASH).kind).toBe("verified");
    }
  });

  it.each([["verified", "failed"], ["failed", "verified"], ["verified", "unknown"], ["verified", "success"]])(
    "reconciles direct=%s with logs=%s and fails closed on disagreement", (direct, logged) => {
      const payload = syntheticLCD();
      payload.tx_response.events = [syntheticEvent(direct)];
      payload.tx_response.logs = [{ events: [syntheticEvent(logged)] }];
      expectIncompleteHybrid(payload);
    },
  );

  it("requires each logged verified event to carry exactly one supported algorithm, independently of valid direct evidence", () => {
    for (const attributes of [
      [{ key: "status", value: "verified" }],
      [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "2" }],
      [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "dilithium5" }, { key: "algorithm_id", value: "dilithium5" }],
    ]) {
      const payload = syntheticLCD();
      payload.tx_response.logs = [{ events: [{ type: "pqc_hybrid_verify", attributes }] }];
      expect(expectIncompleteHybrid(payload).pqcEventStatus).toBe("verified");
    }
  });

  it("accepts duplicate agreeing direct/log events when each has exactly one algorithm and one verified status", () => {
    const payload = syntheticLCD();
    payload.tx_response.logs = [{ events: [syntheticEvent()] }];
    expect(inspectTransaction(payload, TEST_TX_HASH).pqcEventStatus).toBe("verified");
    expect(verificationVerdict(inspectTransaction(payload, TEST_TX_HASH), TEST_HASH).kind).toBe("verified");
  });
});

describe("on-chain memo, transaction identity, and verdict state", () => {
  it("normalizes hash case only inside an otherwise exact CHIT:v1 memo", () => {
    const evidence = inspectTransaction(syntheticLCD(TEST_HASH.toUpperCase()), TEST_TX_HASH);
    expect(evidence.anchoredHash).toBe(TEST_HASH);
    expect(evidence.memo).toBe(`CHIT:v1:${TEST_HASH.toUpperCase()}`);
  });

  it.each([
    "", null, undefined, `other:${TEST_HASH}`, `chit:v1:${TEST_HASH}`, `CHIT:v2:${TEST_HASH}`,
    ` CHIT:v1:${TEST_HASH}`, `CHIT:v1:${TEST_HASH} `, `CHIT:v1:${TEST_HASH}\n`,
    `CHIT:v1:${TEST_HASH}\r`, `CHIT:v1:${TEST_HASH}\r\n`, `CHIT:v1:${TEST_HASH}:extra`,
    `CHIT:v1:${"a".repeat(63)}`, `CHIT:v1:${"g".repeat(64)}`,
  ])("does not trust an unrelated/non-exact/malformed memo %j", (memo) => {
    const payload = syntheticLCD();
    payload.tx.body.memo = memo;
    const declaredHashPayload = { ...payload, receiptHash: TEST_HASH, tx_response: { ...payload.tx_response, receiptHash: TEST_HASH } };
    const evidence = inspectTransaction(declaredHashPayload, TEST_TX_HASH);
    expect(evidence.memo).toBe(typeof memo === "string" ? memo : "");
    expect(evidence.anchoredHash).toBeNull();
    expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("incomplete");
  });

  it.each([1, 7, -1, "0", null, undefined, 0.5])("never verifies unsuccessful/unknown transaction code %j", (code) => {
    const payload = syntheticLCD();
    payload.tx_response.code = code;
    const evidence = inspectTransaction(payload, TEST_TX_HASH);
    expect(evidence.success).toBe(false);
    expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("failed");
  });

  it.each(["0", "-1", "", "not-height", "1.5", 12345, null])("requires committed positive string height, not %j", (height) => {
    const payload = syntheticLCD();
    payload.tx_response.height = height;
    const evidence = inspectTransaction(payload, TEST_TX_HASH);
    expect(evidence.success).toBe(false);
    expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("failed");
  });

  it("rejects a wrong network even when every synthetic proof field matches", () => {
    const evidence = inspectTransaction(syntheticLCD(), TEST_TX_HASH, "qorechain-vladi");
    expect(verificationVerdict(evidence, TEST_HASH)).toMatchObject({ kind: "failed", title: "WRONG NETWORK" });
  });

  it("requires the returned tx hash to match the requested transaction", () => {
    const payload = syntheticLCD();
    payload.tx_response.txhash = OTHER_TX_HASH;
    expect(() => inspectTransaction(payload, TEST_TX_HASH)).toThrow(/different transaction/i);
    for (const txhash of [undefined, null, "bad-hash", "f".repeat(63)]) {
      payload.tx_response.txhash = txhash;
      expect(() => inspectTransaction(payload, TEST_TX_HASH)).toThrow(/valid transaction hash/i);
    }
  });

  it("normalizes equivalent requested/returned hash case and 0x prefixes", () => {
    const payload = syntheticLCD();
    payload.tx_response.txhash = `0x${TEST_TX_HASH.toLowerCase()}`;
    expect(inspectTransaction(payload, ` ${TEST_TX_HASH.toLowerCase()} `).txHash).toBe(TEST_TX_HASH);
  });

  it.each([null, {}, { tx_response: null }, { tx_response: [] }])("rejects missing REST transaction result %j", (payload) => {
    expect(() => inspectTransaction(payload, TEST_TX_HASH)).toThrow(/transaction result/i);
  });

  it("never reuses a previous verified verdict while the receipt hash is null", () => {
    const evidence = inspectTransaction(syntheticLCD(), TEST_TX_HASH);
    expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("verified");
    expect(verificationVerdict(evidence, null)).toMatchObject({ kind: "pending", title: "COMPUTING HASH" });
    expect(verificationVerdict(null, TEST_HASH).kind).toBe("pending");
    expect(verificationVerdict(null, null).kind).toBe("pending");
  });

  it("moves verified -> tampered -> computing -> reset verified using genuine receipt hashes", async () => {
    const originalHash = await hashReceipt(TEST_RECEIPT);
    const evidence = inspectTransaction(syntheticLCD(originalHash), TEST_TX_HASH);
    expect(verificationVerdict(evidence, originalHash).kind).toBe("verified");
    for (const [field, value] of [
      ["facilityTag", "CLINIC-B"], ["note", "Visit completed"], ["receiptCode", "CHT-4822"],
      ["scanCategory", "Ultrasound"], ["visitDate", "2024-03-01"],
    ]) {
      const editedHash = await hashReceipt({ ...TEST_RECEIPT, [field]: value });
      expect(verificationVerdict(evidence, editedHash).kind).toBe("tampered");
      expect(verificationVerdict(evidence, null).kind).toBe("pending");
      expect(verificationVerdict(evidence, await hashReceipt(TEST_RECEIPT)).kind).toBe("verified");
    }
  });
});

describe("on-chain issuer evidence and optional permissioned verdicts", () => {
  it("exposes the exact body memo and unique SDK-validated MsgSend sender", () => {
    const evidence = inspectTransaction(syntheticLCD(), TEST_TX_HASH);
    expect(evidence.memo).toBe(`CHIT:v1:${TEST_HASH}`);
    expect(evidence.signerAddress).toBe(TEST_SIGNER);
    expect(verificationVerdict(evidence, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "verified", title: "VERIFIED" });
  });

  it.each(["@type", "type_url", "typeUrl"])("accepts an unambiguous expanded MsgSend type alias %s", (key) => {
    const payload = syntheticLCD();
    payload.tx.body.messages = [{ [key]: SEND_TYPE, from_address: TEST_SIGNER, to_address: TEST_SIGNER }];
    expect(inspectTransaction(payload, TEST_TX_HASH).signerAddress).toBe(TEST_SIGNER);
  });

  it("does not replace the raw memo/issuer with pasted receipt or response metadata", () => {
    const payload = syntheticLCD();
    payload.tx.body.memo = "NOT A CHIT MEMO";
    const contaminated = { ...payload, memo: `CHIT:v1:${TEST_HASH}`, receiptHash: TEST_HASH, signerAddress: OTHER_SIGNER,
      tx_response: { ...payload.tx_response, memo: `CHIT:v1:${TEST_HASH}`, signerAddress: OTHER_SIGNER } };
    const evidence = inspectTransaction(contaminated, TEST_TX_HASH);
    expect(evidence.memo).toBe("NOT A CHIT MEMO");
    expect(evidence.anchoredHash).toBeNull();
    expect(evidence.signerAddress).toBe(TEST_SIGNER);
    expect(verificationVerdict(evidence, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "incomplete", title: "NO CHIT ANCHOR" });
  });

  it("does not authorize a recipient, fee payer, event signer, or pasted issuer instead of the actual sender", () => {
    const payload = syntheticLCD();
    payload.tx.body.messages = [{ "@type": SEND_TYPE, from_address: OTHER_SIGNER, to_address: TEST_SIGNER }];
    const contaminated = {
      ...payload, issuer: TEST_SIGNER, signerAddress: TEST_SIGNER,
      tx: { ...payload.tx, auth_info: { ...payload.tx.auth_info, fee: { payer: TEST_SIGNER, granter: TEST_SIGNER } } },
      tx_response: { ...payload.tx_response, signerAddress: TEST_SIGNER,
        events: [...payload.tx_response.events, { type: "message", attributes: [{ key: "sender", value: TEST_SIGNER }] }] },
    };
    const evidence = inspectTransaction(contaminated, TEST_TX_HASH);
    expect(evidence.signerAddress).toBe(OTHER_SIGNER);
    expect(verificationVerdict(evidence, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "unauthorized", title: "ISSUER NOT AUTHORIZED" });
  });

  it("authorizes only the sender, independently of a different recipient or fee payer", () => {
    const payload = syntheticLCD();
    payload.tx.body.messages = [{ "@type": SEND_TYPE, from_address: TEST_SIGNER, to_address: OTHER_SIGNER }];
    const evidence = inspectTransaction({ ...payload, tx: { ...payload.tx, auth_info: { ...payload.tx.auth_info, fee: { payer: OTHER_SIGNER } } } }, TEST_TX_HASH);
    expect(evidence.signerAddress).toBe(TEST_SIGNER);
    expect(verificationVerdict(evidence, TEST_HASH, PERMISSIONED_POLICY).kind).toBe("verified");
  });

  it("denies unlisted/missing signers and an enabled empty allowlist, but preserves explicit permissionless behavior", () => {
    const evidence = inspectTransaction(syntheticLCD(), TEST_TX_HASH);
    expect(verificationVerdict(evidence, TEST_HASH, { version: 1, enabled: true, addresses: [OTHER_SIGNER] })).toMatchObject({ kind: "unauthorized", title: "ISSUER NOT AUTHORIZED" });
    expect(verificationVerdict(evidence, TEST_HASH, { version: 1, enabled: true, addresses: [] }).kind).toBe("unauthorized");
    expect(verificationVerdict({ ...evidence, signerAddress: null }, TEST_HASH, PERMISSIONED_POLICY).kind).toBe("unauthorized");
    expect(verificationVerdict({ ...evidence, signerAddress: "bad" }, TEST_HASH, PERMISSIONED_POLICY).kind).toBe("unauthorized");
    expect(verificationVerdict({ ...evidence, signerAddress: null }, TEST_HASH).kind).toBe("verified");
    expect(verificationVerdict({ ...evidence, signerAddress: null }, TEST_HASH, { version: 1, enabled: false, addresses: [] }).kind).toBe("verified");
  });

  const unsupportedMessages: Array<[string, unknown]> = [
    ["missing messages", undefined], ["non-array messages", { "@type": SEND_TYPE, from_address: TEST_SIGNER }],
    ["empty messages", []], ["non-object message", [null]],
    ["unsupported message", [{ "@type": "/cosmos.bank.v1beta1.MsgMultiSend", from_address: TEST_SIGNER }]],
    ["missing sender", [{ "@type": SEND_TYPE, to_address: TEST_SIGNER }]],
    ["null sender", [{ "@type": SEND_TYPE, from_address: null }]],
    ["bad sender", [{ "@type": SEND_TYPE, from_address: "qor1invalid" }]],
    ["uppercase sender", [{ "@type": SEND_TYPE, from_address: TEST_SIGNER.toUpperCase() }]],
    ["hex sender", [{ "@type": SEND_TYPE, from_address: `0x${"11".repeat(20)}` }]],
    ["camel-only sender", [{ "@type": SEND_TYPE, fromAddress: TEST_SIGNER }]],
    ["unexpanded Any", [{ type_url: SEND_TYPE, value: "TEST ONLY" }]],
    ["contradictory type aliases", [{ "@type": SEND_TYPE, typeUrl: "/cosmos.authz.v1beta1.MsgExec", from_address: TEST_SIGNER }]],
    ["multiple same-sender sends", [{ "@type": SEND_TYPE, from_address: TEST_SIGNER }, { "@type": SEND_TYPE, from_address: TEST_SIGNER }]],
    ["send plus unsupported message", [{ "@type": SEND_TYPE, from_address: TEST_SIGNER }, { "@type": "/cosmos.authz.v1beta1.MsgExec" }]],
  ];

  it.each(unsupportedMessages)("fails closed on %s in permissioned mode without weakening old crypto gates", (_label, messages) => {
    const payload = syntheticLCD();
    const evidence = inspectTransaction({ ...payload, signerAddress: TEST_SIGNER, tx: { ...payload.tx, body: { ...payload.tx.body, messages } } }, TEST_TX_HASH);
    expect(evidence.signerAddress).toBeNull();
    expect(evidence.hybridVerified).toBe(true); // synthetic node-classification shape, not real cryptography
    expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("verified");
    expect(verificationVerdict(evidence, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "unauthorized", title: "ISSUER NOT AUTHORIZED" });
  });

  it("cannot let a matching issuer override network, transaction, anchor, pending, or hash failures", () => {
    const evidence = inspectTransaction(syntheticLCD(), TEST_TX_HASH);
    expect(verificationVerdict({ ...evidence, chainId: "qorechain-vladi" }, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "failed", title: "WRONG NETWORK" });
    expect(verificationVerdict({ ...evidence, success: false, code: 7 }, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "failed", title: "TRANSACTION NOT SUCCESSFUL" });
    expect(verificationVerdict({ ...evidence, anchoredHash: null }, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "incomplete", title: "NO CHIT ANCHOR" });
    expect(verificationVerdict({ ...evidence, hybridVerified: false }, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "incomplete", title: "HYBRID PROOF INCOMPLETE" });
    expect(verificationVerdict({ ...evidence, hybridVerified: false, signerAddress: OTHER_SIGNER }, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "incomplete", title: "HYBRID PROOF INCOMPLETE" });
    expect(verificationVerdict(evidence, null, PERMISSIONED_POLICY)).toMatchObject({ kind: "pending", title: "COMPUTING HASH" });
    expect(verificationVerdict(null, TEST_HASH, PERMISSIONED_POLICY)).toMatchObject({ kind: "pending", title: "NOT YET VERIFIED" });
    expect(verificationVerdict(evidence, "12".repeat(32), PERMISSIONED_POLICY)).toMatchObject({ kind: "tampered", title: "HASH MISMATCH — TAMPER DETECTED" });
    expect(verificationVerdict({ ...evidence, signerAddress: OTHER_SIGNER }, "12".repeat(32), PERMISSIONED_POLICY)).toMatchObject({ kind: "tampered", title: "HASH MISMATCH — TAMPER DETECTED" });
  });

  it.each([
    null, {}, { enabled: false }, { version: 1, enabled: "false", addresses: [] },
    { version: 1, enabled: false, addresses: ["bad"] }, { version: 2, enabled: false, addresses: [] },
    { version: 1, enabled: true, addresses: new Array(1) },
    { version: 1, enabled: true, addresses: [TEST_SIGNER, TEST_SIGNER] },
    { version: 1, enabled: true, addresses: [TEST_SIGNER], issuerName: "SYNTHETIC" },
  ].map((value) => ({ value })))("fails closed on malformed runtime policy even if it tries to disable permissioning: $value", ({ value }) => {
    const evidence = inspectTransaction(syntheticLCD(), TEST_TX_HASH);
    expect(verificationVerdict(evidence, TEST_HASH, value as IssuerPolicy)).toMatchObject({ kind: "unauthorized", title: "ISSUER NOT AUTHORIZED" });
    expect(verificationVerdict(evidence, "12".repeat(32), value as IssuerPolicy).kind).toBe("tampered");
  });
});

describe("signature byte decoding", () => {
  it("decodes base64 and supported byte forms without pretending decoding proves validity", () => {
    const bytes = syntheticBytes(64);
    expect(decodeBase64(base64(bytes))).toEqual(bytes);
    expect(decodeBase64(Array.from(bytes))).toEqual(bytes);
    expect(decodeBase64(bytes)).toBe(bytes);
  });

  it.each([null, 1, {}, "A", "AA=A", "AA===", "%%", [-1], [256], [1.5], ["1"]].map((value) => ({ value })))("rejects malformed bytes $value", ({ value }) => {
    expect(() => decodeBase64(value)).toThrow();
  });

  it("bounds untrusted base64 and array sizes", () => {
    expect(() => decodeBase64("A".repeat(30_004))).toThrow();
    expect(() => decodeBase64(Array.from({ length: 20_001 }, () => 1))).toThrow();
  });
});

describe("REST fetch guards (global fetch mocks only; no network)", () => {
  it("fetches the requested tx plus node info and accepts only the expected chain", async () => {
    const fetchMock = mockLCD();
    const evidence = await fetchChainEvidence(`0x${TEST_TX_HASH.toLowerCase()}`);
    expect(verificationVerdict(evidence, TEST_HASH).kind).toBe("verified");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `${REST_BASE}${TX_PATH}`, `${REST_BASE}${NODE_PATH}`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(true); // settled requests are cancelled in finally
    }
  });

  it.each([[404, /not found|not indexed/i], [429, /rate-limiting/i], [500, /HTTP 500/i]] as const)(
    "never assumes verification after HTTP %i", async (status, message) => {
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith(NODE_PATH)
        ? jsonResponse({ default_node_info: { network: CHAIN_ID } }) : jsonResponse({ syntheticError: true }, status)));
      await expect(fetchChainEvidence(TEST_TX_HASH)).rejects.toThrow(message);
    },
  );

  it("rejects unreadable JSON without constructing evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith(NODE_PATH)
      ? jsonResponse({ default_node_info: { network: CHAIN_ID } }) : new Response("{", { status: 200 })));
    await expect(fetchChainEvidence(TEST_TX_HASH)).rejects.toThrow(/unreadable JSON/i);
  });

  it("reports connection failures, with no locally invented fallback evidence", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("SYNTHETIC network failure"); });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchChainEvidence(TEST_TX_HASH)).rejects.toThrow(/could not reach QoreChain/i);
  });

  it.each(["qorechain-vladi", "", "diana"])("rejects wrong/absent node network %j", async (network) => {
    mockLCD(syntheticLCD(), network);
    await expect(fetchChainEvidence(TEST_TX_HASH)).rejects.toThrow(/not qorechain-diana.*rejected/i);
  });

  it("rejects an HTTP-200 tx body whose returned tx hash mismatches the query", async () => {
    const payload = syntheticLCD();
    payload.tx_response.txhash = OTHER_TX_HASH;
    mockLCD(payload);
    await expect(fetchChainEvidence(TEST_TX_HASH)).rejects.toThrow(/different transaction/i);
  });

  it("does not fetch anything for a malformed transaction hash", async () => {
    const fetchMock = mockLCD();
    await expect(fetchChainEvidence("not-a-native-tx-hash")).rejects.toThrow(/transaction hash/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out at 25 seconds, aborts both requests, and never returns evidence", async () => {
    vi.useFakeTimers();
    const fetchMock = mockAbortableFetch();
    const request = fetchChainEvidence(TEST_TX_HASH);
    const rejection = expect(request).rejects.toThrow(/timed out.*do not rebroadcast/i);
    await vi.advanceTimersByTimeAsync(25_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors caller cancellation without mislabeling it as a testnet timeout", async () => {
    const fetchMock = mockAbortableFetch();
    const controller = new AbortController();
    const request = fetchChainEvidence(TEST_TX_HASH, controller.signal);
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError", message: "SYNTHETIC test fetch aborted" });
    controller.abort();
    await rejection;
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it("honors a caller signal that was already aborted", async () => {
    mockAbortableFetch();
    const controller = new AbortController();
    controller.abort();
    await expect(fetchChainEvidence(TEST_TX_HASH, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborts an outstanding sibling request when an HTTP error settles the other request", async () => {
    let nodeSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input).endsWith(TX_PATH)) return Promise.resolve(jsonResponse({}, 404));
      nodeSignal = init?.signal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("SYNTHETIC sibling abort", "AbortError")), { once: true });
      });
    }));
    await expect(fetchChainEvidence(TEST_TX_HASH)).rejects.toThrow(/not found/i);
    expect(nodeSignal?.aborted).toBe(true);
  });
});
