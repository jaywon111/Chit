// Synthetic format-signature fixtures only: no patient files, images, or chain proof.
import { createHash, webcrypto } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileFingerprint } from "../src/components/LocalFileFingerprint.js";
import { MAX_LOCAL_FILE_BYTES, fingerprintLocalFile } from "../src/lib/fileFingerprint.js";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nSYNTHETIC TEST ONLY\n%%EOF\n");
const PNG_BYTES = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3);
const JPEG_BYTES = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9);
const FORMATS = [
  { name: "synthetic.pdf", type: "application/pdf", bytes: PDF_BYTES, format: "PDF" },
  { name: "synthetic.png", type: "image/png", bytes: PNG_BYTES, format: "PNG" },
  { name: "synthetic.jpg", type: "image/jpeg", bytes: JPEG_BYTES, format: "JPEG" },
  { name: "synthetic.jpeg", type: "image/jpeg", bytes: JPEG_BYTES, format: "JPEG" },
] as const;

function localFile(name: string, type: string, bytes: Uint8Array, size = bytes.byteLength) {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return { name, type, size, arrayBuffer: vi.fn(async (): Promise<ArrayBuffer> => data) };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network is allowed in local fingerprint tests"); }));
  vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("sessionStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("local file SHA-256 fingerprints", () => {
  it.each(FORMATS)("hashes the exact $format bytes for $name with real WebCrypto", async ({ name, type, bytes, format }) => {
    const file = localFile(name, type, bytes);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const result = await fingerprintLocalFile(file);
    expect(result).toEqual({ hash: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength, format });
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(result)).toEqual(["hash", "bytes", "format"]);
    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest.mock.calls[0][0]).toBe("SHA-256");
    expect(new Uint8Array(digest.mock.calls[0][1] as ArrayBuffer)).toEqual(bytes);
  });

  it.each(FORMATS)("accepts case-insensitive $format extension and MIME metadata", async ({ name, type, bytes, format }) => {
    expect((await fingerprintLocalFile(localFile(name.toUpperCase(), type.toUpperCase(), bytes))).format).toBe(format);
  });

  it.each(FORMATS)("accepts omitted MIME only when the $format extension and magic bytes agree", async ({ name, bytes, format }) => {
    expect((await fingerprintLocalFile(localFile(name, "", bytes))).format).toBe(format);
  });

  it("hashes bytes, not names or metadata, and exposes only generic format/byte count/hash", async () => {
    const first = await fingerprintLocalFile(localFile("SYNTHETIC_PRIVATE_NAME.pdf", "application/pdf", PDF_BYTES));
    const second = await fingerprintLocalFile(localFile("another-test-only-name.PDF", "", PDF_BYTES));
    expect(second).toEqual(first);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("SYNTHETIC_PRIVATE_NAME");
    expect(serialized).not.toContain("application/pdf");
    expect(first).not.toHaveProperty("name");
    expect(first).not.toHaveProperty("type");
    expect(first).not.toHaveProperty("arrayBuffer");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    }
  });

  it("changes the hash when non-header file bytes change", async () => {
    const changed = PDF_BYTES.slice();
    changed[changed.length - 1] ^= 1;
    const original = await fingerprintLocalFile(localFile("synthetic.pdf", "application/pdf", PDF_BYTES));
    const replacement = await fingerprintLocalFile(localFile("synthetic.pdf", "application/pdf", changed));
    expect(replacement.hash).not.toBe(original.hash);
    expect(replacement.hash).toBe(createHash("sha256").update(changed).digest("hex"));
  });

  it("returns lowercase, zero-padded 64-character hex without a prefix", async () => {
    const digestBytes = Uint8Array.of(0, 1, 15, 16, 0xab, 0xff, ...Array<number>(26).fill(0));
    vi.spyOn(globalThis.crypto.subtle, "digest").mockResolvedValue(digestBytes.buffer as ArrayBuffer);
    const result = await fingerprintLocalFile(localFile("synthetic.pdf", "application/pdf", PDF_BYTES));
    expect(result.hash).toBe("00010f10abff" + "00".repeat(26));
  });
});

describe("local file validation before reading or digesting", () => {
  it.each([
    "synthetic", "synthetic.gif", "synthetic.svg", "synthetic.txt", "synthetic.pdf.exe",
    "synthetic.png.txt", "synthetic.pdf ", "synthetic.pdf\n", "synthetic.jpeg\r\n",
  ])("rejects unsupported or misleading extension %j before reading", async (name) => {
    const file = localFile(name, "application/pdf", PDF_BYTES);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/extensions are not accepted/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });

  it.each([
    "text/plain", "application/octet-stream", "image/jpeg", "image/png", "image/gif",
    "image/svg+xml", "application/pdf; charset=utf-8", "application/pdf\n",
  ])("rejects mismatched or unsupported MIME %j before reading", async (type) => {
    const file = localFile("synthetic.pdf", type, PDF_BYTES);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/MIME type does not match/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid/empty byte count %j before reading", async (size) => {
    const file = localFile("synthetic.pdf", "application/pdf", PDF_BYTES, size);
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/non-empty.*valid byte count/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects oversized files before arrayBuffer or digest and gives the explicit 32 MiB limit", async () => {
    expect(MAX_LOCAL_FILE_BYTES).toBe(32 * 1024 * 1024);
    const file = localFile("synthetic.pdf", "application/pdf", PDF_BYTES, MAX_LOCAL_FILE_BYTES + 1);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/32 MiB.*not read/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });

  it("checks the advertised size cap even before extension or WebCrypto availability", async () => {
    vi.stubGlobal("crypto", undefined);
    const file = localFile("synthetic.exe", "text/plain", PDF_BYTES, MAX_LOCAL_FILE_BYTES + 1);
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/32 MiB.*not read/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("allows a supported file exactly at the size cap", async () => {
    const data = new ArrayBuffer(MAX_LOCAL_FILE_BYTES);
    new Uint8Array(data).set(PNG_BYTES);
    const file = localFile("synthetic.png", "image/png", PNG_BYTES, MAX_LOCAL_FILE_BYTES);
    file.arrayBuffer.mockResolvedValue(data);
    const result = await fingerprintLocalFile(file);
    expect(result.bytes).toBe(MAX_LOCAL_FILE_BYTES);
    expect(result.format).toBe("PNG");
    expect(result.hash).toBe(createHash("sha256").update(new Uint8Array(data)).digest("hex"));
  });

  it("rejects actual bytes exceeding the cap even if supplied metadata understates the size", async () => {
    const file = localFile("synthetic.pdf", "application/pdf", PDF_BYTES);
    file.arrayBuffer.mockResolvedValue(new ArrayBuffer(MAX_LOCAL_FILE_BYTES + 1));
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/bytes exceed the 32 MiB/i);
    expect(digest).not.toHaveBeenCalled();
  });

  it("rejects a reported/actual byte count mismatch before returning a misleading count or hash", async () => {
    const file = localFile("synthetic.pdf", "application/pdf", PDF_BYTES, PDF_BYTES.byteLength - 1);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/do not match the reported byte count/i);
    expect(digest).not.toHaveBeenCalled();
  });

  it.each([
    { name: "synthetic.pdf", type: "application/pdf", bytes: new TextEncoder().encode("not a PDF") },
    { name: "synthetic.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%pdf-1.7") },
    { name: "synthetic.png", type: "image/png", bytes: PNG_BYTES.slice(0, 7) },
    { name: "synthetic.png", type: "image/png", bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0) },
    { name: "synthetic.jpg", type: "image/jpeg", bytes: Uint8Array.of(0xff, 0xd8) },
    { name: "synthetic.jpeg", type: "image/jpeg", bytes: Uint8Array.of(0xff, 0xd8, 0) },
  ])("rejects damaged/truncated magic bytes despite supported extension/MIME: $name", async ({ name, type, bytes }) => {
    const file = localFile(name, type, bytes);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/magic bytes.*not a supported/i);
    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(digest).not.toHaveBeenCalled();
  });

  it.each([
    { name: "synthetic.pdf", type: "application/pdf", bytes: PNG_BYTES },
    { name: "synthetic.png", type: "image/png", bytes: JPEG_BYTES },
    { name: "synthetic.jpg", type: "image/jpeg", bytes: PDF_BYTES },
  ])("rejects a detected signature inconsistent with its extension: $name", async ({ name, type, bytes }) => {
    const file = localFile(name, type, bytes);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/signature does not match its extension/i);
    expect(digest).not.toHaveBeenCalled();
  });
});

describe("local read and WebCrypto failures", () => {
  it.each([
    { label: "crypto", crypto: undefined },
    { label: "subtle", crypto: {} },
    { label: "digest", crypto: { subtle: {} } },
  ])("fails closed when WebCrypto $label is missing, without reading the file", async ({ crypto }) => {
    vi.stubGlobal("crypto", crypto);
    const file = localFile("synthetic.pdf", "application/pdf", PDF_BYTES);
    await expect(fingerprintLocalFile(file)).rejects.toThrow(/SHA-256 requires a secure browser context.*HTTPS or localhost/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("sanitizes file-read failures instead of exposing private names or returning a hash", async () => {
    const file = localFile("SYNTHETIC_PRIVATE_NAME.pdf", "application/pdf", PDF_BYTES);
    file.arrayBuffer.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_NAME.pdf cannot be read"));
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const error = await fingerprintLocalFile(file).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/local file could not be read/i);
    expect((error as Error).message).not.toContain("SYNTHETIC_PRIVATE_NAME");
    expect(error).not.toHaveProperty("cause");
    expect(digest).not.toHaveBeenCalled();
  });

  it.each([new Error("SYNTHETIC_PRIVATE_NAME.pdf"), new DOMException("SYNTHETIC_PRIVATE_NAME.pdf", "OperationError")])(
    "sanitizes a rejected WebCrypto digest without returning success", async (failure) => {
      vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValue(failure);
      const error = await fingerprintLocalFile(localFile("synthetic.pdf", "application/pdf", PDF_BYTES)).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/could not compute the local SHA-256 fingerprint/i);
      expect((error as Error).message).not.toContain("SYNTHETIC_PRIVATE_NAME");
      expect(error).not.toHaveProperty("cause");
    },
  );

  it.each([0, 31, 33])("fails closed on an unexpected %i-byte digest", async (length) => {
    vi.spyOn(globalThis.crypto.subtle, "digest").mockResolvedValue(new ArrayBuffer(length));
    await expect(fingerprintLocalFile(localFile("synthetic.pdf", "application/pdf", PDF_BYTES))).rejects.toThrow(/could not compute the local SHA-256 fingerprint/i);
  });
});

describe("independent optional local fingerprint drawer", () => {
  it("exports a closed native drawer, hides the file input, has no text/image inputs, and states its privacy/proof limits", () => {
    const markup = renderToStaticMarkup(createElement(LocalFileFingerprint));
    expect(markup).toContain('<details class="local-file-card panel">');
    expect(markup).toContain('<summary class="local-file-summary">');
    expect(markup).toContain('class="local-file-body"');
    expect(markup).toContain("Check Local File SHA-256");
    expect(markup).toContain("Optional");
    expect(markup).toContain("No file is uploaded. No image bytes touch the blockchain.");
    expect(markup).toContain("This hash does not authenticate the file or link it to a receipt anchor.");
    expect(markup).toMatch(/<input\b[^>]*type="file"[^>]*hidden=""[^>]*aria-hidden="true"/);
    expect(markup).toContain('accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"');
    expect(markup).not.toMatch(/<img\b|<textarea\b|type="text"|\sname="|<details[^>]*\sopen=/i);
    expect(markup).not.toContain("file-fingerprint-hash");
    expect(markup).not.toContain("Local fingerprint calculated");
  });
});
