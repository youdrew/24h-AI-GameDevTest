// Tile Explorer — difficulty keyframes
//
// EDIT THIS FILE to tune the difficulty curve. level.js reads this table at
// runtime; no other code change is required when you adjust numbers.
//
// Each row is one keyframe: at level `level`, the level uses the listed
// `patternTypes`, `setsPerType`, and `layers`. Levels BETWEEN keyframes use
// the lower-bound keyframe's values when DIFFICULTY_INTERPOLATION === 'stepped'
// (default), or a linearly-interpolated rounded value when set to 'linear'.
//
// Total tile count for a level = patternTypes × setsPerType × 3.
//
// Safety bounds (defined in level.js, NOT overridable here):
//   patternTypes ≤ PT_CAP   (= 28; each theme library has 32 emoji)
//   setsPerType  ≤ SPT_CAP  (= 6;  to fit 8×8×8 = 512 cell capacity)
//   layers       ≤ LAYER_CAP (= 8)
//   layers       ≥ 2 (every level has overlap)
//
// Keep the array sorted by `level` ascending.

export const DIFFICULTY_KEYFRAMES = [
  // level | patternTypes | setsPerType | layers | tile count (= pt × spt × 3)
  { level:   1, patternTypes:  3, setsPerType: 1, layers: 2 }, //   9
  { level:   2, patternTypes:  4, setsPerType: 1, layers: 2 }, //  12
  { level:   3, patternTypes:  5, setsPerType: 1, layers: 2 }, //  15
  { level:   4, patternTypes:  6, setsPerType: 1, layers: 2 }, //  18
  { level:   5, patternTypes:  6, setsPerType: 1, layers: 3 }, //  18  (depth +1)
  { level:   7, patternTypes:  7, setsPerType: 2, layers: 3 }, //  42
  { level:  10, patternTypes:  8, setsPerType: 2, layers: 3 }, //  48
  { level:  15, patternTypes: 10, setsPerType: 2, layers: 4 }, //  60
  { level:  20, patternTypes: 12, setsPerType: 2, layers: 4 }, //  72
  { level:  25, patternTypes: 14, setsPerType: 3, layers: 4 }, // 126
  { level:  30, patternTypes: 15, setsPerType: 3, layers: 5 }, // 135
  { level:  40, patternTypes: 18, setsPerType: 3, layers: 5 }, // 162
  { level:  50, patternTypes: 20, setsPerType: 3, layers: 6 }, // 180
  { level:  70, patternTypes: 23, setsPerType: 3, layers: 6 }, // 207
  { level: 100, patternTypes: 26, setsPerType: 4, layers: 7 }, // 312
  { level: 150, patternTypes: 28, setsPerType: 4, layers: 7 }, // 336
  { level: 200, patternTypes: 28, setsPerType: 5, layers: 8 }, // 420
  { level: 300, patternTypes: 28, setsPerType: 6, layers: 8 }  // 504
];

// 'stepped' (default): level N uses the keyframe with the largest level ≤ N.
//                      Predictable, matches the table exactly.
// 'linear':            interpolate between flanking keyframes (rounded).
export const DIFFICULTY_INTERPOLATION = 'stepped';
