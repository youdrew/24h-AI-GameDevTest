// Tile Explorer — DOM UI controller
//
// Owns the overlay panels (menu / settings / leaderboard / pause / complete /
// gameover / tutorial / toast). Wires DOM events to the game.

import { storage, isValidName } from './storage.js';
import { POWERUPS, POWERUP_ORDER } from './config.js';
import { leaderboard } from './leaderboard.js';

const TUTORIAL_TEXTS = {
  basicTap: '点击瓦片送入下方收集槽，3 个相同图案自动消除。',
  cover: '上层瓦片移走后才能点击下层的瓦片。',
  shuffle: '版面太乱？点击下方 🔄 洗牌道具。',
  undo: '走错了一步？点击 ↩️ 撤销最后一步。',
  hint: '找不到匹配？点击 💡 查看提示（不影响 3 星）。',
  tutorialComplete: '教程完成！准备迎接挑战 🎉'
};

class UI {
  constructor() {
    this.game = null;
    this.callbacks = {};
    this.currentPanel = null;
    this.completeData = null;
    this.selectedReward = null;
    this.activeLeaderboardTab = 'global';
    this.devMode = false;
    this._devTapTimes = [];
  }

  init({ game, onSetMusic, onSetSfx }) {
    this.game = game;
    this.callbacks = { onSetMusic, onSetSfx };
    this._bindMenu();
    this._bindSettings();
    this._bindLeaderboard();
    this._bindPause();
    this._bindComplete();
    this._bindGameover();
    this._bindHud();
    this._bindTutorial();
    this._bindDevGesture();
    this._bindGlobalActions();
    this._refreshSettings();
  }

  _$(id) { return document.getElementById(id); }

  _bindGlobalActions() {
    document.body.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      switch (action) {
        case 'start': this._handleStart(); break;
        case 'open-leaderboard': this._handleOpenLeaderboard(); break;
        case 'open-settings': this._showPanel('panel-settings'); break;
        case 'close-panel': this._closeCurrentPanel(); break;
        case 'back-to-menu': this._handleBackToMenu(); break;
        case 'resume': this._handleResume(); break;
        case 'restart': this._handleRestart(); break;
        case 'quit-to-menu': this._handleQuitMenu(); break;
        case 'next-level': this._handleNextLevel(); break;
        case 'skip-reward': this._handleSkipReward(); break;
        case 'record-rank': this._handleRecordRank(); break;
        case 'open-dev-jump': this._handleOpenDevJump(); break;
        case 'dev-jump-go': this._handleDevJumpGo(); break;
      }
    });
  }

  _bindMenu() {
    this._refreshMenuProgress();
  }

  _refreshMenuProgress() {
    const lvl = storage.state.currentLevel;
    const totalStars = Object.values(storage.state.stars).reduce((a, b) => a + b, 0);
    const el = this._$('menu-progress');
    if (el) el.textContent = `当前关卡 ${lvl} · 总星数 ${totalStars}`;
  }

  _bindSettings() {
    const sound = this._$('toggle-sound');
    const music = this._$('toggle-music');
    sound.addEventListener('change', () => this.callbacks.onSetSfx(sound.checked));
    music.addEventListener('change', () => this.callbacks.onSetMusic(music.checked));
    const name = this._$('input-name');
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (isValidName(v)) {
        storage.setPlayerName(v);
        this.toast('已保存');
      } else {
        name.value = storage.state.playerName;
        this.toast('名称不合法');
      }
    });
  }

  _refreshSettings() {
    this._$('toggle-sound').checked = storage.state.settings.soundEnabled;
    this._$('toggle-music').checked = storage.state.settings.musicEnabled;
    this._$('input-name').value = storage.state.playerName;
  }

  _bindLeaderboard() {
    const tabs = document.querySelectorAll('#panel-leaderboard .tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeLeaderboardTab = tab.dataset.tab;
        this._renderLeaderboard();
      });
    });
  }

  async _handleOpenLeaderboard() {
    this._showPanel('panel-leaderboard');
    await this._renderLeaderboard();
  }

  async _renderLeaderboard() {
    const list = this._$('leaderboard-list');
    if (!leaderboard.isConfigured()) {
      list.innerHTML = '<p class="hint">排行榜未配置 (Supabase URL/Key 留空)。<br/>本地最佳进度仍会保存。</p>';
      return;
    }
    list.innerHTML = '<p class="hint">载入中…</p>';
    let rows = [];
    try {
      if (this.activeLeaderboardTab === 'global') {
        rows = await leaderboard.getGlobalTop(50);
      } else {
        rows = await leaderboard.getLevelTop(this.game.level || storage.state.currentLevel, 20);
      }
    } catch (err) {
      list.innerHTML = '<p class="hint">载入失败，请稍后重试。</p>';
      return;
    }
    if (rows.length === 0) {
      list.innerHTML = '<p class="hint">暂无数据。</p>';
      return;
    }
    const me = storage.state.playerId;
    list.innerHTML = '';
    rows.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'lb-row' + (r.id === me ? ' self' : '');
      div.innerHTML = `
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${escapeHtml(r.name)}</span>
        <span class="lb-stars">${'★'.repeat(r.stars > 3 ? 3 : r.stars)}${r.stars > 3 ? `×${r.stars}` : ''}</span>
        <span class="lb-steps">${r.steps} 步</span>
      `;
      list.appendChild(div);
    });
  }

  _bindPause() { /* handled via data-action */ }
  _bindHud() {
    this._$('btn-pause').addEventListener('click', () => {
      this.game.pause();
      this._showPanel('panel-pause');
    });
  }

  _bindComplete() { /* handled via data-action + reward grid */ }
  _bindGameover() { /* handled via data-action */ }

  _bindTutorial() {
    const bubble = this._$('tutorial-bubble');
    bubble.addEventListener('click', () => bubble.classList.add('hidden'));
  }

  // 7 quick taps on the menu title within 3s toggles dev mode (session only —
  // never persisted, so production users can't trip into it accidentally).
  _bindDevGesture() {
    const title = this._$('menu-title');
    if (!title) return;
    title.addEventListener('click', () => {
      const now = Date.now();
      this._devTapTimes = this._devTapTimes.filter((t) => now - t < 3000);
      this._devTapTimes.push(now);
      if (this._devTapTimes.length >= 7) {
        this._devTapTimes = [];
        this._toggleDevMode();
      }
    });
  }

  _toggleDevMode() {
    this.devMode = !this.devMode;
    const btn = this._$('btn-dev-jump');
    if (btn) btn.classList.toggle('hidden', !this.devMode);
    this.toast(this.devMode ? '🛠️ 开发者模式已开启' : '开发者模式已关闭');
  }

  _handleBackToMenu() {
    this._closeCurrentPanel();
    this.showMenu();
  }

  _handleOpenDevJump() {
    if (!this.devMode) return;
    const input = this._$('input-dev-level');
    if (input) input.value = String(this.game.level || storage.state.currentLevel || 1);
    this._showPanel('panel-dev-jump');
    setTimeout(() => input?.focus(), 0);
  }

  _handleDevJumpGo() {
    if (!this.devMode) return;
    const input = this._$('input-dev-level');
    const n = Math.floor(Number(input?.value));
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      this.toast('请输入 1 – 10000');
      return;
    }
    storage.setLevel(n);
    this._closeCurrentPanel();
    this._$('btn-pause').classList.remove('hidden');
    this.game.startLevel(n);
  }

  // ---- Public flow methods --------------------------------------------------

  showMenu() {
    this._refreshMenuProgress();
    this._showPanel('panel-menu');
    this._$('btn-pause').classList.add('hidden');
    const devBtn = this._$('btn-dev-jump');
    if (devBtn) devBtn.classList.toggle('hidden', !this.devMode);
  }

  _handleStart() {
    this._closeCurrentPanel();
    this._$('btn-pause').classList.remove('hidden');
    this.game.startLevel(storage.state.currentLevel || 1);
  }

  _handleResume() {
    this._closeCurrentPanel();
    this.game.resume();
  }

  _handleRestart() {
    this._closeCurrentPanel();
    this.game.startLevel(this.game.level || storage.state.currentLevel);
  }

  _handleQuitMenu() {
    this.game.state = 'menu';
    this.showMenu();
  }

  // Pause-panel / complete-panel: push the local best record for the current
  // level to Supabase. Submits whatever is in storage (best stars + best steps
  // for that level); does NOT submit in-progress steps from the active run.
  async _handleRecordRank() {
    const level = this.game.level || storage.state.currentLevel;
    if (!leaderboard.isConfigured()) {
      this.toast('排行榜未配置（Supabase URL/Key 留空）');
      return;
    }
    const stars = storage.getStars(level);
    if (!stars) {
      this.toast('本关尚未通关，无法上传');
      return;
    }
    const record = storage.getBestRecord(level);
    if (!record) {
      // Legacy completions saved stars but no steps. Tell the player so they
      // know one more clear is needed for the cloud upload to work.
      this.toast('本地缺少步数记录，请再通关一次本关');
      return;
    }
    this.toast(`上传中… ★${record.stars} · ${record.steps} 步`);
    try {
      const res = await leaderboard.submit({ level, stars: record.stars, steps: record.steps });
      if (res) {
        this.toast(`已上传：第 ${level} 关 ★${record.stars} · ${record.steps} 步`);
      } else {
        // submit() returned null — the offline-queue branch fired or the name
        // failed validation. Surface it; the queue will retry on reconnect.
        this.toast('上传未成功，已加入离线队列');
        console.warn('[record-rank] submit returned null', { level, record });
      }
    } catch (err) {
      this.toast('上传失败：' + (err?.message || err));
      console.error('[record-rank] submit threw', err);
    }
  }

  _handleNextLevel() {
    if (!this.completeData) return;
    if (!this.selectedReward) {
      this.toast('请选择一个道具奖励');
      return;
    }
    storage.addPowerup(this.selectedReward, 1);
    this._advanceToNextLevel();
  }

  // Highlighted "skip reward" button: advance without granting a powerup.
  _handleSkipReward() {
    if (!this.completeData) return;
    this._advanceToNextLevel();
  }

  _advanceToNextLevel() {
    const next = Math.min(this.completeData.level + 1, 9999);
    storage.setLevel(next);
    this.completeData = null;
    this.selectedReward = null;
    this._closeCurrentPanel();
    this.game.startLevel(next);
  }

  showLevelComplete(data) {
    this.completeData = data;
    this.selectedReward = null;

    const stars = '★'.repeat(data.stars) + '☆'.repeat(3 - data.stars);
    this._$('complete-stars').textContent = stars;
    this._$('complete-stats').textContent =
      `用了 ${data.steps} 步` + (data.optimalSteps ? ` · 最优 ${data.optimalSteps} 步` : '');
    this._$('btn-next-level').classList.add('hidden');
    this._$('complete-rank').textContent = leaderboard.isConfigured() ? '提交排行榜中…' : '本地保存进度';

    // Submit leaderboard
    if (leaderboard.isConfigured()) {
      leaderboard.submit({ level: data.level, stars: data.stars, steps: data.steps })
        .then((res) => {
          this._$('complete-rank').textContent = res ? '已上传！' : '已加入离线队列';
        })
        .catch(() => {
          this._$('complete-rank').textContent = '已加入离线队列';
        });
    }

    // Reward grid
    const grid = this._$('reward-grid');
    grid.innerHTML = '';
    const tutorialDone = storage.state.tutorialSeen.tutorialComplete || data.level >= 10;
    POWERUP_ORDER.forEach((id) => {
      const p = POWERUPS[id];
      const btn = document.createElement('button');
      btn.className = 'reward-btn';
      const have = storage.state.powerups[id] || 0;
      const locked = data.level + 1 < p.unlock;
      const atCap = have >= p.cap;
      btn.disabled = locked || atCap;
      const iconEl = document.createElement('span');
      iconEl.style.fontSize = '24px';
      iconEl.textContent = p.icon;
      const labelEl = document.createElement('span');
      labelEl.className = 'reward-label';
      labelEl.textContent = p.label + (atCap ? '(满)' : locked ? `(${p.unlock}解锁)` : '');
      btn.appendChild(iconEl);
      btn.appendChild(labelEl);
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        document.querySelectorAll('.reward-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedReward = id;
        this._$('btn-next-level').classList.remove('hidden');
      });
      grid.appendChild(btn);
    });

    // Description block — one short line per powerup so the player can decide
    // without remembering each icon.
    const descBox = this._$('reward-desc');
    if (descBox) {
      descBox.innerHTML = '';
      POWERUP_ORDER.forEach((id) => {
        const p = POWERUPS[id];
        const row = document.createElement('div');
        row.className = 'reward-desc-row';
        const ic = document.createElement('span');
        ic.className = 'reward-desc-ic';
        ic.textContent = p.icon;
        const txt = document.createElement('span');
        txt.className = 'reward-desc-txt';
        txt.textContent = `${p.label} · ${p.desc || ''}`;
        row.appendChild(ic);
        row.appendChild(txt);
        descBox.appendChild(row);
      });
    }

    this._showPanel('panel-complete');
  }

  showGameOver() {
    this._showPanel('panel-gameover');
  }

  toast(msg, ms = 1400) {
    const el = this._$('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  tutorial(key) {
    const text = TUTORIAL_TEXTS[key];
    if (!text) return;
    const el = this._$('tutorial-bubble');
    this._$('tutorial-text').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._tutTimer);
    this._tutTimer = setTimeout(() => el.classList.add('hidden'), 5000);
  }

  // ---- Panel utilities ------------------------------------------------------

  _showPanel(id) {
    this._closeCurrentPanel();
    const el = this._$(id);
    if (!el) return;
    el.classList.remove('hidden');
    this.currentPanel = id;
    if (id === 'panel-settings') this._refreshSettings();
  }

  _closeCurrentPanel() {
    if (!this.currentPanel) return;
    const el = this._$(this.currentPanel);
    if (el) el.classList.add('hidden');
    this.currentPanel = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const ui = new UI();
