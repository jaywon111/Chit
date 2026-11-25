export const MAX_LOCAL_FILE_BYTES = 32 * 1024 * 1024;

export interface FileFingerprint {
  hash: string;
  bytes: number;
  format: "PDF" | "PNG" | "JPEG";
}

const MIME_TYPES: Record<FileFingerprint["format"], string> = {
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
};

function extensionFormat(name: string): FileFingerprint["format"] | null {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (extension === ".pdf") return "PDF";
  if (extension === ".png") return "PNG";
  if (extension === ".jpg" || extension === ".jpeg") return "JPEG";
  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function detectedFormat(bytes: Uint8Array): FileFingerprint["format"] | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "PDF"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "PNG";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "JPEG";
  return null;
}

/**
 * Browser-only SHA-256 of the exact file bytes. Signature checks screen formats;
 * they do not authenticate content or connect it to any receipt or chain anchor.
 * No file name, MIME value, or file bytes are returned, uploaded, or persisted.
 */
export async function fingerprintLocalFile(
  file: Pick<File, "name" | "type" | "size" | "arrayBuffer">,
): Promise<FileFingerprint> {
  const bytes = file.size;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error("Choose a non-empty PDF, PNG, or JPEG file with a valid byte count.");
  }
  if (bytes > MAX_LOCAL_FILE_BYTES) {
    throw new Error("This file exceeds the 32 MiB (33,554,432 byte) limit. It was not read. Choose a smaller PDF, PNG, or JPEG file.");
  }

  const expectedFormat = extensionFormat(file.name);
  if (!expectedFormat) {
    throw new Error("Choose a PDF (.pdf), PNG (.png), or JPEG (.jpg or .jpeg) file. Other extensions are not accepted.");
  }
  // Some browsers omit MIME metadata; extension and magic bytes must still agree.
  const mime = file.type.toLowerCase();
  if (mime && mime !== MIME_TYPES[expectedFormat]) {
    throw new Error("The file's MIME type does not match its PDF, PNG, or JPEG extension. Choose a matching supported file.");
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("SHA-256 requires a secure browser context. Open Chit over HTTPS or localhost.");
  }

  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    // Browser/reader errors can contain private metadata; never relay them.
    throw new Error("The local file could not be read. Select it again or choose another supported file.");
  }
  if (data.byteLength > MAX_LOCAL_FILE_BYTES) {
    throw new Error("The local file bytes exceed the 32 MiB (33,554,432 byte) limit. Choose a smaller supported file.");
  }
  if (data.byteLength !== bytes) {
    throw new Error("The local file bytes do not match the reported byte count. Select the file again.");
  }

  const format = detectedFormat(new Uint8Array(data));
  if (!format) {
    throw new Error("The file's magic bytes are not a supported PDF, PNG, or JPEG signature.");
  }
  if (format !== expectedFormat) {
    throw new Error("The detected file signature does not match its extension. Choose a matching PDF, PNG, or JPEG file.");
  }

  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest("SHA-256", data);
    if (digest.byteLength !== 32) throw new Error("Unexpected digest length");
  } catch {
    throw new Error("Could not compute the local SHA-256 fingerprint. Try again in a secure browser context.");
  }
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, bytes, format };
}
