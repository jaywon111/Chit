// Supplied non-identifying receipt fields and public transaction references.
// All LCD signature bytes below are SYNTHETIC TEST-ONLY SHAPE FIXTURES, not
// cryptographic signatures or a substituted live sample response.
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeIssuerAddress } from "../src/lib/issuers.js";
import { CHAIN_ID, REST_BASE } from "../src/lib/network.js";
import { canonicalReceiptJSON, hashReceipt, normalizeReceipt, parseReceiptPayload, type ReceiptFields } from "../src/lib/receipt.js";
import { resolveTestnetSample, SAMPLE_EXPECTED_HASH, SAMPLE_ISSUER, SAMPLE_RECEIPT, SAMPLE_TX_HASH } from "../src/lib/sample.js";
import { createVerificationLink } from "../src/lib/share.js";
import { fetchChainEvidence, verificationVerdict } from "../src/lib/verify.js";

const SUPPLIED_RECEIPT: ReceiptFields = {
  receiptCode: "CHT-4671", scanCategory: "Chest X-Ray", visitDate: "2026-11-25", facilityTag: "CLINIC-A", note: "Follow-up visit",
};
const CANONICAL = '{"facilityTag":"CLINIC-A","note":"Follow-up visit","receiptCode":"CHT-4671","scanCategory":"Chest X-Ray","visitDate":"2026-11-25"}';
const FIELD_EDITS: Array<[keyof ReceiptFields, string]> = [
  ["receiptCode", "CHT-4672"], ["scanCategory", "Ultrasound"], ["visitDate", "2026-11-26"],
  ["facilityTag", "CLINIC-B"], ["note", "Baseline Screening"],
];

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Install an explicit test-only LCD fixture; no network/broadcast is allowed in unit tests"); }));
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => { throw new Error("Live sample preparation must not read local storage"); }),
    setItem: vi.fn(() => { throw new Error("Live sample preparation must not write local storage"); }),
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function syntheticLCD() {
  // Deliberately fabricated shape bytes. Tests trust the fixture node's evidence;
  // neither these bytes nor its code/event are used by the actual sample button.
  return {
    tx: {
      body: {
        memo: `CHIT:v1:${SAMPLE_EXPECTED_HASH}`,
        messages: [{ "@type": "/cosmos.bank.v1beta1.MsgSend", from_address: SAMPLE_ISSUER, to_address: SAMPLE_ISSUER }],
        extension_options: [{ "@type": "/qorechain.pqc.v1.PQCHybridSignature", algorithm_id: 1, pqc_signature: btoa("\0".repeat(4627)) }],
        non_critical_extension_options: [],
      },
      auth_info: { signer_infos: [{ public_key: { "@type": "/cosmos.crypto.secp256k1.PubKey", key: btoa("\x02" + "\0".repeat(32)) } }] },
      signatures: [btoa("\0".repeat(64))],
    },
    tx_response: {
      txhash: SAMPLE_TX_HASH, code: 0, height: "12345", timestamp: "2026-11-25T00:00:00Z",
      events: [{ type: "pqc_hybrid_verify", attributes: [{ key: "status", value: "verified" }, { key: "algorithm_id", value: "dilithium5" }] }],
    },
  };
}

function installSyntheticLCD(payload = syntheticLCD(), network: string = CHAIN_ID) {
  const txUrl = `${REST_BASE}/cosmos/tx/v1beta1/txs/${SAMPLE_TX_HASH}`;
  const nodeUrl = `${REST_BASE}/cosmos/base/tendermint/v1beta1/node_info`;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url === txUrl ? payload : url === nodeUrl ? { default_node_info: { network } } : null;
    if (!body) throw new Error(`Unexpected URL in synthetic LCD test: ${url}`);
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, txUrl, nodeUrl };
}

describe("supplied live sample preparation", () => {
  it("retains the exact supplied transaction, commitment, issuer and all five fields", () => {
    expect(SAMPLE_TX_HASH).toBe("79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD");
    expect(SAMPLE_EXPECTED_HASH).toBe("7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727");
    expect(normalizeIssuerAddress(SAMPLE_ISSUER)).toBe("qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c");
    expect(SAMPLE_RECEIPT).toEqual(SUPPLIED_RECEIPT);
  });

  it("uses the unchanged alphabetical v1 JSON and represents 11/25/2026 as ISO", () => {
    expect(canonicalReceiptJSON(SAMPLE_RECEIPT)).toBe(CANONICAL);
    expect(Object.keys(normalizeReceipt(SAMPLE_RECEIPT))).toEqual(["facilityTag", "note", "receiptCode", "scanCategory", "visitDate"]);
    expect(() => normalizeReceipt({ ...SUPPLIED_RECEIPT, visitDate: "11/25/2026" })).toThrow(/YYYY-MM-DD/i);
  });

  it("computes actual canonical WebCrypto SHA-256, independently checked with Node SHA-256", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const input = await resolveTestnetSample();
    expect(input).toEqual({ receipt: normalizeReceipt(SUPPLIED_RECEIPT), txHash: SAMPLE_TX_HASH, receiptHash: createHash("sha256").update(CANONICAL, "utf8").digest("hex") });
    expect(digest).toHaveBeenCalledWith("SHA-256", new TextEncoder().encode(CANONICAL));
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("compares the supplied canonical digest with the exact published reference without hash overrides", async () => {
    // An actual mismatch must fail this regression, not be 'fixed' by changing v1
    // key order, accepting another date encoding, or copying the expected hash.
    expect(createHash("sha256").update(CANONICAL, "utf8").digest("hex")).toBe(SAMPLE_EXPECTED_HASH);
    expect((await resolveTestnetSample()).receiptHash).toBe(SAMPLE_EXPECTED_HASH);
  });

  it("returns a fresh mutable editor copy while protecting the original sample fields", async () => {
    const first = await resolveTestnetSample();
    first.receipt.scanCategory = "Ultrasound";
    const second = await resolveTestnetSample();
    expect(Object.isFrozen(SAMPLE_RECEIPT)).toBe(true);
    expect(second.receipt).toEqual(normalizeReceipt(SUPPLIED_RECEIPT));
    expect(first.receipt).not.toBe(second.receipt);
  });

  it("never substitutes the reference when the digest differs", async () => {
    // Test-only WebCrypto result injection exercises the mismatch branch.
    vi.spyOn(globalThis.crypto.subtle, "digest").mockResolvedValue(new Uint8Array(32).buffer);
    const input = await resolveTestnetSample();
    expect(input.receipt).toEqual(normalizeReceipt(SUPPLIED_RECEIPT));
    expect(input.receiptHash).toBe("00".repeat(32));
    expect(input.receiptHash).not.toBe(SAMPLE_EXPECTED_HASH);
  });

  it("fails closed without browser WebCrypto rather than assuming sample equality", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(resolveTestnetSample()).rejects.toThrow(/SHA-256 requires a secure browser context/i);
  });

  it("roundtrips all sample fields and the txHash in the existing self-contained link", async () => {
    const input = await resolveTestnetSample();
    const decoded = parseReceiptPayload(createVerificationLink(input, "https://chit.example/workspace"));
    expect(decoded.receipt).toEqual(input.receipt);
    expect(decoded.txHash).toBe(SAMPLE_TX_HASH);
  });
});

describe("sample verification uses the normal Diana path (synthetic LCD only)", () => {
  it("reads both the transaction and Diana node identity with no supplied receipt fields in requests", async () => {
    const input = await resolveTestnetSample();
    const { fetchMock, txUrl, nodeUrl } = installSyntheticLCD();
    const evidence = await fetchChainEvidence(input.txHash);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([txUrl, nodeUrl].sort());
    expect(evidence.sourceUrl).toBe(txUrl);
    expect(evidence.anchoredHash).toBe(SAMPLE_EXPECTED_HASH);
    expect(verificationVerdict(evidence, await hashReceipt(input.receipt)).kind).toBe("verified");
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("turns every valid field edit into HASH MISMATCH and reset recomputes the original", async () => {
    const input = await resolveTestnetSample();
    installSyntheticLCD();
    const evidence = await fetchChainEvidence(input.txHash);
    const originalJSON = canonicalReceiptJSON(input.receipt);
    for (const [field, value] of FIELD_EDITS) {
      const computed = await hashReceipt({ ...input.receipt, [field]: value });
      expect(verificationVerdict(evidence, computed)).toMatchObject({ kind: "tampered", title: "HASH MISMATCH — TAMPER DETECTED" });
      expect(verificationVerdict(evidence, null).kind).toBe("pending");
      expect(verificationVerdict(evidence, await hashReceipt(input.receipt)).kind).toBe("verified");
      expect(canonicalReceiptJSON(input.receipt)).toBe(originalJSON);
      expect(evidence.anchoredHash).toBe(SAMPLE_EXPECTED_HASH);
    }
  });

  it("does not let matching sample fields rescue missing hybrid evidence or an unauthorized issuer", async () => {
    const input = await resolveTestnetSample();
    const payload = syntheticLCD();
    payload.tx.body.extension_options = [];
    installSyntheticLCD(payload);
    const incomplete = await fetchChainEvidence(input.txHash);
    expect(verificationVerdict(incomplete, input.receiptHash!).kind).toBe("incomplete");
    installSyntheticLCD();
    const evidence = await fetchChainEvidence(input.txHash);
    expect(verificationVerdict(evidence, input.receiptHash!, { version: 1, enabled: true, addresses: [] }).kind).toBe("unauthorized");
  });

  it("rejects a wrong node network even for the sample transaction", async () => {
    installSyntheticLCD(syntheticLCD(), "qorechain-vladi");
    await expect(fetchChainEvidence(SAMPLE_TX_HASH)).rejects.toThrow(/not qorechain-diana/i);
  });
});
