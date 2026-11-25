# Chit AI usage and manual verification

The full record and reproducible manual checklist are in **[the project-root AI_USAGE.md](../AI_USAGE.md)**.

## Requested workflow and provenance

The requested workflow is **Mobile Harness → local model proxy → `gpt-6.2-sol` → human review/manual verification**. This coding session's harness instead identifies its coding model as **`gpt-6.1-sol`**. Local model-proxy logs were not available to verify a 6.2 run; the requested workflow is not falsely asserted as proven execution. The Vite `/lcd` REST proxy is separate from that model proxy.

AI inspected the starter and preserved its current five-field canonical SHA-256 plus native QoreX hybrid-signing/verification path. This request corrected the `main.tsx` stylesheet import and delegated the component/`src/instrument.css` spacing audit and refinements. The UI work covers mobile safe areas, specimen-ticket and digest-diff presentation, recovery collision guards/tests, and actual node/proxy source attribution. Receipt-archive/save warnings remain separate from cryptographic verdicts; issuer-policy read/write errors still block VERIFIED until recovery. Existing client-only permissioning, generic view/context notes, URL-fragment QR sharing/auto-verification, and zero-upload local file fingerprinting were reviewed. Tests now cover the supplied sample's exact canonical/reference comparison, storage-independent sample preparation, fresh editor copies, normal LCD reads, field edits/reset, and digest byte/hex diffs. Verify still reads the local issuer policy and never bypasses policy failures. These assertions remain unexecuted, not certified results.

Earlier focused read-only delegations inspected tooling, cryptographic/privacy/recovery logic, public sample evidence, pending-draft guards, and unchanged canonical bytes. This request used a scoped CSS/component audit and implementation delegation plus a separate read-only command/toolchain diagnostic. Bash and permission-bearing edit/write submissions were rejected during argument validation; source changes used the permission-free text editor. No test/build process executed. No secrets or real patient data were used. Synthetic rejection/shape fixtures are never presented as actual receipts or signatures.

## Performed vs pending

**Performed:** saved-source/import inspection, installed package-manifest/lockfile inspection, stylesheet/component spacing audit, static regression/privacy review, and another read-only public Diana node/sample check. The public sample reported code 0, height 10725694, the supplied CHIT memo, critical hybrid algorithm 1, and `pqc_hybrid_verify.status=verified`. The user has now supplied all five fields: `CHT-4671`, `Chest X-Ray`, `11/25/2026` (represented as v1 ISO `2026-11-25`), `CLINIC-A`, and controlled note `Follow-up visit`. `sample.ts` hashes a strictly normalized fresh copy without localStorage dependency; Verify uses the ordinary live Diana flow and enables the tamper editor. The reference is never substituted for the computed digest, and no signature or success state is seeded. The block timestamp was not used to guess visitDate.

**Installed (manifest inspection only):** qrcode.react 4.2.0, Vitest 2.1.9, TypeScript 5.9.3, Vite 5.4.21, with matching dependency declarations in the lockfile. The old assertion that QR/tests were uninstalled is obsolete.

**NOT EXECUTED:** a dependency install/clean reproduction in this resume, Vitest, TypeScript/Vite production build, browser/QR scanning, real QoreX approval/broadcast, and real app VERIFIED → TAMPERED → Reset. The requested `npm test` and `npm run build` calls in `/workspace/chit/chit` were rejected by command-tool argument validation **before shell launch**: `invalid justification: expected a non-empty sentence` or a same-mode sandbox-escalation validation error. No npm/compiler exit code exists. Existing dist files cannot certify these edits. Do not claim tests/build/manual end-to-end passed.

**Remaining limits:** numerical sample digest/reference equality, test/build execution, live sample UI interaction and QoreX/browser integration/race checks remain unconfirmed. All five requested sample fields are provided; corrected original data is needed only if actual canonical hashing disagrees with the chain commitment. localStorage updates/reservations are not atomic across tabs. All automatic pending clears compare expected normalized fields/hash; this is not browser-wide locking. Use one issuance tab. Code/tag format guards are not semantic PII detection, and demo allowlist addresses are not vetted clinic identities.

## Manual verification before submission

Commands are runnable from `/workspace/chit`:

```sh
npm run setup
cp chit/.env.example chit/.env
npm test
npm run typecheck
npm run build
npm run dev
```

Use HTTPS/localhost and a funded disposable Diana QoreX account with a separately registered ML-DSA-87 key. Confirm only one 1-uqor self-send plus wallet-shown fee and hash-only memo. Independently scan the QR verification URL, decode all five fields/txHash, and test initial-load/hashchange auto-verification on another device without a wallet; also retain legacy JSON export/import. Delete the QR and recover by local serial. Inspect the actual REST source/Explorer (select Testnet), strict code 0/height, 4,627-byte PQC extension, classical signature shape, and real `pqc_hybrid_verify.status=verified`. Edit any valid field and reset without broadcasting.

Test optional listed/unlisted issuer policy and storage failure, malformed/oversized links, pending-draft/collision recovery, correct separation of persistence warnings and cryptographic verdicts, wrong network, and mobile widths/focus/safe areas/reduced motion. With a benign non-medical PDF/PNG/JPEG fixture, verify local exact-byte SHA-256, no upload/name/preview/storage/receipt association, and clear/close behavior. The supplied live sample now includes all five fields; independently confirm its canonical/reference equality and the real edit/reset UI before marking a clean hash match passed. If a genuine mismatch occurs, retain it and obtain corrected original data rather than changing v1 normalization or seeding a success result. Record real evidence/results only after execution; the root document has the complete checklist. The NIST badge specifies an algorithm, not FIPS-validated software or clinical truth.

Chit is **MIT licensed**, copyright Chit contributors; [LICENSE](LICENSE). Open-source credit: @qorechain/sdk (QoreChain, Apache-2.0), React/React DOM and Vite (MIT), qrcode.react (ISC), TypeScript (Apache-2.0), and Vitest (MIT); see [README](README.md). Human review is required. The anchor proves receipt hash integrity subject to node/consensus trust, not a scan occurring, patient identity, clinical accuracy, clinic credentials, FIPS-validated software, encryption, or healthcare compliance.
