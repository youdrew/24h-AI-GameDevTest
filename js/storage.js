// Tile Explorer — localStorage persistence with quota-safe writes & migration

const KEY = 'tile-explorer:state:v1';
const CURRENT_VERSION = 1;

function defaultState() {
  return {
    schemaVersion: CURRENT_VERSION,
    currentLevel: 1,
    stars: {},
    powerups: { shuffle: 0, undo: 0, hint: 0, bomb: 0, freeze: 0 },
    settings: {
      soundEnabled: true,
      musicEnabled: true
    },
    playerId: generateUUID(),
    playerName: defaultPlayerName(),
    levelCache: {},
    tutorialSeen: {
      basicTap: false,
      cover: false,
      shuffle: false,
      undo: false,
      hint: false,
      tutorialComplete: false
    },
    pendingSubmissions: []
  };
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (older browsers)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function defaultPlayerName() {
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `Player#${hex}`;
}

function migrate(data) {
  if (!data || typeof data !== 'object' || !data.schemaVersion) {
    return defaultState();
  }
  // Future migration steps go here:
  // if (data.schemaVersion === 1) { /* upgrade to v2 */ }
  data.schemaVersion = CURRENT_VERSION;
  return data;
}

function mergeWithDefaults(state) {
  const base = defaultState();
  // Preserve persisted scalars; merge nested objects so new keys are populated
  return {
    ...base,
    ...state,
    powerups: { ...base.powerups, ...(state.powerups || {}) },
    settings: { ...base.settings, ...(state.settings || {}) },
    tutorialSeen: { ...base.tutorialSeen, ...(state.tutorialSeen || {}) },
    stars: state.stars || {},
    levelCache: state.levelCache || {},
    pendingSubmissions: state.pendingSubmissions || []
  };
}

let cache = null;
let writeFailed = false;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = mergeWithDefaults(migrate(parsed));
  } catch (err) {
    console.warn('[storage] read failed, using defaults', err);
    cache = defaultState();
  }
  return cache;
}

function write() {
  if (writeFailed) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      // Trim levelCache and try once more (it's the largest growable field)
      console.warn('[storage] quota exceeded, trimming levelCache');
      const trimmed = {};
      const keys = Object.keys(cache.levelCache).slice(-10);
      for (const k of keys) trimmed[k] = cache.levelCache[k];
      cache.levelCache = trimmed;
      try {
        localStorage.setItem(KEY, JSON.stringify(cache));
        return;
      } catch {
        writeFailed = true;
        console.warn('[storage] write disabled (quota); game continues in-memory only');
      }
    } else {
      writeFailed = true;
      console.warn('[storage] write disabled', err);
    }
  }
}

// Public API ----------------------------------------------------------------

export const storage = {
  get state() { return read(); },

  setLevel(n) {
    read().currentLevel = n;
    write();
  },

  setStars(level, stars) {
    const state = read();
    const prev = state.stars[level] || 0;
    if (stars > prev) {
      state.stars[level] = stars;
      write();
    }
  },

  getStars(level) {
    return read().stars[level] || 0;
  },

  addPowerup(id, count = 1) {
    const state = read();
    state.powerups[id] = (state.powerups[id] || 0) + count;
    write();
  },

  consumePowerup(id) {
    const state = read();
    if ((state.powerups[id] || 0) > 0) {
      state.powerups[id]--;
      write();
      return true;
    }
    return false;
  },

  setSetting(key, value) {
    read().settings[key] = value;
    write();
  },

  setPlayerName(name) {
    if (!isValidName(name)) return false;
    read().playerName = name;
    write();
    return true;
  },

  cacheLevel(level, layout, optimalSteps) {
    const state = read();
    state.levelCache[level] = { layout, optimalSteps };
    write();
  },

  getCachedLevel(level) {
    return read().levelCache[level] || null;
  },

  markTutorial(key) {
    read().tutorialSeen[key] = true;
    write();
  },

  hasSeenTutorial(key) {
    return Boolean(read().tutorialSeen[key]);
  },

  // Pending leaderboard submissions (offline queue)
  enqueueSubmission(record) {
    const state = read();
    state.pendingSubmissions.push(record);
    if (state.pendingSubmissions.length > 50) {
      state.pendingSubmissions = state.pendingSubmissions.slice(-50);
    }
    write();
  },

  drainSubmissions() {
    const state = read();
    const drained = state.pendingSubmissions.slice();
    state.pendingSubmissions = [];
    write();
    return drained;
  }
};

export function isValidName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_\- 一-鿿#]{1,12}$/.test(name);
}
