// =========================================================
//  起動・画面遷移・設定
// =========================================================
import { Game } from './engine.js';
import { AIController } from './ai.js';
import { UI } from './ui.js';
import { SeatController } from './controllers.js';
import { Online } from './net.js';
import { installSuitSymbols } from './art.js';
import { SUITS, SUIT_KEYS, def } from './cards.js';
import { faceHTML, detailHTML } from './ui.js';
import * as fx from './fx.js';
import { initAudio, ensureBgm, setBgm, setSfx, sfx } from './sound.js';

const $ = (id) => document.getElementById(id);
const LEVEL_LABEL = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

const store = {
  get(key, def) { try { const v = localStorage.getItem('td_' + key); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(key, v) { try { localStorage.setItem('td_' + key, JSON.stringify(v)); } catch { /* 保存できない環境 */ } },
};

class App {
  constructor() {
    this.settings = { sfx: true, bgm: true, speed: 1, reduce: false, ...store.get('settings', {}) };
    this.record = { easy: { w: 0, l: 0 }, normal: { w: 0, l: 0 }, hard: { w: 0, l: 0 }, online: { w: 0, l: 0 }, local: 0, ...store.get('record', {}) };
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
    const unlock = () => { initAudio(); ensureBgm(); removeEventListener('pointerdown', unlock); };
    addEventListener('pointerdown', unlock);
  }

  get levelLabel() { return LEVEL_LABEL[this.level]; }

  applySettings() {
    fx.fxConf.speed = this.settings.speed;
    fx.fxConf.reduce = this.settings.reduce;
    setSfx(this.settings.sfx);
    setBgm(this.settings.bgm);
    store.set('settings', this.settings);
  }

  bindTitle() {
    $('title').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sfx.click();
      const act = b.dataset.act, diff = b.dataset.diff;
      if (act === 'cpu') this.online.showPanel('menu-cpu');
      if (act === 'online') this.online.showPanel('menu-online');
      if (act === 'back') this.online.showPanel('menu-main');
      if (act === 'rules') this.openRules();
      if (act === 'dex') this.openDex();
      if (act === 'settings') this.openSettings(false);
      if (diff) { this.level = diff; this.start('cpu'); }
    });
  }

  showRecord() {
    const r = this.record;
    const rows = ['easy', 'normal', 'hard', 'online']
      .filter((k) => r[k].w + r[k].l > 0)
      .map((k) => `${LEVEL_LABEL[k] || 'オンライン'} ${r[k].w}勝${r[k].l}敗`);
    $('record').innerHTML = rows.length ? `🏆 戦績：${rows.join(' ／ ')}` : 'シールドを全部割って、ダイレクトアタックで勝利！';
  }

  recordResult(winner) {
    if (this.mode === 'cpu' && winner >= 0) {
      this.record[this.level][winner === 0 ? 'w' : 'l']++;
    } else if (this.mode === 'online' && winner >= 0 && !this.ui.spectator) {
      this.record.online[winner === this.ui.viewerIdx ? 'w' : 'l']++;
    }
    store.set('record', this.record);
    this.showRecord();
  }

  start(mode) {
    const ui = this.ui;
    const controllers = [new SeatController({ ui }), new AIController(this.level, { getSpeed: () => this.settings.speed })];
    const names = ['あなた', 'CPU'];
    // 古いゲームのイベントが新しい画面に混ざらないように、ゲームごとに中継する
    let game;
    const relay = { event: (t, d) => (this.game === game ? ui.event(t, d) : Promise.resolve()) };
    game = new Game({ controllers, names, ui: relay });
    this.launch(game, { mode });
  }

  /** 用意したゲームを画面につないで開始する（オフライン・オンライン共通） */
  launch(game, opts) {
    this.abortGame();
    this.mode = opts.mode;
    this.game = game;
    for (const s of ['title', 'lobby']) $(s).classList.remove('active');
    $('game').classList.add('active');
    this.ui.attach(game, opts);
    game.run().catch((e) => console.error(e));
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
    this.online.showPanel(this.mode === 'online' ? 'menu-online' : 'menu-main');
    this.showRecord();
  }

  openSettings(inGame) {
    const s = this.settings;
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const m = this.ui.openModal(`<h2>⚙ 設定</h2>
      <div class="settings-row">効果音 ${seg('sfx', [[true, 'ON'], [false, 'OFF']])}</div>
      <div class="settings-row">BGM ${seg('bgm', [[true, 'ON'], [false, 'OFF']])}</div>
      <div class="settings-row">演出スピード ${seg('speed', [[1, '1x'], [1.6, '2x'], [2.5, '3x']])}</div>
      <div class="settings-row">演出を軽くする ${seg('reduce', [[false, 'OFF'], [true, 'ON']])}</div>
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
    const groups = [...SUIT_KEYS, 'X'].map((s) => {
      const list = cards.filter((c) => (c.joker ? 'X' : c.suit) === s);
      return `<h3 class="dex-h" style="color:${SUITS[s].color}">${SUITS[s].sym} ${SUITS[s].full}</h3>
        <div class="dex-grid">${list.map((c) => `<div class="dex-item" data-k="${cards.indexOf(c)}">${faceHTML(c)}</div>`).join('')}</div>`;
    }).join('');
    const m = this.ui.openModal(`<h2>🃏 カード図鑑<small>タップすると能力が見られます</small></h2><div class="dex">${groups}</div>
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
      <h3>アイコン</h3>
      <p>SA=スピードアタッカー／BL=ブロッカー／RB=リバース／DR=ドロー／W・T=ブレイク数／ST=S・トリガー</p>
      </div><div class="btns"><button class="btn primary" data-a="close">わかった！</button></div>`, { center: true });
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }
}

window.app = new App();
