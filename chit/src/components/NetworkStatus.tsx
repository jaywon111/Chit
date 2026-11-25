import { useEffect, useState } from "react";
import { CHAIN_ID, REST_BASE } from "../lib/network.js";

/** A read-only node check, not a fabricated live/network badge. */
export function NetworkStatus(): JSX.Element {
  const [status, setStatus] = useState<"checking" | "live" | "unavailable" | "wrong-network">("checking");
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    void fetch(`${REST_BASE}/cosmos/base/tendermint/v1beta1/node_info`, {
      signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Node unavailable");
      const payload: unknown = await response.json();
      const root = payload !== null && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const info = root.default_node_info;
      const network = info !== null && typeof info === "object" ? (info as Record<string, unknown>).network : undefined;
      if (current) setStatus(network === CHAIN_ID ? "live" : "wrong-network");
    }).catch(() => { if (current) setStatus("unavailable"); }).finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  const label = status === "live" ? "Diana node reachable" : status === "checking" ? "Checking Diana node" : status === "wrong-network" ? "Wrong network: verification will be rejected" : "Diana node unavailable: no verification assumed";
  return <span className={`network-indicator network-${status}`} title={label} role="status">
    <span className="status-dot" /><span>{CHAIN_ID}</span><span className="network-state">{status === "live" ? "TESTNET / LIVE" : status === "checking" ? "CHECKING" : status === "wrong-network" ? "REJECTED" : "OFFLINE"}</span>
    <span className="sr-only">{label}</span>
  </span>;
}
