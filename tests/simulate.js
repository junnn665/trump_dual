// CPU同士を大量に対戦させ、ルール処理にエラーや無限ループがないか確認する
//   使い方: node tests/simulate.js [対戦数]
import { Game } from '../js/engine.js';
import { AIController } from '../js/ai.js';

const N = Number(process.argv[2] || 300);
const levels = ['easy', 'normal', 'hard'];
const result = {};
let turns = 0, draws = 0;

// 不変条件チェック：カードの重複がなく、総数が最初から変わらない
function check(game, strict) {
  let total = 0;
  const seen = new Set();
  for (const p of game.players) {
    for (const z of ['deck', 'hand', 'mana', 'battle', 'shields', 'grave']) {
      for (const c of p[z]) {
        if (seen.has(c.uid)) throw new Error('重複カード ' + c.uid);
        seen.add(c.uid);
        total++;
        for (const u of c.under || []) { seen.add(u.uid); total++; }
        if (c.owner !== p.index) throw new Error('所有者不一致');
      }
    }
  }
  if (game.totalCards === undefined) game.totalCards = total;
  if (strict ? total !== game.totalCards : total > game.totalCards) throw new Error('カード総数が不正: ' + total);
}

let royals = 0, hands = 0;
const ui = { event: async (type, data, game) => {
  if (type === 'royal') royals++;
  if (type === 'hand') hands++;
  check(game, ['turnStart', 'turnEnd', 'gameover'].includes(type));
} };
const SETUPS = [[{}, {}], [{}, { deck: { suits: ['S'], copies: 3 }, shields: 7, mana: 2, hand: 7 }], [{ deck: { suits: ['C', 'H'], copies: 2, jokers: 4 } }, { deck: { ranks: [1, 7, 8, 9, 10, 12, 13], copies: 2 } }]];

for (let i = 0; i < N; i++) {
  const a = levels[i % 3], b = levels[Math.floor(i / 3) % 3];
  const g = new Game({
    controllers: [new AIController(a, { delay: 0 }), new AIController(b, { delay: 0 })],
    names: [a + '0', b + '1'], ui, setup: SETUPS[i % SETUPS.length],
  });
  const w = await g.run();
  turns += g.turnCount;
  if (w === -1) { draws++; continue; }
  const key = `${a} vs ${b}`;
  result[key] = result[key] || [0, 0];
  result[key][w]++;
}
console.log(`対戦数 ${N} / 平均ターン ${(turns / N).toFixed(1)} / 引き分け ${draws} / ロイヤル ${royals} / 役 ${hands}`);
console.table(result);
