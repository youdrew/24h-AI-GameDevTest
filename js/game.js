// Tile Explorer — game state machine + glue between board/slot/audio/UI

import { CONFIG, POWERUPS, POWERUP_ORDER } from './config.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { Board } from './board.js';
import { Slot } from './slot.js';
import { generateLayout } from './level.js';
import { anim } from './animation.js';

const STATES = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', COMPLETE: 'complete', GAMEOVER: 'gameover' };

export class Game {
  constructor(app) {
    this.app = app;
    this.state = STATES.MENU;

    // Containers — added by main.js, but built here
    this.statusBar = new PIXI.Container();
    this.boardLayer = new PIXI.Container();
    this.slotLayer = new PIXI.Container();
    this.powerupLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();

    this.board = new Board(app);
    this.boardLayer.addChild(this.board.container);

    this.slot = new Slot(app);
    this.slotLayer.addChild(this.slot.container);

    // Game-state per level
    this.level = 1;
    this.steps = 0;
    this.usedHardPowerup = false;        // shuffle/undo/bomb/freeze
    this.combo = 0;
    this.comboTimer = 0;                 // ms remaining
    this.comboMeter = 0;
    this.chainPattern = null;            // active combo-chain patternId (null = no chain)
    this.optimalSteps = null;
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

    // Combo timer ticker
    app.ticker.add((dt) => this._updateCombo(dt));
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

    const stars = new PIXI.Text('☆☆☆', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 22, fill: 0xfbbf24
    });
    stars.anchor.set(1, 0);
    stars.y = 18;
    this.statusBar.addChild(stars);
    this.starsText = stars;

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
    const w = 64, gap = 10;
    const total = visiblePowerups.length * w + (visiblePowerups.length - 1) * gap;
    const startX = (screen.width - total) / 2 + w / 2;
    let i = 0;
    for (const id of POWERUP_ORDER) {
      const btn = this.powerupButtons[id].container;
      if (this.level >= POWERUPS[id].unlock) {
        btn.visible = true;
        btn.x = startX + i * (w + gap);
        btn.y = yBase;
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
    this.comboMeterContainer.eventMode = 'static';
    this.comboMeterContainer.cursor = 'pointer';
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
    this.comboMeterContainer.on('pointertap', () => this._releaseComboMeter());
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
      const filled = i < this.comboMeter;
      const color = filled ? (this.comboMeter >= CONFIG.COMBO_METER_MAX ? 0xfbbf24 : 0x6ee7b7) : 0x232a3d;
      g.beginFill(color, filled ? 0.9 : 0.7);
      g.drawRoundedRect(x + i * (cellW + 1), y, cellW, cellH, 3);
      g.endFill();
    }
    this.comboMeterContainer.eventMode = (this.comboMeter >= CONFIG.COMBO_METER_MAX) ? 'static' : 'none';
    this.comboMeterContainer.cursor = (this.comboMeter >= CONFIG.COMBO_METER_MAX) ? 'pointer' : 'default';
  }

  _refreshStatusBar() {
    const screen = this.app.renderer.screen;
    this.statusText.text = `第 ${this.level} 关`;
    const stars = storage.getStars(this.level);
    this.starsText.text = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.starsText.x = screen.width - 16;
    this._renderComboMeter();
  }

  resize() {
    this.board.resize();
    this.slot.resize();
    this._layoutPowerups();
    this._refreshStatusBar();
  }

  // ---- Public lifecycle -----------------------------------------------------

  async startLevel(N) {
    this.state = STATES.PLAYING;
    this.level = N;
    storage.setLevel(N);
    this.steps = 0;
    this.usedHardPowerup = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMeter = 0;
    this.chainPattern = null;
    this.tilePopHistory = [];
    this.matchClearsThisRound = 0;
    this.activePowerupMode = null;

    // Use cached layout if available
    let layout = null;
    const cached = storage.getCachedLevel(N);
    if (cached && cached.layout) {
      layout = cached.layout;
      this.optimalSteps = cached.optimalSteps;
    } else {
      layout = generateLayout(N);
      this.optimalSteps = null;
      // Solve in background
      this._solveAsync(N, layout);
    }
    this.board.load(layout);
    this.slot.clear();
    this._layoutPowerups();
    this._refreshPowerupCounts();
    this._refreshStatusBar();
    this._maybeShowTutorial();
  }

  pause() {
    if (this.state === STATES.PLAYING) this.state = STATES.PAUSED;
  }

  resume() {
    if (this.state === STATES.PAUSED) this.state = STATES.PLAYING;
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
    const settle = (steps, reason) => {
      if (settled) return;
      settled = true;
      this.optimalSteps = steps ?? layout.tiles.length;
      if (steps != null) storage.cacheLevel(N, layout, steps);
      else if (reason) console.warn('[game] solver fallback:', reason);
      try { worker.terminate(); } catch {}
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
    setTimeout(() => settle(null, 'watchdog'), timeoutMs + 500);
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
      // Clicking another tile while full just resets combo
      this._resetCombo();
      audio.warning();
      return;
    }

    // Combo chain rule: a chain is a continuous run of clicks on the SAME
    // patternId. Selecting a different pattern breaks the chain (combo + meter
    // reset to 0); the new click starts a fresh chain on its own pattern.
    if (this.chainPattern !== null && tile.patternId !== this.chainPattern) {
      this._resetCombo();
    }
    this.chainPattern = tile.patternId;

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
    let any = false;
    while (true) {
      const m = this.slot.detectAndPopMatch();
      if (!m) break;
      any = true;
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

      if (playerInitiated) {
        this.combo++;
        this.comboTimer = CONFIG.COMBO_WINDOW_MS;
        this.comboMeter = Math.min(CONFIG.COMBO_METER_MAX, this.comboMeter + 2);
        this._showComboLabel();
        audio.match(this.combo);
        this._vibrate(CONFIG.VIBE_MATCH);
        if (this.combo >= 5) {
          this._triggerLightning();
        }
      } else {
        // Falling-queue–driven match: no combo accumulation
        audio.match(0);
      }
      this.matchClearsThisRound++;
    }

    if (!any && playerInitiated) {
      // Click did not lead to match -> still bumps meter slightly
      this.comboMeter = Math.min(CONFIG.COMBO_METER_MAX, this.comboMeter + 1);
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

    // Check win
    if (this.board.isEmpty()) {
      this._handleLevelComplete();
      return;
    }

    // Check loss
    if (this.slot.isFull()) {
      // Slot full: see if any uncovered tile pattern can still combine into 3
      const counts = this.slot.patternCounts();
      let canStillMatch = false;
      const uncovered = this.board.getUncoveredTiles();
      for (const t of uncovered) {
        const c = counts.get(t.patternId) || 0;
        if (c >= 2) { canStillMatch = true; break; } // adding it would make 3
      }
      if (!canStillMatch) {
        this._handleGameOver();
      }
    }
  }

  // ---- Combo ----------------------------------------------------------------

  _updateCombo(dt) {
    if (this.state !== STATES.PLAYING) return;
    if (this.combo === 0) return;
    if (this._processing) return;     // freeze combo decay during click animation
    this.comboTimer -= (dt / 60) * 1000;
    if (this.comboTimer <= 0) {
      this._resetCombo();
    }
  }

  _resetCombo() {
    if (this.combo === 0 && this.comboMeter === 0 && this.chainPattern === null) return;
    this.combo = 0;
    this.comboTimer = 0;
    this.chainPattern = null;
    // Spec: "断连时蓄力条清空" — chain break empties the meter completely.
    // (Lightning charge at full is also lost on chain break, by design.)
    this.comboMeter = 0;
    this._renderComboMeter();
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
    if (target === null) {
      // No pattern has ≥3 remaining — refund the meter so a meter-release click
      // doesn't burn the player's stored charge for nothing.
      if (this.comboMeter < CONFIG.COMBO_METER_MAX) {
        this.comboMeter = CONFIG.COMBO_METER_MAX;
        this._renderComboMeter();
      }
      return;
    }

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

  _releaseComboMeter() {
    if (this.comboMeter < CONFIG.COMBO_METER_MAX) return;
    this.comboMeter = 0;
    this._renderComboMeter();
    this._triggerLightning();
  }

  // ---- Powerups -------------------------------------------------------------

  usePowerup(id) {
    if (this.state !== STATES.PLAYING) return;
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
    } else if (id === 'freeze') {
      this.activePowerupMode = (this.activePowerupMode === 'freeze' ? null : 'freeze');
      if (this.onShowToast && this.activePowerupMode) this.onShowToast('点击一个瓦片冰冻 3 次下落');
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
    this._resetCombo();
    return true;
  }

  _applyHint() {
    audio.hint();
    const triple = this.board.findHintTriple();
    if (triple) this.board.highlightTriple(triple);
    else if (this.onShowToast) this.onShowToast('暂无可提示组合');
  }

  _applyBomb(tile) {
    if (storage.consumePowerup('bomb') === false) return;
    this.usedHardPowerup = true;
    audio.bomb();
    const patternId = tile.patternId;
    // Spec invariant: total removed must be a multiple of 3. Compute combined
    // count first; only consume floor(total/3)*3 across board+tray.
    const boardCount = this.board.countRemainingByPattern(patternId);
    const trayCount = this.slot.patternCounts().get(patternId) || 0;
    const total = boardCount + trayCount;
    let toRemove = Math.floor(total / 3) * 3;
    // Greedy: remove from board first (visible impact), then tray
    const removeFromBoard = Math.min(boardCount, toRemove);
    const removeFromTray = toRemove - removeFromBoard;

    if (removeFromBoard >= boardCount) {
      const removed = this.board.removePattern(patternId);
      for (const t of removed) {
        const sp = this.board.getSprite(t.id);
        if (sp) {
          const world = sp.getGlobalPosition();
          anim.burst(world.x, world.y, 0xf87171, 12, 5);
        }
      }
    } else {
      // Partial board removal — only first N tiles
      let count = 0;
      for (const sprite of this.board.tilesById.values()) {
        if (count >= removeFromBoard) break;
        const t = sprite.tileData;
        if (!t.removed && t.patternId === patternId) {
          const world = sprite.getGlobalPosition();
          this.board.removeTile(t.id);
          anim.burst(world.x, world.y, 0xf87171, 12, 5);
          count++;
        }
      }
    }

    if (removeFromTray > 0) {
      // Pop pattern from slot, but only `removeFromTray` of them
      const slotPopped = [];
      let remaining = removeFromTray;
      for (const c of this.slot.cells) {
        if (remaining <= 0) break;
        if (c.patternId === patternId) {
          slotPopped.push({ sprite: c.sprite });
          c.sprite = null; c.patternId = null; c.sourceTileId = null;
          remaining--;
        }
      }
      this.slot._compact();
      this.slot._updateWarningTint();
      for (const it of slotPopped) {
        if (it.sprite) it.sprite.destroy({ children: true });
      }
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
    if (this.onShowToast) this.onShowToast('已冰冻 3 次下落');
  }

  // ---- Win / Lose -----------------------------------------------------------

  _handleLevelComplete() {
    if (this.state !== STATES.PLAYING) return;
    this.state = STATES.COMPLETE;
    audio.win();
    this._vibrate([60, 40, 60]);
    const stars = this._computeStars();
    storage.setStars(this.level, stars);
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
    if (this.optimalSteps != null && this.optimalSteps > 0) {
      if (this.steps <= this.optimalSteps * 1.5) stars = 2;
      if (this.steps <= this.optimalSteps * 1.2 && !this.usedHardPowerup) stars = 3;
    } else {
      // Without an optimal estimate, give 2 stars by default for completion
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
