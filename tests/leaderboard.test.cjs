const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(fetch) {
  const saved = new Map();
  const timers = new Map();
  const list = { innerHTML: '' };
  let timerId = 0;
  const context = vm.createContext({
    CONFIG: { SUPABASE_URL: 'https://leaderboard.example', SUPABASE_ANON_KEY: 'test-key' },
    POWERUPS: {}, POWERUP_ORDER: [],
    AbortController, fetch,
    console: { warn() {}, error() {} },
    navigator: { onLine: true },
    window: { addEventListener() {} },
    localStorage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value)
    },
    document: { getElementById: () => list },
    setTimeout: (callback, ms) => {
      timers.set(++timerId, { callback, ms });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id)
  });
  // Execute the production browser modules together in an isolated browser
  // environment. Only ESM declarations are removed; behavior is unchanged.
  for (const file of ['storage.js', 'leaderboard.js', 'ui.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/^export /gm, '');
    vm.runInContext(source, context, { filename: file });
  }
  const api = vm.runInContext('({ storage, leaderboard, ui })', context);
  api.ui.game = { level: 1 };
  return { ...api, list, saved, timers, context };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('request timed out'));
      return;
    }
    signal.addEventListener('abort', () => reject(new Error('request timed out')), { once: true });
  });
}

test('an empty successful leaderboard stays distinct from service failure', async () => {
  const app = setup(async () => response([]));
  await app.ui._renderLeaderboard();
  assert.match(app.list.innerHTML, /暂无数据/);
  assert.equal(app.timers.size, 0);
});

test('DNS failure reaches the UI and does not change saved progress', async () => {
  const app = setup(async () => { throw new TypeError('Failed to fetch'); });
  app.storage.setLevel(9);
  app.storage.setStars(8, 3, 18);
  await assert.rejects(app.leaderboard.getLevelTop(1), /Failed to fetch/);
  await app.ui._renderLeaderboard();
  assert.match(app.list.innerHTML, /在线排行榜暂时不可用，本地进度不受影响/);
  assert.doesNotMatch(app.list.innerHTML, /暂无数据|Supabase|URL|Key|Failed to fetch/);
  assert.equal(app.storage.state.currentLevel, 9);
  assert.equal(app.storage.getStars(8), 3);
  assert.equal(app.timers.size, 0);
});

test('HTTP failures reject while an unavailable aggregate view retains its legacy fallback', async () => {
  const failed = setup(async () => response({ message: 'unavailable' }, 503));
  await assert.rejects(failed.leaderboard.getGlobalTop(), /HTTP 503/);
  let calls = 0;
  const app = setup(async () => ++calls === 1 ? response({}, 404) : response([
    { stars: 3, steps: 12, player: { id: 'one', display_name: 'Player' } },
    { stars: 2, steps: 15, player: { id: 'one', display_name: 'Player' } }
  ]));
  const rows = await app.leaderboard.getGlobalTop();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stars, 5);
  assert.equal(rows[0].steps, 27);
  assert.equal(calls, 2);
  assert.equal(app.timers.size, 0);
});

for (const phase of ['connection', 'response body']) {
  test(`a stalled ${phase} is aborted after the bounded timeout`, async () => {
    const app = setup(async (url, { signal }) => phase === 'connection'
      ? waitForAbort(signal)
      : { ok: true, status: 200, text: () => waitForAbort(signal) });
    const pending = app.leaderboard.getLevelTop(1);
    await Promise.resolve();
    const [timer] = app.timers.values();
    assert.equal(timer.ms, 8000);
    timer.callback();
    await assert.rejects(pending, /request timed out/);
    assert.equal(app.timers.size, 0);
  });
}

test('timed out uploads keep a retry record and the existing local progress', async () => {
  const app = setup((url, { signal }) => waitForAbort(signal));
  app.storage.setLevel(4);
  app.storage.setStars(3, 3, 18);
  const pending = app.leaderboard.submit({ level: 3, stars: 3, steps: 18 });
  const [timer] = app.timers.values();
  timer.callback();
  assert.equal(await pending, null);
  const saved = JSON.parse(app.saved.get('tile-explorer:state:v1'));
  assert.equal(saved.currentLevel, 4);
  assert.equal(saved.stars[3], 3);
  assert.equal(saved.bestSteps[3], 18);
  assert.equal(saved.pendingSubmissions.length, 1);
  assert.equal(saved.pendingSubmissions[0].level, 3);
});

test('successful empty RPC responses remain successful submissions', async () => {
  const app = setup(async () => ({ ok: true, status: 204, text: async () => '' }));
  assert.ok(await app.leaderboard.submit({ level: 1, stars: 3, steps: 12 }));
  assert.equal(app.storage.state.pendingSubmissions.length, 0);
});

test('a late failure from another tab cannot overwrite the current leaderboard', async () => {
  let rejectGlobal;
  const app = setup((url) => url.includes('player_totals')
    ? new Promise((resolve, reject) => { rejectGlobal = reject; })
    : Promise.resolve(response([])));
  const oldRequest = app.ui._renderLeaderboard();
  app.ui.activeLeaderboardTab = 'level';
  await app.ui._renderLeaderboard();
  rejectGlobal(new TypeError('Failed to fetch'));
  await oldRequest;
  assert.match(app.list.innerHTML, /暂无数据/);
  assert.doesNotMatch(app.list.innerHTML, /不可用/);
});
