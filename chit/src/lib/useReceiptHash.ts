import { useEffect, useState } from "react";
import { canonicalReceiptJSON, hashReceipt, type ReceiptFields } from "./receipt.js";

export function useReceiptHash(receipt: ReceiptFields | null): { hash: string | null; error: string | null; canonical: string | null } {
  let canonical: string | null = null;
  let validationError: string | null = null;
  if (receipt) {
    try { canonical = canonicalReceiptJSON(receipt); } catch (error) { validationError = error instanceof Error ? error.message : "Invalid receipt fields."; }
  }
  const [result, setResult] = useState<{ canonical: string; hash: string | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!canonical) return;
    let current = true;
    const snapshot = canonical;
    void hashReceipt(JSON.parse(snapshot)).then(
      (hash) => { if (current) setResult({ canonical: snapshot, hash, error: null }); },
      (error: unknown) => { if (current) setResult({ canonical: snapshot, hash: null, error: error instanceof Error ? error.message : "Could not compute SHA-256." }); },
    );
    return () => { current = false; };
  }, [canonical]);
  // Never show the last receipt's hash (or VERIFIED badge) during an async edit.
  const matches = result?.canonical === canonical;
  return { canonical, hash: matches ? result?.hash ?? null : null, error: validationError ?? (matches ? result?.error ?? null : null) };
}
