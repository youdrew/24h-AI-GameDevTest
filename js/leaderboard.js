// Tile Explorer — leaderboard (Supabase REST + offline queue)
//
// Configure SUPABASE_URL + SUPABASE_ANON_KEY in js/config.js to enable.
// Without configuration, every method silently no-ops and returns null/[].

import { CONFIG } from './config.js';
import { storage, isValidName } from './storage.js';

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
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch {}
    const err = new Error(`HTTP ${res.status} — ${detail || res.statusText}`);
    err.status = res.status;
    err.detail = detail;
    err.body = body;
    throw err;
  }
  // upsert_record RETURNS VOID → empty body. Resolve to {} so the caller can
  // still treat the submission as successful.
  return res.json().catch(() => ({}));
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
    const pending = storage.drainSubmissions();
    if (pending.length === 0) return;
    for (const r of pending) {
      try {
        await callRpc(r);
      } catch (err) {
        console.warn('[leaderboard] flush re-queueing', err.message, err.detail || '');
        storage.enqueueSubmission(r);
      }
    }
  },

  async getLevelTop(level, limit = 20) {
    if (!isConfigured()) return [];
    try {
      const url = `${CONFIG.SUPABASE_URL}/rest/v1/level_records?level=eq.${level}&select=stars,steps,player:players(display_name,id)&order=stars.desc,steps.asc&limit=${limit}`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      return rows.map((r) => ({
        name: r.player?.display_name || '匿名',
        stars: r.stars,
        steps: r.steps,
        playerId: r.player?.id
      }));
    } catch (err) {
      console.warn('[leaderboard] getLevelTop failed', err);
      return [];
    }
  },

  async getGlobalTop(limit = 50) {
    if (!isConfigured()) return [];
    // The aggregate view is best implemented as a database VIEW or RPC. As a
    // simple fallback we ask for all records and aggregate client-side.
    try {
      const url = `${CONFIG.SUPABASE_URL}/rest/v1/level_records?select=stars,steps,player:players(display_name,id)`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
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
    } catch (err) {
      console.warn('[leaderboard] getGlobalTop failed', err);
      return [];
    }
  },

  isConfigured
};

window.addEventListener('online', () => leaderboard.flushQueue().catch(() => {}));
