// オンライン対戦（ロックステップ）のテスト
//  2台の端末＋途中から入る観戦者が、同じ手順から「まったく同じ盤面」になるか確認する
//   使い方: node tests/lockstep.js [対戦数]
import { Game } from '../js/engine.js';
import { seededRng } from '../js/cards.js';
import { SeatController } from '../js/controllers.js';
import { MoveStream } from '../js/stream.js';
import { createFakeNet } from './fakenet.js';

const N = Number(process.argv[2] || 30);

/** 画面の代わりに、でたらめ（ただし正しい）操作をする */
function randomUI(getGame, seat) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    async humanAction(pi) {
      const g = getGame();
      await new Promise((r) => setTimeout(r, 1));
      const me = g.p(pi);
      const acts = [{ t: 'end' }];
      if (g.canCharge(pi)) for (const c of me.hand) acts.push({ t: 'charge', uid: c.uid }, { t: 'charge', uid: c.uid });
      for (const c of me.hand) if (g.canPlay(pi, c).ok) acts.push({ t: 'play', uid: c.uid }, { t: 'play', uid: c.uid }, { t: 'play', uid: c.uid });
      for (const c of me.battle) if (g.canAttack(pi, c)) for (const t of g.attackTargets(pi)) acts.push({ t: 'attack', uid: c.uid, target: t === 'player' ? 'player' : t.uid }, { t: 'attack', uid: c.uid, target: 'player' });
      return pick(acts);
    },
    async pickCard(pi, options, ctx) { return ctx.optional && Math.random() < 0.2 ? null : pick(options); },
    async askBlock(pi, a, blockers) { return Math.random() < 0.5 ? pick(blockers) : null; },
    async askTrigger() { return Math.random() < 0.8; },
    actionError(r) { throw new Error('不正な操作: ' + r); },
  };
}

function fingerprint(g) {
  return JSON.stringify({ w: g.winner, t: g.turnCount, p: g.players.map((p) => ['deck', 'hand', 'mana', 'battle', 'shields', 'grave'].map((z) => p[z].map((c) => `${c.uid}${c.tapped ? 't' : ''}${c.under.length}`).join(','))) });
}

function client(net, path, seat, seed, names) {
  let game;
  return MoveStream.load(net, path).then((stream) => {
    const ui = randomUI(() => game, seat);
    const controllers = [0, 1].map((i) => new SeatController({ ui, stream, local: i === seat }));
    game = new Game({ controllers, names, rng: seededRng(seed) });
    return { game, stream, done: game.run() };
  });
}

let ok = 0, turns = 0;
for (let i = 0; i < N; i++) {
  const db = createFakeNet({ latency: 1 });
  const seed = 'seed' + i + Math.random();
  const path = `rooms/duel-test-m/r1`;
  const names = ['A', 'B'];
  const a = await client(db.client('a'), path, 0, seed, names);
  const b = await client(db.client('b'), path, 1, seed, names);
  // しばらくしてから観戦者が途中参加（過去の手順を早送り）
  await new Promise((r) => setTimeout(r, 30 + Math.random() * 60));
  const s = await client(db.client('s'), path, null, seed, names);
  await Promise.all([a.done, b.done, s.done]);
  const fa = fingerprint(a.game), fb = fingerprint(b.game), fs = fingerprint(s.game);
  if (fa !== fb || fa !== fs) {
    console.error('盤面がずれました', i, { fa: fa.slice(0, 200), fb: fb.slice(0, 200), fs: fs.slice(0, 200) });
    process.exit(1);
  }
  if (s.stream.initial === 0) console.warn('観戦者が早送りなしで入った（タイミング次第）');
  ok++; turns += a.game.turnCount;
  for (const x of [a, b, s]) x.stream.close();
}
console.log(`ロックステップ ${ok}/${N} 戦 すべて一致（平均 ${(turns / N).toFixed(1)} ターン）`);
