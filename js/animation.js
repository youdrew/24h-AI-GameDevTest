// Tile Explorer — animation queue + particle pool
//
// Lightweight tweening built on PIXI.Ticker. Each animation is an object
// { target, props, duration, ease, elapsed, onComplete }. The system runs every
// frame and updates targets in place. Particles use a fixed-size pool to avoid GC.

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const EASES = { linear: (t) => t, easeOutCubic, easeInOutCubic, easeOutBack };

class AnimationSystem {
  constructor() {
    this.tweens = [];
    this.particles = [];
    this.particlePool = [];
    this.particleContainer = null;
    this.ticker = null;
    this.tickFn = null;
  }

  attach(app, particleContainer) {
    this.particleContainer = particleContainer;
    this.ticker = app.ticker;
    this.tickFn = (delta) => this._update(delta);
    this.ticker.add(this.tickFn);
    // Pre-allocate particles
    for (let i = 0; i < 120; i++) this.particlePool.push(this._createParticle());
  }

  _createParticle() {
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff);
    g.drawCircle(0, 0, 3);
    g.endFill();
    g.visible = false;
    if (this.particleContainer) this.particleContainer.addChild(g);
    return g;
  }

  // Tween {target} numeric props over duration (seconds). Returns a Promise.
  to(target, props, options = {}) {
    const duration = options.duration ?? 0.2;
    const ease = EASES[options.ease || 'easeOutCubic'];
    const delay = options.delay ?? 0;
    return new Promise((resolve) => {
      const start = {};
      const end = { ...props };
      // Defer starting field capture until delay elapses, in case caller mutates first
      const tween = {
        target,
        props,
        ease,
        duration,
        elapsed: -delay,
        started: false,
        start,
        end,
        onUpdate: options.onUpdate,
        onComplete: () => resolve()
      };
      this.tweens.push(tween);
    });
  }

  // Bezier path tween for tile fly-to-slot
  bezierTo(target, controlPoint, endPoint, options = {}) {
    const duration = options.duration ?? 0.25;
    const ease = EASES[options.ease || 'easeOutCubic'];
    return new Promise((resolve) => {
      const startX = target.x, startY = target.y;
      const tween = {
        target,
        bezier: { startX, startY, cx: controlPoint.x, cy: controlPoint.y, ex: endPoint.x, ey: endPoint.y },
        ease,
        duration,
        elapsed: 0,
        started: true,
        start: {},
        end: {},
        onUpdate: options.onUpdate,
        onComplete: () => resolve()
      };
      this.tweens.push(tween);
    });
  }

  cancelTweens(target) {
    this.tweens = this.tweens.filter((tw) => tw.target !== target);
  }

  burst(x, y, color = 0xffffff, count = 12, speed = 4) {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.pop() || this._createParticle();
      p.visible = true;
      p.tint = color;
      p.x = x; p.y = y;
      p.alpha = 1;
      p.scale.set(1 + Math.random() * 0.5);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const v = speed * (0.6 + Math.random() * 0.6);
      this.particles.push({
        sprite: p,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 1,
        gravity: 0.18,
        life: 0.6 + Math.random() * 0.3,
        age: 0
      });
    }
  }

  flash(container, color = 0xffffff, alpha = 0.6, durationSec = 0.25) {
    if (!container) return;
    const g = new PIXI.Graphics();
    const w = (container.parent && container.parent.screen) ? container.parent.screen.width : 1080;
    const h = (container.parent && container.parent.screen) ? container.parent.screen.height : 1920;
    g.beginFill(color);
    g.drawRect(-2000, -2000, 4000 + w * 4, 4000 + h * 4);
    g.endFill();
    g.alpha = alpha;
    container.addChild(g);
    this.to(g, { alpha: 0 }, { duration: durationSec, ease: 'easeOutCubic' }).then(() => {
      g.destroy();
    });
  }

  _update(delta) {
    // delta is in PIXI ticker units (1 = 1/60s typical). Convert to seconds.
    const dt = delta / 60;

    // Tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.elapsed += dt;
      if (tw.elapsed < 0) continue;

      if (!tw.started) {
        // Capture start values from target the first frame past delay
        for (const k of Object.keys(tw.props)) {
          tw.start[k] = readNested(tw.target, k);
        }
        tw.started = true;
      }

      let t = Math.min(1, tw.elapsed / tw.duration);
      const e = tw.ease(t);

      if (tw.bezier) {
        const b = tw.bezier;
        const x = quadBezier(b.startX, b.cx, b.ex, e);
        const y = quadBezier(b.startY, b.cy, b.ey, e);
        tw.target.x = x; tw.target.y = y;
      } else {
        for (const k of Object.keys(tw.props)) {
          const v = tw.start[k] + (tw.end[k] - tw.start[k]) * e;
          writeNested(tw.target, k, v);
        }
      }
      if (tw.onUpdate) tw.onUpdate(t);
      if (t >= 1) {
        this.tweens.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.age += dt;
      pt.sprite.x += pt.vx;
      pt.sprite.y += pt.vy;
      pt.vy += pt.gravity;
      pt.sprite.alpha = Math.max(0, 1 - pt.age / pt.life);
      pt.sprite.scale.set(Math.max(0.1, 1 - pt.age / pt.life));
      if (pt.age >= pt.life) {
        pt.sprite.visible = false;
        this.particlePool.push(pt.sprite);
        this.particles.splice(i, 1);
      }
    }
  }
}

function quadBezier(a, b, c, t) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}

// Support nested keys like 'scale.x'
function readNested(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) cur = cur[p];
  return cur;
}

function writeNested(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

export const anim = new AnimationSystem();
