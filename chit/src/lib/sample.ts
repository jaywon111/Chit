import { hashReceipt, normalizeReceipt, normalizeTxHash, type ImportedReceipt, type ReceiptFields } from "./receipt.js";

// Public Diana transaction and its reference commitment. Neither is local proof:
// Verify must fetch the actual transaction and recompute the editable receipt.
export const SAMPLE_TX_HASH = "79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD";
export const SAMPLE_EXPECTED_HASH = "7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727";
export const SAMPLE_ISSUER = "qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c";

// Supplied non-identifying original fields, not guessed from a one-way hash.
// 11/25/2026 is represented as 2026-11-25 for the unchanged v1 ISO-date schema.
export const SAMPLE_RECEIPT: Readonly<ReceiptFields> = Object.freeze({
  receiptCode: "CHT-4671",
  scanCategory: "Chest X-Ray",
  visitDate: "2026-11-25",
  facilityTag: "CLINIC-A",
  note: "Follow-up visit",
});

/**
 * Load a fresh, strictly normalized copy independently of browser storage.
 * Always compute its real SHA-256; never substitute SAMPLE_EXPECTED_HASH or
 * reject a mismatch before the UI can show both digests and the tamper editor.
 * This only prepares receipt input. Live Diana evidence is still required.
 */
export async function resolveTestnetSample(): Promise<ImportedReceipt> {
  const receipt = normalizeReceipt(SAMPLE_RECEIPT);
  return { receipt, txHash: normalizeTxHash(SAMPLE_TX_HASH), receiptHash: await hashReceipt(receipt) };
}
