import { useState, type FormEvent } from "react";
import { copyText } from "../lib/export.js";
import { defaultIssuerPolicy, DEMO_ISSUERS, ISSUER_STORAGE_KEY, loadIssuerPolicy, normalizeIssuerAddress, saveIssuerPolicy, type IssuerPolicy } from "../lib/issuers.js";
import { Icon } from "./Icon.js";

export interface IssuerPolicyState { policy: IssuerPolicy; error: string | null }
export function readIssuerPolicyState(): IssuerPolicyState {
  try { return { policy: loadIssuerPolicy(), error: null }; }
  catch (error) {
    return { policy: { version: 1, enabled: true, addresses: [] }, error: error instanceof Error ? error.message : "Issuer policy is unavailable. Verification fails closed." };
  }
}

export function IssuerPolicyPanel({ state, onChange, signerAddress }: { state: IssuerPolicyState; onChange: (state: IssuerPolicyState) => void; signerAddress: string | null }): JSX.Element {
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [copySequence] = useState(() => ({ value: 0 }));

  function commit(policy: IssuerPolicy): void {
    setInputError(null); setNotice("");
    try { onChange({ policy: saveIssuerPolicy(policy), error: null }); setNotice("Issuer policy saved on this browser only. No transaction or server update."); }
    catch (error) {
      // Retain previous policy and block any VERIFIED claim until storage recovers.
      onChange({ policy: state.policy, error: error instanceof Error ? error.message : "Issuer policy could not be saved; verification fails closed." });
    }
  }

  function add(value: string): void {
    setInputError(null);
    try {
      const clean = normalizeIssuerAddress(value);
      if (state.policy.addresses.includes(clean)) { setNotice("That public signer address is already listed."); return; }
      commit({ ...state.policy, addresses: [...state.policy.addresses, clean] });
      setAddress("");
    } catch (error) { setInputError(error instanceof Error ? error.message : "Enter a valid qor1… issuer address."); }
  }

  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); add(address); }
  function resetPolicy(): void {
    if (!window.confirm("Replace this browser’s issuer allowlist with the demo defaults and turn permissioned mode off? Receipt archives and on-chain transactions are not changed.")) return;
    try {
      // Explicit human-approved recovery, never an automatic corruption fallback.
      window.localStorage.removeItem(ISSUER_STORAGE_KEY);
      onChange({ policy: saveIssuerPolicy(defaultIssuerPolicy()), error: null });
      setInputError(null); setNotice("Local issuer policy reset to the unpermissioned demo defaults.");
    } catch (error) {
      onChange({ policy: { version: 1, enabled: true, addresses: [] }, error: error instanceof Error ? error.message : "Issuer policy could not be reset. Verification fails closed." });
    }
  }

  async function copyAddress(value: string): Promise<void> {
    const request = ++copySequence.value;
    try { await copyText(value); if (request === copySequence.value) setNotice("Public issuer address copied."); }
    catch { if (request === copySequence.value) setNotice("Clipboard access failed. Select the public address manually."); }
  }

  const listed = !!(signerAddress && state.policy.addresses.includes(signerAddress));
  return <section className={`panel issuer-panel ${state.policy.enabled ? "issuer-enabled" : ""}`} aria-labelledby="issuer-policy-heading">
    <div className="issuer-policy-bar"><div><div className="section-number">LOCAL TRUST POLICY / OPTIONAL</div><h2 id="issuer-policy-heading">Authorized facility / issuer allowlist</h2><p>Checks the on-chain <code>MsgSend.from_address</code>, never the facility tag.</p></div><label className="policy-switch"><input type="checkbox" role="switch" aria-label="Enable permissioned issuer mode" checked={state.policy.enabled} onChange={(event) => commit({ ...state.policy, enabled: event.target.checked })} /><span className="switch-track" aria-hidden="true" /><span>{state.policy.enabled ? "Permissioned" : "Unpermissioned"}</span></label></div>
    {state.error && <div className="alert error-alert" role="alert"><Icon name="alert" size={18} /><span>{state.error} No VERIFIED result is allowed while this error persists.</span></div>}
    <details className="issuer-inspector" open={state.error ? true : undefined}><summary><Icon name="shield" size={16} /><span>Inspect local authorized issuers</span><span className="count-pill">{state.policy.addresses.length}</span><Icon name="chevron" size={15} /></summary><div className="issuer-inspector-body"><p className="issuer-disclaimer">Demo entries are not vetted clinics. The sample signer is observed on testnet; demo A / B are synthetic addresses. Your local list expresses your trust decision, not identity or licensure.</p>
      {signerAddress && <div className="current-issuer"><span>ON-CHAIN SIGNER</span><code>{signerAddress}</code><div><span className={`issuer-membership ${listed ? "listed" : "unlisted"}`}>{listed ? "Listed locally" : "Not listed"}</span>{!listed && <button className="text-button" type="button" onClick={() => add(signerAddress)}><Icon name="plus" size={14} /> Add this issuer</button>}</div></div>}
      <ul className="issuer-addresses">{state.policy.addresses.map((entry) => <li key={entry}><div><code>{entry}</code><small>{DEMO_ISSUERS.find((demo) => demo.address === entry)?.label ?? "Locally added public clinic signer — identity not vetted"}</small></div><button className="icon-button" type="button" aria-label={`Copy issuer ${entry}`} onClick={() => { void copyAddress(entry); }}><Icon name="copy" size={15} /></button><button className="icon-button" type="button" aria-label={`Remove issuer ${entry} from local allowlist`} onClick={() => commit({ ...state.policy, addresses: state.policy.addresses.filter((item) => item !== entry) })}><Icon name="x" size={16} /></button></li>)}</ul>
      {!state.policy.addresses.length && <p className="issuer-disclaimer">Empty allowlist: no issuer can pass permissioned verification.</p>}
      <form onSubmit={submit} className="issuer-add-form"><div className="field"><label htmlFor="issuer-address">Add a public clinic signer address</label><input id="issuer-address" value={address} onChange={(event) => { setAddress(event.target.value); setInputError(null); }} placeholder="qor1… address with checksum" maxLength={64} autoComplete="off" spellCheck={false} required className="mono-input" /><small>Public qor address only. No clinic names, patient data, labels, or private keys.</small></div><button type="submit" className="button secondary"><Icon name="plus" size={16} /> Add locally</button></form>
      {inputError && <p className="metadata-warning" role="alert">{inputError}</p>}
      <button type="button" className="text-button reset-policy" onClick={resetPolicy}><Icon name="refresh" size={14} /> Reset local issuer policy</button>
    </div></details>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </section>;
}
