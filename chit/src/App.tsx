import { useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon.js";
import { IssueView } from "./components/IssueView.js";
import { VerifyView, type VerificationSeed } from "./components/VerifyView.js";
import { HowItWorks } from "./components/HowItWorks.js";
import { LocalFileFingerprint } from "./components/LocalFileFingerprint.js";
import { NetworkStatus } from "./components/NetworkStatus.js";
import { connectQoreX, type WalletConnection } from "./lib/qorex.js";
import { CHAIN_ID } from "./lib/network.js";
import { decodeVerificationFragment } from "./lib/share.js";
import { clearPendingReceipt, loadPendingReceipts, loadReceipts, PENDING_STORAGE_KEY, removeReceipt, saveReceipt, serializePendingReceipt, serializeReceipt, STORAGE_KEY, type PendingReceipt, type ReceiptRecord } from "./lib/receipt.js";
import { downloadText } from "./lib/export.js";

type WorkspaceView = "issue" | "verify" | "how";
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
  const [view, setView] = useState<WorkspaceView>("issue");
  const [local, setLocal] = useState<LocalState>(readLocalState);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [seed, setSeed] = useState<VerificationSeed | null>(null);
  const connectingPromise = useRef<Promise<WalletConnection> | null>(null);
  const consumedFragment = useRef<string | null>(null);

  const refresh = (): void => setLocal(readLocalState());
  useEffect(() => {
    const storageChanged = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === PENDING_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", storageChanged);
    return () => window.removeEventListener("storage", storageChanged);
  }, []);

  useEffect(() => {
    const consume = (): void => {
      const fragment = window.location.hash;
      if (fragment === consumedFragment.current) return;
      consumedFragment.current = fragment;
      try {
        const input = decodeVerificationFragment(fragment);
        if (!input) return;
        setSeed((previous) => ({ input, nonce: (previous?.nonce ?? 0) + 1 }));
        setView("verify");
      } catch (error) {
        // A bad link must clear any previous VERIFIED evidence, not reuse it.
        setSeed((previous) => ({ error: error instanceof Error ? error.message : "Invalid verification link.", nonce: (previous?.nonce ?? 0) + 1 }));
        setView("verify");
      }
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
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
  const navigation: Array<{ view: WorkspaceView; label: string; icon: "receipt" | "shield" | "info" }> = [
    { view: "issue", label: "Issue", icon: "receipt" },
    { view: "verify", label: "Verify", icon: "shield" },
    { view: "how", label: "How It Works", icon: "info" },
  ];

  return <>
    <a className="skip-link" href="#workspace-main">Skip to Chit workspace</a>
    <header className="site-header">
      <div className="header-identity"><a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView("issue"); }} aria-label="Chit — issue workspace">chit<span>.</span></a><span className="brand-description">CLINICAL RECEIPT<br />INTEGRITY INSTRUMENT</span><NetworkStatus /></div>
      {wallet ? <button className="wallet-button connected" type="button" title="Forget the local connection; wallet permissions are not revoked" aria-label={`Connected QoreX account ${wallet.address}. Disconnect locally.`} onClick={() => { setWallet(null); setWalletError(null); }}><span className="status-dot" /><span>{wallet.address.slice(0, 8)}…{wallet.address.slice(-5)}</span><Icon name="wallet" size={16} /></button> : <button className="wallet-button" type="button" disabled={connecting} onClick={() => { void connect().catch(() => undefined); }}>{connecting ? <span className="spinner" /> : <Icon name="wallet" size={17} />}<span>{connecting ? "Connecting…" : "Connect QoreX"}</span></button>}
    </header>
    <div className="workspace-frame">
      <main id="workspace-main" className="workspace-main" tabIndex={-1}>
        <div className="workspace-rail"><nav className="workspace-tabs" aria-label="Workspace navigation">{navigation.map((item) => <button key={item.view} className={view === item.view ? "active" : ""} type="button" aria-current={view === item.view ? "page" : undefined} onClick={() => setView(item.view)}><Icon name={item.icon} size={16} />{item.label}</button>)}</nav><span className="workspace-classification"><Icon name="lock" size={13} /> ZERO PATIENT DATA<span className="rail-divider" /> QUANTUM PASS</span></div>
        {walletError && <div className="alert error-alert global-alert" role="alert"><Icon name="wallet" size={19} /><span>{walletError}</span><button type="button" className="icon-button" aria-label="Dismiss wallet error" onClick={() => setWalletError(null)}><Icon name="x" size={16} /></button></div>}
        {local.error && <div className="alert warning-alert global-alert" role="alert"><Icon name="alert" size={19} /><span>{local.error}</span></div>}
        <div hidden={view !== "issue"}><IssueView wallet={wallet} connect={connect} knownCodes={knownCodes} pendingReceipts={local.pending} onRefresh={refresh} onVerify={openReceipt} /></div>
        <div hidden={view !== "verify"}><VerifyView records={local.records} seed={seed} onSave={saveVerified} /></div>
        <div hidden={view !== "how"}><HowItWorks /></div>
        <div className="utility-deck"><LocalFileFingerprint />
          <section className="panel local-recovery" aria-label="Local receipt recovery"><details><summary><Icon name="receipt" size={19} /><span>Local receipt archive</span><span className="utility-tag">{local.records.length} SAVED{local.pending.length ? ` / ${local.pending.length} UNRESOLVED` : ""}</span><Icon name="chevron" size={15} /></summary><div className="recovery-body"><p>Recover by code on this browser, or export JSON for another device. Deleting a QR does not remove this archive. Clearing browser data does.</p>{!local.records.length && !local.pending.length && <div className="archive-empty">No receipts saved on this browser.</div>}{local.records.slice().reverse().map((record) => <div className="recovery-row" key={record.receipt.receiptCode}><button className="recovery-open" type="button" onClick={() => openReceipt(record)}><Icon name="receipt" size={16} /><span>{record.receipt.receiptCode}</span><span className="recovery-category">{record.receipt.scanCategory}</span><Icon name="arrow" size={15} /></button><button className="icon-button" type="button" aria-label={`Export ${record.receipt.receiptCode} JSON`} onClick={() => downloadText(`${record.receipt.receiptCode}.json`, serializeReceipt(record, true))}><Icon name="download" size={16} /></button><button className="icon-button" type="button" aria-label={`Remove local ${record.receipt.receiptCode}`} onClick={() => forgetReceipt(record)}><Icon name="trash" size={16} /></button></div>)}{local.pending.length > 0 && <p className="pending-label">UNRESOLVED / Recover a real transaction hash. These drafts are not proof. Never rebroadcast blindly.</p>}{local.pending.map((record) => <div className="recovery-row" key={`pending-${record.receipt.receiptCode}`}><button className="recovery-open" type="button" onClick={() => openReceipt(record)}><Icon name="clock" size={16} /><span>{record.receipt.receiptCode}</span><span className="recovery-category">Needs transaction hash</span><Icon name="arrow" size={15} /></button><button className="icon-button" type="button" aria-label={`Export unresolved ${record.receipt.receiptCode} draft`} onClick={() => downloadText(`${record.receipt.receiptCode}-pending.json`, serializePendingReceipt(record))}><Icon name="download" size={16} /></button></div>)}</div></details></section>
        </div>
        <footer className="site-footer"><span><strong>chit.</strong> HASH INTEGRITY / NOT CLINICAL TRUTH</span><span>{CHAIN_ID} · OPEN SOURCE / MIT · v1</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Bottom workspace navigation">{navigation.map((item) => <button key={item.view} type="button" className={view === item.view ? "active" : ""} aria-current={view === item.view ? "page" : undefined} onClick={() => setView(item.view)}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</nav>
  </>;
}
