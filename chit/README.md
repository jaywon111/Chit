# Chit
[![Built on QoreChain](https://build.qorechain.io/badge/chit-2.svg)](https://build.qorechain.io/p/chit-2)

A mobile-first receipt-integrity instrument for the **QoreChain Quantum Pass** track (`qorechain-diana` testnet). Chit lets clinics or operators generate a non-identifying diagnostic receipt, compute a canonical **SHA-256** commitment locally in the browser, anchor that hash on-chain via **one QoreX native hybrid-signed transaction** (`secp256k1` + `ML-DSA-87`, NIST FIPS 204), and verify integrity or simulate tampering without storing patient data or running a backend server.

Live deployment: **[chit-pink.vercel.app](https://chit-pink.vercel.app)**

Pitch Deck: **[https://docs.google.com/presentation/d/1adjii0QRTwivICX0u4pgp6kqkUAczHsPWF3oU--igOc/edit?usp=drivesdk](https://docs.google.com/presentation/d/1adjii0QRTwivICX0u4pgp6kqkUAczHsPWF3oU--igOc/edit?usp=drivesdk)**

---

## Why Chit Exists

Duplicate medical imaging creates avoidable cost and delays across health systems. Chit acts as a lightweight, zero-PII cryptographic integrity check for diagnostic receipts:

- **Zero PHI & No Medical Images On-Chain:** Patient names, diagnoses, phone numbers, and raw medical images never enter the app or touch the blockchain. Only generic, non-identifying receipt fields are hashed locally, and the 64-character lowercase hex SHA-256 digest is written in the transaction memo (`CHIT:v1:<receiptHash>`).
- **No Smart Contract or Backend Database:** Verification runs directly from the browser against Diana REST/RPC endpoints (proxied via `/lcd` to avoid CORS), comparing locally recomputed SHA-256 against the on-chain memo commitment.
- **Post-Quantum Hybrid Signing via QoreX:** Uses a single native `1 uqor` (`0.000001 QOR`) self-send transaction (plus QoreX gas fee) signed with QoreX's hybrid `secp256k1` + `ML-DSA-87` flow on `qorechain-diana`.

---

## Key Features

- **Issue (`IssueView`):** Controlled non-identifying receipt fields (`receiptCode`, `scanCategory`, `visitDate`, `facilityTag`, and optional `note`), live canonical SHA-256 preview, specimen ticket preview, `#verify=<base64url>` QR verification link, and single-broadcast QoreX signing with pending-draft recovery (`chit.pending.v1` / `chit.receipts.v1`).
- **Verify (`VerifyView` & `CryptoEvidencePanel`):** Read-only verification (no wallet required) via local code, pasted/imported JSON or `#verify=` URL/fragment, or **Load Live Testnet Sample**. Displays live chain/block/sender status, `PQCHybridSignature` (`ML-DSA-87`) and classical signature checks, side-by-side digests, and per-position hash diffs.
- **Tamper Simulator:** Edit receipt fields locally or trigger tamper simulation to see immediate **HASH MISMATCH — TAMPER DETECTED** feedback, then click **Reset** to restore original in-memory values.
- **Optional Issuer Allowlist (`IssuerPolicyPanel`):** Browser-local `qor1…` sender policy (`chit.issuers.v1`) checking `MsgSend.from_address` (fail-closed when enabled).
- **Local File SHA-256 Helper (`LocalFileFingerprint`):** Zero-upload browser WebCrypto digest check for PDF, PNG, or JPEG files up to 32 MiB (never attached to receipts or sent over the network).

---

## Live Diana Testnet Sample

Click **Load Live Testnet Sample** in **Verify** to test against a live `qorechain-diana` transaction:

- **Transaction Hash:** `79C0518AB0FB481C992B21559A27FE169B6877CC8CD37E862C8BE4FDF615D3AD`
- **Memo:** `CHIT:v1:7e146384b7b5b73bfec366bb7f905c34bb9efd0d4c467c723cd0aa3e2773c727`
- **Sample Fields:** `CHT-4671` · `Chest X-Ray` · `11/25/2026` (`2026-11-25`) · `CLINIC-A` · `Follow-up visit`

---

## Network & Configuration

| Setting | Value |
| --- | --- |
| Native Chain ID | `qorechain-diana` |
| EVM Chain ID | `9800` (`0x2648`) |
| REST Endpoint | `https://api-testnet.qore.host` |
| RPC Endpoint | `https://rpc-testnet.qore.host` |
| Explorer | `https://explore.qore.network` (select **Testnet**) |
| Native Denom | `uqor` (`1 QOR = 1,000,000 uqor`) |

Environment variables (`chit/.env.example`):

```dotenv
VITE_QORE_REST_URL=/lcd
QORE_REST_PROXY_TARGET=[https://api-testnet.qore.host](https://api-testnet.qore.host)
VITE_QORE_EVM_RPC_URL=[https://evm-testnet.qore.host](https://evm-testnet.qore.host)

Repository Structure & Local Development
The Vite + React + TypeScript application lives inside chit/, with root scripts in /workspace/chit forwarding commands:
├── chit/               # Vite + React + TypeScript app, components, lib, tests, vercel.json
├── AI_USAGE.md         # AI assistance & verification notes
├── LICENSE             # MIT License
└── package.json        # Root script forwarders

Run locally (Node.js 20+ and HTTPS or localhost for crypto.subtle / QoreX):
npm run setup
cp chit/.env.example chit/.env
npm test
npm run typecheck
npm run build
npm run dev

For issuance, connect a QoreX wallet set to qorechain-diana (EVM 9800) with testnet funds and an already-registered ML-DSA-87 key.
Trust & Limitations
 * What it proves: Given a trusted node and QoreChain consensus, the receipt fields hash to the CHIT:v1: memo anchored in a successful (code === 0) hybrid-signed Diana transaction.
 * What it does not prove: It does not certify clinical accuracy, prove a physical visit occurred, authenticate patient identity/consent or clinic licensure, or encrypt/anonymize plaintext receipt payloads, URLs, or localStorage.
License
MIT License — see LICENSE. Built with @qorechain/sdk, React, TypeScript, Vite, qrcode.react, and Vitest.

## Trust Model & Next Steps (Post-MVP)

- **Integrity (Live in MVP):** Verifies that a receipt pass has not been altered against its anchored cryptographic record on `qorechain-diana` while keeping patient PII off-chain.
- **Authority / Permissioned Issuers (Next Step):** Anchoring a hash proves integrity rather than real-world scan authenticity on its own. Our next step after MVP is introducing allowlisted/permissioned clinic and diagnostic center issuers so verifiers can distinguish an anchored record from an authorized issuer.
