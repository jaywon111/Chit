// Shared, non-identifying validation. Keeping this independent of import/share
// dispatch avoids a runtime cycle between receipt.ts and share.ts.
export const SCAN_CATEGORIES = [
  "Chest X-Ray",
  "Pelvis X-Ray",
  "Limb X-Ray",
  "Ultrasound",
  "Non-Contrast CT",
  "Custom",
] as const;

// Only generic procedure labels can leave the custom input or appear in a receipt.
export const CUSTOM_SCAN_LABELS = [
  "Pelvic Ultrasound",
  "ECG",
  "Blood Panel",
  "Abdominal Ultrasound",
  "Doppler Ultrasound",
  "MRI",
  "Brain MRI",
  "Spine MRI",
  "Contrast CT",
  "Mammography",
  "Bone Density Scan",
  "Echocardiogram",
  "Complete Blood Count",
  "Urinalysis",
  "Spirometry",
] as const;

// Retain old values so existing v1 receipts keep the same canonical bytes.
// This is a controlled vocabulary, never a free-text clinical/PII field.
export const SAFE_NOTES = [
  "",
  "Visit completed",
  "Follow-up visit",
  "Receipt reissued",
  "Digital copy requested",
  "PA View · Standard",
  "AP / Lateral View",
  "Follow-Up Clearance",
  "Baseline Screening",
] as const;

export interface ReceiptFields {
  receiptCode: string;
  scanCategory: string;
  visitDate: string;
  facilityTag: string;
  note: string;
}

export const RECEIPT_KEYS = ["receiptCode", "scanCategory", "visitDate", "facilityTag", "note"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, optional = false): string {
  if (optional && value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function matchCustomScanLabel(value: string): string | undefined {
  const candidate = text(value, "Scan category").toLowerCase();
  return CUSTOM_SCAN_LABELS.find((label) => label.toLowerCase() === candidate);
}

/** Fixed alphabetical key order, NFC, trimmed/collapsed whitespace; no extra fields. */
export function normalizeReceipt(value: unknown): ReceiptFields {
  if (!isObject(value)) throw new Error("A receipt must be a JSON object.");
  if (Object.keys(value).some((key) => !(RECEIPT_KEYS as readonly string[]).includes(key))) {
    throw new Error("Unrecognized fields were rejected. Import only the five non-identifying receipt fields and Chit proof metadata; never patient data.");
  }
  const receiptCode = text(value.receiptCode, "Receipt code").toUpperCase();
  if (!/^CHT-[A-Z0-9]{4,8}$/.test(receiptCode)) {
    throw new Error("Use a receipt code such as CHT-4821 (4–8 letters or digits after CHT-). Do not use a patient identifier.");
  }
  const categoryText = text(value.scanCategory, "Scan category");
  if (!categoryText) throw new Error("Enter an approved custom scan or test type from the suggestions.");
  // Keep the bare "Custom" value valid for older v1 receipts; Issue requires a label.
  const scanCategory = SCAN_CATEGORIES.find((category) => category.toLowerCase() === categoryText.toLowerCase())
    ?? matchCustomScanLabel(categoryText);
  if (!scanCategory) throw new Error("Choose a supported imaging category or an approved custom scan or test type; never a diagnosis.");
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
