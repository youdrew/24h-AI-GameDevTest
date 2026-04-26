// Tile Explorer — slot matcher: detects 3-of-a-kind in collection slot

// Returns { matched: number[] } where matched is an array of indices (length 3)
// to remove, or null if no match. Picks the first triple found by patternId.
export function findMatch(slotPatternIds) {
  const counts = new Map(); // patternId -> [indices]
  for (let i = 0; i < slotPatternIds.length; i++) {
    const p = slotPatternIds[i];
    if (p === null || p === undefined) continue;
    if (!counts.has(p)) counts.set(p, []);
    counts.get(p).push(i);
    if (counts.get(p).length >= 3) {
      return { patternId: p, indices: counts.get(p).slice(0, 3) };
    }
  }
  return null;
}
