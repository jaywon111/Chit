import { describe, expect, it } from "vitest";
import { compareReceiptDigests } from "../src/lib/hashDiff.js";

const ZERO = "00".repeat(32);

describe("actual digest comparison", () => {
  it("compares case-normalized actual 32-byte digests", () => {
    expect(compareReceiptDigests("ab".repeat(32), "AB".repeat(32))).toEqual({ matches: true, differentHexPositions: 0, differentBytes: 0 });
  });

  it("counts one changed hex position as one differing byte", () => {
    expect(compareReceiptDigests(ZERO, "10" + "00".repeat(31))).toEqual({ matches: false, differentHexPositions: 1, differentBytes: 1 });
  });

  it("counts both positions of a changed byte only once in the byte metric", () => {
    expect(compareReceiptDigests(ZERO, "ff" + "00".repeat(30) + "01")).toEqual({ matches: false, differentHexPositions: 3, differentBytes: 2 });
    expect(compareReceiptDigests(ZERO, ZERO)?.matches).toBe(true);
  });

  it.each([null, "", "0".repeat(63), "0".repeat(65), "gg".repeat(32), ZERO + "\n"])("never considers a missing/malformed digest a match: %j", (invalid) => {
    expect(compareReceiptDigests(ZERO, invalid)).toBeNull();
    expect(compareReceiptDigests(invalid, ZERO)).toBeNull();
  });
});
