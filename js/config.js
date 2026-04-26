// Tile Explorer — runtime configuration
// Override values here without touching code logic.
//
// Supabase: leaderboard is optional. Set both URL and ANON_KEY to enable it.
// When unset, leaderboard.js silently no-ops and the UI shows a friendly placeholder.

export const CONFIG = {
  // Leaderboard (Supabase)
  SUPABASE_URL: 'https://tskrthvpwalstnszqisl.supabase.co',         // e.g. 'https://tskrthvpwalstnszqisl.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRza3J0aHZwd2Fsc3Ruc3pxaXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTY4MjEsImV4cCI6MjA5Mjc5MjgyMX0.35xVQSHoR2bxPRFN27lmLfW-Cp4BYUGrKoOYsTYjloI',    // public anon key

  // Game tuning
  SLOT_CAPACITY: 7,
  COMBO_WINDOW_MS: 3000,
  COMBO_METER_MAX: 10,
  TILE_SIZE: 48,
  TILE_GAP: 4,

  // Solver budgets (ms)
  // Thresholds tuned for difficulty formula v3 (every level grows by ≥3 tiles).
  // Tutorial-zone levels (1–9) cover 9–24 tiles → small budget.
  SOLVER_TIMEOUT_SMALL: 200,
  SOLVER_TIMEOUT_MEDIUM: 800,
  SOLVER_TIMEOUT_LARGE: 2500,
  SOLVER_THRESH_SMALL: 30,    // tileCount ≤ 30 → small budget
  SOLVER_THRESH_MEDIUM: 120,  // tileCount ≤ 120 → medium; else large
                              //   (tutorial L=1..9 maxes at 105 tiles → MEDIUM)
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

// Per-pattern tile background palette. Indexed by patternId (mod length) so a
// pattern keeps the same color on the board AND in the slot — players use the
// border/fill color as their primary visual cue.
export const TILE_BG_COLORS = [
  0xfde68a, 0xfca5a5, 0xa7f3d0, 0xbfdbfe,
  0xddd6fe, 0xfbcfe8, 0xc7d2fe, 0xfed7aa
];

// Powerup definitions
export const POWERUPS = {
  shuffle:  { id: 'shuffle',  icon: '🔄', label: '洗牌',   unlock: 1,  cap: 9, breaks3Star: true,  desc: '随机重排版面所有未消除的瓦片' },
  undo:     { id: 'undo',     icon: '↩️', label: '撤销',   unlock: 1,  cap: 9, breaks3Star: true,  desc: '撤销最近一次点击，瓦片放回原位' },
  hint:     { id: 'hint',     icon: '💡', label: '提示',   unlock: 1,  cap: 9, breaks3Star: false, desc: '高亮一组可消除的同图案瓦片' },
  bomb:     { id: 'bomb',     icon: '💣', label: '炸弹',   unlock: 10, cap: 5, breaks3Star: true,  desc: '点选一种图案，移除版面 + 槽位中所有同图案瓦片' },
  trashOut: { id: 'trashOut', icon: '🗑️', label: '扔垃圾', unlock: 5,  cap: 5, breaks3Star: true,  desc: '清空选中栏，所有瓦片随机扔回版面' },
  freeze:   { id: 'freeze',   icon: '❄️', label: '冰冻',   unlock: 51, cap: 3, breaks3Star: true,  desc: '冰冻一块瓦片，下落 3 次内不会被压住' }
};

export const POWERUP_ORDER = ['shuffle', 'undo', 'hint', 'bomb', 'trashOut', 'freeze'];

// ----- Themes ---------------------------------------------------------------
//
// Each theme provides ① a 32-emoji tile library (first 28 are used at the
// PT_CAP=28 cap, last 4 are spares), ② a background image, and ③ a BGM track.
// themeForLevel(N) (in level.js) rotates through THEMES every 3 levels.
//
// Asset paths preserve the original filenames (Chinese characters & spaces
// included). Code that hands them to fetch / Audio / PIXI MUST URI-encode
// each segment; see encodeAssetPath() helpers.
export const THEMES = [
  {
    id: 'orchard', name: '缤纷果园',
    library: [
      '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓',
      '🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍈',
      '🍏','🥑','🍅','🌽','🥕','🍆','🌶','🫒',
      '🍞','🥐','🧀','🍯','🍪','🍰','🥧','🍩'
    ],
    bgImage: 'assets/pic/Orchard.png',
    bgm: 'assets/music/Themes/Orchard/秋日果园漫步_no-watermark.mp3'
  },
  {
    id: 'zoo', name: '奇趣动物园',
    library: [
      '🐱','🐶','🐰','🐻','🦊','🐼','🐯','🦁',
      '🐨','🐮','🐷','🐸','🦄','🦒','🐘','🦓',
      '🦏','🦛','🐊','🐢','🐍','🦔','🐹','🐭',
      '🐺','🦝','🐗','🦌','🐧','🦉','🦅','🦩'
    ],
    bgImage: 'assets/pic/Zoo.png',
    bgm: 'assets/music/Themes/Zoo/小动物们的捉迷藏_no-watermark.mp3'
  },
  {
    id: 'spring', name: '春日庭院',
    library: [
      '🌸','🌷','🌹','🌺','🌻','🌼','💐','🌱',
      '🍀','🍃','🌿','🌳','🌲','🌴','🌵','🍂',
      '🌾','🦋','🐝','🐞','🐛','🐌','🕊️','☀️',
      '🌤️','🌈','🌙','⭐','❄️','☔','⛅','💧'
    ],
    bgImage: 'assets/pic/Spring Garden.png',
    bgm: 'assets/music/Themes/Spring Garden/春庭樱梦_no-watermark.mp3'
  },
  {
    id: 'starbound', name: '星际探险',
    library: [
      '🚀','🛸','🛰️','🌍','🌎','🌏','🌑','🌒',
      '🌓','🌔','🌕','🌖','🌗','🌘','⭐','🌟',
      '✨','💫','🌠','☄️','🪐','🌌','👽','🤖',
      '🧭','🪂','🔭','🔋','🛟','🌡️','🪞','🔦'
    ],
    bgImage: 'assets/pic/Starbound.png',
    bgm: 'assets/music/Themes/Starbound/星云漫游_no-watermark.mp3'
  },
  {
    id: 'bistro', name: '环球美食',
    library: [
      '🍣','🍱','🍙','🍚','🍜','🍝','🍤','🥟',
      '🍕','🍔','🌭','🌮','🌯','🥙','🥪','🍟',
      '🥗','🍳','🥘','🍲','🥣','🍦','🍰','🧁',
      '🍪','🍩','🍫','🍮','☕','🍵','🥤','🍷'
    ],
    bgImage: 'assets/pic/Bistro.jpeg',
    bgm: 'assets/music/Themes/Bistro/巴黎街角的雨天_no-watermark.mp3'
  },
  {
    id: 'retro', name: '像素冒险',
    library: [
      '🎮','🕹️','🎯','🎲','🃏','🧩','🎰','🎳',
      '👾','💎','🪙','💰','🗝️','🛡️','⚔️','🏹',
      '🪄','📜','🗡️','💣','🔮','🪬','⚜️','🧿',
      '🏰','🏯','⛩️','🗿','🎁','🎵','🪅','🎊'
    ],
    bgImage: 'assets/pic/Retro Quest.jpeg',
    bgm: 'assets/music/Themes/Retro Quest/像素宝藏_no-watermark.mp3'
  }
];

// Rotates themes every THEME_PERIOD levels. THEMES[i % THEMES.length].
export const THEME_PERIOD = 3;

// URI-encode each path segment so non-ASCII filenames (Chinese / spaces) are
// usable with fetch / Audio / PIXI Assets.
export function encodeAssetPath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}
