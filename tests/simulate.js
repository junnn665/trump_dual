// CPU同士を大量に対戦させ、ルール処理にエラーや無限ループがないか確認する
//   使い方: node tests/simulate.js [対戦数]
import { Game } from '../js/engine.js';
import { AIController } from '../js/ai.js';

const N = Number(process.argv[2] || 300);
const levels = ['easy', 'normal', 'hard'];
const result = {};
let turns = 0, draws = 0, firstGames = 0, firstWins = 0;

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
  if (game.players.filter((p) => !p.out).length < 1) throw new Error('全員脱落');
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
  if (w >= 0) { firstGames++; if (w === g.firstPlayer) firstWins++; }
  if (w === -1) { draws++; continue; }
  const key = `${a} vs ${b}`;
  result[key] = result[key] || [0, 0];
  result[key][w]++;
}
// バトルロイヤル（3人・4人）
const br = { 3: [0, 0, 0], 4: [0, 0, 0, 0] };
let brTurns = 0, brN = 0, brDraw = 0;
for (let i = 0; i < Math.ceil(N / 3); i++) {
  const n = i % 2 ? 4 : 3;
  const lv = Array.from({ length: n }, (_, k) => levels[(i + k) % 3]);
  const g = new Game({ controllers: lv.map((l) => new AIController(l, { delay: 0 })), names: lv.map((l, k) => l + k), ui });
  const w = await g.run();
  brTurns += g.turnCount; brN++;
  if (w < 0) { brDraw++; continue; }
  const rk = g.ranking();
  if (rk.length !== n || new Set(rk).size !== n) throw new Error('順位が不正 ' + rk);
  br[n][w]++;
}
// 2対2（チーム戦）
const team = [0, 0];
let tN = 0;
for (let i = 0; i < Math.ceil(N / 6); i++) {
  const g = new Game({ controllers: [0, 1, 2, 3].map(() => new AIController(levels[i % 3], { delay: 0 })), ui, teams: [0, 1, 0, 1] });
  const w = await g.run();
  if (w < 0) continue;
  if (g.winnerTeam !== g.teams[w]) throw new Error('チームの勝者が不一致');
  if (g.winReason !== 'ロイヤルストレートフラッシュ' && g.players.some((p) => !p.out && g.teams[p.index] !== g.winnerTeam)) throw new Error('負けたチームが残っている');
  team[g.winnerTeam]++; tN++;
}
console.log(`2対2 ${tN}戦 / チームごとの勝ち数`, team);
console.log(`バトルロイヤル ${brN}戦 / 平均ターン ${(brTurns / brN).toFixed(1)} / 引き分け ${brDraw} / 席ごとの勝ち数`, br);
console.log(`対戦数 ${N} / 平均ターン ${(turns / N).toFixed(1)} / 引き分け ${draws} / ロイヤル ${royals} / 役 ${hands}`);
console.log(`先攻の勝率（1対1）: ${(100 * firstWins / firstGames).toFixed(1)}%`);
console.table(result);
