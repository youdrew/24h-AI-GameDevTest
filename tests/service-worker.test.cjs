const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const scope = 'https://example.github.io/24h-AI-GameDevTest/';
const prefix = `tile-explorer:${scope}:`;

function worker(options = {}) {
  const handlers = {};
  const buckets = new Map();
  const requests = [];
  let skipped = false;
  const urlOf = (request) => typeof request === 'string' ? request : request.url;
  const caches = {
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); },
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const entries = buckets.get(name);
      return {
        async keys() { return [...entries.keys()].map((url) => ({ url })); },
        async match(request) { return entries.get(urlOf(request))?.clone(); },
        async put(request, response) { entries.set(urlOf(request), response.clone()); },
        async addAll(urls) {
          if (options.installFailure) throw new Error('missing required asset');
          for (const url of urls) entries.set(url, new Response(`precache:${url}`));
        }
      };
    }
  };
  vm.runInNewContext(source, {
    URL, Set, console, caches,
    fetch: async (request) => {
      requests.push(urlOf(request));
      if (options.fetch) return options.fetch(request);
      return new Response('network');
    },
    self: {
      registration: { scope },
      addEventListener(name, handler) { handlers[name] = handler; },
      async skipWaiting() { skipped = true; },
      clients: { async claim() {} }
    }
  });
  return {
    caches, buckets, requests,
    get skipped() { return skipped; },
    async seed(name, url, body) {
      await (await caches.open(name)).put(url, new Response(body));
    },
    async lifecycle(name) {
      const pending = [];
      handlers[name]({ waitUntil(promise) { pending.push(promise); } });
      await Promise.all(pending);
    },
    request(relativeUrl, overrides = {}) {
      let response;
      const pending = [];
      handlers.fetch({
        request: {
          url: new URL(relativeUrl, scope).href,
          method: 'GET', headers: new Headers(), ...overrides
        },
        respondWith(promise) { response = promise; },
        waitUntil(promise) { pending.push(promise); }
      });
      return { response, finished: Promise.all(pending) };
    }
  };
}

test('a fresh install precaches local scripts and their complete import graph', async () => {
  const h = worker();
  await h.lifecycle('install');
  assert.equal(h.skipped, true);
  const cache = [...h.buckets.values()][0];
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  const visited = new Set();
  function visit(relative) {
    if (visited.has(relative)) return;
    visited.add(relative);
    const url = new URL(relative, scope);
    assert.ok(url.href.startsWith(scope), `script must ship locally: ${relative}`);
    assert.ok(cache.has(url.href), `startup dependency is not precached: ${relative}`);
    const code = fs.readFileSync(path.join(root, relative), 'utf8');
    if (!relative.startsWith('js/')) return;
    for (const match of code.matchAll(/\bimport\s+[^;]*?from\s+['"]([^'"]+)['"]/g)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
    }
  }
  scripts.forEach(visit);
  for (const url of cache.keys()) {
    const relative = decodeURIComponent(url.slice(scope.length)) || 'index.html';
    assert.ok(fs.existsSync(path.join(root, relative)), `precache file missing: ${relative}`);
  }
});

test('an incomplete install does not replace the working service worker', async () => {
  const h = worker({ installFailure: true });
  await assert.rejects(h.lifecycle('install'), /missing required asset/);
  assert.equal(h.skipped, false);
});

test('activation preserves other apps, other scopes and shared legacy caches', async () => {
  const h = worker();
  await h.lifecycle('install');
  const currentName = [...h.buckets.keys()][0];
  await h.seed(`${prefix}v1-static`, `${scope}index.html`, 'old');
  await h.seed('blog-cache', 'https://example.github.io/index.html', 'blog');
  await h.seed('tile-explorer:https://example.github.io/another-game/:v1-static',
    'https://example.github.io/another-game/index.html', 'other scope');
  await h.seed('tile-explorer-v6-static', `${scope}index.html`, 'owned legacy');
  await h.seed('tile-explorer-v6-runtime', `${scope}js/main.js`, 'mixed legacy');
  await h.seed('tile-explorer-v6-runtime', 'https://cdn.jsdelivr.net/pixi.js', 'shared CDN');
  await h.seed('tile-explorer-v6-media', 'https://example.github.io/another-game/image.png', 'other legacy');
  await h.lifecycle('activate');
  assert.equal(h.buckets.has(`${prefix}v1-static`), false);
  assert.equal(h.buckets.has('tile-explorer-v6-static'), false);
  for (const name of [currentName, 'blog-cache', 'tile-explorer-v6-runtime', 'tile-explorer-v6-media',
    'tile-explorer:https://example.github.io/another-game/:v1-static']) {
    assert.ok(h.buckets.has(name), `unrelated/current cache was removed: ${name}`);
  }
});

test('project-subpath media is served immediately while its cache refreshes', async () => {
  let finishFetch;
  const h = worker({ fetch: () => new Promise((resolve) => { finishFetch = resolve; }) });
  await h.lifecycle('install');
  const mediaName = [...h.buckets.keys()][0].replace(/-static$/, '-media');
  const mediaUrl = `${scope}assets/music/Themes/Orchard/theme.mp3`;
  await h.seed(mediaName, mediaUrl, 'cached music');
  const result = h.request(mediaUrl);
  assert.equal(await (await result.response).text(), 'cached music');
  assert.deepEqual(h.requests, [mediaUrl]);
  finishFetch(new Response('fresh music'));
  await result.finished;
  assert.equal(await (await (await h.caches.open(mediaName)).match(mediaUrl)).text(), 'fresh music');
});

test('offline navigation and startup modules use only the current scoped cache', async () => {
  const h = worker({ fetch: async () => { throw new Error('offline'); } });
  await h.seed('unrelated-cache', `${scope}js/main.js`, 'wrong app/version');
  await h.lifecycle('install');
  const shell = await h.request('unvisited-route', { mode: 'navigate' }).response;
  assert.equal(await shell.text(), `precache:${scope}index.html`);
  for (const relative of ['js/main.js', 'js/difficulty.js', 'js/sfx-config.js', 'assets/vendor/pixi-7.3.2.min.js']) {
    assert.equal(await (await h.request(relative).response).text(), `precache:${scope}${relative}`);
  }
});

test('requests outside this app and dynamic writes are left to the browser', async () => {
  const h = worker();
  for (const url of ['https://example.github.io/another-game/image.png',
    'https://cdn.jsdelivr.net/pixi.js', 'https://project.supabase.co/rest/v1/records',
    'rest/v1/records', 'rpc/save']) {
    assert.equal(h.request(url).response, undefined, url);
  }
  assert.equal(h.request('index.html', { method: 'POST' }).response, undefined);
  assert.equal(h.requests.length, 0);
});
