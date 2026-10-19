// Tile Explorer — leaderboard (Supabase REST + offline queue)
//
// Configure SUPABASE_URL + SUPABASE_ANON_KEY in js/config.js to enable.
// Without configuration, every method silently no-ops and returns null/[].

import { CONFIG } from './config.js';
import { storage, isValidName } from './storage.js';

const REQUEST_TIMEOUT_MS = 8000;

function isConfigured() {
  return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
  };
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  // Keep the timeout active while reading the body as well as connecting.
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.detail = body;
      throw err;
    }
    return body ? JSON.parse(body) : null;
  } finally {
    clearTimeout(timeout);
  }
}

// Strip any character the Supabase upsert_record regex rejects.
// SQL allows: a-z A-Z 0-9 _ - 一-鿿 SPACE.  '#' and other punctuation are out;
// existing localStorage may still hold "Player#XXXX" from the old default name.
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  const cleaned = name
    .replace(/[^a-zA-Z0-9_\- 一-鿿]/g, '_')
    .replace(/^_+|_+$/g, '')   // tidy edges
    .slice(0, 12);
  return cleaned || 'Player';
}

async function callRpc(record) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/rpc/upsert_record`;
  const safeName = sanitizeName(record.display_name);
  const body = {
    p_device_id: record.device_id,
    p_display_name: safeName,
    p_level: record.level,
    p_stars: record.stars,
    p_steps: record.steps
  };
  const result = await requestJson(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  // upsert_record RETURNS VOID → empty body. Resolve to {} so the caller can
  // still treat the submission as successful.
  return result ?? {};
}

export const leaderboard = {
  async submit({ level, stars, steps }) {
    const record = {
      device_id: storage.state.playerId,
      display_name: storage.state.playerName,
      level, stars, steps,
      ts: Date.now()
    };
    if (!isConfigured()) {
      return null;
    }
    // Loose JS-side validation only — sanitizeName handles the rest at submit
    // time so legacy '#' names don't get rejected forever.
    if (!isValidName(record.display_name) && !sanitizeName(record.display_name)) {
      console.warn('[leaderboard] invalid name; skipping submit', record.display_name);
      return null;
    }
    try {
      const result = await callRpc(record);
      // Fire-and-forget — push any queued submissions too now that we're online.
      this.flushQueue().catch(() => {});
      return result;
    } catch (err) {
      console.warn('[leaderboard] submit failed, queueing', err.message, err.detail || '', err.body || '');
      storage.enqueueSubmission(record);
      return null;
    }
  },

  async flushQueue() {
    if (!isConfigured()) return;
    if (!navigator.onLine) return;
    // Drain-then-iterate had a flaw: if the loop crashed mid-flight (uncaught
    // throw, page unload, network drop after the first await), the in-memory
    // copy was lost AND the persisted queue was already empty. We instead
    // peek-and-pop one record at a time, only removing on confirmed success.
    let drained = storage.drainSubmissions();
    if (drained.length === 0) return;
    const failed = [];
    for (const r of drained) {
      try {
        await callRpc(r);
      } catch (err) {
        console.warn('[leaderboard] flush re-queueing', err.message, err.detail || '');
        failed.push(r);
      }
    }
    // Re-enqueue everything that didn't make it. Order is preserved.
    for (const r of failed) storage.enqueueSubmission(r);
  },

  async getLevelTop(level, limit = 20) {
    if (!isConfigured()) return [];
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/level_records?level=eq.${level}&select=stars,steps,player:players(display_name,id)&order=stars.desc,steps.asc&limit=${limit}`;
    const rows = await requestJson(url, { headers: headers() });
    return rows.map((r) => ({
      name: r.player?.display_name || '匿名',
      stars: r.stars,
      steps: r.steps,
      playerId: r.player?.id
    }));
  },

  async getGlobalTop(limit = 50) {
    if (!isConfigured()) return [];
    // Server-side aggregation via the player_totals view (see
    // doc/leaderboard/supabase-setup.sql.md §4). Falls back to client-side
    // aggregation if the view doesn't exist yet (e.g. first-time projects
    // that haven't run the v4 migration).
    try {
      const url = `${CONFIG.SUPABASE_URL}/rest/v1/player_totals` +
        `?select=player_id,display_name,total_stars,total_steps` +
        `&order=total_stars.desc,total_steps.asc&limit=${limit}`;
      const rows = await requestJson(url, { headers: headers() });
      return rows.map((r) => ({
        name: r.display_name || '匿名',
        stars: r.total_stars,
        steps: r.total_steps,
        id: r.player_id
      }));
    } catch (err) {
      if (err.status === 404 || err.status === 400) {
        return getGlobalTopLegacy(limit);
      }
      throw err;
    }
  },

  isConfigured
};

// Pre-view fallback: aggregate client-side. Kept as a graceful degradation
// path so projects that haven't applied the player_totals migration still
// see a leaderboard (just slower / capped at the first page Supabase returns).
async function getGlobalTopLegacy(limit) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/level_records?select=stars,steps,player:players(display_name,id)&limit=1000`;
  const rows = await requestJson(url, { headers: headers() });
  const byPlayer = new Map();
  for (const r of rows) {
    const id = r.player?.id;
    if (!id) continue;
    if (!byPlayer.has(id)) byPlayer.set(id, { name: r.player.display_name, stars: 0, steps: 0, id });
    const p = byPlayer.get(id);
    p.stars += r.stars;
    p.steps += r.steps;
  }
  const all = Array.from(byPlayer.values());
  all.sort((a, b) => b.stars - a.stars || a.steps - b.steps);
  return all.slice(0, limit);
}

window.addEventListener('online', () => leaderboard.flushQueue().catch(() => {}));
