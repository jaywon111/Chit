import { bech32ToHex, hexToBech32, isValidBech32 } from "@qorechain/sdk";

export interface IssuerPolicy {
  version: 1;
  enabled: boolean;
  addresses: string[];
}

export const ISSUER_STORAGE_KEY = "chit.issuers.v1";
const MAX_ISSUERS = 100;
const MAX_POLICY_LENGTH = 12_000;
type IssuerStorage = Pick<Storage, "getItem" | "setItem">;

/** Require the SDK-checked lowercase qor account encoding of exactly 20 bytes. */
export function normalizeIssuerAddress(value: unknown): string {
  if (typeof value !== "string" || value.length > 256) throw new Error("An issuer must be a lowercase 20-byte qor address.");
  const address = value.trim();
  try {
    if (address !== address.toLowerCase() || !address.startsWith("qor1") || !isValidBech32(address, "qor") || !/^0x[0-9a-f]{40}$/u.test(bech32ToHex(address))) {
      throw new Error("Invalid address");
    }
  } catch {
    throw new Error("Use a valid lowercase 20-byte qor bech32 address with its checksum; names, hex addresses, and other prefixes are not accepted.");
  }
  return address;
}

// These are demonstration entries, NOT a directory of trusted real clinics.
// The first address is the observed live Diana sample signer, not a vetted identity.
// Repeated-byte addresses are deterministic synthetic examples with real checksums.
export const DEMO_ISSUERS = Object.freeze([
  { address: "qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c", label: "Observed Diana testnet sample signer — identity not vetted" },
  { address: hexToBech32(`0x${"11".repeat(20)}`, "qor"), label: "Deterministic demo signer A — synthetic, not a real clinic" },
  { address: hexToBech32(`0x${"22".repeat(20)}`, "qor"), label: "Deterministic demo signer B — synthetic, not a real clinic" },
].map((issuer) => Object.freeze(issuer)));

/** Opt-in local permissioning only. Each call returns independent mutable state. */
export function defaultIssuerPolicy(): IssuerPolicy {
  return { version: 1, enabled: false, addresses: DEMO_ISSUERS.map((issuer) => normalizeIssuerAddress(issuer.address)) };
}

/** Shared runtime guard used on persistence and before issuer authorization. */
export function normalizeIssuerPolicy(value: unknown): IssuerPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Issuer policy must be an object.");
  const policy = value as Record<string, unknown>;
  if (Object.keys(policy).some((key) => !["version", "enabled", "addresses"].includes(key))) throw new Error("Unrecognized issuer policy fields were rejected; only public addresses are stored.");
  if (policy.version !== 1 || typeof policy.enabled !== "boolean") throw new Error("Unsupported or malformed issuer policy version/enabled flag.");
  if (!Array.isArray(policy.addresses) || policy.addresses.length > MAX_ISSUERS) throw new Error(`Issuer policy must contain at most ${MAX_ISSUERS} addresses.`);
  const addresses = Array.from(policy.addresses, normalizeIssuerAddress);
  if (new Set(addresses).size !== addresses.length) throw new Error("Duplicate issuer addresses are not accepted.");
  return { version: 1, enabled: policy.enabled, addresses };
}

function browserStorage(): IssuerStorage {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("Storage unavailable");
    return storage;
  } catch {
    throw new Error("Issuer policy storage is unavailable. Permissioned verification must not be silently disabled.");
  }
}

/** Missing policy is the opt-in default. Corruption/unreadable storage throws, never disables a policy. */
export function loadIssuerPolicy(storage?: IssuerStorage): IssuerPolicy {
  try {
    const raw = (storage ?? browserStorage()).getItem(ISSUER_STORAGE_KEY);
    if (raw === null) return defaultIssuerPolicy();
    if (typeof raw !== "string" || raw.length > MAX_POLICY_LENGTH) throw new Error("Invalid policy store");
    return normalizeIssuerPolicy(JSON.parse(raw));
  } catch {
    throw new Error("Saved issuer policy could not be read; storage may be blocked or corrupted. Permissioned verification fails closed. Existing policy bytes were not overwritten.");
  }
}

/** Validate and confirm persistence; never replace an unreadable/corrupt saved policy. */
export function saveIssuerPolicy(policy: IssuerPolicy, storage?: IssuerStorage): IssuerPolicy {
  const clean = normalizeIssuerPolicy(policy);
  const target = storage ?? browserStorage();
  loadIssuerPolicy(target);
  const serialized = JSON.stringify(clean);
  if (serialized.length > MAX_POLICY_LENGTH) throw new Error("Issuer policy is too large.");
  try {
    target.setItem(ISSUER_STORAGE_KEY, serialized);
    if (target.getItem(ISSUER_STORAGE_KEY) !== serialized) throw new Error("Policy write was not retained");
  } catch {
    throw new Error("Issuer policy could not be saved. Keep the previous active policy; a storage failure must not disable permissioned verification.");
  }
  return clean;
}
