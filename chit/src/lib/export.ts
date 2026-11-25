export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try a user-gesture fallback below. */ }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.setAttribute("aria-hidden", "true");
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  const activeElement = document.activeElement;
  document.body.appendChild(input);
  input.select();
  let success = false;
  try { success = document.execCommand("copy"); } finally {
    input.remove();
    if (activeElement instanceof HTMLElement) activeElement.focus();
  }
  if (!success) throw new Error("Clipboard access is blocked. Select and copy the receipt JSON below manually.");
}

export function downloadText(filename: string, content: string, mime = "application/json"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadQR(svgId: string, receiptCode: string): void {
  const svg = document.getElementById(svgId);
  if (!(svg instanceof SVGSVGElement)) throw new Error("The receipt QR is not ready to download.");
  downloadText(`${receiptCode}-qr.svg`, new XMLSerializer().serializeToString(svg), "image/svg+xml");
}
