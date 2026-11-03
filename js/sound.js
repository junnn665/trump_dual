// =========================================================
//  効果音・BGM（Web Audio で合成。音声ファイル不要）
// =========================================================
let ctx = null;
let master = null, sfxBus = null, bgmBus = null;
const state = { sfx: true, bgm: true, bgmTimer: null, step: 0, nextTime: 0, sfxVol: 0.8, bgmVol: 0.6, track: 'title', nextTrack: null, theme: 'standard' };

/** 効果音のテーマ：standard（標準）／ chip（8bit）／ wa（和風）／ sf（SF） */
export function setSfxTheme(t) { state.theme = ['standard', 'chip', 'wa', 'sf'].includes(t) ? t : 'standard'; }

// 和風：都節（みやこぶし）の音階に寄せる（半音の位置 0,1,5,7,8）
const WA_SCALE = [0, 1, 5, 7, 8];
const toMidi = (f) => 69 + 12 * Math.log2(f / 440);
const fromMidi = (m) => 440 * Math.pow(2, (m - 69) / 12);
function snap(f, scale) {
  const m = Math.round(toMidi(f));
  const pc = ((m % 12) + 12) % 12;
  let best = scale[0], dist = 99;
  for (const s of scale) { const d = Math.min(Math.abs(s - pc), 12 - Math.abs(s - pc)); if (d < dist) { dist = d; best = s; } }
  let target = m - pc + best;
  if (target - m > 6) target -= 12;
  if (m - target > 6) target += 12;
  return fromMidi(target);
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1.1 * state.sfxVol; sfxBus.connect(master);
  bgmBus = ctx.createGain(); bgmBus.gain.value = 0.36 * state.bgmVol; bgmBus.connect(master);
}

export function setSfx(on) { state.sfx = on; }

/** 音量（0〜1）。0 にすると OFF と同じ */
export function setVolume(sfxVol, bgmVol) {
  state.sfxVol = sfxVol;
  state.bgmVol = bgmVol;
  state.sfx = sfxVol > 0;
  if (sfxBus) sfxBus.gain.setTargetAtTime(1.1 * sfxVol, ctx.currentTime, 0.05);
  if (bgmBus) bgmBus.gain.setTargetAtTime(0.36 * bgmVol, ctx.currentTime, 0.05);
  setBgm(bgmVol > 0);
}

/** BGM の曲を切りかえる（小節の頭で切りかわる）: title / battle / pinch / boss */
export function setTrack(name) {
  if (!TRACKS[name] || state.track === name) { state.nextTrack = null; return; }
  state.nextTrack = name;
}
export function setBgm(on) {
  state.bgm = on;
  if (on) startBgm(); else stopBgm();
}

function tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.2, vol = 0.3, attack = 0.005, bus = sfxBus }) {
  if (!ctx) return;
  // 効果音だけテーマで音色を変える（BGMはそのまま）
  if (bus === sfxBus && state.theme !== 'standard') {
    if (state.theme === 'chip') {
      type = 'square';
      f = fromMidi(Math.round(toMidi(f)));
      if (f2) f2 = fromMidi(Math.round(toMidi(f2)));
      vol *= 0.7;
    } else if (state.theme === 'wa') {
      type = 'triangle';
      f = snap(f, WA_SCALE);
      if (f2) f2 = snap(f2, WA_SCALE);
      dur *= 1.4; // 琴のように余韻を長く
      // はじく感じの短い高音を重ねる
      if (f < 2000) tone({ f: f * 2, type: 'sine', t, dur: Math.min(0.12, dur), vol: vol * 0.35, attack: 0.002, bus: null });
    } else if (state.theme === 'sf') {
      type = 'sine';
      if (!f2) f2 = f * 1.5;
      // 少しずらした音を重ねてうなりを出す
      tone({ f: f * 1.01, f2: f2 * 1.01, type: 'sawtooth', t, dur, vol: vol * 0.25, attack, bus: null });
    }
  }
  if (bus === null) bus = sfxBus;
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
  hand() {
    if (!state.sfx) return;
    [76, 79, 83, 88].forEach((n, i) => tone({ f: N(n), type: 'triangle', t: i * 0.06, dur: 0.35, vol: 0.11 }));
  },
  royalNote(i) { if (!state.sfx) return; tone({ f: N([72, 76, 79, 84, 88][i]), type: 'square', dur: 0.4, vol: 0.09 }); tone({ f: N([72, 76, 79, 84, 88][i] + 12), type: 'sine', dur: 0.6, vol: 0.06 }); },
  royal() {
    if (!state.sfx) return;
    tone({ f: 50, f2: 35, type: 'sine', dur: 2, vol: 0.6 });
    noise({ dur: 1.6, vol: 0.4, filter: 150, sweep: 9000, type: 'bandpass', q: 0.5 });
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone({ f: N(n), type: 'sawtooth', t: 0.2 + i * 0.05, dur: 2.2, vol: 0.05 }));
    [84, 88, 91, 96].forEach((n, i) => tone({ f: N(n), type: 'triangle', t: 0.9 + i * 0.12, dur: 1.2, vol: 0.08 }));
  },
  king() {
    if (!state.sfx) return;
    this.bigSummon();
    [67, 67, 67, 72, 76, 79].forEach((n, i) => tone({ f: N(n), type: 'square', t: 0.3 + i * (i < 3 ? 0.12 : 0.16), dur: 0.3, vol: 0.07 }));
    tone({ f: N(84), type: 'triangle', t: 1.2, dur: 0.9, vol: 0.1 });
  },
  ace() {
    if (!state.sfx) return;
    this.bigSummon();
    noise({ t: 0.35, dur: 1.2, vol: 0.5, filter: 300, sweep: 90, type: 'lowpass', q: 4 }); // 咆哮
    tone({ f: 110, f2: 55, type: 'sawtooth', t: 0.35, dur: 1.1, vol: 0.12 });
    tone({ f: 165, f2: 70, type: 'sawtooth', t: 0.4, dur: 1.0, vol: 0.08 });
  },
  queen() {
    if (!state.sfx) return;
    this.bigSummon();
    [79, 83, 86, 91, 95, 98].forEach((n, i) => tone({ f: N(n), type: 'sine', t: 0.3 + i * 0.07, dur: 0.6, vol: 0.08 }));
  },
  joker() {
    if (!state.sfx) return;
    this.bigSummon();
    [72, 76, 72, 76, 79, 84, 79, 88].forEach((n, i) => tone({ f: N(n), type: 'square', t: 0.3 + i * 0.09, dur: 0.12, vol: 0.07 }));
    [0, 1, 2].forEach((i) => tone({ f: 600 - i * 80, f2: 300 - i * 40, type: 'triangle', t: 1.1 + i * 0.16, dur: 0.14, vol: 0.09 })); // ハハハ
  },
  coin() { if (!state.sfx) return; for (let i = 0; i < 8; i++) tone({ f: 1800 + (i % 2) * 400, type: 'sine', t: i * 0.08, dur: 0.06, vol: 0.06 }); },
};

// ---------------- BGM（簡易シーケンサ・4曲） ----------------
// bass/arp は16ステップ×4小節でくり返す。数字は MIDI ノート（0 は休み）
const TRACKS = {
  // タイトル：ゆったり明るい
  title: {
    step: 0.24, kick: [0, 8], hat: false, lead: 'triangle', arpVol: 0.07,
    bass: [48, 0, 55, 0, 45, 0, 52, 0, 41, 0, 48, 0, 43, 0, 50, 0],
    arp: [72, 76, 79, 76, 69, 72, 76, 72, 65, 69, 72, 69, 67, 71, 74, 71],
    shift: [0, 0, 0, 0],
  },
  // 通常バトル：ノリのいい短調
  battle: {
    step: 0.2, kick: [0, 4, 8, 12], hat: true, lead: 'square', arpVol: 0.09,
    bass: [45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 43, 40, 40, 47, 52],
    arp: [69, 72, 76, 72, 65, 69, 72, 69, 67, 71, 74, 71, 64, 68, 71, 76],
    shift: [0, 0, 0, 2],
  },
  // ピンチ：シールド残りわずか。速くて不安
  pinch: {
    step: 0.15, kick: [0, 3, 6, 8, 11, 14], hat: true, lead: 'sawtooth', arpVol: 0.06,
    bass: [40, 40, 52, 40, 41, 41, 53, 41, 40, 40, 52, 40, 39, 39, 51, 47],
    arp: [76, 75, 76, 79, 77, 76, 77, 81, 76, 75, 76, 79, 75, 74, 75, 71],
    shift: [0, 1, 0, -1],
  },
  // ボス戦（チャレンジ）：重く荘厳
  boss: {
    step: 0.22, kick: [0, 6, 8, 14], hat: true, lead: 'sawtooth', arpVol: 0.06,
    bass: [38, 38, 38, 45, 46, 46, 46, 41, 38, 38, 38, 45, 44, 44, 43, 41],
    arp: [74, 77, 81, 77, 74, 77, 82, 77, 74, 77, 81, 77, 73, 76, 79, 76],
    shift: [0, 0, -2, 1],
  },
};

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
  while (state.nextTime < ctx.currentTime + 0.25) {
    const i = state.step % 16;
    // 小節の頭で曲を切りかえる
    if (i === 0 && state.nextTrack) { state.track = state.nextTrack; state.nextTrack = null; }
    const T = TRACKS[state.track];
    const bar = Math.floor(state.step / 16) % 4;
    const t = state.nextTime - ctx.currentTime;
    const sh = T.shift[bar];
    const b = T.bass[i];
    if (b && i % 2 === 0) tone({ f: N(b - 12 + sh), type: 'triangle', t, dur: T.step * 1.7, vol: 0.5, bus: bgmBus });
    const a = T.arp[i];
    if (a) tone({ f: N(a + sh), type: T.lead, t, dur: T.step * 0.6, vol: T.arpVol, bus: bgmBus });
    if (T.kick.includes(i)) {
      const now = ctx.currentTime + t;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      g.gain.setValueAtTime(0.6, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.connect(g); g.connect(bgmBus); o.start(now); o.stop(now + 0.2);
    }
    if (T.hat && i % 2 === 1) {
      const now = ctx.currentTime + t;
      if (!noiseBuf) noise({ dur: 0.01, vol: 0.0001 });
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      src.connect(f); f.connect(g); g.connect(bgmBus); src.start(now); src.stop(now + 0.06);
    }
    state.nextTime += T.step;
    state.step++;
  }
}

export function ensureBgm() { if (state.bgm) startBgm(); }
