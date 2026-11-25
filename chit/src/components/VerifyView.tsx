import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "./Icon.js";
import { ReceiptFieldsForm } from "./ReceiptFieldsForm.js";
import { CryptoEvidencePanel } from "./CryptoEvidencePanel.js";
import { IssuerPolicyPanel, readIssuerPolicyState, type IssuerPolicyState } from "./IssuerPolicyPanel.js";
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

export function VerifyView({ records, seed, onSave }: { records: ReceiptRecord[]; seed: VerificationSeed | null; onSave: (record: ReceiptRecord) => void }): JSX.Element {
  const [mode, setMode] = useState<"code" | "json">(records.length ? "code" : "json");
  const [code, setCode] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [txInput, setTxInput] = useState("");
  const [original, setOriginal] = useState<ImportedReceipt | null>(null);
  const [fields, setFields] = useState<ReceiptFields | null>(null);
  const [evidence, setEvidence] = useState<ChainEvidence | null>(null);
  const [activeTx, setActiveTx] = useState<string | null>(null);
  const [sampleOnly, setSampleOnly] = useState(false);
  const [issuerState, setIssuerState] = useState<IssuerPolicyState>(readIssuerPolicyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const copySequence = useRef(0);
  const hash = useReceiptHash(fields);

  function clearResult(): void {
    sequence.current += 1; copySequence.current += 1; controller.current?.abort();
    setEvidence(null); setOriginal(null); setFields(null); setActiveTx(null);
    setSampleOnly(false); setBusy(false); setError(null); setNotice("");
  }

  async function readProof(txHash: string): Promise<void> {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const request = ++sequence.current;
    setBusy(true); setActiveTx(txHash); setEvidence(null); setError(null); setNotice("");
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
    setFields({ ...clean.receipt }); setSampleOnly(false);
    setJsonText(importJSON(clean)); setTxInput(""); setCode(clean.receipt.receiptCode);
    void readProof(clean.txHash);
  }

  function useRecord(record: ReceiptRecord | PendingReceipt): void {
    clearResult(); setCode(record.receipt.receiptCode);
    if ("txHash" in record) {
      setMode("code");
      loadInput({ receipt: record.receipt, txHash: record.txHash, receiptHash: record.receiptHash });
    } else {
      setMode("json"); setJsonText(serializePendingReceipt(record)); setTxInput("");
      setNotice("Unresolved recovery draft — not proof. Find its real transaction hash in QoreX history or Explorer (Testnet), then paste it below. Do not rebroadcast.");
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
        throw new Error("That code is not saved on this browser. On another device, use the self-contained verification link, QR text, or receipt JSON.");
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
    clearResult(); setMode("json"); setJsonText(""); setTxInput(SAMPLE_TX_HASH); setBusy(true);
    const request = sequence.current;
    let input: ImportedReceipt | null = null;
    try { input = await resolveTestnetSample(loadReceipts()); } catch { /* Storage is not needed to inspect public chain evidence. */ }
    if (request !== sequence.current) return;
    if (input) { loadInput(input); return; }
    // The original is not on-chain. Never invent fields, substitute the memo as a
    // local digest, or manufacture VERIFIED just to make this demo look clean.
    setSampleOnly(true);
    void readProof(SAMPLE_TX_HASH);
    setNotice("Real Diana example loaded. No matching original receipt was found locally. Chain evidence is live; import its exported receipt JSON to establish hash equality and activate the tamper simulator.");
  }

  function tamper(): void {
    if (!fields || !original) return;
    const index = SCAN_CATEGORIES.indexOf(original.receipt.scanCategory as typeof SCAN_CATEGORIES[number]);
    setFields({ ...fields, scanCategory: SCAN_CATEGORIES[(index + 1) % SCAN_CATEGORIES.length] });
    setNotice("Local category changed. Saved originals and the on-chain transaction are unchanged. No transaction was sent.");
  }

  function reset(): void {
    if (!original) return;
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
  else if (sampleOnly && evidence?.success && evidence.anchoredHash) {
    verdict = evidence.anchoredHash !== SAMPLE_EXPECTED_HASH
      ? { kind: "failed", title: "SAMPLE ANCHOR DOES NOT MATCH", detail: "The live transaction memo differs from the supplied sample reference. No sample verification is assumed." }
      : !evidence.hybridVerified
        ? { kind: "incomplete", title: "HYBRID PROOF INCOMPLETE", detail: "The sample has an anchor, but the live supported extension, classical signature, and hybrid event are all required." }
        : { kind: "incomplete", title: "ORIGINAL RECEIPT REQUIRED", detail: "The live sample has a successful hybrid-signed anchor. Its five original fields are not stored on-chain and were not supplied. A memo hash alone cannot verify a receipt." };
  }
  if (issuerState.error && (verdict.kind === "verified" || verdict.kind === "unauthorized")) {
    verdict = { kind: "incomplete", title: "ISSUER POLICY UNAVAILABLE", detail: "The local issuer policy could not be safely read or saved. Existing evidence is shown, but permissioned verification fails closed until you explicitly recover the policy." };
  }
  const suppliedHashDiffers = !!(original?.receiptHash && evidence?.anchoredHash && original.receiptHash !== evidence.anchoredHash);
  const changedCount = fields && original ? Object.keys(original.receipt).filter((key) => fields[key as keyof ReceiptFields] !== original.receipt[key as keyof ReceiptFields]).length : 0;

  function saveVerified(): void {
    if (!fields || !evidence?.anchoredHash || verdict.kind !== "verified" || issuerState.error) return;
    try { onSave(createReceiptRecord(fields, evidence.anchoredHash, evidence.txHash)); setNotice("Verified receipt saved on this browser. Recover it by its receipt code or export JSON."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save the verified receipt. Existing records were not overwritten."); }
  }

  return <section className="page verify-page" aria-labelledby="verify-heading">
    <div className="page-heading"><div><div className="eyebrow">VERIFICATION / CRYPTOGRAPHIC EVIDENCE</div><h1 id="verify-heading">Verify integrity<span className="heading-period">.</span></h1><p>Read the chain. Recompute the commitment. Test a local revision.</p></div><span className="instrument-tag"><Icon name="shield" size={15} /> READ ONLY / NO WALLET</span></div>
    <form className="panel lookup-panel" onSubmit={(event) => { void verify(event); }}>
      <div className="lookup-heading"><div><div className="section-number">RECEIPT SOURCE</div><h2>Load a receipt</h2></div><div className="segmented-control" aria-label="Receipt lookup method"><button type="button" className={mode === "code" ? "selected" : ""} aria-pressed={mode === "code"} disabled={busy} onClick={() => switchMode("code")}><Icon name="search" size={15} /> Saved code</button><button type="button" className={mode === "json" ? "selected" : ""} aria-pressed={mode === "json"} disabled={busy} onClick={() => switchMode("json")}><Icon name="qr" size={15} /> JSON / QR / URL</button></div></div>
      {mode === "code" ? <><label className="sr-only" htmlFor="verify-lookup-code">Saved receipt code</label><div className="lookup-row"><div className="search-input-wrap"><Icon name="receipt" size={19} /><input id="verify-lookup-code" value={code} onChange={(event) => { clearResult(); setCode(event.target.value.toUpperCase()); }} placeholder="CHT-4821" autoComplete="off" spellCheck={false} maxLength={12} required disabled={busy} /></div><button className="button primary" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shield" size={17} />}{busy ? "Reading…" : "Verify Chit"}<Icon name="arrow" size={16} /></button></div><p className="lookup-help">Code lookup is local to <strong>this browser</strong>. For a different device, use the QR’s verification link or receipt JSON.</p>{records.length > 0 && <div className="recent-receipts"><span>LOCAL SERIALS</span><div className="saved-chips">{records.slice(-4).reverse().map((record) => <button key={record.receipt.receiptCode} type="button" disabled={busy} onClick={() => useRecord(record)}>{record.receipt.receiptCode}<Icon name="chevron" size={13} /></button>)}</div></div>}</> : <div className="json-import">
        <div className="field"><label htmlFor="verify-json">Receipt JSON or verification link <span className="field-tag">NON-IDENTIFYING ONLY</span></label><textarea id="verify-json" value={jsonText} onChange={(event) => { clearResult(); setJsonText(event.target.value); }} placeholder="Paste receipt JSON, a scanned verification URL, or #verify=…" rows={4} maxLength={12_000} autoComplete="off" spellCheck={false} required disabled={busy} /><small>Only the five controlled fields and proof metadata. Extra fields, names, diagnoses, patient identifiers and free-text notes are rejected. Import does not save the receipt.</small></div>
        <div className="json-import-bottom"><div className="field"><label htmlFor="verify-tx">Transaction hash <span className="field-tag">IF ABSENT FROM JSON</span></label><input id="verify-tx" value={txInput} onChange={(event) => { clearResult(); setTxInput(event.target.value); }} placeholder="64 hexadecimal characters" maxLength={66} autoComplete="off" spellCheck={false} disabled={busy} className="mono-input" /></div><div className="import-actions"><label className={`button secondary file-button ${busy ? "disabled" : ""}`}><Icon name="upload" size={16} /> Load text file<input type="file" accept=".json,.txt,application/json,text/plain" onChange={(event) => { void importFile(event); }} disabled={busy} aria-label="Load receipt JSON or verification-link text file locally" /></label><button className="button primary" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shield" size={17} />}{busy ? "Reading…" : "Verify Chit"}<Icon name="arrow" size={16} /></button></div></div>
      </div>}
      <div className="sample-toolbar"><button className="button sample-button" type="button" disabled={busy} onClick={() => { void loadSample(); }}><Icon name="globe" size={16} /> Load Live Testnet Sample <Icon name="arrow" size={15} /></button><span>REAL DIANA TRANSACTION / MATCHING ORIGINAL REQUIRED</span></div>
      {sampleOnly && <div className="sample-reference"><span>SUPPLIED SAMPLE COMMITMENT / NOT A COMPUTED RECEIPT HASH</span><code>{SAMPLE_EXPECTED_HASH}</code><p>The hash is not reversible. If the matching original is not in this browser, import its exported receipt JSON. No clean receipt verification is fabricated.</p></div>}
      {error && <div className="alert error-alert" role="alert"><Icon name="alert" size={19} /><span>{error}</span></div>}
      {notice && <p className="inline-notice" role="status">{notice}</p>}
    </form>
    <IssuerPolicyPanel state={issuerState} onChange={setIssuerState} signerAddress={evidence?.signerAddress ?? null} />
    <div className={`verdict-banner verdict-${verdict.kind}`} role="status" aria-live="polite"><div className="verdict-icon">{busy ? <span className="spinner" /> : <Icon name={verdict.kind === "verified" ? "shield" : ["tampered", "failed", "unauthorized"].includes(verdict.kind) ? "alert" : "hash"} size={24} />}</div><div><span className="section-number">RECEIPT INTEGRITY / {issuerState.policy.enabled ? "LOCAL PERMISSIONED MODE" : "UNPERMISSIONED MODE"}</span><h2>{verdict.title}</h2><p>{verdict.detail}</p></div>{verdict.kind === "verified" && <span className="proof-seal"><Icon name="check" size={17} /> HYBRID / HASH MATCH</span>}</div>
    <div className="verify-grid">
      <section className="panel edit-panel" aria-labelledby="tamper-heading"><div className="panel-heading"><div><div className="section-number">LOCAL RECEIPT / MUTABLE COPY</div><h2 id="tamper-heading">Tamper simulator</h2><p>Edit a valid parameter. SHA-256 recomputes immediately.</p></div><span className={`revision-tag ${changedCount ? "revision-edited" : ""}`}>{fields ? `${changedCount} EDIT${changedCount === 1 ? "" : "S"}` : "INACTIVE"}</span></div>
        <div className="tamper-tools"><button type="button" className="button tamper-button" disabled={!original} onClick={tamper}><Icon name="alert" size={16} /> Simulate Tamper</button><button type="button" className="button secondary" disabled={!original} onClick={reset}><Icon name="refresh" size={15} /> Reset</button></div>
        {fields && original ? <><ReceiptFieldsForm value={fields} onChange={setFields} editing original={original.receipt} idPrefix="verify-edit" /><p className="local-only-note"><Icon name="lock" size={15} /> Edits stay in memory. Saved originals, issuer policy, and the chain are never modified by this simulator.</p><details className="canonical-inspector"><summary>Inspect canonical JSON<Icon name="chevron" size={15} /></summary><div><span>ORIGINAL IMPORTED PARAMETERS</span><pre>{canonicalReceiptJSON(original.receipt)}</pre><span>CURRENT LOCAL PARAMETERS</span><pre>{hash.canonical ?? "No valid normalized receipt parameters"}</pre></div></details><div className="verified-actions"><button type="button" className="button primary full-width" disabled={verdict.kind !== "verified"} onClick={saveVerified}><Icon name="download" size={16} /> Save verified receipt locally</button><button type="button" className="button secondary full-width" onClick={() => { try { void copyValue(createVerificationLink(original), "Original verification link"); } catch { setNotice("The original verification link could not be created. Export the original receipt JSON instead."); } }}><Icon name="copy" size={16} /> Copy original verification link</button></div></> : <div className="editor-empty"><div className="editor-empty-symbol"><Icon name="receipt" size={30} /></div><h3>{sampleOnly ? "Original sample receipt required" : "Awaiting receipt parameters"}</h3><p>{sampleOnly ? "The transaction contains a hash, not its preimage. Supply the original five non-identifying fields to activate live comparison and tampering." : "Load a saved receipt, JSON, or self-contained QR link. The five editable fields appear here after strict schema validation."}</p><div className="empty-field-lines" aria-hidden="true"><span /><span /><span /><span /></div></div>}
      </section>
      <CryptoEvidencePanel evidence={evidence} computedHash={hash.hash} activeTx={activeTx} busy={busy} verdict={verdict} receiptPresent={!!fields} suppliedHashDiffers={suppliedHashDiffers} onRetry={() => { if (activeTx) void readProof(activeTx); }} onCopy={(value, label) => { void copyValue(value, label); }} />
    </div>
    <div className="proof-limits"><Icon name="info" size={18} /><p><strong>Hash integrity, not clinical truth.</strong> VERIFIED requires matching receipt fields, successful chain delivery, and accepted hybrid evidence. A local allowlist adds your issuer policy only. None proves a scan occurred, patient identity, medical facts, clinic licensure, or legal authorization.</p></div>
  </section>;
}
