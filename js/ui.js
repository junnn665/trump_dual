// =========================================================
//  画面描画・入力・演出
// =========================================================
import { def, describe, SUITS, has, ABILITY_TEXT } from './cards.js';
import * as fx from './fx.js';
import { sfx } from './sound.js';
import { artSVG } from './art.js';
import { AIController } from './ai.js';
import { summonLine, attackLine } from './lines.js';
import { BEATS } from './cards.js';
import { SUPER_COST, SUPER_BONUS, GRAVE_COST } from './engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- カードHTML ----------------
export function cardHTML(c, { back = false, extra = '', noUid = false, bonus = 0 } = {}) {
  const uid = noUid ? '' : ` data-uid="${c.uid}"`;
  if (back) return `<div class="card back ${extra}"${uid}><div class="ci"><svg class="c-svg" viewBox="0 0 100 142" preserveAspectRatio="none"><rect x="7" y="7" width="86" height="128" rx="6" fill="none" stroke="url(#g-gold)" stroke-width="1.5"/><rect x="11" y="11" width="78" height="120" rx="4" fill="none" stroke="#b9a6ff" stroke-width=".6" opacity=".7"/><g opacity=".9"><use href="#suit-S" x="18" y="18" width="14" height="14" fill="#b9a6ff"/><use href="#suit-H" x="68" y="18" width="14" height="14" fill="#ff8a96"/><use href="#suit-D" x="18" y="110" width="14" height="14" fill="#7fc8ff"/><use href="#suit-C" x="68" y="110" width="14" height="14" fill="#7fe0aa"/></g><circle cx="50" cy="71" r="22" fill="none" stroke="url(#g-gold)" stroke-width="1.6"/><circle cx="50" cy="71" r="18" fill="#1b1446" stroke="#b9a6ff" stroke-width=".6"/><text x="50" y="78" text-anchor="middle" font-size="19" font-weight="900" fill="url(#g-gold)" font-family="Georgia, serif">TD</text></svg></div></div>`;
  const d = def(c);
  const s = c.joker ? 'X' : c.suit;
  const sym = SUITS[s].sym;
  const badges = [];
  if (c.joker) badges.push('<b>ALL</b>');
  else for (const a of d.abilities) badges.push(`<b>${ABILITY_TEXT[a].badge}</b>`);
  if (d.breaker === 2) badges.push('<b class="br">W</b>');
  if (d.breaker === 3) badges.push('<b class="br">T</b>');
  if (d.trigger) badges.push('<b class="st">ST</b>');
  if (c.tempBlock && !has(c, 'blocker')) badges.push('<b class="tb">BL</b>');
  if (c.super) { badges.push('<b class="sp">超</b>'); bonus += SUPER_BONUS; }
  const foil = c.foil === 'gold' || c.foil === 'rainbow' ? c.foil : '';
  const cls = ['card', c.super ? 'superevo' : '', 's-' + s, 'k-' + d.kind, d.big ? 'big holo-on' : '', foil ? 'foil foil-' + foil : '', c.tapped ? 'tapped' : '', c.sick && !has(c, 'speed') ? 'sick' : '', bonus ? 'boosted' : '', extra].join(' ');
  return `<div class="${cls}"${uid}><div class="ci">
    ${artSVG(c, d.kind)}
    <div class="c-cost">${d.cost}</div>
    <div class="c-badges">${badges.join('')}</div>
    ${d.evolution ? '<div class="c-evo">進化</div>' : ''}
    <div class="c-name">${esc(d.name)}</div>
    <div class="c-power">${d.type === 'spell' ? '呪文' : d.power + bonus}</div>
    ${bonus ? `<div class="c-bonus">+${bonus}</div>` : ''}
    ${d.big || foil ? '<div class="holo"></div>' : ''}
    ${foil ? `<div class="foil-mark">${foil === 'rainbow' ? '虹' : '金'}</div>` : ''}
  </div></div>`;
}

function manaHTML(c) {
  const s = c.joker ? 'X' : c.suit;
  const label = c.joker ? 'JK' : def(c).rankLabel;
  return `<div class="mana-chip s-${s} ${c.tapped ? 'tapped' : ''}" data-uid="${c.uid}"><div class="ci">${label}<span>${c.joker ? '★' : SUITS[s].sym}</span></div></div>`;
}

/** 向き・状態をリセットした表向きカード（モーダル・演出用） */
export function faceHTML(c) {
  return cardHTML({ ...c, tapped: false, sick: false }, { noUid: true });
}

export function detailHTML(c) {
  const d = def(c);
  const s = c.joker ? 'X' : c.suit;
  const kindLabel = { number: 'クリーチャー', ace: 'クリーチャー（ドラゴン）', queen: '進化クリーチャー', king: 'クリーチャー（キング）', jack: '呪文', joker: 'クリーチャー（ジョーカー）' }[d.kind];
  const lines = describe(c).map((t) => `<p>${esc(t)}</p>`).join('');
  return `<div class="detail">${faceHTML(c)}
    <div class="detail-info">
      <div class="dname">${esc(d.name)}</div>
      <div class="dmeta">${SUITS[s].sym} ${SUITS[s].full}・${kindLabel}<br>コスト ${d.cost}${d.type === 'spell' ? '' : `・パワー ${d.power}`}</div>
      <div class="dtext">${lines || '<p>（能力なし）</p>'}</div>
    </div></div>`;
}

// =========================================================
export class UI {
  constructor(app) {
    this.app = app;
    this.board = $('board');
    this.spawn = new Map();
    this.actionResolve = null; // 自分の手番で、次の操作を待っている
    this.pending = new Set();  // 選択待ちのモーダル（投了・切断時にまとめて閉じる）
    this.attacker = null; // 攻撃先選択中のクリーチャー
    this.modalCount = 0;
    this.board.addEventListener('click', (e) => this.onBoardClick(e));
    this.bindSwipe();
    // 長押しでカードを大きく表示（盤面・手札）
    this.bindPeek(this.board, (el) => {
      const cEl = el.closest('[data-uid]');
      if (!cEl || !this.game || cEl.classList.contains('mini-back') || cEl.classList.contains('shield') || cEl.classList.contains('back')) return null;
      const hit = this.findCard(Number(cEl.dataset.uid));
      if (!hit || (hit.zone === 'hand' && hit.pi !== this.viewerIdx)) return null;
      return hit.card;
    });
    this.timers = new Map(); // オンラインの持ち時間（選択ごと）
    this.turnBudget = 0;
    this.lastTick = Date.now();
    setInterval(() => this.tick(), 250);
    $('btn-end').addEventListener('click', () => this.endTurn());
    $('btn-log').addEventListener('click', () => { sfx.click(); $('log').classList.toggle('open'); });
    $('log-close').addEventListener('click', () => $('log').classList.remove('open'));
    $('btn-menu').addEventListener('click', () => { sfx.click(); this.app.openSettings(true); });
    $('btn-hint').addEventListener('click', () => { sfx.click(); this.showHint(); });
    $('btn-sheet').addEventListener('click', () => { sfx.click(); this.toggleCheat(); });
  }

  attach(game, { mode, viewer = 0, spectator = false, online = null }) {
    this.game = game;
    this.mode = mode; // 'cpu' | 'online'
    this.viewerIdx = viewer;
    this.focus = game.opps(viewer)[0] ? game.opps(viewer)[0].index : (viewer + 1) % game.n; // 上に大きく表示する相手
    this.spectator = spectator;
    this.leftEarly = false;
    document.body.classList.toggle('multi', game.n > 2);
    this.online = online; // { sendStamp, isHost, again, leave }
    this.actionResolve = null;
    this.pending.clear();
    this.attacker = null;
    this.ended = false;
    this.offline = {};
    $('btn-stamp').classList.toggle('hidden', mode !== 'online');
    $('cheat').classList.add('hidden');
    $('btn-hint').classList.toggle('hidden', spectator);
    $('stamp-bar').classList.add('hidden');
    $('log-body').innerHTML = '';
    $('toasts').innerHTML = '';
    $('log').classList.remove('open');
  }

  get viewer() { return this.viewerIdx; }
  backHTML() { return cardHTML({ uid: 0 }, { back: true, noUid: true }); }
  /** その人がどこに表示されているか：自分＝bot、注目中の相手＝top、ほかの相手＝null（タブだけ） */
  sideOf(pi) {
    if (pi === this.viewerIdx) return 'bot';
    if (this.game && this.game.n > 2) return 'opp'; // バトルロイヤル：相手全員を同時に表示
    return pi === this.focus ? 'top' : null;
  }
  elOf(uid) { return this.board.querySelector(`[data-uid="${uid}"]`); }
  rectOf(el) { return el ? el.getBoundingClientRect() : null; }
  tabEl(pi) { return $(`opp-${pi}`); }
  /** 演出の起点となる場所（自分＝下、1対1の相手＝上、バトルロイヤルの相手＝それぞれのパネル） */
  anchorEl(pi, kind) {
    if (pi === this.viewerIdx) return $(`bot-${kind}`);
    if (this.game && this.game.n > 2) return $(`opp-${pi}-${kind}`) || $(`opp-${pi}`) || $('turn-no');
    return $(`top-${kind}`);
  }
  pileRect(pi, kind) { return this.anchorEl(pi, kind).getBoundingClientRect(); }
  setFocus(pi) {
    if (pi === this.viewerIdx || pi === this.focus || !this.game || !this.game.p(pi)) return;
    this.focus = pi;
    this.render({ flip: false });
  }
  isHuman(pi) { return !this.game.p(pi).controller.isAI; }
  dur(ms) { return ms / fx.fxConf.speed; }

  findCard(uid) {
    for (const p of this.game.players) {
      for (const z of ['hand', 'mana', 'battle', 'shields', 'grave']) {
        for (const c of p[z]) {
          if (c.uid === uid) return { card: c, pi: p.index, zone: z };
        }
      }
    }
    return null;
  }

  // ---------------- 描画 ----------------
  snapshot() {
    // 動いている途中のカードは、途中の位置ではなく本来の位置で測る（途中の位置から次の動きを始めると、動きが止まらなくなる）
    if (this.flips) for (const a of this.flips) a.cancel();
    this.flips = [];
    const m = new Map();
    for (const el of this.board.querySelectorAll('[data-uid]')) m.set(el.dataset.uid, el.getBoundingClientRect());
    return m;
  }

  render({ flip = true } = {}) {
    const g = this.game;
    if (!g) return;
    const before = flip ? this.snapshot() : null;
    const v = this.viewerIdx;
    const me = g.p(v), op = g.p(this.focus);
    const myTurn = this.canAct();
    const multi = g.n > 2;
    this.renderTabs();
    $('side-top').classList.toggle('hidden', multi);
    $('side-top').classList.toggle('is-out', !!op.out);
    $('side-bot').classList.toggle('is-out', !!me.out);

    // 名前・パイル
    for (const [side, pl] of multi ? [['bot', me]] : [['top', op], ['bot', me]]) {
      const isAI = pl.controller.isAI;
      const tag = isAI ? `[${this.app.levelLabel}]` : this.mode === 'online' && pl.controller.isRemote && this.offline && this.offline[pl.index] ? '[通信切れ]' : '';
      $(`${side}-name`).innerHTML = `<span class="dot"></span>${esc(pl.name)}${pl.title ? ` <span class="ptitle">${esc(pl.title)}</span>` : ''}${tag ? ` <small style="color:var(--muted)">${tag}</small>` : ''}${pl.out ? ' <small class="outtag">脱落</small>' : ''}`;
      $(`${side}-deck`).innerHTML = `🂠 <b>${pl.deck.length}</b>`;
      $(`${side}-grave`).innerHTML = `🪦 <b>${pl.grave.length}</b>`;
      $(`side-${side}`).classList.toggle('active-turn', g.turn === pl.index && g.winner === null);

      // マナ
      const free = pl.mana.filter((m) => !m.tapped).length;
      $(`${side}-mana`).innerHTML = `<div class="mana-label">マナ<b>${free}/${pl.mana.length}</b></div>` + pl.mana.map(manaHTML).join('');
      // シールド
      // 自分で仕込んだシールドには★（相手には見えない）
      $(`${side}-shields`).innerHTML = pl.shields.map((s, i) => `<div class="shield ${s.planted && side === 'bot' && !this.spectator ? 'planted' : ''}" data-uid="${s.uid}"><div class="ci">${s.planted && side === 'bot' && !this.spectator ? '★' : i + 1}</div></div>`).join('');
      // バトルゾーン
      const hands = g.hands(pl.index);
      $(`${side}-handtag`).innerHTML = hands.names.map((n) => `<span>${esc(n)}</span>`).join('');
      const rp = g.royalProgress(pl.index);
      const bestS = Object.keys(rp).sort((a, b) => rp[b].count - rp[a].count)[0];
      $(`${side}-royal`).innerHTML = rp[bestS].count >= 3 ? `👑${SUITS[bestS].sym}${rp[bestS].count}/5` : '';
      $(`${side}-royal`).className = 'royal' + (rp[bestS].count >= 4 ? ' hot' : '') + ` s-${bestS}`;
      $(`${side}-battle`).innerHTML = pl.battle.map((c) => {
        let extra = '';
        if (side === 'bot' && myTurn && g.canAttack(v, c)) extra += ' can-attack';
        if (side === 'top' && this.attacker && c.tapped) extra += ' targetable';
        if (side === 'bot' && this.attacker === c) extra += ' selected';
        return cardHTML(c, { extra, bonus: hands.bonus.get(c.uid) || 0 });
      }).join('');
    }
    // 相手の手札（裏）
    if (!multi) $('top-hand').innerHTML = op.hand.map((c) => `<div class="mini-back" data-uid="${c.uid}"></div>`).join('') + `<em>×${op.hand.length}</em>`;
    // 自分の手札
    const handEl = $('bot-hand');
    handEl.innerHTML = this.spectator
      ? me.hand.map((c) => cardHTML(c, { back: true })).join('')
      : me.hand.map((c) => cardHTML(c, { extra: myTurn && g.canPlay(v, c).ok ? 'playable' : '' })).join('');
    handEl.classList.toggle('locked', !myTurn);

    $('top-shields').classList.toggle('targetable', !!this.attacker && !multi);
    this.fitBattle();

    // 中央
    $('turn-no').textContent = `TURN ${g.turnCount}`;
    const endBtn = $('btn-end');
    endBtn.disabled = !myTurn || !!this.attacker;
    endBtn.classList.remove('urge');
    let hint = '';
    if (g.winner !== null) hint = '決着！';
    else if (this.attacker) hint = g.n > 2 ? '攻撃先（赤く光る）をタップ。ほかの所で取り消し' : '攻撃先のクリーチャーをタップしてね';
    else if (myTurn) {
      const playable = me.hand.some((c) => g.canPlay(v, c).ok);
      const attackers = me.battle.some((c) => g.canAttack(v, c));
      if (!me.charged && me.hand.length) hint = '手札をタップ（上スワイプ＝召喚／下＝マナ）';
      else if (playable) hint = '光っているカードを使えます';
      else if (attackers) hint = '光っているクリーチャーをタップして攻撃！';
      else { hint = 'やれることはありません → ターン終了'; endBtn.classList.add('urge'); }
    } else if (this.spectator) hint = `👀 観戦中：${g.cur.name} のターン`;
    else if (g.turn === v && this.isMine(v)) hint = '処理中…';
    else hint = `${g.cur.name} のターン…`;
    endBtn.classList.toggle('hidden', !!this.spectator);
    $('hint').textContent = hint;

    if (before) this.playFlip(before);
    if (this.app.updateTrack) this.app.updateTrack();
  }

  /** バトルロイヤル：相手全員のパネルを並べて表示（シールド・マナ・手札・場のクリーチャーが全部見える） */
  renderTabs() {
    const g = this.game, wrap = $('opp-tabs');
    if (g.n <= 2) { wrap.innerHTML = ''; wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const opps = g.players.filter((p) => p.index !== this.viewerIdx);
    wrap.style.setProperty('--cols', opps.length);
    wrap.innerHTML = opps.map((p) => {
      const pi = p.index;
      const ally = g.isAlly(this.viewerIdx, pi);
      const cls = ['op', ally ? 'ally' : g.teams ? 'enemy' : '', g.turn === pi && g.winner === null ? 'turn' : '', p.out ? 'out' : ''].join(' ');
      const tag = p.controller.isAI ? this.app.levelLabel : this.offline && this.offline[pi] ? '通信切れ' : '';
      const free = p.mana.filter((m) => !m.tapped).length;
      const hands = g.hands(pi);
      const rp = g.royalProgress(pi);
      const bestS = Object.keys(rp).sort((a, b) => rp[b].count - rp[a].count)[0];
      const canHit = !!this.attacker && !p.out && !ally;
      const shields = p.shields.map((s) => `<div class="shield" data-uid="${s.uid}"><div class="ci"></div></div>`).join('') || '<span class="op-zero">0</span>';
      const battle = p.battle.map((c) => cardHTML(c, { extra: canHit && c.tapped ? 'targetable' : '', bonus: hands.bonus.get(c.uid) || 0 })).join('');
      return `<div class="${cls}" id="opp-${pi}" data-pi="${pi}">
        <div class="op-head" id="opp-${pi}-name"><span class="dot"></span>${g.teams ? `<em class="team-tag">${ally ? '味方' : '敵'}</em>` : ''}<b>${esc(p.name)}</b>${p.title ? `<span class="ptitle">${esc(p.title)}</span>` : ''}${tag ? `<small>${esc(tag)}</small>` : ''}</div>
        <div class="op-shields ${canHit ? 'targetable' : ''}" id="opp-${pi}-shields" data-pi="${pi}">${shields}</div>
        <div class="op-row">
          <span id="opp-${pi}-mana" title="マナ">💎<b>${free}/${p.mana.length}</b></span>
          <span id="opp-${pi}-hand" title="手札">🃏<b>${p.hand.length}</b></span>
          <button class="pile" id="opp-${pi}-grave" title="墓地">🪦<b>${p.grave.length}</b></button>
          <span id="opp-${pi}-deck" title="山札">🂠<b>${p.deck.length}</b></span>
        </div>
        ${rp[bestS].count >= 3 || hands.names.length ? `<div class="op-tags">${rp[bestS].count >= 3 ? `<span class="royal ${rp[bestS].count >= 4 ? 'hot' : ''}">👑${SUITS[bestS].sym}${rp[bestS].count}/5</span>` : ''}${hands.names.map((n) => `<span class="ht">${esc(n)}</span>`).join('')}</div>` : ''}
        <div class="op-battle" id="opp-${pi}-battle"${this.opCw && this.opCw[pi] && this.opCw[pi].n === p.battle.length ? ` style="--cw:${this.opCw[pi].cw}px;--cols:${this.opCw[pi].cols}"` : ''}>${battle}</div>
        ${p.out ? '<div class="op-out">脱落</div>' : ''}
      </div>`;
    }).join('');
  }

  fitBattle() {
    // バトルロイヤルのパネル：マス目（列数・大きさ）を「枚数」だけで決める。
    // タップ（横向き）してもマス目は変わらないので、カードが並び替わらない
    for (const z of document.querySelectorAll('.op-battle')) {
      const n = z.children.length;
      const pi = z.id.split('-')[1];
      this.opCw = this.opCw || {};
      if (!n) continue;
      const w = z.clientWidth - 4, h = z.clientHeight - 4;
      let best = { cw: 16, cols: 1 };
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const byW = (w - (cols - 1) * 4) / (cols * 1.12); // 横向き（タップ）でもはみ出さない幅
        const byH = (h - (rows - 1) * 4) / (rows * 1.42);
        const cw = Math.floor(Math.min(byW, byH, 54));
        if (cw > best.cw) best = { cw, cols };
      }
      const prev = this.opCw[pi];
      // 同じ枚数なら前と同じマス目を使う（パネルの高さが少し変わっただけで並びが変わらないように）
      const lay = prev && prev.n === n ? prev : { ...best, n };
      this.opCw[pi] = lay;
      if (z.style.getPropertyValue('--cw') !== lay.cw + 'px') z.style.setProperty('--cw', lay.cw + 'px');
      if (z.style.getPropertyValue('--cols') !== String(lay.cols)) z.style.setProperty('--cols', lay.cols);
    }
    const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 54;
    for (const side of ['top', 'bot']) {
      const z = $(`${side}-battle`);
      const n = z.children.length;
      if (!n) { z.style.removeProperty('--cw'); continue; }
      const avail = z.clientWidth - 10;
      const per = (avail - (n - 1) * 5) / (n * 1.14);
      if (per < base) z.style.setProperty('--cw', Math.max(30, per) + 'px');
      else z.style.removeProperty('--cw');
    }
  }

  playFlip(before) {
    const ms = this.dur(420);
    for (const el of this.board.querySelectorAll('[data-uid]')) {
      const uid = el.dataset.uid;
      const b = before.get(uid) || this.spawn.get(uid);
      const r = el.getBoundingClientRect();
      if (!b) continue;
      const dx = b.left + b.width / 2 - (r.left + r.width / 2);
      const dy = b.top + b.height / 2 - (r.top + r.height / 2);
      const sx = b.width / (r.width || 1);
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(sx - 1) < 0.05) continue;
      const anim = el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx})`, zIndex: 20 },
        { transform: 'none', zIndex: 20 },
      ], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)' });
      this.flips.push(anim);
      anim.finished.then(() => { const i = this.flips.indexOf(anim); if (i >= 0) this.flips.splice(i, 1); }).catch(() => {});
    }
    this.spawn.clear();
  }

  // ---------------- おすすめの一手（ヒント） ----------------
  showHint() {
    const g = this.game, v = this.viewerIdx;
    if (!g || !this.canAct()) { this.toast('自分の番に使えます'); return; }
    const ai = new AIController('hard', { delay: 0 });
    const me = g.p(v);
    const glow = (uids) => {
      document.querySelectorAll('.hint-glow').forEach((e) => e.classList.remove('hint-glow'));
      for (const u of uids) { const el = this.elOf(u); if (el) el.classList.add('hint-glow'); }
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => document.querySelectorAll('.hint-glow').forEach((e) => e.classList.remove('hint-glow')), 3500);
    };
    const nm = (c) => def(c).name;
    const charge = ai.chooseCharge(g, v);
    if (charge) { glow([charge.uid]); this.toast(`💡 まず「${nm(charge)}」をマナに置こう（下にスワイプ）`); return; }
    const combo = ai.pickCombo(g, v);
    if (combo) { glow(combo.map((c) => c.uid)); this.toast(`💡「${nm(combo[0])}」と「${nm(combo[1])}」をコンボ召喚しよう（タップ→🔗）`); return; }
    const play = ai.pickPlay(g, v);
    if (play) { glow([play.uid]); this.toast(`💡「${nm(play)}」を${def(play).type === 'spell' ? '唱え' : '出'}よう（上にスワイプ）`); return; }
    const atk = ai.pickAttack(g, v);
    if (atk) {
      const target = atk.target === 'player' ? `${g.n > 2 ? g.p(atk.tp).name + ' の' : ''}シールド` : `「${nm(atk.target)}」`;
      glow([atk.attacker.uid, ...(atk.target !== 'player' ? [atk.target.uid] : [])]);
      this.toast(`💡「${nm(atk.attacker)}」で${target}を攻撃しよう`);
      return;
    }
    if (me.battle.some((c) => g.canAttack(v, c))) { this.toast('💡 今は攻撃しないで守りを固めよう → ターン終了'); return; }
    this.toast('💡 やれることは終わり。ターン終了でOK');
  }

  // ---------------- 早見表 ----------------
  toggleCheat() {
    const el = $('cheat');
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    const sx = (k) => `<b style="color:${SUITS[k].color}">${SUITS[k].sym}</b>`;
    el.innerHTML = `<div class="cheat-head">📋 早見表 <button class="iconbtn" data-a="x">✕</button></div>
      <div class="cheat-body">
        <h4>スートの能力</h4>
        <p>${sx('S')} 出たターンに攻撃　${sx('C')} ブロッカー<br>${sx('H')} 攻撃時+2000・破壊されたらマナへ＋1枚ドロー<br>${sx('D')} 出たとき1枚ドロー＋次の自分のターンまでブロッカー</p>
        <h4>スートの相性（バトルで +1000）</h4>
        <p class="aff-line">${sx('S')} → ${sx('H')} → ${sx('D')} → ${sx('C')} → ${sx('S')}<br><small>矢印の左が右に強い</small></p>
        <h4>カード</h4>
        <p>2〜10：数字×1000　9・10はW<br>A：12000・W・攻撃時3000以下破壊<br>J：呪文（S・トリガー）<br>Q：進化・11000・W　K：15000・T・登場効果<br>黒JK：10000・SA・BL・8000以下破壊<br>赤JK：8000・RB・DR・シールド+1</p>
        <h4>役（場のクリーチャー）</h4>
        <p>ペア+1000　ツーペア+2000　スリーカード+3000<br>フルハウス+3000　フォーカード+5000<br>3連+1000　4連+2000　ストレート+3000<br>フラッシュ（同スート4体）+2000<br>ストレートフラッシュ+5000</p>
        <h4>👑 超進化</h4>
        <p>場の同じスートのQにKを重ねる（コスト5）→ パワー20000・T・すぐ攻撃OK</p>
        <h4>💀 墓地召喚（1試合1回）</h4>
        <p>墓地の5枚を除外して、山札か墓地のジョーカーを場に出す</p>
        <h4>👑 ロイヤル</h4>
        <p>同じスートの 10・J・Q・K・A が場＋マナにそろうと即勝利</p>
      </div>`;
    el.querySelector('[data-a=x]').onclick = () => { sfx.click(); el.classList.add('hidden'); };
    el.classList.remove('hidden');
  }

  // ---------------- セリフ ----------------
  speak(card, text) {
    if (!text || !this.app.settings.lines) return;
    const el = this.elOf(card.uid);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'speech';
    d.textContent = text;
    $('fx-layer').appendChild(d);
    const w = d.offsetWidth;
    d.style.left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 6), innerWidth - w - 6) + 'px';
    d.style.top = Math.max(r.top - d.offsetHeight - 8, 6) + 'px';
    setTimeout(() => d.remove(), 1700 / fx.fxConf.speed);
  }

  // ---------------- 振り返りグラフ ----------------
  showReview() {
    const g = this.game;
    if (!g || !g.history.length) return;
    const h = g.history;
    const palette = ['#2fa8ff', '#ff4d5e', '#ffc531', '#2fbf71'];
    const colorOf = (i) => palette[(i - this.viewerIdx + g.n) % g.n];
    const chart = (key, label) => {
      const W = 320, H = 130, L = 30, B = 20, T = 10, R = 8;
      const max = Math.max(1, ...h.flatMap((x) => x[key]));
      const xs = (k) => L + (h.length <= 1 ? 0 : (k / (h.length - 1)) * (W - L - R));
      const ys = (v) => T + (1 - v / max) * (H - T - B);
      const ticks = [0, Math.round(max / 2), max];
      const fmt = (v) => (key === 'power' ? (v >= 1000 ? Math.round(v / 1000) + 'k' : v) : v);
      const lines = g.players.map((p) => {
        const pts = h.map((x, k) => `${xs(k).toFixed(1)},${ys(x[key][p.index]).toFixed(1)}`).join(' ');
        const me = p.index === this.viewerIdx;
        return `<polyline points="${pts}" fill="none" stroke="${colorOf(p.index)}" stroke-width="${me ? 2.6 : 1.6}" stroke-linejoin="round" stroke-linecap="round" opacity="${me ? 1 : 0.85}"/>`;
      }).join('');
      return `<figure class="rv"><figcaption>${label}</figcaption>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
          ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}" stroke="rgba(160,180,255,.15)"/><text x="${L - 5}" y="${ys(t) + 3}" text-anchor="end" font-size="9" fill="#9aa3c9">${fmt(t)}</text>`).join('')}
          ${lines}
          <text x="${L}" y="${H - 5}" font-size="9" fill="#9aa3c9">ターン1</text><text x="${W - R}" y="${H - 5}" text-anchor="end" font-size="9" fill="#9aa3c9">ターン${h[h.length - 1].turn}</text>
        </svg></figure>`;
    };
    const legend = g.players.map((p) => `<span><i style="background:${colorOf(p.index)}"></i>${esc(p.name)}</span>`).join('');
    const m = this.openModal(`<h2>📈 振り返り<small>ターンごとの移り変わり</small></h2>
      <div class="rv-legend">${legend}</div>
      ${chart('shields', '🛡 シールドの枚数')}${chart('power', '⚔ 場のパワーの合計')}${chart('mana', '💎 マナの枚数')}
      <div class="btns"><button class="btn primary" data-a="close">閉じる</button></div>`, { center: true });
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  // ---------------- スタンプ ----------------
  showStamp(pi, text) {
    const side = pi === this.viewerIdx ? 'bot' : 'top';
    const r = this.anchorEl(pi, 'name').getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'stamp-bubble from-' + side;
    d.textContent = text;
    d.style.left = Math.min(Math.max(r.left + 60, 60), innerWidth - 60) + 'px';
    d.style.top = (side === 'top' ? r.bottom + 10 : r.top - 52) + 'px';
    $('fx-layer').appendChild(d);
    sfx.click();
    setTimeout(() => d.remove(), 2500);
  }

  // ---------------- ログ・トースト ----------------
  addLog(msg, pi) {
    const body = $('log-body');
    const d = document.createElement('div');
    d.className = pi === null || pi === undefined ? 'sys' : 'p' + pi;
    d.textContent = msg;
    body.appendChild(d);
    while (body.children.length > 300) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
  }

  toast(msg) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }

  // ---------------- モーダル ----------------
  openModal(html, { center = false, dismiss = true, onDismiss = null } = {}) {
    const m = document.createElement('div');
    m.className = 'modal' + (center ? ' center' : '');
    m.innerHTML = `<div class="sheet">${html}</div>`;
    $('modal-root').appendChild(m);
    this.modalCount++;
    let closed = false;
    const close = () => { if (closed) return; closed = true; this.modalCount--; m.remove(); };
    if (dismiss) m.addEventListener('click', (e) => { if (e.target === m) { close(); onDismiss && onDismiss(); } });
    return { el: m, close };
  }

  // ---------------- 人間の手番 ----------------
  isMine(pi) { return !this.spectator && !this.game.p(pi).controller.isAI && !this.game.p(pi).controller.isRemote; }

  /** 自分の手番：次の操作（charge / play / attack / end）を待つ */
  humanAction(pi) {
    if (this.queuedSurrender) { this.queuedSurrender = false; return Promise.resolve({ t: 'surrender' }); }
    return new Promise((res) => {
      this.actionResolve = res;
      this.lastTick = Date.now();
      this.render();
      this.scheduleAutoEnd();
    });
  }

  /** やれることが何もないか（マナチャージ・召喚・攻撃のどれもできない） */
  noMoves() {
    const g = this.game, v = this.viewerIdx, me = g.p(v);
    if (g.canCharge(v) && me.hand.length) return false;
    if (me.hand.some((c) => g.canPlay(v, c).ok)) return false;
    if (me.battle.some((c) => g.canAttack(v, c))) return false;
    return true;
  }

  /** やれることがなければ、少し待って自動でターン終了 */
  scheduleAutoEnd() {
    clearTimeout(this.autoEndTimer);
    if (!this.app.settings.autoEnd || !this.canAct() || !this.noMoves()) return;
    this.autoEndTimer = setTimeout(() => {
      if (!this.canAct() || !this.noMoves()) return;
      if (this.modalCount > 0 || this.drag) { this.scheduleAutoEnd(); return; }
      this.toast('やれることがないので自動でターン終了');
      this.submit({ t: 'end' });
    }, 1100 / fx.fxConf.speed);
  }

  // ---------------- 持ち時間（オンラインのみ） ----------------
  get timerOn() { return this.mode === 'online' && !this.spectator && !!this.game && this.game.winner === null; }

  tick() {
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const el = $('timer');
    if (!this.timerOn) { el.textContent = ''; return; }
    let show = null;
    // 自分のターンの操作：待っている間だけ減る
    if (this.actionResolve && this.canAct()) {
      this.turnBudget -= dt;
      show = this.turnBudget;
      if (this.turnBudget <= 0) {
        this.toast('時間切れ！ ターン終了');
        sfx.error();
        this.abortChoiceModals();
        this.submit({ t: 'end' });
      }
    }
    // ブロック・S・トリガー・対象選択
    for (const [key, t] of this.timers) {
      const left = t.deadline - now;
      show = show === null ? left : Math.min(show, left);
      if (left <= 0) { this.timers.delete(key); t.onTimeout(); }
    }
    if (show === null) { el.textContent = ''; return; }
    const sec = Math.max(0, Math.ceil(show / 1000));
    el.textContent = `⏱ ${sec}`;
    el.classList.toggle('low', sec <= 10);
  }

  abortChoiceModals() {
    for (const [key, t] of [...this.timers]) { this.timers.delete(key); t.onTimeout(); }
    if (this.attacker) { this.attacker = null; }
    document.querySelectorAll('#modal-root .modal').forEach((m) => m.remove());
    this.modalCount = 0;
  }

  canAct() {
    return !!this.actionResolve && !!this.game && this.game.winner === null && this.game.turn === this.viewerIdx && !this.spectator;
  }

  submit(action) {
    if (!this.canAct()) return;
    const r = this.actionResolve;
    this.actionResolve = null;
    this.attacker = null;
    this.render({ flip: false });
    r(action);
  }

  endTurn() {
    if (!this.canAct() || this.attacker) return;
    sfx.click();
    this.submit({ t: 'end' });
  }

  actionError(reason) {
    sfx.error();
    this.toast(reason);
  }

  /** 投了・切断などで、待っている選択をすべて打ち切る */
  abortPending() {
    if (this.actionResolve) { const r = this.actionResolve; this.actionResolve = null; r({ t: 'abort' }); }
    for (const f of [...this.pending]) f();
    this.pending.clear();
    document.querySelectorAll('#modal-root .modal').forEach((m) => m.remove());
    this.modalCount = 0;
  }

  /** モーダルで選ぶ Promise を、打ち切り可能な形で作る */
  waitChoice(build, abortValue, timeoutValue = abortValue) {
    return new Promise((res) => {
      let done = false;
      const key = Symbol('choice');
      const finish = (v) => { if (done) return; done = true; this.pending.delete(abort); this.timers.delete(key); res(v); };
      const abort = () => finish(abortValue);
      this.pending.add(abort);
      const m = build(finish);
      if (this.timerOn) {
        this.timers.set(key, {
          deadline: Date.now() + 20000,
          onTimeout: () => { if (m) m.close(); this.toast('時間切れ'); finish(timeoutValue); },
        });
      }
    });
  }

  // ---------------- 3Dカードビューア ----------------
  /** 指（マウス）でくるくる回して表と裏を見られる */
  openViewer(card) {
    const d = def(card);
    const m = this.openModal(`<div class="v3d"><div class="v3d-stage"><div class="v3d-card"><div class="v3d-f">${faceHTML(card)}</div><div class="v3d-b">${this.backHTML()}</div></div></div>
        <div class="v3d-shadow"></div></div>
      <div class="v3d-info"><div class="dname">${esc(d.name)}</div>
        <div class="dmeta">コスト ${d.cost}${d.type === 'spell' ? '・呪文' : `・パワー ${d.power}`}${card.foil ? `・${card.foil === 'rainbow' ? '虹' : '金'}カード` : ''}</div>
        <div class="dtext">${describe(card).map((t) => `<p>${esc(t)}</p>`).join('') || '<p>（能力なし）</p>'}</div></div>
      <div class="btns row"><button class="btn" data-a="flip">🔄 裏返す</button><button class="btn primary" data-a="close">閉じる</button></div>`, { center: true });
    m.el.querySelector('.sheet').classList.add('v3d-sheet');
    const el = m.el.querySelector('.v3d-card');
    const stage = m.el.querySelector('.v3d-stage');
    let ry = -18, rx = 8, vy = 0.35, vx = 0, drag = null, alive = true, target = null;
    const apply = () => {
      el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      // 角度で表と裏を切りかえ（裏面は鏡写しにならないように180度回して置いてある）
      const back = Math.cos((ry * Math.PI) / 180) * Math.cos((rx * Math.PI) / 180) < 0;
      el.classList.toggle('show-back', back);
      // 光の向きもカードの傾きに合わせる
      document.documentElement.style.setProperty('--gx', (Math.sin((ry * Math.PI) / 180)).toFixed(3));
      document.documentElement.style.setProperty('--gy', (Math.sin((rx * Math.PI) / 180)).toFixed(3));
    };
    const tick = () => {
      if (!alive) return;
      if (!drag) {
        if (target !== null) { ry += (target - ry) * 0.12; if (Math.abs(target - ry) < 0.5) { ry = target; target = null; } }
        else { ry += vy; rx += vx; vy = vy * 0.97 + (Math.sign(vy || 1) * 0.35) * 0.03; vx *= 0.92; rx += (8 - rx) * 0.02; }
        apply();
      }
      requestAnimationFrame(tick);
    };
    stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, t: performance.now() }; stage.setPointerCapture(e.pointerId); target = null; });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const dt = Math.max(16, performance.now() - drag.t);
      ry += dx * 0.6; rx = Math.max(-60, Math.min(60, rx - dy * 0.4));
      vy = (dx * 0.6) / (dt / 16); vx = (-dy * 0.4) / (dt / 16);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      apply();
    });
    const up = () => { drag = null; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    m.el.querySelector('[data-a=flip]').onclick = () => { sfx.click(); target = Math.round((ry + 180) / 180) * 180; vy = 0.35; };
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); alive = false; m.close(); };
    m.el.addEventListener('click', (e) => { if (e.target === m.el) alive = false; });
    apply();
    requestAnimationFrame(tick);
  }

  // ---------------- 長押しで拡大 ----------------
  bindPeek(root, getCard) {
    let timer = null, start = null, shown = false;
    const clear = () => { clearTimeout(timer); timer = null; };
    const begin = (target, x, y) => {
      const card = getCard(target);
      if (!card) return;
      start = { x, y };
      clear();
      timer = setTimeout(() => {
        timer = null;
        shown = true;
        if (this.drag) { this.drag.el.style.transform = ''; this.drag = null; } // スワイプは取り消し
        this.suppressClick = true;
        this.showPeek(card, () => { shown = false; setTimeout(() => { this.suppressClick = false; }, 150); });
      }, 380);
    };
    const move = (x, y) => { if (timer && start && Math.hypot(x - start.x, y - start.y) > 12) clear(); };
    // 指を離したら閉じる
    const end = () => {
      clear();
      if (shown) { shown = false; this.hidePeek(); setTimeout(() => { this.suppressClick = false; }, 150); }
    };
    root.addEventListener('pointerdown', (e) => begin(e.target, e.clientX, e.clientY));
    addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    addEventListener('pointerup', end);
    addEventListener('touchend', end);
    // iPhone は長押しの途中で pointercancel を出すことがあるので、そこでは閉じない（表示前なら取り消すだけ）
    addEventListener('pointercancel', () => { if (!shown) clear(); });
    root.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  showPeek(card, onClose) {
    this.hidePeek();
    const d = def(card);
    const g = this.game;
    const inBattle = g && g.findZone(card) && g.findZone(card).zone === 'battle';
    const power = inBattle ? g.power(card) : d.power;
    const bonus = power - d.power;
    const p = document.createElement('div');
    p.className = 'peek';
    // 指を離しても閉じなかったとき用：タップで閉じる
    p.addEventListener('click', () => { this.hidePeek(); if (onClose) onClose(); });
    p.innerHTML = `<div class="peek-card">${faceHTML(card)}</div>
      <div class="peek-info"><div class="dname">${esc(d.name)}</div>
        <div class="dmeta">コスト ${d.cost}${d.type === 'spell' ? '・呪文' : `・パワー <b>${power}</b>${bonus ? ` <span class="bonus">（役 +${bonus}）</span>` : ''}`}</div>
        <div class="dtext">${describe(card).map((t) => `<p>${esc(t)}</p>`).join('') || '<p>（能力なし）</p>'}</div>
        <div class="peek-hint">指を離すと閉じます</div></div>`;
    document.body.appendChild(p);
    if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* 無視 */ }
  }

  hidePeek() { document.querySelectorAll('.peek').forEach((x) => x.remove()); }

  // ---------------- スワイプ操作（上＝召喚、下＝マナ） ----------------
  bindSwipe() {
    const hand = $('bot-hand');
    const reset = (d) => { if (d) { d.el.style.transform = ''; d.el.classList.remove('swipe-up', 'swipe-down'); } };
    hand.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.card[data-uid]');
      if (!el || this.spectator) return;
      this.drag = { el, x: e.clientX, y: e.clientY, uid: Number(el.dataset.uid), moved: false };
    });
    addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) d.moved = true;
      if (!d.moved) return;
      d.el.style.transform = `translateY(${dy}px) rotate(${dx / 12}deg)`;
      d.el.classList.toggle('swipe-up', dy < -50);
      d.el.classList.toggle('swipe-down', dy > 30);
    });
    addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d || !d.moved) return;
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 80);
      const dy = e.clientY - d.y;
      reset(d);
      if (dy < -50) this.swipeAct('play', d.uid);
      else if (dy > 30) this.swipeAct('charge', d.uid);
    });
    addEventListener('pointercancel', () => { reset(this.drag); this.drag = null; });
  }

  swipeAct(t, uid) {
    const g = this.game, v = this.viewerIdx;
    if (!g) return;
    if (!this.canAct()) { this.actionError('自分のターンではありません'); return; }
    const card = g.cardByUid(uid);
    if (!card || !g.p(v).hand.includes(card)) return;
    if (t === 'play') {
      const chk = g.canPlay(v, card);
      if (!chk.ok) { this.actionError(chk.reason); return; }
    } else if (!g.canCharge(v)) { this.actionError('マナチャージは1ターン1回です'); return; }
    sfx.click();
    this.submit({ t, uid });
  }

  onBoardClick(e) {
    if (!this.game || this.modalCount > 0 || this.suppressClick) return;
    const g = this.game, v = this.viewerIdx;

    const pile = e.target.closest('.pile');
    if (pile) {
      sfx.click();
      const m = /^opp-(\d+)-/.exec(pile.id);
      const pi = m ? Number(m[1]) : pile.id.startsWith('bot') ? v : this.focus;
      if (pile.id.endsWith('grave')) this.showGrave(pi);
      else this.toast(`山札 残り${g.p(pi).deck.length}枚`);
      return;
    }

    // 相手のタブ：上に表示する相手を切りかえ（攻撃先を選んでいる途中でもOK）
    const tab = e.target.closest('.opp-tab');
    if (tab) { sfx.click(); this.setFocus(Number(tab.dataset.pi)); return; }

    // 攻撃先選択モード
    if (this.attacker) {
      const cEl = e.target.closest('[data-uid]');
      const hit = cEl && this.findCard(Number(cEl.dataset.uid));
      if (hit && hit.pi !== v && hit.zone === 'battle' && hit.card.tapped && !g.p(hit.pi).out) {
        this.submit({ t: 'attack', uid: this.attacker.uid, target: hit.card.uid });
      } else if (e.target.closest('#top-shields') && !g.p(this.focus).out) {
        this.submit({ t: 'attack', uid: this.attacker.uid, target: 'player', tp: this.focus });
      } else if (e.target.closest('.op-shields') && !g.p(Number(e.target.closest('.op-shields').dataset.pi)).out) {
        this.submit({ t: 'attack', uid: this.attacker.uid, target: 'player', tp: Number(e.target.closest('.op-shields').dataset.pi) });
      } else {
        this.attacker = null;
        this.render({ flip: false });
      }
      return;
    }

    const cEl = e.target.closest('[data-uid]');
    if (!cEl) return;
    const hit = this.findCard(Number(cEl.dataset.uid));
    if (!hit) return;
    sfx.click();
    if (hit.zone === 'shields') { this.toast('シールド（中身は見えない）'); return; }
    if (hit.zone === 'hand' && (hit.pi !== v || this.spectator)) return;
    if (hit.zone === 'hand') return this.handSheet(hit.card);
    if (hit.zone === 'battle' && hit.pi === v && this.canAct()) return this.creatureSheet(hit.card);
    this.detailSheet(hit.card);
  }

  detailSheet(card) {
    const m = this.openModal(`${detailHTML(card)}<div class="btns"><button class="btn ghost" data-a="close">閉じる</button></div>`);
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  handSheet(card) {
    const g = this.game, v = this.viewerIdx;
    const d = def(card);
    const myTurn = this.canAct();
    const chk = g.canPlay(v, card);
    const canCharge = myTurn && g.canCharge(v);
    const playLabel = d.type === 'spell' ? '✦ 呪文を唱える' : d.evolution ? '♛ 進化させる' : '⚔ 召喚する';
    const reason = !myTurn ? '自分のターンではありません' : chk.ok ? '' : chk.reason;
    const chargeNote = myTurn && !g.canCharge(v) ? '（マナチャージは1ターン1回）' : '';
    // コンボ召喚：同じ数字のクリーチャーと一緒に出すと合計コスト-1
    const partners = myTurn ? g.comboPartners(v, card) : [];
    // 超進化：Kを同じスートのQに重ねる
    const supBases = myTurn && d.kind === 'king' ? g.superBases(v, card) : [];
    const supBtns = supBases.map((q) => `<button class="btn superevo" data-super="${q.uid}">👑 ${esc(def(q).name)} に重ねて超進化（コスト ${SUPER_COST}・パワー${d.power + SUPER_BONUS}）</button>`).join('');
    const supNote = myTurn && d.kind === 'king' && !supBases.length ? `<div class="reason">超進化：場に同じスートのQがいれば、コスト${SUPER_COST}で重ねてパワー${d.power + SUPER_BONUS}に</div>` : '';
    const comboBtns = partners.map((p2) => `<button class="btn combo" data-combo="${p2.uid}">🔗 ${esc(def(p2).name)} とコンボ召喚（コスト ${def(card).cost + def(p2).cost - 1}）</button>`).join('');
    const m = this.openModal(`${detailHTML(card)}
      <div class="btns">
        <button class="btn primary" data-a="play" ${myTurn && chk.ok ? '' : 'disabled'}>${playLabel}</button>
        ${supBtns}
        ${comboBtns}
        ${supNote}
        ${reason ? `<div class="reason">${esc(reason)}</div>` : ''}
        <button class="btn" data-a="charge" ${canCharge ? '' : 'disabled'}>💎 マナに置く ${chargeNote}</button>
        <button class="btn ghost" data-a="close">閉じる</button>
      </div>`);
    m.el.querySelector('[data-a=play]').onclick = () => { m.close(); this.submit({ t: 'play', uid: card.uid }); };
    m.el.querySelectorAll('[data-super]').forEach((b) => { b.onclick = () => { m.close(); this.submit({ t: 'superevo', uid: card.uid, base: Number(b.dataset.super) }); }; });
    m.el.querySelectorAll('[data-combo]').forEach((b) => { b.onclick = () => { m.close(); this.submit({ t: 'combo', uid: card.uid, uid2: Number(b.dataset.combo) }); }; });
    m.el.querySelector('[data-a=charge]').onclick = () => { m.close(); this.submit({ t: 'charge', uid: card.uid }); };
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  creatureSheet(card) {
    const g = this.game, v = this.viewerIdx;
    const can = g.canAttack(v, card);
    const opps = g.opps(v);
    const tappedOpp = opps.flatMap((p) => p.battle.filter((c) => c.tapped));
    let why = '';
    if (!can) why = card.tapped ? 'タップ状態なので攻撃できません' : '召喚したばかり（召喚酔い）なので攻撃できません';
    const br = def(card).breaker;
    const multi = g.n > 2;
    // 攻撃できる相手プレイヤーごとにボタン（注目中の相手を先頭に）
    const order = [...opps].sort((a, b) => (b.index === this.focus) - (a.index === this.focus));
    const playerBtns = order.map((opp) => {
      const who = multi ? `${esc(opp.name)} の` : '';
      const label = opp.shields.length === 0 ? `💥 ${multi ? esc(opp.name) + ' に' : ''}ダイレクトアタック！` : `🛡 ${who}シールドを攻撃（${Math.min(br, opp.shields.length)}枚ブレイク${multi ? `・残り${opp.shields.length}` : ''}）`;
      return `<button class="btn primary" data-tp="${opp.index}" ${can ? '' : 'disabled'}>${label}</button>`;
    }).join('');
    const m = this.openModal(`${detailHTML(card)}
      <div class="btns">
        ${playerBtns}
        <button class="btn" data-a="creature" ${can && tappedOpp.length ? '' : 'disabled'}>⚔ タップ中のクリーチャーを攻撃（${tappedOpp.length}体）</button>
        ${why ? `<div class="reason">${why}</div>` : ''}
        <button class="btn ghost" data-a="close">閉じる</button>
      </div>`);
    m.el.querySelectorAll('[data-tp]').forEach((b) => {
      b.onclick = () => { m.close(); this.submit({ t: 'attack', uid: card.uid, target: 'player', tp: Number(b.dataset.tp) }); };
    });
    m.el.querySelector('[data-a=creature]').onclick = () => {
      m.close();
      if (tappedOpp.length === 1) { this.submit({ t: 'attack', uid: card.uid, target: tappedOpp[0].uid }); return; }
      // 注目中の相手にタップ中のクリーチャーがいなければ、いる相手に切りかえ
      if (!g.p(this.focus).battle.some((c) => c.tapped)) this.focus = tappedOpp[0].owner;
      this.attacker = card;
      this.render({ flip: false });
    };
    m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  }

  showGrave(pi) {
    const pl = this.game.p(pi);
    const list = pl.grave.length
      ? `<div class="pick-list">${[...pl.grave].reverse().map((c) => `<div class="pick-item">${faceHTML(c)}</div>`).join('')}</div>`
      : '<p style="text-align:center;color:var(--muted)">墓地は空です</p>';
    const g = this.game;
    const mine = pi === this.viewerIdx && !this.spectator;
    const chk = mine ? g.canGraveSummon(pi) : null;
    const gs = mine ? `<button class="btn gravesummon" data-a="gs" ${this.canAct() && chk.ok ? '' : 'disabled'}>💀 墓地召喚：${GRAVE_COST}枚を除外してジョーカーを呼ぶ（1試合1回）</button>${chk.ok ? '' : `<div class="reason">${esc(pl.graveUsed ? '墓地召喚は使用済み' : chk.reason)}</div>`}` : '';
    const ex = pl.exile.length ? `<p style="text-align:center;color:var(--muted);font-size:12px">除外ゾーン：${pl.exile.length}枚</p>` : '';
    const m = this.openModal(`<h2>${esc(pl.name)} の墓地（${pl.grave.length}枚）</h2>${list}${ex}<div class="btns">${gs}<button class="btn ghost" data-a="close">閉じる</button></div>`);
    m.el.querySelector('[data-a=close]').onclick = () => m.close();
    const b = m.el.querySelector('[data-a=gs]');
    if (b) b.onclick = () => { m.close(); this.submit({ t: 'gravesummon' }); };
  }

  whoLabel() { return ''; }

  /** 効果の対象などを選ぶ */
  pickCard(pi, options, ctx) {
    return this.waitChoice((res) => {
      const items = options.map((c, i) => {
        const owner = this.game.p(c.owner);
        const zone = this.findCard(c.uid);
        const where = zone ? { battle: 'バトルゾーン', grave: '墓地', hand: '手札', mana: 'マナ' }[zone.zone] : '';
        return `<div class="pick-item" data-i="${i}">${faceHTML(c)}<small>${esc(owner.name)}・${where}</small></div>`;
      }).join('');
      const m = this.openModal(`<h2>${esc(ctx.prompt)}${this.whoLabel(pi)}</h2>
        <div class="pick-list">${items}</div>
        <div class="btns">${ctx.optional ? '<button class="btn ghost" data-a="skip">選ばない</button>' : ''}</div>`, { center: true, dismiss: false });
      m.el.querySelectorAll('.pick-item').forEach((it) => {
        it.onclick = () => { sfx.click(); m.close(); res(options[Number(it.dataset.i)]); };
      });
      const sk = m.el.querySelector('[data-a=skip]');
      if (sk) sk.onclick = () => { sfx.click(); m.close(); res(null); };
      return m;
    }, null, ctx.optional ? null : options[0]);
  }

  askBlock(pi, attacker, blockers, ctx) {
    return this.waitChoice((res) => {
      const g = this.game;
      const targetName = ctx.target === 'player' ? 'あなた' : def(ctx.target).name;
      const items = blockers.map((c, i) => {
        const bp = this.game.power(c), ap = this.game.power(attacker);
        const win = bp > ap ? '勝てる！' : bp === ap ? '相打ち' : '負ける';
        return `<div class="pick-item" data-i="${i}">${faceHTML(c)}<small>${win}</small></div>`;
      }).join('');
      const m = this.openModal(`<h2>🛡 ブロックしますか？${this.whoLabel(pi)}
          <small>${esc(def(attacker).name)}（${this.game.power(attacker)}）が ${esc(targetName)} を攻撃！</small></h2>
        ${ctx.lethal ? '<div class="reason" style="font-size:14px;font-weight:800">⚠ ブロックしないと負けます！</div>' : ''}
        <div class="vs-row">${faceHTML(attacker)}<div class="vs">→</div><div style="font-weight:800">${esc(targetName)}</div></div>
        <p style="text-align:center;margin:8px 0 0;font-size:12px;color:var(--muted)">ブロックに使うクリーチャーをタップ</p>
        <div class="pick-list">${items}</div>
        <div class="btns"><button class="btn ghost" data-a="no">ブロックしない</button></div>`, { center: true, dismiss: false });
      m.el.querySelectorAll('.pick-item').forEach((it) => {
        it.onclick = () => { sfx.click(); m.close(); res(blockers[Number(it.dataset.i)]); };
      });
      m.el.querySelector('[data-a=no]').onclick = () => { sfx.click(); m.close(); res(null); };
      return m;
    }, null);
  }

  /** シールド仕込み：手札から1枚えらんでシールドの1枚と入れかえる */
  askPlant(pi) {
    return this.waitChoice((res) => {
      const hand = this.game.p(pi).hand;
      const m = this.openModal(`<h2>🛡 シールドに仕込みますか？${this.whoLabel(pi)}<small>手札から1枚をシールドに入れ、かわりにシールドの1枚が手札に来ます。<br>S・トリガー（J・ジョーカー）を仕込むと、割られたときにタダで使えます</small></h2>
        <div class="pick-list">${hand.map((c, i) => `<div class="pick-item" data-i="${i}">${faceHTML(c)}${def(c).trigger ? '<small style="color:#ffd45a">⚡S・トリガー</small>' : '<small>&nbsp;</small>'}</div>`).join('')}</div>
        <div class="btns"><button class="btn ghost" data-a="skip">仕込まない</button></div>`, { center: true, dismiss: false });
      m.el.querySelectorAll('.pick-item').forEach((it) => { it.onclick = () => { sfx.click(); m.close(); res(hand[Number(it.dataset.i)]); }; });
      m.el.querySelector('[data-a=skip]').onclick = () => { sfx.click(); m.close(); res(null); };
      return m;
    }, null);
  }

  /** マリガン：最初の手札を引き直すか */
  askMulligan(pi) {
    return this.waitChoice((res) => {
      const hand = this.game.p(pi).hand;
      const m = this.openModal(`<h2>🔄 手札を引き直しますか？${this.whoLabel(pi)}<small>1回だけ、手札を山札に戻して同じ枚数を引き直せます</small></h2>
        <div class="pick-list">${hand.map((c) => `<div class="pick-item">${faceHTML(c)}</div>`).join('')}</div>
        <div class="btns row"><button class="btn primary" data-a="keep">このまま</button><button class="btn" data-a="redo">引き直す</button></div>`, { center: true, dismiss: false });
      m.el.querySelector('[data-a=keep]').onclick = () => { sfx.click(); m.close(); res(false); };
      m.el.querySelector('[data-a=redo]').onclick = () => { sfx.click(); m.close(); res(true); };
      return m;
    }, false);
  }

  askTrigger(pi, card) {
    return this.waitChoice((res) => {
      const m = this.openModal(`<h2 style="color:var(--gold)">⚡ S・トリガー！${this.whoLabel(pi)}<small>コストを払わずに使えます</small></h2>
        ${detailHTML(card)}
        <div class="btns row"><button class="btn primary" data-a="yes">使う！</button><button class="btn ghost" data-a="no">使わない</button></div>`, { center: true, dismiss: false });
      m.el.querySelector('[data-a=yes]').onclick = () => { m.close(); res(true); };
      m.el.querySelector('[data-a=no]').onclick = () => { sfx.click(); m.close(); res(false); };
      return m;
    }, false);
  }

  // =========================================================
  //  エンジンからのイベント → 演出
  // =========================================================
  async event(type, d) {
    if (this.ended && type !== 'gameover') return;
    switch (type) {
      case 'setup': this.render({ flip: false }); return;
      case 'coin': return this.onCoin(d);
      case 'turnStart': return this.onTurnStart(d);
      case 'turnEnd': this.attacker = null; this.render(); return;
      case 'draw':
        this.spawn.set(String(d.card.uid), this.pileRect(d.pi, 'deck'));
        this.render(); sfx.draw();
        await fx.wait(260); return;
      case 'charge': return this.onCharge(d);
      case 'pay': this.render(); await fx.wait(140); return;
      case 'summon': return this.onSummon(d);
      case 'cast': return this.onCast(d);
      case 'spellDone': {
        this.render();
        await fx.wait(200);
        return;
      }
      case 'attack': return this.onAttack(d);
      case 'block': return this.onBlock(d);
      case 'battle': return this.onBattle(d);
      case 'destroy': return this.onDestroy(d);
      case 'rebirth': {
        this.render();
        const el = this.elOf(d.card.uid);
        if (el) { fx.rise(el.getBoundingClientRect(), '#ff6a3d', 26); fx.floatText(fx.center(el.getBoundingClientRect()).x, el.getBoundingClientRect().top, 'リバース！', 'small'); }
        await fx.wait(380); return;
      }
      case 'break': return this.onBreak(d);
      case 'shieldsToHand': this.render(); await fx.wait(380); return;
      case 'triggerCheck': {
        const el = this.elOf(d.card.uid);
        if (el) fx.sparkle(el.getBoundingClientRect(), '#ffd45a', 20);
        await fx.wait(250); return;
      }
      case 'trigger': return this.onTrigger(d);
      case 'direct': return this.onDirect(d);
      case 'effect': return this.onEffect(d);
      case 'toHand':
        if (d.from === 'grave') this.spawn.set(String(d.card.uid), this.pileRect(d.pi, 'grave'));
        this.render(); await this.sparkleUid(d.card.uid, '#ffffff'); return;
      case 'manaAdd':
        this.spawn.set(String(d.card.uid), this.pileRect(d.pi, 'deck'));
        this.render(); sfx.charge(); await this.sparkleUid(d.card.uid, '#ffd45a'); return;
      case 'shieldAdd':
        this.spawn.set(String(d.card.uid), this.pileRect(d.pi, 'deck'));
        this.render(); sfx.charge();
        { const el = this.elOf(d.card.uid); if (el) fx.ring(fx.center(el.getBoundingClientRect()).x, fx.center(el.getBoundingClientRect()).y, '#9fd8ff', 8, 2, 30); }
        await fx.wait(380); return;
      case 'revive':
        this.spawn.set(String(d.card.uid), this.pileRect(d.pi, 'grave'));
        fx.flash('#ff6a3d', 300);
        this.toast(`${def(d.card).name} が墓地から復活！`);
        await fx.wait(200); return;
      case 'toast': this.toast(d.msg); await fx.wait(450); return;
      case 'log': this.addLog(d.msg, d.pi); return;
      case 'gameover': return this.onGameOver(d);
      case 'hand': return this.onHand(d);
      case 'royal': return this.onRoyal(d);
      case 'eliminated': return this.onEliminated(d);
      case 'mulligan':
        this.render();
        sfx.draw();
        this.toast(d.pi === this.viewerIdx && !this.spectator ? '手札を引き直しました' : `${this.game.p(d.pi).name} は手札を引き直した`);
        await fx.wait(400); return;
      case 'plant':
        this.render({ flip: false });
        sfx.charge();
        this.toast(d.pi === this.viewerIdx && !this.spectator ? 'シールドに仕込みました（★のシールド）' : `${this.game.p(d.pi).name} はシールドに1枚仕込んだ`);
        await fx.wait(350); return;
      case 'combo': {
        sfx.hand();
        fx.flash('#7dffb0', 250);
        await fx.cutin({ title: 'COMBO!!', sub: `${def(d.cards[0]).name} ＆ ${def(d.cards[1]).name}`, color: '#2fbf71', ms: 1100 });
        return;
      }
      case 'superEvo': {
        this.render({ flip: false });
        sfx.king(); sfx.royal();
        fx.flash('#fff3b0', 420);
        const el = this.elOf(d.card.uid);
        if (el) { const r = el.getBoundingClientRect(); const c = fx.center(r); fx.burst(c.x, c.y, '#ffd45a', 60, 9); fx.ring(c.x, c.y, '#ffe9a0', 14, 5, 40); fx.shake(document.body, 'l'); }
        await fx.cutin({ title: '超進化!!', sub: `${def(d.base).name} → ${def(d.card).name}　パワー${def(d.card).power + SUPER_BONUS}`, color: '#ffb300', cls: 'super', ms: 1700 });
        return;
      }
      case 'graveSummon': {
        this.render({ flip: false });
        sfx.joker();
        fx.flash('#6b2bd9', 500);
        const r = this.pileRect(d.pi, 'grave');
        if (r) { const c = fx.center(r); fx.burst(c.x, c.y, '#a066ff', 50, 7); fx.ring(c.x, c.y, '#c9a2ff', 12, 4, 36); }
        await fx.cutin({ title: '墓地召喚!!', sub: `${d.exiled.length}枚をささげて ${def(d.card).name} 降臨`, color: '#7b3cff', ms: 1500 });
        return;
      }
      case 'secondBonus':
        this.render({ flip: false });
        this.toast('後攻ボーナス：先攻以外はシールド+1');
        await fx.wait(300); return;
      default:
    }
  }

  async sparkleUid(uid, color) {
    const el = this.elOf(uid);
    if (el) fx.sparkle(el.getBoundingClientRect(), color, 14);
    await fx.wait(300);
  }

  async onCoin({ first }) {
    const wrap = document.createElement('div');
    wrap.className = 'coin-wrap';
    const name = this.mode === 'cpu' ? (first === 0 ? 'あなたが先攻！' : `${this.game.p(first).name} が先攻！`)
      : this.mode === 'online' && !this.spectator ? (first === this.viewerIdx ? 'あなたが先攻！' : `${this.game.p(first).name} が先攻！`)
      : `${this.game.p(first).name} が先攻！`;
    wrap.innerHTML = `<div class="coin">${['♠', '♥', '♦', '♣'][first % 4]}</div><div class="coin-label">${esc(name)}</div>`;
    $('fx-layer').appendChild(wrap);
    sfx.coin();
    await fx.wait(1250);
    sfx.turn();
    const r = wrap.querySelector('.coin').getBoundingClientRect();
    fx.burst(fx.center(r).x, fx.center(r).y, '#ffc531', 40, 7);
    await fx.wait(1000);
    wrap.remove();
  }

  async onTurnStart({ pi, count }) {
    this.attacker = null;
    if (pi === this.viewerIdx) this.turnBudget = 60000;
    else if (this.game.n > 2) this.focus = pi; // 動いている相手を上に表示
    this.render();
    sfx.turn();
    const mine = pi === this.viewerIdx;
    const title = this.spectator ? `${this.game.p(pi).name}` : mine ? 'YOUR TURN' : this.mode === 'online' || this.game.n > 2 ? `${this.game.p(pi).name} のターン` : 'ENEMY TURN';
    await fx.cutin({ title, sub: `TURN ${count}`, cls: 'turn', color: mine ? '#2fa8ff' : '#ff4d5e', ms: 950 });
  }

  async onCharge({ pi, card }) {
    this.render();
    sfx.charge();
    const el = this.elOf(card.uid);
    if (el) {
      const r = el.getBoundingClientRect();
      const color = SUITS[card.joker ? 'X' : card.suit].glow;
      fx.sparkle(r, color, 16);
      fx.ring(fx.center(r).x, fx.center(r).y, color, 6, 2.5, 26);
    }
    await fx.wait(420);
  }

  async onSummon({ pi, card, evolve, trigger }) {
    const d = def(card);
    const s = card.joker ? 'X' : card.suit;
    const color = SUITS[s].color;
    const board = this.board;
    if (d.big) await this.showcase(card, d, color);
    else sfx.summon();
    if (pi !== this.viewerIdx) {
      // 相手の手札から飛び出す
      const hand = this.anchorEl(pi, 'hand').getBoundingClientRect();
      if (!this.elOf(card.uid)) this.spawn.set(String(card.uid), hand);
    }
    this.render();
    const el = this.elOf(card.uid);
    if (el) {
      const r = el.getBoundingClientRect();
      const c = fx.center(r);
      fx.ring(c.x, c.y, SUITS[s].glow, 8, 4, 32);
      fx.burst(c.x, c.y, color, d.big ? 60 : 28, d.big ? 9 : 6);
      fx.animate(el.querySelector('.ci'), [{ filter: 'brightness(3)' }, { filter: 'none' }], 500);
      if (d.big) fx.shake(board, 'm');
      if (has(card, 'speed') && !card.joker) fx.floatText(c.x, r.top, 'スピードアタッカー！', 'small gold');
      this.speak(card, summonLine(card));
    }
    await fx.wait(d.big ? 380 : 480);
  }

  /** K・A・Q・JOKER 専用の登場演出 */
  async showcase(card, d, color) {
    const kind = d.kind;
    const conf = {
      king: { title: 'KING', sub: '皇帝 降臨', ms: 1900 },
      ace: { title: 'DRAGON', sub: '竜 降臨', ms: 1900 },
      queen: { title: '進化!!', sub: '女帝 覚醒', ms: 1700 },
      joker: d.red ? { title: 'RED JOKER', sub: '紅蓮の道化師', ms: 1900 } : { title: 'BLACK JOKER', sub: '漆黒の道化師', ms: 1900 },
    }[kind];
    const ms = conf.ms / fx.fxConf.speed;
    const d0 = document.createElement('div');
    d0.className = `showcase sc-${kind}`;
    d0.style.setProperty('--ci', color);
    d0.style.setProperty('--dur', ms + 'ms');
    const letters = [...conf.title].map((ch, i) => `<i style="animation-delay:${(i * 60) / fx.fxConf.speed}ms">${ch}</i>`).join('');
    d0.innerHTML = `<div class="sc-bg"></div><div class="sc-rays"></div><div class="sc-card">${faceHTML(card)}</div>
      <div class="sc-text"><div class="sc-title">${letters}</div><div class="sc-sub">${esc(conf.sub)}</div><div class="sc-name">${esc(d.name)}</div></div>`;
    $('fx-layer').appendChild(d0);
    sfx[kind] ? sfx[kind]() : sfx.bigSummon();
    const W = innerWidth, H = innerHeight;
    const cx = W / 2, cy = H * 0.42;
    if (kind === 'king') {
      fx.flash('#ffd45a', 500);
      for (let i = 0; i < 6; i++) setTimeout(() => fx.fall(W, '#ffd45a', 10, 'crown'), (i * 120) / fx.fxConf.speed);
      setTimeout(() => { fx.ring(cx, cy, '#ffd45a', 20, 7, 40); fx.burst(cx, cy, '#fff3b0', 70, 12); fx.shake(this.board, 'l'); }, ms * 0.35);
    } else if (kind === 'ace') {
      fx.flash('#ff3b1f', 500);
      for (let i = 0; i < 8; i++) setTimeout(() => fx.rise({ left: 0, right: W, top: H * 0.3, bottom: H, width: W, height: H * 0.7 }, i % 2 ? '#ff6a3d' : '#ffd45a', 30), (i * 110) / fx.fxConf.speed);
      setTimeout(() => { fx.shake(this.board, 'l'); fx.burst(cx, cy, '#ff6a3d', 90, 14); fx.ring(cx, cy, '#ff3b1f', 16, 8, 40); }, ms * 0.4);
    } else if (kind === 'queen') {
      fx.flash(color, 400);
      for (let i = 0; i < 6; i++) setTimeout(() => fx.fall(W, '#ffc6e0', 12, 'petal'), (i * 130) / fx.fxConf.speed);
      setTimeout(() => { fx.ring(cx, cy, color, 14, 5, 36); fx.sparkle({ left: cx - 90, right: cx + 90, top: cy - 120, bottom: cy + 120 }, '#fff', 30); }, ms * 0.35);
    } else {
      fx.flash('#ffffff', 400);
      setTimeout(() => { fx.confetti(90); fx.burst(cx, cy, '#ffc531', 50, 10); fx.burst(cx, cy, '#2fa8ff', 50, 10); fx.shake(this.board, 'm'); }, ms * 0.4);
    }
    await fx.wait(conf.ms);
    d0.remove();
  }

  async onHand({ pi, names, uids }) {
    sfx.hand();
    const zone = this.anchorEl(pi, 'battle').getBoundingClientRect();
    fx.floatText(zone.left + zone.width / 2, zone.top + zone.height / 2, names.join('・') + '!!', 'gold');
    for (const u of uids) {
      const el = this.elOf(u);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      fx.ring(fx.center(r).x, fx.center(r).y, '#ffd45a', 6, 2.5, 28);
      fx.animate(el, [{ transform: 'translateY(-10px) scale(1.15)' }, { transform: 'none' }], 500);
    }
    await fx.wait(700);
  }

  /** ロイヤルストレートフラッシュ：5枚が並んで光る */
  async onRoyal({ pi, suit, cards }) {
    const color = SUITS[suit].color;
    const order = [10, 11, 12, 13, 1];
    const sorted = order.map((r) => cards.find((c) => c.rank === r)).filter(Boolean);
    const d0 = document.createElement('div');
    d0.className = 'royal-fx';
    d0.style.setProperty('--ci', color);
    d0.innerHTML = `<div class="rf-bg"></div><div class="rf-row">${sorted.map((c, i) => `<div class="rf-card" style="--i:${i}">${faceHTML(c)}</div>`).join('')}</div>
      <div class="rf-title"><span>ROYAL</span><span>STRAIGHT FLUSH</span></div><div class="rf-sub">${esc(this.game.p(pi).name)} の${SUITS[suit].sym}が揃った！</div>`;
    $('fx-layer').appendChild(d0);
    for (let i = 0; i < 5; i++) {
      await fx.wait(260);
      sfx.royalNote(i);
      const el = d0.querySelectorAll('.rf-card')[i];
      el.classList.add('lit');
      const r = el.getBoundingClientRect();
      fx.burst(fx.center(r).x, fx.center(r).y, i % 2 ? '#ffd45a' : color, 30, 7);
    }
    await fx.wait(250);
    d0.classList.add('done');
    sfx.royal();
    fx.flash('#fff6d0', 900);
    fx.shake(this.board, 'l');
    fx.confetti(220);
    for (let i = 0; i < 6; i++) setTimeout(() => fx.fall(innerWidth, '#ffd45a', 10, 'crown'), (i * 150) / fx.fxConf.speed);
    await fx.wait(2600);
    d0.remove();
  }

  async onCast({ pi, card, trigger }) {
    const d = def(card);
    const color = SUITS[card.suit].color;
    sfx.spell();
    if (!trigger) {
      await fx.cutin({ title: d.name, sub: '呪文 ─ ' + d.text.replace('呪文。S・トリガー。', ''), color, html: faceHTML(card), ms: 1350 });
    }
    this.render();
  }

  async onAttack({ pi, attacker, target, tp }) {
    this.render();
    const el = this.elOf(attacker.uid);
    const tEl = target === 'player' ? this.anchorEl(tp, 'shields') : this.elOf(target.uid) || this.anchorEl(target.owner, 'battle');
    if (this.game.n > 2 && !this.sideOf(tp)) {
      this.pulseTab(tp);
      this.toast(`${this.game.p(pi).name} → ${this.game.p(tp).name} に攻撃！`);
    }
    if (!el || !tEl) { await fx.wait(300); return; }
    const a = el.getBoundingClientRect(), t = tEl.getBoundingClientRect();
    const from = fx.center(a), to = fx.center(t);
    sfx.attack();
    if (Math.random() < 0.6) this.speak(attacker, attackLine(attacker));
    else fx.floatText(from.x, a.top - 4, 'ATTACK!', 'small');
    const dx = (to.x - from.x) * 0.75, dy = (to.y - from.y) * 0.75;
    fx.animate(el, [
      { transform: 'none', zIndex: 30 },
      { transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.1)`, zIndex: 30, offset: 0.25 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.35)`, zIndex: 30, offset: 0.6 },
      { transform: 'none', zIndex: 30 },
    ], 620);
    await fx.wait(340);
    fx.slash({ x: to.x - 40, y: to.y - 30 }, { x: to.x + 40, y: to.y + 30 }, '#ff6a3d');
    fx.slash({ x: to.x + 40, y: to.y - 30 }, { x: to.x - 40, y: to.y + 30 }, '#ffd45a');
    await fx.wait(300);
  }

  async onBlock({ pi, blocker }) {
    this.render();
    sfx.block();
    const el = this.elOf(blocker.uid);
    if (el) {
      const r = el.getBoundingClientRect();
      const c = fx.center(r);
      fx.ring(c.x, c.y, '#2fbf71', 10, 3, 30);
      fx.floatText(c.x, r.top, 'BLOCK!', 'green');
      fx.animate(el, [{ transform: 'scale(1.3)' }, { transform: 'none' }], 400);
    }
    await fx.wait(550);
  }

  async onBattle({ a, b, result, pa, pb, affA = 0, affB = 0 }) {
    const wrap = document.createElement('div');
    wrap.className = 'battle-fx';
    const ca = SUITS[a.joker ? 'X' : a.suit].color, cb = SUITS[b.joker ? 'X' : b.suit].color;
    const cls = (x) => (result === 'draw' ? 'loser' : result === x ? 'winner' : 'loser');
    wrap.innerHTML = `
      <div class="side-card left">${faceHTML(a)}<div class="pw" style="color:${ca}">${pa}</div>${affA ? `<div class="aff">相性 +${affA}</div>` : ''}</div>
      <div class="vs">VS</div>
      <div class="side-card right">${faceHTML(b)}<div class="pw" style="color:${cb}">${pb}</div>${affB ? `<div class="aff">相性 +${affB}</div>` : ''}</div>`;
    $('fx-layer').appendChild(wrap);
    await fx.wait(520);
    wrap.classList.add('clash');
    await fx.wait(170);
    sfx.clash();
    fx.flash('#ffffff', 260);
    fx.shake(this.board, 'm');
    fx.burst(innerWidth / 2, innerHeight / 2, '#ffd45a', 50, 10);
    wrap.querySelector('.left').classList.add(cls('a'));
    wrap.querySelector('.right').classList.add(cls('b'));
    const label = result === 'draw' ? '相打ち！' : 'WIN!';
    const winEl = result === 'a' ? wrap.querySelector('.left') : result === 'b' ? wrap.querySelector('.right') : wrap.querySelector('.vs');
    const wr = winEl.getBoundingClientRect();
    fx.floatText(fx.center(wr).x, wr.top + 10, label, 'gold');
    await fx.wait(900);
    wrap.remove();
  }

  async onDestroy({ pi, card, toMana }) {
    const el = this.elOf(card.uid);
    if (el) {
      const r = el.getBoundingClientRect();
      const color = SUITS[card.joker ? 'X' : card.suit].color;
      sfx.destroy();
      fx.shards(r, color, 18);
      fx.floatText(fx.center(r).x, r.top, '撃破！', 'small');
      if (!toMana) {
        const ghost = el.cloneNode(true);
        ghost.removeAttribute('data-uid');
        Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', margin: 0, zIndex: 56 });
        $('fx-layer').appendChild(ghost);
        const g = this.pileRect(pi, 'grave');
        const dx = fx.center(g).x - fx.center(r).x, dy = fx.center(g).y - fx.center(r).y;
        el.style.visibility = 'hidden';
        fx.animate(ghost, [
          { transform: 'none', opacity: 1, filter: 'brightness(2)' },
          { transform: `translate(${dx}px, ${dy}px) scale(.3) rotate(40deg)`, opacity: 0, filter: 'grayscale(1)' },
        ], 600).then(() => ghost.remove());
      }
    }
    await fx.wait(380);
    this.render();
  }

  async onBreak({ pi, card, index, total }) {
    const el = this.elOf(card.uid);
    const side = this.sideOf(pi);
    if (!el && index === 0) {
      // 画面に出ていない相手のシールド：タブで知らせる
      const tab = this.tabEl(pi);
      sfx.shieldBreak();
      if (tab) {
        const r = tab.getBoundingClientRect();
        fx.shards(r, '#ffb0b8', 14);
        fx.floatText(fx.center(r).x, r.bottom + 14, total >= 2 ? `${total}枚ブレイク!` : 'BREAK!', 'small');
        this.pulseTab(pi);
      }
    }
    if (el) {
      const r = el.getBoundingClientRect();
      sfx.shieldBreak();
      fx.shards(r, side === 'bot' ? '#9fd8ff' : '#ffb0b8', 26);
      fx.flash('#ffffff', 200);
      fx.shake(this.board, total >= 2 ? 'l' : 'm');
      if (index === 0) {
        const label = total === 3 ? 'T・ブレイク!!!' : total === 2 ? 'W・ブレイク!!' : 'BREAK!';
        fx.floatText(innerWidth / 2, fx.center(r).y, label, total >= 2 ? 'huge' : '');
      }
      el.style.visibility = 'hidden';
    }
    await fx.wait(total >= 2 ? 300 : 420);
  }

  async onTrigger({ pi, card }) {
    sfx.trigger();
    fx.flash('#ffd45a', 400);
    await fx.cutin({ title: 'S・トリガー発動!!', sub: def(card).name, cls: 'trigger', color: '#ffd45a', html: faceHTML(card), ms: 1500 });
    fx.confetti(40);
  }

  async onDirect({ pi, attacker, tp }) {
    sfx.direct();
    fx.flash('#ff1e3c', 700);
    fx.shake(this.board, 'l');
    const g = this.game;
    const sub = g.n > 2 ? `${def(attacker).name} → ${tp === this.viewerIdx && !this.spectator ? 'あなた' : g.p(tp).name}` : def(attacker).name;
    await fx.cutin({ title: 'ダイレクトアタック!!', sub, cls: 'direct', color: '#ff1e3c', ms: 1900 });
    fx.shake(this.board, 'l');
    fx.burst(innerWidth / 2, innerHeight / 2, '#ff6a3d', 120, 14);
    fx.flash('#ffffff', 600);
    await fx.wait(600);
  }

  pulseTab(pi) {
    const t = this.tabEl(pi);
    if (!t) return;
    t.classList.remove('pulse');
    void t.offsetWidth;
    t.classList.add('pulse');
  }

  /** バトルロイヤルで誰かが脱落 */
  async onEliminated({ pi, place, by }) {
    const g = this.game;
    const me = pi === this.viewerIdx && !this.spectator;
    this.render({ flip: false });
    sfx.lose();
    await fx.cutin({ title: me ? 'あなたは脱落…' : `${g.p(pi).name} 脱落！`, sub: `${place}位${by != null ? `（${g.p(by).name} のダイレクトアタック）` : ''}`, color: me ? '#5a6290' : '#ff4d5e', ms: 1500 });
    if (me && this.mode === 'cpu') {
      // ひとりで遊んでいるときは、最後まで見るか結果へ進むか選べる
      const go = await this.waitChoice((res) => {
        const m = this.openModal(`<h2>${place}位で脱落…<small>残りのCPUの戦いを最後まで見ますか？</small></h2>
          <div class="btns"><button class="btn primary" data-a="watch">👀 最後まで見る</button><button class="btn ghost" data-a="result">結果へ</button></div>`, { center: true, dismiss: false });
        m.el.querySelector('[data-a=watch]').onclick = () => { sfx.click(); m.close(); res(false); };
        m.el.querySelector('[data-a=result]').onclick = () => { sfx.click(); m.close(); res(true); };
        return m;
      }, false);
      if (go) { this.leftEarly = true; this.app.finishEarly(); }
    } else if (me) {
      this.toast('脱落しました。最後まで観戦できます');
    }
  }

  async onEffect({ targets, kind }) {
    for (const t of targets) {
      const el = this.elOf(t.uid);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const c = fx.center(r);
      if (kind === 'destroy') {
        fx.slash({ x: r.left - 10, y: r.top - 10 }, { x: r.right + 10, y: r.bottom + 10 }, '#b9a6ff');
        fx.floatText(c.x, r.top, '破壊！');
      } else if (kind === 'tap') {
        fx.ring(c.x, c.y, '#2fbf71', 6, 3, 30);
        fx.floatText(c.x, r.top, 'タップ！', 'green small');
      }
    }
    this.render();
    await fx.wait(450);
  }

  async onGameOver({ winner, reason }) {
    this.ended = true;
    this.abortPending();
    this.render({ flip: false });
    await fx.wait(300);
    const g = this.game;
    const multi = g.n > 2;
    const ranking = g.ranking();
    const place = ranking.indexOf(this.viewerIdx) + 1;
    let title, sub, win;
    if (winner === -1) { title = 'DRAW'; sub = reason; win = false; }
    else if (winner < -1) { title = `${place}位`; sub = '脱落しました'; win = false; }
    else if (this.mode === 'cpu' || (this.mode === 'online' && !this.spectator)) {
      win = g.isWinner(this.viewerIdx);
      if (g.teams) {
        title = win ? 'VICTORY' : 'DEFEAT';
        sub = win ? 'チームの勝利！' : '相手チームの勝ち…';
      } else {
        title = win ? 'VICTORY' : multi ? `${place}位` : 'DEFEAT';
        sub = win ? `${reason}で${multi ? '最後まで生き残った！' : '勝利！'}` : multi ? `${g.p(winner).name} が勝ち残りました` : `${reason}で敗北…`;
      }
      if (this.mode === 'online' && !multi) sub += `（vs ${g.opps(this.viewerIdx)[0] ? g.opps(this.viewerIdx)[0].name : g.p((this.viewerIdx + 1) % 2).name}）`;
    } else { win = true; title = 'WINNER'; sub = `${g.p(winner).name} の勝利！（${reason}）`; }
    if (win) { sfx.win(); fx.confetti(); setTimeout(() => fx.confetti(80), 900 / fx.fxConf.speed); } else sfx.lose();
    const rewards = this.app.recordResult(winner, g, { place, spectator: this.spectator, viewer: this.viewerIdx }) || [];
    const st = this.spectator ? g.stats[winner < 0 ? 0 : winner] : g.stats[this.viewerIdx];
    const d = document.createElement('div');
    d.className = 'result' + (win ? '' : ' lose');
    const rankHTML = !multi || winner < 0 ? '' : g.teams
      ? `<ol class="rank-mini">${ranking.map((i) => `<li class="${i === this.viewerIdx && !this.spectator ? 'me' : ''}"><b>${g.isWinner(i) ? '勝ち' : '負け'}</b>${esc(g.p(i).name)}</li>`).join('')}</ol>`
      : `<ol class="rank-mini">${ranking.map((i, k) => `<li class="${i === this.viewerIdx && !this.spectator ? 'me' : ''}"><b>${k + 1}位</b>${esc(g.p(i).name)}</li>`).join('')}</ol>`;
    d.innerHTML = `<div class="rtitle">${title}</div><div class="rsub">${esc(sub)}</div>${rankHTML}${this.mode === 'online' && !this.spectator && winner >= 0 && !multi ? '<div class="rrate">レート計算中…</div>' : ''}
      <div class="rstats">
        <div><b>${g.turnCount}</b>ターン</div>
        <div><b>${st.breaks}</b>ブレイク</div>
        <div><b>${st.summons}</b>召喚</div>
        <div><b>${st.spells}</b>呪文</div>
        <div><b>${st.destroys}</b>撃破</div>
        <div><b>${st.triggers}</b>Sトリガー</div>
      </div>
      <div class="btns">${this.mode === 'online'
        ? (g.n === 2 && winner >= 0 && !this.spectator && !g.isWinner(this.viewerIdx) ? '<div class="btns row"><button class="btn small" data-a="first">次は先攻がいい</button><button class="btn small" data-a="second">次は後攻がいい</button></div>' : '')
          + (this.online.isHost() ? '<button class="btn primary" data-a="again">もう一回（同じ部屋で）</button>' : '<p class="rsub" style="text-align:center;font-size:13px">ホストが「もう一回」を押すと次の対戦が始まります</p>')
          + '<button class="btn ghost" data-a="leave">部屋を出る</button>'
        : this.app.tourActive ? '<button class="btn primary" data-a="tour">🏆 トーナメント表へ</button>'
        : '<button class="btn primary" data-a="again">もう一度</button><button class="btn ghost" data-a="title">タイトルへ</button>'}
        <button class="btn ghost small" data-a="review">📈 振り返りグラフ</button></div>`;
    document.body.appendChild(d);
    if (rewards.length) setTimeout(() => this.app.showRewards(rewards), 1400 / fx.fxConf.speed);
    const on = (a, f) => { const b = d.querySelector(`[data-a=${a}]`); if (b) b.onclick = () => { sfx.click(); f(); }; };
    on('again', () => {
      if (this.mode === 'online') { this.online.again(); return; }
      // 負けた側（あなた）が先攻・後攻をえらべる（1対1）
      if (g.n === 2 && winner >= 0 && !g.isWinner(this.viewerIdx)) {
        const m = this.openModal(`<h2>🔁 リベンジ！<small>負けた側が先攻・後攻をえらべます</small></h2>
          <div class="btns row"><button class="btn primary" data-f="0">先攻でいく</button><button class="btn" data-f="1">後攻でいく</button></div>`, { center: true });
        m.el.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { sfx.click(); m.close(); d.remove(); this.app.restart({ first: Number(b.dataset.f) === 0 ? this.viewerIdx : 1 - this.viewerIdx }); }; });
        return;
      }
      d.remove();
      this.app.restart();
    });
    on('first', () => this.online.wantFirst(true));
    on('second', () => this.online.wantFirst(false));
    on('title', () => { d.remove(); this.app.toTitle(); });
    on('leave', () => { d.remove(); this.online.leave(); });
    on('review', () => this.showReview());
    on('tour', () => { d.remove(); this.app.tourNext(g.isWinner(this.viewerIdx)); });
  }
}
