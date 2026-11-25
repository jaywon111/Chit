# AI usage and verification record — Chit

## Requested Mobile Harness workflow

The requested project workflow is **Mobile Harness → local model proxy → `gpt-6.2-sol`**, with a developer reviewing the generated changes and manually verifying the real wallet and chain behavior before submission. The local proxy mediates model requests; it must not receive wallet seeds, secret keys, patient data, or identifying medical content.

**Model provenance caveat:** the harness instructions for this actual coding session identify the coding agent as **`gpt-6.1-sol`**, not `gpt-6.2-sol`. Local proxy configuration/logs were not available to independently establish a `gpt-6.2-sol` run. The named `gpt-6.2-sol` workflow above is the user's requested/reported setup, **not a verified model-execution claim for this session**. Confirm the PocketDev model selection and proxy logs before making that claim in a track submission; never relabel this session as a proven 6.2 run.

The **Vite `/lcd` local REST proxy** is a separate mechanism from the **local model proxy**. `/lcd` forwards read-only browser requests to the public Diana REST endpoint to work around CORS. It is not a model proxy, receipt backend, mock chain, or patient database.

## What AI assisted with

- Inspected `chit/package.json`, `src/App.tsx`, `main.tsx`, Vite/environment configuration, and the installed SDK's actual type/API exports before modifying the starter.
- Determined that the starter was a read-only SDK balance/tokenomics page. **No pre-existing QoreX connection or hybrid-signing implementation existed in its `src/` to reuse.** Reused the real SDK/proxy/React structure and added a provider adapter using authoritative current QoreX documentation.
- Implemented the React mobile/desktop workspace and completed `chit/src/instrument.css` plus its `main.tsx` import: system-font Swiss palette, hairline panels, specimen-ticket serial/QR/commitment/badge, live-node indicator, bottom navigation, safe areas, keyboard focus, and reduced-motion rules.
- Added client-only issuer permissioning, the four generic view/context descriptors without changing legacy canonical bytes, self-contained URL-fragment QR sharing/auto-verification, side-by-side digest diffs, a read-only live sample, and the optional zero-upload local file SHA-256 helper.
- Retained local receipt recovery, copy/download JSON, and Explorer links; added expected-field/hash guards so a colliding imported serial cannot automatically clear an unrelated pending draft. Kept persistence warnings separate from integrity verdicts and displayed the actual requested node/proxy source URL.
- Implemented allowlisted non-identifying receipts, a controlled vocabulary for notes, canonical browser WebCrypto SHA-256, strict imports, local-only editable tamper/reset helpers, and fail-closed on-chain evidence classification.
- Added one-broadcast guards and non-PII pending-draft recovery for known-hash, uncertain submission, quota, rejection, and indexing-error cases.
- Wrote documentation, MIT licensing, root command forwarding, and Vitest regression tests.

Earlier focused coding-agent delegations assisted with authoritative QoreX API/SDK integration and receipt/verifier regression review. Earlier read-only reviews checked installed tooling, receipt/signing/verification/share/recovery behavior, sample evidence, pending-draft guards, and unchanged canonical bytes. This spacing/sample request delegated a scoped CSS/component audit and stylesheet implementation plus a separate read-only command/toolchain diagnostic. Bash and the permission-bearing edit/write schemas were rejected during argument validation; the permission-free text editor was used for source changes. No delegated test/build actually executed; no fresh-agent Ralph loop or large orchestration workflow was run. Agents shared project files and public chain data, not wallet secrets.

Receipt examples used generic clinic tags, common scan categories, and test-only serials. No real patient data, medical records, wallet mnemonics, or private/PQC keys were used. Unsafe strings in rejection tests are explicitly synthetic fixtures and are never issued or shown as real receipts. Code/tag regex validation cannot infer operator intent; humans must not encode names or patient identifiers into a valid-shaped tag/serial.

## Source checking and manual code review performed

Authoritative public documentation was fetched and compared with installed `@qorechain/sdk@0.14.0` declarations:

- [QoreX provider types](https://github.com/qorechain/qorex-integrations/blob/main/packages/types/src/providers.ts)
- [Native/Keplr-style integration guide](https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/add-to-keplr-integration.md)
- [Errors and chain-ID rules](https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/errors-and-chain-ids.md)
- [QoreX browser-extension docs](https://docs.qorechain.io/qorex/browser-extension/#sign-and-broadcast)
- [SDK source](https://github.com/qorechain/qorechain-sdk)
- [Explorer network provider](https://github.com/qorechain/qorechain-explorer/blob/main/lib/network-provider.tsx)

Confirmed from those sources:

- The real injection is `window.qorex.native` / `.evm`; supported issuance uses `native.signAndBroadcast` with protobuf-encoded message bytes.
- Current `signDirect` does not add PQC and is not a safe hybrid-signing substitute. Current QoreX EVM `eth_sendTransaction` is not an issuance fallback.
- QoreX's first send may bootstrap PQC registration, and there is no public no-bootstrap flag. Chit requires a fresh existing-key preflight instead of intentionally sending a registration transaction.
- Pre-broadcast signed TxRaw bytes and QoreX wallet internals are not public/exposed. No independent pre-broadcast signature audit or provider-authenticity guarantee is claimed.
- The Explorer requires selecting Testnet; no documented URL network-selector parameter was invented.

Read-only HTTP checks were performed successfully against public endpoints:

- [Diana REST node information](https://api-testnet.qore.host/cosmos/base/tendermint/v1beta1/node_info) identifies `qorechain-diana`.
- [Diana RPC status](https://rpc-testnet.qore.host/status) identifies the same chain, with transaction indexing enabled.
- [PQC parameters](https://api-testnet.qore.host/qorechain/pqc/v1/params) report required hybrid signatures and disabled classical fallback at inspection time.
- An **existing unrelated public transaction**, [665CE057…CBE649A](https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/665CE057AD3F0FEB0E8DFFAD995BE68D179E1F5E110AC8245C55AFCDECBE649A), was read to confirm actual LCD extension/event shape. It had numeric code 0, critical `PQCHybridSignature` algorithm 1, a base64 PQC signature, eth-secp256k1 classical signature, and `pqc_hybrid_verify.status=verified`. **It was not issued by us, had no Chit memo, is not a demo Chit proof, and is never seeded into the app.**

Manual static reviews found and addressed fail-open hazards: absent result defaults, contradictory direct/log PQC events, missing/duplicate event algorithm attributes and unproven success aliases, absent/corrupt classical public-key bytes, trailing-newline memo matching, storage writes that do not retain data, stale hash results during edits, old transaction-hash overrides after importing a new receipt, and blind rebroadcast on uncertain outcomes. Static review is not compilation or end-to-end validation.

## Supplied live sample and remaining verification limits

The [requested live sample transaction](https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD) was inspected read-only in this resume. Its LCD result reported code `0`, height `10725694`, memo `CHIT:v1:7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727`, critical PQCHybridSignature algorithm `1`, and `pqc_hybrid_verify.status=verified` / `algorithm_id=dilithium5`. The observed sender is `qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c`. This read is not a local receipt-verification pass or independent signature/inclusion proof.

The user has now supplied **all five sample fields**: `receiptCode=CHT-4671`, `scanCategory=Chest X-Ray`, `visitDate=11/25/2026`, `facilityTag=CLINIC-A`, `note=Follow-up visit`. The date is represented as ISO `2026-11-25` without changing v1 validation. The exact canonical JSON is `{"facilityTag":"CLINIC-A","note":"Follow-up visit","receiptCode":"CHT-4671","scanCategory":"Chest X-Ray","visitDate":"2026-11-25"}`. No block-timestamp inference, digest inversion, or invented field was used. The button loads a fresh validated copy without depending on a stored receipt, computes real WebCrypto SHA-256, starts the usual live Diana lookup, and enables local edits/reset. A reference hash is never substituted for the computed digest or chain memo. Numerical digest/reference equality and the real UI transition remain **unexecuted** due command-argument validation; tests now independently pin the preimage against Node SHA-256 and the reference. A mismatch must remain a mismatch, not be resolved by weakening canonicalization or evidence checks.

Same-code pending-draft deletion was fixed for observed sequential/single-tab operations, but localStorage reservations/archive updates are still **not atomic across tabs**. Same-page signing guards do not guarantee global uniqueness or browser-wide duplicate prevention; use one issuance tab. Demo allowlist entries are not credential-verified clinics. Facility/receipt format checks are not semantic PII detection. Native QoreX and React UI race/storage regressions still need dedicated integration tests and manual validation; current unit fixtures are classifiers, not cryptographic signatures.

## What was not executed

| Check | Actual session status |
| --- | --- |
| Starter / installed SDK inspection | Performed |
| Public documentation / read-only REST and RPC evidence | Performed |
| Independent manual static code review | Performed |
| Installed dependency manifests / current lock declarations | Present, read-only inspection; not an install/clean reproduction |
| Dependency installation / clean lockfile reproduction in this resume | **NOT RUN** |
| Vitest regression suite | **Written, NOT RUN** |
| TypeScript typecheck | **NOT RUN** |
| `npm run build` / Vite production build | **NOT RUN — no zero-error build claim** |
| Browser rendering / mobile viewport / keyboard / QR scanning | **NOT RUN** |
| Real QoreX connection / wallet approval / hybrid broadcast | **NOT RUN** |
| End-to-end app VERIFIED → TAMPERED → Reset on a real Chit | **NOT RUN** |

The resume attempted `npm test` and `npm run build` with `/workspace/chit/chit` as working directory. Command calls were rejected during argument validation, **before shell launch**, because unwanted optional permission arguments were present: `invalid justification: expected a non-empty sentence` and the same-mode `danger-full-access` escalation validation error. Current file access allows editing, but there are no npm/test/compiler exit codes. Failed tool calls are not executed tests or compiler failures. No approval or successful sandbox escalation occurred. Further malformed command retries were stopped; text-file editing and read-only public HTTP evidence were used instead.

Installed package manifests now confirm `qrcode.react` 4.2.0, Vitest 2.1.9, TypeScript 5.9.3, and Vite 5.4.21; `package-lock.json` includes the current dependency declarations. The old claim that QR/tests were only declared and uninstalled is superseded. No install, clean-lockfile reproduction, or fresh build was performed in this resume. Existing `dist/` files cannot certify these edits.

## Manual end-to-end verification checklist (required before submission)

Run these from `/workspace/chit` once shell execution works:

```sh
npm run setup
cp chit/.env.example chit/.env
npm test
npm run typecheck
npm run build
npm run dev
```

Record actual exit codes/output. Do not mark a build or tests passed based on this checklist alone. Use HTTPS preview or localhost. Mobile verification can run without a wallet; issuance requires a browser that actually injects the supported QoreX provider.

1. **Network and wallet:** Select Diana (`qorechain-diana`, EVM 9800) in QoreX. Use a funded disposable testnet account with a separately completed ML-DSA-87 registration. Do not paste keys into Chit. Confirm wrong-network, missing-wallet/capability, and unregistered-key cases refuse issuance without a transaction.
2. **Privacy:** Confirm the form has only `receiptCode`, the common-category/Custom selector, `visitDate`, a generic `facilityTag`, and a predefined optional note. Try unknown import fields/arbitrary notes and confirm rejection. Never use actual patient data for tests.
3. **One transaction:** Create a generic Chit and accept the non-PII checkbox. In QoreX inspect **one 1-uqor self-send** plus its displayed gas fee and the exact `CHIT:v1:<hash>` memo. Confirm no receipt JSON, bootstrap registration, or EVM-window message is added. Confirm there is only one resulting anchor transaction; double clicks must not prompt/send twice.
4. **Recovery and export:** Copy/download legacy receipt JSON. Independently scan the QR: it must be a verification URL whose `#verify=` base64url tuple contains version 1, all five normalized fields, and the real txHash. Open it on another device without a wallet and confirm automatic Verify/LCD lookup; test `hashchange` and malformed fragments clearing old evidence. Delete the QR image, reload, and recover by serial in the same browser. Code lookup is local; the URL/JSON is the cross-device payload. Verify that a same-code import with different fields/hash cannot erase an unresolved draft.
5. **Chain proof:** Open the real REST transaction URL and compare the actual returned hash, strict code 0, positive height, critical `/qorechain.pqc.v1.PQCHybridSignature`, algorithm 1, 4,627 decoded PQC bytes, 64/65 classical bytes, and successful `pqc_hybrid_verify` status with Chit's displayed evidence. Select Testnet in Explorer. Check both hashes match before accepting **VERIFIED**.
6. **Tamper / reset:** Change a valid scan category, date, facility tag, note, or serial and confirm **HASH MISMATCH — TAMPER DETECTED**, with a changed computed digest and unchanged anchor. Reset must restore VERIFIED for a genuinely verified original. Edit rapidly and confirm no stale VERIFIED badge appears while the new digest is computing. Normalization-equivalent formatting is not tampering. Confirm no wallet prompt, broadcast, or stored-original mutation.
7. **Fail closed:** Test a malformed/wrong transaction hash, an unrelated transaction with no Chit memo, a failed transaction, missing/unsupported/non-critical-only PQC extension, absent/failed PQC event, and API/CORS outage. None may show VERIFIED. Test a declared JSON `receiptHash` change: it must never replace the node's Anchored Hash.
8. **Resilience:** Reject a wallet prompt; simulate storage disabled/full and confirm no send before failed preflight. Simulate an indexing timeout/unknown submission and confirm the real hash or pending draft is retained and no automatic retry happens. Reload and recover the actual hash before proceeding. Never use simulated signatures as submission evidence.
9. **Mobile/accessibility:** Check 320/375/390/768 px widths in the actual QoreX in-app browser, no horizontal scrolling, readable controls, bottom navigation/safe areas, keyboard focus, reduced motion, screen-reader status/error announcements, copy/download fallbacks, and QR quiet-zone readability. Confirm no camera permission or medical-image upload occurs. Check that a storage/collision warning does not relabel valid unchanged chain/hash evidence as failed, and that the displayed verification source is the actual configured REST/proxy URL.
10. **Permissioning:** Enable the local issuer policy, inspect the actual `MsgSend.from_address`, and test listed/unlisted/empty-list results. Only checksum-valid public qor addresses may be added; no clinic-name/PII/private-key labels are accepted. Policy corruption/write failure must not silently disable permissioning. Demo entries are synthetic/unvetted, not clinical credentials.
11. **Live sample:** Clear or block the local receipt archive, then click Load Live Testnet Sample. Confirm it still populates `CHT-4671`, `Chest X-Ray`, ISO date `2026-11-25`, `CLINIC-A`, and controlled note `Follow-up visit`, and fetches the specific public transaction plus Diana node identity through `/lcd`. Independently hash the exact canonical JSON and compare both displayed digests with the real memo/reference. Every hybrid/inclusion/issuer gate still applies; no reference digest or VERIFIED state may be seeded. Confirm edits mismatch, no stale success appears during recomputation, and Reset restores the supplied fields. If the supplied preimage disagrees with the anchor, retain HASH MISMATCH and obtain corrected original data; do not change v1 bytes or verification gates to mark this check passed.
12. **Local file helper:** With a benign non-medical PDF/PNG/JPEG fixture, check exact-byte SHA-256 independently. Confirm no upload/network/file-name/preview/storage/receipt association occurs; only hash/size/format are displayed. Test wrong MIME/magic bytes, the 32 MiB limit, replacement/cancellation, clear/close, and copying only the digest. A fingerprint is not file authentication.
13. **Proof limits:** Confirm README/UI explicitly distinguish receipt integrity and local policy membership from scan occurrence, patient identity/consent, certified clinic issuance, clinical accuracy, encryption/anonymization, FIPS-validated software, and independent cryptographic/light-client verification.

After performing these checks, append the real txHash/Explorer evidence, build/test results, browser/wallet versions, and which manual checks actually passed. Never put PII or secrets into that report. Until then, the pending checks above remain pending.

## Human responsibility and license

A human operator must review the code, source API assumptions, actual wallet request, resulting chain evidence, privacy controls, and MIT/third-party licenses. This project is a testnet receipt-integrity prototype, not medical advice or a patient-record application. Chit code is **MIT licensed**; see [LICENSE](LICENSE). Third-party dependencies retain their licenses.
