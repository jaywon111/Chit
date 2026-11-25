# Chit AI usage and manual verification

The full record and reproducible manual checklist are in **[the project-root AI_USAGE.md](../AI_USAGE.md)**.

## Requested workflow and provenance

The requested workflow is **Mobile Harness → local model proxy → `gpt-6.2-sol` → human review/manual verification**. This coding session's harness instead identifies its coding model as **`gpt-6.1-sol`**. Local model-proxy logs were not available to verify a 6.2 run; the requested workflow is not falsely asserted as proven execution. The Vite `/lcd` REST proxy is separate from that model proxy.

AI inspected the starter's package/src and actual SDK/provider exports first, then assisted with QoreX integration, canonical WebCrypto SHA-256 receipts, non-PII storage/recovery, QR/JSON exports, responsive React views, evidence-based verification and tamper/reset helpers, tests, MIT licensing, and documentation. Two focused background agents supplied authoritative provider research and independent static regression review. No secrets or actual patient data were used.

## Performed vs pending

**Performed:** starter/SDK inspection, authoritative API-source reading, manual static code review, and read-only public Diana REST/RPC checks. An unrelated existing transaction was read only to understand event/extension shape; no demo Chit or fake “VERIFIED” state was seeded.

**NOT RUN:** npm installation/lockfile regeneration, Vitest execution, TypeScript/Vite build, browser/QR scanning, real QoreX connection/signing/broadcast, or real end-to-end VERIFIED → TAMPERED → Reset. The runtime's optional-permission argument serializer rejected shell calls before execution; no successful exit codes exist. Do not claim a zero-error build or manual end-to-end pass. `qrcode.react` and `vitest` still require a real npm install.

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

Then use HTTPS/localhost and a funded disposable Diana QoreX account with a separately registered ML-DSA-87 key. Confirm only one 1-uqor self-send plus fee and hash-only memo; export and independently scan QR JSON; delete the QR and recover by code; inspect the real REST result/Explorer (select Testnet), 4,627-byte PQC extension and actual `pqc_hybrid_verify.status=verified`; edit category/date and reset; test failures, storage/unknown-submission recovery, wrong network, mobile widths, focus, and no wallet needed for verification. Confirm proof limits and zero-PII controls. Record actual evidence/results only after performing these checks. The root document has the complete checklist, source links, and trust limitations.

Chit is **MIT licensed**; [LICENSE](LICENSE). Human review is required. It proves receipt hash integrity subject to node/consensus trust, not a scan occurring, patient identity, clinical accuracy, or healthcare compliance.
