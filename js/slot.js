// Tile Explorer — bottom collection slot (7 cells)

import { CONFIG, PATTERN_LIBRARY, TILE_BG_COLORS } from './config.js';
import { findMatch } from './matcher.js';
import { anim } from './animation.js';

const SLOT_BG_COLOR = 0x232a3d;
const SLOT_HIGHLIGHT = 0xf87171;

export class Slot {
  constructor(app) {
    this.app = app;
    this.container = new PIXI.Container();
    this.bg = new PIXI.Graphics();
    this.container.addChild(this.bg);
    this.cellsContainer = new PIXI.Container();
    this.container.addChild(this.cellsContainer);

    this.cells = [];          // { container, sprite (tile clone), patternId, sourceTileId }
    this.warning = false;
    this.cellSize = 0;

    this._buildCells();
    this.resize();
  }

  _buildCells() {
    for (let i = 0; i < CONFIG.SLOT_CAPACITY; i++) {
      const c = new PIXI.Container();
      const cellBg = new PIXI.Graphics();
      c.addChild(cellBg);
      c.cellBg = cellBg;
      this.cellsContainer.addChild(c);
      this.cells.push({ container: c, cellBg, sprite: null, patternId: null, sourceTileId: null });
    }
  }

  resize() {
    const screen = this.app.renderer.screen;
    const margin = 12;
    const w = screen.width - margin * 2;
    const cellSize = Math.min(56, Math.floor((w - 6 * 8) / CONFIG.SLOT_CAPACITY));
    this.cellSize = cellSize;
    const totalW = CONFIG.SLOT_CAPACITY * cellSize + (CONFIG.SLOT_CAPACITY - 1) * 8;
    const startX = (screen.width - totalW) / 2;
    const y = screen.height - cellSize - 24;

    this.bg.clear();
    this.bg.beginFill(0x0d1018, 0.6);
    this.bg.drawRoundedRect(margin, y - 10, screen.width - margin * 2, cellSize + 20, 14);
    this.bg.endFill();

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const cx = startX + i * (cellSize + 8);
      cell.container.x = cx + cellSize / 2;
      cell.container.y = y + cellSize / 2;
      cell.cellBg.clear();
      cell.cellBg.beginFill(SLOT_BG_COLOR, 0.85);
      cell.cellBg.lineStyle(1, 0xffffff, 0.06);
      cell.cellBg.drawRoundedRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 10);
      cell.cellBg.endFill();
      if (cell.sprite) {
        cell.sprite.scale.set(cellSize / CONFIG.TILE_SIZE * 0.85);
      }
    }
    this._updateWarningTint();
  }

  // Find first empty slot index
  firstEmptyIndex() {
    return this.cells.findIndex((c) => c.sprite === null);
  }

  isFull() {
    return this.firstEmptyIndex() === -1;
  }

  count() {
    return this.cells.filter((c) => c.sprite !== null).length;
  }

  patternCounts() {
    const m = new Map();
    for (const c of this.cells) {
      if (c.patternId === null) continue;
      m.set(c.patternId, (m.get(c.patternId) || 0) + 1);
    }
    return m;
  }

  _updateWarningTint() {
    const filled = this.count();
    const warn = filled >= CONFIG.SLOT_CAPACITY - 1;
    if (warn !== this.warning) {
      this.warning = warn;
      for (const cell of this.cells) {
        cell.cellBg.tint = warn ? SLOT_HIGHLIGHT : 0xffffff;
      }
    }
  }

  // Add a tile to slot. Returns the cell index it landed at.
  // `source` is { x, y, patternId, sourceTileId } in world coordinates.
  async acceptTile(source) {
    const idx = this.firstEmptyIndex();
    if (idx === -1) return -1;

    // Insertion: place near the first matching pattern (cluster) for visual clarity
    const insertIdx = this._chooseInsertIndex(source.patternId, idx);

    // Shift items right of insertIdx (snap, no tween — visual cost is small)
    if (insertIdx < idx) {
      for (let i = idx; i > insertIdx; i--) {
        const src = this.cells[i - 1];
        this.cells[i].sprite = src.sprite;
        this.cells[i].patternId = src.patternId;
        this.cells[i].sourceTileId = src.sourceTileId;
        if (this.cells[i].sprite) {
          this.cells[i].container.addChild(this.cells[i].sprite);
          this.cells[i].sprite.x = 0;
          this.cells[i].sprite.y = 0;
        }
      }
    }

    // Build a small mini-tile for the slot (clone visuals from source)
    const slotSprite = this._makeMiniTile(source.patternId);

    // Position at world coords matching source
    slotSprite.x = source.x;
    slotSprite.y = source.y;
    slotSprite.scale.set(source.scale ?? 1);

    // We add to global stage for fly animation, then re-parent on landing
    this.container.parent.addChild(slotSprite);

    const target = this.cells[insertIdx].container;
    const targetWorld = target.getGlobalPosition();
    const stageScale = this.container.parent.scale.x || 1;

    // Mid control point for bezier curve
    const mid = {
      x: (slotSprite.x + targetWorld.x) / 2,
      y: Math.min(slotSprite.y, targetWorld.y) - 60
    };
    await anim.bezierTo(slotSprite, mid, { x: targetWorld.x, y: targetWorld.y }, { duration: 0.32, ease: 'easeOutCubic' });

    // Re-parent to cell container, snap into place
    target.addChild(slotSprite);
    slotSprite.x = 0;
    slotSprite.y = 0;
    slotSprite.scale.set(this.cellSize / CONFIG.TILE_SIZE * 0.85);

    this.cells[insertIdx].sprite = slotSprite;
    this.cells[insertIdx].patternId = source.patternId;
    this.cells[insertIdx].sourceTileId = source.sourceTileId;

    this._updateWarningTint();
    return insertIdx;
  }

  _chooseInsertIndex(patternId, defaultIdx) {
    // Place adjacent to the rightmost existing tile of same pattern
    for (let i = this.cells.length - 1; i >= 0; i--) {
      if (this.cells[i].patternId === patternId) {
        const at = i + 1;
        if (at <= defaultIdx) return at;
      }
    }
    return defaultIdx;
  }

  _makeMiniTile(patternId) {
    const sprite = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const color = TILE_BG_COLORS[patternId % TILE_BG_COLORS.length];
    bg.beginFill(color);
    bg.lineStyle(2, 0x1a1f2e, 0.4);
    bg.drawRoundedRect(-CONFIG.TILE_SIZE / 2, -CONFIG.TILE_SIZE / 2, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 8);
    bg.endFill();
    sprite.addChild(bg);
    const text = new PIXI.Text(PATTERN_LIBRARY[patternId % PATTERN_LIBRARY.length], { fontSize: 30 });
    text.anchor.set(0.5);
    sprite.addChild(text);
    return sprite;
  }

  // Returns { patternId, removedIndices, removedSprites } if a triple matches; else null
  detectAndPopMatch() {
    const ids = this.cells.map((c) => c.patternId);
    const m = findMatch(ids);
    if (!m) return null;
    const removedSprites = m.indices.map((i) => this.cells[i].sprite);
    const removedSourceTileIds = m.indices.map((i) => this.cells[i].sourceTileId);

    // Clear those cells
    for (const i of m.indices) {
      this.cells[i].sprite = null;
      this.cells[i].patternId = null;
      this.cells[i].sourceTileId = null;
    }
    // Compact: shift remaining left
    this._compact();
    this._updateWarningTint();

    return { patternId: m.patternId, indices: m.indices, removedSprites, removedSourceTileIds };
  }

  _compact() {
    const occupied = this.cells.filter((c) => c.sprite !== null);
    for (let i = 0; i < this.cells.length; i++) {
      const target = i < occupied.length ? occupied[i] : null;
      const cell = this.cells[i];
      if (target) {
        cell.sprite = target.sprite;
        cell.patternId = target.patternId;
        cell.sourceTileId = target.sourceTileId;
        // Reparent / animate to new position
        if (cell.sprite && cell.sprite.parent !== cell.container) {
          cell.container.addChild(cell.sprite);
        }
        if (cell.sprite) {
          cell.sprite.x = 0;
          cell.sprite.y = 0;
        }
      } else if (cell !== target) {
        cell.sprite = null;
        cell.patternId = null;
        cell.sourceTileId = null;
      }
    }
    // After moving, the original references in `occupied` may still point to cells
    // that now hold themselves (no-op) or are duplicates. Sanitize duplicates.
    const seenSprites = new Set();
    for (const c of this.cells) {
      if (c.sprite && seenSprites.has(c.sprite)) {
        c.sprite = null;
        c.patternId = null;
        c.sourceTileId = null;
      } else if (c.sprite) {
        seenSprites.add(c.sprite);
      }
    }
  }

  // Pop the last inserted slot tile (undo). Returns { patternId, sourceTileId, sprite } or null.
  popLast() {
    let lastIdx = -1;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      if (this.cells[i].sprite !== null) { lastIdx = i; break; }
    }
    if (lastIdx === -1) return null;
    const c = this.cells[lastIdx];
    const out = { patternId: c.patternId, sourceTileId: c.sourceTileId, sprite: c.sprite };
    c.sprite = null; c.patternId = null; c.sourceTileId = null;
    this._updateWarningTint();
    return out;
  }

  // Pop all entries with matching patternId (used by Bomb).
  popPattern(patternId) {
    const popped = [];
    for (const c of this.cells) {
      if (c.patternId === patternId) {
        popped.push({ patternId: c.patternId, sourceTileId: c.sourceTileId, sprite: c.sprite });
        c.sprite = null; c.patternId = null; c.sourceTileId = null;
      }
    }
    this._compact();
    this._updateWarningTint();
    return popped;
  }

  clear() {
    for (const c of this.cells) {
      if (c.sprite) c.sprite.destroy({ children: true });
      c.sprite = null; c.patternId = null; c.sourceTileId = null;
    }
    this._updateWarningTint();
  }
}
