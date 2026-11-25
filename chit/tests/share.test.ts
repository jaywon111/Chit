// Synthetic receipt/link fixtures only. A real-shaped tx hash is not chain proof.
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SAFE_NOTES,
  canonicalReceiptJSON,
  createReceiptRecord,
  hashReceipt,
  normalizeReceipt,
  parseReceiptJSONPayload,
  parseReceiptPayload,
  serializeReceipt,
  type ImportedReceipt,
  type ReceiptFields,
} from "../src/lib/receipt.js";
import { createVerificationLink, decodeVerificationFragment, parseVerificationLink } from "../src/lib/share.js";

const TX_HASH = "AB".repeat(32);
const OTHER_TX_HASH = "CD".repeat(32);
const CLAIMED_HASH = "ef".repeat(32);
const BASE_URL = "https://chit.example.test/app/";
const RECEIPT: ReceiptFields = {
  receiptCode: "CHT-4821", scanCategory: "Chest X-Ray", visitDate: "2024-02-29", facilityTag: "CLINIC-A", note: "PA View · Standard",
};
const INPUT: ImportedReceipt = { receipt: RECEIPT, txHash: TX_HASH, receiptHash: CLAIMED_HASH };
const TUPLE = [1, RECEIPT.receiptCode, RECEIPT.scanCategory, RECEIPT.visitDate, RECEIPT.facilityTag, RECEIPT.note, TX_HASH];

function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
function fragment(value: unknown): string {
  return `#verify=${encodeBytes(new TextEncoder().encode(JSON.stringify(value)))}`;
}
function inspectTuple(hash: string): unknown {
  const encoded = hash.slice("#verify=".length);
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))));
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("location", { href: `${BASE_URL}?patientName=SYNTHETIC#old-fragment` });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in share tests"); }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("compact v1 verification links", () => {
  it("encodes exactly the version, normalized five fields, and uppercase tx hash as UTF-8", () => {
    const input = {
      ...INPUT,
      receipt: { ...RECEIPT, receiptCode: " cht-4821 ", scanCategory: " chest\t x-ray ", facilityTag: " clinic-a ", note: " pa\tview · standard " },
      txHash: ` 0x${TX_HASH.toLowerCase()} `,
    };
    const url = new URL(createVerificationLink(input, BASE_URL));
    expect(url.origin + url.pathname).toBe(BASE_URL);
    expect(url.hash).toMatch(/^#verify=[A-Za-z0-9_-]+$/u);
    expect(inspectTuple(url.hash)).toEqual(TUPLE);
    expect(url.hash.slice("#verify=".length)).not.toContain("=");
  });

  it("keeps the current app origin/path but strips identifying queries and previous fragments", () => {
    const url = new URL(createVerificationLink(INPUT));
    expect(url.origin + url.pathname).toBe(BASE_URL);
    expect(url.search).toBe("");
    expect(url.hash.startsWith("#verify=")).toBe(true);
    expect(url.href).not.toContain("patientName");
    const explicit = new URL(createVerificationLink(INPUT, `${BASE_URL}?issuer=SYNTHETIC&name=SYNTHETIC#verify=old`));
    expect(explicit.search).toBe("");
    expect(inspectTuple(explicit.hash)).toEqual(TUPLE);
    expect(explicit.hash.slice("#verify=".length)).not.toContain("=");
  });

  it("drops all top-level pasted proof/issuer/PII metadata instead of serializing it", () => {
    const contaminated = { ...INPUT, issuer: "SYNTHETIC", patientName: "SYNTHETIC", signerAddress: "SYNTHETIC", secretKey: "SYNTHETIC" };
    const url = new URL(createVerificationLink(contaminated, BASE_URL));
    expect(inspectTuple(url.hash)).toEqual(TUPLE);
    const imported = parseVerificationLink(url.href);
    expect(Object.keys(imported)).toEqual(["receipt", "txHash"]);
    expect(Object.keys(imported.receipt)).toEqual(["facilityTag", "note", "receiptCode", "scanCategory", "visitDate"]);
    expect(imported).not.toHaveProperty("receiptHash");
    expect(imported).not.toHaveProperty("issuer");
    expect(imported).not.toHaveProperty("patientName");
    expect(JSON.stringify(imported)).not.toContain("SYNTHETIC");
  });

  it("roundtrips URL/fragment and recomputes the real canonical SHA-256, including the UTF-8 middle dot", async () => {
    const url = new URL(createVerificationLink(INPUT, BASE_URL));
    const expected = { receipt: normalizeReceipt(RECEIPT), txHash: TX_HASH };
    expect(parseVerificationLink(url.href)).toEqual(expected);
    expect(parseVerificationLink(` \n${url.hash}\t `)).toEqual(expected);
    expect(decodeVerificationFragment(url.hash)).toEqual(expected);
    expect(await hashReceipt(parseVerificationLink(url.href).receipt)).toBe(createHash("sha256").update(canonicalReceiptJSON(RECEIPT), "utf8").digest("hex"));
    expect(await hashReceipt(expected.receipt)).not.toBe(CLAIMED_HASH);
    const bytes = new TextEncoder().encode(JSON.stringify(inspectTuple(url.hash)));
    expect(Array.from(bytes).some((byte, index) => byte === 0xc2 && bytes[index + 1] === 0xb7)).toBe(true);
  });

  it.each(SAFE_NOTES)("roundtrips old and new controlled notes: %j", (note) => {
    const receipt = { ...RECEIPT, note };
    expect(parseVerificationLink(createVerificationLink({ receipt, txHash: TX_HASH }, BASE_URL))).toEqual({ receipt: normalizeReceipt(receipt), txHash: TX_HASH });
  });

  it("normalizes received tuple fields without trusting the supplied origin or query", () => {
    const hash = fragment([1, " cht-4821 ", " chest\t x-ray ", " 2024-02-29 ", " clinic-a ", " pa view · standard ", `0x${TX_HASH.toLowerCase()}`]);
    const input = parseVerificationLink(`https://untrusted.invalid/anything?receiptHash=${CLAIMED_HASH}&issuer=SYNTHETIC${hash}`);
    expect(input).toEqual({ receipt: normalizeReceipt(RECEIPT), txHash: TX_HASH });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("supports HTTP as well as HTTPS without credentials", () => {
    expect(parseVerificationLink(createVerificationLink(INPUT, "http://localhost:5173/chit"))).toEqual({ receipt: normalizeReceipt(RECEIPT), txHash: TX_HASH });
  });

  it("rejects PII/extra nested fields and invalid receipt/hash before creating a link", () => {
    const contaminated = { ...INPUT, receipt: { ...RECEIPT, patientName: "SYNTHETIC" } };
    expect(() => createVerificationLink(contaminated, BASE_URL)).toThrow(/unrecognized/i);
    expect(() => createVerificationLink({ ...INPUT, receipt: { ...RECEIPT, note: "Patient SYNTHETIC" } }, BASE_URL)).toThrow(/non-identifying|patient data/i);
    expect(() => createVerificationLink({ ...INPUT, txHash: "bad" }, BASE_URL)).toThrow(/transaction hash/i);
  });

  it("requires an explicit base URL when browser location is unavailable", () => {
    vi.stubGlobal("location", undefined);
    expect(() => createVerificationLink(INPUT)).toThrow(/base URL.*outside a browser/i);
    expect(createVerificationLink(INPUT, BASE_URL)).toContain(BASE_URL);
  });
});

describe("strict verification fragment decoding", () => {
  it.each(["", "#receipts", "#other=not-a-receipt", "#verified=not-a-receipt"])("returns null only for an unrelated/missing fragment: %j", (hash) => {
    expect(decodeVerificationFragment(hash)).toBeNull();
    expect(() => parseVerificationLink(hash || BASE_URL)).toThrow(/no #verify|paste/i);
  });

  it.each(["#verify", "#verify=", "#verify%3Dabc", "verify=abc", "#other=abc&verify=abc", "#verify=abc&other=def", "#verify=abc#verify=def"])(
    "throws instead of silently ignoring malformed verify data: %s", (hash) => {
      expect(() => decodeVerificationFragment(hash)).toThrow();
      expect(() => parseVerificationLink(hash)).toThrow();
    },
  );

  it.each(["%", "+/", "AA=", "AA==", "A", "AA=A", "AA===", "AA\n"])("rejects non-base64url/padded/truncated encoding: %j", (encoded) => {
    expect(() => decodeVerificationFragment(`#verify=${encoded}`)).toThrow();
  });

  it("rejects non-canonical trailing padding bits even when atob could decode the same bytes", () => {
    const encoded = SAFE_NOTES.map((note) => fragment([1, RECEIPT.receiptCode, RECEIPT.scanCategory, RECEIPT.visitDate, RECEIPT.facilityTag, note, TX_HASH]).slice(8)).find((value) => value.length % 4 !== 0)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = alphabet.indexOf(encoded.at(-1)!);
    const malformed = encoded.slice(0, -1) + alphabet[last + 1];
    expect(decodeVerificationFragment(`#verify=${encoded}`)).not.toBeNull();
    expect(() => decodeVerificationFragment(`#verify=${malformed}`)).toThrow(/malformed/i);
  });

  it("rejects invalid UTF-8 and BOM-prefixed JSON rather than replacing/dropping bytes", () => {
    expect(() => decodeVerificationFragment(`#verify=${encodeBytes(Uint8Array.of(0xc3, 0x28))}`)).toThrow(/UTF-8/i);
    const tupleBytes = new TextEncoder().encode(JSON.stringify(TUPLE));
    expect(() => decodeVerificationFragment(`#verify=${encodeBytes(Uint8Array.from([0xef, 0xbb, 0xbf, ...tupleBytes]))}`)).toThrow(/malformed/i);
  });

  it.each([null, {}, "receipt", [], [1], [...TUPLE, CLAIMED_HASH], [...TUPLE, { issuer: "SYNTHETIC" }]].map((value) => ({ value })))(
    "rejects non-tuples, wrong length, and extra metadata: $value", ({ value }) => {
      expect(() => decodeVerificationFragment(fragment(value))).toThrow(/exactly.*seven/i);
    },
  );

  it.each([0, 2, "1", null, true])("rejects unsupported/non-numeric version %j", (version) => {
    expect(() => decodeVerificationFragment(fragment([version, ...TUPLE.slice(1)]))).toThrow(/version/i);
  });

  it.each([1, 2, 3, 4, 5, 6])("requires primitive strings in tuple slot %i", (index) => {
    for (const value of [null, 123, { patientName: "SYNTHETIC" }, ["SYNTHETIC"]]) {
      const tuple = [...TUPLE];
      tuple[index] = value as never;
      expect(() => decodeVerificationFragment(fragment(tuple))).toThrow(/must be text/i);
    }
  });

  it.each([
    [1, "PATIENT-1234"], [2, "Chest pain"], [3, "2024-02-30"], [4, "Patient Name"],
    [5, "PA View · Standard for SYNTHETIC"], [6, "bad-tx-hash"],
  ] as const)("revalidates each receipt/tx slot %i, rejecting %s", (index, value) => {
    const tuple = [...TUPLE];
    tuple[index] = value;
    expect(() => decodeVerificationFragment(fragment(tuple))).toThrow();
  });

  it("bounds encoded/decoded bytes and URLs before expensive processing", () => {
    const atobSpy = vi.spyOn(globalThis, "atob");
    expect(() => decodeVerificationFragment(`#verify=${"A".repeat(2_733)}`)).toThrow(/too large/i);
    expect(atobSpy).not.toHaveBeenCalled();
    expect(() => decodeVerificationFragment(`#verify=${encodeBytes(new Uint8Array(2_049))}`)).toThrow();
    expect(() => parseVerificationLink("x".repeat(4_097))).toThrow(/too large/i);
    expect(() => createVerificationLink(INPUT, `${BASE_URL}${"x".repeat(4_097)}`)).toThrow(/too large/i);
    const longBase = BASE_URL + "x".repeat(4_000 - BASE_URL.length);
    expect(() => createVerificationLink(INPUT, longBase)).toThrow(/too large/i); // base fits; final href does not
    expect(() => decodeVerificationFragment(fragment([...TUPLE.slice(0, 5), "x".repeat(2_049), TX_HASH]))).toThrow();
  });
});

describe("safe local URL/legacy JSON dispatch", () => {
  it("accepts equivalent tx overrides but rejects conflicts for URL and fragment", () => {
    const link = createVerificationLink(INPUT, BASE_URL);
    for (const payload of [link, new URL(link).hash]) {
      expect(parseReceiptPayload(payload)).toEqual({ receipt: normalizeReceipt(RECEIPT), txHash: TX_HASH });
      expect(parseReceiptPayload(payload, ` 0x${TX_HASH.toLowerCase()} `).txHash).toBe(TX_HASH);
      expect(parseReceiptPayload(payload, " \n ").txHash).toBe(TX_HASH);
      expect(() => parseReceiptPayload(payload, OTHER_TX_HASH)).toThrow(/conflicts/i);
      expect(() => parseReceiptPayload(payload, "bad-override")).toThrow(/transaction hash/i);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains all legacy JSON proof guards and separates JSON-only parsing", () => {
    const record = createReceiptRecord(RECEIPT, CLAIMED_HASH, TX_HASH);
    expect(parseReceiptPayload(serializeReceipt(record))).toEqual({ receipt: record.receipt, txHash: TX_HASH, receiptHash: CLAIMED_HASH });
    expect(parseReceiptJSONPayload(serializeReceipt(record))).toEqual(parseReceiptPayload(serializeReceipt(record)));
    expect(() => parseReceiptJSONPayload(createVerificationLink(INPUT, BASE_URL))).toThrow(/JSON/i);
    expect(() => parseReceiptPayload(JSON.stringify({ ...record, patientName: "SYNTHETIC" }))).toThrow(/unrecognized/i);
    expect(() => parseReceiptPayload(JSON.stringify({ ...record, version: 2 }))).toThrow(/version/i);
    expect(() => parseReceiptPayload(JSON.stringify({ ...record, chainId: "qorechain-vladi" }))).toThrow(/another chain/i);
  });

  it.each([
    "https://untrusted.invalid/receipt", "javascript:alert(1)", "data:text/plain,receipt", "file:///receipt",
    "ftp://example.test/receipt", "//example.test/receipt", "/app/#verify=abc", "abc", "[1]",
    "https://name:password@example.test/#verify=abc", "https://example.test/\n#verify=abc",
  ])("rejects unsupported URL/plain text without fetching: %j", (payload) => {
    expect(() => parseVerificationLink(payload)).toThrow();
    expect(() => parseReceiptPayload(payload)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "ftp://example.test/", "/app/", "//example.test/", "https://user:password@example.test/", "https://example.test/\napp"])(
    "rejects unsafe base URLs: %j", (base) => {
      expect(() => createVerificationLink(INPUT, base)).toThrow();
    },
  );
});
