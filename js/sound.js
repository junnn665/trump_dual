// =========================================================
//  効果音・BGM（Web Audio で合成。音声ファイル不要）
// =========================================================
let ctx = null;
let master = null, sfxBus = null, bgmBus = null;
const state = { sfx: true, bgm: true, bgmTimer: null, step: 0, nextTime: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  bgmBus = ctx.createGain(); bgmBus.gain.value = 0.22; bgmBus.connect(master);
}

export function setSfx(on) { state.sfx = on; }
export function setBgm(on) {
  state.bgm = on;
  if (on) startBgm(); else stopBgm();
}

function tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.2, vol = 0.3, attack = 0.005, bus = sfxBus }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); g.connect(bus);
  o.start(now); o.stop(now + dur + 0.05);
}

let noiseBuf = null;
function noise({ t = 0, dur = 0.3, vol = 0.3, filter = 2000, q = 1, type = 'lowpass', sweep = null }) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const now = ctx.currentTime + t;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filter, now); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(now); src.stop(now + dur + 0.05);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDIノート→周波数

export const sfx = {
  click() { if (!state.sfx) return; tone({ f: 900, f2: 1200, type: 'triangle', dur: 0.06, vol: 0.15 }); },
  draw() { if (!state.sfx) return; noise({ dur: 0.12, vol: 0.25, filter: 3000, type: 'bandpass', sweep: 6000 }); tone({ f: 700, f2: 1100, type: 'sine', dur: 0.08, vol: 0.08 }); },
  charge() { if (!state.sfx) return; [72, 79, 84].forEach((n, i) => tone({ f: N(n), type: 'triangle', t: i * 0.05, dur: 0.35, vol: 0.12 })); },
  summon() {
    if (!state.sfx) return;
    tone({ f: 180, f2: 720, type: 'sawtooth', dur: 0.35, vol: 0.12 });
    noise({ dur: 0.4, vol: 0.18, filter: 400, sweep: 5000, type: 'bandpass' });
    [67, 71, 74].forEach((n, i) => tone({ f: N(n), type: 'triangle', t: 0.18 + i * 0.04, dur: 0.4, vol: 0.1 }));
  },
  bigSummon() {
    if (!state.sfx) return;
    tone({ f: 55, f2: 40, type: 'sine', dur: 1.2, vol: 0.5, attack: 0.01 });
    noise({ dur: 1.0, vol: 0.35, filter: 200, sweep: 8000, type: 'bandpass', q: 0.7 });
    [55, 62, 67, 71, 74, 79].forEach((n, i) => tone({ f: N(n), type: 'sawtooth', t: 0.25 + i * 0.06, dur: 0.9, vol: 0.06 }));
  },
  spell() {
    if (!state.sfx) return;
    [84, 88, 91, 96].forEach((n, i) => tone({ f: N(n), type: 'sine', t: i * 0.06, dur: 0.5, vol: 0.1 }));
    noise({ dur: 0.6, vol: 0.12, filter: 6000, type: 'highpass' });
  },
  attack() { if (!state.sfx) return; noise({ dur: 0.25, vol: 0.4, filter: 800, sweep: 4000, type: 'bandpass', q: 2 }); tone({ f: 300, f2: 90, type: 'square', dur: 0.2, vol: 0.06 }); },
  clash() {
    if (!state.sfx) return;
    noise({ dur: 0.5, vol: 0.5, filter: 1500, type: 'lowpass' });
    tone({ f: 120, f2: 50, type: 'sine', dur: 0.5, vol: 0.5 });
    tone({ f: 2400, f2: 1800, type: 'square', dur: 0.15, vol: 0.05 });
  },
  destroy() { if (!state.sfx) return; noise({ dur: 0.6, vol: 0.35, filter: 3000, sweep: 200 }); tone({ f: 400, f2: 60, type: 'sawtooth', dur: 0.5, vol: 0.08 }); },
  shieldBreak() {
    if (!state.sfx) return;
    noise({ dur: 0.7, vol: 0.5, filter: 5000, type: 'highpass' });
    for (let i = 0; i < 7; i++) tone({ f: 2000 + Math.random() * 3000, type: 'sine', t: Math.random() * 0.25, dur: 0.25, vol: 0.06 });
    tone({ f: 90, f2: 40, type: 'sine', dur: 0.4, vol: 0.45 });
  },
  trigger() {
    if (!state.sfx) return;
    [72, 76, 79, 84, 88, 91].forEach((n, i) => tone({ f: N(n), type: 'square', t: i * 0.07, dur: 0.3, vol: 0.07 }));
    tone({ f: N(96), type: 'triangle', t: 0.45, dur: 1.0, vol: 0.12 });
  },
  block() { if (!state.sfx) return; tone({ f: 220, type: 'square', dur: 0.12, vol: 0.12 }); tone({ f: 330, type: 'square', t: 0.08, dur: 0.2, vol: 0.12 }); noise({ dur: 0.2, vol: 0.2, filter: 1200 }); },
  turn() { if (!state.sfx) return; [67, 74].forEach((n, i) => tone({ f: N(n), type: 'triangle', t: i * 0.1, dur: 0.35, vol: 0.12 })); },
  error() { if (!state.sfx) return; tone({ f: 160, type: 'square', dur: 0.15, vol: 0.08 }); },
  direct() {
    if (!state.sfx) return;
    noise({ dur: 1.5, vol: 0.6, filter: 100, sweep: 9000, type: 'bandpass', q: 0.5 });
    tone({ f: 40, f2: 30, type: 'sine', dur: 1.8, vol: 0.6 });
    [48, 55, 60, 64, 67].forEach((n) => tone({ f: N(n), type: 'sawtooth', t: 0.3, dur: 1.5, vol: 0.06 }));
  },
  win() {
    if (!state.sfx) return;
    const seq = [72, 72, 72, 76, 79, 77, 76, 84];
    seq.forEach((n, i) => tone({ f: N(n), type: 'square', t: i * 0.13, dur: 0.25, vol: 0.08 }));
    [60, 64, 67, 72].forEach((n) => tone({ f: N(n), type: 'triangle', t: 1.05, dur: 1.4, vol: 0.1 }));
  },
  lose() {
    if (!state.sfx) return;
    [67, 63, 60, 55].forEach((n, i) => tone({ f: N(n), type: 'triangle', t: i * 0.28, dur: 0.5, vol: 0.12 }));
  },
  coin() { if (!state.sfx) return; for (let i = 0; i < 8; i++) tone({ f: 1800 + (i % 2) * 400, type: 'sine', t: i * 0.08, dur: 0.06, vol: 0.06 }); },
};

// ---------------- BGM（簡易シーケンサ） ----------------
const BASS = [45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 43, 40, 40, 47, 52];
const ARP = [69, 72, 76, 72, 65, 69, 72, 69, 67, 71, 74, 71, 64, 68, 71, 76];

function startBgm() {
  if (!ctx || !state.bgm || state.bgmTimer) return;
  state.nextTime = ctx.currentTime + 0.1;
  state.bgmTimer = setInterval(scheduler, 50);
}
function stopBgm() {
  clearInterval(state.bgmTimer);
  state.bgmTimer = null;
}
function scheduler() {
  const stepDur = 0.2;
  while (state.nextTime < ctx.currentTime + 0.25) {
    const i = state.step % 16;
    const bar = Math.floor(state.step / 16) % 4;
    const t = state.nextTime - ctx.currentTime;
    if (i % 2 === 0) tone({ f: N(BASS[(i + bar * 4) % 16] - 12), type: 'triangle', t, dur: 0.35, vol: 0.5, bus: bgmBus });
    tone({ f: N(ARP[(i + bar * 4) % 16] + (bar === 3 ? 2 : 0)), type: 'square', t, dur: 0.12, vol: 0.09, bus: bgmBus });
    if (i % 4 === 0) {
      // キック
      const now = ctx.currentTime + t;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      g.gain.setValueAtTime(0.6, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.connect(g); g.connect(bgmBus); o.start(now); o.stop(now + 0.2);
    }
    state.nextTime += stepDur;
    state.step++;
  }
}

export function ensureBgm() { if (state.bgm) startBgm(); }
