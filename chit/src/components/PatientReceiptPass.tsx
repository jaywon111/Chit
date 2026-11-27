import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Icon } from "./Icon.js";
import { copyText } from "../lib/export.js";
import type { ReceiptFields } from "../lib/receipt.js";

const QR_SIZE = 544;
const SITE = "chit-pink.vercel.app";
const TITLE = "CHIT · RECEIPT PASS";

function drawPass(qr: HTMLCanvasElement, receipt: ReceiptFields): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1032;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 800, 1032);
  ctx.fillStyle = "#15803D";
  ctx.fillRect(0, 0, 800, 120);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = "800 48px system-ui, sans-serif";
  ctx.fillText(TITLE, 400, 77);

  ctx.fillStyle = "#18181B";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText("Scan to check this receipt", 400, 163);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (800 - QR_SIZE) / 2, 184, QR_SIZE, QR_SIZE);

  ctx.fillStyle = "#D4D4D8";
  ctx.fillRect(56, 752, 688, 2);
  const rows = [["Receipt ID", receipt.receiptCode], ["Date", receipt.visitDate], ["Type", receipt.scanCategory]];
  rows.forEach(([label, value], index) => {
    const y = 804 + 53 * index;
    ctx.fillStyle = "#18181B";
    ctx.textAlign = "left";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText(label, 56, y);
    ctx.textAlign = "right";
    ctx.font = "800 32px system-ui, sans-serif";
    ctx.fillText(value, 744, y, 468);
  });
  ctx.fillStyle = "#15803D";
  ctx.textAlign = "center";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText(SITE, 400, 988);
  return canvas;
}

export function PatientReceiptPass({ receipt, verificationLink }: { receipt: ReceiptFields; verificationLink: string }): JSX.Element {
  const qr = useRef<HTMLCanvasElement>(null);
  const [png, setPng] = useState<Blob | null>(null);
  const [imageError, setImageError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState("");
  const [showLink, setShowLink] = useState(false);
  const filename = `chit-${receipt.receiptCode.slice(4).toLowerCase()}-${receipt.visitDate}.png`;

  useEffect(() => {
    if (!qr.current) return;
    let live = true;
    try {
      // Prepare the file before a click so sharing can use the same user gesture.
      drawPass(qr.current, receipt).toBlob((blob) => {
        if (!live) return;
        if (blob) setPng(blob);
        else setImageError(true);
      }, "image/png");
    } catch { setImageError(true); }
    return () => { live = false; };
  }, [receipt, verificationLink]);

  function saveImage(): void {
    if (!png) return;
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      url = URL.createObjectURL(png);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
    } catch { setNotice("Couldn’t download the image here. You can still share the pass link."); }
    finally {
      link.remove();
      if (url) window.setTimeout(URL.revokeObjectURL, 10_000, url);
    }
  }

  async function copyLink(): Promise<void> {
    try { await copyText(verificationLink); setNotice("Pass link copied. Send it to the patient."); setShowLink(false); }
    catch { setNotice("Couldn’t copy automatically. You can copy the pass link below."); setShowLink(true); }
  }

  async function sharePass(): Promise<void> {
    if (sharing) return;
    setNotice("");
    setSharing(true);
    try {
      if (navigator.share) {
        const linkData = { title: "Chit Receipt Pass", url: verificationLink };
        try {
          const withImage = png && typeof File === "function"
            ? { ...linkData, files: [new File([png], filename, { type: "image/png" })] }
            : null;
          await navigator.share(withImage && navigator.canShare?.(withImage) ? withImage : linkData);
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }
      await copyLink();
    } finally { setSharing(false); }
  }

  return <section className="panel patient-pass" aria-labelledby="patient-pass-heading">
    <div className="pass-intro"><h2 id="patient-pass-heading">Patient Receipt Pass</h2><p>Give the patient this image or send a link. They can check it without a wallet.</p></div>
    <div className="pass-face">
      <p className="pass-strip">{TITLE}</p>
      <div className="pass-matrix">
        <QRCodeCanvas ref={qr} size={QR_SIZE} value={verificationLink} level="M" marginSize={4} bgColor="#FFFFFF" fgColor="#18181B" style={{ width: "100%", maxWidth: 300, height: "auto" }} role="img" aria-label="QR code to check this Chit receipt" />
      </div>
      <dl className="pass-facts">
        <div><dt>Receipt ID</dt><dd>{receipt.receiptCode}</dd></div>
        <div><dt>Date</dt><dd><time dateTime={receipt.visitDate}>{receipt.visitDate}</time></dd></div>
        <div><dt>Type</dt><dd>{receipt.scanCategory}</dd></div>
      </dl>
      <p className="pass-site">{SITE}</p>
    </div>
    <div className="pass-actions">
      <button className="button primary" type="button" disabled={!png} onClick={saveImage}><Icon name="download" size={18} /> Save Pass Image (PNG)</button>
      <button className="button secondary" type="button" disabled={sharing} onClick={() => { void sharePass(); }}><Icon name="external" size={18} /> Share Pass</button>
    </div>
    <button className="text-button" type="button" disabled={sharing} onClick={() => { void copyLink(); }}><Icon name="copy" size={16} /> Copy verification link</button>
    {imageError && <p className="scan-status" role="status">The image couldn’t be prepared here. You can still share the pass link.</p>}
    {notice && <p className="scan-status" role="status">{notice}</p>}
    {showLink && <div className="field"><label htmlFor="pass-share-link">Pass link</label><input id="pass-share-link" value={verificationLink} readOnly onFocus={(event) => event.currentTarget.select()} /></div>}
  </section>;
}
