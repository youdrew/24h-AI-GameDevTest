// Tile Explorer — board container, tile sprites, coverage, layout & responsive scaling

import { CONFIG, PATTERN_LIBRARY, TILE_BG_COLORS, THEMES } from './config.js';
import { computeCoverage } from './level.js';
import { anim } from './animation.js';

// Per-layer covered-tile alpha decay. Geometric (constant ratio per step) is
// what the Weber-Fechner law predicts for perceptually uniform brightness
// gradations — every layer-deep step "feels" like an equal fade. The 0.4
// floor preserves the legacy minimum so very deep tiles remain identifiable.
const COVERED_DECAY = 0.85;
const COVERED_MIN_ALPHA = 0.4;

function coveredAlphaForLayer(layer, topLayer) {
  const depth = Math.max(0, topLayer - layer);
  return Math.max(COVERED_MIN_ALPHA, Math.pow(COVERED_DECAY, depth));
}

export class Board {
  constructor(app) {
    this.app = app;
    this.container = new PIXI.Container();
    this.layersContainer = new PIXI.Container();
    this.container.addChild(this.layersContainer);
    this.tilesById = new Map();          // id -> sprite
    this.layout = null;
    this.layerContainers = [];
    this.onTileClick = null;             // callback(tile)
    this.frozenTiles = new Map();        // id -> remaining drops
    this.dropsThisLevel = 0;
    this._nextDropId = 1000000;          // monotonic id source for falling-queue tiles
    this.theme = THEMES[0];              // overridden per-level via setTheme()
  }

  setTheme(theme) {
    this.theme = theme || THEMES[0];
  }

  _emojiFor(patternId) {
    const lib = (this.theme && this.theme.library) || PATTERN_LIBRARY;
    return lib[patternId % lib.length];
  }

  destroy() {
    // Wipe per-level state but keep `layersContainer` parented to `container`,
    // otherwise the next load() leaves it orphaned and nothing renders.
    for (const sprite of this.tilesById.values()) {
      sprite.destroy({ children: true });
    }
    this.layersContainer.removeChildren();
    this.tilesById.clear();
    this.layerContainers = [];
  }

  load(layout) {
    this.destroy();
    this.layout = layout;
    this.frozenTiles.clear();
    this.dropsThisLevel = 0;

    // Create per-layer containers
    for (let l = 0; l < layout.params.layers; l++) {
      const c = new PIXI.Container();
      this.layerContainers.push(c);
      this.layersContainer.addChild(c);
    }

    for (const t of layout.tiles) {
      const sprite = this._makeTile(t);
      this.layerContainers[t.layer].addChild(sprite);
      this.tilesById.set(t.id, sprite);
    }
    this._relayout();
    this.refreshCoverage();
  }

  _makeTile(t) {
    const sprite = new PIXI.Container();
    sprite.tileData = { ...t };

    const bg = new PIXI.Graphics();
    const color = TILE_BG_COLORS[t.patternId % TILE_BG_COLORS.length];
    bg.beginFill(color);
    bg.lineStyle(2, 0x1a1f2e, 0.4);
    bg.drawRoundedRect(-CONFIG.TILE_SIZE / 2, -CONFIG.TILE_SIZE / 2, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 8);
    bg.endFill();
    sprite.addChild(bg);
    sprite.bg = bg;

    const emoji = this._emojiFor(t.patternId);
    const text = new PIXI.Text(emoji, {
      fontSize: 30,
      align: 'center'
    });
    text.anchor.set(0.5);
    sprite.addChild(text);
    sprite.label = text;

    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', () => {
      if (this.onTileClick && !sprite.tileData.removed && !sprite.tileData.covered) {
        this.onTileClick(sprite.tileData);
      }
    });

    return sprite;
  }

  // Recompute pixel positions based on container size
  _relayout() {
    if (!this.layout) return;
    const { boardSize, params } = this.layout;
    const screen = this.app.renderer.screen;
    // Reserve top 70 px for status bar, bottom 220 px for slot+powerups
    const availW = screen.width - 24;
    const availH = screen.height - 70 - 220 - 16;
    const baseTile = CONFIG.TILE_SIZE;
    const baseGap = CONFIG.TILE_GAP;
    // Fit so the offset grid (boardSize.cols × boardSize.rows + tiny offsets) fits in avail
    // Effective cell pitch = tile + gap; layered offsets = (layers-1) * (tile/4)
    const layerOffset = (params.layers - 1) * (baseTile / 4);
    const widthNeeded = boardSize.cols * (baseTile + baseGap) + layerOffset;
    const heightNeeded = boardSize.rows * (baseTile + baseGap) + layerOffset;
    const scale = Math.min(1, availW / widthNeeded, availH / heightNeeded);

    this.tileSize = baseTile * scale;
    this.tileGap = baseGap * scale;
    this.layerOffset = (baseTile / 4) * scale;

    const totalW = boardSize.cols * (this.tileSize + this.tileGap) + (params.layers - 1) * this.layerOffset;
    const totalH = boardSize.rows * (this.tileSize + this.tileGap) + (params.layers - 1) * this.layerOffset;
    this.boardOriginX = (screen.width - totalW) / 2;
    this.boardOriginY = 70 + ((availH - totalH) / 2);

    // Update each tile's position and visual scale
    for (const sprite of this.tilesById.values()) {
      this._positionSprite(sprite);
    }
  }

  _positionSprite(sprite) {
    const t = sprite.tileData;
    const px = this.boardOriginX + t.gridX * (this.tileSize + this.tileGap) + (t.layer * this.layerOffset) + this.tileSize / 2;
    const py = this.boardOriginY + t.gridY * (this.tileSize + this.tileGap) + (t.layer * this.layerOffset) + this.tileSize / 2;
    sprite.x = px;
    sprite.y = py;
    const s = this.tileSize / CONFIG.TILE_SIZE;
    sprite.scale.set(s);
  }

  resize() {
    this._relayout();
    this.refreshCoverage();
  }

  refreshCoverage() {
    const remaining = [];
    for (const sprite of this.tilesById.values()) {
      if (!sprite.tileData.removed) remaining.push(sprite.tileData);
    }
    const covered = computeCoverage(remaining);
    const topLayer = (this.layout?.params?.layers ?? 1) - 1;
    for (const sprite of this.tilesById.values()) {
      const t = sprite.tileData;
      if (t.removed) continue;
      const wasCovered = t.covered;
      t.covered = covered.has(t.id);
      if (t.covered) {
        sprite.alpha = coveredAlphaForLayer(t.layer, topLayer);
        sprite.eventMode = 'none';
      } else {
        if (wasCovered && sprite.alpha < 1) {
          // Reveal animation — fade up to fully visible.
          anim.cancelTweens(sprite);
          anim.to(sprite, { alpha: 1 }, { duration: 0.3 });
        } else {
          sprite.alpha = 1;
        }
        sprite.eventMode = 'static';
      }
    }
  }

  removeTile(id) {
    const sprite = this.tilesById.get(id);
    if (!sprite) return null;
    sprite.tileData.removed = true;
    sprite.eventMode = 'none';
    sprite.visible = false;
    return sprite;
  }

  // Reverse a tile removal (undo)
  restoreTile(id) {
    const sprite = this.tilesById.get(id);
    if (!sprite) return;
    sprite.tileData.removed = false;
    sprite.visible = true;
    this._positionSprite(sprite);
    this.refreshCoverage();
  }

  // Get all currently-uncovered tiles
  getUncoveredTiles() {
    const out = [];
    for (const sprite of this.tilesById.values()) {
      const t = sprite.tileData;
      if (!t.removed && !t.covered) out.push(t);
    }
    return out;
  }

  getRemainingTiles() {
    const out = [];
    for (const sprite of this.tilesById.values()) {
      if (!sprite.tileData.removed) out.push(sprite.tileData);
    }
    return out;
  }

  isEmpty() {
    for (const sprite of this.tilesById.values()) {
      if (!sprite.tileData.removed) return false;
    }
    return true;
  }

  getSprite(id) { return this.tilesById.get(id); }

  // Shuffle: randomly reassign patternIds among remaining tiles (positions stay)
  shuffle(rand = Math.random) {
    const remainingIds = [];
    const patterns = [];
    for (const sprite of this.tilesById.values()) {
      if (sprite.tileData.removed) continue;
      remainingIds.push(sprite.tileData.id);
      patterns.push(sprite.tileData.patternId);
    }
    for (let i = patterns.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [patterns[i], patterns[j]] = [patterns[j], patterns[i]];
    }
    for (let i = 0; i < remainingIds.length; i++) {
      const sprite = this.tilesById.get(remainingIds[i]);
      const newPattern = patterns[i];
      sprite.tileData.patternId = newPattern;
      const color = TILE_BG_COLORS[newPattern % TILE_BG_COLORS.length];
      sprite.bg.clear();
      sprite.bg.beginFill(color);
      sprite.bg.lineStyle(2, 0x1a1f2e, 0.4);
      sprite.bg.drawRoundedRect(-CONFIG.TILE_SIZE / 2, -CONFIG.TILE_SIZE / 2, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 8);
      sprite.bg.endFill();
      sprite.label.text = this._emojiFor(newPattern);
    }
  }

  // Find a triple of uncovered tiles with the same pattern (for hint)
  findHintTriple() {
    const byPattern = new Map();
    for (const t of this.getUncoveredTiles()) {
      if (!byPattern.has(t.patternId)) byPattern.set(t.patternId, []);
      byPattern.get(t.patternId).push(t);
    }
    for (const arr of byPattern.values()) {
      if (arr.length >= 3) return arr.slice(0, 3);
    }
    // Otherwise: 2 uncovered + 1 covered same pattern (best-effort hint)
    const allByPattern = new Map();
    for (const t of this.getRemainingTiles()) {
      if (!allByPattern.has(t.patternId)) allByPattern.set(t.patternId, []);
      allByPattern.get(t.patternId).push(t);
    }
    for (const arr of allByPattern.values()) {
      if (arr.length >= 3) return arr.slice(0, 3);
    }
    return null;
  }

  // Bomb effect: remove all remaining tiles of a given pattern from board
  removePattern(patternId) {
    const removed = [];
    for (const sprite of this.tilesById.values()) {
      const t = sprite.tileData;
      if (!t.removed && t.patternId === patternId) {
        sprite.tileData.removed = true;
        sprite.visible = false;
        removed.push(t);
      }
    }
    return removed;
  }

  countRemainingByPattern(patternId) {
    let n = 0;
    for (const sprite of this.tilesById.values()) {
      if (!sprite.tileData.removed && sprite.tileData.patternId === patternId) n++;
    }
    return n;
  }

  // Build a snapshot of the remaining tiles for the solver/hint
  snapshotRemaining() {
    return this.getRemainingTiles().map((t) => ({
      id: t.id, patternId: t.patternId, layer: t.layer, gridX: t.gridX, gridY: t.gridY
    }));
  }

  // Drop new tiles from the falling queue (level >= 51)
  // Adds tiles with layer = layers-1 (top), random column. Returns dropped count.
  async dropFromQueue(count = 3) {
    if (!this.layout || !this.layout.fallingQueue || this.layout.fallingQueue.length === 0) return 0;
    const { params, boardSize } = this.layout;
    const topLayer = params.layers - 1;
    const layerContainer = this.layerContainers[topLayer];
    let dropped = 0;
    this.dropsThisLevel++;

    // Decrement frozen counts and remove expired
    for (const id of Array.from(this.frozenTiles.keys())) {
      const left = this.frozenTiles.get(id) - 1;
      if (left <= 0) this.frozenTiles.delete(id);
      else this.frozenTiles.set(id, left);
    }

    for (let i = 0; i < count; i++) {
      if (this.layout.fallingQueue.length === 0) break;
      const patternId = this.layout.fallingQueue.shift();
      // Find a position not occupied on top layer (with simple try loop)
      let chosen = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        const gx = Math.floor(Math.random() * boardSize.cols);
        const gy = Math.floor(Math.random() * boardSize.rows);
        if (!this._isCellOccupied(gx, gy, topLayer)) {
          chosen = { gx, gy };
          break;
        }
      }
      if (!chosen) {
        // Brute-force scan
        outer:
        for (let y = 0; y < boardSize.rows; y++) {
          for (let x = 0; x < boardSize.cols; x++) {
            if (!this._isCellOccupied(x, y, topLayer)) { chosen = { gx: x, gy: y }; break outer; }
          }
        }
      }
      if (!chosen) {
        // Top layer is full. The shifted tile would otherwise be silently
        // dropped — push it back to the queue head so the next dropFromQueue()
        // (or the end-of-level dump) sees it.
        this.layout.fallingQueue.unshift(patternId);
        break;
      }

      const newId = this._nextDropId++;
      const tileData = { id: newId, patternId, layer: topLayer, gridX: chosen.gx, gridY: chosen.gy };
      const sprite = this._makeTile(tileData);
      layerContainer.addChild(sprite);
      this.tilesById.set(newId, sprite);
      this._positionSprite(sprite);
      const targetY = sprite.y;
      sprite.y -= 200;
      sprite.alpha = 0;
      anim.to(sprite, { y: targetY, alpha: 1 }, { duration: 0.35, ease: 'easeOutCubic' });
      dropped++;
    }
    this.refreshCoverage();
    return dropped;
  }

  _isCellOccupied(gx, gy, layer) {
    for (const sprite of this.tilesById.values()) {
      const t = sprite.tileData;
      if (t.removed) continue;
      if (t.layer === layer && t.gridX === gx && t.gridY === gy) {
        // Frozen tile collision: try to preserve frozen tile elsewhere
        if (this.frozenTiles.has(t.id)) {
          // For simplicity here, simulating freeze deflection by treating cell as
          // occupied (the new tile must find another cell instead).
        }
        return true;
      }
    }
    return false;
  }

  // Used by the 扔垃圾 powerup. Scatters the supplied patternIds across the
  // board at random unoccupied (gx, gy, layer) cells, fading each tile in.
  // Returns the number of tiles successfully placed.
  trashTilesToBoard(patternIds, rand = Math.random) {
    if (!this.layout || !this.layerContainers.length) return 0;
    const { params, boardSize } = this.layout;
    let placed = 0;
    for (const patternId of patternIds) {
      let chosen = null;
      // Quick random sampling first; fall back to a brute-force scan if the
      // board is densely packed.
      for (let attempt = 0; attempt < 50; attempt++) {
        const layer = Math.floor(rand() * params.layers);
        const gx = Math.floor(rand() * boardSize.cols);
        const gy = Math.floor(rand() * boardSize.rows);
        if (!this._isCellOccupied(gx, gy, layer)) {
          chosen = { gx, gy, layer };
          break;
        }
      }
      if (!chosen) {
        outer:
        for (let l = 0; l < params.layers; l++) {
          for (let y = 0; y < boardSize.rows; y++) {
            for (let x = 0; x < boardSize.cols; x++) {
              if (!this._isCellOccupied(x, y, l)) {
                chosen = { gx: x, gy: y, layer: l };
                break outer;
              }
            }
          }
        }
      }
      if (!chosen) break;

      const newId = this._nextDropId++;
      const tileData = { id: newId, patternId, layer: chosen.layer, gridX: chosen.gx, gridY: chosen.gy };
      const sprite = this._makeTile(tileData);
      this.layerContainers[chosen.layer].addChild(sprite);
      this.tilesById.set(newId, sprite);
      this._positionSprite(sprite);
      sprite.alpha = 0;
      anim.to(sprite, { alpha: 1 }, { duration: 0.28, ease: 'easeOutCubic' });
      placed++;
    }
    return placed;
  }

  freezeTile(id, drops = 3) {
    if (!this.tilesById.has(id)) return false;
    this.frozenTiles.set(id, drops);
    const sprite = this.tilesById.get(id);
    // Visual cue: blue tint
    sprite.label.tint = 0x60a5fa;
    return true;
  }

  isFrozen(id) {
    return this.frozenTiles.has(id);
  }

  highlightTriple(tiles, durationMs = 1400) {
    for (const t of tiles) {
      const sprite = this.tilesById.get(t.id);
      if (!sprite) continue;
      const original = sprite.scale.x;
      anim.to(sprite, { 'scale.x': original * 1.18, 'scale.y': original * 1.18 }, { duration: 0.18, ease: 'easeOutBack' })
        .then(() => anim.to(sprite, { 'scale.x': original, 'scale.y': original }, { duration: 0.18, ease: 'easeOutCubic' }));
      // Pulse twice
      setTimeout(() => {
        if (sprite.tileData.removed) return;
        anim.to(sprite, { 'scale.x': original * 1.18, 'scale.y': original * 1.18 }, { duration: 0.18, ease: 'easeOutBack' })
          .then(() => anim.to(sprite, { 'scale.x': original, 'scale.y': original }, { duration: 0.18, ease: 'easeOutCubic' }));
      }, 600);
    }
  }
}
