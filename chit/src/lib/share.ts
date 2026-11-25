import type { ImportedReceipt } from "./receipt.js";
import { normalizeReceipt, normalizeTxHash } from "./receiptSchema.js";

// The largest legal v1 tuple is much smaller. Bound untrusted input before
// base64 decoding, UTF-8 decoding, or JSON parsing, including whitespace.
const MAX_SHARE_BYTES = 2_048;
const MAX_ENCODED_LENGTH = Math.ceil(MAX_SHARE_BYTES / 3) * 4;
const MAX_LINK_LENGTH = 4_096;
const VERIFY_PREFIX = "#verify=";

type VerificationTuple = [1, string, string, string, string, string, string];

function base64url(bytes: Uint8Array): string {
  return globalThis.btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeTuple(encoded: string): ImportedReceipt {
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH) throw new Error("The verification fragment is empty or too large.");
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || encoded.length % 4 === 1) {
    throw new Error("Malformed verification fragment: use canonical, unpadded base64url.");
  }
  let tuple: unknown;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(globalThis.atob(padded), (char) => char.charCodeAt(0));
    if (bytes.length > MAX_SHARE_BYTES) throw new Error("Too large");
    // Reject non-zero padding bits, not merely strings that atob happens to accept.
    if (base64url(bytes) !== encoded) throw new Error("Non-canonical base64url");
    const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    tuple = JSON.parse(json);
  } catch {
    throw new Error("Malformed verification fragment: expected a small UTF-8 receipt tuple.");
  }
  if (!Array.isArray(tuple) || tuple.length !== 7) {
    throw new Error("A verification fragment must contain exactly the seven v1 tuple values; extra metadata and patient data are not accepted.");
  }
  if (tuple[0] !== 1) throw new Error("Unsupported Chit verification link version.");
  if (tuple.slice(1).some((value) => typeof value !== "string")) throw new Error("All verification receipt fields and the transaction hash must be text.");
  const [, receiptCode, scanCategory, visitDate, facilityTag, note, txHash] = tuple as VerificationTuple;
  return { receipt: normalizeReceipt({ receiptCode, scanCategory, visitDate, facilityTag, note }), txHash: normalizeTxHash(txHash) };
}

/** Return null only for an unrelated/missing fragment; malformed verify data throws. */
export function decodeVerificationFragment(hash: string): ImportedReceipt | null {
  if (typeof hash !== "string") throw new Error("The verification fragment must be text.");
  const hasVerify = /(?:^#|[&#])verify(?=[=&#%]|$)/u.test(hash);
  if (!hasVerify) {
    if (/^verify(?:=|$)/u.test(hash)) throw new Error("A verification fragment must start with #verify=.");
    return null;
  }
  if (!hash.startsWith(VERIFY_PREFIX)) throw new Error("Use only a single #verify= fragment, without other fragment parameters.");
  return decodeTuple(hash.slice(VERIFY_PREFIX.length));
}

function httpURL(text: string): URL {
  if (!text || text.length > MAX_LINK_LENGTH) throw new Error("The verification URL is empty or too large.");
  const trimmed = text.trim();
  if (!/^https?:\/\//iu.test(trimmed) || /[\u0000-\u001f\u007f]/u.test(trimmed)) {
    throw new Error("Use an HTTP(S) verification URL or a #verify= fragment.");
  }
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error("Malformed verification URL."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Verification URLs must use HTTP(S) without credentials.");
  }
  return url;
}

/** A link carries only five normalized non-identifying fields and the real tx hash. */
export function createVerificationLink(input: ImportedReceipt, baseUrl?: string): string {
  const receipt = normalizeReceipt(input?.receipt);
  const txHash = normalizeTxHash(input?.txHash);
  const tuple: VerificationTuple = [1, receipt.receiptCode, receipt.scanCategory, receipt.visitDate, receipt.facilityTag, receipt.note, txHash];
  const bytes = new TextEncoder().encode(JSON.stringify(tuple));
  if (bytes.length > MAX_SHARE_BYTES) throw new Error("The verification receipt is too large.");
  let base = baseUrl;
  if (base === undefined) {
    try { base = globalThis.location?.href; } catch { /* Browser location may be unavailable. */ }
  }
  if (typeof base !== "string") throw new Error("A verification base URL is required outside a browser.");
  const url = httpURL(base);
  // Never propagate arbitrary query values or a previous fragment into a share.
  url.search = "";
  url.hash = `${VERIFY_PREFIX}${base64url(bytes)}`;
  if (url.href.length > MAX_LINK_LENGTH) throw new Error("The verification URL is too large.");
  return url.href;
}

/** Parse locally. The supplied origin is never fetched, visited, or trusted as a node. */
export function parseVerificationLink(text: string): ImportedReceipt {
  if (typeof text !== "string" || !text.trim()) throw new Error("Paste an HTTP(S) verification URL or #verify= fragment.");
  if (text.length > MAX_LINK_LENGTH) throw new Error("The verification link is too large.");
  const trimmed = text.trim();
  const fragment = trimmed.startsWith("#") ? trimmed : httpURL(trimmed).hash;
  const input = decodeVerificationFragment(fragment);
  if (!input) throw new Error("This URL or fragment has no #verify= receipt.");
  return input;
}
