// Public synthetic demo addresses only; none is represented as a trusted real clinic.
import { bech32ToHex, hexToBech32, isValidBech32 } from "@qorechain/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_ISSUERS,
  ISSUER_STORAGE_KEY,
  defaultIssuerPolicy,
  loadIssuerPolicy,
  normalizeIssuerAddress,
  normalizeIssuerPolicy,
  saveIssuerPolicy,
  type IssuerPolicy,
} from "../src/lib/issuers.js";

const SAMPLE_SIGNER = "qor1dtzxvc7q7glkyj9n3vx2jewpm7hqcf9u0d7h2c";
const SYNTHETIC_SIGNER = hexToBech32(`0x${"11".repeat(20)}`, "qor");
const OTHER_SIGNER = hexToBech32(`0x${"22".repeat(20)}`, "qor");
const POLICY: IssuerPolicy = { version: 1, enabled: true, addresses: [SYNTHETIC_SIGNER] };

class MemoryStorage {
  readonly values: Map<string, string>;
  readonly getItem = vi.fn((key: string): string | null => this.values.get(key) ?? null);
  readonly setItem = vi.fn((key: string, value: string): void => { this.values.set(key, value); });
  constructor(initial: Record<string, string> = {}) { this.values = new Map(Object.entries(initial)); }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SDK-validated public issuer addresses", () => {
  it("validates the observed sample address with the SDK and exactly 20 decoded bytes", () => {
    expect(isValidBech32(SAMPLE_SIGNER, "qor")).toBe(true);
    expect(bech32ToHex(SAMPLE_SIGNER)).toMatch(/^0x[0-9a-f]{40}$/u);
    expect(normalizeIssuerAddress(SAMPLE_SIGNER)).toBe(SAMPLE_SIGNER);
    expect(normalizeIssuerAddress(` \t${SAMPLE_SIGNER}\n `)).toBe(SAMPLE_SIGNER);
  });

  it("labels the observed signer as unvetted and deterministic synthetic entries as demos, not real clinics", () => {
    expect(DEMO_ISSUERS.map(({ address }) => address)).toEqual([SAMPLE_SIGNER, SYNTHETIC_SIGNER, OTHER_SIGNER]);
    expect(DEMO_ISSUERS[0].label).toMatch(/testnet.*not vetted/i);
    for (const issuer of DEMO_ISSUERS.slice(1)) {
      expect(issuer.label).toMatch(/deterministic.*synthetic.*not a real clinic/i);
      expect(isValidBech32(issuer.address, "qor")).toBe(true);
      expect(normalizeIssuerAddress(issuer.address)).toBe(issuer.address);
    }
    expect(bech32ToHex(DEMO_ISSUERS[1].address)).toBe(`0x${"11".repeat(20)}`);
    expect(bech32ToHex(DEMO_ISSUERS[2].address)).toBe(`0x${"22".repeat(20)}`);
    expect(new Set(DEMO_ISSUERS.map(({ address }) => address)).size).toBe(DEMO_ISSUERS.length);
  });

  it.each([
    null, undefined, 1, [], {}, "", "qor1invalid", SAMPLE_SIGNER.toUpperCase(),
    `qor1${SAMPLE_SIGNER.slice(4).toUpperCase()}`, SAMPLE_SIGNER.slice(0, -1) + "q",
    `0x${"11".repeat(20)}`, "SYNTHETIC CLINIC", "qor1" + "a".repeat(257),
    hexToBech32(`0x${"11".repeat(20)}`, "cosmos"),
    hexToBech32(`0x${"11".repeat(20)}`, "qorvaloper"),
    hexToBech32(`0x${"11".repeat(19)}`, "qor"),
    hexToBech32(`0x${"11".repeat(21)}`, "qor"),
  ].map((value) => ({ value })))("rejects non-lowercase, wrong-prefix/length/checksum, and non-address input: $value", ({ value }) => {
    expect(() => normalizeIssuerAddress(value)).toThrow(/lowercase.*20-byte|bech32/i);
  });
});

describe("local issuer policy schema and persistence", () => {
  it("defaults to opt-in mode with independent arrays/state and never writes during load", () => {
    const storage = new MemoryStorage();
    const first = defaultIssuerPolicy();
    const second = defaultIssuerPolicy();
    expect(first).toEqual({ version: 1, enabled: false, addresses: DEMO_ISSUERS.map(({ address }) => address) });
    first.enabled = true;
    first.addresses.pop();
    expect(second.enabled).toBe(false);
    expect(second.addresses).toHaveLength(DEMO_ISSUERS.length);
    expect(loadIssuerPolicy(storage)).toEqual(second);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("roundtrips only the version/enabled/public addresses schema and confirms normalized writes", () => {
    const storage = new MemoryStorage();
    const clean = saveIssuerPolicy({ ...POLICY, addresses: [` ${SYNTHETIC_SIGNER} `, OTHER_SIGNER] }, storage);
    expect(clean).toEqual({ version: 1, enabled: true, addresses: [SYNTHETIC_SIGNER, OTHER_SIGNER] });
    expect(loadIssuerPolicy(storage)).toEqual(clean);
    const raw = storage.getItem(ISSUER_STORAGE_KEY)!;
    expect(JSON.parse(raw)).toEqual(clean);
    expect(Object.keys(JSON.parse(raw))).toEqual(["version", "enabled", "addresses"]);
    expect(raw).not.toContain("label");
    expect(raw).not.toContain("clinic");
    expect(storage.setItem).toHaveBeenCalledWith(ISSUER_STORAGE_KEY, JSON.stringify(clean));
  });

  it("allows an enabled empty allowlist (deny all) and an explicitly disabled valid policy", () => {
    const storage = new MemoryStorage();
    expect(saveIssuerPolicy({ version: 1, enabled: true, addresses: [] }, storage)).toEqual({ version: 1, enabled: true, addresses: [] });
    expect(loadIssuerPolicy(storage).enabled).toBe(true);
    expect(saveIssuerPolicy({ version: 1, enabled: false, addresses: [] }, storage)).toEqual({ version: 1, enabled: false, addresses: [] });
  });

  const invalidPolicies: Array<[string, unknown]> = [
    ["null", null], ["array", []], ["missing version", { enabled: true, addresses: [] }],
    ["wrong version", { ...POLICY, version: 2 }], ["string version", { ...POLICY, version: "1" }],
    ["missing enabled", { version: 1, addresses: [] }], ["string enabled", { ...POLICY, enabled: "false" }],
    ["null enabled", { ...POLICY, enabled: null }], ["missing addresses", { version: 1, enabled: true }],
    ["non-array addresses", { ...POLICY, addresses: SYNTHETIC_SIGNER }],
    ["malformed address", { ...POLICY, addresses: ["qor1invalid"] }],
    ["upper-case address", { ...POLICY, addresses: [SYNTHETIC_SIGNER.toUpperCase()] }],
    ["duplicate address", { ...POLICY, addresses: [SYNTHETIC_SIGNER, ` ${SYNTHETIC_SIGNER} `] }],
    ["partially corrupt list", { ...POLICY, addresses: [SYNTHETIC_SIGNER, null] }],
    ["sparse list", { ...POLICY, addresses: new Array(1) }],
    ["extra label field", { ...POLICY, labels: ["SYNTHETIC CLINIC"] }],
    ["extra issuer/name field", { ...POLICY, patientName: "SYNTHETIC" }],
    ["disabled but corrupt", { version: 1, enabled: false, addresses: ["bad"] }],
    ["prototype field", JSON.parse('{"version":1,"enabled":true,"addresses":[],"__proto__":{}}')],
  ];

  it.each(invalidPolicies)("rejects %s before saving anything", (_label, value) => {
    const storage = new MemoryStorage();
    expect(() => normalizeIssuerPolicy(value)).toThrow();
    expect(() => saveIssuerPolicy(value as IssuerPolicy, storage)).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"], ["empty JSON", ""],
    ...invalidPolicies.map(([label, value]) => [label, JSON.stringify(value)] as [string, string]),
  ])("fails closed on stored %s and never overwrites corrupt bytes with disabled defaults", (_label, raw) => {
    const storage = new MemoryStorage({ [ISSUER_STORAGE_KEY]: raw });
    expect(() => loadIssuerPolicy(storage)).toThrow(/blocked or corrupted.*fails closed/i);
    expect(() => saveIssuerPolicy(defaultIssuerPolicy(), storage)).toThrow(/not overwritten/i);
    expect(storage.getItem(ISSUER_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("caps policy at 100 valid unique addresses and rejects oversized text/list stores", () => {
    const addresses = Array.from({ length: 101 }, (_, index) => hexToBech32(`0x${(index + 1).toString(16).padStart(40, "0")}`, "qor"));
    const storage = new MemoryStorage();
    const maximum = { version: 1 as const, enabled: true, addresses: addresses.slice(0, 100) };
    expect(saveIssuerPolicy(maximum, storage).addresses).toHaveLength(100);
    const raw = storage.getItem(ISSUER_STORAGE_KEY)!;
    storage.setItem.mockClear();
    expect(() => saveIssuerPolicy({ ...maximum, addresses }, storage)).toThrow(/at most 100/i);
    expect(storage.getItem(ISSUER_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.values.set(ISSUER_STORAGE_KEY, JSON.stringify({ ...maximum, addresses }));
    expect(() => loadIssuerPolicy(storage)).toThrow(/fails closed/i);
    storage.values.set(ISSUER_STORAGE_KEY, " ".repeat(12_001) + JSON.stringify(maximum));
    expect(() => loadIssuerPolicy(storage)).toThrow(/fails closed/i);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("fails closed on unreadable storage without silently disabling or writing a policy", () => {
    const storage = new MemoryStorage();
    storage.getItem.mockImplementation(() => { throw new Error("SYNTHETIC read denial"); });
    expect(() => loadIssuerPolicy(storage)).toThrow(/fails closed/i);
    expect(() => saveIssuerPolicy(defaultIssuerPolicy(), storage)).toThrow(/fails closed/i);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([false, true])("reports failed persistence and preserves a previous enabled policy (silent drop = %s)", (silent) => {
    const raw = JSON.stringify(POLICY);
    const storage = new MemoryStorage({ [ISSUER_STORAGE_KEY]: raw });
    storage.setItem.mockImplementation(() => { if (!silent) throw new Error("SYNTHETIC quota failure"); });
    expect(() => saveIssuerPolicy({ ...POLICY, enabled: false }, storage)).toThrow(/keep the previous active policy/i);
    expect(storage.getItem(ISSUER_STORAGE_KEY)).toBe(raw);
    expect(loadIssuerPolicy(storage).enabled).toBe(true);
  });

  it("does not report success if read-back fails after writing", () => {
    const storage = new MemoryStorage();
    storage.getItem.mockImplementationOnce(() => null).mockImplementation(() => { throw new Error("SYNTHETIC read-back denial"); });
    expect(() => saveIssuerPolicy(POLICY, storage)).toThrow(/could not be saved/i);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("uses optional browser storage, but missing/unavailable default storage is an error rather than disabled mode", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(saveIssuerPolicy(POLICY)).toEqual(POLICY);
    expect(loadIssuerPolicy()).toEqual(POLICY);
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadIssuerPolicy()).toThrow(/fails closed/i);
    expect(() => saveIssuerPolicy(POLICY)).toThrow(/storage is unavailable/i);
  });
});
