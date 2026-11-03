// CPU同士を大量に対戦させ、ルール処理にエラーや無限ループがないか確認する
//   使い方: node tests/simulate.js [対戦数]
import { Game } from '../js/engine.js';
import { AIController } from '../js/ai.js';

const N = Number(process.argv[2] || 300);
const levels = ['easy', 'normal', 'hard'];
const result = {};
let turns = 0, draws = 0;

// 不変条件チェック：カードの重複がなく、総数が常に 53枚×2人 = 106枚
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
  if (strict ? total !== 106 : total > 106) throw new Error('カード総数が不正: ' + total);
}

const ui = { event: async (type, data, game) => { check(game, ['turnStart', 'turnEnd', 'gameover'].includes(type)); } };

for (let i = 0; i < N; i++) {
  const a = levels[i % 3], b = levels[Math.floor(i / 3) % 3];
  const g = new Game({
    controllers: [new AIController(a, { delay: 0 }), new AIController(b, { delay: 0 })],
    names: [a + '0', b + '1'], ui,
  });
  const w = await g.run();
  turns += g.turnCount;
  if (w === -1) { draws++; continue; }
  const key = `${a} vs ${b}`;
  result[key] = result[key] || [0, 0];
  result[key][w]++;
}
console.log(`対戦数 ${N} / 平均ターン ${(turns / N).toFixed(1)} / 引き分け ${draws}`);
console.table(result);
