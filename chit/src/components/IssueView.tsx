import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "./Icon.js";
import { PatientReceiptPass } from "./PatientReceiptPass.js";
import { ReceiptFieldsForm } from "./ReceiptFieldsForm.js";
import { anchorReceipt, AnchorSubmissionUnknownError, SubmittedAnchorError, type WalletConnection } from "../lib/qorex.js";
import { CHAIN_ID, EXPLORER_URL, explorerTxUrl } from "../lib/network.js";
import { clearPendingReceipt, createReceiptRecord, ensureReceiptStorage, generateReceiptCode, hashReceipt, loadPendingReceipts, loadReceipts, newReceipt, normalizeReceipt, savePendingReceipt, saveReceipt, serializePendingReceipt, serializeReceipt, type PendingReceipt, type ReceiptFields, type ReceiptRecord } from "../lib/receipt.js";
import { copyText, downloadText } from "../lib/export.js";
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
  const [phase, setPhase] = useState<"idle" | "hashing" | "wallet" | "broadcasting" | "submitted" | "unconfirmed" | "unknown">("idle");
  const [issued, setIssued] = useState<ReceiptRecord | null>(null);
  const [unresolved, setUnresolved] = useState<PendingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hash = useReceiptHash(draft);
  const busy = phase === "hashing" || phase === "wallet" || phase === "broadcasting";
  const finished = issued !== null || unresolved !== null;
  useEffect(() => {
    const target = heading.current;
    if (finished && target?.getClientRects().length) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    }
  }, [finished]);

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
    setIssued(record); setPhase(notice === undefined ? "submitted" : "unconfirmed"); setError(notice ?? null);
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
      if (draft.scanCategory === "Custom") throw new Error("Choose an approved custom scan or test type before issuing.");
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

  const progressText = phase === "hashing" ? "Preparing the receipt…" : phase === "wallet" ? "Connecting to QoreX…" : "Approve the receipt in QoreX…";
  const confirmed = phase === "submitted";
  let verificationLink: string | null = null;
  try { if (issued && confirmed) verificationLink = createVerificationLink(issued); }
  catch { /* The receipt and its proof remain exportable below. */ }

  return <section className="page issue-page" aria-labelledby="issue-heading">
    <div className="page-heading"><div>
      <p className="eyebrow">For clinics and labs</p>
      <h1 id="issue-heading" ref={heading} tabIndex={-1}>{issued ? confirmed ? "Receipt ready" : "Check this receipt" : unresolved ? "Find this receipt" : "Issue a pass"}<span className="heading-period">.</span></h1>
      {!finished && <p>Create an imaging receipt in QoreX, then share the pass with your patient.</p>}
    </div></div>

    {issued ? <div className="clinic-completion">
      {confirmed && verificationLink && <PatientReceiptPass key={issued.txHash} receipt={issued.receipt} verificationLink={verificationLink} />}
      {(!confirmed || !verificationLink) && <div className="alert warning-alert" role="alert"><Icon name="alert" size={19} /><span>{confirmed ? "We couldn’t create the pass link. You can still check or export the receipt below." : "The wallet returned a reference, but Chit couldn’t confirm the receipt. Check it before sharing. Don’t send it again."}</span></div>}
      {(storageNotice || (confirmed && error)) && <div className="alert warning-alert" role="alert"><Icon name="alert" size={19} /><span>{storageNotice ? "The receipt archive may not have been updated. Keep a copy of the pass or export the receipt below." : error}</span></div>}
      <div className="clinic-actions">
        <button type="button" className="button secondary" onClick={() => onVerify(issued)}><Icon name="shield" size={18} /> Check this receipt</button>
        <button type="button" className="button secondary" onClick={startNew}><Icon name="plus" size={18} /> Issue another pass</button>
      </div>
      <details className="panel disclosure clinic-proof">
        <summary><Icon name="shield" size={18} /><span>Cryptographic Proof</span><Icon name="chevron" size={16} /></summary>
        <div className="disclosure-body">
          <p>{saved ? "Receipt saved in this browser. Keep a copy before clearing browser data." : "Export a copy to keep this receipt."}</p>
          {!confirmed && error && <p>{error}</p>}
          <dl className="proof-facts"><div><dt>Network</dt><dd>{CHAIN_ID}</dd></div><div><dt>Receipt SHA-256</dt><dd>{issued.receiptHash}</dd></div><div><dt>Transaction hash</dt><dd>{issued.txHash}</dd></div></dl>
          <div className="field"><label htmlFor="issued-json">Receipt JSON</label><textarea id="issued-json" readOnly value={serializeReceipt(issued, true)} rows={9} spellCheck={false} /></div>
          <div className="export-buttons">
            <button className="button secondary" type="button" onClick={() => { void copyJSON(); }}><Icon name="copy" size={16} /> Copy receipt JSON</button>
            <button className="button secondary" type="button" onClick={() => downloadText(`${issued.receipt.receiptCode}.json`, serializeReceipt(issued, true))}><Icon name="download" size={16} /> Save JSON</button>
          </div>
          <a className="explorer-link" href={explorerTxUrl(issued.txHash)} target="_blank" rel="noreferrer">View transaction in Explorer (Testnet) <Icon name="external" size={15} /></a>
          {copyNotice && <p className="inline-notice" role="status">{copyNotice}</p>}
        </div>
      </details>
    </div> : unresolved ? <div className="clinic-completion">
      <section className="panel clinic-help">
        <h2>Receipt {unresolved.receipt.receiptCode} still needs checking</h2>
        <p>QoreX may have sent the receipt. Look for its reference in QoreX history before trying anything again.</p>
        <div className="clinic-actions">
          <button className="button primary" type="button" onClick={() => onVerify(unresolved)}>Find and check receipt <Icon name="arrow" size={16} /></button>
          <button className="button secondary" type="button" onClick={startNew}>Issue a different pass</button>
        </div>
      </section>
      <details className="panel disclosure clinic-proof">
        <summary><Icon name="info" size={18} /><span>Recovery details</span><Icon name="chevron" size={16} /></summary>
        <div className="disclosure-body">
          {error && <p>{error}</p>}
          <div className="export-buttons">
            <button className="button secondary" type="button" onClick={() => { void copyJSON(); }}><Icon name="copy" size={16} /> Copy draft JSON</button>
            <button className="button secondary" type="button" onClick={() => downloadText(`${unresolved.receipt.receiptCode}-pending.json`, serializePendingReceipt(unresolved))}><Icon name="download" size={16} /> Save draft JSON</button>
          </div>
          {copyNotice && <p className="inline-notice" role="status">{copyNotice}</p>}
        </div>
      </details>
    </div> : <div className="issue-grid">
      <form className="panel receipt-panel" onSubmit={(event) => { void issue(event); }}>
        <div className="panel-heading"><div><h2>Receipt details</h2><p>Use only generic details that don’t identify the patient.</p></div><span className="panel-icon"><Icon name="receipt" size={23} /></span></div>
        <div className="code-tools"><span><span className="status-dot" /> Receipt ID created on this device</span><button className="text-button" type="button" onClick={freshCode} disabled={busy}><Icon name="refresh" size={15} /> New ID</button></div>
        <ReceiptFieldsForm value={draft} onChange={setDraft} disabled={busy} idPrefix="issue" />
        <div className="privacy-box"><Icon name="lock" size={19} /><div><strong>Keep patient details out of the pass</strong><p>Never enter names, phone numbers, patient IDs, diagnoses or medical images. Anyone with the pass can read these receipt details.</p></div></div>
        <label className="consent-check"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} disabled={busy} /><span>I’ve used only generic details that don’t identify a patient.</span></label>
        {(error || hash.error) && <div className="alert error-alert" role="alert"><Icon name="alert" size={19} /><span>{error || hash.error}</span></div>}
        <div className="form-actions"><button type="submit" className="button primary" disabled={busy || !privacyAccepted || !!hash.error}>{busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={wallet ? "receipt" : "wallet"} />}{busy ? progressText : wallet ? "Issue pass" : "Connect QoreX and issue pass"}</button></div>
        <p className="fee-note"><Icon name="info" size={16} /><span>QoreX shows the network fee before you approve.</span></p>
      </form>
      <aside className="panel clinic-help">
        <h2>What the patient gets</h2>
        <p>A QR pass they can save, share, or check without a wallet. Only a digital fingerprint of the receipt is recorded on-chain.</p>
        <details className="canonical-inspector"><summary>Cryptographic Proof<Icon name="chevron" size={16} /></summary><div>
          <p>QoreX signs one 1-uqor self-transfer on {CHAIN_ID}, plus the fee shown by the wallet. An existing ML-DSA-87 registration is required.</p>
          <p><strong>NIST FIPS 204 · ML-DSA-87 · 4,627 B</strong> · Hybrid with secp256k1</p>
          <p>Draft SHA-256: <code>{hash.hash ?? "Waiting for valid receipt details"}</code></p>
        </div></details>
      </aside>
    </div>}

    {pendingReceipts.length > 0 && <div className="pending-banner"><Icon name="clock" size={20} /><div><strong>{pendingReceipts.length} saved {pendingReceipts.length === 1 ? "draft needs" : "drafts need"} checking</strong><p>Find the receipt reference in QoreX or in <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Explorer (Testnet)</a>. A draft is not proof that the pass was issued.</p><div className="saved-chips">{pendingReceipts.map((record) => <button key={record.receipt.receiptCode} type="button" onClick={() => onVerify(record)}>{record.receipt.receiptCode}<Icon name="arrow" size={13} /></button>)}</div></div></div>}
  </section>;
}
