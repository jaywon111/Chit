# AI usage and verification record — Chit

## Requested Mobile Harness workflow

The requested project workflow is **Mobile Harness → local model proxy → `gpt-6.2-sol`**, with a developer reviewing the generated changes and manually verifying the real wallet and chain behavior before submission. The local proxy mediates model requests; it must not receive wallet seeds, secret keys, patient data, or identifying medical content.

**Model provenance caveat:** the harness instructions for this actual coding session identify the coding agent as **`gpt-6.1-sol`**, not `gpt-6.2-sol`. Local proxy configuration/logs were not available to independently establish a `gpt-6.2-sol` run. The named `gpt-6.2-sol` workflow above is the user's requested/reported setup, **not a verified model-execution claim for this session**. Confirm the PocketDev model selection and proxy logs before making that claim in a track submission; never relabel this session as a proven 6.2 run.

The **Vite `/lcd` local REST proxy** is a separate mechanism from the **local model proxy**. `/lcd` forwards read-only browser requests to the public Diana REST endpoint to work around CORS. It is not a model proxy, receipt backend, mock chain, or patient database.

## What AI assisted with

- Inspected `chit/package.json`, `src/App.tsx`, `main.tsx`, Vite/environment configuration, and the installed SDK's actual type/API exports before modifying the starter.
- Determined that the starter was a read-only SDK balance/tokenomics page. **No pre-existing QoreX connection or hybrid-signing implementation existed in its `src/` to reuse.** Reused the real SDK/proxy/React structure and added a provider adapter using authoritative current QoreX documentation.
- Implemented the React mobile/desktop issue and verify views, accessible form labels, responsive CSS, local receipt recovery, SVG QR output (`qrcode.react`), copy/download JSON, and Explorer links.
- Implemented allowlisted non-identifying receipts, a controlled vocabulary for notes, canonical browser WebCrypto SHA-256, strict imports, local-only editable tamper/reset helpers, and fail-closed on-chain evidence classification.
- Added one-broadcast guards and non-PII pending-draft recovery for known-hash, uncertain submission, quota, rejection, and indexing-error cases.
- Wrote documentation, MIT licensing, root command forwarding, and Vitest regression tests.

Two focused background coding-agent delegations assisted with (1) authoritative QoreX API/SDK integration and (2) receipt/verifier regression tests and independent static safety review. They shared project files, not wallet secrets. No fresh-agent Ralph loop or large orchestration workflow was claimed or needed.

All examples used generic clinic codes, common scan categories, and test-only receipt codes. No patient names, diagnoses, images, phone numbers, wallet mnemonics, or private/PQC secret keys were supplied or created.

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

## What was not executed

| Check | Actual session status |
| --- | --- |
| Starter / installed SDK inspection | Performed |
| Public documentation / read-only REST and RPC evidence | Performed |
| Independent manual static code review | Performed |
| Dependency installation / lockfile regeneration | **NOT RUN** |
| Vitest regression suite | **Written, NOT RUN** |
| TypeScript typecheck | **NOT RUN** |
| `npm run build` / Vite production build | **NOT RUN — no zero-error build claim** |
| Browser rendering / mobile viewport / keyboard / QR scanning | **NOT RUN** |
| Real QoreX connection / wallet approval / hybrid broadcast | **NOT RUN** |
| End-to-end app VERIFIED → TAMPERED → Reset on a real Chit | **NOT RUN** |

Shell commands were rejected before execution by the runtime's tool-argument serializer, which populated an unwanted optional sandbox-permission request even though the session's file policy already allowed full access and approvals were disabled. No shell exit codes exist. After diagnosing the invocation problem, repeated malformed retries were stopped; available text-file editing and HTTP reading were used instead. No permissions escalation or successful npm execution is asserted. `qrcode.react`/`vitest` dependency declarations are present, but their packages and a regenerated lockfile still require a genuine npm install.

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
4. **Recovery and export:** Copy/download receipt JSON; scan the exported QR with an independent reader and compare decoded JSON exactly. Delete the downloaded QR image, reload Chit, and recover by its short code on the same browser. On another device, import JSON/QR text because code lookup is local only.
5. **Chain proof:** Open the real REST transaction URL and compare the actual returned hash, strict code 0, positive height, critical `/qorechain.pqc.v1.PQCHybridSignature`, algorithm 1, 4,627 decoded PQC bytes, 64/65 classical bytes, and successful `pqc_hybrid_verify` status with Chit's displayed evidence. Select Testnet in Explorer. Check both hashes match before accepting **VERIFIED**.
6. **Tamper / reset:** Change `scanCategory`, then `visitDate`, and confirm **TAMPERED (HASH MISMATCH)** with different Computed Hash and unchanged Anchored Hash. Use **Reset** to restore **VERIFIED**. Edit rapidly and check that a stale VERIFIED badge is never shown for new fields. Confirm no wallet prompt, broadcast, or stored-original mutation occurs.
7. **Fail closed:** Test a malformed/wrong transaction hash, an unrelated transaction with no Chit memo, a failed transaction, missing/unsupported/non-critical-only PQC extension, absent/failed PQC event, and API/CORS outage. None may show VERIFIED. Test a declared JSON `receiptHash` change: it must never replace the node's Anchored Hash.
8. **Resilience:** Reject a wallet prompt; simulate storage disabled/full and confirm no send before failed preflight. Simulate an indexing timeout/unknown submission and confirm the real hash or pending draft is retained and no automatic retry happens. Reload and recover the actual hash before proceeding. Never use simulated signatures as submission evidence.
9. **Mobile/accessibility:** Check 320/375/390/768 px widths, no horizontal scrolling, readable controls, bottom navigation/safe-area behavior, keyboard focus, screen-reader labels/status/error announcements, copy/download fallbacks, and QR quiet-zone readability. Confirm no camera permission request or medical-image upload is present.
10. **Proof limits:** Confirm README/UI explicitly distinguish receipt integrity and hybrid-transaction inclusion from scan occurrence, patient identity/consent, certified clinic issuance, clinical accuracy, privacy encryption, and independent cryptographic/light-client verification.

After performing these checks, append the real txHash/Explorer evidence, build/test results, browser/wallet versions, and which manual checks actually passed. Never put PII or secrets into that report. Until then, the pending checks above remain pending.

## Human responsibility and license

A human operator must review the code, source API assumptions, actual wallet request, resulting chain evidence, privacy controls, and MIT/third-party licenses. This project is a testnet receipt-integrity prototype, not medical advice or a patient-record application. Chit code is **MIT licensed**; see [LICENSE](LICENSE). Third-party dependencies retain their licenses.
