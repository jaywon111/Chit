import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "./Icon.js";
import { ReceiptFieldsForm } from "./ReceiptFieldsForm.js";
import { CryptoEvidencePanel } from "./CryptoEvidencePanel.js";
import { IssuerPolicyPanel, readIssuerPolicyState, type IssuerPolicyState } from "./IssuerPolicyPanel.js";
import { LocalFileFingerprint } from "./LocalFileFingerprint.js";
import { QrPassScanner } from "./QrPassScanner.js";
import { copyText } from "../lib/export.js";
import { CHAIN_ID } from "../lib/network.js";
import { ISSUER_STORAGE_KEY } from "../lib/issuers.js";
import { canonicalReceiptJSON, createReceiptRecord, loadPendingReceipts, loadReceipts, normalizeHash, normalizeReceipt, normalizeTxHash, parseReceiptPayload, SCAN_CATEGORIES, serializePendingReceipt, type ImportedReceipt, type PendingReceipt, type ReceiptFields, type ReceiptRecord } from "../lib/receipt.js";
import { createVerificationLink } from "../lib/share.js";
import { resolveTestnetSample, SAMPLE_EXPECTED_HASH, SAMPLE_TX_HASH } from "../lib/sample.js";
import { fetchChainEvidence, verificationVerdict, type ChainEvidence, type VerificationVerdict } from "../lib/verify.js";
import { useReceiptHash } from "../lib/useReceiptHash.js";

export type VerificationSeed = { nonce: number } & (
  { record: ReceiptRecord | PendingReceipt } | { input: ImportedReceipt } | { error: string }
);

function importJSON(input: ImportedReceipt): string {
  return JSON.stringify({ version: 1, chainId: CHAIN_ID, receipt: input.receipt, txHash: input.txHash, ...(input.receiptHash ? { receiptHash: input.receiptHash } : {}) }, null, 2);
}

export function VerifyView({ active, records, seed, onSave }: { active: boolean; records: ReceiptRecord[]; seed: VerificationSeed | null; onSave: (record: ReceiptRecord) => void }): JSX.Element {
  const [scanReset, setScanReset] = useState(0);
  const manualDrawer = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<"code" | "json">(records.length ? "code" : "json");
  const [code, setCode] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [txInput, setTxInput] = useState("");
  const [original, setOriginal] = useState<ImportedReceipt | null>(null);
  const [fields, setFields] = useState<ReceiptFields | null>(null);
  const [evidence, setEvidence] = useState<ChainEvidence | null>(null);
  const [activeTx, setActiveTx] = useState<string | null>(null);
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [issuerState, setIssuerState] = useState<IssuerPolicyState>(readIssuerPolicyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Persistence is separate from cryptographic verification. A quota/collision
  // warning must not relabel valid, unchanged chain/hash evidence as failed.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const copySequence = useRef(0);
  const hash = useReceiptHash(fields);

  function clearResult(cancelScan = true): void {
    sequence.current += 1; copySequence.current += 1; controller.current?.abort();
    if (cancelScan) setScanReset((token) => token + 1);
    setEvidence(null); setOriginal(null); setFields(null); setActiveTx(null);
    setSampleLoaded(false); setBusy(false); setError(null); setSaveError(null); setNotice("");
  }

  function beginScan(): (text: string) => void {
    clearResult(false);
    setMode("json"); setCode(""); setJsonText(""); setTxInput("");
    const request = sequence.current;
    return (text) => {
      if (request !== sequence.current) return;
      // Treat the QR as input, never as a URL to open or a source of proof.
      try { loadInput(parseReceiptPayload(text)); }
      catch { setError("This QR code does not contain a valid Chit pass. Try a different pass or ask your clinic for a new copy."); }
    };
  }

  async function readProof(txHash: string): Promise<void> {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const request = ++sequence.current;
    setBusy(true); setActiveTx(txHash); setEvidence(null); setError(null); setSaveError(null); setNotice("");
    try {
      const proof = await fetchChainEvidence(txHash, active.signal);
      if (request === sequence.current && !active.signal.aborted) setEvidence(proof);
    } catch (err) {
      if (request === sequence.current && !active.signal.aborted) setError(err instanceof Error ? err.message : "Could not read on-chain evidence. No verification is assumed.");
    } finally { if (request === sequence.current) setBusy(false); }
  }

  function loadInput(input: ImportedReceipt): void {
    const clean: ImportedReceipt = {
      receipt: normalizeReceipt(input.receipt), txHash: normalizeTxHash(input.txHash),
      ...(input.receiptHash !== undefined ? { receiptHash: normalizeHash(input.receiptHash) } : {}),
    };
    setOriginal({ ...clean, receipt: { ...clean.receipt } });
    setFields({ ...clean.receipt }); setSampleLoaded(false);
    setJsonText(importJSON(clean)); setTxInput(clean.txHash); setCode(clean.receipt.receiptCode);
    void readProof(clean.txHash);
  }

  function useRecord(record: ReceiptRecord | PendingReceipt): void {
    clearResult(); setCode(record.receipt.receiptCode);
    if ("txHash" in record) {
      setMode("code");
      loadInput({ receipt: record.receipt, txHash: record.txHash, receiptHash: record.receiptHash });
    } else {
      setMode("json"); setJsonText(serializePendingReceipt(record)); setTxInput("");
      if (manualDrawer.current) manualDrawer.current.open = true;
      setNotice("This is only a draft. Find the receipt reference in QoreX history, enter it below, and check the receipt. Don’t send it again.");
    }
  }

  useEffect(() => {
    if (!seed) return;
    clearResult();
    try {
      if ("record" in seed) useRecord(seed.record);
      else if ("input" in seed) { setMode("json"); loadInput(seed.input); }
      else { setMode("json"); setJsonText(""); setTxInput(""); setError(seed.error); }
    } catch (err) { setError(err instanceof Error ? err.message : "This receipt source was rejected."); }
  }, [seed]);
  useEffect(() => () => { sequence.current += 1; copySequence.current += 1; controller.current?.abort(); }, []);
  useEffect(() => {
    const changed = (event: StorageEvent): void => {
      if (event.key === ISSUER_STORAGE_KEY || event.key === null) setIssuerState(readIssuerPolicyState());
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  function switchMode(next: "code" | "json"): void {
    if (next !== mode) { clearResult(); setTxInput(""); setMode(next); }
  }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    clearResult();
    try {
      if (mode === "code") {
        const normalizedCode = code.trim().toUpperCase();
        const lookupCode = /^[A-Z0-9]{4,8}$/.test(normalizedCode) ? `CHT-${normalizedCode}` : normalizedCode;
        const record = loadReceipts().find((entry) => entry.receipt.receiptCode === lookupCode);
        if (record) { useRecord(record); return; }
        const pending = loadPendingReceipts().find((entry) => entry.receipt.receiptCode === lookupCode);
        if (pending) { useRecord(pending); return; }
        throw new Error("That receipt ID isn’t saved on this device. Use the QR pass or ask your clinic for the pass link.");
      }
      loadInput(parseReceiptPayload(jsonText, txInput));
    } catch (err) { setError(err instanceof Error ? err.message : "This receipt was rejected."); }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    clearResult(); setMode("json"); setTxInput(""); setJsonText("");
    if (!/\.(json|txt)$/i.test(file.name) || file.size <= 0 || file.size > 12_000) {
      setError("Choose a non-empty receipt .json or verification-link .txt file up to 12 KB. Scan images, PDFs, patient records, and medical files are not receipt imports."); return;
    }
    const request = sequence.current;
    try {
      const content = await file.text();
      if (request !== sequence.current) return;
      if (content.length > 12_000) throw new Error("Receipt payload is too large.");
      setJsonText(content); setNotice("Receipt text loaded in browser memory only. It was not uploaded or saved. Select Verify to validate it and read the chain.");
    } catch { if (request === sequence.current) setError("The small receipt text file could not be read. It has not been uploaded or stored."); }
  }

  async function loadSample(): Promise<void> {
    if (busy) return;
    clearResult(); setMode("json"); setJsonText(""); setTxInput(SAMPLE_TX_HASH); setBusy(true);
    const request = sequence.current;
    try {
      // Supplied fields pass the same strict normalization and WebCrypto hashing
      // as every receipt. No local archive, seeded evidence, or trusted memo hash.
      const input = await resolveTestnetSample();
      if (request !== sequence.current) return;
      loadInput(input);
      setSampleLoaded(true);
      setNotice(input.receiptHash === SAMPLE_EXPECTED_HASH
        ? "Sample loaded. To see what happens when details change, open Cryptographic Proof."
        : "The sample details don’t match its published reference. Chit still checks the live record and shows the comparison under Cryptographic Proof.");
    } catch (err) {
      if (request !== sequence.current) return;
      setBusy(false);
      setError(err instanceof Error ? err.message : "The supplied sample receipt could not be normalized and hashed. No verification is assumed.");
    }
  }

  function tamper(): void {
    if (!fields || !original) return;
    copySequence.current += 1; setSaveError(null);
    const presets = SCAN_CATEGORIES.filter((category) => category !== "Custom");
    const index = presets.findIndex((category) => category === original.receipt.scanCategory);
    setFields({ ...fields, scanCategory: presets[(index + 1) % presets.length] });
    setNotice("Scan type changed in the test copy only.");
  }

  function reset(): void {
    if (!original) return;
    copySequence.current += 1; setSaveError(null);
    setFields({ ...original.receipt });
    setNotice("Original receipt parameters restored locally. The blockchain did not change.");
  }

  async function copyValue(value: string, label: string): Promise<void> {
    const request = sequence.current;
    const attempt = ++copySequence.current;
    try { await copyText(value); if (request === sequence.current && attempt === copySequence.current) setNotice(`${label} copied.`); }
    catch { if (request === sequence.current && attempt === copySequence.current) setNotice("Clipboard access failed. Select and copy the displayed value manually."); }
  }

  let verdict: VerificationVerdict = verificationVerdict(evidence, hash.hash, issuerState.policy);
  if (busy) verdict = { kind: "pending", title: "READING LIVE CHAIN EVIDENCE", detail: "Checking the Diana node, successful inclusion, and both signature layers. No wallet or broadcast." };
  else if (error) verdict = { kind: "failed", title: "VERIFICATION NOT ESTABLISHED", detail: error };
  else if (fields && hash.error) verdict = { kind: "incomplete", title: "INVALID RECEIPT PARAMETERS", detail: hash.error };
  else if (sampleLoaded && evidence?.success && evidence.anchoredHash && evidence.anchoredHash !== SAMPLE_EXPECTED_HASH) {
    verdict = { kind: "failed", title: "SAMPLE ANCHOR DOES NOT MATCH", detail: "The live transaction memo differs from the supplied sample reference. Both actual digests are shown; no sample verification is assumed." };
  }
  if (issuerState.error && (verdict.kind === "verified" || verdict.kind === "unauthorized")) {
    verdict = { kind: "incomplete", title: "ISSUER POLICY UNAVAILABLE", detail: "The local issuer policy could not be safely read or saved. Existing evidence is shown, but permissioned verification fails closed until you explicitly recover the policy." };
  }
  const suppliedHashDiffers = !!(original?.receiptHash && evidence?.anchoredHash && original.receiptHash !== evidence.anchoredHash);
  const changedCount = fields && original ? Object.keys(original.receipt).filter((key) => fields[key as keyof ReceiptFields] !== original.receipt[key as keyof ReceiptFields]).length : 0;

  function saveVerified(): void {
    if (!fields || !evidence?.anchoredHash || verdict.kind !== "verified" || issuerState.error) return;
    setSaveError(null);
    try { onSave(createReceiptRecord(fields, evidence.anchoredHash, evidence.txHash)); setNotice("Verified receipt saved on this browser. Recover it by its receipt code or export JSON."); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Could not save the verified receipt. Existing records were not overwritten."); }
  }

  const showResult = !!(busy || error || activeTx || fields);
  const pass = original?.receipt;
  const [resultTitle, resultDetail] = {
    pending: ["Checking your pass…", "We’re comparing the details with the receipt that was recorded."],
    verified: ["Pass verified", issuerState.policy.enabled ? "The details match the original receipt and the issuer is on your trusted list." : "The details match the original receipt."],
    tampered: ["Pass details don’t match", changedCount ? "You’re checking an edited copy. The original pass hasn’t changed." : "These details don’t match the recorded receipt. Ask your clinic for a new copy before relying on it."],
    unauthorized: ["Issuer not on your trusted list", "Check your trusted-clinic settings under Manual / Advanced."],
    failed: activeTx ? ["Couldn’t verify this pass", "We couldn’t confirm this receipt online. Try again or ask the clinic to check the pass."] : ["Couldn’t read this pass", "Try a Chit QR pass or the link from your clinic. For a typed or saved receipt, check Manual / Advanced."],
    incomplete: fields && hash.error ? ["Check the receipt details", "Some details aren’t in a valid format. Reset the test copy to check the original pass."] : ["Couldn’t verify this pass", "The information available doesn’t confirm this pass. See Cryptographic Proof for details."],
  }[verdict.kind];

  return <section className="page verify-page" aria-labelledby="verify-heading">
    <div className="page-heading"><div><h1 id="verify-heading">Verify a pass<span className="heading-period">.</span></h1><p>Scan a Chit QR Pass or upload a saved pass image.</p></div></div>
    <QrPassScanner enabled={active && !busy} resetToken={scanReset} onBegin={beginScan} />
    <div className="sample-toolbar">
      <button className="button sample-button" type="button" disabled={busy} aria-describedby="verify-sample-help" onClick={() => { void loadSample(); }}><Icon name="globe" size={16} /> <span>Load Live Testnet Sample</span><Icon name="arrow" size={15} /></button>
      <p id="verify-sample-help">Try a demo pass right away without a QR code.</p>
    </div>

    {showResult && <section className="receipt-result" aria-label="Receipt check">
      <div className={`verdict-banner verdict-${verdict.kind}`} role="status">
        <div className="verdict-icon">{busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={verdict.kind === "verified" ? "check" : verdict.kind === "pending" ? "clock" : "alert"} size={22} />}</div>
        <div><h2>{resultTitle}</h2><p>{resultDetail}</p></div>
      </div>
      {pass && <div className="panel receipt-summary">
        <h2>Pass details</h2>
        <dl className="pass-facts">
          <div><dt>Receipt ID</dt><dd>{pass.receiptCode}</dd></div>
          <div><dt>Date</dt><dd><time dateTime={pass.visitDate}>{pass.visitDate}</time></dd></div>
          <div><dt>Type</dt><dd>{pass.scanCategory}</dd></div>
          <div><dt>Clinic code</dt><dd>{pass.facilityTag}</dd></div>
          {pass.note && <div><dt>Visit context</dt><dd>{pass.note}</dd></div>}
        </dl>
        {verdict.kind === "verified" && <button type="button" className="button secondary" onClick={saveVerified}><Icon name="download" size={17} /> Save on this device</button>}
        {(error || verdict.kind === "failed") && activeTx && <button type="button" className="button secondary" onClick={() => { void readProof(activeTx); }}><Icon name="refresh" size={17} /> Try again</button>}
      </div>}
      {saveError && <div className="alert warning-alert" role="alert"><Icon name="alert" size={18} /><span>Couldn’t save it on this device. Keep the original pass. Your check result hasn’t changed.</span></div>}
      {notice && <p className="inline-notice" role="status">{notice}</p>}
    </section>}

    <details className="panel disclosure manual-drawer" ref={manualDrawer}>
      <summary><Icon name="search" size={18} /><span>Manual / Advanced</span><Icon name="chevron" size={16} /></summary>
      <div className="disclosure-body">
        <form className="lookup-panel" onSubmit={(event) => { void verify(event); }}>
          {!showResult && notice && <p className="inline-notice" role="status">{notice}</p>}
          <div className="lookup-heading">
            <div><h2>Find or enter a receipt</h2></div>
            <div className="segmented-control" aria-label="Receipt lookup method">
              <button type="button" className={mode === "code" ? "selected" : ""} aria-pressed={mode === "code"} disabled={busy} onClick={() => switchMode("code")}><Icon name="search" size={15} /> Saved receipt ID</button>
              <button type="button" className={mode === "json" ? "selected" : ""} aria-pressed={mode === "json"} disabled={busy} onClick={() => switchMode("json")}><Icon name="receipt" size={15} /> Paste or import</button>
            </div>
          </div>
          {mode === "code" ? <>
            <div className="lookup-row">
              <label className="sr-only" htmlFor="verify-lookup-code">Saved receipt ID</label>
              <div className="search-input-wrap"><Icon name="receipt" size={19} /><input id="verify-lookup-code" value={code} onChange={(event) => { clearResult(); setCode(event.target.value.toUpperCase()); }} placeholder="CHT-4821" autoComplete="off" spellCheck={false} maxLength={12} required disabled={busy} /></div>
              <button className="button primary" type="submit" disabled={busy}><Icon name="shield" size={17} /> {busy ? "Checking…" : "Check receipt"}</button>
            </div>
            <p className="lookup-help">This only finds passes saved on this device.</p>
            {records.length > 0 && <div className="recent-receipts"><span>Recently saved</span><div className="saved-chips">{records.slice(-4).reverse().map((record) => <button key={record.receipt.receiptCode} type="button" disabled={busy} onClick={() => useRecord(record)}>{record.receipt.receiptCode}<Icon name="chevron" size={13} /></button>)}</div></div>}
          </> : <div className="json-import">
            <div className="field"><label htmlFor="verify-json">Pass link or receipt text</label><textarea id="verify-json" value={jsonText} onChange={(event) => { if (txInput === original?.txHash) setTxInput(""); clearResult(); setJsonText(event.target.value); }} rows={4} maxLength={12_000} autoComplete="off" spellCheck={false} required disabled={busy} /><small>Paste a Chit link or the text from a receipt JSON file. Never enter names, phone numbers or medical details.</small></div>
            <div className="json-import-bottom">
              <div className="field"><label htmlFor="verify-tx">Receipt reference (auto-filled on scan)</label><input id="verify-tx" value={txInput} onChange={(event) => { clearResult(); setTxInput(event.target.value); }} maxLength={66} autoComplete="off" spellCheck={false} disabled={busy} className="mono-input" /><small>Only enter this yourself if your receipt doesn’t include it.</small></div>
              <div className="import-actions">
                <label className={`button secondary file-button${busy ? " disabled" : ""}`}><Icon name="upload" size={16} /> Choose a text file<input type="file" accept=".json,.txt,application/json,text/plain" onChange={(event) => { void importFile(event); }} disabled={busy} /></label>
                <button className="button primary" type="submit" disabled={busy}><Icon name="shield" size={17} /> {busy ? "Checking…" : "Check receipt"}</button>
              </div>
            </div>
          </div>}
        </form>
        <IssuerPolicyPanel state={issuerState} onChange={setIssuerState} signerAddress={evidence?.signerAddress ?? null} />
        <LocalFileFingerprint />
      </div>
    </details>

    {showResult && <details className="panel disclosure proof-drawer">
      <summary><Icon name="shield" size={18} /><span>Cryptographic Proof</span><Icon name="chevron" size={16} /></summary>
      <div className="disclosure-body">
        <p className="proof-status"><strong>{verdict.title}</strong><span>{verdict.detail}</span></p>
        {saveError && <p className="metadata-warning">{saveError}</p>}
        {sampleLoaded && <div className="sample-reference"><span>EXPECTED SAMPLE ANCHOR / REFERENCE ONLY</span><code>{SAMPLE_EXPECTED_HASH}</code><p>This reference never replaces the actual on-chain or computed hash.</p></div>}
        {activeTx && <div className="verify-grid">
          <CryptoEvidencePanel evidence={evidence} computedHash={hash.hash} activeTx={activeTx} busy={busy} verdict={verdict} receiptPresent={!!fields} suppliedHashDiffers={suppliedHashDiffers} onRetry={() => { void readProof(activeTx); }} onCopy={(value, label) => { void copyValue(value, label); }} />
          {fields && original && <section className="panel edit-panel" aria-labelledby="tamper-heading">
            <div className="panel-heading"><div><h2 id="tamper-heading">Tamper simulator</h2><p>Change this copy to see how verification responds.</p></div><span className={`revision-tag${changedCount ? " revision-edited" : ""}`}>{changedCount} {changedCount === 1 ? "edit" : "edits"}</span></div>
            <div className="tamper-tools"><button type="button" className="button tamper-button" onClick={tamper}><Icon name="alert" size={16} /> Simulate Tamper</button><button type="button" className="button secondary" onClick={reset}><Icon name="refresh" size={15} /> Reset</button></div>
            <ReceiptFieldsForm value={fields} onChange={(next) => { copySequence.current += 1; setSaveError(null); setNotice(""); setFields(next); }} editing original={original.receipt} idPrefix="verify-edit" />
            <p className="local-only-note"><Icon name="lock" size={15} /> Edits stay on this screen. The saved receipt and on-chain proof are unchanged.</p>
            <details className="canonical-inspector"><summary>Inspect canonical JSON<Icon name="chevron" size={15} /></summary><div><span>Original receipt</span><pre>{canonicalReceiptJSON(original.receipt)}</pre><span>Current copy</span><pre>{hash.canonical ?? "No valid normalized receipt"}</pre></div></details>
            <div className="verified-actions"><button type="button" className="button secondary full-width" onClick={() => { try { void copyValue(createVerificationLink(original), "Original pass link"); } catch { setNotice("Couldn’t create a link. Keep the original pass."); } }}><Icon name="copy" size={16} /> Copy original pass link</button></div>
          </section>}
        </div>}
      </div>
    </details>}
    {showResult && <p className="pass-privacy proof-footnote"><Icon name="info" size={16} /> <span>A check can show whether a receipt matches. It can’t tell you if a scan took place.</span></p>}
  </section>;
}
