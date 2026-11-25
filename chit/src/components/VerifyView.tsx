import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "./Icon.js";
import { ReceiptFieldsForm } from "./ReceiptFieldsForm.js";
import { copyText } from "../lib/export.js";
import { CHAIN_ID, REST_BASE, REST_URL, explorerTxUrl } from "../lib/network.js";
import { createReceiptRecord, loadPendingReceipts, loadReceipts, parseReceiptPayload, SCAN_CATEGORIES, serializePendingReceipt, serializeReceipt, type ImportedReceipt, type PendingReceipt, type ReceiptFields, type ReceiptRecord } from "../lib/receipt.js";
import { fetchChainEvidence, verificationVerdict, type ChainEvidence, type VerificationVerdict } from "../lib/verify.js";
import { useReceiptHash } from "../lib/useReceiptHash.js";

export interface VerificationSeed { record: ReceiptRecord | PendingReceipt; nonce: number }

export function VerifyView({ records, seed, onSave }: { records: ReceiptRecord[]; seed: VerificationSeed | null; onSave: (record: ReceiptRecord) => void }): JSX.Element {
  const [mode, setMode] = useState<"code" | "json">("code");
  const [code, setCode] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [txInput, setTxInput] = useState("");
  const [original, setOriginal] = useState<ImportedReceipt | null>(null);
  const [fields, setFields] = useState<ReceiptFields | null>(null);
  const [evidence, setEvidence] = useState<ChainEvidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const hash = useReceiptHash(fields);

  function clearResult(): void {
    sequence.current += 1; controller.current?.abort();
    setEvidence(null); setOriginal(null); setFields(null); setBusy(false); setError(null); setNotice("");
  }

  async function readProof(input: ImportedReceipt): Promise<void> {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const request = ++sequence.current;
    setBusy(true); setEvidence(null); setError(null); setNotice("");
    try {
      const proof = await fetchChainEvidence(input.txHash, active.signal);
      if (request === sequence.current && !active.signal.aborted) setEvidence(proof);
    } catch (err) {
      if (request === sequence.current && !active.signal.aborted) setError(err instanceof Error ? err.message : "Could not verify the transaction.");
    } finally { if (request === sequence.current) setBusy(false); }
  }

  function loadInput(input: ImportedReceipt): void {
    setOriginal({ ...input, receipt: { ...input.receipt } });
    setFields({ ...input.receipt });
    void readProof(input);
  }

  function useRecord(record: ReceiptRecord | PendingReceipt): void {
    clearResult();
    setCode(record.receipt.receiptCode);
    if ("txHash" in record) {
      // Complete saved JSON already contains txHash. Never leave an automatic
      // override that could conflict with the next imported receipt.
      setMode("code"); setJsonText(serializeReceipt(record, true)); setTxInput("");
      loadInput({ receipt: record.receipt, txHash: record.txHash, receiptHash: record.receiptHash });
    } else {
      setMode("json"); setJsonText(serializePendingReceipt(record)); setTxInput("");
      setNotice("This is an unresolved recovery draft, not a verified receipt. Find its real transaction hash in QoreX or Explorer (Testnet), then paste it below.");
    }
  }

  useEffect(() => { if (seed) useRecord(seed.record); }, [seed]);
  useEffect(() => () => { sequence.current += 1; controller.current?.abort(); }, []);

  function switchMode(next: "code" | "json"): void { if (next !== mode) { clearResult(); setTxInput(""); setMode(next); } }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError(null); setNotice("");
    try {
      if (mode === "code") {
        const normalizedCode = code.trim().toUpperCase();
        const lookupCode = /^[A-Z0-9]{4,8}$/.test(normalizedCode) ? `CHT-${normalizedCode}` : normalizedCode;
        const record = loadReceipts().find((entry) => entry.receipt.receiptCode === lookupCode);
        if (record) { setCode(record.receipt.receiptCode); loadInput({ receipt: record.receipt, txHash: record.txHash, receiptHash: record.receiptHash }); return; }
        const pending = loadPendingReceipts().find((entry) => entry.receipt.receiptCode === lookupCode);
        if (pending) { useRecord(pending); return; }
        throw new Error("No saved Chit was found for that code on this browser. Use receipt JSON or the QR text payload instead.");
      }
      const input = parseReceiptPayload(jsonText, txInput);
      loadInput(input);
    } catch (err) {
      controller.current?.abort(); sequence.current += 1; setEvidence(null); setOriginal(null); setFields(null); setBusy(false);
      setError(err instanceof Error ? err.message : "Could not read this receipt.");
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearResult(); setMode("json"); setTxInput(""); setJsonText("");
    if (!/\.(json|txt)$/i.test(file.name) || file.size > 12_000) {
      setError("Choose a small receipt .json or QR-payload .txt file (up to 12 KB). Images and medical files are not accepted."); return;
    }
    const request = sequence.current;
    try {
      const content = await file.text();
      if (request !== sequence.current) return;
      setJsonText(content); setNotice("File loaded locally. It was not uploaded anywhere. Add a transaction hash if the JSON does not include one.");
    } catch { if (request === sequence.current) setError("The receipt file could not be read."); }
  }

  function tamper(): void {
    if (!fields || !original) return;
    const index = SCAN_CATEGORIES.indexOf(original.receipt.scanCategory as typeof SCAN_CATEGORIES[number]);
    setFields({ ...fields, scanCategory: SCAN_CATEGORIES[(index + 1) % SCAN_CATEGORIES.length] });
    setNotice("Only the local receipt field changed. No transaction was sent and the saved original was not modified.");
  }

  async function copyHash(value: string, label: string): Promise<void> {
    try { await copyText(value); setNotice(`${label} copied.`); } catch (err) { setNotice(err instanceof Error ? err.message : "Clipboard access failed."); }
  }

  let verdict: VerificationVerdict = verificationVerdict(evidence, hash.hash);
  if (hash.error) verdict = { kind: "incomplete", title: "INVALID RECEIPT FIELDS", detail: hash.error };
  else if (busy) verdict = { kind: "pending", title: "FETCHING ON-CHAIN PROOF", detail: "Reading the transaction and checking the REST node’s chain ID. No wallet is needed." };
  const suppliedHashDiffers = !!(original?.receiptHash && evidence?.anchoredHash && original.receiptHash !== evidence.anchoredHash);

  function saveVerified(): void {
    if (!fields || !evidence?.anchoredHash || verdict.kind !== "verified") return;
    try {
      onSave(createReceiptRecord(fields, evidence.anchoredHash, evidence.txHash));
      setNotice("Verified Chit saved on this browser. You can now recover it by receipt code.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the verified receipt."); }
  }

  return <section className="page verify-page" aria-labelledby="verify-heading">
    <div className="page-heading"><div><div className="eyebrow"><span className="tiny-square" /> TRUST THE PROOF. NOT THE SCREENSHOT.</div><h1 id="verify-heading">Verify a <span className="serif-word">Chit.</span></h1><p>Recover a receipt and compare it with its on-chain anchor.<br className="desktop-break" /> Change a field. Watch the proof tell the difference.</p></div><div className="no-wallet-badge"><Icon name="shield" size={18} /> No wallet required</div></div>

    <form className="panel lookup-panel" onSubmit={(event) => { void verify(event); }}>
      <div className="lookup-heading"><h2>Bring your receipt</h2><div className="segmented-control" aria-label="Receipt lookup method"><button type="button" className={mode === "code" ? "selected" : ""} aria-pressed={mode === "code"} onClick={() => switchMode("code")}><Icon name="search" size={16} /> Receipt code</button><button type="button" className={mode === "json" ? "selected" : ""} aria-pressed={mode === "json"} onClick={() => switchMode("json")}><Icon name="qr" size={16} /> JSON / QR text</button></div></div>
      {mode === "code" ? <>
        <label className="sr-only" htmlFor="verify-lookup-code">Saved receipt code</label><div className="lookup-row"><div className="search-input-wrap"><Icon name="receipt" size={19} /><input id="verify-lookup-code" value={code} onChange={(event) => { clearResult(); setCode(event.target.value.toUpperCase()); }} placeholder="Enter code, e.g. CHT-4821" autoComplete="off" spellCheck={false} maxLength={12} required disabled={busy} /></div><button className="button primary" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shield" size={18} />} {busy ? "Checking…" : "Verify Chit"}<Icon name="arrow" size={17} /></button></div>
        <p className="lookup-help">Codes look up receipts saved on <strong>this browser only</strong>. On another device, use JSON or the QR text.</p>
        {records.length > 0 && <div className="recent-receipts"><span>RECENT CHITS</span><div className="saved-chips">{records.slice(-4).reverse().map((record) => <button key={record.receipt.receiptCode} type="button" disabled={busy} onClick={() => useRecord(record)}>{record.receipt.receiptCode}<Icon name="chevron" size={13} /></button>)}</div></div>}
      </> : <div className="json-import">
        <div className="field"><label htmlFor="verify-json">Receipt JSON or scanned QR text <span className="field-tag">non-identifying only</span></label><textarea id="verify-json" value={jsonText} onChange={(event) => { clearResult(); setJsonText(event.target.value); }} placeholder={'Paste the Chit JSON envelope or the five receipt fields here…'} rows={6} maxLength={12_000} autoComplete="off" spellCheck={false} required disabled={busy} /><small>Never paste patient data. Extra fields and free-text notes are rejected. Nothing is stored unless you choose “Save verified Chit.”</small></div>
        <div className="field"><label htmlFor="verify-tx">Transaction hash <span className="field-tag">if not in JSON</span></label><input id="verify-tx" value={txInput} onChange={(event) => { clearResult(); setTxInput(event.target.value); }} placeholder="64-character QoreChain transaction hash" maxLength={66} autoComplete="off" spellCheck={false} disabled={busy} /></div>
        <div className="import-actions"><label className={`button secondary file-button ${busy ? "disabled" : ""}`}><Icon name="upload" size={17} /> Load receipt file<input type="file" accept=".json,.txt,application/json,text/plain" onChange={(event) => { void importFile(event); }} disabled={busy} aria-label="Upload receipt JSON or QR text file" /></label><button className="button primary" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shield" size={18} />}{busy ? "Checking…" : "Verify Chit"}<Icon name="arrow" size={17} /></button></div>
      </div>}
      {error && <div className="alert error-alert" role="alert"><Icon name="alert" size={19} /><span>{error}</span></div>}
      {notice && <p className="inline-notice" role="status">{notice}</p>}
    </form>

    {fields && original ? <>
      <div className={`verdict-banner verdict-${verdict.kind}`} role="status" aria-live="polite"><div className="verdict-icon">{busy ? <span className="spinner" /> : <Icon name={verdict.kind === "verified" ? "shield" : verdict.kind === "tampered" || verdict.kind === "failed" ? "alert" : "search"} size={28} />}</div><div><span className="section-number">RECEIPT INTEGRITY</span><h2>{verdict.title}</h2><p>{verdict.detail}</p></div>{verdict.kind === "verified" && <span className="proof-seal"><Icon name="check" size={18} /> HYBRID VERIFIED</span>}</div>
      <div className="verify-grid">
        <div className="panel edit-panel"><div className="panel-heading"><div><div className="section-number">THE RECEIPT</div><h2>Test the integrity</h2><p>Edit any field. The hash updates immediately.</p></div><Icon name="receipt" size={24} /></div><div className="tamper-tools"><button type="button" className="button tamper-button" onClick={tamper}><Icon name="sparkles" size={16} /> Simulate Tamper</button><button type="button" className="button subtle" onClick={() => { setFields({ ...original.receipt }); setNotice("Original receipt fields restored. The on-chain transaction has not changed."); }}><Icon name="refresh" size={15} /> Reset</button></div><ReceiptFieldsForm value={fields} onChange={setFields} editing idPrefix="verify-edit" /><p className="local-only-note"><Icon name="lock" size={15} /> Edits are local. Saved originals and the blockchain never change.</p></div>
        <div className="proof-column">
          <div className="panel hash-comparison"><div className="panel-heading compact"><div><div className="section-number">THE COMPARISON</div><h2>Two hashes. One truth.</h2></div><Icon name="hash" size={23} /></div><div className={`hash-pair ${verdict.kind === "tampered" ? "hashes-mismatch" : verdict.kind === "verified" ? "hashes-match" : ""}`}><div className="hash-cell"><div className="hash-label"><strong>Anchored Hash</strong><button className="icon-button" type="button" aria-label="Copy anchored hash" disabled={!evidence?.anchoredHash} onClick={() => { if (evidence?.anchoredHash) void copyHash(evidence.anchoredHash, "Anchored hash"); }}><Icon name="copy" size={14} /></button></div><small>Read from the transaction memo</small><code>{evidence?.anchoredHash ?? (busy ? "Fetching the transaction…" : "No supported anchor found")}</code></div><div className="hash-cell"><div className="hash-label"><strong>Computed Hash</strong><button className="icon-button" type="button" aria-label="Copy computed hash" disabled={!hash.hash} onClick={() => { if (hash.hash) void copyHash(hash.hash, "Computed hash"); }}><Icon name="copy" size={14} /></button></div><small>SHA-256 of the editable receipt</small><code>{hash.hash ?? (hash.error ? "Invalid receipt fields" : "Recomputing…")}</code></div></div><div className="comparison-result"><Icon name={verdict.kind === "verified" ? "check" : verdict.kind === "tampered" ? "x" : "hash"} size={16} /><span>{evidence?.anchoredHash && hash.hash ? evidence.anchoredHash === hash.hash ? "Hashes match" : "Hashes do not match" : "Both hashes are required"}</span></div>{suppliedHashDiffers && <p className="metadata-warning">The hash supplied in the JSON differs from the anchor. It is not trusted as on-chain evidence.</p>}</div>

          <div className="panel chain-proof"><div className="panel-heading compact"><div><div className="section-number">THE CHAIN EVIDENCE</div><h2>Hybrid by evidence</h2></div><button className="icon-button" type="button" aria-label="Recheck on-chain transaction" disabled={busy} onClick={() => { void readProof(original); }}><Icon name="refresh" size={17} /></button></div>
            <div className="proof-checks"><div className="proof-check"><span className={`proof-check-icon ${evidence?.success ? "pass" : ""}`}><Icon name={evidence?.success ? "check" : "clock"} size={16} /></span><div><strong>Successful transaction</strong><span>{evidence ? `code ${evidence.code ?? "unknown"} · block ${evidence.height || "unknown"}` : "Waiting for on-chain evidence"}</span></div></div><div className="proof-check"><span className={`proof-check-icon ${evidence?.extension.validShape && evidence.classicalSignatureValid ? "pass" : ""}`}><Icon name="shield" size={16} /></span><div><strong>ML-DSA-87 + secp256k1</strong><span>{evidence ? `${evidence.extension.signatureBytes?.toLocaleString() ?? "Unknown"} PQC bytes · ${evidence.classicalSignatureBytes ?? "unknown"} classical bytes` : "Signature lengths not checked yet"}</span></div></div><div className="proof-check"><span className={`proof-check-icon ${evidence?.pqcEventVerified ? "pass" : ""}`}><Icon name="check" size={16} /></span><div><strong>pqc_hybrid_verify event</strong><span>{evidence?.pqcEventStatus ?? "Waiting for event status"}</span></div></div></div>
            {evidence && <dl className="proof-facts"><div><dt>PQC extension</dt><dd className="breakable">{evidence.extension.typeUrl ?? "Not present"}</dd></div><div><dt>Placement / algorithm</dt><dd>{evidence.extension.placement ?? "missing"} / {evidence.extension.algorithmId ?? "unknown"}</dd></div><div><dt>Chain ID</dt><dd>{evidence.chainId}</dd></div><div><dt>Transaction hash</dt><dd className="breakable">{evidence.txHash}</dd></div></dl>}
            <div className="proof-links"><a href={explorerTxUrl(original.txHash)} target="_blank" rel="noreferrer">Open Explorer <Icon name="external" size={14} /></a><span>Select Testnet</span></div>
            {evidence && <details className="source-details"><summary>Verification source & trust</summary><p className="breakable"><a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceUrl}</a></p><p>{REST_BASE.startsWith("/") ? "The same REST URL is read through the local /lcd CORS proxy." : "Read directly from the configured REST endpoint."} Chit trusts the HTTPS node’s transaction result and events; it is not a light client or independent ML-DSA verifier.</p></details>}
          </div>
          <button type="button" className="button secondary full-width" disabled={verdict.kind !== "verified"} onClick={saveVerified}><Icon name="download" size={17} /> Save verified Chit on this browser</button>
        </div>
      </div>
    </> : <div className="verification-empty"><div className="empty-proof-visual"><span className="orbit-dot one" /><span className="orbit-dot two" /><span className="empty-proof-center"><Icon name="shield" size={42} /></span><span className="floating-code"><Icon name="hash" size={14} /> SHA-256</span></div><h2>A proof you can put to the test.</h2><p>Look up a saved code or bring receipt JSON to see the actual<br className="desktop-break" /> transaction, hybrid signatures, and side-by-side hashes.</p><div className="empty-feature-row"><span><Icon name="check" size={16} /> Transaction success</span><span><Icon name="shield" size={16} /> Hybrid evidence</span><span><Icon name="hash" size={16} /> Tamper detection</span></div></div>}
    <div className="proof-limits"><Icon name="info" size={18} /><p><strong>Integrity, not a diagnosis.</strong> A verified Chit proves these receipt fields match a hybrid-signed on-chain hash. It does not prove a scan happened, identify a patient, certify a clinic, or validate medical facts.</p></div>
    <div className="page-footnote"><span><Icon name="globe" size={14} /> {CHAIN_ID}</span><span><Icon name="lock" size={14} /> Read-only verification</span><a href={REST_URL} target="_blank" rel="noreferrer">Public testnet REST <Icon name="external" size={13} /></a></div>
  </section>;
}
