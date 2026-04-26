// Tile Explorer — runtime configuration
// Override values here without touching code logic.
//
// Supabase: leaderboard is optional. Set both URL and ANON_KEY to enable it.
// When unset, leaderboard.js silently no-ops and the UI shows a friendly placeholder.

export const CONFIG = {
  // Leaderboard (Supabase)
  SUPABASE_URL: '',         // e.g. 'https://xxxx.supabase.co'
  SUPABASE_ANON_KEY: '',    // public anon key

  // Game tuning
  SLOT_CAPACITY: 7,
  COMBO_WINDOW_MS: 3000,
  COMBO_METER_MAX: 10,
  TILE_SIZE: 48,
  TILE_GAP: 4,

  // Solver budgets (ms)
  SOLVER_TIMEOUT_SMALL: 50,
  SOLVER_TIMEOUT_MEDIUM: 500,
  SOLVER_TIMEOUT_LARGE: 2000,
  SOLVER_MAX_RETRIES: 20,

  // Audio
  BGM_VOLUME: 0.35,
  SFX_VOLUME: 0.6,
  DUCK_DB: -6,
  DUCK_RESTORE_MS: 200,

  // Vibration (ms)
  VIBE_TAP: 10,
  VIBE_MATCH: 30,
  VIBE_FAIL: 50,

  // Misc
  MAX_LEVEL: 10000
};

// Pattern catalog: 32 emoji, ordered fruit → animal → nature → object
// (level uses patternTypes(N) of these in order)
export const PATTERN_LIBRARY = [
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🫐',
  '🐱', '🐶', '🐰', '🐻', '🦊', '🐼', '🐸', '🦁',
  '🌸', '🌻', '🌺', '🍀', '🌙', '⭐', '🌈', '❄️',
  '🎈', '🎯', '🎁', '🔔', '💎', '🎵', '🔑', '🧩'
];

// Powerup definitions
export const POWERUPS = {
  shuffle: { id: 'shuffle', icon: '🔄', label: '洗牌', unlock: 1,  cap: 9, breaks3Star: true },
  undo:    { id: 'undo',    icon: '↩️', label: '撤销', unlock: 1,  cap: 9, breaks3Star: true },
  hint:    { id: 'hint',    icon: '💡', label: '提示', unlock: 1,  cap: 9, breaks3Star: false },
  bomb:    { id: 'bomb',    icon: '💣', label: '炸弹', unlock: 10, cap: 5, breaks3Star: true },
  freeze:  { id: 'freeze',  icon: '❄️', label: '冰冻', unlock: 51, cap: 3, breaks3Star: true }
};

export const POWERUP_ORDER = ['shuffle', 'undo', 'hint', 'bomb', 'freeze'];
