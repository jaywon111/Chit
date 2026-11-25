# Chit

**Little receipt. Lasting proof.** A mobile-friendly, privacy-first imaging-receipt web app for the **QoreChain Quantum Pass** track.

Chit creates a small non-identifying receipt, hashes its canonical JSON in the browser, asks **QoreX** for **one native hybrid-signed transaction** (`secp256k1` + `ML-DSA-87`), and compares the receipt with the actual on-chain anchor. No smart contract, backend database, patient account, or EVM authorization window is needed.

The existing application remains in **`chit/`**. Root `package.json` only forwards commands to that inspected starter; no replacement outer app was created. The starter was a Vite + React + TypeScript SDK balance/tokenomics page, **not an existing QoreX wallet/signing implementation**. Its installed `@qorechain/sdk@0.14.0`, Vite proxy, React entrypoint, and real SDK codecs/composers are reused.

## Current validation status — important

Implementation, documentation, and regression tests have been written and statically reviewed. Public testnet REST/RPC responses and authoritative QoreX API documentation were read successfully.

**Dependency installation, `npm run build`, unit-test execution, browser rendering/QR scanning, and a real wallet transaction have NOT been verified in this session.** Shell calls were rejected **before execution** by the runtime's optional-permission argument serializer (it adds a `sandbox_permissions` request despite the session already having full file access). There are no shell exit codes or successful build results to report. `qrcode.react` and `vitest` are declared but are not yet installed, and the starter lockfile has not been regenerated. Run the setup and checks below after shell execution is restored; use `npm install`, not `npm ci`, until the updated lockfile is generated. Do not describe this as a completed zero-error build.

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

**Never enter, import, store, or publish patient names, diagnoses, medical images, phone numbers, or identifying notes.** There are no patient-name, diagnosis, phone, camera, or image-upload fields. `Custom` is a generic category, not a free-text diagnosis box. Notes intentionally use a controlled vocabulary (`Visit completed`, `Follow-up visit`, `Receipt reissued`, `Digital copy requested`, or empty) instead of unrestricted text. Imports reject extra fields, unsupported categories, and arbitrary notes rather than silently preserving them. Codes and tags must not be repurposed as patient identifiers; a schema cannot determine the operator's intent.

The app has no analytics, receipt API uploads, remote font/image dependencies, seed/private-key inputs, or secret-key storage. Imported files are read only in browser memory. Only allowlisted receipts are persisted, and imported records are saved only through **Save verified Chit**.

**Hashing is not encryption or guaranteed anonymization.** These receipt values can be low entropy, and dates/categories/tags can be correlated with outside information. Both QR/JSON and localStorage are plaintext. Use only generic, non-identifying test data; this is not a clinical record system or a regulatory-compliance claim. Public transactions also reveal the wallet address, fee, and block timestamp; none of those wallet details are stored in Chit receipt JSON.

## Canonical SHA-256

`chit/src/lib/receipt.ts` is the single canonicalization implementation for Issue, Verify, imports, and storage:

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

The QR text is the compact JSON envelope; exported/copyable JSON is the same schema, optionally pretty-printed:

```text
{ version: 1, chainId: "qorechain-diana", receipt: { five fields }, receiptHash: "<real hash>", txHash: "<real transaction hash>" }
```

The metavariables above are explanatory only, **not a valid or issued demo receipt**. No example hash, synthetic transaction, or fake “VERIFIED” result is seeded into the UI or storage.

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
- Corrupt storage is not silently overwritten. Duplicate codes cannot replace a different receipt. Storage is limited to 250 receipts/drafts per store with no automatic eviction.
- Deleting a downloaded QR image does not delete the local receipt. Use its short code in Verify or the recovery list. Clearing browser data **does** remove local recovery; export JSON as a separate backup.
- A receipt code is a **local lookup key**, not a public chain registry. Another browser/device needs the exported JSON or scanned QR text plus transaction hash.

## Verify Chit and simulate tampering

Use a saved code, paste the Chit envelope/QR text, or load a small `.json` / QR-payload `.txt` file. Flat receipt JSON plus a separately supplied `txHash` is also supported. Unknown fields, conflicting hashes, wrong chain/schema, malformed hashes, and arbitrary notes are rejected. Images are not accepted. Importing does not save the input.

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

Side-by-side hashes, signature lengths/type URL, event status, code/height, and an Explorer link are shown. Edit `scanCategory` / `visitDate` or click **Simulate Tamper**: a mismatch becomes **TAMPERED (HASH MISMATCH)**. **Reset** restores the original in-memory receipt; neither helper broadcasts or modifies saved records. Old “VERIFIED” results are not reused while an edited hash is computing. Missing evidence, failed requests, wrong chains, unsupported extensions, or failed transactions do not produce success.

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

Regression tests in `chit/tests/` cover canonicalization, WebCrypto hashing, field edits/reset, strict imports, storage failures/corruption/collisions/pending drafts, typed/protobuf hybrid extensions, signature shape/lengths, contradictory/missing events, network/tx failures, and mocked read-only fetches. **Synthetic signature bytes are classifier fixtures, not cryptographically valid signatures or real receipts.** Tests are currently written but unexecuted.

The complete manual end-to-end checklist and honest AI/runtime verification record are in **[AI_USAGE.md](AI_USAGE.md)**.

Authoritative API sources used instead of guessed wallet methods:

- [QoreX provider types](https://github.com/qorechain/qorex-integrations/blob/main/packages/types/src/providers.ts)
- [Native dApp integration guide](https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/add-to-keplr-integration.md)
- [QoreX errors and chain IDs](https://github.com/qorechain/qorex-integrations/blob/main/docs/guides/errors-and-chain-ids.md)
- [QoreX browser-extension signing documentation](https://docs.qorechain.io/qorex/browser-extension/#sign-and-broadcast)
- [QoreChain SDK](https://github.com/qorechain/qorechain-sdk)
- [Explorer network selection](https://github.com/qorechain/qorechain-explorer/blob/main/lib/network-provider.tsx)

## License

**MIT** for Chit application code: see **[LICENSE](LICENSE)**. Third-party packages retain their respective licenses; the QoreChain SDK is Apache-2.0.
