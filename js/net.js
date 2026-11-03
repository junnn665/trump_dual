// =========================================================
//  オンライン対戦（Firebase Realtime Database）
//  都道府県ゲーム（prefpack）と同じしくみ・同じデータベースを使う
//
//  rooms/duel-<4ケタ>
//    game: "duel", created, host, state: "lobby" | "playing", round, seed, seats: { s0, s1 }
//    players/<pid>: name, joined, online, spec
//    ev/<id>: type: "stamp", from, name, stamp, t
//    surrender: { round, seat }
//  rooms/duel-<4ケタ>-m
//    created, r<回>/m00000 …   ← 対戦の手順（両方の端末で同じ順に再生する）
// =========================================================
import { Game } from './engine.js';
import { seededRng } from './cards.js';
import { SeatController } from './controllers.js';
import { MoveStream } from './stream.js';
import { sfx, setTrack } from './sound.js';
import { activeDeck } from './deck.js';
import { validDeck } from './cards.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyARjb_t0hEpQKM_6Wmbzl_H7z-e7rMcKjY',
  authDomain: 'odeko-ddb38.firebaseapp.com',
  databaseURL: 'https://odeko-ddb38-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'odeko-ddb38',
  storageBucket: 'odeko-ddb38.firebasestorage.app',
  messagingSenderId: '310865503380',
  appId: '1:310865503380:web:fb1c2b173cb6fbee70c081',
};
const FIREBASE_VER = '10.12.2';
const KEY = (c) => `rooms/duel-${c}`;
const MKEY = (c) => `rooms/duel-${c}-m`;
const ROOM_TTL = 24 * 60 * 60 * 1000;
const RANK = 'rooms/duel-ranking';   // レート：rooms/duel-ranking/<pid> = { name, rating, w, l, t, last }
const START_RATING = 1500;
const K_FACTOR = 32;
const STAMPS = ['👍', '😂', '😱', '🔥', '🙏', 'ナイス！', 'うわー', 'まだまだ！'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できない環境 */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* 無視 */ } },
};

// 端末ごとのID（同じ端末なら再読みこみしても同じ人として戻れる）
const PID = (() => {
  const q = new URLSearchParams(location.search).get('pid'); // テスト用
  if (q) return q;
  let p = ls.get('td_pid');
  if (!p) { p = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); ls.set('td_pid', p); }
  return p;
})();
const myName = () => ls.get('td_name') || '';
const saveName = (v) => ls.set('td_name', v);

// ---------------- 通信 ----------------
let NET = null;
let netPromise = null;
let connected = true;

function loadScript(src) {
  return new Promise((ok, ng) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = ng;
    document.head.appendChild(s);
  });
}

function firebaseNet() {
  const fb = window.firebase;
  if (!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
  const db = fb.database();
  let offset = 0;
  db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
  return {
    on(path, cb) { const r = db.ref(path), h = (s) => cb(s.val()); r.on('value', h); return () => r.off('value', h); },
    onChild(path, cb) { const r = db.ref(path), h = (s) => cb(s.key, s.val()); r.on('child_added', h); return () => r.off('child_added', h); },
    get(path) { return db.ref(path).once('value').then((s) => s.val()); },
    set(path, v) { return db.ref(path).set(v); },
    update(path, v) { return db.ref(path).update(v); },
    remove(path) { return db.ref(path).remove(); },
    tx(path, fn) { return db.ref(path).transaction(fn).then((r) => ({ committed: r.committed, val: r.snapshot.val() })); },
    now() { return Date.now() + offset; },
    onConnected(cb) { db.ref('.info/connected').on('value', (s) => cb(!!s.val())); },
    onDisconnectSet(path, v) { return db.ref(path).onDisconnect().set(v); },
    cancelDisconnect(path) { return db.ref(path).onDisconnect().cancel(); },
    // 作ってから時間がたった対戦部屋（duel- で始まるもの）だけを消す
    cleanOld(cutoff) {
      return db.ref('rooms').orderByChild('created').endAt(cutoff).limitToFirst(30).once('value').then((snap) => {
        const jobs = [];
        snap.forEach((c) => {
          const v = c.val();
          if (String(c.key).startsWith('duel-') && v && v.created && v.created <= cutoff) jobs.push(c.ref.remove());
        });
        return Promise.all(jobs);
      });
    },
  };
}

function ensureNet() {
  if (NET) return Promise.resolve(true);
  const override = window.NET_OVERRIDE || (window.parent !== window && window.parent.FAKE_NET && window.parent.FAKE_NET.client(PID));
  if (override) { NET = override; NET.onConnected((ok) => { connected = ok; }); return Promise.resolve(true); }
  if (!netPromise) {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/`;
    const timeout = new Promise((_, ng) => setTimeout(() => ng(new Error('timeout')), 10000));
    netPromise = Promise.race([loadScript(base + 'firebase-app-compat.js').then(() => loadScript(base + 'firebase-database-compat.js')), timeout])
      .then(() => {
        NET = firebaseNet();
        NET.onConnected((ok) => {
          const was = connected;
          connected = ok;
          if (online && online.code && was && !ok) online.app.ui.toast('通信が切れています…');
        });
        return true;
      })
      .catch(() => { netPromise = null; return false; });
  }
  return netPromise;
}

function netError(e) {
  console.warn(e);
  const msg = String((e && (e.code || e.message)) || e);
  if (/permission/i.test(msg)) return 'データベースに書きこめませんでした（Firebase のルール設定を確認してね）';
  return '通信できませんでした。電波のよい所でもう一度ためしてね';
}

// =========================================================
let online = null;

export class Online {
  constructor(app) {
    this.app = app;
    this.code = null;
    this.R = null;
    this.unsub = null;
    this.round = -1;      // 遊んでいる回
    this.game = null;
    this.stream = null;
    this.seat = null;
    this.seenEv = new Set();
    this.joinedAt = 0;
    online = this;
    this.bind();
    this.entry();
  }

  // ---------- 部屋の状態 ----------
  me() { return (this.R && this.R.players && this.R.players[PID]) || null; }
  isHost() { return !!this.R && this.R.host === PID; }
  inviteUrl() { return `${location.origin}${location.pathname}?room=${this.code}`; }
  seatOfPid(pid) {
    const s = (this.R && this.R.seats) || {};
    return s.s0 === pid ? 0 : s.s1 === pid ? 1 : null;
  }

  msg(id, text, info) {
    const el = $(id);
    el.textContent = text || '';
    el.classList.toggle('info', !!info);
  }

  showPanel(id) {
    for (const p of ['menu-main', 'menu-cpu', 'menu-online', 'mp-create', 'mp-join', 'menu-challenge']) $(p).classList.toggle('hidden', p !== id);
    if (id === 'menu-online') this.showMyRating();
  }

  showScreen(id) {
    for (const s of ['title', 'lobby', 'game']) $(s).classList.toggle('active', s === id);
  }

  // ---------- 画面の操作 ----------
  bind() {
    const click = (id, f) => $(id).addEventListener('click', (e) => { sfx.click(); f(e); });
    click('mp-create-open', () => { $('mp-name-c').value = myName(); this.msg('mp-create-msg', ''); this.showPanel('mp-create'); ensureNet(); });
    click('mp-join-open', () => this.openJoin(''));
    click('mp-rank-open', () => this.openRanking());
    document.querySelectorAll('[data-online-back]').forEach((b) => b.addEventListener('click', () => { sfx.click(); this.showPanel('menu-online'); }));
    $('mp-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
    click('mp-create-go', (e) => this.busy(e.currentTarget, () => this.createRoom()));
    click('mp-join-go', (e) => this.busy(e.currentTarget, () => this.joinRoom(false)));
    click('mp-join-watch', (e) => this.busy(e.currentTarget, () => this.joinRoom(true)));
    click('mp-start', (e) => this.busy(e.currentTarget, () => this.startRound()));
    click('mp-leave', () => this.leave());
    click('mp-share', () => this.share());
    click('mp-spec', () => {
      if (!this.R || this.isHost()) return;
      NET.update(`${KEY(this.code)}/players/${PID}`, { spec: this.me() && this.me().spec ? null : true }).catch(() => {});
    });
    // スタンプ
    $('stamp-bar').innerHTML = STAMPS.map((s) => `<button data-stamp="${esc(s)}">${esc(s)}</button>`).join('');
    click('btn-stamp', () => $('stamp-bar').classList.toggle('hidden'));
    $('stamp-bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-stamp]');
      if (!b) return;
      sfx.click();
      this.sendStamp(b.dataset.stamp);
      $('stamp-bar').classList.add('hidden');
    });
  }

  async busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; }
  }

  openJoin(code) {
    this.showScreen('title');
    $('mp-code').value = code || '';
    $('mp-name-j').value = myName();
    this.msg('mp-join-msg', '');
    this.showPanel('mp-join');
    ensureNet();
  }

  /** 招待リンク・再読みこみからの入り口 */
  entry() {
    const params = new URLSearchParams(location.search);
    const invite = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
    if (/^\d{4}$/.test(invite)) {
      const keep = params.get('pid') ? `?pid=${params.get('pid')}` : '';
      history.replaceState(null, '', location.pathname + keep);
      this.openJoin(invite);
    } else if (ss.get('td_room')) {
      const c = ss.get('td_room');
      ensureNet().then(async (ok) => {
        if (!ok) return;
        try {
          const room = await NET.get(KEY(c));
          if (room && room.game === 'duel' && room.players && room.players[PID]) {
            await NET.update(`${KEY(c)}/players/${PID}`, { online: true });
            await this.enterRoom(c);
          } else ss.set('td_room', null);
        } catch { /* 無視 */ }
      });
    }
  }

  // ---------- 部屋を作る・入る ----------
  async createRoom() {
    const name = $('mp-name-c').value.trim().slice(0, 10);
    if (!name) { this.msg('mp-create-msg', 'なまえを入れてね'); return; }
    saveName(name);
    this.msg('mp-create-msg', 'つないでいます…', true);
    if (!(await ensureNet())) { this.msg('mp-create-msg', netError('timeout')); return; }
    try {
      if (NET.cleanOld) NET.cleanOld(NET.now() - ROOM_TTL).catch(() => {});
      for (let i = 0; i < 12; i++) {
        const c = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const t = NET.now();
        const room = {
          game: 'duel', created: t, host: PID, state: 'lobby', round: 0,
          players: { [PID]: { name, joined: t, online: true } },
        };
        const r = await NET.tx(KEY(c), (cur) => (cur ? undefined : room));
        if (r.committed) {
          await NET.set(MKEY(c), { created: t });
          await this.enterRoom(c);
          return;
        }
      }
      this.msg('mp-create-msg', '部屋を作れませんでした。もう一度ためしてね');
    } catch (err) { this.msg('mp-create-msg', netError(err)); }
  }

  async joinRoom(spec) {
    const c = $('mp-code').value.trim();
    const name = $('mp-name-j').value.trim().slice(0, 10);
    if (!/^\d{4}$/.test(c)) { this.msg('mp-join-msg', '4ケタの部屋番号を入れてね'); return; }
    if (!name) { this.msg('mp-join-msg', 'なまえを入れてね'); return; }
    saveName(name);
    this.msg('mp-join-msg', 'さがしています…', true);
    if (!(await ensureNet())) { this.msg('mp-join-msg', netError('timeout')); return; }
    try {
      const room = await NET.get(KEY(c));
      if (!room || room.game !== 'duel') { this.msg('mp-join-msg', 'その番号の部屋は見つかりませんでした'); return; }
      const prev = room.players && room.players[PID];
      await NET.update(`${KEY(c)}/players/${PID}`, { name, joined: prev && prev.joined ? prev.joined : NET.now(), online: true, spec: spec ? true : null });
      await this.enterRoom(c);
    } catch (err) { this.msg('mp-join-msg', netError(err)); }
  }

  async enterRoom(c) {
    this.code = c;
    this.R = null;
    this.round = -1;
    this.seenEv = new Set();
    this.joinedAt = NET.now() - 2000;
    this.qrFor = null;
    ss.set('td_room', c);
    try { NET.onDisconnectSet(`${KEY(c)}/players/${PID}/online`, false); } catch { /* 無視 */ }
    if (this.unsub) this.unsub();
    this.unsub = NET.on(KEY(c), (v) => this.onRoom(v));
    this.showScreen('lobby');
    setTrack('title');
    $('lobby-msg').textContent = 'つないでいます…';
  }

  // ---------- 部屋の更新 ----------
  onRoom(v) {
    if (this.code == null) return;
    if (!v || v.game !== 'duel') { this.leaveLocal('部屋がなくなりました'); return; }
    const prevR = this.R;
    this.R = v;
    const mine = this.me();
    if (!mine) {
      NET.update(`${KEY(this.code)}/players/${PID}`, { name: myName() || 'ゲスト', joined: NET.now(), online: true, spec: true }).catch(() => {});
      return;
    }
    if (mine.online === false && connected) NET.set(`${KEY(this.code)}/players/${PID}/online`, true).catch(() => {});
    // マイデッキを部屋に登録（対戦開始時に相手の端末でも同じデッキを作るため）
    const deck = activeDeck();
    if (v.state !== 'playing' && JSON.stringify(mine.deck || null) !== JSON.stringify(deck)) NET.set(`${KEY(this.code)}/players/${PID}/deck`, deck).catch(() => {});
    this.maybeTakeHost();
    this.handleEvents();

    if (v.state === 'playing' && v.seats) {
      if (this.round !== v.round) this.startGame(v);
      else this.watchPlayers(prevR);
    } else {
      if (this.game) this.stopGame();
      this.round = -1;
      document.querySelectorAll('.result').forEach((d) => d.remove());
      this.renderLobby();
      if (!$('lobby').classList.contains('active')) this.showScreen('lobby');
    }
  }

  // ホストがいなくなったら、いちばん早く入った人がホストになる
  maybeTakeHost() {
    const ps = this.R.players || {};
    const h = ps[this.R.host];
    if (h && h.online !== false) return;
    const cands = Object.entries(ps).filter(([, p]) => p && p.online !== false).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
    if (cands.length && cands[0][0] === PID) {
      const old = this.R.host;
      NET.tx(`${KEY(this.code)}/host`, (cur) => (cur === old || cur == null ? PID : undefined)).catch(() => {});
    }
  }

  // ---------- 待合室 ----------
  renderLobby() {
    const R = this.R;
    $('mp-tiles').innerHTML = this.code.split('').map((d) => `<div class="tile">${d}</div>`).join('');
    if (this.qrFor !== this.code) {
      this.qrFor = this.code;
      try {
        const q = window.qrcode(0, 'M');
        q.addData(this.inviteUrl());
        q.make();
        $('mp-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
      } catch { $('mp-qr').innerHTML = ''; }
    }
    const ps = Object.entries(R.players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
    $('mp-players').innerHTML = ps.map(([id, p]) => {
      const tags = [];
      if (id === R.host) tags.push('ホスト');
      if (p.spec) tags.push('👀 観戦');
      if (p.online === false) tags.push('通信切れ');
      tags.push(validDeck(p.deck) ? 'マイデッキ' : '標準デッキ');
      return `<li class="${p.online === false ? 'off' : ''}"><span class="dot"></span>${esc(p.name)}${id === PID ? '（あなた）' : ''}<span class="tag">${esc(tags.join('・'))}</span></li>`;
    }).join('');
    const fighters = ps.filter(([, p]) => p.online !== false && !p.spec);
    const start = $('mp-start');
    const spec = $('mp-spec');
    spec.classList.toggle('hidden', this.isHost());
    spec.textContent = this.me() && this.me().spec ? '⚔ 対戦する側にもどる' : '👀 観戦にまわる';
    if (this.isHost()) {
      start.classList.remove('hidden');
      start.disabled = fighters.length < 2;
      this.msg('lobby-msg', fighters.length < 2 ? '対戦相手が入ってくるのを待っています…' : fighters.length > 2
        ? `${fighters.length}人います。先に入った2人が対戦し、ほかの人は観戦になります`
        : '2人そろいました！「対戦スタート」を押そう', true);
    } else {
      start.classList.add('hidden');
      this.msg('lobby-msg', 'ホストが対戦をスタートするのを待っています…', true);
    }
  }

  async share() {
    const url = this.inviteUrl();
    const text = `トランプ・デュエルで対戦しよう！ 部屋番号 ${this.code}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'トランプ・デュエル', text, url }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); this.app.ui.toast('招待リンクをコピーしました'); } catch { prompt('このリンクを送ってね', url); }
  }

  // ---------- 対戦の開始（ホスト） ----------
  async startRound() {
    if (!this.isHost() || !this.R) return;
    const ps = Object.entries(this.R.players || {})
      .filter(([, p]) => p && p.online !== false && !p.spec)
      .sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
    const host = ps.find(([id]) => id === PID);
    const other = ps.find(([id]) => id !== PID);
    if (!host || !other) { this.app.ui.toast('対戦相手がいません'); return; }
    const round = (this.R.round || 0) + 1;
    try {
      await NET.update(KEY(this.code), {
        state: 'playing', round, seed: Math.random().toString(36).slice(2, 12),
        seats: { s0: PID, s1: other[0] }, surrender: null, startAt: NET.now(),
        // 対戦に使うデッキを、スタートと同時に確定させる（両方の端末が必ず同じデッキで始めるため）
        decks: { s0: validDeck(host[1].deck) ? host[1].deck : null, s1: validDeck(other[1].deck) ? other[1].deck : null },
      });
      NET.remove(`${MKEY(this.code)}/r${round - 1}`).catch(() => {});
    } catch (err) { this.app.ui.toast(netError(err)); }
  }

  /** 結果画面の「もう一回」（ホスト）：同じ2人で次の回へ。相手がいなければ待合室へ */
  async again() {
    if (!this.isHost() || !this.R) return;
    const ps = this.R.players || {};
    const opp = Object.entries(ps).find(([id, p]) => id !== PID && p && p.online !== false && !p.spec);
    if (!opp) {
      await NET.update(KEY(this.code), { state: 'lobby' }).catch(() => {});
      this.app.ui.toast('相手がいないので待合室にもどります');
      return;
    }
    await this.startRound();
  }

  // ---------- 対戦 ----------
  async startGame(v) {
    const round = v.round;
    this.round = round;
    this.stopGame();
    document.querySelectorAll('.result').forEach((d) => d.remove());
    const ps = v.players || {};
    const seat = v.seats.s0 === PID ? 0 : v.seats.s1 === PID ? 1 : null;
    this.seat = seat;
    const spectator = seat === null;
    const names = [0, 1].map((i) => (ps[v.seats['s' + i]] || {}).name || `プレイヤー${i + 1}`);
    if (!spectator) names[seat] = `${names[seat]}`;
    const stream = await MoveStream.load(NET, `${MKEY(this.code)}/r${round}`);
    if (this.round !== round || this.code == null) { stream.close(); return; }
    this.stream = stream;
    const ui = this.app.ui;
    stream.onDesync = () => ui.toast('通信のずれが起きました。部屋に入り直してね');
    stream.onError = (e) => ui.toast(netError(e));
    const controllers = [0, 1].map((i) => new SeatController({ ui, stream, local: i === seat }));
    let game;
    let wasReplaying = stream.replaying;
    const relay = {
      event: (t, d) => {
        if (this.game !== game) return Promise.resolve();
        if (stream.replaying) { if (t === 'log') ui.addLog(d.msg, d.pi); return Promise.resolve(); }
        if (wasReplaying) { wasReplaying = false; ui.render({ flip: false }); }
        return ui.event(t, d);
      },
    };
    const setup = [0, 1].map((i) => {
      const deck = v.decks ? v.decks['s' + i] : (ps[v.seats['s' + i]] || {}).deck;
      return validDeck(deck) ? { deck: { list: deck } } : {};
    });
    game = new Game({ controllers, names, ui: relay, rng: seededRng(v.seed), setup });
    this.game = game;
    if (spectator) ui.toast('観戦中です（次の回から対戦に参加できます）');
    const gameKey = `${this.code}-${round}-${v.seed}`;
    const oppPid = spectator ? null : v.seats['s' + (1 - seat)];
    const run = this.app.launch(game, {
      mode: 'online', viewer: spectator ? 0 : seat, spectator,
      online: {
        isHost: () => this.isHost(),
        again: () => this.again(),
        leave: () => this.leave(),
        surrender: () => this.surrender(),
      },
    });
    if (wasReplaying) ui.render({ flip: false });
    this.watchPlayers(null);
    if (!spectator) run.then((w) => this.rate(w, seat, oppPid, gameKey)).catch(() => {});
  }

  stopGame() {
    if (this.stream) this.stream.close();
    this.stream = null;
    if (this.game && this.game.winner === null) this.game.winner = -2;
    this.game = null;
  }

  /** 投了・退出・通信切れの監視 */
  watchPlayers() {
    const g = this.game, R = this.R;
    if (!g || !R) return;
    const ui = this.app.ui;
    const ps = R.players || {};
    // 投了
    if (R.surrender && R.surrender.round === this.round && g.winner === null) {
      this.endBy(R.surrender.seat, '投了');
      return;
    }
    for (const i of [0, 1]) {
      const pid = R.seats['s' + i];
      const p = ps[pid];
      if (!p && g.winner === null && pid !== PID) { this.endBy(i, '退出'); return; }
      const off = !!p && p.online === false;
      ui.offline = ui.offline || {};
      if (ui.offline[i] !== off) {
        const first = ui.offline[i] === undefined;
        ui.offline[i] = off;
        if (pid !== PID && !(first && !off)) ui.toast(off ? `${(p && p.name) || '相手'} の通信が切れました。もどってくるのを待っています…` : `${p.name} がもどってきました`);
        ui.render({ flip: false });
      }
    }
  }

  async endBy(seat, reason) {
    const g = this.game;
    if (!g || g.winner !== null) return;
    if (this.stream) this.stream.abort();
    await g.lose(seat, reason);
    this.app.ui.abortPending();
  }

  async surrender() {
    if (!this.code || this.seat === null || !this.game || this.game.winner !== null) return;
    await NET.set(`${KEY(this.code)}/surrender`, { round: this.round, seat: this.seat }).catch(() => {});
  }

  // ---------- レート・ランキング ----------
  async myRating() {
    if (!(await ensureNet())) return null;
    try { return (await NET.get(`${RANK}/${PID}`)) || null; } catch { return null; }
  }

  /** 対戦が終わったら自分のレートを更新（イロレーティング） */
  async rate(winner, seat, oppPid, gameKey) {
    if (winner == null || winner < 0 || !oppPid) return;
    try {
      const opp = (await NET.get(`${RANK}/${oppPid}`)) || {};
      const oppR = opp.rating || START_RATING;
      const win = winner === seat;
      let before = START_RATING, after = START_RATING;
      const r = await NET.tx(`${RANK}/${PID}`, (cur) => {
        cur = cur || { rating: START_RATING, w: 0, l: 0 };
        if (cur.last === gameKey) return undefined; // 同じ対戦を2回数えない（再読みこみ対策）
        before = cur.rating || START_RATING;
        const e = 1 / (1 + Math.pow(10, (oppR - before) / 400));
        after = Math.round(before + K_FACTOR * ((win ? 1 : 0) - e));
        return { name: myName() || 'ななし', rating: after, w: (cur.w || 0) + (win ? 1 : 0), l: (cur.l || 0) + (win ? 0 : 1), t: NET.now(), last: gameKey };
      });
      if (!r.committed) return;
      const diff = after - before;
      const text = `レート ${before} → ${after}（${diff >= 0 ? '+' : ''}${diff}）`;
      const el = document.querySelector('.result .rrate');
      if (el) { el.textContent = text; el.classList.add(diff >= 0 ? 'up' : 'down'); } else this.app.ui.toast(text);
    } catch (e) { console.warn(e); }
  }

  async openRanking() {
    const ui = this.app.ui;
    const m = ui.openModal(`<h2>🏆 オンライン・ランキング<small>オンライン対戦の勝ち負けでレートが上下します（はじめは${START_RATING}）</small></h2>
      <ol class="ranking" id="rank-list"><li class="muted">読みこみ中…</li></ol>
      <div class="btns"><button class="btn primary" data-a="close">閉じる</button></div>`, { center: true });
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
    if (!(await ensureNet())) { $('rank-list').innerHTML = `<li class="muted">${esc(netError('timeout'))}</li>`; return; }
    try {
      const all = (await NET.get(RANK)) || {};
      const list = Object.entries(all).map(([id, v]) => ({ id, ...v })).filter((v) => v.rating).sort((a, b) => b.rating - a.rating);
      const meIdx = list.findIndex((v) => v.id === PID);
      const rows = list.slice(0, 100).map((v, i) => `<li class="${v.id === PID ? 'me' : ''}"><span class="n">${i + 1}</span><span class="nm">${esc(v.name)}<small>${v.w || 0}勝${v.l || 0}敗</small></span><span class="sc">${v.rating}</span></li>`);
      if (meIdx >= 100) rows.push(`<li class="me"><span class="n">${meIdx + 1}</span><span class="nm">${esc(list[meIdx].name)}（あなた）</span><span class="sc">${list[meIdx].rating}</span></li>`);
      $('rank-list').innerHTML = rows.join('') || '<li class="muted">まだだれも対戦していません。一番乗りしよう！</li>';
    } catch (err) { $('rank-list').innerHTML = `<li class="muted">${esc(netError(err))}</li>`; }
  }

  async showMyRating() {
    const r = await this.myRating();
    $('mp-myrate').textContent = r ? `あなたのレート：${r.rating}（${r.w || 0}勝${r.l || 0}敗）` : `あなたのレート：${START_RATING}（まだ対戦なし）`;
  }

  // ---------- スタンプ ----------
  sendStamp(stamp) {
    if (!this.code) return;
    const id = NET.now().toString(36) + Math.random().toString(36).slice(2, 6);
    NET.set(`${KEY(this.code)}/ev/${id}`, { type: 'stamp', from: PID, name: myName() || 'だれか', stamp: String(stamp).slice(0, 8), t: NET.now() }).catch(() => {});
  }

  handleEvents() {
    const ev = this.R.ev || {};
    for (const [id, e] of Object.entries(ev)) {
      if (this.seenEv.has(id)) continue;
      this.seenEv.add(id);
      if (!e || e.t < this.joinedAt) continue;
      if (e.type === 'stamp') {
        const seat = this.seatOfPid(e.from);
        if (this.game && seat !== null && $('game').classList.contains('active')) this.app.ui.showStamp(seat, e.stamp);
        else this.app.ui.toast(`${e.name}：${e.stamp}`);
      }
    }
    // 古いスタンプは送った本人が片づける
    const old = Object.entries(ev).filter(([, e]) => e && e.from === PID && e.t < NET.now() - 60000);
    if (old.length) NET.update(`${KEY(this.code)}/ev`, Object.fromEntries(old.map(([id]) => [id, null]))).catch(() => {});
  }

  // ---------- 部屋を出る ----------
  leaveLocal(reason) {
    const c = this.code;
    this.code = null;
    this.R = null;
    this.round = -1;
    ss.set('td_room', null);
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.stopGame();
    document.querySelectorAll('.result').forEach((d) => d.remove());
    this.app.toTitle();
    if (reason) this.app.ui.toast(reason);
    return c;
  }

  async leave() {
    if (!this.code) { this.leaveLocal(); return; }
    const room = this.R, c = this.code;
    this.leaveLocal();
    try {
      NET.cancelDisconnect(`${KEY(c)}/players/${PID}/online`);
      const others = Object.entries((room && room.players) || {}).filter(([id, p]) => id !== PID && p && p.online !== false);
      if (!others.length) { await NET.remove(KEY(c)); await NET.remove(MKEY(c)); return; }
      const up = { [`players/${PID}`]: null };
      if (room.host === PID) up.host = others.sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0))[0][0];
      await NET.update(KEY(c), up);
    } catch (err) { console.warn(err); }
  }

  get inRoom() { return this.code != null; }
}
