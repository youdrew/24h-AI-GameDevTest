// Tile Explorer — localStorage persistence with quota-safe writes & migration

const KEY = 'tile-explorer:state:v1';
const CURRENT_VERSION = 1;

function defaultState() {
  return {
    schemaVersion: CURRENT_VERSION,
    currentLevel: 1,
    stars: {},
    bestSteps: {},
    powerups: { shuffle: 0, undo: 0, hint: 0, bomb: 0, trashOut: 0, freeze: 0 },
    settings: {
      soundEnabled: true,
      musicEnabled: true
    },
    playerId: generateUUID(),
    playerName: defaultPlayerName(),
    // layoutCache is the fat, regeneratable part — pure speed win, can be
    // trimmed on quota pressure (level.js generateLayout(N) is deterministic
    // by seed so we can always rebuild it).
    layoutCache: {},
    // optimalStepsCache holds the scarce part — solver work is expensive
    // (Web Worker DFS, sometimes seconds per level). NEVER trimmed under
    // quota pressure. A miss here means re-running the solver.
    optimalStepsCache: {},
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
  // Avoid '#': the Supabase upsert_record RPC's regex
  // ^[a-zA-Z0-9_\-一-鿿 ]{1,12}$ rejects it, which silently broke leaderboard
  // submits for all auto-generated names.
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `Player_${hex}`;
}

function migrate(data) {
  if (!data || typeof data !== 'object' || !data.schemaVersion) {
    return defaultState();
  }
  // v1 stored levelCache: { [N]: { layout, optimalSteps } }. The new shape
  // splits the expensive optimalSteps from the regeneratable layout so quota
  // trimming can drop layouts without losing solver work.
  if (data.levelCache && (!data.layoutCache || !data.optimalStepsCache)) {
    data.layoutCache = data.layoutCache || {};
    data.optimalStepsCache = data.optimalStepsCache || {};
    for (const [k, v] of Object.entries(data.levelCache)) {
      if (!v) continue;
      if (v.layout && data.layoutCache[k] == null) data.layoutCache[k] = v.layout;
      if (typeof v.optimalSteps === 'number' && data.optimalStepsCache[k] == null) {
        data.optimalStepsCache[k] = v.optimalSteps;
      }
    }
    delete data.levelCache;
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
    bestSteps: state.bestSteps || {},
    layoutCache: state.layoutCache || {},
    optimalStepsCache: state.optimalStepsCache || {},
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

// Bounded LRU on layoutCache; uninvolved with optimalStepsCache (which is
// kept whole because it's expensive to rebuild). LAYOUT_CACHE_CAP is large
// enough that ordinary play never trims, and small enough that 100+ replayed
// levels stay under typical 5MB origin quota.
const LAYOUT_CACHE_CAP = 100;

function trimLayoutCache(cap) {
  const keys = Object.keys(cache.layoutCache);
  if (keys.length <= cap) return false;
  // Object insertion order ≈ recency-of-write since cacheLevel re-assigns;
  // drop the oldest. (Map would be cleaner but JSON-serializing it is uglier.)
  const drop = keys.length - cap;
  for (let i = 0; i < drop; i++) delete cache.layoutCache[keys[i]];
  return true;
}

function write() {
  if (writeFailed) return;
  // Pre-emptively keep layoutCache bounded so single writes don't blow up.
  trimLayoutCache(LAYOUT_CACHE_CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      // Aggressive fallback: only retain the 10 most recently cached layouts.
      // optimalStepsCache stays intact even at this stage.
      console.warn('[storage] quota exceeded, trimming layoutCache to 10');
      const keys = Object.keys(cache.layoutCache);
      const keep = new Set(keys.slice(-10));
      for (const k of keys) if (!keep.has(k)) delete cache.layoutCache[k];
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

  // Updates the level's best record. A run is "better" when it earns more
  // stars; ties are broken by fewer steps. `steps` is optional for back-compat.
  setStars(level, stars, steps) {
    const state = read();
    const prevStars = state.stars[level] || 0;
    const prevSteps = state.bestSteps[level];
    let dirty = false;
    if (stars > prevStars) {
      state.stars[level] = stars;
      dirty = true;
    }
    if (typeof steps === 'number' && stars >= prevStars) {
      // On a star-improvement OR a steps-improvement at equal stars, replace.
      if (stars > prevStars || prevSteps == null || steps < prevSteps) {
        state.bestSteps[level] = steps;
        dirty = true;
      }
    }
    if (dirty) write();
  },

  getStars(level) {
    return read().stars[level] || 0;
  },

  getBestRecord(level) {
    const s = read();
    const stars = s.stars[level] || 0;
    const steps = s.bestSteps[level];
    if (!stars || steps == null) return null;
    return { stars, steps };
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
    // Re-insert under the same key so iteration order treats it as "most
    // recently used" — this is what trimLayoutCache leans on for LRU.
    delete state.layoutCache[level];
    state.layoutCache[level] = layout;
    if (typeof optimalSteps === 'number') state.optimalStepsCache[level] = optimalSteps;
    write();
  },

  getCachedLevel(level) {
    const state = read();
    const layout = state.layoutCache[level];
    const optimalSteps = state.optimalStepsCache[level];
    if (!layout && optimalSteps == null) return null;
    return { layout: layout || null, optimalSteps: optimalSteps ?? null };
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
