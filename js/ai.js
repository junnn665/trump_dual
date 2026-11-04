// =========================================================
//  CPU の思考ルーチン（やさしい / ふつう / つよい）
// =========================================================
import { def, has, suitsOf, SUIT_KEYS } from './cards.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AIController {
  constructor(level = 'normal', { delay = 550, getSpeed = () => 1, personality = 'balanced' } = {}) {
    this.level = level; // easy / normal / hard
    // 性格：balanced（バランス）／ aggro（速攻）／ control（守り・除去）／ royal（ロイヤル狙い）
    this.personality = personality;
    this.delay = delay;
    this.getSpeed = getSpeed;
    this.isAI = true;
  }

  async think(mult = 1) {
    if (this.delay > 0) await sleep((this.delay * mult) / this.getSpeed());
  }

  rand() { return Math.random(); }

  // ---------------- ターン ----------------
  async takeTurn(game, pi) {
    await this.think(1.2);
    if (game.winner !== null || game.p(pi).out) return;
    await this.doCharge(game, pi);
    let guard = 0;
    while (game.winner === null && guard++ < 20) {
      if (this.level !== 'easy' && game.canGraveSummon(pi).ok) {
        await this.think();
        const r = await game.actGraveSummon(pi);
        if (r.ok) continue;
      }
      const sup = this.pickSuperEvo(game, pi);
      if (sup) {
        await this.think();
        const r = await game.actSuperEvo(pi, sup[0], sup[1]);
        if (r.ok) continue;
      }
      const combo = this.pickCombo(game, pi);
      if (combo) {
        await this.think();
        const r = await game.actCombo(pi, combo[0], combo[1]);
        if (r.ok) continue;
      }
      const card = this.pickPlay(game, pi);
      if (!card) break;
      await this.think();
      const r = await game.actPlay(pi, card);
      if (!r.ok) break;
    }
    guard = 0;
    while (game.winner === null && guard++ < 20) {
      if (game.p(pi).out) break;
      const plan = this.pickAttack(game, pi);
      if (!plan) break;
      await this.think();
      await game.actAttack(pi, plan.attacker, plan.target, plan.tp);
    }
    await this.think(0.6);
  }

  // ---------------- 超進化（Q→K） ----------------
  pickSuperEvo(game, pi) {
    if (this.level === 'easy') return null;
    for (const k of game.p(pi).hand) {
      if (def(k).kind !== 'king') continue;
      const bases = game.superBases(pi, k);
      if (bases.length) return [k, bases.sort((a, b) => (a.tapped ? 1 : 0) - (b.tapped ? 1 : 0))[0]];
    }
    return null;
  }

  // ---------------- コンボ召喚 ----------------
  pickCombo(game, pi) {
    if (this.level === 'easy') return null;
    const hand = game.p(pi).hand;
    let best = null, bestScore = 0;
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (!game.canCombo(pi, hand[i], hand[j]).ok) continue;
        const s = def(hand[i]).power + def(hand[j]).power;
        if (s > bestScore) { bestScore = s; best = [hand[i], hand[j]]; }
      }
    }
    return best;
  }

  // ---------------- シールド仕込み ----------------
  async plantShield(game, pi) {
    if (this.level === 'easy') return null;
    await this.think(0.3);
    const hand = game.p(pi).hand;
    const trig = hand.filter((c) => def(c).trigger).sort((a, b) => def(b).cost - def(a).cost);
    if (!trig.length) return null;
    // 守り型は必ず、ほかは手札に安いカードが残るときだけ仕込む
    const cheapLeft = hand.filter((c) => !def(c).trigger && def(c).cost <= 3).length;
    if (this.personality === 'control' || cheapLeft >= 2 || (this.level === 'hard' && trig.length >= 2)) return trig[0];
    return null;
  }

  // ---------------- マリガン ----------------
  async mulligan(game, pi) {
    await this.think(0.4);
    const hand = game.p(pi).hand;
    const cheap = hand.filter((c) => def(c).type === 'creature' && def(c).cost <= 3).length;
    if (this.level === 'easy') return cheap === 0 && this.rand() < 0.5;
    return cheap === 0 || (this.level === 'hard' && cheap === 1 && hand.filter((c) => def(c).cost >= 6).length >= 3);
  }

  // ---------------- マナチャージ ----------------
  cardValue(game, pi, c) {
    const d = def(c);
    let v = d.cost * 1.2 + d.power / 2500;
    if (d.trigger) v += 3;
    if (d.kind === 'king' || d.kind === 'ace' || d.kind === 'joker') v += 4;
    return v;
  }

  async doCharge(game, pi) {
    const pick = this.chooseCharge(game, pi);
    if (!pick) return;
    await this.think(0.8);
    await game.actCharge(pi, pick);
  }

  /** マナに置くカードを選ぶ（置かないほうがいいときは null）。ヒント機能でも使う */
  chooseCharge(game, pi) {
    const pl = game.p(pi);
    if (!pl.hand.length || !game.canCharge(pi)) return null;
    const manaN = pl.mana.length;
    if (manaN >= 9 && pl.hand.length <= 3) return null;
    if (this.level !== 'easy' && manaN >= 7 && pl.hand.length <= 2) return null;

    let pick;
    if (this.personality === 'royal') {
      // ロイヤル狙い：一番そろっているスートの 10・J・Q・K・A をマナに置いていく（マナもロイヤルに数える）
      const rp = game.royalProgress(pi);
      const suits = Object.keys(rp).sort((a, b) => rp[b].count - rp[a].count);
      for (const s of suits) {
        const c = pl.hand.find((h) => !h.joker && h.suit === s && [10, 11, 12, 13, 1].includes(h.rank) && !rp[s].cards.some((x) => x.rank === h.rank));
        if (c) return c;
      }
    }
    if (this.level === 'easy') {
      pick = pl.hand[Math.floor(this.rand() * pl.hand.length)];
    } else {
      const manaSuits = new Set(pl.mana.flatMap(suitsOf));
      const handSuitCount = {};
      for (const h of pl.hand) handSuitCount[h.suit] = (handSuitCount[h.suit] || 0) + 1;
      let best = null, bestScore = Infinity;
      for (const c of pl.hand) {
        let s = this.cardValue(game, pi, c);
        // 持っていない文明のマナは価値が高い → チャージしやすくする
        if (!c.joker && !manaSuits.has(c.suit) && handSuitCount[c.suit] >= 1) s -= 4;
        // 今すぐ使えるカードはなるべく残す
        if (game.canPlay(pi, c).ok) s += 2.5;
        if (s < bestScore) { bestScore = s; best = c; }
      }
      pick = best;
    }
    return pick;
  }

  // ---------------- 召喚・呪文 ----------------
  pickPlay(game, pi) {
    const pl = game.p(pi), opp = { battle: game.opps(pi).flatMap((p) => p.battle) };
    const playable = pl.hand.filter((c) => game.canPlay(pi, c).ok).filter((c) => this.spellUseful(game, pi, c));
    if (!playable.length) return null;
    if (this.level === 'easy') return playable[Math.floor(this.rand() * playable.length)];
    playable.sort((a, b) => this.playScore(game, pi, b) - this.playScore(game, pi, a));
    // 「つよい」は、相手の脅威が大きいなら除去呪文を優先
    if (this.level === 'hard') {
      const threat = opp.battle.reduce((m, c) => Math.max(m, game.power(c)), 0);
      const removal = playable.find((c) => def(c).effect === 'spellS' && threat >= 4000);
      if (removal) return removal;
    }
    return playable[0];
  }

  playScore(game, pi, c) {
    const d = def(c);
    let s = d.cost * 10 + d.power / 1000;
    if (d.type === 'spell') s -= 4;
    if (has(c, 'speed')) s += this.personality === 'aggro' ? 12 : 3;
    if (this.personality === 'control' && (d.effect === 'spellS' || d.onEnter === 'kingS' || d.onEnter === 'jokerB' || has(c, 'blocker'))) s += 15;
    if (this.personality === 'royal' && !c.joker && [10, 11, 12, 13, 1].includes(c.rank)) {
      const rp = game.royalProgress(pi);
      if (rp[c.suit] && !rp[c.suit].cards.some((x) => x.rank === c.rank)) s += 20 + rp[c.suit].count * 5;
    }
    return s;
  }

  spellUseful(game, pi, c) {
    const d = def(c);
    const opp = { battle: game.opps(pi).flatMap((p) => p.battle) }, me = game.p(pi);
    if (d.type !== 'spell') {
      if (d.onEnter === 'kingS' && !opp.battle.length && this.level === 'hard' && me.hand.length > 2) return true;
      return true;
    }
    switch (d.effect) {
      case 'spellS': return opp.battle.some((x) => game.power(x) <= 6000);
      case 'spellC': return opp.battle.some((x) => !x.tapped) && me.battle.some((x) => !x.tapped && !x.sick);
      case 'spellH': return me.grave.some((x) => def(x).type === 'creature') || me.deck.length > 5;
      case 'spellD': return me.deck.length > 4;
      default: return true;
    }
  }

  // ---------------- 攻撃 ----------------
  pickAttack(game, pi) {
    const me = game.p(pi);
    const ready = me.battle.filter((c) => game.canAttack(pi, c));
    if (!ready.length) return null;
    const opps = game.opps(pi);
    if (!opps.length) return null;

    if (this.level === 'easy') {
      if (this.rand() < 0.25) return null;
      const a = ready[Math.floor(this.rand() * ready.length)];
      const targets = game.attackTargets(pi);
      const t = targets[Math.floor(this.rand() * targets.length)];
      const tp = t === 'player' ? opps[Math.floor(this.rand() * opps.length)].index : t.owner;
      return { attacker: a, target: t, tp };
    }
    // 相手が複数いるとき：とどめを刺せる相手 → シールドが少ない相手 → 強い相手 の順にねらう
    const ranked = [...opps].sort((x, y) => this.targetScore(game, pi, y, ready) - this.targetScore(game, pi, x, ready));
    for (const opp of ranked) {
      const plan = this.planAgainst(game, pi, opp, ready);
      if (plan) return { ...plan, tp: opp.index };
    }
    return null;
  }

  targetScore(game, pi, opp, ready) {
    const blockers = opp.battle.filter((c) => game.isBlocker(c) && !c.tapped).length;
    const breaks = ready.reduce((s, c) => s + def(c).breaker, 0);
    let s = 0;
    if (breaks >= opp.shields.length + 1 && ready.length > blockers) s += 100; // とどめ
    s += (5 - opp.shields.length) * 6;
    s += opp.battle.reduce((m, c) => m + game.power(c), 0) / 3000; // 強い相手は早めに削る
    s -= blockers * 4;
    if (this.level === 'hard' && opp.index === game.turn) s -= 50;
    return s + this.rand();
  }

  planAgainst(game, pi, opp, ready) {
    const me = game.p(pi);

    const oppBlockers = opp.battle.filter((c) => game.isBlocker(c) && !c.tapped);
    const totalBreak = ready.reduce((s, c) => s + def(c).breaker, 0);
    const lethal = totalBreak >= opp.shields.length + 1 && ready.length > oppBlockers.length;

    // 1) 有利なクリーチャー攻撃（タップ中の相手を倒す）
    const tappedOpp = opp.battle.filter((c) => c.tapped);
    if (!lethal) {
      let bestTrade = null, bestVal = 0;
      for (const t of tappedOpp) {
        const atk = ready.filter((a) => game.battlePower(a, t) + game.heat(a) > game.battlePower(t, a) + game.guard(t)).sort((x, y) => game.power(x) - game.power(y))[0];
        const tp = game.power(t);
        if (atk) {
          const val = tp + (def(t).breaker - 1) * 3000;
          if (val > bestVal) { bestVal = val; bestTrade = { attacker: atk, target: t }; }
        }
      }
      const tradeBar = this.personality === 'aggro' ? 9000 : this.personality === 'control' ? 0 : 4000;
      if (bestTrade && (bestVal >= tradeBar || (this.level === 'normal' && this.personality !== 'aggro'))) return bestTrade;
    }

    // 2) プレイヤー攻撃
    const ordered = [...ready].sort((a, b) => {
      // ブロッカーがいるなら弱いのから突っ込ませる、いなければ強いのから
      return oppBlockers.length ? game.power(a) - game.power(b) : def(b).breaker - def(a).breaker;
    });
    for (const a of ordered) {
      const ap = game.power(a);
      const strongBlock = oppBlockers.some((b) => game.power(b) >= ap);
      // 反撃でやられる心配
      const myShields = me.shields.length;
      const oppThreat = opp.battle.reduce((s, c) => s + def(c).breaker, 0);
      const keepDefense = this.personality !== 'aggro' && (this.level === 'hard' || this.personality === 'control') && !lethal
        && myShields <= (this.personality === 'control' ? 3 : 2) && oppThreat >= myShields && game.isBlocker(a);
      if (keepDefense) continue;
      if (lethal || !strongBlock || (this.personality === 'aggro' && this.rand() < 0.6) || (this.level === 'normal' && this.rand() < 0.3)) {
        return { attacker: a, target: 'player' };
      }
    }
    return null;
  }

  // ---------------- 選択 ----------------
  async chooseCard(game, pi, options, ctx) {
    await this.think(0.6);
    if (!options.length) return null;
    if (this.level === 'easy') return options[Math.floor(this.rand() * options.length)];
    const byPower = [...options].sort((a, b) => game.power(b) - game.power(a));
    switch (ctx.kind) {
      case 'evoBase': {
        // 一番弱い（タップされていない方が嬉しい）
        return [...options].sort((a, b) => (a.tapped - b.tapped) || (game.power(a) - game.power(b)))[0];
      }
      case 'tap': {
        const untapped = byPower.filter((c) => !c.tapped);
        return untapped[0] || null;
      }
      default:
        return byPower[0];
    }
  }

  async chooseBlocker(game, pi, attacker, blockers, ctx) {
    await this.think(0.6);
    const ap = game.power(attacker);
    const sorted = [...blockers].sort((a, b) => game.power(a) - game.power(b));
    const beats = (b) => game.battlePower(b, attacker) + game.guard(b) > game.battlePower(attacker, b) + game.heat(attacker);
    if (ctx.lethal) {
      // 負けるなら何でもブロック（勝てる奴優先）
      return sorted.find(beats) || sorted[sorted.length - 1];
    }
    if (this.level === 'easy') return this.rand() < 0.5 ? sorted[0] : null;
    const winner = sorted.find(beats);
    if (winner) return winner;
    const me = game.p(pi);
    if (ctx.target === 'player') {
      const br = def(attacker).breaker;
      // シールドが少ない or 大型ブレイカー → チャンプブロック（守り型は早めに）
      const guard = this.personality === 'control' ? 4 : 3;
      if (me.shields.length <= br || ((this.level === 'hard' || this.personality === 'control') && br >= 2 && me.shields.length <= guard)) {
        return sorted[0];
      }
    } else {
      // 仲間が攻撃されている → 大事な仲間なら守る
      const tv = game.power(ctx.target);
      const cheap = sorted.find((b) => game.power(b) < tv && game.power(b) >= ap);
      if (cheap) return cheap;
    }
    return null;
  }

  async useTrigger(game, pi, card) {
    await this.think(0.5);
    const d = def(card);
    if (d.effect === 'spellC') return game.opps(pi).some((p) => p.battle.some((x) => !x.tapped));
    if (d.type === 'spell') return this.spellUseful(game, pi, card) || d.effect === 'spellD';
    return true;
  }
}
