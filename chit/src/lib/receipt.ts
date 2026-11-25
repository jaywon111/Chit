import { CHAIN_ID } from "./network.js";

export const SCAN_CATEGORIES = [
  "Chest X-Ray",
  "Pelvis X-Ray",
  "Limb X-Ray",
  "Ultrasound",
  "Non-Contrast CT",
  "Custom",
] as const;

// A controlled vocabulary keeps the optional note from becoming a PII field.
export const SAFE_NOTES = [
  "",
  "Visit completed",
  "Follow-up visit",
  "Receipt reissued",
  "Digital copy requested",
] as const;

export interface ReceiptFields {
  receiptCode: string;
  scanCategory: string;
  visitDate: string;
  facilityTag: string;
  note: string;
}

export interface ReceiptRecord {
  version: 1;
  chainId: typeof CHAIN_ID;
  receipt: ReceiptFields;
  receiptHash: string;
  txHash: string;
}

export interface ImportedReceipt {
  receipt: ReceiptFields;
  txHash: string;
  receiptHash?: string;
}

// A recoverable draft, not a proof. A real txHash must be found before verifying.
export interface PendingReceipt {
  version: 1;
  chainId: typeof CHAIN_ID;
  receipt: ReceiptFields;
  receiptHash: string;
}

const RECEIPT_KEYS = ["receiptCode", "scanCategory", "visitDate", "facilityTag", "note"];
const MAX_PAYLOAD_LENGTH = 12_000;
export const STORAGE_KEY = "chit.receipts.v1";
export const PENDING_STORAGE_KEY = "chit.pending.v1";
const MAX_SAVED_RECEIPTS = 250;
type ReceiptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(object: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw new Error("Unrecognized fields were rejected. Import only the five non-identifying receipt fields and Chit proof metadata; never patient data.");
  }
}

function text(value: unknown, field: string, optional = false): string {
  if (optional && value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** Fixed alphabetical key order, NFC, trimmed/collapsed whitespace; no extra fields. */
export function normalizeReceipt(value: unknown): ReceiptFields {
  if (!isObject(value)) throw new Error("A receipt must be a JSON object.");
  onlyKeys(value, RECEIPT_KEYS);
  const receiptCode = text(value.receiptCode, "Receipt code").toUpperCase();
  if (!/^CHT-[A-Z0-9]{4,8}$/.test(receiptCode)) {
    throw new Error("Use a receipt code such as CHT-4821 (4–8 letters or digits after CHT-). Do not use a patient identifier.");
  }
  const categoryText = text(value.scanCategory, "Scan category");
  const scanCategory = SCAN_CATEGORIES.find((category) => category.toLowerCase() === categoryText.toLowerCase());
  if (!scanCategory) throw new Error("Choose a supported imaging category or Custom; never a diagnosis.");
  const visitDate = text(value.visitDate, "Visit date");
  const date = new Date(`${visitDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== visitDate || visitDate < "1900-01-01" || visitDate > "2100-12-31") {
    throw new Error("Enter a real visit date in YYYY-MM-DD format (1900–2100).");
  }
  const facilityTag = text(value.facilityTag, "Facility tag").toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,11}(?:-[A-Z0-9]{1,4})?$/.test(facilityTag)) {
    throw new Error("Use a short, generic facility code such as CLINIC-A, not a name or phone number.");
  }
  const noteText = text(value.note, "Visit note", true);
  const note = SAFE_NOTES.find((entry) => entry.toLowerCase() === noteText.toLowerCase());
  if (note === undefined) {
    throw new Error("Use an allowed non-identifying note, or leave it empty. Free-text notes and patient data are not accepted.");
  }
  // Do not change this insertion order without introducing a new schema version.
  return { facilityTag, note, receiptCode, scanCategory, visitDate };
}

export function canonicalReceiptJSON(receipt: unknown): string {
  return JSON.stringify(normalizeReceipt(receipt));
}

export async function hashReceipt(receipt: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 requires a secure browser context. Open Chit over HTTPS or localhost.");
  }
  const bytes = new TextEncoder().encode(canonicalReceiptJSON(receipt));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value.trim())) {
    throw new Error("A receipt hash must contain exactly 64 hexadecimal characters.");
  }
  return value.trim().toLowerCase();
}

export function normalizeTxHash(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter the transaction hash.");
  const hash = value.trim().replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) throw new Error("A transaction hash must contain 64 hexadecimal characters.");
  return hash.toUpperCase();
}

export function anchorMemo(receiptHash: string): string {
  return `CHIT:v1:${normalizeHash(receiptHash)}`;
}

export function createReceiptRecord(receipt: unknown, receiptHash: string, txHash: string): ReceiptRecord {
  return { version: 1, chainId: CHAIN_ID, receipt: normalizeReceipt(receipt), receiptHash: normalizeHash(receiptHash), txHash: normalizeTxHash(txHash) };
}

export function serializeReceipt(record: ReceiptRecord, pretty = false): string {
  // Project the allowlisted schema instead of serializing arbitrary objects.
  const clean = createReceiptRecord(record.receipt, record.receiptHash, record.txHash);
  return JSON.stringify(clean, null, pretty ? 2 : undefined);
}

/** Accept a Chit envelope, or flat receipt JSON accompanied by a transaction hash. */
export function parseReceiptPayload(payload: string, txHashOverride = ""): ImportedReceipt {
  if (!payload.trim()) throw new Error("Paste receipt JSON or scan a Chit QR and paste its text.");
  if (payload.length > MAX_PAYLOAD_LENGTH) throw new Error("Receipt JSON is too large. Only small, non-identifying JSON receipts are accepted.");
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error("This is not valid receipt JSON. QR payloads contain JSON, not an image or a URL."); }
  if (!isObject(parsed)) throw new Error("Receipt JSON must be an object.");
  const nested = Object.prototype.hasOwnProperty.call(parsed, "receipt");
  onlyKeys(parsed, nested
    ? ["version", "chainId", "receipt", "receiptHash", "txHash"]
    : [...RECEIPT_KEYS, "version", "chainId", "receiptHash", "txHash"]);
  if (parsed.version !== undefined && parsed.version !== 1) throw new Error("Unsupported Chit schema version.");
  if (parsed.chainId !== undefined && parsed.chainId !== CHAIN_ID) throw new Error("This receipt belongs to another chain. Chit verifies qorechain-diana only.");
  const receiptValue = nested ? parsed.receipt : Object.fromEntries(RECEIPT_KEYS.filter((key) => parsed[key] !== undefined).map((key) => [key, parsed[key]]));
  const receipt = normalizeReceipt(receiptValue);
  const txHash = normalizeTxHash(txHashOverride.trim() || parsed.txHash);
  if (txHashOverride.trim() && parsed.txHash !== undefined && normalizeTxHash(parsed.txHash) !== txHash) {
    throw new Error("The supplied transaction hash conflicts with the hash in the receipt JSON.");
  }
  return { receipt, txHash, ...(parsed.receiptHash !== undefined ? { receiptHash: normalizeHash(parsed.receiptHash) } : {}) };
}

function browserStorage(): ReceiptStorage {
  try { return globalThis.localStorage; } catch { throw new Error("Browser storage is unavailable. Enable local storage before issuing a Chit."); }
}

export function loadReceipts(storage: ReceiptStorage = browserStorage()): ReceiptRecord[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records) || records.length > MAX_SAVED_RECEIPTS) throw new Error("Invalid store");
    const parsed = records.map((record: unknown) => {
      if (!isObject(record) || record.version !== 1 || record.chainId !== CHAIN_ID || record.receiptHash === undefined) throw new Error("Invalid stored record");
      const imported = parseReceiptPayload(JSON.stringify(record));
      return createReceiptRecord(imported.receipt, imported.receiptHash!, imported.txHash);
    });
    if (new Set(parsed.map((record) => record.receipt.receiptCode)).size !== parsed.length) throw new Error("Duplicate codes");
    return parsed;
  } catch {
    throw new Error("Saved Chits could not be read. Storage may be blocked or corrupted; existing data has not been overwritten. Import an exported receipt JSON to verify it.");
  }
}

export function ensureReceiptStorage(receiptCode: string, storage: ReceiptStorage = browserStorage()): void {
  const records = loadReceipts(storage);
  if (records.some((record) => record.receipt.receiptCode === receiptCode.toUpperCase())) throw new Error("That receipt code is already saved. Generate a new code before issuing.");
  if (loadPendingReceipts(storage).some((record) => record.receipt.receiptCode === receiptCode.toUpperCase())) throw new Error("That code has an unresolved submission. Recover its transaction hash instead of issuing it again.");
  if (records.length >= MAX_SAVED_RECEIPTS) throw new Error("This browser has reached its 250-Chit storage limit. Export and remove old receipts before issuing.");
  const probe = `${STORAGE_KEY}.probe`;
  try {
    storage.setItem(probe, "1");
    if (storage.getItem(probe) !== "1") throw new Error("Storage not writable");
    storage.removeItem(probe);
  } catch {
    throw new Error("Local storage is not writable. No transaction was sent. Enable browser storage before issuing a Chit.");
  }
}

export function saveReceipt(record: ReceiptRecord, storage: ReceiptStorage = browserStorage()): ReceiptRecord[] {
  const clean = createReceiptRecord(record.receipt, record.receiptHash, record.txHash);
  const records = loadReceipts(storage);
  const index = records.findIndex((entry) => entry.receipt.receiptCode === clean.receipt.receiptCode);
  if (index >= 0) {
    if (serializeReceipt(records[index]) !== serializeReceipt(clean)) throw new Error("A different Chit already uses this code. It was not overwritten; export this receipt JSON to preserve it.");
    return records;
  }
  if (records.length >= MAX_SAVED_RECEIPTS) throw new Error("Storage is full. Export this receipt JSON immediately; the transaction must not be sent again.");
  try {
    const serialized = JSON.stringify([...records, clean]);
    storage.setItem(STORAGE_KEY, serialized);
    if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error("Receipt write was not retained");
  } catch {
    throw new Error("The transaction was submitted, but local storage failed. Download this receipt JSON now; do not issue it again.");
  }
  return [...records, clean];
}

export function removeReceipt(receiptCode: string, storage: ReceiptStorage = browserStorage()): ReceiptRecord[] {
  const records = loadReceipts(storage).filter((entry) => entry.receipt.receiptCode !== receiptCode);
  try {
    const serialized = JSON.stringify(records);
    storage.setItem(STORAGE_KEY, serialized);
    if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error("Removal was not retained");
  } catch { throw new Error("Browser storage could not be updated."); }
  return records;
}

export function serializePendingReceipt(record: PendingReceipt, pretty = true): string {
  return JSON.stringify({ version: 1, chainId: CHAIN_ID, receipt: normalizeReceipt(record.receipt), receiptHash: normalizeHash(record.receiptHash) }, null, pretty ? 2 : undefined);
}

export function loadPendingReceipts(storage: ReceiptStorage = browserStorage()): PendingReceipt[] {
  try {
    const raw = storage.getItem(PENDING_STORAGE_KEY);
    if (raw === null) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > MAX_SAVED_RECEIPTS) throw new Error("Invalid pending store");
    const parsed = entries.map((entry: unknown): PendingReceipt => {
      if (!isObject(entry) || entry.version !== 1 || entry.chainId !== CHAIN_ID) throw new Error("Invalid pending receipt");
      onlyKeys(entry, ["version", "chainId", "receipt", "receiptHash"]);
      return { version: 1, chainId: CHAIN_ID, receipt: normalizeReceipt(entry.receipt), receiptHash: normalizeHash(entry.receiptHash) };
    });
    if (new Set(parsed.map((entry) => entry.receipt.receiptCode)).size !== parsed.length) throw new Error("Duplicate pending codes");
    return parsed;
  } catch {
    throw new Error("Unresolved submissions could not be read. Existing drafts were not overwritten; do not blindly rebroadcast. Recover the transaction in QoreX or Explorer.");
  }
}

export function savePendingReceipt(receipt: ReceiptFields, receiptHash: string, storage: ReceiptStorage = browserStorage()): PendingReceipt {
  const clean: PendingReceipt = { version: 1, chainId: CHAIN_ID, receipt: normalizeReceipt(receipt), receiptHash: normalizeHash(receiptHash) };
  ensureReceiptStorage(clean.receipt.receiptCode, storage);
  const pending = loadPendingReceipts(storage);
  if (pending.length >= MAX_SAVED_RECEIPTS) throw new Error("Unresolved submission storage is full. Resolve or export the pending drafts before issuing.");
  try {
    storage.setItem(PENDING_STORAGE_KEY, JSON.stringify([...pending, clean]));
    if (!loadPendingReceipts(storage).some((entry) => entry.receipt.receiptCode === clean.receipt.receiptCode)) throw new Error("Draft not stored");
  } catch {
    throw new Error("Could not save the recovery draft. No transaction was sent. Enable local storage and try again.");
  }
  return clean;
}

export function clearPendingReceipt(receiptCode: string, storage: ReceiptStorage = browserStorage()): PendingReceipt[] {
  const pending = loadPendingReceipts(storage).filter((entry) => entry.receipt.receiptCode !== receiptCode);
  try {
    const serialized = JSON.stringify(pending);
    storage.setItem(PENDING_STORAGE_KEY, serialized);
    if (storage.getItem(PENDING_STORAGE_KEY) !== serialized) throw new Error("Draft removal was not retained");
  } catch { throw new Error("The pending recovery draft could not be cleared. Keep your receipt JSON; do not rebroadcast."); }
  return pending;
}

export function generateReceiptCode(existingCodes: readonly string[] = []): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error("A secure browser is required to generate a receipt code.");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    const code = `CHT-${String(value % 10_000).padStart(4, "0")}`;
    if (!existingCodes.includes(code)) return code;
  }
  throw new Error("Could not generate an unused receipt code. Try again.");
}

export function newReceipt(existingCodes: readonly string[] = []): ReceiptFields {
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return { receiptCode: generateReceiptCode(existingCodes), scanCategory: "Chest X-Ray", visitDate: localDate, facilityTag: "CLINIC-A", note: "" };
}
