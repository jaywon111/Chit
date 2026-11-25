import { explorerTxUrl as sdkExplorerTxUrl } from "@qorechain/sdk";

// Diana's native lane is used for the hybrid-signed anchor. Its EVM lane is
// chain 9800, but https://rpc-testnet.qore.host is consensus RPC, not EVM RPC.
export const CHAIN_ID = "qorechain-diana";
export const EVM_CHAIN_ID = 9800;
export const REST_URL = "https://api-testnet.qore.host";
export const RPC_URL = "https://rpc-testnet.qore.host";
export const EXPLORER_URL = "https://explore.qore.network";

// Set VITE_QORE_REST_URL=/lcd to use the app's same-origin LCD proxy, or set a
// direct REST base. There is deliberately no localhost or mainnet default.
export const REST_BASE = (
  import.meta.env.VITE_QORE_REST_URL?.trim() || REST_URL
).replace(/\/+$/, "");

/**
 * Native Cosmos transaction link. The public explorer selects its network via
 * a cookie, not a documented URL parameter: select Testnet in the explorer.
 * Sources: qorechain/qorechain-explorer lib/network-provider.tsx, lib/registry.ts.
 */
export function explorerTxUrl(txHash: string): string {
  if (typeof txHash !== "string" || !/^(?:0x)?[0-9a-f]{64}$/i.test(txHash)) {
    throw new Error("Expected a 32-byte native transaction hash.");
  }
  const hash = txHash.replace(/^0x/i, "").toUpperCase();
  return sdkExplorerTxUrl({ explorerUrl: EXPLORER_URL }, hash);
}
