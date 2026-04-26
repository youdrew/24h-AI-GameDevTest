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

export const leaderboard = {
  async submit({ level, stars, steps }) {
    const record = {
      device_id: storage.state.playerId,
      display_name: storage.state.playerName,
      level, stars, steps,
      ts: Date.now()
    };
    if (!isConfigured()) {
      // No backend configured: keep a local-only "best" so UI can still show progress
      return null;
    }
    if (!isValidName(record.display_name)) {
      console.warn('[leaderboard] invalid name; skipping submit');
      return null;
    }
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/upsert_record`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          p_device_id: record.device_id,
          p_display_name: record.display_name,
          p_level: record.level,
          p_stars: record.stars,
          p_steps: record.steps
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Fire-and-forget — also try to flush any queued
      this.flushQueue().catch(() => {});
      return await res.json().catch(() => ({}));
    } catch (err) {
      console.warn('[leaderboard] submit failed, queueing', err);
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
        const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/upsert_record`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            p_device_id: r.device_id,
            p_display_name: r.display_name,
            p_level: r.level,
            p_stars: r.stars,
            p_steps: r.steps
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Re-queue on failure
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
