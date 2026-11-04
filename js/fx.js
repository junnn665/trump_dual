// =========================================================
//  演出：パーティクル、カットイン、画面揺れ、浮き文字
// =========================================================
let canvas, c2d, particles = [], running = false, dpr = 1;
export const fxConf = { speed: 1, reduce: false, skin: 'standard' };

// エフェクトの着せ替え：粒の色と形を変える（紙吹雪・王冠などはそのまま）
const SKINS = {
  fire: { colors: ['#ff3b1f', '#ff7a1c', '#ffd45a', '#fff0a8'], shape: null },
  sakura: { colors: ['#ffc6e0', '#ff8fc0', '#ffe4f0', '#ffffff'], shape: 'petal' },
  thunder: { colors: ['#fff6a8', '#ffe14a', '#9fd8ff', '#ffffff'], shape: 'star' },
  ice: { colors: ['#e8fbff', '#9fd8ff', '#5fc0ff', '#ffffff'], shape: 'shard' },
};

export function initFx(cv) {
  canvas = cv;
  c2d = canvas.getContext('2d');
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  addEventListener('resize', resize);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms / fxConf.speed));
const rnd = (a, b) => a + Math.random() * (b - a);

function loop() {
  if (!particles.length) { running = false; c2d.clearRect(0, 0, canvas.width, canvas.height); return; }
  running = true;
  c2d.clearRect(0, 0, canvas.width, canvas.height);
  c2d.save();
  c2d.scale(dpr, dpr);
  const sp = fxConf.speed;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= sp;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * sp;
    p.x += p.vx * sp; p.y += p.vy * sp;
    p.rot += p.vr * sp;
    const a = Math.min(1, p.life / p.fade);
    c2d.globalAlpha = a;
    c2d.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    c2d.fillStyle = p.color;
    c2d.strokeStyle = p.color;
    c2d.save();
    c2d.translate(p.x, p.y);
    c2d.rotate(p.rot);
    if (p.shape === 'shard') {
      c2d.beginPath();
      c2d.moveTo(0, -p.size); c2d.lineTo(p.size * 0.6, p.size * 0.4); c2d.lineTo(-p.size * 0.5, p.size * 0.6);
      c2d.closePath();
      c2d.fill();
      c2d.globalAlpha = a * 0.8; c2d.strokeStyle = '#fff'; c2d.lineWidth = 0.8; c2d.stroke();
    } else if (p.shape === 'rect') {
      c2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.shape === 'ring') {
      const r = p.size + (p.maxLife - p.life) * p.grow;
      c2d.lineWidth = Math.max(0.5, 4 * a);
      c2d.beginPath(); c2d.arc(0, 0, r, 0, Math.PI * 2); c2d.stroke();
    } else if (p.shape === 'crown') {
      const z = p.size;
      c2d.beginPath();
      c2d.moveTo(-z, z * 0.6); c2d.lineTo(-z, -z * 0.3); c2d.lineTo(-z * 0.5, z * 0.1); c2d.lineTo(0, -z * 0.7);
      c2d.lineTo(z * 0.5, z * 0.1); c2d.lineTo(z, -z * 0.3); c2d.lineTo(z, z * 0.6); c2d.closePath();
      c2d.fill();
      c2d.strokeStyle = '#7a4a00'; c2d.lineWidth = 1; c2d.stroke();
    } else if (p.shape === 'petal') {
      c2d.beginPath(); c2d.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2); c2d.fill();
    } else if (p.shape === 'star') {
      c2d.beginPath();
      for (let k = 0; k < 8; k++) {
        const rr = k % 2 ? p.size * 0.35 : p.size;
        const ang = (k * Math.PI) / 4;
        c2d.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      c2d.closePath(); c2d.fill();
    } else {
      c2d.beginPath(); c2d.arc(0, 0, p.size, 0, Math.PI * 2); c2d.fill();
    }
    c2d.restore();
  }
  c2d.restore();
  requestAnimationFrame(loop);
}

function add(p) {
  if (fxConf.reduce && particles.length > 120) return;
  const sk = SKINS[fxConf.skin];
  if (sk && !p.keep) {
    p = { ...p, color: sk.colors[Math.floor(Math.random() * sk.colors.length)] };
    if (sk.shape && (p.shape === undefined || p.shape === 'dot' || p.shape === 'star')) p.shape = sk.shape;
    if (p.shape === 'petal' && !p.g) { p.g = 0.06; p.vr = p.vr || (Math.random() - 0.5) * 0.3; }
    if (fxConf.skin === 'fire' && !p.g) p.g = -0.05; // 火の粉は上へ
  }
  particles.push({
    x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0.96, size: 3, color: '#fff', life: 60, fade: 20, rot: 0, vr: 0, shape: 'dot', add: true, grow: 0,
    ...p,
  });
  particles[particles.length - 1].maxLife = particles[particles.length - 1].life;
  if (!running) requestAnimationFrame(loop);
}

export function center(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }

export function burst(x, y, color = '#fff', n = 30, power = 6) {
  const count = fxConf.reduce ? Math.ceil(n / 3) : n;
  for (let i = 0; i < count; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(power * 0.3, power);
    add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rnd(1.5, 4), color, life: rnd(30, 60), shape: Math.random() < 0.3 ? 'star' : 'dot', vr: rnd(-0.2, 0.2) });
  }
}

export function ring(x, y, color = '#fff', size = 10, grow = 3, life = 30) {
  add({ x, y, size, grow, life, fade: life, color, shape: 'ring', drag: 1 });
}

export function shards(rect, color = '#9fd8ff', n = 26) {
  const count = fxConf.reduce ? 8 : n;
  for (let i = 0; i < count; i++) {
    const x = rnd(rect.left, rect.right), y = rnd(rect.top, rect.bottom);
    const c = center(rect);
    const a = Math.atan2(y - c.y, x - c.x) + rnd(-0.4, 0.4);
    const v = rnd(2, 9);
    add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 0.35, size: rnd(4, 11), color, life: rnd(40, 75), fade: 25, shape: 'shard', vr: rnd(-0.3, 0.3), drag: 0.98, add: false });
  }
  burst(center(rect).x, center(rect).y, '#ffffff', 20, 8);
}

export function sparkle(rect, color = '#fff', n = 14) {
  for (let i = 0; i < n; i++) {
    add({ x: rnd(rect.left, rect.right), y: rnd(rect.top, rect.bottom), vx: rnd(-0.5, 0.5), vy: rnd(-2, -0.5), size: rnd(2, 4.5), color, life: rnd(25, 55), shape: 'star', vr: 0.1 });
  }
}

export function rise(rect, color = '#ff6a3d', n = 30) {
  for (let i = 0; i < n; i++) {
    add({ x: rnd(rect.left, rect.right), y: rnd(rect.top + rect.height * 0.3, rect.bottom), vx: rnd(-0.6, 0.6), vy: rnd(-4, -1.5), size: rnd(2, 5), color, life: rnd(30, 60), drag: 0.98 });
  }
}

export function confetti(n = 160) {
  const colors = ['#ff4d5e', '#ffc531', '#2fbf71', '#2fa8ff', '#8b6cff', '#ffffff'];
  for (let i = 0; i < (fxConf.reduce ? 50 : n); i++) {
    add({ keep: true,
      x: rnd(0, innerWidth), y: rnd(-80, -10), vx: rnd(-1.5, 1.5), vy: rnd(1, 4), g: 0.05, drag: 0.995,
      size: rnd(6, 12), color: colors[i % colors.length], life: rnd(150, 260), fade: 40, shape: 'rect', vr: rnd(-0.2, 0.2), add: false,
    });
  }
}

/** 画面の上から降らせる（王冠・花びら） */
export function fall(width, color = '#ffd45a', n = 10, shape = 'crown') {
  for (let i = 0; i < (fxConf.reduce ? Math.ceil(n / 3) : n); i++) {
    add({ keep: true,
      x: rnd(0, width), y: rnd(-60, -10), vx: rnd(-0.8, 0.8), vy: rnd(2, 4.5), g: 0.04, drag: 0.995,
      size: shape === 'crown' ? rnd(7, 12) : rnd(5, 9), color, life: rnd(110, 170), fade: 30, shape, vr: rnd(-0.08, 0.08), add: false,
    });
  }
}

export function slash(from, to, color = '#fff') {
  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    add({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, size: 2 + 3 * (1 - Math.abs(t - 0.5) * 2), color, life: 18 + i, fade: 12 });
  }
}

// ---------- 画面揺れ ----------
export function shake(el, strength = 'm') {
  if (fxConf.reduce) return;
  el.classList.remove('shake-s', 'shake-m', 'shake-l');
  void el.offsetWidth;
  el.classList.add('shake-' + strength);
  setTimeout(() => el.classList.remove('shake-' + strength), 600);
}

export function flash(color = '#fff', ms = 350) {
  const d = document.createElement('div');
  d.className = 'flash';
  d.style.background = color;
  d.style.animationDuration = ms / fxConf.speed + 'ms';
  document.getElementById('fx-layer').appendChild(d);
  setTimeout(() => d.remove(), ms / fxConf.speed + 50);
}

/** 画面上に文字をポップ表示 */
export function floatText(x, y, text, cls = '') {
  const d = document.createElement('div');
  d.className = 'float-text ' + cls;
  d.textContent = text;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  d.style.animationDuration = 1100 / fxConf.speed + 'ms';
  document.getElementById('fx-layer').appendChild(d);
  setTimeout(() => d.remove(), 1150 / fxConf.speed);
}

/**
 * カットイン演出
 * @param {object} o  { title, sub, color, cls, ms, html }
 */
export async function cutin({ title, sub = '', color = '#ffc531', cls = '', ms = 1300, html = '' }) {
  const d = document.createElement('div');
  d.className = 'cutin ' + cls;
  d.style.setProperty('--ci', color);
  d.style.setProperty('--dur', ms / fxConf.speed + 'ms');
  d.innerHTML = `<div class="cutin-band"><div class="cutin-lines"></div>${html}<div class="cutin-text"><div class="cutin-title">${title}</div>${sub ? `<div class="cutin-sub">${sub}</div>` : ''}</div></div>`;
  document.getElementById('fx-layer').appendChild(d);
  await wait(ms);
  d.remove();
}

/** 要素を一時的にアニメーション（Web Animations API） */
export function animate(el, keyframes, ms, opts = {}) {
  if (!el || !el.animate) return Promise.resolve();
  const a = el.animate(keyframes, { duration: ms / fxConf.speed, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none', ...opts });
  return a.finished.catch(() => {});
}
