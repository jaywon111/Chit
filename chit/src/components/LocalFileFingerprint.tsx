import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { copyText } from "../lib/export.js";
import { fingerprintLocalFile, type FileFingerprint } from "../lib/fileFingerprint.js";
import { Icon } from "./Icon.js";

type FingerprintState =
  | { status: "idle" }
  | { status: "hashing" }
  | { status: "ready"; fingerprint: FileFingerprint; request: number }
  | { status: "error"; message: string };
type CopyState = "idle" | "copying" | "copied" | "error";

/** An independent, opt-in local utility; it has no receipt or persistence API. */
export function LocalFileFingerprint(): JSX.Element {
  const [state, setState] = useState<FingerprintState>({ status: "idle" });
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const input = useRef<HTMLInputElement | null>(null);
  const sequence = useRef(0);
  const copySequence = useRef(0);
  const mounted = useRef(false);
  const id = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      copySequence.current += 1;
      if (input.current) input.current.value = "";
    };
  }, []);

  function isCurrent(request: number): boolean {
    return mounted.current && request === sequence.current;
  }

  function clear(): void {
    sequence.current += 1;
    copySequence.current += 1;
    if (input.current) input.current.value = "";
    setState({ status: "idle" });
    setCopyState("idle");
  }

  function chooseFile(): void {
    // Clear before opening the picker, including when a replacement is cancelled.
    clear();
    input.current?.click();
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    // The native input must never retain or display a potentially identifying name.
    event.currentTarget.value = "";
    clear();
    if (!file) return;
    const request = sequence.current;
    setState({ status: "hashing" });
    try {
      const fingerprint = await fingerprintLocalFile(file);
      if (isCurrent(request)) setState({ status: "ready", fingerprint, request });
    } catch (error) {
      if (isCurrent(request)) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not fingerprint the local file. Choose a PDF, PNG, or JPEG file.",
        });
      }
    }
  }

  async function copyHash(): Promise<void> {
    if (state.status !== "ready" || !isCurrent(state.request) || copyState === "copying") return;
    const request = state.request;
    const attempt = ++copySequence.current;
    setCopyState("copying");
    try {
      await copyText(state.fingerprint.hash);
      if (isCurrent(request) && attempt === copySequence.current) setCopyState("copied");
    } catch {
      // copyText's receipt-oriented fallback error is not applicable to this tool.
      if (isCurrent(request) && attempt === copySequence.current) setCopyState("error");
    }
  }

  const fingerprint = state.status === "ready" && state.request === sequence.current ? state.fingerprint : null;
  const busy = state.status === "hashing";

  return <details className="local-file-card panel" onToggle={(event) => { if (!event.currentTarget.open) clear(); }}>
    <summary className="local-file-summary">
      <Icon name="hash" size={20} />
      <span>Check Local File SHA-256 <small className="field-tag">Optional</small></span>
      <Icon name="chevron" size={17} />
    </summary>
    <div className="local-file-body">
      <p className="inline-notice" id={`${id}-privacy`}><Icon name="lock" size={16} /> <span>No file is uploaded. No image bytes touch the blockchain.</span></p>
      <p className="inline-notice">Chit never displays file names or previews. Nothing is saved by this tool. Clear or close this drawer to discard the displayed fingerprint.</p>
      <div className="field">
        <input
          ref={input}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => { void readFile(event); }}
        />
        <div className="import-actions">
          <button type="button" className="button secondary" aria-describedby={`${id}-help ${id}-privacy`} onClick={chooseFile}><Icon name="upload" size={17} />{busy ? "Choose another file" : "Choose local file"}</button>
          <button type="button" className="button subtle" onClick={clear} disabled={state.status === "idle"}><Icon name="x" size={16} />Clear</button>
        </div>
        <small id={`${id}-help`}>PDF, PNG, or JPEG only, up to 32 MiB (33,554,432 bytes). The extension, MIME type when supplied, and detected magic bytes must agree.</small>
      </div>
      <p className="inline-notice"><Icon name="info" size={16} /> <span>This hash does not authenticate the file or link it to a receipt anchor. No receipt is matched, anchored, or verified by this utility.</span></p>
      {busy && <p className="inline-notice" role="status"><span className="spinner" aria-hidden="true" /> Calculating a local SHA-256 fingerprint…</p>}
      {state.status === "error" && <div className="alert error-alert" role="alert"><Icon name="info" size={18} /><span>{state.message}</span></div>}
      {fingerprint && <section aria-label="Local file SHA-256 fingerprint">
        <dl className="file-fingerprint-meta">
          <div><dt>Detected file type</dt><dd>{fingerprint.format}</dd></div>
          <div><dt>File size</dt><dd>{fingerprint.bytes.toLocaleString()} bytes</dd></div>
        </dl>
        <div className="hash-label"><strong>Local SHA-256</strong><button type="button" className="icon-button" aria-label="Copy local SHA-256 hash" disabled={copyState === "copying"} onClick={() => { void copyHash(); }}>{copyState === "copying" ? <span className="spinner" aria-hidden="true" /> : <Icon name="copy" size={16} />}</button></div>
        <code className="file-fingerprint-hash breakable">{fingerprint.hash}</code>
        <p className="inline-notice" role="status">Local fingerprint calculated. This is not file authentication.</p>
      </section>}
      {copyState === "copied" && <p className="inline-notice" role="status">Only the SHA-256 hash was copied to the clipboard.</p>}
      {copyState === "error" && <p className="inline-notice" role="status">Clipboard access failed. Select and copy the hash manually.</p>}
    </div>
  </details>;
}
