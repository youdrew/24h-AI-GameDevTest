// Tile Explorer — solver Web Worker
//
// Receives a layout payload and returns either:
//   { ok: true, optimalSteps: number }
//   { ok: false, reason: 'timeout' | 'unsolvable' }
//
// The solver runs a backtracking DFS on uncovered tiles, with iterative
// deepening to find the shortest sequence (== board tile count for clean clears).
// Optimization: it stops at the first complete solution and returns its length.

self.onmessage = (e) => {
  const { tiles, slotCapacity, timeoutMs } = e.data;
  const start = Date.now();
  try {
    const result = solve(tiles, slotCapacity, () => Date.now() - start > timeoutMs);
    if (result.timedOut) {
      self.postMessage({ ok: false, reason: 'timeout' });
    } else if (!result.solved) {
      self.postMessage({ ok: false, reason: 'unsolvable' });
    } else {
      self.postMessage({ ok: true, optimalSteps: result.steps });
    }
  } catch (err) {
    self.postMessage({ ok: false, reason: 'error', error: String(err) });
  }
};

function solve(tilesIn, slotCapacity, timedOut) {
  // Build coverage representation:
  //   For each tile, list of tile ids on strictly higher layer at same cell.
  //   A tile is uncovered <=> all of those tiles have been removed.
  const tiles = tilesIn.map((t) => ({ ...t }));
  const byCell = new Map();
  for (const t of tiles) {
    const k = `${t.gridX},${t.gridY}`;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(t);
  }
  // For each tile, the "blockers" are tiles in same cell on higher layers
  const blockers = new Map();
  for (const list of byCell.values()) {
    list.sort((a, b) => a.layer - b.layer);
    for (let i = 0; i < list.length - 1; i++) {
      const me = list[i];
      const above = list.slice(i + 1).map((t) => t.id);
      blockers.set(me.id, above);
    }
    blockers.set(list[list.length - 1].id, []);
  }

  const removed = new Set();
  const slot = []; // patternIds

  function uncovered() {
    const out = [];
    for (const t of tiles) {
      if (removed.has(t.id)) continue;
      const blockerList = blockers.get(t.id);
      let isBlocked = false;
      for (const b of blockerList) {
        if (!removed.has(b)) { isBlocked = true; break; }
      }
      if (!isBlocked) out.push(t);
    }
    return out;
  }

  let solvedSteps = -1;
  let steps = 0;
  let cancelled = false;

  // We use simple DFS; first solution found is reported. For real scoring we
  // could iterate, but first-solve is good enough for star thresholds.

  function dfs() {
    if (cancelled) return false;
    if (timedOut()) { cancelled = true; return false; }

    if (removed.size === tiles.length) {
      solvedSteps = steps;
      return true;
    }

    const avail = uncovered();
    if (avail.length === 0) return false;

    // Heuristic: try tiles whose pattern already has 2 in slot first
    const counts = new Map();
    for (const p of slot) counts.set(p, (counts.get(p) || 0) + 1);
    avail.sort((a, b) => (counts.get(b.patternId) || 0) - (counts.get(a.patternId) || 0));

    for (const t of avail) {
      // Place tile in slot
      slot.push(t.patternId);
      removed.add(t.id);
      steps++;

      // Check 3-of-a-kind
      const matchIdx = findThree(slot);
      let matchedRemoved = null;
      if (matchIdx) {
        // Remove the three matching slot entries
        matchedRemoved = matchIdx.map((i) => slot[i]);
        // Remove in descending index to keep indices valid
        for (let i = matchIdx.length - 1; i >= 0; i--) slot.splice(matchIdx[i], 1);
      } else if (slot.length > slotCapacity) {
        // Slot overflow → dead end
        slot.pop();
        removed.delete(t.id);
        steps--;
        continue;
      }

      if (dfs()) return true;

      // Undo
      if (matchedRemoved) {
        // Re-insert matching entries (order matters for correctness when there are
        // multiple equivalent triples — but since we sorted, restoring at end is fine)
        for (let i = 0; i < matchIdx.length; i++) {
          slot.splice(matchIdx[i], 0, matchedRemoved[i]);
        }
      } else {
        slot.pop();
      }
      removed.delete(t.id);
      steps--;
    }
    return false;
  }

  const ok = dfs();
  return { solved: ok, steps: solvedSteps, timedOut: cancelled };
}

function findThree(slot) {
  const seen = new Map();
  for (let i = 0; i < slot.length; i++) {
    const p = slot[i];
    if (!seen.has(p)) seen.set(p, []);
    seen.get(p).push(i);
    if (seen.get(p).length >= 3) return seen.get(p).slice(0, 3);
  }
  return null;
}
