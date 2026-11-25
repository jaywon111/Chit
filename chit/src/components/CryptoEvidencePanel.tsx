import { Icon } from "./Icon.js";
import { CHAIN_ID, REST_BASE, explorerTxUrl } from "../lib/network.js";
import { compareReceiptDigests } from "../lib/hashDiff.js";
import type { ChainEvidence, VerificationVerdict } from "../lib/verify.js";

function Digest({ value, peer, placeholder }: { value: string | null; peer: string | null; placeholder: string }): JSX.Element {
  if (!value) return <div className="digest-placeholder">{placeholder}</div>;
  return <code className="digest" aria-label={value}>{Array.from({ length: 8 }, (_, group) => <span className="digest-group" aria-hidden="true" key={group}>{Array.from({ length: 8 }, (_, offset) => {
    const index = group * 8 + offset;
    return <span className={peer && peer[index] !== value[index] ? "digest-changed" : ""} key={index}>{value[index]}</span>;
  })}</span>)}</code>;
}

export function CryptoEvidencePanel({ evidence, computedHash, activeTx, busy, verdict, receiptPresent, suppliedHashDiffers, onRetry, onCopy }: {
  evidence: ChainEvidence | null;
  computedHash: string | null;
  activeTx: string | null;
  busy: boolean;
  verdict: VerificationVerdict;
  receiptPresent: boolean;
  suppliedHashDiffers: boolean;
  onRetry: () => void;
  onCopy: (value: string, label: string) => void;
}): JSX.Element {
  const diff = compareReceiptDigests(evidence?.anchoredHash ?? null, computedHash);
  const height = evidence && /^\d{1,18}$/.test(evidence.height) ? evidence.height : null;
  const timestamp = evidence && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(evidence.timestamp) ? evidence.timestamp : null;
  const proofChecks = [
    { label: "Diana network", value: evidence?.chainId ?? "Not checked", pass: evidence?.chainId === CHAIN_ID },
    { label: "tx_response.code === 0", value: evidence ? `code ${evidence.code ?? "unknown"} / ${evidence.success ? "committed" : "not successful"}` : "Awaiting transaction", pass: !!evidence?.success },
    { label: "PQCHybridSignature", value: evidence ? `ML-DSA-87 / ${evidence.extension.signatureBytes?.toLocaleString("en-US") ?? "unknown"} bytes` : "Expected ML-DSA-87 / 4,627 bytes", pass: !!evidence?.extension.validShape },
    { label: "Classical signature", value: evidence ? `secp256k1 / ${evidence.classicalSignatureBytes ?? "unknown"} bytes` : "Expected secp256k1 / 64 or 65 bytes", pass: !!evidence?.classicalSignatureValid },
    { label: "pqc_hybrid_verify", value: evidence?.pqcEventStatus ?? "Awaiting event status", pass: !!evidence?.pqcEventVerified },
  ];

  return <section className="panel crypto-evidence-panel" aria-labelledby="evidence-heading">
    <div className="panel-heading"><div><div className="section-number">IMMUTABLE CHAIN / LOCAL RECOMPUTATION</div><h2 id="evidence-heading">Cryptographic evidence & hash diff</h2></div><button className="icon-button" type="button" aria-label="Recheck live on-chain evidence" disabled={busy || !activeTx} onClick={onRetry}><Icon name="refresh" size={18} /></button></div>
    <div className={`hash-pair ${diff?.matches && verdict.kind === "verified" ? "hashes-match" : diff && !diff.matches ? "hashes-mismatch" : ""}`}>
      <div className="hash-cell"><div className="hash-label"><strong>On-Chain Memo Hash</strong><button className="icon-button" type="button" aria-label="Copy anchored SHA-256 hash" disabled={!evidence?.anchoredHash} onClick={() => { if (evidence?.anchoredHash) onCopy(evidence.anchoredHash, "Anchored hash"); }}><Icon name="copy" size={15} /></button></div><small>ANCHORED HASH / CHIT:v1</small><Digest value={evidence?.anchoredHash ?? null} peer={computedHash} placeholder={busy ? "Reading the transaction…" : "No supported chain anchor yet"} /></div>
      <div className="hash-cell"><div className="hash-label"><strong>Recomputed Local SHA-256</strong><button className="icon-button" type="button" aria-label="Copy computed SHA-256 hash" disabled={!computedHash} onClick={() => { if (computedHash) onCopy(computedHash, "Computed hash"); }}><Icon name="copy" size={15} /></button></div><small>COMPUTED HASH / EDITABLE RECEIPT</small><Digest value={computedHash} peer={evidence?.anchoredHash ?? null} placeholder={receiptPresent ? "Recomputing valid local parameters…" : "Original receipt fields required"} /></div>
    </div>
    <div className={`hash-diff-result ${diff ? diff.matches ? "diff-match" : "diff-mismatch" : ""}`} role="status"><Icon name={diff ? diff.matches ? "check" : "alert" : "hash"} size={17} /><strong>{diff ? diff.matches ? "HASHES MATCH" : "HASH MISMATCH" : "COMPARISON PENDING"}</strong><span>{diff ? `${diff.differentBytes} / 32 bytes differ` : "Two actual digests required"}</span></div>
    {diff && !diff.matches && <p className="diff-explanation">Crimson positions differ from the on-chain commitment. {diff.differentHexPositions} of 64 hexadecimal positions changed. The transaction and original receipt are unchanged.</p>}
    {suppliedHashDiffers && <p className="metadata-warning">The JSON’s claimed receiptHash differs from the actual anchor. Supplied metadata is not trusted as chain evidence.</p>}
    <div className="chain-evidence-heading"><span>ON-CHAIN ATTESTATION</span><span className="evidence-origin">{busy ? "READING LCD" : evidence ? "LIVE READ / DIANA" : "NOT YET READ"}</span></div>
    <dl className="evidence-metrics"><div><dt>Block height</dt><dd>{height ?? "—"}</dd></div><div><dt>Transaction result</dt><dd className={evidence?.success ? "metric-pass" : evidence ? "metric-fail" : ""}>{evidence ? evidence.code === 0 ? "0 / SUCCESS CODE" : `${evidence.code ?? "?"} / NOT SUCCESS` : "—"}</dd></div></dl>
    <div className="evidence-signer"><span>SIGNER / MsgSend.from_address</span><code>{evidence?.signerAddress ?? "No unique supported sender established"}</code>{evidence?.signerAddress && <button className="icon-button" type="button" aria-label="Copy on-chain issuer address" onClick={() => onCopy(evidence.signerAddress!, "On-chain issuer address")}><Icon name="copy" size={15} /></button>}</div>
    <div className="proof-checks">{proofChecks.map((check) => <div className="proof-check" key={check.label}><span className={`proof-check-icon ${check.pass ? "pass" : evidence ? "not-pass" : ""}`}><Icon name={check.pass ? "check" : evidence ? "x" : "clock"} size={15} /></span><div><strong>{check.label}</strong><span>{check.value}</span></div><span className={`check-word ${check.pass ? "pass" : ""}`}>{evidence ? check.pass ? "PASS" : "FAIL" : "—"}</span></div>)}</div>
    {evidence && <details className="raw-evidence"><summary>Inspect memo, signature extension & transaction<Icon name="chevron" size={15} /></summary><dl className="proof-facts"><div><dt>On-chain memo</dt><dd>{evidence.anchoredHash ? `CHIT:v1:${evidence.anchoredHash}` : "Unsupported memo / arbitrary contents withheld"}</dd></div><div><dt>PQC extension</dt><dd>{evidence.extension.typeUrl === "/qorechain.pqc.v1.PQCHybridSignature" ? evidence.extension.typeUrl : "Supported PQCHybridSignature not established"}</dd></div><div><dt>Placement / algorithm</dt><dd>{evidence.extension.placement ?? "missing"} / {evidence.extension.algorithmId ?? "unknown"} (expected critical / 1)</dd></div><div><dt>Transaction hash</dt><dd>{evidence.txHash}</dd></div>{timestamp && <div><dt>Block timestamp / not visit certification</dt><dd><time dateTime={timestamp}>{timestamp.replace("T", " / ").replace("Z", " UTC")}</time></dd></div>}</dl></details>}
    {activeTx && <div className="proof-links"><a href={explorerTxUrl(activeTx)} target="_blank" rel="noreferrer">Inspect in Explorer <Icon name="external" size={14} /></a><span>SELECT TESTNET</span></div>}
    {evidence && <details className="source-details"><summary>Verification source & trust boundary</summary><p className="breakable"><a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceUrl}</a></p><p>{REST_BASE.startsWith("/") ? "Read through the same-origin /lcd proxy to the public chain API." : "Read directly from the configured chain REST endpoint."} Chit trusts the HTTPS node’s result and events; it does not run independent ML-DSA / secp256k1 verification or a light-client inclusion proof. A signature’s byte length alone is not cryptographic proof.</p></details>}
  </section>;
}
