// Tile Explorer — level generation
//
// Difficulty formula (smoothed) + reverse layout generator.
// Tutorial levels (1–9) are fixed. Output is a deterministic layout (seeded by N).
//
// Layout shape:
//   {
//     N, params: { patternTypes, setsPerType, layers, tileCount },
//     boardSize: { cols, rows },
//     tiles: [ { id, patternId, layer, gridX, gridY } ],   // initial board
//     fallingQueue: [ patternId, ... ]                     // appended for level >= 51
//   }

import { CONFIG } from './config.js';

// ---- Smooth difficulty formula --------------------------------------------

export function smoothParam(N, period) {
  const base = Math.floor(N / period);
  const frac = (N % period) / period;
  const smoothed = frac * frac * (3 - 2 * frac); // ease-in-out
  return Math.round(base + smoothed);
}

export function levelParams(N) {
  if (N <= 9) {
    return { patternTypes: 3, setsPerType: 1, layers: 1, tileCount: 9 };
  }
  const patternTypes = smoothParam(N, 10) + 3;
  const setsPerType = smoothParam(N, 35) + 1;
  const layers = smoothParam(N, 25) + 1;
  const tileCount = patternTypes * setsPerType * 3;
  return { patternTypes, setsPerType, layers, tileCount };
}

// Deterministic PRNG (mulberry32)
export function rng(seed) {
  let s = (seed | 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// Compute board grid size from tileCount; aim for roughly square shape that
// fits per layer with some headroom (≈ 1.6× tileCount cells across layers).
function boardGrid(params) {
  const { tileCount, layers } = params;
  const perLayer = Math.ceil(tileCount / layers);
  // Target a small offset grid: cols * rows ≈ perLayer * 1.5
  const cells = Math.max(perLayer * 2, 9);
  const cols = Math.ceil(Math.sqrt(cells * 1.1));
  const rows = Math.ceil(cells / cols);
  return { cols: Math.max(3, cols), rows: Math.max(3, rows) };
}

// ---- Layout generation (forward random) -----------------------------------
//
// Strategy: build a random layout that tends to be solvable (few hard locks).
// We rely on the solver to verify and retry with offset seeds otherwise.

export function generateLayout(N, attempt = 0) {
  const params = levelParams(N);
  const seed = N * 1000 + attempt + 1;
  const rand = rng(seed);

  // Build pattern pool: setsPerType*3 of each patternId
  const pool = [];
  for (let p = 0; p < params.patternTypes; p++) {
    for (let k = 0; k < params.setsPerType * 3; k++) pool.push(p);
  }
  shuffleInPlace(pool, rand);

  const board = boardGrid(params);

  // Build candidate cell list per layer; lower layers have priority for placement
  // (they will tend to be revealed first).
  const occupied = []; // occupied[layer] = Set('x,y')
  for (let l = 0; l < params.layers; l++) occupied.push(new Set());

  const tiles = [];
  let id = 0;

  // For each tile, choose layer & cell. Strategy:
  //   - For first 70% of tiles, prefer the lowest available layer (spread out)
  //   - For remaining 30%, prefer higher layers to create coverage
  // Layer 0 = bottom (rendered first), highest layer = top (rendered last)
  for (let i = 0; i < pool.length; i++) {
    const phase = i / pool.length;
    const targetLayer = phase < 0.7
      ? Math.floor(rand() * params.layers)            // any layer
      : Math.min(params.layers - 1, Math.floor(rand() * params.layers + 1)); // bias up
    let layer = targetLayer;
    let placed = false;
    // Try targetLayer first, then fall back to others
    const attemptedLayers = [];
    for (let li = 0; li < params.layers && !placed; li++) {
      const lookup = (targetLayer + li) % params.layers;
      attemptedLayers.push(lookup);
      // Random cell in this layer that doesn't already hold a tile
      // (limit attempts to avoid pathological cases)
      const maxTries = 40;
      for (let t = 0; t < maxTries; t++) {
        const gx = Math.floor(rand() * board.cols);
        const gy = Math.floor(rand() * board.rows);
        const k = `${gx},${gy}`;
        if (!occupied[lookup].has(k)) {
          occupied[lookup].add(k);
          tiles.push({ id: id++, patternId: pool[i], layer: lookup, gridX: gx, gridY: gy });
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      // Brute-force scan for any free cell in any layer
      outer:
      for (let l = 0; l < params.layers; l++) {
        for (let y = 0; y < board.rows; y++) {
          for (let x = 0; x < board.cols; x++) {
            const k = `${x},${y}`;
            if (!occupied[l].has(k)) {
              occupied[l].add(k);
              tiles.push({ id: id++, patternId: pool[i], layer: l, gridX: x, gridY: y });
              placed = true;
              break outer;
            }
          }
        }
      }
    }
    if (!placed) {
      // Grid too small. Grow rows and retry from scratch with the same seed but more space.
      board.rows += 2;
      // Reset and re-run
      return generateLayoutWithGrid(N, attempt, board);
    }
  }

  // Falling queue (level 51+)
  const fallingQueue = [];
  if (N >= 51) {
    const queuePool = [];
    for (let p = 0; p < params.patternTypes; p++) {
      for (let k = 0; k < params.setsPerType * 3; k++) queuePool.push(p);
    }
    shuffleInPlace(queuePool, rand);
    fallingQueue.push(...queuePool);
  }

  return {
    N,
    seed,
    params,
    boardSize: board,
    tiles,
    fallingQueue
  };
}

function generateLayoutWithGrid(N, attempt, gridOverride) {
  // Fallback path used only if the initial grid was too small. Retries with the
  // larger grid by recomputing into a fresh tiles list. Implemented inline to avoid
  // recursion blow-up; we just call generateLayout again with a higher attempt.
  return generateLayout(N, attempt + 1);
}

// ---- Coverage relations ---------------------------------------------------
//
// Two tiles overlap if their grid cells differ by < 1 in either axis.
// (Using offset placement: each tile is treated as occupying a unit cell,
//  but we model coverage on whole-cell overlap to keep solver complexity low.)
// A tile is covered if there exists a tile on a strictly higher layer that
// overlaps the same cell.

export function computeCoverage(tiles) {
  const byCell = new Map(); // 'gx,gy' -> array of {tile, layer}
  for (const t of tiles) {
    const k = `${t.gridX},${t.gridY}`;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(t);
  }
  const covered = new Set();
  for (const list of byCell.values()) {
    if (list.length <= 1) continue;
    list.sort((a, b) => a.layer - b.layer);
    // every tile except the topmost is covered
    for (let i = 0; i < list.length - 1; i++) covered.add(list[i].id);
  }
  return covered;
}
