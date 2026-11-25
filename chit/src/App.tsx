import { useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon.js";
import { IssueView } from "./components/IssueView.js";
import { VerifyView, type VerificationSeed } from "./components/VerifyView.js";
import { connectQoreX, type WalletConnection } from "./lib/qorex.js";
import { CHAIN_ID, EVM_CHAIN_ID, EXPLORER_URL, REST_URL, RPC_URL } from "./lib/network.js";
import { clearPendingReceipt, loadPendingReceipts, loadReceipts, PENDING_STORAGE_KEY, removeReceipt, saveReceipt, serializePendingReceipt, serializeReceipt, STORAGE_KEY, type PendingReceipt, type ReceiptRecord } from "./lib/receipt.js";
import { downloadText } from "./lib/export.js";

interface LocalState { records: ReceiptRecord[]; pending: PendingReceipt[]; error: string | null }
function readLocalState(): LocalState {
  let records: ReceiptRecord[] = [];
  let pending: PendingReceipt[] = [];
  const errors: string[] = [];
  try { records = loadReceipts(); } catch (error) { errors.push(error instanceof Error ? error.message : "Saved receipts are unavailable."); }
  try { pending = loadPendingReceipts(); } catch (error) { errors.push(error instanceof Error ? error.message : "Pending drafts are unavailable."); }
  return { records, pending, error: errors.length ? errors.join(" ") : null };
}

export function App(): JSX.Element {
  const [view, setView] = useState<"issue" | "verify">("issue");
  const [local, setLocal] = useState<LocalState>(readLocalState);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [seed, setSeed] = useState<VerificationSeed | null>(null);
  const connectingPromise = useRef<Promise<WalletConnection> | null>(null);
  const howItWorks = useRef<HTMLDialogElement | null>(null);

  const refresh = (): void => setLocal(readLocalState());
  useEffect(() => {
    const storageChanged = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === PENDING_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", storageChanged);
    return () => window.removeEventListener("storage", storageChanged);
  }, []);

  function connect(): Promise<WalletConnection> {
    if (wallet) return Promise.resolve(wallet);
    if (connectingPromise.current) return connectingPromise.current;
    setConnecting(true); setWalletError(null);
    const attempt = connectQoreX().then((connection) => {
      setWallet(connection); return connection;
    }).catch((error: unknown) => {
      setWalletError(error instanceof Error ? error.message : "QoreX connection failed."); throw error;
    }).finally(() => { setConnecting(false); connectingPromise.current = null; });
    connectingPromise.current = attempt;
    return attempt;
  }

  function openReceipt(record: ReceiptRecord | PendingReceipt): void {
    setSeed((previous) => ({ record, nonce: (previous?.nonce ?? 0) + 1 }));
    setView("verify");
  }

  function saveVerified(record: ReceiptRecord): void {
    try { saveReceipt(record); clearPendingReceipt(record.receipt.receiptCode); } finally { refresh(); }
  }

  function forgetReceipt(record: ReceiptRecord): void {
    if (!window.confirm(`Remove ${record.receipt.receiptCode} from this browser? Export its receipt JSON first. This does not delete the on-chain hash.`)) return;
    try { removeReceipt(record.receipt.receiptCode); refresh(); } catch (error) {
      setLocal((previous) => ({ ...previous, error: error instanceof Error ? error.message : "Local storage could not be updated." }));
    }
  }

  const knownCodes = [...local.records, ...local.pending].map((entry) => entry.receipt.receiptCode);
  return <>
    <a className="skip-link" href="#workspace-main">Skip to Chit workspace</a>
    <header className="site-header">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView("issue"); }} aria-label="Chit home"><span className="brand-mark"><Icon name="receipt" size={26} /></span><span className="brand-word">chit<span>.</span></span><span className="brand-divider" /><span className="brand-description">Little receipt.<br />Lasting proof.</span></a>
      <div className="header-actions"><span className="network-pill"><span className="status-dot" /> Diana testnet</span><button type="button" className="header-info icon-button" aria-label="How Chit works" onClick={() => howItWorks.current?.showModal()}><Icon name="info" size={20} /></button>{wallet ? <button className="wallet-button connected" type="button" title="Disconnect: forget the local connection (wallet permissions are not revoked)" onClick={() => { setWallet(null); setWalletError(null); }}><Icon name="wallet" size={18} /><span>{wallet.address.slice(0, 8)}…{wallet.address.slice(-5)}</span><span className="disconnect-label">Disconnect</span></button> : <button className="wallet-button" type="button" disabled={connecting} onClick={() => { void connect().catch(() => undefined); }}>{connecting ? <span className="spinner" /> : <Icon name="wallet" size={18} />}<span>{connecting ? "Connecting…" : "Connect QoreX"}</span></button>}</div>
    </header>
    <div className="workspace-frame">
      <aside className="sidebar" aria-label="Chit workspace navigation">
        <div className="sidebar-top"><span className="nav-label">YOUR WORKSPACE</span><nav className="workspace-nav"><button type="button" className={view === "issue" ? "nav-item active" : "nav-item"} aria-current={view === "issue" ? "page" : undefined} onClick={() => setView("issue")}><Icon name="receipt" size={20} /><span>Issue Chit</span><Icon name="chevron" size={16} /></button><button type="button" className={view === "verify" ? "nav-item active" : "nav-item"} aria-current={view === "verify" ? "page" : undefined} onClick={() => setView("verify")}><Icon name="shield" size={20} /><span>Verify Chit</span><Icon name="chevron" size={16} /></button><button type="button" className="nav-item" onClick={() => howItWorks.current?.showModal()}><Icon name="info" size={20} /><span>How it works</span></button></nav>
          <div className="saved-nav"><div className="saved-nav-heading"><span className="nav-label">LOCAL RECOVERY</span><span className="count-pill">{local.records.length}</span></div>{local.records.length ? <div className="saved-nav-list">{local.records.slice(-5).reverse().map((record) => <button key={record.receipt.receiptCode} type="button" onClick={() => openReceipt(record)}><Icon name="receipt" size={16} /><span>{record.receipt.receiptCode}</span><Icon name="chevron" size={13} /></button>)}</div> : <p className="empty-saved">Your issued Chits appear here.<br />A lost QR doesn’t mean lost proof.</p>}
            {local.records.length > 0 && <details className="manage-storage"><summary>Manage saved Chits</summary>{local.records.map((record) => <div key={record.receipt.receiptCode}><span>{record.receipt.receiptCode}</span><button className="icon-button" type="button" aria-label={`Export ${record.receipt.receiptCode} JSON`} onClick={() => downloadText(`${record.receipt.receiptCode}.json`, serializeReceipt(record, true))}><Icon name="download" size={14} /></button><button className="icon-button" type="button" aria-label={`Remove local ${record.receipt.receiptCode}`} onClick={() => forgetReceipt(record)}><Icon name="trash" size={14} /></button></div>)}</details>}
            {local.pending.length > 0 && <div className="pending-nav"><span className="nav-label">NEEDS RECOVERY</span>{local.pending.map((record) => <button key={record.receipt.receiptCode} type="button" onClick={() => openReceipt(record)}><Icon name="clock" size={15} />{record.receipt.receiptCode}</button>)}</div>}
            <span className="local-storage-label"><Icon name="lock" size={12} /> This browser only</span>
          </div>
        </div>
        <div className="sidebar-bottom"><div className="quantum-card"><span className="quantum-icon"><Icon name="sparkles" size={25} /></span><span className="quantum-card-label">QORECHAIN QUANTUM PASS</span><h3>Small proof.<br />Quantum-ready anchor.</h3><p>Two signature systems.<br />One tamper-evident receipt.</p><span className="quantum-card-footer"><Icon name="shield" size={15} /> secp256k1 + ML-DSA-87</span></div><a className="powered-by" href={EXPLORER_URL} target="_blank" rel="noreferrer"><span className="qore-symbol">Q</span><span>Anchored on <strong>QoreChain</strong></span><Icon name="external" size={13} /></a></div>
      </aside>
      <main id="workspace-main" className="workspace-main" tabIndex={-1}>
        <div className="workspace-context"><span>Workspace <Icon name="chevron" size={12} /> <strong>{view === "issue" ? "Issue Chit" : "Verify Chit"}</strong></span><span className="private-workspace"><Icon name="lock" size={12} /> PRIVACY-FIRST RECEIPTS</span></div>
        {walletError && <div className="alert error-alert global-alert" role="alert"><Icon name="wallet" size={19} /><span>{walletError}</span><button type="button" className="icon-button" aria-label="Dismiss wallet error" onClick={() => setWalletError(null)}><Icon name="x" size={16} /></button></div>}
        {local.error && <div className="alert warning-alert global-alert" role="alert"><Icon name="alert" size={19} /><span>{local.error}</span></div>}
        <div hidden={view !== "issue"}><IssueView wallet={wallet} connect={connect} knownCodes={knownCodes} pendingReceipts={local.pending} onRefresh={refresh} onVerify={openReceipt} /></div>
        <div hidden={view !== "verify"}><VerifyView records={local.records} seed={seed} onSave={saveVerified} /></div>
        {(local.records.length > 0 || local.pending.length > 0) && <section className="panel mobile-recovery" aria-label="Local receipt recovery"><details><summary><Icon name="receipt" size={18} /><span>Saved on this browser</span><span>{local.records.length} Chits</span></summary><p>Open a receipt to verify, export its JSON, or remove its local copy after backing it up. Deleting a QR image never removes these records.</p>{local.records.slice().reverse().map((record) => <div className="mobile-recovery-row" key={record.receipt.receiptCode}><button type="button" onClick={() => openReceipt(record)}><Icon name="receipt" size={16} />{record.receipt.receiptCode}</button><button className="icon-button" type="button" aria-label={`Export ${record.receipt.receiptCode} JSON`} onClick={() => downloadText(`${record.receipt.receiptCode}.json`, serializeReceipt(record, true))}><Icon name="download" size={16} /></button><button className="icon-button" type="button" aria-label={`Remove local ${record.receipt.receiptCode}`} onClick={() => forgetReceipt(record)}><Icon name="trash" size={16} /></button></div>)}{local.pending.length > 0 && <p><strong>Needs a transaction hash:</strong> these recovery drafts are not verified proof.</p>}{local.pending.map((record) => <div className="mobile-recovery-row" key={`pending-${record.receipt.receiptCode}`}><button type="button" onClick={() => openReceipt(record)}><Icon name="clock" size={16} />{record.receipt.receiptCode}</button><button className="icon-button" type="button" aria-label={`Export unresolved ${record.receipt.receiptCode} draft`} onClick={() => downloadText(`${record.receipt.receiptCode}-pending.json`, serializePendingReceipt(record))}><Icon name="download" size={16} /></button></div>)}</details></section>}
        <footer className="site-footer"><span>chit. <span>A receipt worth keeping.</span></span><span>Testnet only · MIT licensed · v1</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile workspace navigation"><button type="button" className={view === "issue" ? "active" : ""} aria-current={view === "issue" ? "page" : undefined} onClick={() => setView("issue")}><Icon name="receipt" size={21} /><span>Issue Chit</span></button><button type="button" className={view === "verify" ? "active" : ""} aria-current={view === "verify" ? "page" : undefined} onClick={() => setView("verify")}><Icon name="shield" size={21} /><span>Verify Chit</span></button><button type="button" onClick={() => howItWorks.current?.showModal()}><Icon name="info" size={21} /><span>How it works</span></button></nav>
    <dialog ref={howItWorks} className="how-dialog" aria-labelledby="how-heading"><div className="dialog-heading"><span className="soft-icon"><Icon name="shield" size={24} /></span><button className="icon-button" type="button" aria-label="Close how it works" onClick={() => howItWorks.current?.close()}><Icon name="x" size={22} /></button></div><div className="eyebrow">HOW CHIT WORKS</div><h2 id="how-heading">Less data.<br /><span className="serif-word">More certainty.</span></h2><ol className="how-steps"><li><span>01</span><div><h3>Make a small receipt</h3><p>Only a recovery code, imaging category, date, clinic tag, and optional predefined note. No patient information.</p></div></li><li><span>02</span><div><h3>Anchor only the hash</h3><p>Browser SHA-256 creates a fingerprint. QoreX broadcasts one native transaction, signed with secp256k1 and ML-DSA-87.</p></div></li><li><span>03</span><div><h3>Check, don’t just believe</h3><p>Verify success, hybrid signature evidence, and the actual transaction memo. Edit a field to see the hash mismatch.</p></div></li></ol><div className="privacy-box"><Icon name="info" size={19} /><p>Integrity is not clinical truth. Chit does not prove a scan occurred, identify a patient, certify a facility, or verify medical facts. Hashes are not encryption; use only generic, non-identifying values.</p></div><dl className="dialog-network"><div><dt>Native chain</dt><dd>{CHAIN_ID}</dd></div><div><dt>EVM chain</dt><dd>{EVM_CHAIN_ID} (native lane anchors)</dd></div><div><dt>REST</dt><dd><a href={REST_URL} target="_blank" rel="noreferrer">{REST_URL}</a></dd></div><div><dt>RPC</dt><dd><a href={RPC_URL} target="_blank" rel="noreferrer">{RPC_URL}</a></dd></div></dl><a className="explorer-link" href="https://docs.qorechain.io/qorex/browser-extension/" target="_blank" rel="noreferrer">QoreX wallet setup & API documentation <Icon name="external" size={15} /></a><button className="button primary full-width" type="button" onClick={() => howItWorks.current?.close()}>Got it <Icon name="check" size={18} /></button></dialog>
  </>;
}
