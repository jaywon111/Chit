# Chit — Quantum Pass web app

**Little receipt. Lasting proof.** This is the original inspected Vite + React + TypeScript application, now implementing mobile-friendly **Issue Chit** and **Verify Chit** views. The full project documentation is in [the root README](../README.md); AI/model provenance and manual-verification status are in [AI_USAGE.md](../AI_USAGE.md).

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

**Actual session status:** dependency installation, lockfile regeneration, unit tests, typecheck, production build, browser/QR checks, and a real wallet transaction are **NOT RUN/NOT VERIFIED**. Shell calls were rejected before execution by the runtime's optional-permission argument serializer. `qrcode.react` and `vitest` are declared but not installed. Run `npm run setup` (npm install) when command execution is restored; do not use `npm ci` until the updated lockfile is generated. No zero-TypeScript/Vite-error build is claimed.

## Testnet addresses

| Setting | Value |
| --- | --- |
| Native chain | `qorechain-diana` |
| EVM chain | `9800` (`0x2648`) |
| REST | <https://api-testnet.qore.host> |
| Consensus RPC | <https://rpc-testnet.qore.host> |
| Explorer | <https://explore.qore.network> |
| Starter EVM read RPC (not used for anchors) | <https://evm-testnet.qore.host> |

**Select Testnet in Explorer.** Its network selection is cookie-based; transaction links use `/tx/<HASH>` with no invented network parameter. The native anchor is one **1-uqor self-transfer** (0.000001 QOR), plus the exact wallet-set gas fee shown by QoreX. There is no Chit contract or hard-coded recipient.

## Privacy and canonical receipts

Only these fields are accepted: `receiptCode`, `scanCategory`, `visitDate`, `facilityTag`, and optional `note`. Categories are Chest X-Ray, Pelvis X-Ray, Limb X-Ray, Ultrasound, Non-Contrast CT, and Custom. Notes are predefined, non-identifying visit phrases or empty; Custom does not add a diagnosis field.

**Never use patient names, diagnoses, medical images, phone numbers, identifying notes, or patient IDs.** Extra import fields and arbitrary notes are rejected. Receipt/facility codes must be generic. Hashing is not encryption/anonymization, and localStorage/QR JSON is plaintext; use generic test data only.

`src/lib/receipt.ts` normalizes NFC text, trims/collapses whitespace, uppercases codes, canonicalizes category/note case, validates `YYYY-MM-DD`, and includes an empty note when omitted. Compact JSON uses fixed alphabetical key order:

```text
facilityTag, note, receiptCode, scanCategory, visitDate
```

Browser `crypto.subtle.digest('SHA-256', UTF8(canonicalJSON))` produces 64 lowercase hexadecimal characters. Proof metadata is not hashed. The sole on-chain memo is exactly **`CHIT:v1:<receiptHash>`**; no receipt fields enter the transaction. Chit rejects missing PQC registration rather than letting QoreX bootstrap an extra transaction.

Issued receipts and actual hashes are stored under `chit.receipts.v1`. A separate `chit.pending.v1` recovery draft is saved before signing and has no fabricated txHash. Double-click/uncertain-outcome guards prevent blind retry; real hashes remain exportable after failed indexing/storage. QR deletion does not erase local receipt-code recovery, but clearing browser data does. Export JSON for cross-device backup. Receipt-code lookup is local, not a public registry.

## Verification and proof limits

Saved codes, pasted/uploaded receipt JSON + transaction hash, and QR text payloads are supported. The public REST transaction path is `/cosmos/tx/v1beta1/txs/<txHash>`; default `.env` reads it through `/lcd`, forwarded to the same public REST host. Production static deployment must provide this proxy or a CORS-enabled direct REST URL.

**VERIFIED** requires Diana node identity, a matching returned txHash, strict numeric `tx_response.code === 0`, positive committed height, a supported critical `/qorechain.pqc.v1.PQCHybridSignature` algorithm 1 with **4,627 decoded bytes**, real compressed classical key shape and 64/65 signature bytes, a successful `pqc_hybrid_verify` event with one supported algorithm attribute, and equality of **Anchored Hash** from the exact transaction memo vs **Computed Hash** from the editable receipt. Missing/conflicting event evidence or unsupported status aliases do not count as success.

Edit `scanCategory`/`visitDate`, or use **Simulate Tamper** to get **TAMPERED (HASH MISMATCH)**; **Reset** restores the original. These helpers are local, do not modify stored originals, and never broadcast. A supplied JSON receiptHash is never treated as chain evidence.

**The anchor proves:** subject to trusting the queried HTTPS node and QoreChain consensus, the presented normalized receipt fields match a hash included in a successful transaction with accepted secp256k1 + ML-DSA-87 evidence. The block establishes inclusion of the hash, not the truth of a stated visit date.

**It does not prove:** a scan/visit happened, medical accuracy, patient identity/consent, clinic identity/licensure, authorized or unique issuance, ownership, encryption, anonymization, regulatory compliance, or permanent cryptographic invulnerability. Chit is not a light client and does not independently verify signatures or Merkle inclusion proofs. Wallet internals and pre-broadcast signed bytes are not exposed; only actual chain evidence supports the final claim.

Regression tests are in `tests/`; fabricated byte arrays are explicitly **test-only classifier fixtures**, not valid signatures or demo receipts. See the root [AI_USAGE.md](../AI_USAGE.md) for the real end-to-end verification checklist and pending checks.

## MIT license

Chit application code is **MIT licensed**: see [LICENSE](LICENSE). Dependencies retain their licenses; `@qorechain/sdk` is Apache-2.0. Full API-source citations, production proxy configuration, and detailed proof/privacy limitations are in [the root README](../README.md).

