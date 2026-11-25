# Chit

A mobile-first receipt-integrity instrument for the **QoreChain Quantum Pass** track. Open directly into the Issue / Verify / How It Works workspace—no landing-page funnel or stepper.

Chit creates a small non-identifying receipt, hashes its canonical JSON in the browser, asks **QoreX** for **one native hybrid-signed transaction** (`secp256k1` + `ML-DSA-87`), and compares the receipt with the actual on-chain anchor. No smart contract, backend database, patient account, or EVM authorization window is needed.

The existing application remains in **`chit/`**. Root `package.json` only forwards commands to that inspected starter; no replacement outer app was created. The starter was a Vite + React + TypeScript SDK balance/tokenomics page, **not an existing QoreX wallet/signing implementation**. Its installed `@qorechain/sdk@0.14.0`, Vite proxy, React entrypoint, and real SDK codecs/composers are reused.

## Instrument workspace

- **Issue:** five controlled receipt fields, local SHA-256 preview, one real QoreX signing request, serial-tracked specimen ticket, crisp QR with quiet zone, commitment block, and NIST FIPS 204 · ML-DSA-87 · 4,627 B specification badge. A draft/submission badge is not verification.
- **Verify:** local-code recovery, strict JSON/text import, self-contained URL-fragment auto-loading, editable tamper simulator, actual side-by-side digests, per-position crimson differences, live block/code/signer/signature/event evidence, and a read-only sample button.
- **Optional permissioning:** a browser-local authorized issuer list checks the actual single `MsgSend.from_address`; demo entries are not vetted clinic identities.
- **Local utilities:** optional zero-upload PDF/PNG/JPEG byte fingerprinting and a browser-only receipt archive. Neither a file nor its fingerprint is linked to a receipt anchor by this tool.
- **UI:** `chit/src/instrument.css` is the active stylesheet. System fonts, warm alabaster/bone, obsidian, surgical forest/emerald, crimson alerts, 1px borders, tabular monospace metrics, compact QoreX header, and safe-area bottom navigation; no remote assets or third-party UI service.

## Current validation status — important

Implementation, documentation, and regression tests have been written and statically reviewed. Public testnet REST/RPC responses and authoritative QoreX API documentation were read successfully.

**Unit tests, TypeScript/Vite production build, browser/QR checks, and a real wallet transaction have NOT been executed successfully in this resume.** The actual `npm test` and `npm run build` attempts with `/workspace/chit/chit` as working directory were rejected during command-tool argument validation, **before shell launch**: unwanted optional permission arguments produced `invalid justification: expected a non-empty sentence` or a same-mode escalation validation error. No test/compiler exit code exists; no zero-error build is claimed. The current runtime allows file edits, but its command-call argument contract remains a blocker.

Read-only package inspection does confirm installed manifests for `qrcode.react` **4.2.0**, Vitest **2.1.9**, TypeScript **5.9.3**, and Vite **5.4.21**, and a lockfile with the current dependency declarations. The earlier assertion that QR/tests were merely declared but uninstalled is obsolete. Installation was not performed in this resume; existing `chit/dist/` files are **not** evidence of a fresh build of the upgraded source. Run the checks below once the command-tool invocation is corrected.

## Setup and start

Prerequisites:

- Node.js **20+** and npm.
- A secure browser context: **HTTPS or localhost** for `crypto.subtle` and clipboard support. A plain HTTP LAN IP is not a secure context; use PocketDev's HTTPS preview/tunnel for a phone.
- For issuance: a browser that actually injects the supported QoreX provider, QoreX selected to **Diana testnet**, a funded testnet account, and an **already registered ML-DSA-87 key**. Verification needs no wallet.

All commands below run from **`/workspace/chit`**, the project root:

```sh
npm run setup
cp chit/.env.example chit/.env
npm run dev
```

`npm run dev` starts Vite on **`0.0.0.0:5173`**. Open `http://localhost:5173` locally or the runtime's HTTPS preview on mobile. Stop the terminal server with **Ctrl+C**. No process-text-search kill command is needed.

Checks and production preview (commands are provided, **not claimed verified**):

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`npm run build` forwards to the starter's exact `tsc --noEmit && vite build` script; production output is `chit/dist/`. Preview listens on port **4173** and also has the LCD proxy. The app is web-only; if adding an Android wrapper later, add the Android development stack in **PocketDev Settings** before building. No Android SDK/Gradle toolchain is assumed here.

## Diana testnet addresses

| Setting | Value |
| --- | --- |
| Native chain ID | `qorechain-diana` |
| EVM chain ID | `9800` / `0x2648` |
| Public REST | <https://api-testnet.qore.host> |
| Consensus RPC | <https://rpc-testnet.qore.host> |
| Explorer | <https://explore.qore.network> |
| Starter EVM read RPC (not used to issue Chits) | <https://evm-testnet.qore.host> |
| Native denomination | `uqor` (1 QOR = 1,000,000 uqor) |

Explorer transaction URLs are `/tx/<UPPERCASE_HASH>`. **Select Testnet in Explorer**: its network selection is cookie-based and defaults to mainnet; Chit does not invent a network URL parameter. The consensus RPC above is **not** an EVM JSON-RPC endpoint. Wallet selection is checked against EVM 9800, while the anchor uses Diana's native lane.

There is no deployed Chit contract or hard-coded recipient wallet. The only message sends **1 uqor (0.000001 QOR) back to the connected wallet itself**, plus a QoreX-set gas fee. The exact fee is shown in QoreX before approval; it is not a free transaction.

## Zero patient data

The complete receipt-field allowlist is:

| Field | Meaning |
| --- | --- |
| `receiptCode` | Auto-generated short recovery code, e.g. `CHT-4821`; never a patient ID |
| `scanCategory` | Chest X-Ray, Pelvis X-Ray, Limb X-Ray, Ultrasound, Non-Contrast CT, or Custom |
| `visitDate` | Real date in `YYYY-MM-DD` format |
| `facilityTag` | Short, generic clinic code such as `CLINIC-A`; never a person or phone number |
| `note` | Optional predefined non-identifying visit note; an empty string if omitted |

**Never enter, import, store, or publish patient names, diagnoses, medical images, phone numbers, or identifying notes in a receipt.** There are no patient-name, diagnosis, phone, camera, or scan-upload receipt fields. `Custom` is a generic category, not a free-text diagnosis box. Notes intentionally use a controlled vocabulary: the five original empty/visit-note values remain valid; generic `PA View · Standard`, `AP / Lateral View`, `Follow-Up Clearance`, and `Baseline Screening` options were added without altering old hashes. Imports reject extra fields, unsupported categories, and arbitrary notes rather than silently preserving them.

Receipt/facility-code validation checks **format**, not human meaning. A valid-shaped alphanumeric name or identifier could still be deliberately encoded in a code/tag. Operators must use generic clinic tags and random receipt serials, never identities. “Zero PII” is the required usage boundary, not an automatic semantic detector or an anonymization guarantee. The separate optional local file picker only fingerprints bytes in memory; it never uploads, previews, names, saves, or adds a file to a receipt.

The app has no analytics, receipt API uploads, remote font/image dependencies, seed/private-key inputs, or secret-key storage. Imported files are read only in browser memory. Only allowlisted receipts are persisted, and imported records are saved only through **Save verified Chit**.

**Hashing is not encryption or guaranteed anonymization.** These receipt values can be low entropy, and dates/categories/tags can be correlated with outside information. Both QR/JSON and localStorage are plaintext. Use only generic, non-identifying test data; this is not a clinical record system or a regulatory-compliance claim. Public transactions also reveal the wallet address, fee, and block timestamp; none of those wallet details are stored in Chit receipt JSON.

## Canonical SHA-256

`chit/src/lib/receiptSchema.ts` centralizes the unchanged v1 field normalization, re-exported through `receipt.ts`; `receipt.ts` serializes/hashes the same canonical bytes for Issue, Verify, imports, and storage:

1. Reject unknown receipt fields and non-string values.
2. Normalize text to **Unicode NFC**, trim, and collapse whitespace.
3. Uppercase receipt/facility codes; map category and safe-note case to the predefined spelling.
4. Validate a real `YYYY-MM-DD` date. Missing `note` becomes `""`.
5. Serialize **without whitespace**, in this fixed alphabetical key order:

```json
{"facilityTag":"CLINIC-A","note":"","receiptCode":"CHT-4821","scanCategory":"Chest X-Ray","visitDate":"2026-01-01"}
```

6. Encode UTF-8 and call browser **`crypto.subtle.digest('SHA-256', bytes)`**. Encode all 32 result bytes as 64 lowercase hexadecimal characters.

Only the five normalized fields are hashed. `version`, `chainId`, `receiptHash`, and `txHash` are proof-envelope metadata, not part of the receipt hash. The exact on-chain memo is:

```text
CHIT:v1:<64-lowercase-hex-receiptHash>
```

The issued QR text is a **self-contained verification URL**, not a remote lookup ID. Its `#verify=<base64url>` fragment encodes the UTF-8 tuple `[1, receiptCode, scanCategory, visitDate, facilityTag, note, txHash]`. Copy Verification Link uses the same normalized fields and real hash; initial load and `hashchange` decode locally, switch to Verify, and read chain evidence. No claimed `receiptHash` or issuer authorization is carried as trusted proof. URL fragments are not sent in HTTP requests; links/history/clipboard remain plaintext. The app origin/path is retained, while arbitrary queries and previous fragments are removed.

Exported/copyable JSON retains the legacy envelope, optionally pretty-printed:

```text
{ version: 1, chainId: "qorechain-diana", receipt: { five fields }, receiptHash: "<real hash>", txHash: "<real transaction hash>" }
```

The metavariables above are explanatory only, **not a valid or issued receipt**. The separately labeled public Diana sample uses the five non-identifying receipt fields supplied by the user, with its specific public transaction hash. It recomputes actual SHA-256 and fetches live chain evidence. No fabricated transaction, signature, substituted computed digest, or fake “VERIFIED” state is seeded into the UI or storage.

## Issue Chit: real QoreX flow

The integration in `chit/src/lib/qorex.ts` follows QoreX's documented current API:

- Detect **`window.qorex.native`** and `.evm`, confirm `isQoreX` and the **`signAndBroadcast` capability**.
- Require selected EVM chain 9800, `native.enable('qorechain-diana')`, and real `native.getKey(...)` public account data.
- Read the REST node chain identity and required hybrid policy with classical fallback disabled.
- Freshly read the already registered ML-DSA-87 key, check its algorithm/public-key shape, and re-read the active account/network immediately before signing.
- Encode a single SDK bank self-send using the starter's real SDK composer and protobuf registry.
- Call **`native.signAndBroadcast({ chainId, messages, memo })` exactly once**. QoreX holds both secrets and generates both signature layers; receipt fields never enter the request.
- Retain the real hash even if indexing or structural read-back fails. Display **Submitted**, not “Verified,” until independent verification.

**No classical fallback, `signDirect`-only transaction, key-registration message, EVM window opening, mock signature, hidden second transaction, or automatic broadcast retry exists in Chit.**

QoreX can automatically register a PQC key on an account's first send and exposes no public `noBootstrap` option. Chit therefore refuses absent/unreadable/incompatible existing registrations **before** the signing request. Account setup must be performed separately in QoreX. Wallet source and pre-broadcast signed bytes are not public/exposed; Chit cannot independently audit wallet internals or authenticate an injected provider's identity. A web app's preflight cannot eliminate every wallet-internal race. Only actual on-chain evidence supports the final integrity claim.

## Recovery, QR, and one-broadcast safety

- Completed records live under **`chit.receipts.v1`** in this browser's localStorage: the non-PII receipt, `receiptHash`, and real `txHash` only, plus schema/chain metadata.
- Before requesting an anchor, a non-PII recovery draft is saved under **`chit.pending.v1`**. It has no fabricated transaction hash.
- Same-page double clicks/in-flight attempts are locked. Confirmed or uncertain outcomes are not retried blindly. A known hash is shown/exportable even if storage quota or REST indexing fails.
- localStorage read/check/write is not an atomic cross-tab lock. Do not issue the same code concurrently in multiple tabs. The same-page guard and persistent recovery protections are not a promise of cross-tab synchronization.
- After a reload, unresolved drafts remain discoverable by code; recover the real hash in QoreX history or Explorer (Testnet), paste it in Verify, and save only after verification.
- Corrupt storage is not silently overwritten. Duplicate codes cannot replace a different receipt. Saving/automatic draft clearing checks the pending draft's **normalized five fields and receiptHash**, not only its short code, so an unrelated same-code import cannot erase it. All automatic callers supply the expected record; this guard is not an atomic cross-tab lock. Storage is limited to 250 receipts/drafts per store with no automatic eviction.
- Deleting a downloaded QR image does not delete the local receipt. Use its short code in Verify or the recovery list. Clearing browser data **does** remove local recovery; export JSON as a separate backup.
- A receipt code is a **local lookup key**, not a public chain registry. Another browser/device needs the exported JSON or self-contained QR verification URL; that URL already includes all five fields and the transaction hash.

## Verify Chit and simulate tampering

Use a saved code, paste a Chit JSON envelope or self-contained verification URL/fragment, or load a small `.json` / link `.txt` file (up to 12 KB). Flat receipt JSON plus a separately supplied `txHash` is also supported. Unknown fields, conflicting hashes, wrong chain/schema, malformed hashes, and arbitrary notes are rejected. Images/PDFs are not receipt imports; the independent fingerprint utility is strictly local and does not verify or save a receipt. Importing does not save the input.

The verifier reads the required public REST path:

```text
https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/<txHash>
```

It also checks `/cosmos/base/tendermint/v1beta1/node_info` identifies Diana. In dev/preview, `.env` routes these **same public paths** through `/lcd` to avoid CORS, not to a mock backend.

**VERIFIED requires all of:**

1. Matching returned transaction hash and Diana node identity.
2. Strict numeric **`tx_response.code === 0`** and a positive committed block height.
3. One supported critical **`/qorechain.pqc.v1.PQCHybridSignature`** (expanded JSON or protobuf Any), algorithm 1, and **4,627 decoded ML-DSA-87 signature bytes**.
4. A secp256k1 signer with an actual compressed public-key shape and a 64-byte classical or 65-byte eth-secp256k1 signature.
5. Actual **`pqc_hybrid_verify.status=verified`** with exactly one supported algorithm attribute; missing/duplicate attributes, unsupported success-looking aliases, and contradictory direct/log events fail closed. A mere `pqc_verify` / `algorithm_active` event is insufficient.
6. **Anchored Hash** from the exact `CHIT:v1:...` transaction memo equals **Computed Hash** from the editable receipt. The JSON's claimed `receiptHash` is never substituted as chain evidence.

The Cryptographic Evidence & Hash Diff panel displays actual side-by-side digests, per-position differences, block height, on-chain signer, transaction code, signature byte lengths/type, hybrid event, and an Explorer reference. Its source/trust inspector records the **actual requested REST/proxy URL**, not a hard-coded public URL when a different node/proxy is configured. Edit any valid receipt parameter or click **Simulate Tamper**: a mismatch becomes **HASH MISMATCH — TAMPER DETECTED**. **Reset** restores the original in-memory fields; neither helper broadcasts or modifies saved originals. Old VERIFIED results are suppressed while a new hash is computing. Missing evidence, API errors, wrong networks, unsupported signatures/events, or failed delivery never produce success. Local archive/quota/collision warnings are separate from—and do not negate—unchanged cryptographic evidence.

### Optional client-side issuer allowlist

Verify offers local permissioned mode under `chit.issuers.v1`. It checks the **unique, checksum-valid `MsgSend.from_address`** against this browser's list, never a pasted issuer, fee payer, recipient, or facility tag. Inspect/add/remove only lowercase 20-byte `qor1…` public addresses (up to 100); no clinic-name or patient labels are stored. Defaults include the observed sample signer and two explicitly synthetic demo addresses. These are **not vetted clinics** or credentials. Enabling the list expresses the operator's trust choice; it is not an external registry, on-chain issuance restriction, licensure check, or legal authorization. Missing/unlisted senders and malformed/unreadable policy fail closed rather than silently bypassing permissioning.

### Live Diana sample — supplied receipt and real comparison

**Load Live Testnet Sample** populates the user-supplied five fields and queries this [real public transaction](https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD) via the same `/lcd` verification path:

```text
txHash: 79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD
memo: CHIT:v1:7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727
issuer: qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c
```

Supplied values: `CHT-4671`, `Chest X-Ray`, `11/25/2026`, `CLINIC-A`, `Follow-up visit`. The display date is represented as `2026-11-25` for the unchanged v1 ISO date schema; the controlled note already exists. The canonical JSON is exactly:

```json
{"facilityTag":"CLINIC-A","note":"Follow-up visit","receiptCode":"CHT-4671","scanCategory":"Chest X-Ray","visitDate":"2026-11-25"}
```

Read-only LCD inspection again reported code `0`, height `10725694`, a critical hybrid extension with algorithm `1`, and `pqc_hybrid_verify.status=verified` / `algorithm_id=dilithium5`. This is node-reported anchor evidence, **not** a local receipt hash-match result or an independently verified signature/inclusion proof.

`sample.ts` creates a strictly normalized fresh copy and computes actual WebCrypto SHA-256 without reading localStorage. Verify fetches the real transaction and node identity; the existing hybrid/inclusion/hash/issuer gates determine the verdict. The tamper editor activates for the supplied fields, even on a mismatch. Both digest columns are actual values; the expected reference never replaces either. Reset restores the supplied fields, not a forced success state.

All five requested fields are available, but the numerical digest/reference check and real app VERIFIED → TAMPERED → Reset remain **unexecuted** in this runtime. The sample regression compares an independent Node SHA-256 of the exact canonical preimage with the published reference. If it fails, retain HASH MISMATCH and obtain corrected original data—never change v1 ordering, date validation, or cryptographic gates to force equality.

### Optional local scan-file fingerprint — zero upload

**Check Local File SHA-256** accepts PDF/PNG/JPEG up to 32 MiB. Extension, supplied MIME type, and detected magic bytes must agree. Browser WebCrypto hashes the exact file bytes in memory; only format, size, and digest are shown. No filename, preview, file bytes, or fingerprint is saved, uploaded, added to a receipt, or placed on-chain. Clear/close discards the displayed fingerprint. Copying copies only the digest. This utility does not authenticate the file, establish a scan occurred, or link it to the receipt anchor. Use benign fixtures for testing and inspect browser network/storage behavior before claiming the manual zero-upload check passed.

### What the anchor proves — and does not

**It proves, subject to trusting the queried node and QoreChain consensus**, that the presented normalized receipt fields match a hash included in a successful Diana transaction with accepted classical/post-quantum signature evidence. Editing those fields changes the fingerprint. The block provides an inclusion time for the **hash**, not a certification of the `visitDate`.

**It does NOT prove:**

- a scan or visit happened, or that any receipt field is medically/factually accurate;
- a patient identity, a patient's consent, facility identity/licensure, or authorized clinic issuance;
- ownership, originality, or exclusivity of a receipt (someone else can anchor the same hash);
- encryption, secrecy, anonymization, or healthcare regulatory compliance;
- that all cryptography is future-proof forever, or that an untrusted wallet/node is honest.

Chit does **not** independently execute ML-DSA/secp256k1 verification or verify a light-client/Merkle inclusion proof. The node's code/events are trusted evidence; displaying a signature-sized blob alone is never sufficient. Arbitrary generic facility tags are not a credential registry.

## REST proxy and production deployment

`chit/.env.example`:

```dotenv
VITE_QORE_REST_URL=/lcd
QORE_REST_PROXY_TARGET=https://api-testnet.qore.host
VITE_QORE_EVM_RPC_URL=https://evm-testnet.qore.host
```

The EVM read variable is preserved for starter compatibility; anchoring uses QoreX's native API. Never put a secret in a `VITE_` variable.

Vite's `/lcd` proxy exists only in **dev/preview**, not inside static `dist/` files. In production, serve over HTTPS and either provide a same-origin proxy for `/lcd/*` to `https://api-testnet.qore.host/*`, or set `VITE_QORE_REST_URL` to the public REST URL only if it permits your origin. A minimal Nginx route (deployment configuration, not a command verified here):

```nginx
location /lcd/ {
    proxy_pass https://api-testnet.qore.host/;
    proxy_ssl_server_name on;
    proxy_set_header Host api-testnet.qore.host;
}
```

No receipt JSON is POSTed to that proxy; it forwards read-only evidence requests. The wallet handles its own broadcast. Avoid logging or adding receipt/patient fields to request URLs.

## Tests, manual verification, and sources

Regression tests in `chit/tests/` cover unchanged v1 canonical bytes/notes and WebCrypto SHA-256, field edits/reset, strict imports, local archive/pending/collision guards, compact fragment sharing, issuer policies, typed/protobuf hybrid evidence, signature shape/lengths, missing/conflicting events, mocked chain/network requests with actual source attribution, local file fingerprints, digest byte/hex diffs, and the supplied sample's exact canonical/reference comparison, storage-independent preparation, fresh editor copies, normal LCD path, and tamper/reset. **Synthetic signature bytes are classifier fixtures, not cryptographically valid signatures or live evidence.** The test script is configured but did not execute: command-tool validation prevented shell launch. In particular, the new reference-equality assertion is not a passing check until executed. Native QoreX and React interaction/race/storage coverage plus real mobile/QR/issuance validation remain pending. Cross-tab storage reservations/writes are not atomic; use one issuance tab.

The complete manual end-to-end checklist and honest AI/runtime verification record are in **[AI_USAGE.md](AI_USAGE.md)**.

Authoritative API sources used instead of guessed wallet methods:

- [QoreX provider types](https://github.com/qorechain/qorex-integrations/blob/main/packages/types/src/providers.ts)
- [Native dApp integration guide](https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/add-to-keplr-integration.md)
- [QoreX errors and chain IDs](https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/errors-and-chain-ids.md)
- [QoreX browser-extension signing documentation](https://docs.qorechain.io/qorex/browser-extension/#sign-and-broadcast)
- [QoreChain SDK](https://github.com/qorechain/qorechain-sdk)
- [Explorer network selection](https://github.com/qorechain/qorechain-explorer/blob/main/lib/network-provider.tsx)

## License

**MIT** for Chit application code, copyright Chit contributors: see **[LICENSE](LICENSE)**. Preserve its copyright/license attribution in copies and distributions. Dependencies retain their own licenses and credits:

| Open-source component | Credit / license | Use |
| --- | --- | --- |
| [@qorechain/sdk](https://github.com/qorechain/qorechain-sdk) | QoreChain / Apache-2.0 | Real message composers, codecs, REST/address utilities |
| [React / React DOM](https://github.com/facebook/react) | React contributors / MIT | Client-side workspace UI |
| [Vite](https://github.com/vitejs/vite) | Vite contributors / MIT | Development, static bundling, local LCD proxy |
| [qrcode.react](https://github.com/zpao/qrcode.react) | Paul O’Shannessy and contributors / ISC | Local scannable QR generation |
| [TypeScript](https://github.com/microsoft/TypeScript) | Microsoft/contributors / Apache-2.0 | Type checking |
| [Vitest](https://github.com/vitest-dev/vitest) | Vitest contributors / MIT | Regression tests |

The NIST FIPS 204 badge identifies an algorithm specification, **not** FIPS-validated software, independent signature verification, or clinical certification.
