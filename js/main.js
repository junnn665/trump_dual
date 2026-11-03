// =========================================================
//  起動・画面遷移・設定
// =========================================================
import { Game } from './engine.js';
import { AIController } from './ai.js';
import { UI } from './ui.js';
import { SeatController } from './controllers.js';
import { Online } from './net.js';
import { installSuitSymbols } from './art.js';
import { STAGES, BACKS } from './challenge.js';
import { openDeckBuilder, activeDeck } from './deck.js';
import { SUITS, SUIT_KEYS, def, cardKey, ALL_KEYS, parseCardKey } from './cards.js';
import { myFoils, grantFoils, foilCounts } from './collection.js';
import { ACHIEVEMENTS, checkAchievements, unlocked, titleOf } from './achieve.js';
import { faceHTML, detailHTML } from './ui.js';
import * as fx from './fx.js';
import { initAudio, ensureBgm, setVolume, setTrack, sfx } from './sound.js';

const $ = (id) => document.getElementById(id);
const LEVEL_LABEL = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

const store = {
  get(key, def) { try { const v = localStorage.getItem('td_' + key); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(key, v) { try { localStorage.setItem('td_' + key, JSON.stringify(v)); } catch { /* 保存できない環境 */ } },
};

class App {
  constructor() {
    this.settings = { sfx: true, bgm: true, speed: 1, reduce: false, holo: true, back: 'default', autoEnd: true, sfxVol: 0.8, bgmVol: 0.6, deckMode: 'standard', title: '', cpuPlayers: 2, ...store.get('settings', {}) };
    // 古い設定（ON/OFF）からの引きつぎ
    if (this.settings.sfx === false && this.settings.sfxVol === 0.8) this.settings.sfxVol = 0;
    if (this.settings.bgm === false && this.settings.bgmVol === 0.6) this.settings.bgmVol = 0;
    this.progress = { cleared: [], ...store.get('progress', {}) }; // チャレンジモードの進み具合
    this.stage = null;
    this.record = { easy: { w: 0, l: 0 }, normal: { w: 0, l: 0 }, hard: { w: 0, l: 0 }, online: { w: 0, l: 0 }, br: { w: 0, l: 0 }, streak: 0, ...store.get('record', {}) };
    if (!this.record.br) this.record.br = { w: 0, l: 0 };
    this.level = 'normal';
    this.mode = 'cpu';
    this.game = null;
    installSuitSymbols();
    this.ui = new UI(this);
    fx.initFx($('fx-canvas'));
    this.applySettings();
    this.bindTitle();
    this.showRecord();
    this.online = new Online(this);
    // 最初の操作で音を有効化（ブラウザの制限）
    const unlock = () => { initAudio(); ensureBgm(); this.requestGyro(); removeEventListener('pointerdown', unlock); };
    this.setupHolo();
    addEventListener('pointerdown', unlock);
  }

  // ---------------- キラカード（傾き・マウスで光が動く） ----------------
  setupHolo() {
    document.body.classList.add('holo-auto');
    let x = 0, y = 0, queued = false;
    const root = document.documentElement.style;
    const set = (nx, ny) => {
      x = Math.max(-1, Math.min(1, nx)); y = Math.max(-1, Math.min(1, ny));
      document.body.classList.remove('holo-auto');
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; root.setProperty('--gx', x.toFixed(3)); root.setProperty('--gy', y.toFixed(3)); });
    };
    addEventListener('deviceorientation', (e) => { if (e.gamma == null) return; set(e.gamma / 30, (e.beta - 45) / 30); });
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); });
  }

  /** iPhone は傾きセンサーの許可が必要（最初のタップで聞く） */
  requestGyro() {
    const D = window.DeviceOrientationEvent;
    if (this.settings.holo && D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {});
  }

  get levelLabel() { return this.stage !== null ? `ステージ${this.stage + 1}` : LEVEL_LABEL[this.level]; }

  applySettings() {
    fx.fxConf.speed = this.settings.speed;
    fx.fxConf.reduce = this.settings.reduce;
    setVolume(this.settings.sfxVol, this.settings.bgmVol);
    if (!BACKS[this.settings.back] || !this.unlockedBacks().includes(this.settings.back)) this.settings.back = 'default';
    document.body.className = document.body.className.replace(/\bback-\S+/g, '').trim();
    document.body.classList.add('back-' + this.settings.back);
    document.body.classList.toggle('no-holo', !this.settings.holo);
    store.set('settings', this.settings);
  }

  bindTitle() {
    $('title').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sfx.click();
      const act = b.dataset.act, diff = b.dataset.diff;
      if (act === 'cpu') { this.renderCpuMenu(); this.online.showPanel('menu-cpu'); }
      if (act === 'challenge') { this.renderStages(); this.online.showPanel('menu-challenge'); }
      if (b.dataset.stage) this.stageIntro(Number(b.dataset.stage));
      if (act === 'online') this.online.showPanel('menu-online');
      if (act === 'back') this.online.showPanel('menu-main');
      if (act === 'rules') this.openRules();
      if (act === 'dex') this.openDex();
      if (act === 'deck') openDeckBuilder(this);
      if (act === 'settings') this.openSettings(false);
      if (act === 'ach') this.openAchievements();
      if (b.dataset.np) {
        this.settings.cpuPlayers = Number(b.dataset.np);
        this.applySettings();
        this.renderCpuMenu();
      }
      if (diff) { this.level = diff; this.stage = null; this.start('cpu'); }
    });
  }

  showRecord() {
    const r = this.record;
    const label = { online: 'オンライン', br: 'バトルロイヤル' };
    const rows = ['easy', 'normal', 'hard', 'br', 'online']
      .filter((k) => r[k] && r[k].w + r[k].l > 0)
      .map((k) => `${LEVEL_LABEL[k] || label[k]} ${r[k].w}勝${r[k].l}敗`);
    const t = titleOf(this.settings.title);
    $('record').innerHTML = (t ? `<span class="ptitle">${t}</span> ` : '') + (rows.length ? `🏆 戦績：${rows.join(' ／ ')}${r.streak >= 2 ? `　🔥${r.streak}連勝中` : ''}` : 'シールドを全部割って、ダイレクトアタックで勝利！');
  }

  /** 自分の称号（名前の横に出す） */
  get myTitle() { return titleOf(this.settings.title); }

  /** CPU戦の人数えらび */
  renderCpuMenu() {
    const n = this.settings.cpuPlayers || 2;
    document.querySelectorAll('#cpu-np button').forEach((b) => b.classList.toggle('on', Number(b.dataset.np) === n));
    $('cpu-np-note').textContent = n === 2 ? '1対1でじっくり勝負' : `${n}人で同時に戦い、最後まで生き残った人の勝ち`;
  }

  /**
   * 対戦が終わったときの記録・実績・金カード
   * @returns ごほうびのリスト（結果画面のあとに順番に見せる）
   */
  recordResult(winner, g, ctx = {}) {
    if (!g || ctx.spectator) return [];
    const me = ctx.viewer ?? 0;
    const win = winner === me;
    const multi = g.n > 2;
    const counted = winner >= 0 || winner === -2;
    const rewards = [];
    const st = g.stats[me];
    // 戦績
    if (this.mode === 'cpu' && this.stage !== null) {
      if (win) {
        const first = !this.progress.cleared.includes(this.stage);
        if (first) {
          this.progress.cleared.push(this.stage);
          store.set('progress', this.progress);
          rewards.push({ type: 'back', name: BACKS[STAGES[this.stage].reward].name });
        }
        rewards.push(...grantFoils(first ? 3 : 1, { suit: STAGES[this.stage].suit }).map((x) => ({ type: 'foil', ...x })));
      }
    } else if (counted) {
      const key = multi ? 'br' : this.mode === 'online' ? 'online' : this.level;
      this.record[key][win ? 'w' : 'l']++;
      if (win) {
        const n = this.mode === 'online' ? (multi ? 3 : 2) : multi ? 2 : { easy: Math.random() < 0.4 ? 1 : 0, normal: 1, hard: 2 }[this.level] || 0;
        rewards.push(...grantFoils(n).map((x) => ({ type: 'foil', ...x })));
      } else if (multi && ctx.place === 2) {
        rewards.push(...grantFoils(1).map((x) => ({ type: 'foil', ...x })));
      }
    }
    if (counted) this.record.streak = win ? (this.record.streak || 0) + 1 : 0;
    // ロイヤルで勝ったら虹カード確定
    if (win && st.royal) {
      const rp = g.royalProgress(me);
      const suit = Object.keys(rp).find((s) => rp[s].count === 5);
      rewards.push(...grantFoils(1, { suit, rainbow: true }).map((x) => ({ type: 'foil', ...x })));
    }
    store.set('record', this.record);
    // 実績
    const fc = foilCounts();
    const fresh = checkAchievements({
      mode: this.mode, level: this.level, stage: this.stage, n: g.n, win, place: ctx.place, st,
      myShields: g.p(me).shields.length, turnCount: g.turnCount, record: this.record,
      cleared: this.progress.cleared.length, stages: STAGES.length, foils: fc.gold + fc.rainbow, rainbow: fc.rainbow,
    });
    rewards.unshift(...fresh.map((a) => ({ type: 'ach', ...a })));
    this.showRecord();
    return rewards;
  }

  /** 脱落したあと「結果へ」を選んだとき */
  finishEarly() {
    const g = this.game;
    if (!g || g.winner !== null) return;
    g.winner = -2;
    g.winReason = '脱落';
  }

  /** ごほうびを順番に見せる：実績 → 裏面 → 金・虹カード（パック開封） */
  async showRewards(list) {
    const ach = list.filter((r) => r.type === 'ach');
    const backs = list.filter((r) => r.type === 'back');
    const foils = list.filter((r) => r.type === 'foil');
    for (const a of ach) {
      sfx.hand();
      const d = document.createElement('div');
      d.className = 'ach-pop';
      d.innerHTML = `<i>${a.icon}</i><div><small>実績解除！</small><b>${a.title}</b><span>${a.desc}</span></div>`;
      document.body.appendChild(d);
      await fx.wait(2200);
      d.classList.add('out');
      setTimeout(() => d.remove(), 400);
    }
    for (const b of backs) this.ui.toast(`🎁 カード裏面「${b.name}」を手に入れた！（設定で変更できます）`);
    if (foils.length) await this.openPack(foils);
  }

  /** パック開封：裏向きのカードをタップすると金・虹カードが現れる */
  openPack(foils) {
    return new Promise((res) => {
      const card = (k, f) => ({ uid: 0, owner: 0, under: [], tapped: false, sick: false, ...parseCardKey(k), foil: f });
      const m = this.ui.openModal(`<h2>🎁 特別版カードを手に入れた！<small>タップしてめくろう</small></h2>
        <div class="pack">${foils.map((f, i) => `<div class="pack-card" data-i="${i}" style="--i:${i}">
          <div class="pc-back">${this.ui.backHTML()}</div>
          <div class="pc-front">${faceHTML(card(f.key, f.foil))}<small>${f.upgraded ? '金 → 虹に進化！' : f.foil === 'rainbow' ? '虹カード！' : '金カード'}</small></div>
        </div>`).join('')}</div>
        <div class="btns"><button class="btn" data-a="all">ぜんぶめくる</button><button class="btn primary" data-a="close">OK</button></div>`, { center: true, dismiss: false });
      const flip = (el) => {
        if (el.classList.contains('open')) return;
        el.classList.add('open');
        const f = foils[Number(el.dataset.i)];
        f.foil === 'rainbow' ? sfx.trigger() : sfx.charge();
        const r = el.getBoundingClientRect();
        fx.burst(fx.center(r).x, fx.center(r).y, f.foil === 'rainbow' ? '#b9a6ff' : '#ffd45a', f.foil === 'rainbow' ? 60 : 30, 8);
        if (f.foil === 'rainbow') fx.confetti(60);
      };
      m.el.querySelectorAll('.pack-card').forEach((el) => { el.onclick = () => flip(el); });
      m.el.querySelector('[data-a=all]').onclick = async () => {
        for (const el of m.el.querySelectorAll('.pack-card:not(.open)')) { flip(el); await fx.wait(250); }
      };
      m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); res(); };
    });
  }

  /** 実績と称号 */
  openAchievements() {
    const u = unlocked();
    const n = Object.keys(u).length;
    const cur = this.settings.title;
    const m = this.ui.openModal(`<h2>🏅 実績と称号<small>${n} / ${ACHIEVEMENTS.length} 解除・タップで称号をつける</small></h2>
      <div class="ach-list">${ACHIEVEMENTS.map((a) => {
        const ok = !!u[a.id];
        return `<button class="ach ${ok ? 'ok' : ''} ${cur === a.id ? 'on' : ''}" ${ok ? `data-t="${a.id}"` : 'disabled'}>
          <i>${ok ? a.icon : '🔒'}</i><span><b>${ok ? a.title : '？？？'}</b><small>${a.desc}</small></span>${cur === a.id ? '<em>装備中</em>' : ''}</button>`;
      }).join('')}</div>
      <div class="btns row"><button class="btn ghost" data-a="none">称号を外す</button><button class="btn primary" data-a="close">閉じる</button></div>`, { center: true });
    const setTitle = (id) => {
      this.settings.title = id;
      this.applySettings();
      this.showRecord();
      if (this.online) this.online.syncProfile();
      m.close();
      this.openAchievements();
    };
    m.el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { sfx.click(); setTitle(b.dataset.t); }; });
    m.el.querySelector('[data-a=none]').onclick = () => { sfx.click(); setTitle(''); };
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  start(mode) {
    const ui = this.ui;
    const st = this.stage !== null ? STAGES[this.stage] : null;
    const level = st ? st.level : this.level;
    const n = st ? 2 : Math.min(4, Math.max(2, this.settings.cpuPlayers || 2));
    const controllers = [new SeatController({ ui })];
    for (let i = 1; i < n; i++) controllers.push(new AIController(level, { getSpeed: () => this.settings.speed }));
    const cpuNames = ['CPU', 'CPU-ジン', 'CPU-フレイア', 'CPU-アルカナ'];
    const names = ['あなた', ...(st ? [st.boss] : n === 2 ? ['CPU'] : cpuNames.slice(1, n))];
    const mine = activeDeck();
    const foils = myFoils();
    const meSetup = st && st.me ? { ...st.me, deck: { ...(st.me.deck || {}), foils } } : { deck: mine ? { list: mine, foils } : { foils } };
    const setup = [meSetup, ...Array.from({ length: n - 1 }, () => (st ? st.cpu || {} : {}))];
    // 古いゲームのイベントが新しい画面に混ざらないように、ゲームごとに中継する
    let game;
    const relay = { event: (t, d) => (this.game === game ? ui.event(t, d) : Promise.resolve()) };
    game = new Game({ controllers, names, ui: relay, setup });
    game.players[0].title = this.myTitle;
    this.launch(game, { mode });
  }

  /** 用意したゲームを画面につないで開始する（オフライン・オンライン共通） */
  launch(game, opts) {
    this.abortGame();
    this.mode = opts.mode;
    if (opts.mode !== 'cpu') this.stage = null;
    this.game = game;
    for (const s of ['title', 'lobby']) $(s).classList.remove('active');
    $('game').classList.add('active');
    this.ui.attach(game, opts);
    this.updateTrack();
    const run = game.run();
    run.catch((e) => console.error(e));
    return run;
  }

  abortGame() {
    if (this.game && this.game.winner === null) this.game.winner = -2;
    this.game = null;
    this.ui.ended = true;
    this.ui.abortPending();
    document.querySelectorAll('.modal, .result').forEach((m) => m.remove());
    this.ui.modalCount = 0;
    $('fx-layer').innerHTML = '';
  }

  restart() { this.start(this.mode); }

  toTitle({ keepRoom = false } = {}) {
    if (!keepRoom && this.online && this.online.inRoom) { this.online.leave(); return; }
    this.abortGame();
    for (const s of ['game', 'lobby']) $(s).classList.remove('active');
    $('title').classList.add('active');
    setTrack('title');
    this.online.showPanel(this.mode === 'online' ? 'menu-online' : 'menu-main');
    this.showRecord();
  }

  /** BGM：タイトル／バトル／ボス戦／ピンチ（どちらかのシールドが残り1枚以下） */
  updateTrack() {
    const g = this.game;
    if (!g || g.winner !== null) return;
    const pinch = g.turnCount > 0 && g.players.some((p) => p.shields.length <= 1);
    setTrack(pinch ? 'pinch' : this.mode === 'cpu' && this.stage !== null ? 'boss' : 'battle');
  }

  unlockedBacks() {
    const cleared = (this.progress && this.progress.cleared) || [];
    return ['default', ...STAGES.filter((s, i) => cleared.includes(i)).map((s) => s.reward)];
  }

  // ---------------- チャレンジモード ----------------
  renderStages() {
    const cleared = this.progress.cleared;
    const html = STAGES.map((st, i) => {
      const open = i === 0 || cleared.includes(i - 1);
      const done = cleared.includes(i);
      return `<button class="stage ${done ? 'done' : ''}" ${open ? `data-stage="${i}"` : 'disabled'}>
        <span class="st-no">${i + 1}</span>
        <span class="st-body"><b>${open ? st.boss : '？？？'}</b><small>${open ? st.desc : '前のステージをクリアすると挑戦できます'}</small></span>
        <span class="st-mark">${done ? '✔' : open ? st.icon : '🔒'}</span>
      </button>`;
    }).join('');
    $('stage-list').innerHTML = html;
    $('stage-count').textContent = `${cleared.length} / ${STAGES.length} クリア`;
  }

  stageIntro(i) {
    const st = STAGES[i];
    const back = BACKS[st.reward];
    const m = this.ui.openModal(`<div class="boss-intro">
        <div class="bi-no">STAGE ${i + 1}</div>
        <div class="bi-icon s-${st.suit}">${st.icon}</div>
        <h2>${st.boss}</h2>
        <p class="bi-desc">${st.desc}</p>
        <ul class="bi-rules">${st.rules.map((r) => `<li>${r}</li>`).join('')}<li>CPUの強さ：${LEVEL_LABEL[st.level]}</li></ul>
        <div class="bi-reward">🎁 クリア報酬：カード裏面「${back.name}」<div class="card back mini-preview back-${st.reward}"><div class="ci"></div></div></div>
      </div>
      <div class="btns"><button class="btn primary" data-a="go">⚔ 挑戦する</button><button class="btn ghost" data-a="close">やめる</button></div>`, { center: true });
    m.el.querySelector('[data-a=go]').onclick = () => { sfx.click(); m.close(); this.stage = i; this.start('cpu'); };
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  openSettings(inGame) {
    const s = this.settings;
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const m = this.ui.openModal(`<h2>⚙ 設定</h2>
      <div class="settings-row">効果音 <span class="vol"><input type="range" min="0" max="100" step="5" data-vol="sfxVol" value="${Math.round(s.sfxVol * 100)}"><output>${Math.round(s.sfxVol * 100)}</output></span></div>
      <div class="settings-row">BGM <span class="vol"><input type="range" min="0" max="100" step="5" data-vol="bgmVol" value="${Math.round(s.bgmVol * 100)}"><output>${Math.round(s.bgmVol * 100)}</output></span></div>
      <div class="settings-row">演出スピード ${seg('speed', [[1, '1x'], [1.6, '2x'], [2.5, '3x']])}</div>
      <div class="settings-row">演出を軽くする ${seg('reduce', [[false, 'OFF'], [true, 'ON']])}</div>
      <div class="settings-row">やれることがない時は自動でターン終了 ${seg('autoEnd', [[true, 'ON'], [false, 'OFF']])}</div>
      <div class="settings-row">キラカード（傾けて光る） ${seg('holo', [[true, 'ON'], [false, 'OFF']])}</div>
      <div class="settings-col">カードの裏面
        <div class="back-pick">${Object.entries(BACKS).map(([k, b]) => {
          const ok = this.unlockedBacks().includes(k);
          return `<button class="bp ${s.back === k ? 'on' : ''}" ${ok ? `data-back="${k}"` : 'disabled'} title="${b.desc}"><div class="card back back-${k}"><div class="ci">${ok ? '' : '<i>🔒</i>'}</div></div><small>${ok ? b.name : '？？？'}</small></button>`;
        }).join('')}</div>
      </div>
      <div class="btns">
        ${inGame ? `<button class="btn" data-a="rules">📖 ルールを見る</button>${this.ui.spectator ? '' : '<button class="btn" data-a="surrender">🏳 投了する</button>'}<button class="btn ghost" data-a="title">${this.mode === 'online' ? '部屋を出る' : 'タイトルへ戻る'}</button>` : ''}
        <button class="btn primary" data-a="close">閉じる</button>
      </div>`, { center: true });
    m.el.querySelectorAll('.seg').forEach((sg) => {
      sg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const key = sg.dataset.key;
        let v = b.dataset.v;
        v = v === 'true' ? true : v === 'false' ? false : Number(v);
        s[key] = v;
        sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        initAudio();
        this.applySettings();
        sfx.click();
      });
    });
    m.el.querySelectorAll('[data-vol]').forEach((r) => {
      r.addEventListener('input', () => {
        s[r.dataset.vol] = Number(r.value) / 100;
        r.nextElementSibling.textContent = r.value;
        initAudio();
        this.applySettings();
      });
      r.addEventListener('change', () => { if (r.dataset.vol === 'sfxVol') sfx.charge(); });
    });
    m.el.querySelector('.back-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-back]');
      if (!b) return;
      sfx.click();
      s.back = b.dataset.back;
      m.el.querySelectorAll('.bp').forEach((x) => x.classList.toggle('on', x === b));
      this.applySettings();
      if (this.ui.game) this.ui.render({ flip: false });
    });
    const on = (a, f) => { const b = m.el.querySelector(`[data-a=${a}]`); if (b) b.onclick = f; };
    on('close', () => { sfx.click(); m.close(); });
    on('rules', () => { m.close(); this.openRules(); });
    on('title', () => { m.close(); this.toTitle(); });
    on('surrender', () => {
      m.close();
      const g = this.game;
      if (!g || g.winner !== null) return;
      if (this.mode === 'online') { this.online.surrender(); return; }
      const pi = this.mode === 'cpu' ? 0 : g.turn;
      // 待っている操作・選択を打ち切って決着処理へ
      g.surrender(pi).then(() => this.ui.abortPending());
    });
  }

  /** カード図鑑：53枚すべての絵柄と能力 */
  openDex() {
    const cards = [];
    for (const s of SUIT_KEYS) for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) cards.push({ uid: 0, owner: 0, suit: s, rank: r, joker: false, under: [] });
    cards.push({ uid: 0, owner: 0, suit: 'X', rank: 0, joker: true, under: [] });
    const foils = myFoils();
    for (const c of cards) if (foils[cardKey(c)]) c.foil = foils[cardKey(c)];
    const fc = foilCounts();
    const groups = [...SUIT_KEYS, 'X'].map((s) => {
      const list = cards.filter((c) => (c.joker ? 'X' : c.suit) === s);
      return `<h3 class="dex-h" style="color:${SUITS[s].color}">${SUITS[s].sym} ${SUITS[s].full}</h3>
        <div class="dex-grid">${list.map((c) => `<div class="dex-item" data-k="${cards.indexOf(c)}">${faceHTML(c)}</div>`).join('')}</div>`;
    }).join('');
    const m = this.ui.openModal(`<h2>🃏 カード図鑑<small>タップすると能力が見られます・勝つと金／虹の特別版がもらえる</small></h2>
      <div class="dex-count"><span class="g">金 ${fc.gold}</span><span class="r">虹 ${fc.rainbow}</span><span>コンプリートまで ${fc.total - fc.rainbow}種（すべて虹）</span></div><div class="dex">${groups}</div>
      <div class="btns"><button class="btn primary" data-a="close">閉じる</button></div>`, { center: true });
    m.el.querySelector('.dex').addEventListener('click', (e) => {
      const it = e.target.closest('.dex-item');
      if (!it) return;
      sfx.click();
      const c = cards[Number(it.dataset.k)];
      const d = this.ui.openModal(`${detailHTML(c)}<div class="btns"><button class="btn ghost" data-a="close">もどる</button></div>`, { center: true });
      d.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); d.close(); };
    });
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  openRules() {
    const sx = (k) => `<span class="suit-${k}">${SUITS[k].sym}</span>`;
    const m = this.ui.openModal(`<h2>📖 ルール</h2><div class="rules">
      <h3>勝ち方</h3>
      <p>相手のシールド（最初5枚）を攻撃で全部ブレイクし、シールドが0枚の相手に<b>ダイレクトアタック</b>を決めたら勝ち！ 自分のターンの最初に山札が引けなくても負けです。</p>
      <h3>ターンの流れ</h3>
      <ul>
        <li>① 自分のカードをすべてアンタップ → 1枚ドロー（先攻1ターン目は引かない）</li>
        <li>② 手札1枚を<b>マナ</b>に置ける（1ターン1回）</li>
        <li>③ マナをタップしてカードを使う（召喚・呪文）</li>
        <li>④ クリーチャーで攻撃 → 「ターン終了」</li>
      </ul>
      <h3>マナと文明</h3>
      <p>コストの数だけマナをタップします。さらに、<b>使うカードと同じスートのマナが1枚以上</b>必要です（ジョーカーのマナは全スート扱い）。</p>
      <h3>スート（文明）の能力</h3>
      <table>
        <tr><th>${sx('S')} 黒鋼</th><td><b>スピードアタッカー</b>：出たターンから攻撃できる</td></tr>
        <tr><th>${sx('C')} 翠樹</th><td><b>ブロッカー</b>：相手の攻撃を代わりに受けられる</td></tr>
        <tr><th>${sx('H')} 紅炎</th><td><b>リバース</b>：破壊されたらマナになる</td></tr>
        <tr><th>${sx('D')} 蒼晶</th><td><b>ドロー</b>：出たときカードを1枚引く</td></tr>
      </table>
      <h3>カードの種類</h3>
      <table>
        <tr><th>2〜10</th><td>クリーチャー。パワー＝数字×1000。コスト1〜6。9と10はW・ブレイカー</td></tr>
        <tr><th>A</th><td>ドラゴン。コスト6・パワー12000・W・ブレイカー。攻撃時にパワー3000以下を1体破壊</td></tr>
        <tr><th>J</th><td>呪文（コスト3・S・トリガー）<br>${sx('S')} パワー6000以下を1体破壊<br>${sx('C')} 相手を2体までタップ<br>${sx('H')} 墓地のクリーチャーを手札へ＋マナ追加<br>${sx('D')} 2枚ドロー</td></tr>
        <tr><th>Q</th><td>進化クリーチャー（コスト4・パワー11000・W）。同じスートの自分のクリーチャーに重ねて出し、すぐ攻撃できる</td></tr>
        <tr><th>K</th><td>キング（コスト7・パワー15000・T・ブレイカー）<br>${sx('S')} 相手を1体破壊 ${sx('C')} シールド＋2枚<br>${sx('H')} 墓地からコスト5以下を復活 ${sx('D')} 3枚ドロー</td></tr>
        <tr><th>JOKER</th><td>全文明・コスト5・パワー9000・W・ブレイカー。4スートの能力すべて＋S・トリガー</td></tr>
      </table>
      <h3>攻撃とバトル</h3>
      <ul>
        <li>召喚したターンは攻撃できない（召喚酔い・Zzz表示）</li>
        <li>攻撃先は「相手プレイヤー（シールド）」か「タップ状態の相手クリーチャー」</li>
        <li>バトルはパワーが大きい方が勝ち、負けた方は破壊。同じなら両方破壊</li>
        <li>ブレイクされたシールドは手札に入る。<b>S・トリガー</b>（J・JOKER）ならタダで使える！</li>
      </ul>
      <h3>👑 バトルロイヤル（3〜4人）</h3>
      <ul>
        <li>時計回りに順番にターンが回る。攻撃するときは、どの相手をねらうか選べる</li>
        <li>呪文や能力の「相手のクリーチャー」は、残っている相手全員のクリーチャーから選べる</li>
        <li>シールド0枚でダイレクトアタックを受けた人は脱落。最後まで生き残った人の勝ち</li>
        <li>上のタブをタップすると、大きく表示する相手を切りかえられる</li>
      </ul>
      <h3>役（ポーカーハンド）ボーナス</h3>
      <p>自分のバトルゾーンのクリーチャーで役ができると、その役のクリーチャーのパワーが上がります（緑の＋表示）。</p>
      <table>
        <tr><th>ペア</th><td>同じ数字2体 ＋1000</td></tr>
        <tr><th>ツーペア</th><td>ペア2組 ＋2000</td></tr>
        <tr><th>スリーカード</th><td>同じ数字3体 ＋3000</td></tr>
        <tr><th>フルハウス</th><td>スリーカード＋ペア ＋3000</td></tr>
        <tr><th>フォーカード</th><td>同じ数字4体 ＋5000</td></tr>
        <tr><th>3連・4連ストレート</th><td>数字の連続 ＋1000／＋2000</td></tr>
        <tr><th>ストレート</th><td>5連続 ＋3000（同じスートならストレートフラッシュ ＋5000）</td></tr>
        <tr><th>フラッシュ</th><td>同じスート4体以上 ＋2000</td></tr>
      </table>
      <h3>👑 ロイヤルストレートフラッシュ</h3>
      <p>同じスートの <b>10・J・Q・K・A</b> が自分のバトルゾーンとマナゾーンにそろった瞬間、<b>即勝利</b>！ 名前の横の 👑 で集まり具合が見られます。</p>
      <h3>操作のコツ</h3>
      <ul><li>手札を<b>上にスワイプ</b>で召喚・呪文、<b>下にスワイプ</b>でマナに置く</li><li>オンライン対戦の持ち時間は1ターン60秒（ブロックなどの選択は20秒）</li></ul>
      <h3>アイコン</h3>
      <p>SA=スピードアタッカー／BL=ブロッカー／RB=リバース／DR=ドロー／W・T=ブレイク数／ST=S・トリガー</p>
      </div><div class="btns"><button class="btn primary" data-a="close">わかった！</button></div>`, { center: true });
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }
}

window.app = new App();

// ホーム画面に追加して、アプリのように遊べるようにする（PWA）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
