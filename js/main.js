// Tile Explorer — entry point
//
// Bootstraps PIXI.Application, mounts the scene graph, wires the Game
// to the DOM UI overlay, and registers the Service Worker.

import { Game } from './game.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { anim } from './animation.js';

async function boot() {
  const mount = document.getElementById('game-canvas');

  const app = new PIXI.Application({
    resizeTo: mount,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    backgroundAlpha: 0,
    antialias: true
  });
  mount.appendChild(app.view);

  // Build the scene graph in z-order
  const stage = app.stage;
  stage.eventMode = 'static';

  const game = new Game(app);

  // Particle layer used by anim.burst — must be on top
  const particleLayer = new PIXI.Container();

  stage.addChild(game.boardLayer);
  stage.addChild(game.slotLayer);
  stage.addChild(game.powerupLayer);
  stage.addChild(game.statusBar);
  stage.addChild(game.effectLayer);
  stage.addChild(particleLayer);

  anim.attach(app, particleLayer);

  // Wire DOM UI
  ui.init({
    game,
    onSetMusic(enabled) { audio.setMusicEnabled(enabled); },
    onSetSfx(enabled) { audio.setSfxEnabled(enabled); }
  });

  game.onLevelComplete = (data) => ui.showLevelComplete(data);
  game.onGameOver = () => ui.showGameOver();
  game.onShowToast = (m) => ui.toast(m);
  game.onTutorial = (key) => ui.tutorial(key);

  // First pointerdown unlocks audio (browser policy)
  const unlock = () => {
    audio.unlock().then(() => {
      if (storage.state.settings.musicEnabled) audio.startBgm();
    });
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Window resize → propagate
  window.addEventListener('resize', () => game.resize());
  // Initial layout
  setTimeout(() => game.resize(), 50);

  // Show menu first
  ui.showMenu();

  // Service worker (best-effort; never blocks the game)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[main] SW registration failed', err);
      });
    });
  }

  // Expose for debugging
  window.__game = game;
  window.__app = app;
}

boot().catch((err) => {
  console.error('[main] boot failed', err);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'color:#fff;padding:24px;font-family:sans-serif';
  wrap.textContent = `启动失败：${err && err.message ? err.message : String(err)}`;
  document.body.replaceChildren(wrap);
});
