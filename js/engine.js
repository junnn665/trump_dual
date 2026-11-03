// =========================================================
//  ゲームエンジン：ルール処理（DOMに依存しない）
// =========================================================
import { def, has, suitsOf, makeDeck, shuffle, SUITS, SUIT_KEYS, BEATS, AFFINITY_BONUS, cardKey } from './cards.js';

const SUIT_KEYS_ARR = SUIT_KEYS;

/** 操作データ（{t, uid, target}）を実際のルール処理に変換する。オフライン・オンライン共通 */
export async function applyAction(game, pi, a) {
  const card = a.uid != null ? game.cardByUid(a.uid) : null;
  if (!card) return { ok: false, reason: 'カードが見つかりません' };
  switch (a.t) {
    case 'charge': return game.actCharge(pi, card);
    case 'play': return game.actPlay(pi, card);
    case 'attack': {
      const target = a.target === 'player' ? 'player' : game.cardByUid(a.target);
      if (!target) return { ok: false, reason: '攻撃先が見つかりません' };
      return game.actAttack(pi, card, target, a.tp);
    }
    default: return { ok: false, reason: '不明な操作' };
  }
}

export const START_SHIELDS = 5;
export const START_HAND = 5;

const NULL_UI = { event: async () => {} };

export class Game {
  /**
   * @param {object} opt
   * @param {Array} opt.controllers [c0, c1]  takeTurn / chooseCard / chooseBlocker / useTrigger を持つ
   * @param {Array} opt.names
   * @param {object} opt.ui     event(type, data) => Promise
   */
  constructor({ controllers, names = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4'], ui = NULL_UI, rng = Math.random, first = null, setup = [], teams = null, rules = {} }) {
    // teams: [0, 1, 0, 1] のようにチーム番号（2対2）。null なら全員が敵どうし
    this.teams = teams;
    this.winnerTeam = null;
    // rules: { mulligan: true, secondBonus: true, affinity: true }
    this.rules = { mulligan: true, secondBonus: true, affinity: true, ...rules };
    this.history = []; // 振り返りグラフ用（ターンごとの記録）
    // 2〜4人に対応。setup[i]: { deck: makeDeck の spec, shields, hand, mana }（チャレンジ・マイデッキ用）
    const n = controllers.length;
    this.n = n;
    this.setup = setup;
    this.royalDone = false;
    this.handNames = Array.from({ length: n }, () => []);
    this.ui = ui;
    this.rng = rng;
    this.players = controllers.map((ctrl, i) => ({
      index: i, name: names[i], controller: ctrl,
      deck: [], hand: [], mana: [], battle: [], shields: [], grave: [],
      charged: false, out: false,
    }));
    this.outOrder = []; // 脱落した順
    this.turn = 0;
    this.turnCount = 0;
    this.winner = null;
    this.winReason = '';
    this.firstPlayer = first;
    this.busy = false;
    this.logs = [];
    this.stats = this.players.map(() => ({ summons: 0, spells: 0, breaks: 0, destroys: 0, triggers: 0, hands: [], royal: false, direct: 0, kings: 0, aces: 0, jokers: 0, maxBreak: 0, kills: 0, shieldsLost: 0, played: {} }));
  }

  // ---------- helpers ----------
  p(i) { return this.players[i]; }
  teamOf(i) { return this.teams ? this.teams[i] : i; }
  isAlly(i, j) { return i !== j && !!this.teams && this.teams[i] === this.teams[j]; }
  /** まだ残っている相手（自分と味方以外） */
  opps(i) { return this.players.filter((p) => p.index !== i && !p.out && this.teamOf(p.index) !== this.teamOf(i)); }
  allies(i) { return this.players.filter((p) => this.isAlly(i, p.index)); }

  /** スートの相性ボーナス（a が b に有利なら +1000） */
  affinity(a, b) {
    if (!this.rules.affinity || !a || !b || a.joker || b.joker) return 0;
    return BEATS[a.suit] === b.suit ? AFFINITY_BONUS : 0;
  }
  /** バトルするときのパワー（役ボーナス＋相性） */
  battlePower(a, b) { return this.power(a) + this.affinity(a, b); }
  /** 2人対戦用の「相手」（バトルロイヤルでは残っている最初の相手） */
  opp(i) { return this.opps(i)[0] || this.players[(i + 1) % this.n]; }
  alive() { return this.players.filter((p) => !p.out); }
  /** 順位（1位から）。決着後に使う */
  ranking() {
    const rest = this.alive().map((p) => p.index);
    let order = [...(this.winner >= 0 ? [this.winner] : []), ...rest.filter((i) => i !== this.winner), ...[...this.outOrder].reverse()];
    // チーム戦：勝ったチームを先に
    if (this.teams && this.winner >= 0) {
      const wt = this.teamOf(this.winner);
      order = [...order.filter((i) => this.teamOf(i) === wt), ...order.filter((i) => this.teamOf(i) !== wt)];
    }
    return order;
  }

  /** 勝ったか（チーム戦なら味方が勝っても勝ち） */
  isWinner(i) { return this.winner >= 0 && (this.winner === i || this.isAlly(i, this.winner)); }
  get cur() { return this.players[this.turn]; }
  async emit(type, data = {}) { if (this.ui) await this.ui.event(type, data, this); }
  async log(msg, pi = null) {
    this.logs.push({ msg, pi, turn: this.turnCount });
    await this.emit('log', { msg, pi });
  }
  ownerOf(card) { return this.players[card.owner]; }
  findZone(card) {
    for (const pl of this.players) {
      for (const z of ['hand', 'mana', 'battle', 'shields', 'grave', 'deck']) {
        if (pl[z].includes(card)) return { player: pl, zone: z };
      }
    }
    return null;
  }
  removeFrom(card) {
    const loc = this.findZone(card);
    if (loc) loc.player[loc.zone].splice(loc.player[loc.zone].indexOf(card), 1);
    return loc;
  }
  cardName(c) { return def(c).name; }

  // ---------- 役（ポーカーハンド）ボーナス ----------
  /**
   * バトルゾーンのクリーチャーの数字・スートで役を作る
   * 戻り値: { bonus: Map(uid → 加算パワー), names: ['ペア', …] }
   */
  hands(pi) {
    const cs = this.p(pi).battle.filter((c) => !c.joker);
    const bonus = new Map();
    const names = [];
    const give = (cards, n) => { for (const c of cards) bonus.set(c.uid, Math.max(bonus.get(c.uid) || 0, n)); };
    // 同じ数字
    const byRank = {};
    for (const c of cs) (byRank[c.rank] = byRank[c.rank] || []).push(c);
    const groups = Object.values(byRank).filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);
    if (groups.length) {
      const top = groups[0];
      if (top.length >= 4) { give(top, 5000); names.push('フォーカード'); }
      else if (top.length === 3 && groups[1]) { give([...top, ...groups[1]], 3000); names.push('フルハウス'); }
      else if (top.length === 3) { give(top, 3000); names.push('スリーカード'); }
      else if (groups.length >= 2) { give([...groups[0], ...groups[1]], 2000); names.push('ツーペア'); }
      else { give(top, 1000); names.push('ペア'); }
    }
    // 数字の連続（Aは1としても14としても使える）
    const has = new Set(cs.map((c) => c.rank));
    if (has.has(1)) has.add(14);
    let best = [];
    for (let start = 1; start <= 14; start++) {
      const run = [];
      for (let r = start; r <= 14 && has.has(r); r++) run.push(r);
      if (run.length > best.length) best = run;
    }
    if (best.length >= 3) {
      const rs = new Set(best.map((r) => (r === 14 ? 1 : r)));
      const runCards = cs.filter((c) => rs.has(c.rank));
      const flushRun = best.length >= 5 && SUIT_KEYS_ARR.some((s) => best.every((r) => cs.some((c) => c.suit === s && c.rank === (r === 14 ? 1 : r))));
      if (flushRun) { give(runCards, 5000); names.push('ストレートフラッシュ'); }
      else { give(runCards, best.length >= 5 ? 3000 : best.length * 1000 - 2000); names.push(best.length >= 5 ? 'ストレート' : `${best.length}連ストレート`); }
    }
    // 同じスート4体以上
    for (const s of SUIT_KEYS_ARR) {
      const f = cs.filter((c) => c.suit === s);
      if (f.length >= 4) { give(f, 2000); names.push('フラッシュ'); }
    }
    return { bonus, names };
  }

  /** 役ボーナス込みのパワー */
  power(c) {
    const d = def(c);
    if (d.type !== 'creature') return 0;
    const loc = this.findZone(c);
    if (!loc || loc.zone !== 'battle') return d.power;
    return d.power + (this.hands(loc.player.index).bonus.get(c.uid) || 0);
  }

  /** 役が変わったら演出を出す */
  async updateHands() {
    for (const pi of this.players.map((p) => p.index)) {
      const h = this.hands(pi);
      const prev = this.handNames[pi];
      const added = h.names.filter((n) => !prev.includes(n));
      this.handNames[pi] = h.names;
      if (added.length) {
        for (const nm of added) if (!this.stats[pi].hands.includes(nm)) this.stats[pi].hands.push(nm);
        await this.emit('hand', { pi, names: added, uids: [...h.bonus.keys()] });
        await this.log(`${this.p(pi).name} の役：${added.join('・')}！ パワーアップ`, pi);
      }
    }
  }

  // ---------- ロイヤルストレートフラッシュ（即勝利） ----------
  /** スートごとの 10・J・Q・K・A の集まり具合（バトルゾーン＋マナ） */
  royalProgress(pi) {
    const pl = this.p(pi);
    const pool = [...pl.mana, ...pl.battle.flatMap((c) => [c, ...(c.under || [])])];
    const res = {};
    for (const s of SUIT_KEYS_ARR) {
      const got = [10, 11, 12, 13, 1].filter((r) => pool.some((c) => !c.joker && c.suit === s && c.rank === r));
      res[s] = { count: got.length, cards: pool.filter((c) => !c.joker && c.suit === s && [10, 11, 12, 13, 1].includes(c.rank)) };
    }
    return res;
  }

  async checkRoyal() {
    if (this.winner !== null || this.royalDone) return;
    const order = [...this.players.slice(this.turn), ...this.players.slice(0, this.turn)].filter((p) => !p.out).map((p) => p.index);
    for (const pi of order) {
      const pr = this.royalProgress(pi);
      for (const s of SUIT_KEYS_ARR) {
        if (pr[s].count === 5) {
          this.royalDone = true;
          await this.emit('royal', { pi, suit: s, cards: pr[s].cards });
          await this.log(`${this.p(pi).name} のロイヤルストレートフラッシュ！！`, pi);
          this.stats[pi].royal = true;
          if (this.teams) this.winnerTeam = this.teamOf(pi);
          this.winner = pi;
          this.winReason = 'ロイヤルストレートフラッシュ';
          return;
        }
      }
    }
  }

  // ---------- setup ----------
  cardByUid(uid) {
    uid = Number(uid);
    for (const pl of this.players) {
      for (const z of ['hand', 'mana', 'battle', 'shields', 'grave', 'deck']) {
        for (const c of pl[z]) {
          if (c.uid === uid) return c;
          for (const u of c.under || []) if (u.uid === uid) return u;
        }
      }
    }
    return null;
  }

  async start() {
    let seq = 1;
    const nextUid = () => seq++;
    for (const pl of this.players) {
      const st = this.setup[pl.index] || {};
      pl.deck = shuffle(makeDeck(pl.index, nextUid, st.deck || null), this.rng);
      for (let i = 0; i < (st.shields ?? START_SHIELDS); i++) pl.shields.push(pl.deck.pop());
      for (let i = 0; i < (st.hand ?? START_HAND); i++) pl.hand.push(pl.deck.pop());
      for (let i = 0; i < (st.mana ?? 0); i++) pl.mana.push(pl.deck.pop());
    }
    if (this.firstPlayer === null) this.firstPlayer = Math.floor(this.rng() * this.n) % this.n;
    this.turn = this.firstPlayer;
    await this.emit('setup');
    await this.emit('coin', { first: this.firstPlayer });
    // マリガン：先攻から順に、最初の手札を1回だけ引き直せる
    if (this.rules.mulligan) {
      for (let k = 0; k < this.n; k++) {
        const pi = (this.firstPlayer + k) % this.n;
        const pl = this.p(pi);
        if (!pl.controller.mulligan) continue;
        const yes = await pl.controller.mulligan(this, pi);
        if (!yes) continue;
        const n = pl.hand.length;
        pl.deck.push(...pl.hand.splice(0));
        shuffle(pl.deck, this.rng);
        for (let i = 0; i < n; i++) pl.hand.push(pl.deck.pop());
        await this.emit('mulligan', { pi });
        await this.log(`${pl.name} は手札を引き直した`, pi);
      }
    }
    // 後攻ボーナス：先攻以外はシールドが1枚多い（試したなかで一番、先攻・後攻の勝率が五分になった）
    if (this.rules.secondBonus) {
      for (const pl of this.players) {
        if (pl.index === this.firstPlayer || !pl.deck.length) continue;
        const c = pl.deck.pop();
        c.tapped = false;
        pl.shields.push(c);
      }
      await this.emit('secondBonus', { first: this.firstPlayer });
    }
    await this.log(`${this.cur.name} の先攻でデュエル開始！`);
  }

  async run() {
    await this.start();
    while (this.winner === null) {
      await this.startTurn();
      if (this.winner !== null) break;
      if (!this.cur.out) await this.cur.controller.takeTurn(this, this.turn);
      if (this.winner !== null) break;
      await this.emit('turnEnd', { pi: this.turn });
      this.turn = this.nextAlive(this.turn);
      if (this.turnCount > 200 * this.n) { this.winner = -1; this.winReason = 'ターン上限で引き分け'; }
    }
    // 振り返り用に最後の状態も記録
    this.history.push({
      turn: this.turnCount, who: this.turn,
      shields: this.players.map((p) => (p.out ? 0 : p.shields.length)),
      mana: this.players.map((p) => p.mana.length),
      power: this.players.map((p) => (p.out ? 0 : p.battle.reduce((s, c) => s + this.power(c), 0))),
      hand: this.players.map((p) => p.hand.length),
    });
    await this.emit('gameover', { winner: this.winner, reason: this.winReason });
    return this.winner;
  }

  nextAlive(i) {
    for (let k = 1; k <= this.n; k++) {
      const j = (i + k) % this.n;
      if (!this.players[j].out) return j;
    }
    return i;
  }

  async startTurn() {
    this.turnCount++;
    this.history.push({
      turn: this.turnCount,
      who: this.turn,
      shields: this.players.map((p) => (p.out ? 0 : p.shields.length)),
      mana: this.players.map((p) => p.mana.length),
      power: this.players.map((p) => (p.out ? 0 : p.battle.reduce((s, c) => s + this.power(c), 0))),
      hand: this.players.map((p) => p.hand.length),
    });
    const pl = this.cur;
    pl.charged = false;
    for (const c of pl.battle) { c.tapped = false; c.sick = false; }
    for (const c of pl.mana) c.tapped = false;
    await this.emit('turnStart', { pi: this.turn, count: this.turnCount });
    const skipDraw = this.turnCount === 1;
    if (!skipDraw) {
      if (pl.deck.length === 0) {
        await this.lose(this.turn, '山札切れ');
        return;
      }
      await this.draw(this.turn, 1);
    }
  }

  /** 脱落。残りが1人になったら、その人の勝ち */
  async lose(pi, reason, by = null) {
    const pl = this.p(pi);
    if (this.winner !== null || pl.out) return;
    pl.out = true;
    this.outOrder.push(pi);
    await this.log(`${pl.name} は${reason}で${this.n > 2 ? '脱落' : '敗北'}…`);
    const alive = this.alive();
    const teamsLeft = new Set(alive.map((p) => this.teamOf(p.index)));
    if (alive.length <= 1 || teamsLeft.size <= 1) {
      this.winner = alive.length ? alive[0].index : -1;
      if (this.teams && alive.length) this.winnerTeam = this.teamOf(alive[0].index);
      this.winReason = reason;
      return;
    }
    await this.emit('eliminated', { pi, reason, by, place: alive.length + 1 });
  }

  async draw(pi, n) {
    const pl = this.p(pi);
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (pl.deck.length === 0) { await this.emit('toast', { msg: '山札がありません' }); break; }
      const c = pl.deck.pop();
      pl.hand.push(c);
      drawn++;
      await this.emit('draw', { pi, card: c });
    }
    return drawn;
  }

  // ---------- 判定 ----------
  canCharge(pi) {
    return this.winner === null && this.turn === pi && !this.p(pi).charged;
  }

  untappedMana(pi) { return this.p(pi).mana.filter((m) => !m.tapped); }

  /** カードを使えるか → { ok, reason } */
  canPlay(pi, card) {
    const pl = this.p(pi);
    if (this.winner !== null) return { ok: false, reason: 'ゲーム終了' };
    if (this.turn !== pi) return { ok: false, reason: '自分のターンではありません' };
    if (!pl.hand.includes(card)) return { ok: false, reason: '手札にありません' };
    const d = def(card);
    const free = this.untappedMana(pi);
    if (free.length < d.cost) return { ok: false, reason: `マナが足りません（${free.length}/${d.cost}）` };
    if (!d.allCiv && !free.some((m) => suitsOf(m).includes(card.suit))) {
      return { ok: false, reason: `${SUITS[card.suit].sym}（${SUITS[card.suit].name}）のマナが必要です` };
    }
    if (d.evolution && this.evoBases(pi, card).length === 0) {
      return { ok: false, reason: `進化元の${SUITS[card.suit].sym}クリーチャーがいません` };
    }
    return { ok: true };
  }

  evoBases(pi, card) {
    return this.p(pi).battle.filter((c) => suitsOf(c).includes(card.suit) && !def(c).evolution);
  }

  canAttack(pi, card) {
    if (this.winner !== null || this.turn !== pi) return false;
    if (!this.p(pi).battle.includes(card)) return false;
    if (card.tapped) return false;
    if (card.sick && !has(card, 'speed')) return false;
    return true;
  }

  /** 攻撃できる対象（'player' と相手のタップ状態のクリーチャー） */
  attackTargets(pi) {
    return ['player', ...this.opps(pi).flatMap((p) => p.battle.filter((c) => c.tapped))];
  }

  /** 攻撃できる相手プレイヤー */
  attackablePlayers(pi) { return this.opps(pi).map((p) => p.index); }

  // ---------- アクション ----------
  async actCharge(pi, card) {
    if (!this.canCharge(pi)) return { ok: false, reason: 'このターンはもうマナチャージしました' };
    const pl = this.p(pi);
    if (!pl.hand.includes(card)) return { ok: false, reason: '手札にありません' };
    pl.hand.splice(pl.hand.indexOf(card), 1);
    card.tapped = false;
    pl.mana.push(card);
    pl.charged = true;
    await this.emit('charge', { pi, card });
    await this.log(`${pl.name} は ${this.cardName(card)} をマナに置いた`, pi);
    await this.checkRoyal();
    return { ok: true };
  }

  payCost(pi, card) {
    const d = def(card);
    const free = this.untappedMana(pi);
    const paid = [];
    if (d.cost <= 0) return paid;
    if (!d.allCiv) {
      // 文明を満たす1枚（ジョーカー以外を優先）
      const match = free.filter((m) => suitsOf(m).includes(card.suit)).sort((a, b) => (a.joker ? 1 : 0) - (b.joker ? 1 : 0))[0];
      paid.push(match);
    }
    const rest = free.filter((m) => !paid.includes(m)).sort((a, b) => {
      // 残すべきマナ（ジョーカーや手札に多いスート）は後回し
      const score = (m) => (m.joker ? 10 : 0) + this.p(pi).hand.filter((h) => h.suit === m.suit).length;
      return score(a) - score(b);
    });
    while (paid.length < d.cost) paid.push(rest.shift());
    for (const m of paid) m.tapped = true;
    return paid;
  }

  async actPlay(pi, card) {
    const chk = this.canPlay(pi, card);
    if (!chk.ok) return chk;
    const pl = this.p(pi);
    const d = def(card);
    // 進化元は支払い前に決めておく
    let base = null;
    if (d.evolution) {
      const bases = this.evoBases(pi, card);
      base = bases.length === 1 ? bases[0] : await pl.controller.chooseCard(this, pi, bases, {
        kind: 'evoBase', prompt: `${d.name} の進化元を選んでください`, optional: true, source: card,
      });
      if (!base) return { ok: false, reason: 'キャンセルしました' };
    }
    const paid = this.payCost(pi, card);
    await this.emit('pay', { pi, cards: paid });
    pl.hand.splice(pl.hand.indexOf(card), 1);
    if (d.type === 'spell') {
      await this.castSpell(pi, card);
    } else {
      await this.summon(pi, card, { base });
    }
    return { ok: true };
  }

  async castSpell(pi, card, { trigger = false } = {}) {
    const pl = this.p(pi);
    const d = def(card);
    this.stats[pi].spells++;
    this.stats[pi].played[cardKey(card)] = (this.stats[pi].played[cardKey(card)] || 0) + 1;
    await this.emit('cast', { pi, card, trigger });
    await this.log(`${pl.name} は呪文「${d.name}」を唱えた！`, pi);
    // （呪文の効果でマナが増えてもロイヤル判定は解決後に行う）
    await this.resolveEffect(pi, d.effect, card);
    if (!pl.grave.includes(card)) pl.grave.push(card);
    await this.emit('spellDone', { pi, card });
    await this.checkRoyal();
  }

  async summon(pi, card, { base = null, trigger = false } = {}) {
    const pl = this.p(pi);
    const d = def(card);
    card.tapped = false;
    card.under = [];
    if (d.evolution) {
      if (!base) {
        const bases = this.evoBases(pi, card);
        if (bases.length === 0) { pl.hand.push(card); await this.emit('toHand', { pi, card }); return; }
        base = bases.length === 1 ? bases[0] : await pl.controller.chooseCard(this, pi, bases, {
          kind: 'evoBase', prompt: `${d.name} の進化元を選んでください`, optional: false, source: card,
        });
        if (!base || !pl.battle.includes(base)) base = bases[0];
      }
      const idx = pl.battle.indexOf(base);
      card.under = [base, ...base.under];
      base.under = [];
      card.tapped = base.tapped;
      card.sick = false;
      pl.battle.splice(idx, 1, card);
    } else {
      card.sick = !has(card, 'speed');
      pl.battle.push(card);
    }
    this.stats[pi].summons++;
    this.stats[pi].played[cardKey(card)] = (this.stats[pi].played[cardKey(card)] || 0) + 1;
    if (d.kind === 'king') this.stats[pi].kings++;
    if (d.kind === 'ace') this.stats[pi].aces++;
    if (d.kind === 'joker') this.stats[pi].jokers++;
    await this.emit('summon', { pi, card, evolve: !!d.evolution, base, trigger });
    await this.log(`${pl.name} は ${d.name}（パワー${d.power}）を${d.evolution ? '進化' : '召喚'}！`, pi);
    await this.updateHands();
    if (has(card, 'draw')) await this.draw(pi, 1);
    if (d.onEnter) await this.resolveEffect(pi, d.onEnter, card);
    await this.checkRoyal();
  }

  async destroy(card, reason = 'destroy') {
    const loc = this.findZone(card);
    if (!loc || loc.zone !== 'battle') return;
    const pl = loc.player;
    const pi = pl.index;
    pl.battle.splice(pl.battle.indexOf(card), 1);
    const under = card.under || [];
    card.under = [];
    card.sick = false;
    const toMana = has(card, 'rebirth');
    if (this.turn !== pi) this.stats[this.turn].destroys++;
    await this.emit('destroy', { pi, card, toMana, reason });
    for (const u of under) { u.tapped = false; pl.grave.push(u); }
    if (toMana) {
      card.tapped = true;
      pl.mana.push(card);
      await this.emit('rebirth', { pi, card });
      await this.log(`${this.cardName(card)} は破壊され、炎となってマナへ還った`, pi);
    } else {
      card.tapped = false;
      pl.grave.push(card);
      await this.log(`${this.cardName(card)} は破壊された`, pi);
    }
    this.handNames[pi] = this.hands(pi).names;
    if (toMana) await this.checkRoyal();
  }

  /**
   * 攻撃。target は 'player' か 相手のタップ状態のクリーチャー
   */
  async actAttack(pi, attacker, target, targetPlayer = null) {
    if (!this.canAttack(pi, attacker)) return { ok: false, reason: 'このクリーチャーは攻撃できません' };
    // 攻撃される側のプレイヤー（クリーチャーならその持ち主）
    let opp;
    if (target === 'player') {
      opp = targetPlayer != null ? this.p(Number(targetPlayer)) : this.opp(pi);
      if (!opp || opp.index === pi || opp.out) return { ok: false, reason: 'その相手は攻撃できません' };
    } else {
      opp = this.p(target.owner);
      if (!opp || opp.index === pi || opp.out || !(opp.battle.includes(target) && target.tapped)) {
        return { ok: false, reason: 'アンタップ状態のクリーチャーは攻撃できません' };
      }
    }
    attacker.tapped = true;
    const ad = def(attacker);
    await this.emit('attack', { pi, attacker, target, tp: opp.index });
    await this.log(`${this.cardName(attacker)} が ${target === 'player' ? opp.name : this.cardName(target)} に攻撃！`, pi);

    // 攻撃時能力
    if (ad.onAttack === 'aceSnipe') {
      const opts = this.opps(pi).flatMap((p) => p.battle).filter((c) => this.power(c) <= 3000 && c !== target);
      if (opts.length) {
        const t = await this.p(pi).controller.chooseCard(this, pi, opts, {
          kind: 'destroy', prompt: `${ad.name}の能力：パワー3000以下を1体破壊`, optional: false, source: attacker,
        });
        if (t) { await this.emit('effect', { pi, source: attacker, targets: [t], kind: 'destroy' }); await this.destroy(t, 'effect'); }
      }
    }
    if (!this.p(pi).battle.includes(attacker) || opp.out) return { ok: true };
    if (target !== 'player' && !opp.battle.includes(target)) {
      // 攻撃先が消えた
      await this.emit('toast', { msg: '攻撃先がいなくなった' });
      return { ok: true };
    }

    // ブロック
    const blockers = opp.battle.filter((c) => has(c, 'blocker') && !c.tapped && c !== target);
    if (blockers.length) {
      const lethal = target === 'player' && opp.shields.length === 0;
      const b = await opp.controller.chooseBlocker(this, opp.index, attacker, blockers, { target, lethal });
      if (b && blockers.includes(b)) {
        b.tapped = true;
        await this.emit('block', { pi: opp.index, blocker: b, attacker });
        await this.log(`${this.cardName(b)} がブロック！`, opp.index);
        await this.battle(attacker, b);
        return { ok: true };
      }
    }

    if (target !== 'player') {
      await this.battle(attacker, target);
      return { ok: true };
    }

    // プレイヤーへの攻撃
    if (opp.shields.length === 0) {
      await this.emit('direct', { pi, attacker, tp: opp.index });
      await this.log(`${this.cardName(attacker)} の ${opp.name} へのダイレクトアタック！！`, pi);
      this.stats[pi].direct++;
      this.stats[pi].kills++;
      await this.lose(opp.index, 'ダイレクトアタック', pi);
      return { ok: true };
    }
    const nb = Math.min(ad.breaker, opp.shields.length);
    this.stats[pi].maxBreak = Math.max(this.stats[pi].maxBreak, nb);
    await this.breakShields(pi, attacker, nb, opp);
    return { ok: true };
  }

  async battle(a, b) {
    const affA = this.affinity(a, b), affB = this.affinity(b, a);
    const pa = this.power(a) + affA, pb = this.power(b) + affB;
    const result = pa > pb ? 'a' : pb > pa ? 'b' : 'draw';
    await this.emit('battle', { a, b, result, pa, pb, affA, affB });
    if (result === 'a') await this.destroy(b, 'battle');
    else if (result === 'b') await this.destroy(a, 'battle');
    else { await this.destroy(b, 'battle'); await this.destroy(a, 'battle'); }
  }

  async breakShields(pi, attacker, n, opp = this.opp(pi)) {
    const broken = [];
    for (let i = 0; i < n && opp.shields.length; i++) {
      const s = opp.shields.pop();
      broken.push(s);
      this.stats[pi].breaks++;
      await this.emit('break', { pi: opp.index, card: s, attacker, index: i, total: n });
    }
    this.stats[opp.index].shieldsLost += broken.length;
    // 手札に加える
    for (const s of broken) { s.tapped = false; opp.hand.push(s); }
    await this.emit('shieldsToHand', { pi: opp.index, cards: broken });
    await this.log(`${opp.name} のシールドを${broken.length}枚ブレイク！`, pi);
    // S・トリガー
    for (const s of broken) {
      if (this.winner !== null) return;
      if (!def(s).trigger || !opp.hand.includes(s)) continue;
      await this.emit('triggerCheck', { pi: opp.index, card: s });
      const use = await opp.controller.useTrigger(this, opp.index, s);
      if (!use) continue;
      opp.hand.splice(opp.hand.indexOf(s), 1);
      this.stats[opp.index].triggers++;
      await this.emit('trigger', { pi: opp.index, card: s });
      await this.log(`S・トリガー発動！ ${this.cardName(s)}`, opp.index);
      if (def(s).type === 'spell') await this.castSpell(opp.index, s, { trigger: true });
      else await this.summon(opp.index, s, { trigger: true });
    }
  }

  // ---------- 効果解決 ----------
  async resolveEffect(pi, effect, source) {
    const me = this.p(pi);
    // 「相手のクリーチャー」＝残っている相手全員のクリーチャー
    const oppBattle = () => this.opps(pi).flatMap((p) => p.battle);
    const ctrl = me.controller;
    switch (effect) {
      case 'spellS': { // 6000以下破壊
        const opts = oppBattle().filter((c) => this.power(c) <= 6000);
        if (!opts.length) return this.fizzle();
        const t = await ctrl.chooseCard(this, pi, opts, { kind: 'destroy', prompt: '破壊する相手クリーチャー（パワー6000以下）', optional: false, source });
        if (t) { await this.emit('effect', { pi, source, targets: [t], kind: 'destroy' }); await this.destroy(t, 'effect'); }
        return;
      }
      case 'spellC': { // 2体までタップ
        const picked = [];
        for (let i = 0; i < 2; i++) {
          const opts = oppBattle().filter((c) => !c.tapped && !picked.includes(c));
          if (!opts.length) break;
          const t = await ctrl.chooseCard(this, pi, opts, { kind: 'tap', prompt: `タップする相手クリーチャー（${i + 1}/2）`, optional: i > 0, source });
          if (!t) break;
          picked.push(t);
          t.tapped = true;
          await this.emit('effect', { pi, source, targets: [t], kind: 'tap' });
        }
        if (!picked.length) return this.fizzle();
        await this.log(`${picked.map((c) => this.cardName(c)).join('、')} をタップした`, pi);
        return;
      }
      case 'spellH': { // 墓地回収＋マナ
        const opts = me.grave.filter((c) => def(c).type === 'creature');
        if (opts.length) {
          const t = await ctrl.chooseCard(this, pi, opts, { kind: 'toHand', prompt: '手札に戻すクリーチャー', optional: false, source });
          if (t) {
            me.grave.splice(me.grave.indexOf(t), 1);
            me.hand.push(t);
            await this.emit('toHand', { pi, card: t, from: 'grave' });
            await this.log(`${this.cardName(t)} を墓地から手札に戻した`, pi);
          }
        }
        if (me.deck.length) {
          const m = me.deck.pop();
          m.tapped = false;
          me.mana.push(m);
          await this.emit('manaAdd', { pi, card: m });
        }
        return;
      }
      case 'spellD':
        await this.draw(pi, 2);
        return;
      case 'kingS': {
        const opts = oppBattle();
        if (!opts.length) return;
        const t = await ctrl.chooseCard(this, pi, opts, { kind: 'destroy', prompt: '破壊する相手クリーチャー', optional: false, source });
        if (t) { await this.emit('effect', { pi, source, targets: [t], kind: 'destroy' }); await this.destroy(t, 'effect'); }
        return;
      }
      case 'kingC': {
        let n = 0;
        for (let i = 0; i < 2 && me.deck.length; i++) {
          const c = me.deck.pop();
          c.tapped = false;
          me.shields.push(c);
          n++;
          await this.emit('shieldAdd', { pi, card: c });
        }
        if (n) await this.log(`${me.name} のシールドが${n}枚増えた`, pi);
        return;
      }
      case 'kingH': {
        const opts = me.grave.filter((c) => def(c).type === 'creature' && def(c).cost <= 5 && !def(c).evolution);
        if (!opts.length) return;
        const t = await ctrl.chooseCard(this, pi, opts, { kind: 'revive', prompt: '墓地からバトルゾーンに出すクリーチャー', optional: false, source });
        if (t) {
          me.grave.splice(me.grave.indexOf(t), 1);
          await this.emit('revive', { pi, card: t });
          await this.summon(pi, t);
        }
        return;
      }
      case 'kingD':
        await this.draw(pi, 3);
        return;
      case 'jokerB': { // 黒ジョーカー：8000以下を破壊
        const opts = oppBattle().filter((c) => this.power(c) <= 8000);
        if (!opts.length) return;
        const t = await ctrl.chooseCard(this, pi, opts, { kind: 'destroy', prompt: '破壊する相手クリーチャー（パワー8000以下）', optional: false, source });
        if (t) { await this.emit('effect', { pi, source, targets: [t], kind: 'destroy' }); await this.destroy(t, 'effect'); }
        return;
      }
      case 'jokerR': { // 赤ジョーカー：シールド+1
        if (!me.deck.length) return;
        const c = me.deck.pop();
        c.tapped = false;
        me.shields.push(c);
        await this.emit('shieldAdd', { pi, card: c });
        await this.log(`${me.name} のシールドが1枚増えた`, pi);
        return;
      }
      default:
    }
  }

  async fizzle() {
    await this.emit('toast', { msg: '対象がいないため効果は不発' });
  }

  async surrender(pi) {
    if (this.winner !== null) return;
    await this.lose(pi, '投了');
  }
}
