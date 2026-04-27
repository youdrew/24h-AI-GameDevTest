// Tile Explorer — game state machine + glue between board/slot/audio/UI

import { CONFIG, POWERUPS, POWERUP_ORDER, encodeAssetPath } from './config.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { Board } from './board.js';
import { Slot } from './slot.js';
import { generateLayout, themeForLevel, BOARD_MAX } from './level.js';
import { anim } from './animation.js';

const STATES = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', COMPLETE: 'complete', GAMEOVER: 'gameover' };

export class Game {
  constructor(app) {
    this.app = app;
    this.state = STATES.MENU;

    // Containers — added by main.js, but built here
    this.bgLayer = new PIXI.Container();      // theme background image (lowest)
    this.statusBar = new PIXI.Container();
    this.boardLayer = new PIXI.Container();
    this.slotLayer = new PIXI.Container();
    this.powerupLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();
    this.bgSprite = null;
    // Start as null so the first startLevel() — even for theme[0] — always
    // triggers the bg-image + BGM load. (Otherwise levels 1–3 share the
    // default theme, the equality check below is true, and the apply block
    // is skipped, leaving no background and no music.)
    this.currentTheme = null;

    this.board = new Board(app);
    this.boardLayer.addChild(this.board.container);

    this.slot = new Slot(app);
    this.slotLayer.addChild(this.slot.container);

    // Game-state per level
    this.level = 1;
    this.steps = 0;
    this.usedHardPowerup = false;        // shuffle/undo/bomb/freeze
    // Combo accumulates monotonically (0..COMBO_METER_MAX). It only resets
    // when it hits the cap and auto-fires lightning. Chain state (pattern +
    // count) is independent — chain breaks only gate whether the *next* match
    // earns a combo, never decay the accumulator.
    this.combo = 0;
    this.chainPattern = null;
    this.chainCount = 0;
    this.optimalSteps = null;
    this.optimalIsFallback = false;      // true when solver timed out / errored
    this.tilePopHistory = [];            // for undo, stack of { sourceTileId, slotIndex }
    this.matchClearsThisRound = 0;       // for falling-queue trigger
    this.activePowerupMode = null;       // 'bomb' | 'freeze' | null

    this.statusText = null;
    this._buildComboMeter();
    this._buildStatusBar();
    this._buildPowerupBar();

    // Hooks (set by main.js / ui.js)
    this.onLevelComplete = null;         // (data) => void
    this.onGameOver = null;              // () => void
    this.onShowToast = null;             // (msg) => void
    this.onTutorial = null;              // (key) => void

    this.board.onTileClick = (tile) => this.handleTileClick(tile);
  }

  _buildStatusBar() {
    const txt = new PIXI.Text('Level 1', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 22, fontWeight: '600', fill: 0xf4f5fa
    });
    txt.x = 16;
    txt.y = 18;
    this.statusBar.addChild(txt);
    this.statusText = txt;

    this._refreshStatusBar();
  }

  _buildPowerupBar() {
    this.powerupButtons = {};
    for (const id of POWERUP_ORDER) {
      const btn = this._makePowerupButton(POWERUPS[id]);
      this.powerupButtons[id] = btn;
      this.powerupLayer.addChild(btn.container);
    }
    this._layoutPowerups();
    this._refreshPowerupCounts();
  }

  _makePowerupButton(p) {
    const c = new PIXI.Container();
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const bg = new PIXI.Graphics();
    bg.beginFill(0x232a3d);
    bg.lineStyle(1, 0xffffff, 0.08);
    bg.drawRoundedRect(-32, -28, 64, 56, 12);
    bg.endFill();
    c.addChild(bg);
    const ic = new PIXI.Text(p.icon, { fontSize: 26 });
    ic.anchor.set(0.5, 0.4);
    ic.y = -2;
    c.addChild(ic);
    const count = new PIXI.Text('0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12, fontWeight: '600', fill: 0xf4f5fa
    });
    count.anchor.set(1, 1);
    count.x = 28;
    count.y = 24;
    c.addChild(count);

    c.bg = bg;
    c.icon = ic;
    c.countText = count;
    c.powerupId = p.id;

    c.on('pointertap', () => this.usePowerup(p.id));

    return { container: c, ...c };
  }

  _layoutPowerups() {
    const screen = this.app.renderer.screen;
    const visiblePowerups = POWERUP_ORDER.filter((id) => this.level >= POWERUPS[id].unlock);
    const slotSize = this.slot.cellSize || 56;
    const yBase = screen.height - slotSize - 24 - 80;
    const baseW = 64, baseGap = 10;
    const baseTotal = visiblePowerups.length * baseW + Math.max(0, visiblePowerups.length - 1) * baseGap;
    // Shrink buttons proportionally if they would overflow on narrow screens
    // (at level 5 there are 5 visible, level 10+ has 5–6, level 51+ has all 6).
    const avail = Math.max(0, screen.width - 24);
    const scale = Math.min(1, avail / Math.max(1, baseTotal));
    const w = baseW * scale, gap = baseGap * scale;
    const total = visiblePowerups.length * w + Math.max(0, visiblePowerups.length - 1) * gap;
    const startX = (screen.width - total) / 2 + w / 2;
    let i = 0;
    for (const id of POWERUP_ORDER) {
      const btn = this.powerupButtons[id].container;
      if (this.level >= POWERUPS[id].unlock) {
        btn.visible = true;
        btn.x = startX + i * (w + gap);
        btn.y = yBase;
        btn.scale.set(scale);
        i++;
      } else {
        btn.visible = false;
      }
    }
  }

  _refreshPowerupCounts() {
    for (const id of POWERUP_ORDER) {
      const have = storage.state.powerups[id] || 0;
      const btn = this.powerupButtons[id].container;
      btn.countText.text = String(have);
      btn.alpha = have > 0 ? 1 : 0.4;
      btn.eventMode = have > 0 ? 'static' : 'none';
      // Highlight if active mode
      btn.bg.clear();
      const fill = (this.activePowerupMode === id) ? 0x6ee7b7 : 0x232a3d;
      btn.bg.beginFill(fill);
      btn.bg.lineStyle(1, 0xffffff, 0.08);
      btn.bg.drawRoundedRect(-32, -28, 64, 56, 12);
      btn.bg.endFill();
    }
  }

  _buildComboMeter() {
    this.comboMeterContainer = new PIXI.Container();
    const meterBg = new PIXI.Graphics();
    this.comboMeterContainer.addChild(meterBg);
    this.comboMeterBg = meterBg;
    const cells = [];
    for (let i = 0; i < CONFIG.COMBO_METER_MAX; i++) {
      const g = new PIXI.Graphics();
      this.comboMeterContainer.addChild(g);
      cells.push(g);
    }
    this.comboMeterCells = cells;
    this.statusBar.addChild(this.comboMeterContainer);
    this._renderComboMeter();
  }

  _renderComboMeter() {
    const screen = this.app.renderer.screen;
    const w = Math.min(screen.width - 200, 220);
    const cellW = w / CONFIG.COMBO_METER_MAX - 1;
    const cellH = 8;
    const x = (screen.width - w) / 2;
    const y = 50;
    this.comboMeterBg.clear();
    this.comboMeterBg.beginFill(0x0d1018, 0.5);
    this.comboMeterBg.drawRoundedRect(x - 4, y - 3, w + 8, cellH + 6, 6);
    this.comboMeterBg.endFill();
    for (let i = 0; i < CONFIG.COMBO_METER_MAX; i++) {
      const g = this.comboMeterCells[i];
      g.clear();
      const filled = i < this.combo;
      const color = filled ? 0x6ee7b7 : 0x232a3d;
      g.beginFill(color, filled ? 0.9 : 0.7);
      g.drawRoundedRect(x + i * (cellW + 1), y, cellW, cellH, 3);
      g.endFill();
    }
  }

  _refreshStatusBar() {
    this.statusText.text = `第 ${this.level} 关`;
    this._renderComboMeter();
  }

  resize() {
    this.board.resize();
    this.slot.resize();
    this._layoutPowerups();
    this._refreshStatusBar();
    this._fitBackground();
  }

  // ---- Public lifecycle -----------------------------------------------------

  async startLevel(N) {
    this.state = STATES.PLAYING;
    this.level = N;
    storage.setLevel(N);
    this.steps = 0;
    this.usedHardPowerup = false;
    this.combo = 0;
    this.chainPattern = null;
    this.chainCount = 0;
    this.tilePopHistory = [];
    this.matchClearsThisRound = 0;
    this.activePowerupMode = null;

    // Resolve theme first so board/slot render with the right emoji set even
    // when the layout came from cache (cached layout doesn't carry a theme).
    const theme = themeForLevel(N);
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      audio.setTheme(theme).catch(() => {});
      this._setBackground(theme).catch(() => {});
    }
    this.board.setTheme(theme);
    this.slot.setTheme(theme);

    // Pull from cache and decide what we still need to compute. Layouts are
    // deterministic (seeded by N) so when only the layout was trimmed we can
    // regenerate it cheaply and still trust a cached optimalSteps.
    let layout = null;
    const cached = storage.getCachedLevel(N);
    const cachedLayoutOk = cached && cached.layout && cached.layout.boardSize
      && cached.layout.boardSize.cols <= BOARD_MAX
      && cached.layout.boardSize.rows <= BOARD_MAX;
    const cachedSteps = cached && typeof cached.optimalSteps === 'number'
      ? cached.optimalSteps : null;

    if (cachedLayoutOk) {
      layout = cached.layout;
    } else {
      layout = generateLayout(N);
    }

    if (cachedSteps != null) {
      this.optimalSteps = cachedSteps;
      this.optimalIsFallback = false;
      // Make sure both halves are cached together going forward (re-store the
      // (possibly regenerated) layout under the same key).
      if (!cachedLayoutOk) storage.cacheLevel(N, layout, cachedSteps);
    } else {
      this.optimalSteps = null;
      this.optimalIsFallback = false;
      this._solveAsync(N, layout);
    }
    this.board.load(layout);
    this.slot.clear();
    this._layoutPowerups();
    this._refreshPowerupCounts();
    this._refreshStatusBar();
    this._maybeShowTutorial();
  }

  // Load + place the theme's background image. Cover-style fit, dimmed so it
  // doesn't compete with tiles. Failure is non-fatal (warning + skip).
  //
  // Two rapid setTheme() calls can race: the first awaits Assets.load and may
  // resolve AFTER the second already installed its sprite, overwriting the
  // newer background with a stale one. We guard with a monotonic token and
  // bail if the world moved on.
  async _setBackground(theme) {
    if (!theme || !theme.bgImage) return;
    const token = (this._bgToken = (this._bgToken || 0) + 1);
    const url = encodeAssetPath(theme.bgImage);
    let tex;
    try {
      tex = await PIXI.Assets.load(url);
    } catch (err) {
      console.warn('[game] background load failed', url, err);
      return;
    }
    if (token !== this._bgToken) return;   // a newer setBackground superseded us
    if (this.bgSprite) {
      this.bgLayer.removeChild(this.bgSprite);
      this.bgSprite.destroy();
      this.bgSprite = null;
    }
    const sprite = new PIXI.Sprite(tex);
    sprite.alpha = 0.55;  // soft so tiles stay legible
    this.bgSprite = sprite;
    this.bgLayer.addChild(sprite);
    this._fitBackground();
  }

  _fitBackground() {
    if (!this.bgSprite) return;
    const screen = this.app.renderer.screen;
    const tex = this.bgSprite.texture;
    if (!tex || !tex.width || !tex.height) return;
    const sx = screen.width / tex.width;
    const sy = screen.height / tex.height;
    const s = Math.max(sx, sy);     // CSS background-size: cover
    this.bgSprite.scale.set(s);
    this.bgSprite.x = (screen.width - tex.width * s) / 2;
    this.bgSprite.y = (screen.height - tex.height * s) / 2;
  }

  pause() {
    if (this.state === STATES.PLAYING) this.state = STATES.PAUSED;
  }

  resume() {
    if (this.state === STATES.PAUSED) this.state = STATES.PLAYING;
  }

  // Tear the in-progress level back down to a fresh "menu" state. UI calls
  // this when the player returns to the menu from pause/gameover so the next
  // startLevel() begins from a known-clean slate.
  quit() {
    this.state = STATES.MENU;
    this._processing = false;
    this.activePowerupMode = null;
    this.tilePopHistory = [];
    this.matchClearsThisRound = 0;
    this.combo = 0;
    this.chainPattern = null;
    this.chainCount = 0;
    this._refreshPowerupCounts();
    this._renderComboMeter();
  }

  // ---- Solver wiring --------------------------------------------------------

  _solveAsync(N, layout) {
    if (typeof Worker === 'undefined') return;
    let worker;
    try {
      worker = new Worker(new URL('./solver.js', import.meta.url));
    } catch (err) {
      console.warn('[game] solver Worker failed to start', err);
      this.optimalSteps = layout.tiles.length;
      return;
    }
    const tileCount = layout.tiles.length;
    const timeoutMs = tileCount <= CONFIG.SOLVER_THRESH_SMALL  ? CONFIG.SOLVER_TIMEOUT_SMALL
                    : tileCount <= CONFIG.SOLVER_THRESH_MEDIUM ? CONFIG.SOLVER_TIMEOUT_MEDIUM
                                                                : CONFIG.SOLVER_TIMEOUT_LARGE;
    let settled = false;
    let watchdogTimer = null;
    const settle = (steps, reason) => {
      if (settled) return;
      settled = true;
      // Track whether the value is real or a fallback so star scoring can
      // back off (see _computeStars).
      this.optimalSteps = steps ?? layout.tiles.length;
      this.optimalIsFallback = steps == null;
      if (steps != null) storage.cacheLevel(N, layout, steps);
      else if (reason) console.warn('[game] solver fallback:', reason);
      try { worker.terminate(); } catch {}
      if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.ok) settle(msg.optimalSteps);
      else settle(null, msg.reason);
    };
    worker.onerror = (err) => {
      console.warn('[game] solver error', err);
      settle(null, 'error');
    };
    // Watchdog: if the worker hangs (shouldn't, but defensive), kill it
    watchdogTimer = setTimeout(() => settle(null, 'watchdog'), timeoutMs + 500);
    worker.postMessage({
      tiles: layout.tiles.map((t) => ({ id: t.id, patternId: t.patternId, layer: t.layer, gridX: t.gridX, gridY: t.gridY })),
      slotCapacity: CONFIG.SLOT_CAPACITY,
      timeoutMs
    });
  }

  // ---- Player input ---------------------------------------------------------

  async handleTileClick(tile) {
    if (this.state !== STATES.PLAYING) return;
    if (this._processing) return;
    this._processing = true;
    try {
      await this._handleTileClickImpl(tile);
    } finally {
      this._processing = false;
    }
  }

  async _handleTileClickImpl(tile) {
    if (this.activePowerupMode === 'bomb') {
      this._applyBomb(tile);
      this.activePowerupMode = null;
      this._refreshPowerupCounts();
      return;
    }
    if (this.activePowerupMode === 'freeze') {
      this._applyFreeze(tile);
      this.activePowerupMode = null;
      this._refreshPowerupCounts();
      return;
    }

    if (this.slot.isFull()) {
      // Tray full + click: reject and warn. Chain stays as-is; combo never
      // decays.
      audio.warning();
      return;
    }

    // Chain tracking: how many same-pattern clicks the player has made in a
    // row. Matters only as the gate for the *next* combo tick — a triple
    // earns combo +1 only when chainCount >= 3 (the triple came entirely from
    // the current chain). A different-pattern click resets chainCount to 1
    // but does NOT touch the combo accumulator.
    if (this.chainPattern === tile.patternId) {
      this.chainCount += 1;
    } else {
      this.chainPattern = tile.patternId;
      this.chainCount = 1;
    }

    audio.unlock();
    audio.tap();
    this._vibrate(CONFIG.VIBE_TAP);

    // Remove from board, animate to slot
    const sprite = this.board.getSprite(tile.id);
    if (!sprite) return;
    const world = sprite.getGlobalPosition();
    const scale = sprite.scale.x;
    this.board.removeTile(tile.id);
    audio.fly();
    this.steps++;

    const insertedAt = await this.slot.acceptTile({
      x: world.x, y: world.y,
      scale,
      patternId: tile.patternId,
      sourceTileId: tile.id
    });
    this.tilePopHistory.push({ sourceTileId: tile.id, slotIndex: insertedAt, isPlayerInitiated: true });

    this.board.refreshCoverage();

    await this._processSlotMatchesAndChecks(true);
  }

  // After a tile lands: detect match, handle combo, drop queue, win/loss
  async _processSlotMatchesAndChecks(playerInitiated) {
    while (true) {
      const m = this.slot.detectAndPopMatch();
      if (!m) break;
      // animate clear
      for (const sp of m.removedSprites) {
        if (sp) {
          const world = sp.getGlobalPosition();
          const stage = this.app.stage;
          if (sp.parent !== stage) stage.addChild(sp);
          sp.x = world.x; sp.y = world.y;
          anim.to(sp, { alpha: 0, 'scale.x': sp.scale.x * 1.4, 'scale.y': sp.scale.y * 1.4 }, { duration: 0.25 })
            .then(() => sp.destroy());
        }
      }
      // burst particles
      const lastSp = m.removedSprites[m.removedSprites.length - 1];
      if (lastSp) {
        const world = lastSp.getGlobalPosition();
        anim.burst(world.x, world.y, 0xfde68a, 14, 5);
      }

      if (playerInitiated && this.chainCount >= 3) {
        // Chain built its own triple — combo accumulator advances by 1.
        this.combo++;
        this._showComboLabel();
        audio.match(this.combo);
        this._vibrate(CONFIG.VIBE_MATCH);
        if (this.combo >= CONFIG.COMBO_METER_MAX) {
          // Auto-fire lightning at the cap, then start a fresh round.
          this._triggerLightning();
          this.combo = 0;
        }
      } else {
        // Match happened but not from a clean ≥3 chain (or it's a falling
        // -queue match): play the plain pop sound, no combo gain.
        audio.match(0);
      }
      this.matchClearsThisRound++;
    }

    this._renderComboMeter();

    this.board.refreshCoverage();

    // Falling queue: every setsPerType cleared sets, drop 3 (level >= 51)
    if (this.level >= 51 && this.board.layout?.fallingQueue?.length > 0) {
      const setsPerType = this.board.layout.params.setsPerType;
      while (this.matchClearsThisRound >= setsPerType) {
        this.matchClearsThisRound -= setsPerType;
        await this.board.dropFromQueue(3);
        audio.drop();
      }
    }

    // Check win — but on falling-queue levels we first force-drain the queue.
    // The queue is built as contiguous triples (see level.js), so any non-zero
    // residue is a multiple of 3 per pattern and the player can finish it.
    if (this.board.isEmpty()) {
      const queue = this.board.layout?.fallingQueue;
      if (this.level >= 51 && queue && queue.length > 0) {
        const before = queue.length;
        const dropped = await this.board.dropFromQueue(before);
        audio.drop();
        const remaining = queue.length;
        if (this.onShowToast && dropped > 0) {
          this.onShowToast(remaining > 0
            ? `队列倾倒 · 还剩 ${remaining} 块`
            : '最后一波！');
        }
        this.matchClearsThisRound = 0;
        this.board.refreshCoverage();
        return;
      }
      this._handleLevelComplete();
      return;
    }

    // Check loss: tray full = lost. Powerups (undo / bomb / trashOut) had to
    // be used before this click; once all 7 cells are occupied the round ends.
    if (this.slot.isFull()) {
      this._handleGameOver();
    }
  }

  // ---- Combo ----------------------------------------------------------------

  // Reset only the chain (used by undo). Combo never decays — it only resets
  // when it auto-fires lightning at the cap.
  _resetChain() {
    if (this.chainPattern === null && this.chainCount === 0) return;
    this.chainPattern = null;
    this.chainCount = 0;
  }

  _showComboLabel() {
    if (this.combo < 2) return;
    const labels = { 2: 'Great!', 3: 'Excellent!', 4: 'Unbelievable!' };
    const text = this.combo >= 5 ? 'Combo Master!' : labels[this.combo];
    const t = new PIXI.Text(text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 36, fontWeight: '700',
      fill: this.combo >= 5 ? 0xfbbf24 : 0x6ee7b7,
      stroke: 0x0d1018, strokeThickness: 4
    });
    t.anchor.set(0.5);
    const screen = this.app.renderer.screen;
    t.x = screen.width / 2;
    t.y = screen.height / 2 - 50;
    t.scale.set(0);
    t.alpha = 0;
    this.effectLayer.addChild(t);
    anim.to(t, { 'scale.x': 1.2, 'scale.y': 1.2, alpha: 1 }, { duration: 0.18, ease: 'easeOutBack' })
      .then(() => anim.to(t, { 'scale.x': 1, 'scale.y': 1 }, { duration: 0.12 }))
      .then(() => new Promise((res) => setTimeout(res, 400)))
      .then(() => anim.to(t, { alpha: 0, y: t.y - 40 }, { duration: 0.3 }))
      .then(() => t.destroy());
  }

  _triggerLightning() {
    // Pick the rarest remaining pattern with count >= 3 (or fallback to any)
    const remaining = this.board.getRemainingTiles();
    const counts = new Map();
    for (const t of remaining) counts.set(t.patternId, (counts.get(t.patternId) || 0) + 1);
    let target = null, lowest = Infinity;
    for (const [pid, c] of counts) {
      if (c >= 3 && c < lowest) { lowest = c; target = pid; }
    }
    if (target === null) return;

    audio.lightning();
    anim.flash(this.effectLayer, 0xffffff, 0.7, 0.3);
    // Remove 1 set (3 tiles) of that pattern
    let removed = 0;
    for (const sprite of this.board.tilesById.values()) {
      const t = sprite.tileData;
      if (t.removed || t.patternId !== target) continue;
      const world = sprite.getGlobalPosition();
      this.board.removeTile(t.id);
      anim.burst(world.x, world.y, 0xfbbf24, 16, 6);
      removed++;
      if (removed >= 3) break;
    }
    this.board.refreshCoverage();
    setTimeout(() => {
      if (this.board.isEmpty()) this._handleLevelComplete();
    }, 100);
  }

  // ---- Powerups -------------------------------------------------------------

  usePowerup(id) {
    if (this.state !== STATES.PLAYING) return;
    // _processing is set while a tile-click animation chain is mid-flight.
    // Allowing a powerup to fire here can mutate board.tilesById underneath
    // the in-flight handler (sprite double-destroy, slot/board desync, etc).
    if (this._processing) return;
    // Toggle modes (bomb/freeze) just flip a flag, no immediate state change —
    // they're cheap and intuitive to allow always; the actual targeting click
    // re-enters handleTileClick which itself respects _processing.
    const have = storage.state.powerups[id] || 0;
    if (have <= 0) return;
    audio.unlock();
    audio.itemUse();
    if (id === 'shuffle') {
      this._applyShuffle();
      this.usedHardPowerup = true;
      storage.consumePowerup(id);
    } else if (id === 'undo') {
      const ok = this._applyUndo();
      if (ok) {
        this.usedHardPowerup = true;
        storage.consumePowerup(id);
      }
    } else if (id === 'hint') {
      this._applyHint();
      storage.consumePowerup(id);
    } else if (id === 'bomb') {
      this.activePowerupMode = (this.activePowerupMode === 'bomb' ? null : 'bomb');
      if (this.onShowToast && this.activePowerupMode) this.onShowToast('点击一个瓦片引爆');
    } else if (id === 'trashOut') {
      const ok = this._applyTrashOut();
      if (ok) {
        this.usedHardPowerup = true;
        storage.consumePowerup(id);
      }
    } else if (id === 'freeze') {
      this.activePowerupMode = (this.activePowerupMode === 'freeze' ? null : 'freeze');
      if (this.onShowToast && this.activePowerupMode) this.onShowToast('点击一个瓦片冰冻 3 波下落');
    }
    this._refreshPowerupCounts();
  }

  _applyShuffle() {
    audio.shuffle();
    this.board.shuffle();
    this.board.refreshCoverage();
  }

  _applyUndo() {
    const popped = this.slot.popLast();
    if (!popped) return false;
    audio.undo();
    if (popped.sprite) popped.sprite.destroy();
    this.board.restoreTile(popped.sourceTileId);
    this.steps = Math.max(0, this.steps - 1);
    this._resetChain();
    return true;
  }

  _applyHint() {
    audio.hint();
    const triple = this.board.findHintTriple();
    if (triple) this.board.highlightTriple(triple);
    else if (this.onShowToast) this.onShowToast('暂无可提示组合');
  }

  // 扔垃圾: snapshot patternIds in slot, clear slot, scatter onto board.
  // Returns true if anything was thrown back (false → nothing in slot to toss).
  _applyTrashOut() {
    const patternIds = [];
    for (const cell of this.slot.cells) {
      if (cell.patternId !== null) patternIds.push(cell.patternId);
    }
    if (patternIds.length === 0) {
      if (this.onShowToast) this.onShowToast('选中栏是空的');
      return false;
    }
    audio.shuffle();
    this.slot.clear();
    const placed = this.board.trashTilesToBoard(patternIds);
    if (placed < patternIds.length && this.onShowToast) {
      this.onShowToast(`版面已满，仅扔回了 ${placed}/${patternIds.length} 块`);
    }
    this.board.refreshCoverage();
    this._resetChain();
    return true;
  }

  _applyBomb(tile) {
    if (storage.consumePowerup('bomb') === false) return;
    this.usedHardPowerup = true;
    audio.bomb();
    const patternId = tile.patternId;

    // Spec ("移除版面 + 槽位中所有同图案瓦片") = full clear of the chosen
    // pattern, both on the board AND in the slot. We used to keep a
    // mod-3 invariant on total removed, but that could leave orphan tiles
    // (board has 4 → remove 3 → 1 stranded with no pair) and turn the
    // level unsolvable on N<51 where falling-queue refills don't exist.
    const removed = this.board.removePattern(patternId);
    for (const t of removed) {
      const sp = this.board.getSprite(t.id);
      if (sp) {
        const world = sp.getGlobalPosition();
        anim.burst(world.x, world.y, 0xf87171, 12, 5);
      }
    }
    const slotPopped = this.slot.popPattern(patternId);
    for (const it of slotPopped) {
      if (it.sprite) it.sprite.destroy({ children: true });
    }

    anim.flash(this.effectLayer, 0xf87171, 0.4, 0.25);
    this.board.refreshCoverage();
    this.matchClearsThisRound++;
    setTimeout(() => {
      if (this.board.isEmpty()) this._handleLevelComplete();
    }, 200);
  }

  _applyFreeze(tile) {
    if (this.board.frozenTiles.has(tile.id)) {
      if (this.onShowToast) this.onShowToast('已经冻住了');
      return;
    }
    if (storage.consumePowerup('freeze') === false) return;
    this.usedHardPowerup = true;
    audio.freeze();
    this.board.freezeTile(tile.id, 3);
    if (this.onShowToast) this.onShowToast('已冰冻 3 波下落');
  }

  // ---- Win / Lose -----------------------------------------------------------

  _handleLevelComplete() {
    if (this.state !== STATES.PLAYING) return;
    this.state = STATES.COMPLETE;
    audio.win();
    this._vibrate([60, 40, 60]);
    const stars = this._computeStars();
    storage.setStars(this.level, stars, this.steps);
    if (this.onLevelComplete) {
      this.onLevelComplete({
        level: this.level,
        stars,
        steps: this.steps,
        optimalSteps: this.optimalSteps
      });
    }
  }

  _handleGameOver() {
    if (this.state !== STATES.PLAYING) return;
    this.state = STATES.GAMEOVER;
    audio.fail();
    this._vibrate(CONFIG.VIBE_FAIL);
    if (this.onGameOver) this.onGameOver();
  }

  _computeStars() {
    let stars = 1;
    // When the solver timed out we don't have a real optimal — use tileCount
    // * 1.05 as a fallback estimate (a deliberate slack of 5% so big-board
    // players aren't penalised for an unsolved board). When the solver
    // succeeded we trust its number directly.
    let opt = this.optimalSteps;
    if (this.optimalIsFallback && this.board?.layout?.tiles) {
      opt = this.board.layout.tiles.length * 1.05;
    }
    if (opt != null && opt > 0) {
      if (this.steps <= opt * 1.5) stars = 2;
      if (this.steps <= opt * 1.2 && !this.usedHardPowerup) stars = 3;
    } else {
      // Solver hasn't finished yet at level-complete time: be lenient.
      stars = this.usedHardPowerup ? 2 : 3;
    }
    return stars;
  }

  // ---- Tutorial -------------------------------------------------------------

  _maybeShowTutorial() {
    if (!this.onTutorial) return;
    if (this.level === 1 && !storage.hasSeenTutorial('basicTap')) {
      this.onTutorial('basicTap');
      storage.markTutorial('basicTap');
    } else if (this.level === 3 && !storage.hasSeenTutorial('cover')) {
      this.onTutorial('cover');
      storage.markTutorial('cover');
    } else if (this.level === 5 && !storage.hasSeenTutorial('shuffle')) {
      this.onTutorial('shuffle');
      storage.markTutorial('shuffle');
    } else if (this.level === 7 && !storage.hasSeenTutorial('undo')) {
      this.onTutorial('undo');
      storage.markTutorial('undo');
    } else if (this.level === 9 && !storage.hasSeenTutorial('hint')) {
      this.onTutorial('hint');
      storage.markTutorial('hint');
    } else if (this.level === 10 && !storage.hasSeenTutorial('tutorialComplete')) {
      this.onTutorial('tutorialComplete');
      storage.markTutorial('tutorialComplete');
    }
  }

  _vibrate(pattern) {
    if (!('vibrate' in navigator)) return;
    try { navigator.vibrate(pattern); } catch {}
  }
}
