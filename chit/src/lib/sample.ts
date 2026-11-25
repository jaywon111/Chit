import { hashReceipt, normalizeReceipt, normalizeTxHash, type ImportedReceipt, type ReceiptRecord } from "./receipt.js";

// Observed public Diana transaction, NOT a reconstructed or fabricated receipt.
// Its memo is a one-way commitment and does not contain the five receipt fields.
export const SAMPLE_TX_HASH = "79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD";
export const SAMPLE_EXPECTED_HASH = "7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727";
export const SAMPLE_ISSUER = "qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c";

/**
 * An existing, matching local original can make the sample a one-click receipt
 * demonstration. Never invent its fields or trust a stored/claimed receiptHash.
 * If the original is absent, the UI fetches live chain evidence only and clearly
 * withholds VERIFIED until the user supplies the matching exported receipt JSON.
 */
export async function resolveTestnetSample(records: readonly ReceiptRecord[]): Promise<ImportedReceipt | null> {
  for (const record of records) {
    if (normalizeTxHash(record.txHash) !== SAMPLE_TX_HASH) continue;
    const receipt = normalizeReceipt(record.receipt);
    const computed = await hashReceipt(receipt);
    if (computed === SAMPLE_EXPECTED_HASH) return { receipt, txHash: SAMPLE_TX_HASH, receiptHash: computed };
  }
  return null;
}
