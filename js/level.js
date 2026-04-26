// Tile Explorer — level generation
//
// Difficulty formula v3 + reverse layout generator.
// Single formula from N=1: every level has strictly more tiles than the previous.
// Output is a deterministic layout (seeded by N).
//
// Layout shape:
//   {
//     N, params: { patternTypes, setsPerType, layers, tileCount },
//     boardSize: { cols, rows },
//     tiles: [ { id, patternId, layer, gridX, gridY } ],   // initial board
//     fallingQueue: [ patternId, ... ]                     // appended for level >= 51
//   }

import { CONFIG } from './config.js';

// ---- Difficulty formula v3 ------------------------------------------------
//
// Design:
//   patternTypes(N) — monotonic, +1 every 4 levels, capped at 28
//   setsPerType(N)  — closed form spt = N - pt + 3, ensures tileCount strictly
//                     grows by exactly 3 per level.
//   layers(N)       — **min 2 (every level has overlap)**, +1 every 15 levels,
//                     capped at 6.
//   tileCount(N)    — patternTypes × setsPerType × 3   (math-consistent)
//
// 2026-04-27: layers floor raised from 1 → 2. The game's core mechanic is
// stacked tiles covering each other; a single-layer level has no overlap and
// degenerates into "click any 3 matching tiles" with a sprawling grid.

const PT_PERIOD = 4;       // +1 patternType every N levels
const PT_BASE = 3;         // pt at N=1
const PT_CAP = 28;         // leave 4 slots before PATTERN_LIBRARY (32) is exhausted
const LAYER_PERIOD = 15;   // +1 layer every N levels (after the base 2)
const LAYER_BASE = 2;      // every level has at least 2 layers (overlap floor)
const LAYER_CAP = 6;       // visual stacking limit

export function levelParams(N) {
  const patternTypes = Math.min(PT_CAP, PT_BASE + Math.floor((N - 1) / PT_PERIOD));
  const setsPerType = Math.max(1, N - patternTypes + 3);
  const layers = Math.min(LAYER_CAP, LAYER_BASE + Math.floor((N - 1) / LAYER_PERIOD));
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

// Distribute total tiles across layers in a pyramid pattern (lower layers
// hold more, top has fewest). Returns counts[L] for L = 0..layers-1.
// Each layer gets at least 1 tile (tile count is always ≥ 9 in this game,
// and layers ≤ 6, so the pyramid weights always saturate).
function distributeTiles(total, layers) {
  let totalWeight = 0;
  const weights = [];
  for (let L = 0; L < layers; L++) {
    const w = layers - L;       // bottom (L=0) heaviest, top (L=layers-1) lightest
    weights.push(w);
    totalWeight += w;
  }
  const counts = weights.map((w) => Math.max(1, Math.floor(total * w / totalWeight)));
  // Ensure ∑counts == total: adjust by dispensing leftover to the lowest layer first.
  let diff = total - counts.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff > 0) { counts[i % layers]++; diff--; i++; }
  while (diff < 0) {
    // Trim from the largest layer, but never below 1.
    const idx = counts.indexOf(Math.max(...counts));
    if (counts[idx] > 1) { counts[idx]--; diff++; } else break;
  }
  return counts;
}

// Layer-0 footprint: a roughly-square grid sized to the layer-0 tile count.
function layer0Grid(layer0Count) {
  const cols = Math.max(3, Math.ceil(Math.sqrt(layer0Count)));
  const rows = Math.max(3, Math.ceil(layer0Count / cols));
  return { cols, rows };
}

// ---- Layout generation ----------------------------------------------------
//
// Pyramid layout: lower layers form a wide compact base; each upper layer is
// a strict subset of the lower's cells. Because every upper-layer tile sits
// on a cell that already contains a lower-layer tile (and the renderer shifts
// upper layers by +12px), the visual overlap is guaranteed — every level has
// covered tiles.

export function generateLayout(N, attempt = 0) {
  const params = levelParams(N);
  const seed = N * 1000 + attempt + 1;
  const rand = rng(seed);

  // 1. Pattern pool — 3 tiles per (patternId × setsPerType × 3 each), shuffled
  const pool = [];
  for (let p = 0; p < params.patternTypes; p++) {
    for (let k = 0; k < params.setsPerType * 3; k++) pool.push(p);
  }
  shuffleInPlace(pool, rand);

  // 2. Tiles per layer (pyramid)
  const layerCounts = distributeTiles(params.tileCount, params.layers);

  // 3. Layer 0 cells: take first layer0Count cells of a roughly-square grid,
  //    randomized so the base isn't a perfect rectangle (a few "holes" make it
  //    look more like a Mahjong base).
  const board = layer0Grid(layerCounts[0]);
  const allCells = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) allCells.push({ gx: x, gy: y });
  }
  shuffleInPlace(allCells, rand);
  const layerCells = [allCells.slice(0, layerCounts[0])];

  // 4. Each upper layer's cells are a random subset of the layer immediately
  //    below it (so an upper-layer tile always lands on a (gx, gy) where a
  //    lower-layer tile exists → guaranteed visual coverage).
  for (let L = 1; L < params.layers; L++) {
    const prev = layerCells[L - 1];
    const wanted = Math.min(layerCounts[L], prev.length);
    const sample = prev.slice();
    shuffleInPlace(sample, rand);
    layerCells.push(sample.slice(0, wanted));
    // If the requested count exceeded the previous layer (shouldn't with
    // pyramid weights, but defensive), shift the leftover down.
    if (wanted < layerCounts[L]) {
      layerCounts[0] += layerCounts[L] - wanted;
    }
  }

  // 5. Assemble tile records (patterns from the shuffled pool, in order)
  const tiles = [];
  let id = 0;
  let poolIdx = 0;
  for (let L = 0; L < params.layers; L++) {
    for (const cell of layerCells[L]) {
      tiles.push({
        id: id++,
        patternId: pool[poolIdx++],
        layer: L,
        gridX: cell.gx,
        gridY: cell.gy
      });
    }
  }
  // Any leftover patterns (if pyramid trimmed) go onto layer 0 in unused cells.
  while (poolIdx < pool.length) {
    // Find a layer-0 cell that isn't already used at layer 0.
    const usedL0 = new Set(layerCells[0].map((c) => `${c.gx},${c.gy}`));
    const free = allCells.find((c) => !usedL0.has(`${c.gx},${c.gy}`));
    if (!free) {
      // Grid wasn't large enough — extend rows and retry from scratch.
      // (Unusual case; falls back to attempt+1 with a fresh seed.)
      return generateLayout(N, attempt + 1);
    }
    tiles.push({
      id: id++,
      patternId: pool[poolIdx++],
      layer: 0,
      gridX: free.gx,
      gridY: free.gy
    });
    layerCells[0].push(free);
  }

  // 6. Falling queue (level 51+) — unchanged
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

// ---- Coverage relations ---------------------------------------------------
//
// Each higher layer is rendered with `+layerOffset` (= tileSize/4 = 12px) in
// both x and y, so a higher-layer tile B visually overlaps a lower-layer tile
// A whenever both axes satisfy:
//
//     |(bx - ax) * PITCH + (Lb - La) * OFFSET| < TILE_SIZE
//
// The simple "bx ∈ {ax, ax-1}" rule is only correct for layer-gap d ∈ {1,2,3}
// — at d=4 it produces false positives at bx=ax, and at d≥5 it misses bx=ax-2
// where overlap actually exists. We instead check the precise formula for
// every candidate B in a small grid neighborhood (O(1) cells per A).

const TILE_PX = CONFIG.TILE_SIZE;                  // 48
const PITCH_PX = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;  // 52 = tile + gap
const LAYER_OFFSET_PX = CONFIG.TILE_SIZE / 4;      // 12 — mirrors board.js _relayout()
const LAYER_OFFSET_SIGN = +1;                      // board.js uses + t.layer * layerOffset
// Cell-offset range to probe from A's grid position. Worst case for our
// LAYER_CAP=6 (so max layer-gap = 5) is grid offset 2 (since 5*12/52 ≈ 1.15).
// SEARCH_RANGE is the set of (bx - ax) values to consider; we then refine via
// the exact overlap condition above.
const SEARCH_RANGE = LAYER_OFFSET_SIGN > 0 ? [-2, -1, 0] : [0, 1, 2];

function tilesOverlap(a, b) {
  const d = b.layer - a.layer;
  if (d <= 0) return false;
  const dxPx = (b.gridX - a.gridX) * PITCH_PX + LAYER_OFFSET_SIGN * d * LAYER_OFFSET_PX;
  if (Math.abs(dxPx) >= TILE_PX) return false;
  const dyPx = (b.gridY - a.gridY) * PITCH_PX + LAYER_OFFSET_SIGN * d * LAYER_OFFSET_PX;
  return Math.abs(dyPx) < TILE_PX;
}

export function computeCoverage(tiles) {
  const byCell = new Map(); // 'gx,gy' -> array of tiles in that cell
  for (const t of tiles) {
    const k = `${t.gridX},${t.gridY}`;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(t);
  }

  const covered = new Set();
  for (const a of tiles) {
    if (covered.has(a.id)) continue;
    outer:
    for (const ddx of SEARCH_RANGE) {
      for (const ddy of SEARCH_RANGE) {
        const list = byCell.get(`${a.gridX + ddx},${a.gridY + ddy}`);
        if (!list) continue;
        for (const b of list) {
          if (b.layer > a.layer && tilesOverlap(a, b)) {
            covered.add(a.id);
            break outer;
          }
        }
      }
    }
  }
  return covered;
}
