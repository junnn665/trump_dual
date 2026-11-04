// =========================================================
//  金・虹カード（コレクション）
//   勝つと「特別版」のカードがもらえる。性能は同じで見た目がキラキラになる
//   同じカードの金をもう1枚引くと虹に進化する
// =========================================================
import { ALL_KEYS, DECK_KEYS } from './cards.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('td_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('td_' + k, JSON.stringify(v)); } catch { /* 無視 */ } },
};

/** 持っている特別版 { 'S13': 'gold' | 'rainbow' } */
export function myFoils() {
  const f = store.get('foils', {});
  return f && typeof f === 'object' ? f : {};
}

export function foilCounts() {
  const f = myFoils();
  const vals = Object.values(f);
  return { gold: vals.filter((v) => v === 'gold').length, rainbow: vals.filter((v) => v === 'rainbow').length, total: ALL_KEYS.length };
}

// ---------------- カードのレベル ----------------
// 使った回数（召喚・呪文）でレベルが上がる。性能は同じで枠の色が変わる
export const LV_STEPS = [3, 10, 25, 50];
export const LV_NAMES = ['', '銅', '銀', '翠玉', '紅玉'];
export const lvOf = (n) => LV_STEPS.filter((t) => (n || 0) >= t).length;
/** 使った回数 { 'S13': 12, … }（プロフィールに記録済み） */
export function cardUses() {
  const p = store.get('profile', {});
  return (p && p.cards) || {};
}
export function myLevels() {
  const out = {};
  for (const [k, n] of Object.entries(cardUses())) { const l = lvOf(n); if (l) out[k] = l; }
  return out;
}
/** 見た目情報（金・虹＋レベル）をまとめたもの。レベルは 'L:S13': 2 の形で入れる */
export function myLook() {
  const f = { ...myFoils() };
  for (const [k, l] of Object.entries(myLevels())) f['L:' + k] = l;
  return f;
}

/** 部屋に送る・受け取るときの確認（知らない値は捨てる） */
export function cleanFoils(f) {
  const out = {};
  if (!f || typeof f !== 'object') return out;
  for (const [k, v] of Object.entries(f)) {
    if (ALL_KEYS.includes(k) && (v === 'gold' || v === 'rainbow')) out[k] = v;
    else if (k.startsWith('L:') && DECK_KEYS.includes(k.slice(2)) && Number.isInteger(v) && v >= 1 && v <= LV_STEPS.length) out[k] = v;
  }
  return out;
}

/**
 * 特別版を n 枚もらう
 * @param {object} opt { suit: 'S' など（そのスートから）, rainbow: true（虹確定） }
 * @returns [{ key, foil, upgraded }]
 */
export function grantFoils(n, opt = {}) {
  const f = myFoils();
  const got = [];
  for (let i = 0; i < n; i++) {
    let pool = ALL_KEYS.filter((k) => f[k] !== 'rainbow' && (!opt.suit || k[0] === opt.suit || (opt.suit === 'X' && k === 'X0')));
    if (!pool.length) pool = ALL_KEYS.filter((k) => f[k] !== 'rainbow');
    if (!pool.length) break; // 全部虹（コンプリート）
    // まだ持っていないカードが出やすい
    const fresh = pool.filter((k) => !f[k]);
    const src = fresh.length && Math.random() < 0.7 ? fresh : pool;
    const k = src[Math.floor(Math.random() * src.length)];
    const before = f[k];
    const foil = opt.rainbow || before === 'gold' || Math.random() < 0.08 ? 'rainbow' : 'gold';
    f[k] = foil;
    got.push({ key: k, foil, upgraded: before === 'gold' && foil === 'rainbow' });
  }
  store.set('foils', f);
  return got;
}
