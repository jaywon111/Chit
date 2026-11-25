import { useRef, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "./Icon.js";
import { ReceiptFieldsForm } from "./ReceiptFieldsForm.js";
import { anchorReceipt, AnchorSubmissionUnknownError, SubmittedAnchorError, type WalletConnection } from "../lib/qorex.js";
import { CHAIN_ID, EXPLORER_URL, explorerTxUrl } from "../lib/network.js";
import { clearPendingReceipt, createReceiptRecord, ensureReceiptStorage, generateReceiptCode, hashReceipt, loadPendingReceipts, loadReceipts, newReceipt, normalizeReceipt, savePendingReceipt, saveReceipt, serializePendingReceipt, serializeReceipt, type PendingReceipt, type ReceiptFields, type ReceiptRecord } from "../lib/receipt.js";
import { copyText, downloadQR, downloadText } from "../lib/export.js";
import { useReceiptHash } from "../lib/useReceiptHash.js";
import { createVerificationLink } from "../lib/share.js";

function initialReceipt(codes: readonly string[]): ReceiptFields {
  try { return newReceipt(codes); } catch {
    return { receiptCode: "CHT-0000", scanCategory: "Chest X-Ray", visitDate: new Date().toISOString().slice(0, 10), facilityTag: "CLINIC-A", note: "" };
  }
}

export function IssueView({ wallet, connect, knownCodes, pendingReceipts, onRefresh, onVerify }: {
  wallet: WalletConnection | null;
  connect: () => Promise<WalletConnection>;
  knownCodes: string[];
  pendingReceipts: PendingReceipt[];
  onRefresh: () => void;
  onVerify: (receipt: ReceiptRecord | PendingReceipt) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<ReceiptFields>(() => initialReceipt(knownCodes));
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [phase, setPhase] = useState<"idle" | "hashing" | "wallet" | "broadcasting" | "submitted" | "unknown">("idle");
  const [issued, setIssued] = useState<ReceiptRecord | null>(null);
  const [unresolved, setUnresolved] = useState<PendingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const hash = useReceiptHash(draft);
  const busy = phase === "hashing" || phase === "wallet" || phase === "broadcasting";
  const finished = issued !== null || unresolved !== null;

  function freshCode(): void {
    try {
      const codes = [...loadReceipts(), ...loadPendingReceipts()].map((entry) => entry.receipt.receiptCode);
      setDraft((receipt) => ({ ...receipt, receiptCode: generateReceiptCode(codes) }));
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not generate a code."); }
  }

  function startNew(): void {
    try {
      const codes = [...loadReceipts(), ...loadPendingReceipts()].map((entry) => entry.receipt.receiptCode);
      setDraft(newReceipt(codes));
      setIssued(null); setUnresolved(null); setPrivacyAccepted(false); setStorageNotice(null); setError(null); setCopyNotice(""); setSaved(false); setPhase("idle"); locked.current = false;
    } catch (err) { setError(err instanceof Error ? err.message : "Browser recovery storage could not be read."); }
  }

  function retainSubmitted(receipt: ReceiptFields, receiptHash: string, txHash: string, notice?: string): void {
    const record = createReceiptRecord(receipt, receiptHash, txHash);
    // Set recovery output before touching storage; a quota failure must not hide
    // a real transaction hash or trigger a second wallet transaction.
    setIssued(record); setPhase("submitted"); setError(notice ?? null);
    try {
      saveReceipt(record); setSaved(true);
      clearPendingReceipt(record.receipt.receiptCode, undefined, record);
    } catch (err) { setStorageNotice(err instanceof Error ? err.message : "Download this receipt JSON immediately to preserve the proof."); }
    onRefresh();
  }

  async function issue(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setError(null); setStorageNotice(null); setCopyNotice("");
    let recovery: PendingReceipt | null = null;
    try {
      if (!privacyAccepted) throw new Error("Confirm that all receipt fields are non-identifying before continuing.");
      const receipt = normalizeReceipt(draft);
      ensureReceiptStorage(receipt.receiptCode);
      setPhase("hashing");
      const receiptHash = await hashReceipt(receipt);
      setDraft(receipt);
      setPhase("wallet");
      const connection = wallet ?? await connect();
      recovery = savePendingReceipt(receipt, receiptHash);
      onRefresh();
      setPhase("broadcasting");
      const result = await anchorReceipt(connection, receiptHash);
      retainSubmitted(receipt, receiptHash, result.txHash);
      // The lock deliberately stays set. New Chit makes a new, unused code.
    } catch (err) {
      if (err instanceof SubmittedAnchorError && recovery) {
        retainSubmitted(recovery.receipt, recovery.receiptHash, err.txHash, err.message);
      } else if (err instanceof AnchorSubmissionUnknownError && recovery) {
        setUnresolved(recovery); setPhase("unknown");
        setError("QoreX did not return a transaction hash. A transaction may have been submitted. This draft is saved; find its hash in QoreX history or Explorer before trying anything again.");
        onRefresh();
      } else {
        const message = err instanceof Error ? err.message : "QoreX could not issue this receipt.";
        if (recovery) {
          try { clearPendingReceipt(recovery.receipt.receiptCode, undefined, recovery); } catch {
            setUnresolved(recovery); setPhase("unknown"); setError(`${message} The recovery draft could not be cleared. Resolve it before reissuing.`); onRefresh(); return;
          }
        }
        setPhase("idle"); setError(message); locked.current = false; onRefresh();
      }
    }
  }

  async function copyJSON(): Promise<void> {
    try {
      if (issued) await copyText(serializeReceipt(issued, true));
      else if (unresolved) await copyText(serializePendingReceipt(unresolved));
      setCopyNotice("Receipt JSON copied.");
    } catch (err) { setCopyNotice(err instanceof Error ? err.message : "Could not copy JSON."); }
  }

  async function copyVerificationLink(): Promise<void> {
    if (!issued) return;
    try { await copyText(createVerificationLink(issued)); setCopyNotice("Self-contained verification link copied. It contains only the five receipt fields and transaction hash."); }
    catch (err) { setCopyNotice(err instanceof Error ? err.message : "Could not copy the verification link. Export JSON instead."); }
  }

  const progressText = phase === "hashing" ? "Computing SHA-256…" : phase === "wallet" ? "Connecting QoreX…" : phase === "broadcasting" ? "Confirm the hybrid transaction in QoreX…" : "";
  const ticketReceipt = issued?.receipt ?? unresolved?.receipt ?? draft;
  const ticketHash = issued?.receiptHash ?? unresolved?.receiptHash ?? hash.hash;
  let verificationLink: string | null = null;
  let linkError: string | null = null;
  try { if (issued) verificationLink = createVerificationLink(issued); }
  catch (err) { linkError = err instanceof Error ? err.message : "Verification link unavailable. Keep the exported JSON."; }

  return <section className="page issue-page" aria-labelledby="issue-heading">
    <div className="page-heading">
      <div><div className="eyebrow">ISSUANCE / HASH COMMITMENT</div><h1 id="issue-heading">Issue a receipt<span className="heading-period">.</span></h1><p>Controlled parameters. Local SHA-256. One QoreX hybrid-signed anchor.</p></div>
      <span className="instrument-tag"><Icon name="lock" size={15} /> HASH ONLY / ON-CHAIN</span>
    </div>
    <div className="instrument-metrics" aria-label="Receipt protocol specifications"><div><span>RECEIPT SCHEMA</span><strong>v1 <small>/ 5 fields</small></strong></div><div><span>COMMITMENT</span><strong>SHA-256 <small>/ 32 B</small></strong></div><div><span>SIGNING LANE</span><strong>Hybrid <small>/ 1 tx</small></strong></div></div>

    <div className="issue-grid">
      <form className="panel receipt-panel" onSubmit={(event) => { void issue(event); }}>
        <div className="panel-heading"><div><div className="section-number">CONTROLLED INPUT / ZERO PII</div><h2>Receipt parameters</h2><p>Non-identifying descriptors only.</p></div><span className="panel-icon"><Icon name="receipt" size={23} /></span></div>
        <div className="code-tools"><span><span className="status-dot" /> Generated on your device</span><button className="text-button" type="button" onClick={freshCode} disabled={busy || finished}><Icon name="refresh" size={14} /> New code</button></div>
        <ReceiptFieldsForm value={draft} onChange={setDraft} disabled={busy || finished} idPrefix="issue" />
        <div className="privacy-box"><Icon name="lock" size={19} /><div><strong>Data boundary</strong><p>Never enter patient identifiers, names, diagnoses, medical images, or phone numbers. Only the hash goes on-chain. Receipt JSON and shared links are plaintext.</p></div></div>
        <label className="consent-check"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} disabled={busy || finished} /><span>I’m using only generic, non-identifying receipt fields.</span></label>
        {(error || hash.error) && <div className="alert error-alert" role="alert"><Icon name="alert" size={19} /><span>{error || hash.error}</span></div>}
        {storageNotice && <div className="alert warning-alert" role="alert"><Icon name="download" size={19} /><span>{storageNotice}</span></div>}
        <div className="form-actions">
          {issued ? <button type="button" className="button primary" onClick={() => onVerify(issued)}><Icon name="shield" /> Verify this Chit <Icon name="arrow" size={18} /></button> : <button type="submit" className="button primary" disabled={busy || finished || !privacyAccepted || !!hash.error}>{busy ? <span className="spinner" /> : <Icon name={wallet ? "receipt" : "wallet"} />}{busy ? progressText : unresolved ? "Submission needs recovery" : wallet ? "Issue Chit" : "Connect QoreX & issue"}{!busy && !finished && <Icon name="arrow" size={18} />}</button>}
          {finished && <button className="button secondary" type="button" onClick={startNew}><Icon name="plus" size={17} /> Create a new Chit</button>}
        </div>
        <p className="fee-note"><Icon name="info" size={15} /><span>One native hybrid-signed transaction: 1 uqor (0.000001 QOR) back to your own wallet, plus the gas fee shown by QoreX. An existing ML-DSA-87 registration is required; Chit never bootstraps it.</span></p>
      </form>

      <aside className="preview-column" aria-label="Receipt preview and export">
        <div className={`ticket ${issued ? "ticket-issued" : ""}`}>
          <div className="ticket-registration" aria-hidden="true"><span>+</span><span>+</span></div>
          <div className="ticket-top"><span className="ticket-brand">chit<span>.</span></span><div className="ticket-tracking"><span>CRYPTOGRAPHIC RECEIPT</span><strong>SCHEMA v1 / DIANA</strong></div><span className="ticket-status">{issued ? "SUBMITTED" : unresolved ? "UNRESOLVED" : "DRAFT"}</span></div>
          <div className="ticket-code"><span>RECOVERY SERIAL / SPECIMEN TICKET</span><strong>{ticketReceipt.receiptCode}</strong><p>{issued ? "Submission retained. Verify live chain evidence before relying on this receipt." : unresolved ? "Uncertain outcome. Recover the transaction hash; do not rebroadcast." : "PREVIEW / NOT AN ISSUED OR VERIFIED RECEIPT"}</p></div>
          <div className="ticket-divider" />
          {issued && verificationLink ? <><div className="qr-wrap"><QRCodeSVG id="issued-chit-qr" value={verificationLink} size={280} level="M" marginSize={4} bgColor="#ffffff" fgColor="#171c1a" title={`Chit ${issued.receipt.receiptCode} self-contained verification link`} /></div><p className="qr-caption">SCAN TO VERIFY / NO WALLET REQUIRED<br /><span>Receipt fields + transaction hash. Nothing uploaded.</span></p></> : <div className="preview-qr-placeholder"><span><Icon name={unresolved ? "clock" : "qr"} size={38} /></span><p>{issued ? "QR link unavailable — export receipt JSON" : unresolved ? "AWAITING TRANSACTION HASH" : "QR GENERATED AFTER SUBMISSION"}</p><small>{issued ? "The real transaction hash remains exportable below." : "No fabricated transaction or signature."}</small></div>}
          <dl className="ticket-fields"><div><dt>CATEGORY</dt><dd>{ticketReceipt.scanCategory}</dd></div><div><dt>VISIT DATE</dt><dd>{ticketReceipt.visitDate || "Not set"}</dd></div><div><dt>FACILITY TAG</dt><dd>{ticketReceipt.facilityTag || "Not set"}</dd></div><div><dt>VIEW / CONTEXT</dt><dd>{ticketReceipt.note || "Not specified"}</dd></div></dl>
          <div className="ticket-hash"><div><Icon name="hash" size={14} /> SHA-256 COMMITMENT <span>32 B</span></div><code>{ticketHash ?? (hash.error ? "Waiting for valid receipt fields" : "Computing locally…")}</code><small>CHIT:v1 / canonical five-field JSON</small></div>
          <div className="ticket-attestation"><Icon name="shield" size={19} /><div><span>{issued ? "SIGNATURE SPECIFICATION / VERIFY ON-CHAIN" : "REQUIRED SIGNATURE SPECIFICATION"}</span><strong>NIST FIPS 204 · ML-DSA-87 · 4,627 B</strong><small>Hybrid with secp256k1. A badge is not verification.</small></div></div>
          <div className="ticket-footer"><span>{CHAIN_ID}</span><span>HASH INTEGRITY / NOT CLINICAL TRUTH</span></div>
        </div>

        {issued && <div className="export-panel">
          <div className={`local-save-status ${saved ? "" : "save-warning"}`}><Icon name={saved ? "check" : "alert"} size={17} /><span>{saved ? "Saved on this browser · recover by code" : "Export now to preserve your receipt"}</span></div>
          <button className="button ink-button full-width" type="button" disabled={!verificationLink} onClick={() => { void copyVerificationLink(); }}><Icon name="copy" size={17} /> Copy Verification Link <Icon name="arrow" size={16} /></button>
          {linkError && <p className="metadata-warning" role="alert">{linkError}</p>}
          <div className="export-buttons"><button className="button secondary" type="button" onClick={() => { void copyJSON(); }}><Icon name="copy" size={16} /> Copy receipt JSON</button><button className="button secondary" type="button" onClick={() => downloadText(`${issued.receipt.receiptCode}.json`, serializeReceipt(issued, true))}><Icon name="download" size={16} /> Save JSON</button></div>
          <button className="button subtle full-width" type="button" onClick={() => { try { downloadQR("issued-chit-qr", issued.receipt.receiptCode); } catch (err) { setCopyNotice(err instanceof Error ? err.message : "Could not download QR."); } }}><Icon name="qr" size={16} /> Save QR image</button>
          <a className="explorer-link" href={explorerTxUrl(issued.txHash)} target="_blank" rel="noreferrer">View transaction in Explorer <Icon name="external" size={15} /></a><small className="explorer-hint">Select <strong>Testnet</strong> in Explorer.</small>
          <details className="json-details"><summary>Receipt JSON & transaction hash</summary><textarea readOnly value={serializeReceipt(issued, true)} rows={10} aria-label="Issued receipt JSON" spellCheck={false} /><p className="breakable"><strong>txHash:</strong> {issued.txHash}</p></details>
          {copyNotice && <p className="inline-notice" role="status">{copyNotice}</p>}
        </div>}

        {unresolved && <div className="export-panel unresolved-panel"><h3><Icon name="clock" size={18} /> Saved draft, not verified proof</h3><p>QoreX may have broadcast the anchor. Recover the real transaction hash; do not blindly reissue.</p><button className="button secondary full-width" type="button" onClick={() => onVerify(unresolved)}>Recover & verify <Icon name="arrow" size={16} /></button><div className="export-buttons"><button className="button subtle" type="button" onClick={() => { void copyJSON(); }}><Icon name="copy" size={15} /> Copy draft</button><button className="button subtle" type="button" onClick={() => downloadText(`${unresolved.receipt.receiptCode}-pending.json`, serializePendingReceipt(unresolved))}><Icon name="download" size={15} /> Save draft</button></div>{copyNotice && <p role="status" className="inline-notice">{copyNotice}</p>}</div>}

        {!finished && <div className="quiet-card"><span className="soft-icon small"><Icon name="shield" size={18} /></span><div><h3>A receipt, not a medical record.</h3><p>The QR contains only the five receipt fields and proof metadata. The chain contains only the hash—not those fields.</p></div></div>}
      </aside>
    </div>

    {pendingReceipts.length > 0 && <div className="pending-banner"><Icon name="clock" size={20} /><div><strong>{pendingReceipts.length} unresolved {pendingReceipts.length === 1 ? "submission" : "submissions"} saved on this browser</strong><p>A saved draft is not evidence of success. Recover the transaction hash in QoreX or <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Explorer (Testnet)</a>.</p><div className="saved-chips">{pendingReceipts.map((record) => <button key={record.receipt.receiptCode} type="button" onClick={() => onVerify(record)}>{record.receipt.receiptCode}<Icon name="arrow" size={13} /></button>)}</div></div></div>}
    <div className="page-footnote"><span><Icon name="lock" size={14} /> No patient data collected</span><span><Icon name="globe" size={14} /> {CHAIN_ID}</span><span><Icon name="hash" size={14} /> SHA-256, computed locally</span></div>
  </section>;
}
