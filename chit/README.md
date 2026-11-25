# Chit — Quantum Pass web app

A client-side receipt-integrity instrument for QoreChain Quantum Pass. The Swiss-style workspace opens directly into issuance or verification: bone/alabaster canvas, obsidian controls, emerald integrity states, crimson hash diffs, specimen-ticket receipts, and safe-area-aware Issue / Verify / How It Works navigation. The current stylesheet is **`src/instrument.css`**, imported by `src/main.tsx`; no remote fonts or UI services are used.

The full project documentation is in [the root README](../README.md); the current AI/model and manual-verification record is in [AI_USAGE.md](AI_USAGE.md). This app stays in the inspected `chit/` starter directory. Nothing requires an external receipt database, file-upload service, analytics backend, or third-party API beyond QoreChain's public node and the app's own static host/read-only proxy.

The original starter only read balances/tokenomics through `@qorechain/sdk@0.14.0`; it did **not** contain QoreX connection or signing code. Chit reuses its real SDK, React entrypoint, and LCD proxy, with a new adapter for the authoritative `window.qorex.native.signAndBroadcast` API. There are no mock signatures or classical-only fallback.

## Setup, start, and checks

All commands are runnable from **`/workspace/chit`**, the project root (one level above this app):

```sh
npm run setup
cp chit/.env.example chit/.env
npm run dev
```

Node.js 20+, npm, and HTTPS or localhost are required. Vite listens on `0.0.0.0:5173`; use a secure PocketDev preview/tunnel on a phone. Ctrl+C stops the foreground server. Verification needs no wallet. Issuance requires a supported real QoreX injection, Diana selected, testnet funds, and an **already registered ML-DSA-87 key**; keys stay inside QoreX.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Root scripts forward to this app. The build script is `tsc --noEmit && vite build`; output is `chit/dist/`, preview port 4173. This is a web app; no Android SDK/Gradle stack is assumed. Add that stack in PocketDev Settings before building an optional Android wrapper.

**Resume validation status:** installed package manifests are present for `qrcode.react` 4.2.0, Vitest 2.1.9, TypeScript 5.9.3, and Vite 5.4.21; the lockfile also includes the required dependency declarations. They are not merely uninstalled declarations. However, the attempted `npm test` and `npm run build` calls in `/workspace/chit/chit` were rejected during command-tool argument validation, before the shell launched (unwanted optional permission arguments). There are no test/compiler exit codes, and no passing test/build is claimed. No dependency install was executed in this resume. Browser rendering, QR scanning, and real QoreX issuance also remain unverified. An existing `dist/` must not be treated as freshly rebuilt after these edits.

## Testnet addresses

| Setting | Value |
| --- | --- |
| Native chain | `qorechain-diana` |
| EVM chain | `9800` (`0x2648`) |
| REST | <https://api-testnet.qore.host> |
| Consensus RPC | <https://rpc-testnet.qore.host> |
| Explorer | <https://explore.qore.network> |
| Starter EVM read RPC (not used for anchors) | <https://evm-testnet.qore.host> |

**Select Testnet in Explorer.** Its network selection is cookie-based; transaction links use `/tx/<HASH>` with no invented network parameter. The native anchor is one **1-uqor self-transfer** (0.000001 QOR), plus the exact wallet-set gas fee shown by QoreX. Verification and optional issuer policy do not broadcast; the local file helper never broadcasts or updates a receipt. There is no Chit contract or hard-coded recipient.

## Privacy and canonical receipts

Only these fields are accepted: `receiptCode`, `scanCategory`, `visitDate`, `facilityTag`, and optional `note`. Categories are Chest X-Ray, Pelvis X-Ray, Limb X-Ray, Ultrasound, Non-Contrast CT, and Custom. Notes are predefined, non-identifying visit phrases or empty; Custom does not add a diagnosis field. The original five note spellings remain valid so existing v1 hashes stay unchanged. Generic localization/context options are `PA View · Standard`, `AP / Lateral View`, `Follow-Up Clearance`, and `Baseline Screening`.

**Never use patient names, diagnoses, medical images, phone numbers, identifying notes, or patient IDs.** Extra import fields and arbitrary notes are rejected. Receipt/facility codes must be generic. Their format checks cannot infer whether an operator has encoded a name or patient ID into a valid-shaped code: this is a strict no-PII usage boundary, not guaranteed anonymization or automatic semantic PII detection. Hashing is not encryption/anonymization, and localStorage, QR URLs, exported JSON, browser history, and clipboard data are plaintext; use generic test data only.

`src/lib/receiptSchema.ts` centralizes v1 normalization, re-exported through `receipt.ts`: NFC text, trimmed/collapsed whitespace, uppercase codes, canonical category/note spelling, validated `YYYY-MM-DD`, and an empty note when omitted. Compact JSON uses fixed alphabetical key order:

```text
facilityTag, note, receiptCode, scanCategory, visitDate
```

Browser `crypto.subtle.digest('SHA-256', UTF8(canonicalJSON))` produces 64 lowercase hexadecimal characters. Proof metadata is not hashed. The sole on-chain memo is exactly **`CHIT:v1:<receiptHash>`**; no receipt fields enter the transaction. Chit rejects missing PQC registration rather than letting QoreX bootstrap an extra transaction.

Issued receipts and actual hashes are stored under `chit.receipts.v1`. A separate `chit.pending.v1` recovery draft is saved before signing and has no fabricated txHash. Double-click/uncertain-outcome guards prevent blind retry; real hashes remain exportable after failed indexing/storage. QR deletion does not erase local receipt-code recovery, but clearing browser data does. Export JSON for cross-device backup. Receipt-code lookup is local, not a public registry.

## Sharing, issuer policy, and local fingerprinting

**Self-contained QR / link.** Issued QR codes contain an HTTP(S) app URL with a compact, UTF-8 base64url fragment: `#verify=<encoded [1, code, category, date, facility, note, txHash]>`. Copy Verification Link carries all five normalized fields and the real transaction hash, not a remote database ID or trusted claimed digest. Initial load and `hashchange` decode locally, open Verify, and read Diana through `/lcd`. Legacy JSON exports/imports remain supported. The supplied link origin is never used as a chain node. URL fragments are not sent in HTTP requests, but links, browser history, JSON, localStorage, and the clipboard are plaintext.

**Authorized facility / issuer allowlist.** Verify has opt-in permissioned mode under `chit.issuers.v1`. It checks the unique on-chain `MsgSend.from_address`, not `facilityTag`, recipient, fee payer, or pasted metadata. Add/remove/inspect only checksum-valid lowercase 20-byte `qor1…` addresses locally (at most 100). Defaults include the observed testnet sample signer plus two explicitly synthetic demo addresses; none is a vetted clinic identity. Missing/unlisted senders, malformed policies, or policy storage failures fail closed when permissioning applies. This is the operator's local trust policy—not clinic licensure or a public issuer registry.

**Check Local File SHA-256.** The optional drawer accepts PDF/PNG/JPEG up to 32 MiB with matching extension, MIME (when provided), and magic bytes. WebCrypto fingerprints exact bytes only in memory. No file is uploaded, named, previewed, saved, or placed on-chain; clear/close discards the displayed fingerprint. It does not authenticate the file or associate it with a receipt anchor. Receipt text imports remain separate and limited to small `.json`/`.txt` files.

## Live sample — supplied five-field receipt

**Load Live Testnet Sample** populates `CHT-4671`, `Chest X-Ray`, `2026-11-25`, `CLINIC-A`, and the controlled note `Follow-up visit`, then performs a real read-only lookup of [transaction 79C0518A…15D3AD](https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD) through `/lcd`. It needs neither a wallet nor a saved local original. The supplied display date `11/25/2026` is represented as ISO `2026-11-25`; v1 continues to reject slash-formatted receipt dates.

The unchanged canonical preimage is exactly:

```json
{"facilityTag":"CLINIC-A","note":"Follow-up visit","receiptCode":"CHT-4671","scanCategory":"Chest X-Ray","visitDate":"2026-11-25"}
```

The supplied/observed on-chain reference is:

```text
CHIT:v1:7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727
```

Read-only LCD inspection again observed code `0`, height `10725694`, critical hybrid algorithm `1`, `pqc_hybrid_verify.status=verified`, and sender `qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c`. This is node-reported chain evidence, not an independent signature audit or a local receipt hash-match result.

`sample.ts` strictly normalizes a fresh copy and computes its real browser WebCrypto SHA-256. It never assigns the expected reference as the computed digest. The evidence panel compares the actual fetched memo hash with the editable fields' actual local digest; **VERIFIED** still requires every existing Diana, inclusion, hybrid, and optional issuer-policy check. The tamper simulator is active once these supplied fields load, even if the digests differ. Reset restores the supplied fields, not a forced success state.

All five requested fields are now available. **Their numerical digest/reference equality and the live UI transition have not been executed in this runtime** because shell invocations fail during argument validation. The regression suite independently checks the exact preimage with Node SHA-256 and asserts equality with the published reference. If that check fails, retain HASH MISMATCH and obtain a corrected original; never change canonical order, schema, or verification gates to force a match.

## Verification and proof limits

Saved codes, pasted/uploaded receipt JSON + transaction hash, and QR text payloads are supported. The public REST transaction path is `/cosmos/tx/v1beta1/txs/<txHash>`; default configuration reads it through `/lcd`, forwarded to Diana's public REST host. The evidence panel records the actual requested node/proxy URL; public Explorer/reference links are not falsely presented as a different node's queried source. Production static deployment must provide this proxy or a CORS-enabled direct REST URL.

**VERIFIED** requires Diana node identity, a matching returned txHash, strict numeric `tx_response.code === 0`, positive committed height, a supported critical `/qorechain.pqc.v1.PQCHybridSignature` algorithm 1 with **4,627 decoded bytes**, real compressed classical key shape and 64/65 signature bytes, a successful `pqc_hybrid_verify` event with one supported algorithm attribute, and equality of **Anchored Hash** from the exact transaction memo vs **Computed Hash** from the editable receipt. Missing/conflicting event evidence or unsupported status aliases do not count as success.

Edit any valid receipt parameter (`scanCategory`, `visitDate`, `facilityTag`, `note`, or recovery serial), or use **Simulate Tamper** to get **HASH MISMATCH — TAMPER DETECTED**; **Reset** restores the original. Per-position digest changes are highlighted in crimson; a storage/save warning is separate and does not relabel unchanged cryptographic evidence as failed. These helpers are local, do not modify stored originals, and never broadcast. A supplied JSON receiptHash is never treated as chain evidence.

**The anchor proves:** subject to trusting the queried HTTPS node and QoreChain consensus, the presented normalized receipt fields match a hash included in a successful transaction with accepted secp256k1 + ML-DSA-87 evidence. The block establishes inclusion of the hash, not the truth of a stated visit date.

**It does not prove:** a scan/visit happened, medical accuracy, patient identity/consent, clinic identity/licensure, authorized or unique issuance, ownership, encryption, anonymization, regulatory compliance, or permanent cryptographic invulnerability. Chit is not a light client and does not independently verify signatures or Merkle inclusion proofs. Wallet internals and pre-broadcast signed bytes are not exposed; only actual chain evidence supports the final claim.

Regression tests are in `tests/`, including canonical v1 hashing/imports, storage/collision/pending guards, URL sharing, issuer policies, hybrid-evidence classification, local file fingerprints, digest diffs, actual read-source attribution, and the supplied sample's exact canonical/reference comparison, storage-independent loading, fresh editor copies, normal LCD path, and field edits/reset. Fabricated byte arrays are explicitly **test-only classifier fixtures**, not valid signatures or live evidence. Tests remain unexecuted because command-tool validation prevented shell launch; the reference-equality regression is not a passing result until run.

**Remaining integration gaps:** test/build execution and numerical sample digest/reference confirmation, real QoreX approval/broadcast, QR scanning, mobile/browser/accessibility checks, and native/UI race/storage validation. localStorage reservations/archive writes are not atomic across tabs; same-page guards do not prevent every concurrent-tab duplicate. Use one issuance tab. The five requested sample fields are now provided; corrected original data is needed only if the genuine digest comparison fails. See [AI_USAGE.md](AI_USAGE.md) and the root checklist.

## MIT license

Chit application code is **MIT licensed**, copyright Chit contributors: see [LICENSE](LICENSE). Preserve that attribution when distributing Chit. Dependencies retain their own licenses and credits:

- [@qorechain/sdk](https://github.com/qorechain/qorechain-sdk) — QoreChain, Apache-2.0; real message composers, codecs, REST client, and address utilities.
- [React / React DOM](https://github.com/facebook/react) — React contributors, MIT; client-side UI.
- [Vite](https://github.com/vitejs/vite) — Vite contributors, MIT; development, static production bundling, and local LCD proxy.
- [qrcode.react](https://github.com/zpao/qrcode.react) — Paul O’Shannessy and contributors, ISC; bundled QR rendering.
- [TypeScript](https://github.com/microsoft/TypeScript) — Microsoft/contributors, Apache-2.0; type checking.
- [Vitest](https://github.com/vitest-dev/vitest) — Vitest contributors, MIT; regression tests.

The NIST FIPS 204 badge describes an algorithm specification, not FIPS-validated software or an independent signature audit. Full API-source citations, production proxy configuration, and detailed proof/privacy limitations are in [the root README](../README.md).

