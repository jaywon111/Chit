export interface ReceiptDigestDiff {
  matches: boolean;
  differentHexPositions: number;
  differentBytes: number;
}

/** Presentation only. Missing/malformed digests are never considered a match. */
export function compareReceiptDigests(anchored: string | null, computed: string | null): ReceiptDigestDiff | null {
  if (!anchored || !computed || anchored.length !== 64 || computed.length !== 64 || !/^[0-9a-f]{64}$/i.test(anchored) || !/^[0-9a-f]{64}$/i.test(computed)) return null;
  const left = anchored.toLowerCase();
  const right = computed.toLowerCase();
  let differentHexPositions = 0;
  let differentBytes = 0;
  for (let index = 0; index < 64; index += 1) if (left[index] !== right[index]) differentHexPositions += 1;
  for (let index = 0; index < 64; index += 2) if (left.slice(index, index + 2) !== right.slice(index, index + 2)) differentBytes += 1;
  return { matches: differentHexPositions === 0, differentHexPositions, differentBytes };
}
