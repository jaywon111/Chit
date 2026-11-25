# AI Usage & Verification Record — Chit

## Development Workflow & Human Oversight

Chit was built using an AI-assisted engineering workflow (**Mobile Harness → local proxy → coding agents**) paired with continuous human architectural review, security hardening, and live testnet verification on `qorechain-diana`.

- **Zero Secrets / Zero PHI Policy:** No wallet mnemonics, private/PQC keys, patient records, or personally identifiable information (PII) were ever shared with AI tools, stored in repository fixtures, or transmitted over the network.
- **Documentation-Grounded Integration:** Rather than relying on guessed wallet methods, QoreX and `@qorechain/sdk` integration paths were cross-checked directly against QoreChain's official provider types, browser-extension signing documentation, SDK source, and live Diana REST/RPC endpoints.

---

## Where AI Assisted

1. **Architecture & Cryptographic Design**
   - Structured the zero-PII diagnostic receipt model (`receiptCode`, `scanCategory`, `visitDate`, `facilityTag`, and controlled `note` vocabulary) with deterministic, key-ordered canonical JSON serialization and browser WebCrypto `SHA-256` hashing (`CHIT:v1:<receiptHash>`).
   - Scoped the on-chain footprint to a single native `1 uqor` (`0.000001 QOR`) self-send transaction signed via QoreX's hybrid `secp256k1` + `ML-DSA-87` (NIST FIPS 204) flow—requiring zero smart contracts, zero backend databases, and zero on-chain medical files.

2. **QoreX Integration & Fail-Closed Verification**
   - Built `chit/src/lib/qorex.ts` to detect `window.qorex.native`, enforce Diana network selection (`qorechain-diana` / EVM `9800`), verify an existing `ML-DSA-87` registration prior to signing, and execute `native.signAndBroadcast` exactly once with single-tab broadcast locks and pending-draft recovery (`chit.pending.v1`).
   - Built `chit/src/lib/verify.ts` and `CryptoEvidencePanel` to enforce fail-closed verification: confirming `tx_response.code === 0`, positive committed block height, critical `/qorechain.pqc.v1.PQCHybridSignature` (`4,627` decoded ML-DSA-87 bytes), classical `secp256k1` signature shape, `pqc_hybrid_verify.status=verified`, and exact equality between the on-chain memo digest and locally recomputed receipt SHA-256.

3. **Workspace UI, Tamper Simulation & Utilities**
   - Built the Swiss-instrument mobile/desktop workspace (`IssueView`, `VerifyView`, `HowItWorks`, `IssuerPolicyPanel`, `LocalFileFingerprint`, and `chit/src/instrument.css`) with self-contained `#verify=<base64url>` QR verification links, side-by-side digest diffs, an interactive local tamper/reset simulator, an optional client-side `qor1…` issuer allowlist (`chit.issuers.v1`), and a zero-upload local file SHA-256 helper.

4. **Testing & Documentation**
   - Authored Vitest regression suites in `chit/tests/` covering canonical normalization, strict schema rejection, URL-fragment sharing, issuer policy enforcement, hybrid signature/event classification, tamper/reset state transitions, and live sample handling.

---

## Adversarial Code Review & Hardening

During manual and AI-assisted code reviews, several subtle fail-open risks were identified and eliminated before deployment:

- **No Silent Classical Fallback:** Rejected `signDirect`-only and EVM transaction fallbacks so issuance strictly requires QoreX's native hybrid (`secp256k1` + `ML-DSA-87`) signing lane.
- **No Unintended Key-Bootstrap Transactions:** Preflight checks verify an existing `ML-DSA-87` registration before prompting the wallet, avoiding unexpected first-send bootstrap behavior.
- **No Trust in Claimed JSON Hashes:** The verifier never substitutes a JSON payload's declared `receiptHash` for chain evidence; digests are always recomputed locally from the five normalized fields and compared against the on-chain `CHIT:v1:` memo.
- **Strict Import & Storage Isolation:** Unknown JSON fields, arbitrary free-text notes, and oversized files are rejected on import, and same-code draft clearing verifies all five normalized fields plus `receiptHash` so colliding serials cannot overwrite unrelated drafts.

---

## Live Verification Evidence (`qorechain-diana`)

- **Production Build & Deployment:** Verified `npm run build` (`tsc --noEmit && vite build`) cleanly and deployed to **[chit-pink.vercel.app](https://chit-pink.vercel.app)** with `/lcd` proxying to `https://api-testnet.qore.host`.
- **On-Chain Anchor Verified:**
  - **Network:** `qorechain-diana` (Block height `10725694`)
  - **Transaction Hash:** `79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD`
  - **On-Chain Memo:** `CHIT:v1:7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727`
  - **Signature Evidence:** `PQCHybridSignature` (`ML-DSA-87`, `4,627 bytes`) + `secp256k1` (`64 bytes`), `pqc_hybrid_verify` status `verified`.
  - **Interactive Verification:** Confirmed end-to-end **Load Live Testnet Sample** lookup, hash comparison, and local tamper/reset behavior in the deployed web app.

---

## Scope & Trust Boundaries

Chit is a testnet cryptographic receipt-integrity prototype, not a clinical record system:

- **What it establishes:** Subject to trusting the queried Diana node and QoreChain consensus, the presented receipt fields match a `CHIT:v1:` hash anchored in a committed, hybrid-signed transaction.
- **What it does not establish:** It does not certify clinical accuracy, prove a physical scan occurred, verify patient identity or clinic licensure, or encrypt plaintext JSON/URLs/`localStorage`.

---

## Human Responsibility

All architecture choices, security boundaries, wallet interactions, on-chain transaction checks, and final submission materials were reviewed and validated by the project author.
