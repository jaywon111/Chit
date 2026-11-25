// Test-only receipts and in-memory storage: nothing here is patient data or chain proof.
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAIN_ID } from "../src/lib/network.js";
import {
  PENDING_STORAGE_KEY,
  SAFE_NOTES,
  SCAN_CATEGORIES,
  STORAGE_KEY,
  anchorMemo,
  canonicalReceiptJSON,
  clearPendingReceipt,
  createReceiptRecord,
  ensureReceiptStorage,
  generateReceiptCode,
  hashReceipt,
  loadPendingReceipts,
  loadReceipts,
  normalizeHash,
  normalizeReceipt,
  normalizeTxHash,
  parseReceiptPayload,
  removeReceipt,
  savePendingReceipt,
  saveReceipt,
  serializePendingReceipt,
  serializeReceipt,
  type ReceiptFields,
  type ReceiptRecord,
} from "../src/lib/receipt.js";

const RECEIPT: ReceiptFields = {
  receiptCode: "CHT-4821",
  scanCategory: "Chest X-Ray",
  visitDate: "2024-02-29",
  facilityTag: "CLINIC-A",
  note: "",
};
const CANONICAL = '{"facilityTag":"CLINIC-A","note":"","receiptCode":"CHT-4821","scanCategory":"Chest X-Ray","visitDate":"2024-02-29"}';
// These placeholders are deliberately just storage metadata, not real tx hashes.
const HASH = "ab".repeat(32);
const TX_HASH = "CD".repeat(32);
const OTHER_HASH = "12".repeat(32);
const OTHER_TX_HASH = "34".repeat(32);
const FIELD_EDITS: Array<[keyof ReceiptFields, string]> = [
  ["facilityTag", "CLINIC-B"],
  ["note", "Visit completed"],
  ["receiptCode", "CHT-4822"],
  ["scanCategory", "Ultrasound"],
  ["visitDate", "2024-03-01"],
];

class MemoryStorage {
  readonly values: Map<string, string>;
  readonly getItem = vi.fn((key: string): string | null => this.values.get(key) ?? null);
  readonly setItem = vi.fn((key: string, value: string): void => {
    this.values.set(key, value);
  });
  readonly removeItem = vi.fn((key: string): void => {
    this.values.delete(key);
  });

  constructor(initial: Record<string, string> = {}) {
    this.values = new Map(Object.entries(initial));
  }
}

function record(code = RECEIPT.receiptCode): ReceiptRecord {
  return createReceiptRecord({ ...RECEIPT, receiptCode: code }, HASH, TX_HASH);
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("receipt canonical schema", () => {
  it("uses the fixed alphabetical five-key order, regardless of input order", () => {
    const input = {
      visitDate: RECEIPT.visitDate,
      scanCategory: RECEIPT.scanCategory,
      receiptCode: RECEIPT.receiptCode,
      note: RECEIPT.note,
      facilityTag: RECEIPT.facilityTag,
    };
    expect(Object.keys(normalizeReceipt(input))).toEqual([
      "facilityTag", "note", "receiptCode", "scanCategory", "visitDate",
    ]);
    expect(canonicalReceiptJSON(input)).toBe(CANONICAL);
    expect(canonicalReceiptJSON(RECEIPT)).toBe(CANONICAL);
  });

  it("trims/collapses Unicode whitespace and canonicalizes allowed case", () => {
    const normalized = normalizeReceipt({
      receiptCode: "\u00a0 cht-4821 \t",
      scanCategory: "\n cHeSt\t\u00a0 X-rAy \r",
      visitDate: " 2024-02-29\n",
      facilityTag: "\t clinic-a \u2003",
      note: "\u00a0 vIsIt\t\n cOmPlEtEd \u2003",
    });
    expect(normalized).toEqual({ ...RECEIPT, note: "Visit completed" });
    expect(canonicalReceiptJSON(normalized)).toBe(
      CANONICAL.replace('"note":""', '"note":"Visit completed"'),
    );
  });

  it("makes a legal NFC-equivalent Unicode spelling match the ASCII canonical bytes/hash", async () => {
    // U+212A KELVIN SIGN is canonically equivalent to ASCII K under NFC.
    // Uppercasing alone does not remove this distinct Unicode spelling.
    const ascii = { ...RECEIPT, receiptCode: "CHT-K821", facilityTag: "KLINIC-A" };
    const unicode = { ...RECEIPT, receiptCode: "CHT-\u212a821", facilityTag: "\u212aLINIC-A" };
    expect(normalizeReceipt(unicode)).toEqual(normalizeReceipt(ascii));
    expect(canonicalReceiptJSON(unicode)).toBe(canonicalReceiptJSON(ascii));
    expect(await hashReceipt(unicode)).toBe(await hashReceipt(ascii));
  });

  it("applies NFC to each text field before validation without admitting Unicode free text", () => {
    // Observe the actual native NFC call and reject composed/decomposed PII alike.
    const normalize = vi.spyOn(String.prototype, "normalize");
    normalizeReceipt(RECEIPT);
    expect(normalize).toHaveBeenCalledTimes(5);
    expect(normalize.mock.calls.every(([form]) => form === "NFC")).toBe(true);
    for (const unsafeNote of ["Jos\u00e9", "Jose\u0301"]) {
      expect(() => normalizeReceipt({ ...RECEIPT, note: unsafeNote })).toThrow(/non-identifying|patient data/i);
    }
  });

  it("treats omitted, empty, and whitespace-only notes identically", async () => {
    const { note: _note, ...withoutNote } = RECEIPT;
    const variants = [withoutNote, RECEIPT, { ...RECEIPT, note: " \t\n\u00a0 " }];
    for (const variant of variants) {
      expect(canonicalReceiptJSON(variant)).toBe(CANONICAL);
    }
    expect(new Set(await Promise.all(variants.map(hashReceipt))).size).toBe(1);
    expect(() => normalizeReceipt({ ...RECEIPT, note: null })).toThrow(/text/i);
  });

  it.each(SCAN_CATEGORIES)("accepts only the controlled category: %s", (scanCategory) => {
    expect(normalizeReceipt({ ...RECEIPT, scanCategory: scanCategory.toLowerCase() }).scanCategory).toBe(scanCategory);
  });

  it.each(SAFE_NOTES)("accepts the controlled safe note: %j", (note) => {
    const spaced = note ? ` \t${note.toUpperCase().replaceAll(" ", "\n\t")} ` : " \n ";
    expect(normalizeReceipt({ ...RECEIPT, note: spaced }).note).toBe(note);
  });

  it.each([
    "Patient Jane Doe", "Call +1 555 010 1234", "DOB 1990-01-01",
    "National ID 123456789", "Chest pain", "Visit completed for Jane", "https://example.test/patient",
  ])("rejects free-text/identifying notes: %s", (note) => {
    expect(() => normalizeReceipt({ ...RECEIPT, note })).toThrow(/non-identifying|free-text|patient data/i);
  });

  it.each([
    "patientName", "patientId", "patientPhone", "nationalId", "dob",
    "diagnosis", "radiologyReport", "secretKey", "facilityName", "address",
  ])("strictly rejects an unknown/PII field: %s", (key) => {
    expect(() => normalizeReceipt({ ...RECEIPT, [key]: "SYNTHETIC TEST ONLY" })).toThrow(/unrecognized fields/i);
  });

  it("rejects an own __proto__ field in imported JSON instead of dropping it", () => {
    const input = JSON.parse(CANONICAL.slice(0, -1) + ',"__proto__":{"patientName":"SYNTHETIC"}}');
    expect(() => normalizeReceipt(input)).toThrow(/unrecognized fields/i);
  });

  it.each([null, [], 1, "receipt", true].map((value) => ({ value })))("rejects non-object receipts: $value", ({ value }) => {
    expect(() => normalizeReceipt(value)).toThrow(/JSON object/i);
  });

  it.each(["receiptCode", "scanCategory", "visitDate", "facilityTag"] as const)(
    "requires text for %s", (field) => {
      const missing: Record<string, unknown> = { ...RECEIPT };
      delete missing[field];
      expect(() => normalizeReceipt(missing)).toThrow(/text/i);
      expect(() => normalizeReceipt({ ...RECEIPT, [field]: 123 })).toThrow(/text/i);
    },
  );

  it.each(["CHT-123", "CHT-123456789", "PATIENT-1234", "CHT-12-34", "CHT-AB\u00c9D"])(
    "rejects unsupported receipt codes: %s", (receiptCode) => {
      expect(() => normalizeReceipt({ ...RECEIPT, receiptCode })).toThrow(/receipt code/i);
    },
  );

  it.each(["A", "Jane Doe", "5550101234", "CLINIC_A", "CLINIC-ABCDE", "ABCDEFGHIJKLM"])(
    "rejects non-generic/invalid facility tag shape: %s", (facilityTag) => {
      expect(() => normalizeReceipt({ ...RECEIPT, facilityTag })).toThrow(/facility code/i);
    },
  );

  it.each(["Diagnosis", "Chest pain", "MRI", "chest x ray"])("rejects unknown scan category: %s", (scanCategory) => {
    expect(() => normalizeReceipt({ ...RECEIPT, scanCategory })).toThrow(/supported imaging category/i);
  });

  it.each(["1900-01-01", "2000-02-29", "2024-02-29", "2100-12-31"])("accepts a real in-range date: %s", (visitDate) => {
    expect(normalizeReceipt({ ...RECEIPT, visitDate }).visitDate).toBe(visitDate);
  });

  it.each([
    "1899-12-31", "2101-01-01", "1900-02-29", "2100-02-29", "2025-02-29",
    "2024-04-31", "2024-13-01", "2024-00-01", "2024-01-00", "2024-01-32",
    "2024-2-9", "02/29/2024", "2024-02-29T00:00:00Z", "not-a-date",
  ])("rejects invalid/calendar-normalized/out-of-range dates: %s", (visitDate) => {
    expect(() => normalizeReceipt({ ...RECEIPT, visitDate })).toThrow(/real visit date/i);
  });
});

describe("SHA-256 receipt hashing", () => {
  it("digests the exact canonical UTF-8 bytes using real WebCrypto SHA-256", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const result = await hashReceipt(RECEIPT);
    // Independent Node SHA-256 over a fixed string, not a reused canonicalizer.
    expect(result).toBe(createHash("sha256").update(CANONICAL, "utf8").digest("hex"));
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest.mock.calls[0][0]).toBe("SHA-256");
    expect(digest.mock.calls[0][1]).toEqual(new TextEncoder().encode(CANONICAL));
  });

  it("gives normalization-equivalent fields the same digest", async () => {
    expect(await hashReceipt({
      ...RECEIPT, receiptCode: " cht-4821 ", scanCategory: " chest\t x-ray ",
      facilityTag: " clinic-a ", note: "\n\t",
    })).toBe(await hashReceipt(RECEIPT));
  });

  it.each(FIELD_EDITS)("editing %s changes the hash", async (field, value) => {
    expect(await hashReceipt({ ...RECEIPT, [field]: value })).not.toBe(await hashReceipt(RECEIPT));
  });

  it("fails closed without WebCrypto instead of inventing a hash", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(hashReceipt(RECEIPT)).rejects.toThrow(/SHA-256 requires a secure browser context/i);
  });

  it("rejects invalid receipt fields before returning a digest", async () => {
    await expect(hashReceipt({ ...RECEIPT, patientName: "SYNTHETIC" })).rejects.toThrow(/unrecognized fields/i);
  });
});

describe("receipt proof import and serialization guards", () => {
  it("normalizes hash, tx hash, and the exact versioned memo", () => {
    expect(normalizeHash(` ${HASH.toUpperCase()}\n`)).toBe(HASH);
    expect(normalizeTxHash(` 0x${TX_HASH.toLowerCase()}\n`)).toBe(TX_HASH);
    expect(anchorMemo(HASH.toUpperCase())).toBe(`CHIT:v1:${HASH}`);
  });

  it.each([null, 1, [], "", "a".repeat(63), "a".repeat(65), "g".repeat(64), `0x${HASH}`].map((value) => ({ value })))(
    "rejects invalid receipt hash $value", ({ value }) => {
      expect(() => normalizeHash(value)).toThrow(/64 hexadecimal/i);
    },
  );

  it.each([null, 1, [], "", "a".repeat(63), "a".repeat(65), "g".repeat(64), "0x1234"].map((value) => ({ value })))(
    "rejects invalid transaction hash $value", ({ value }) => {
      expect(() => normalizeTxHash(value)).toThrow(/transaction hash/i);
    },
  );

  it("roundtrips a canonical envelope, including pretty JSON", () => {
    const clean = record();
    expect(clean).toEqual({ version: 1, chainId: CHAIN_ID, receipt: normalizeReceipt(RECEIPT), receiptHash: HASH, txHash: TX_HASH });
    expect(parseReceiptPayload(serializeReceipt(clean))).toEqual({ receipt: clean.receipt, receiptHash: HASH, txHash: TX_HASH });
    const pretty = serializeReceipt(clean, true);
    expect(pretty).toContain('\n  "version": 1');
    expect(JSON.parse(pretty)).toEqual(clean);
  });

  it("projects only proof metadata and five receipt fields on export", () => {
    const contaminated = { ...record(), patientName: "SYNTHETIC TEST ONLY", provider: { secret: "TEST ONLY" } };
    const exported = JSON.parse(serializeReceipt(contaminated));
    expect(Object.keys(exported)).toEqual(["version", "chainId", "receipt", "receiptHash", "txHash"]);
    expect(Object.keys(exported.receipt)).toEqual(["facilityTag", "note", "receiptCode", "scanCategory", "visitDate"]);
    expect(JSON.stringify(exported)).not.toContain("patientName");
    expect(JSON.stringify(exported)).not.toContain("provider");
    expect(() => serializeReceipt({ ...record(), receipt: { ...RECEIPT, patientName: "SYNTHETIC" } } as ReceiptRecord)).toThrow(/unrecognized fields/i);
  });

  it("accepts flat receipt JSON with a separate real-shaped tx hash, but never without one", () => {
    expect(parseReceiptPayload(CANONICAL, `0x${TX_HASH.toLowerCase()}`)).toEqual({ receipt: normalizeReceipt(RECEIPT), txHash: TX_HASH });
    expect(() => parseReceiptPayload(CANONICAL)).toThrow(/transaction hash/i);
    const flat = JSON.stringify({ ...RECEIPT, version: 1, chainId: CHAIN_ID, receiptHash: HASH, txHash: TX_HASH });
    expect(parseReceiptPayload(flat)).toEqual({ receipt: normalizeReceipt(RECEIPT), receiptHash: HASH, txHash: TX_HASH });
  });

  it("allows equivalent separate tx overrides and rejects conflicting or invalid embedded tx hashes", () => {
    const payload = serializeReceipt(record());
    expect(parseReceiptPayload(payload, ` \t0x${TX_HASH.toLowerCase()} `).txHash).toBe(TX_HASH);
    expect(parseReceiptPayload(payload, " \n ").txHash).toBe(TX_HASH);
    expect(() => parseReceiptPayload(payload, OTHER_TX_HASH)).toThrow(/conflicts/i);
    expect(() => parseReceiptPayload(JSON.stringify({ ...record(), txHash: "not-a-hash" }), TX_HASH)).toThrow(/transaction hash/i);
    expect(() => parseReceiptPayload(payload, "bad-override")).toThrow(/transaction hash/i);
  });

  it.each([0, 2, "1", null])("rejects unsupported schema version %j even with a tx override", (version) => {
    expect(() => parseReceiptPayload(JSON.stringify({ ...record(), version }), TX_HASH)).toThrow(/schema version/i);
    expect(() => parseReceiptPayload(JSON.stringify({ ...RECEIPT, version }), TX_HASH)).toThrow(/schema version/i);
  });

  it.each(["qorechain-vladi", "diana", "", 9800, null])("rejects wrong chain metadata %j", (chainId) => {
    expect(() => parseReceiptPayload(JSON.stringify({ ...record(), chainId }), TX_HASH)).toThrow(/another chain/i);
    expect(() => parseReceiptPayload(JSON.stringify({ ...RECEIPT, chainId }), TX_HASH)).toThrow(/another chain/i);
  });

  it("rejects unknown fields at the flat, envelope, and nested receipt levels", () => {
    for (const payload of [
      { ...RECEIPT, patientName: "SYNTHETIC" },
      { ...record(), patientId: "SYNTHETIC" },
      { ...record(), receipt: { ...RECEIPT, nationalId: "SYNTHETIC" } },
    ]) {
      expect(() => parseReceiptPayload(JSON.stringify(payload), TX_HASH)).toThrow(/unrecognized fields/i);
    }
  });

  it("normalizes a declared hash but does not recompute or treat it as chain proof", () => {
    const imported = parseReceiptPayload(JSON.stringify({ ...record(), receiptHash: OTHER_HASH.toUpperCase() }));
    expect(imported.receiptHash).toBe(OTHER_HASH);
    expect(imported.receipt).toEqual(normalizeReceipt(RECEIPT));
    expect(() => parseReceiptPayload(JSON.stringify({ ...record(), receiptHash: "bad" }))).toThrow(/receipt hash/i);
  });

  it.each(["", " \n ", "not JSON", "https://example.test/receipt", "null", "[]", "42", '"receipt"'])(
    "rejects empty/non-JSON/non-object payload %j", (payload) => {
      expect(() => parseReceiptPayload(payload, TX_HASH)).toThrow();
    },
  );

  it("rejects oversized imports before schema processing", () => {
    expect(() => parseReceiptPayload(" ".repeat(12_001) + CANONICAL, TX_HASH)).toThrow(/too large/i);
  });
});

describe("saved receipt storage", () => {
  it("loads empty stores, saves roundtrips, and removes only the chosen receipt", () => {
    const storage = new MemoryStorage();
    const first = record();
    const second = record("CHT-4822");
    expect(loadReceipts(storage)).toEqual([]);
    expect(saveReceipt(first, storage)).toEqual([first]);
    expect(saveReceipt(second, storage)).toEqual([first, second]);
    expect(loadReceipts(storage)).toEqual([first, second]);
    expect(removeReceipt(first.receipt.receiptCode, storage)).toEqual([second]);
    expect(loadReceipts(storage)).toEqual([second]);
    expect(loadPendingReceipts(storage)).toEqual([]);
  });

  it("is idempotent for an identical normalized receipt without another write", () => {
    const storage = new MemoryStorage();
    const first = record();
    saveReceipt(first, storage);
    const equivalent = createReceiptRecord({ ...RECEIPT, receiptCode: " cht-4821 ", note: " \n " }, HASH.toUpperCase(), `0x${TX_HASH.toLowerCase()}`);
    expect(saveReceipt(equivalent, storage)).toEqual([first]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it.each(["receipt", "receiptHash", "txHash"] as const)("never overwrites a colliding receipt code with changed %s", (field) => {
    const storage = new MemoryStorage();
    const first = record();
    saveReceipt(first, storage);
    const raw = storage.getItem(STORAGE_KEY);
    storage.setItem.mockClear();
    const changed = {
      ...first,
      ...(field === "receipt" ? { receipt: { ...first.receipt, note: "Visit completed" } }
        : field === "receiptHash" ? { receiptHash: OTHER_HASH } : { txHash: OTHER_TX_HASH }),
    };
    expect(() => saveReceipt(changed, storage)).toThrow(/not overwritten/i);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("preflights writable storage and blocks existing codes case-insensitively", () => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify([record()]) });
    expect(() => ensureReceiptStorage("cht-4821", storage)).toThrow(/already saved/i);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(() => ensureReceiptStorage("CHT-9999", storage)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledWith(`${STORAGE_KEY}.probe`, "1");
    expect(storage.removeItem).toHaveBeenCalledWith(`${STORAGE_KEY}.probe`);
    expect(storage.getItem(`${STORAGE_KEY}.probe`)).toBeNull();
    expect(loadReceipts(storage)).toEqual([record()]);
  });

  const corruptedStores: Array<[string, string]> = [
    ["malformed JSON", "{"],
    ["non-array store", "{}"],
    ["null store", "null"],
    ["wrong version", JSON.stringify([{ ...record(), version: 2 }])],
    ["wrong chain", JSON.stringify([{ ...record(), chainId: "qorechain-vladi" }])],
    ["unknown envelope field", JSON.stringify([{ ...record(), patientName: "SYNTHETIC" }])],
    ["unknown receipt field", JSON.stringify([{ ...record(), receipt: { ...RECEIPT, patientId: "SYNTHETIC" } }])],
    ["missing hash", JSON.stringify([{ version: 1, chainId: CHAIN_ID, receipt: RECEIPT, txHash: TX_HASH }])],
    ["invalid tx hash", JSON.stringify([{ ...record(), txHash: "bad" }])],
    ["duplicate code", JSON.stringify([record(), record()])],
    ["partial corruption", JSON.stringify([record(), null])],
  ];

  it.each(corruptedStores)("rejects %s and preserves all existing bytes", (_label, raw) => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
    expect(() => loadReceipts(storage)).toThrow(/corrupted|could not be read/i);
    expect(() => saveReceipt(record("CHT-9999"), storage)).toThrow(/not been overwritten/i);
    expect(() => ensureReceiptStorage("CHT-9999", storage)).toThrow();
    expect(() => removeReceipt("CHT-4821", storage)).toThrow();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("enforces the 250-receipt limit without overwriting full/corrupt stores", () => {
    const records = Array.from({ length: 250 }, (_, index) => record(`CHT-${String(index).padStart(4, "0")}`));
    const raw = JSON.stringify(records);
    const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
    expect(loadReceipts(storage)).toHaveLength(250);
    expect(() => ensureReceiptStorage("CHT-9999", storage)).toThrow(/250-Chit/i);
    expect(() => saveReceipt(record("CHT-9999"), storage)).toThrow(/storage is full/i);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    storage.values.set(STORAGE_KEY, JSON.stringify([...records, record("CHT-9999")]));
    expect(() => loadReceipts(storage)).toThrow(/could not be read/i);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("fails closed when storage cannot be read", () => {
    const storage = new MemoryStorage();
    storage.getItem.mockImplementation(() => { throw new Error("SYNTHETIC storage denial"); });
    expect(() => loadReceipts(storage)).toThrow(/storage may be blocked/i);
    expect(() => saveReceipt(record(), storage)).toThrow(/could not be read/i);
    expect(() => ensureReceiptStorage("CHT-4821", storage)).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("blocks issuance if writes throw or silently disappear during the storage probe", () => {
    for (const silent of [false, true]) {
      const storage = new MemoryStorage();
      storage.setItem.mockImplementation(() => {
        if (!silent) throw new Error("SYNTHETIC write denial");
      });
      expect(() => ensureReceiptStorage("CHT-4821", storage)).toThrow(/not writable.*no transaction was sent/i);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      expect(storage.getItem(PENDING_STORAGE_KEY)).toBeNull();
    }
  });

  it.each([false, true])("reports failed committed-record persistence (silent drop = %s), never apparent success", (silent) => {
    const raw = JSON.stringify([record()]);
    const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
    storage.setItem.mockImplementation(() => {
      if (!silent) throw new Error("SYNTHETIC quota failure");
    });
    expect(() => saveReceipt(record("CHT-9999"), storage)).toThrow(/submitted.*local storage failed.*do not issue it again/i);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("reports failed removals without silently clearing the saved list", () => {
    const raw = JSON.stringify([record()]);
    const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
    storage.setItem.mockImplementation(() => { throw new Error("SYNTHETIC write failure"); });
    expect(() => removeReceipt("CHT-4821", storage)).toThrow(/could not be updated/i);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("uses injected browser storage and rejects unavailable default storage", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(saveReceipt(record())).toEqual([record()]);
    expect(loadReceipts()).toEqual([record()]);
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadReceipts()).toThrow(/storage|could not be read/i);
    expect(() => ensureReceiptStorage("CHT-9999")).toThrow();
  });
});

describe("pending recovery drafts (not verification proof)", () => {
  it("roundtrips drafts separately, with no transaction hash, and needs a recovered tx hash for import", () => {
    const storage = new MemoryStorage();
    const draft = savePendingReceipt(RECEIPT, HASH, storage);
    expect(draft).toEqual({ version: 1, chainId: CHAIN_ID, receipt: normalizeReceipt(RECEIPT), receiptHash: HASH });
    expect(loadPendingReceipts(storage)).toEqual([draft]);
    expect(loadReceipts(storage)).toEqual([]);
    const exported = serializePendingReceipt(draft);
    expect(JSON.parse(exported)).toEqual(draft);
    expect(exported).not.toContain("txHash");
    expect(serializePendingReceipt(draft, false)).not.toContain("\n");
    expect(() => parseReceiptPayload(exported)).toThrow(/transaction hash/i);
    expect(parseReceiptPayload(exported, TX_HASH)).toEqual({ receipt: draft.receipt, receiptHash: HASH, txHash: TX_HASH });
  });

  it("blocks another submission using an unresolved code and never overwrites its draft", () => {
    const storage = new MemoryStorage();
    const draft = savePendingReceipt(RECEIPT, HASH, storage);
    const raw = storage.getItem(PENDING_STORAGE_KEY);
    storage.setItem.mockClear();
    expect(() => ensureReceiptStorage("cht-4821", storage)).toThrow(/unresolved submission/i);
    expect(() => savePendingReceipt(RECEIPT, HASH, storage)).toThrow(/unresolved submission/i);
    expect(() => savePendingReceipt({ ...RECEIPT, note: "Visit completed" }, OTHER_HASH, storage)).toThrow(/unresolved submission/i);
    expect(loadPendingReceipts(storage)).toEqual([draft]);
    expect(storage.getItem(PENDING_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("recovers into a saved receipt, then clears only that pending draft", () => {
    const storage = new MemoryStorage();
    savePendingReceipt(RECEIPT, HASH, storage);
    const other = savePendingReceipt({ ...RECEIPT, receiptCode: "CHT-4822" }, HASH, storage);
    saveReceipt(record(), storage);
    expect(clearPendingReceipt("CHT-4821", storage)).toEqual([other]);
    expect(loadPendingReceipts(storage)).toEqual([other]);
    expect(loadReceipts(storage)).toEqual([record()]);
    expect(() => ensureReceiptStorage("CHT-4821", storage)).toThrow(/already saved/i);
    clearPendingReceipt("CHT-4822", storage);
    expect(() => ensureReceiptStorage("CHT-4822", storage)).not.toThrow();
  });

  it("does not create a draft with a code already committed locally", () => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify([record()]) });
    expect(() => savePendingReceipt(RECEIPT, HASH, storage)).toThrow(/already saved/i);
    expect(storage.getItem(PENDING_STORAGE_KEY)).toBeNull();
  });

  it("rejects corrupt pending data without clearing it or adding another submission", () => {
    const good = { version: 1, chainId: CHAIN_ID, receipt: RECEIPT, receiptHash: HASH };
    const corrupted = [
      "{", "{}", "null", JSON.stringify([null]),
      JSON.stringify([{ ...good, version: 2 }]),
      JSON.stringify([{ ...good, chainId: "qorechain-vladi" }]),
      JSON.stringify([{ ...good, receiptHash: "bad" }]),
      JSON.stringify([{ ...good, txHash: TX_HASH }]),
      JSON.stringify([{ ...good, patientName: "SYNTHETIC" }]),
      JSON.stringify([{ ...good, receipt: { ...RECEIPT, patientId: "SYNTHETIC" } }]),
      JSON.stringify([good, good]),
    ];
    for (const raw of corrupted) {
      const storage = new MemoryStorage({ [PENDING_STORAGE_KEY]: raw });
      expect(() => loadPendingReceipts(storage)).toThrow(/drafts were not overwritten/i);
      expect(() => savePendingReceipt({ ...RECEIPT, receiptCode: "CHT-9999" }, HASH, storage)).toThrow();
      expect(() => ensureReceiptStorage("CHT-9999", storage)).toThrow();
      expect(() => clearPendingReceipt("CHT-4821", storage)).toThrow();
      expect(storage.getItem(PENDING_STORAGE_KEY)).toBe(raw);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])("requires the pending write to be retained before submission (silent drop = %s)", (silent) => {
    const storage = new MemoryStorage();
    storage.setItem.mockImplementation((key, value) => {
      if (key === PENDING_STORAGE_KEY) {
        if (!silent) throw new Error("SYNTHETIC draft quota failure");
        return;
      }
      storage.values.set(key, value);
    });
    expect(() => savePendingReceipt(RECEIPT, HASH, storage)).toThrow(/could not save the recovery draft.*no transaction was sent/i);
    expect(storage.getItem(PENDING_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("preserves a draft when clearing storage fails", () => {
    const storage = new MemoryStorage();
    savePendingReceipt(RECEIPT, HASH, storage);
    const raw = storage.getItem(PENDING_STORAGE_KEY);
    storage.setItem.mockImplementation(() => { throw new Error("SYNTHETIC clear failure"); });
    expect(() => clearPendingReceipt("CHT-4821", storage)).toThrow(/draft could not be cleared.*do not rebroadcast/i);
    expect(storage.getItem(PENDING_STORAGE_KEY)).toBe(raw);
  });

  it("caps pending drafts at 250 and rejects oversized stores", () => {
    const drafts = Array.from({ length: 250 }, (_, index) => ({
      version: 1, chainId: CHAIN_ID, receipt: { ...RECEIPT, receiptCode: `CHT-${String(index).padStart(4, "0")}` }, receiptHash: HASH,
    }));
    const raw = JSON.stringify(drafts);
    const storage = new MemoryStorage({ [PENDING_STORAGE_KEY]: raw });
    expect(loadPendingReceipts(storage)).toHaveLength(250);
    expect(() => savePendingReceipt({ ...RECEIPT, receiptCode: "CHT-9999" }, HASH, storage)).toThrow(/unresolved submission storage is full/i);
    expect(storage.getItem(PENDING_STORAGE_KEY)).toBe(raw);
    storage.values.set(PENDING_STORAGE_KEY, JSON.stringify([...drafts, { ...drafts[0], receipt: { ...RECEIPT, receiptCode: "CHT-9999" } }]));
    expect(() => loadPendingReceipts(storage)).toThrow(/could not be read/i);
  });
});

describe("secure receipt-code collision handling", () => {
  it("uses secure RNG and retries existing codes before returning an unused code", () => {
    const values = [4821, 4822];
    const getRandomValues = vi.fn((buffer: Uint32Array) => {
      buffer[0] = values.shift()!;
      return buffer;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    expect(generateReceiptCode(["CHT-4821"])).toBe("CHT-4822");
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(getRandomValues.mock.calls[0][0]).toBeInstanceOf(Uint32Array);
  });

  it("stops after 100 collisions instead of overwriting/reusing a receipt code", () => {
    const getRandomValues = vi.fn((buffer: Uint32Array) => {
      buffer[0] = 4821;
      return buffer;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    expect(() => generateReceiptCode(["CHT-4821"])).toThrow(/unused receipt code/i);
    expect(getRandomValues).toHaveBeenCalledTimes(100);
  });

  it("never falls back to insecure randomness", () => {
    vi.stubGlobal("crypto", undefined);
    const insecure = vi.spyOn(Math, "random");
    expect(() => generateReceiptCode()).toThrow(/secure browser/i);
    expect(insecure).not.toHaveBeenCalled();
  });
});
