// =========================================================
//  実績と称号
//   実績を解除すると、その名前を「称号」として名前の横に付けられる
// =========================================================
const store = {
  get(k, d) { try { const v = localStorage.getItem('td_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('td_' + k, JSON.stringify(v)); } catch { /* 無視 */ } },
};

/**
 * c（対戦の結果）: { mode, level, stage, n, win, place, st（自分の成績）, myShields, turnCount, record, cleared, stages, foils }
 */
export const ACHIEVEMENTS = [
  { id: 'first', title: 'ルーキー', desc: 'はじめて勝利する', icon: '🔰', check: (c) => c.win },
  { id: 'hard', title: '強者', desc: 'CPU「つよい」に勝つ', icon: '💪', check: (c) => c.win && c.mode === 'cpu' && c.stage == null && c.level === 'hard' && c.n === 2 },
  { id: 'speed', title: '速攻王', desc: '12ターン以内に勝つ（1対1）', icon: '⚡', check: (c) => c.win && c.n === 2 && c.turnCount <= 12 },
  { id: 'perfect', title: '無傷の王者', desc: 'シールドを1枚も割られずに勝つ', icon: '🛡', check: (c) => c.win && c.myShields >= 5 && c.st.shieldsLost === 0 },
  { id: 'trigger', title: '逆転の一手', desc: 'S・トリガーを使った試合で勝つ', icon: '⚡', check: (c) => c.win && c.st.triggers > 0 },
  { id: 'royal', title: 'ロイヤルの覇者', desc: 'ロイヤルストレートフラッシュで勝つ', icon: '👑', check: (c) => c.st.royal },
  { id: 'pair4', title: '四つ子の絆', desc: 'フォーカードを作る', icon: '🃏', check: (c) => c.st.hands.includes('フォーカード') },
  { id: 'full', title: '満員御礼', desc: 'フルハウスを作る', icon: '🏠', check: (c) => c.st.hands.includes('フルハウス') },
  { id: 'sflush', title: '王道を往く者', desc: 'ストレートフラッシュを作る', icon: '🌈', check: (c) => c.st.hands.includes('ストレートフラッシュ') },
  { id: 'tbreak', title: '三連撃', desc: '1回の攻撃でシールドを3枚ブレイク', icon: '💥', check: (c) => c.st.maxBreak >= 3 },
  { id: 'king', title: '王の帰還', desc: 'キングを出した試合で勝つ', icon: '♚', check: (c) => c.win && c.st.kings > 0 },
  { id: 'joker', title: '道化師', desc: 'ジョーカーを場に出す', icon: '🤡', check: (c) => c.st.jokers > 0 },
  { id: 'destroy', title: '破壊神', desc: '1試合で6体以上撃破', icon: '🔥', check: (c) => c.st.destroys >= 6 },
  { id: 'streak5', title: '連勝街道', desc: '5連勝する', icon: '🔥', check: (c) => c.record.streak >= 5 },
  { id: 'streak10', title: '不敗神話', desc: '10連勝する', icon: '🏆', check: (c) => c.record.streak >= 10 },
  { id: 'boss1', title: '挑戦者', desc: 'チャレンジのボスを1体倒す', icon: '🏰', check: (c) => c.cleared >= 1 },
  { id: 'bossall', title: '全ボス制覇', desc: 'チャレンジを全部クリア', icon: '🏯', check: (c) => c.cleared >= c.stages },
  { id: 'online', title: 'ネット決闘者', desc: 'オンライン対戦で勝つ', icon: '🌐', check: (c) => c.win && c.mode === 'online' },
  { id: 'online10', title: '歴戦の勇者', desc: 'オンライン対戦で10勝', icon: '⚔', check: (c) => (c.record.online.w || 0) >= 10 },
  { id: 'br', title: 'ラストサバイバー', desc: 'バトルロイヤルで1位', icon: '🥇', check: (c) => c.win && c.n > 2 },
  { id: 'hunter', title: '狩人', desc: 'バトルロイヤルで2人以上を倒す', icon: '🎯', check: (c) => c.n > 2 && c.st.kills >= 2 },
  { id: 'gold10', title: '金の収集家', desc: '金・虹カードを10種類集める', icon: '✨', check: (c) => c.foils >= 10 },
  { id: 'rainbow', title: '虹を掴む者', desc: '虹カードを手に入れる', icon: '🌈', check: (c) => c.rainbow >= 1 },
];

export function unlocked() {
  const u = store.get('ach', {});
  return u && typeof u === 'object' ? u : {};
}

/** 条件を満たした新しい実績を記録して返す */
export function checkAchievements(ctx) {
  const u = unlocked();
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (u[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(ctx); } catch { ok = false; }
    if (ok) { u[a.id] = Date.now(); fresh.push(a); }
  }
  if (fresh.length) store.set('ach', u);
  return fresh;
}

export function titleOf(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a && unlocked()[id] ? a.title : '';
}
