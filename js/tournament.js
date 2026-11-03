// =========================================================
//  大会モード：8人のトーナメントを勝ち抜く（あなた＋CPU 7人）
//   自分の試合はふつうに遊び、CPUどうしの試合は裏で一瞬で決着させる
// =========================================================
import { Game } from './engine.js';
import { AIController } from './ai.js';

const RIVALS = [
  { name: 'ジン', level: 'normal' },
  { name: 'モス', level: 'normal' },
  { name: 'フレイア', level: 'normal' },
  { name: 'アルカナ', level: 'hard' },
  { name: 'ガルヴァス', level: 'hard' },
  { name: 'ディアナ', level: 'hard' },
  { name: 'カイザー', level: 'hard' },
];
const ROUND_NAMES = ['1回戦', '準決勝', '決勝'];

export class Tournament {
  constructor() {
    const rivals = [...RIVALS].sort(() => Math.random() - 0.5);
    this.players = [{ name: 'あなた', me: true }, ...rivals.map((r) => ({ name: r.name, level: r.level }))];
    // 対戦表：あなたは必ず左上
    const order = [0, ...[1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5)];
    this.rounds = [[]];
    for (let i = 0; i < 8; i += 2) this.rounds[0].push({ a: order[i], b: order[i + 1], w: null });
    this.round = 0;
    this.out = false; // あなたが負けた
  }

  get roundName() { return ROUND_NAMES[this.round] || ''; }
  get myMatch() { return (this.rounds[this.round] || []).find((m) => (m.a === 0 || m.b === 0) && m.w === null) || null; }
  get champion() { const f = this.rounds[2] && this.rounds[2][0]; return f && f.w !== null ? f.w : null; }
  opponentOf(m) { return this.players[m.a === 0 ? m.b : m.a]; }

  /** CPU どうしの試合を一瞬で決着させる */
  async simulate(m) {
    const pa = this.players[m.a], pb = this.players[m.b];
    const g = new Game({ controllers: [new AIController(pa.level, { delay: 0 }), new AIController(pb.level, { delay: 0 })] });
    let w = await g.run();
    if (w < 0) w = Math.random() < 0.5 ? 0 : 1;
    m.w = w === 0 ? m.a : m.b;
  }

  /** 自分の試合の結果を入れて、ほかの試合も進め、次の回戦を作る */
  async report(win) {
    const m = this.myMatch;
    if (m) {
      m.w = win ? 0 : m.a === 0 ? m.b : m.a;
      if (!win) this.out = true;
    }
    await this.finishRound();
    // あなたが負けたら、決勝まで一気に進める
    while (this.out && this.champion === null) await this.finishRound();
  }

  async finishRound() {
    for (const m of this.rounds[this.round]) if (m.w === null && m.a !== 0 && m.b !== 0) await this.simulate(m);
    if (this.rounds[this.round].some((m) => m.w === null)) return;
    if (this.round >= 2) return;
    const winners = this.rounds[this.round].map((m) => m.w);
    const next = [];
    for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i], b: winners[i + 1], w: null });
    this.rounds.push(next);
    this.round++;
  }
}
