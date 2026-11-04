// =========================================================
//  カード定義：トランプ1枚 → デュエマ風カードに変換する
// =========================================================

export const SUITS = {
  S: { key: 'S', sym: '♠', name: '黒鋼', full: '黒鋼の軍団', color: '#8b6cff', glow: '#b9a6ff', ability: 'speed' },
  C: { key: 'C', sym: '♣', name: '翠樹', full: '翠樹の砦', color: '#2fbf71', glow: '#8ef0b8', ability: 'blocker' },
  H: { key: 'H', sym: '♥', name: '紅炎', full: '紅炎の民', color: '#ff4d5e', glow: '#ffa3ab', ability: 'rebirth' },
  D: { key: 'D', sym: '♦', name: '蒼晶', full: '蒼晶の賢者', color: '#2fa8ff', glow: '#9fd8ff', ability: 'draw' },
  X: { key: 'X', sym: '★', name: '虹', full: '虹の道化', color: '#ffc531', glow: '#fff0a8', ability: 'all' },
};
export const SUIT_KEYS = ['S', 'C', 'H', 'D'];

export const ABILITY_TEXT = {
  speed: { badge: 'SA', label: 'スピードアタッカー', text: '召喚したターンに攻撃できる。' },
  blocker: { badge: 'BL', label: 'ブロッカー', text: '相手クリーチャーの攻撃をタップしてブロックできる。守るとき（ブロック・攻撃される）バトル中パワー+1500。' },
  rebirth: { badge: 'RB', label: 'リバース', text: 'コスト5以上ならコスト-1。攻撃するときバトル中パワー+2000。破壊されたとき、墓地ではなくマナゾーンに置き、カードを1枚引く。' },
  draw: { badge: 'DR', label: 'ドロー', text: 'バトルゾーンに出たとき、カードを1枚引く。次の自分のターンまでブロッカーになる。守るとき（ブロック・攻撃される）バトル中パワー+2500。' },
};

export const RANK_LABEL = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] || String(r));

const NAMES = {
  S: { 2: 'シャドウ・ピクシー', 3: '黒鋼の斥候ジン', 4: '疾風のクロウ', 5: '影走りカゲロウ', 6: '黒鋼騎士ヴォルグ', 7: '夜叉丸', 8: '漆黒の剣豪ムラクモ', 9: '闇翼竜ノクターン', 10: '黒鋼将軍ガルヴァス',
    1: '黒滅竜ジ・エース', 11: 'ブラック・スラッシュ', 12: '冥界女帝ペルセフォネ', 13: '黒鋼皇帝カイザー・ネロ' },
  C: { 2: 'どんぐり兵ポコ', 3: '翠樹の番人モス', 4: '木霊ガード', 5: '若木の守護者リーフ', 6: '樹海の盾アイビー', 7: '森羅の衛士ドルイド', 8: '大樹巨人ユグド', 9: '翠竜グリーンウォール', 10: '翠樹城塞ガイアフォート',
    1: '翠樹竜アース・エース', 11: 'グリーン・バインド', 12: '森の女神ディアナ', 13: '翠樹王ドゥルガ' },
  H: { 2: '火の粉チッチ', 3: '紅炎の踊り子', 4: 'フレイム・ハウンド', 5: '炎拳のゴウ', 6: '紅蓮騎士アグニ', 7: '火炎魔人イフリート', 8: '爆炎のバルカン', 9: '紅炎竜フェニックス', 10: '紅炎将バーンハルト',
    1: '紅炎竜ハート・エース', 11: 'リバース・フレイム', 12: '不死鳥の女王フレイア', 13: '紅炎覇王ヴォルケイノ' },
  D: { 2: '水晶ピクシー', 3: '蒼晶の見習い', 4: 'アクア・スカウト', 5: 'クリスタル・ゴーレム', 6: '蒼晶術師ミラージュ', 7: '深海の賢者オルカ', 8: '蒼晶機兵ダイヤモンド', 9: '蒼晶竜サファイア', 10: '蒼晶大賢者アルカナ',
    1: '蒼晶竜ダイヤ・エース', 11: 'ブルー・インサイト', 12: '水晶の女帝クリスタリア', 13: '蒼晶帝リヴァイアサン' },
};

const COST_BY_RANK = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6 };

const SPELL_TEXT = {
  S: '相手のパワー6000以下のクリーチャーを1体破壊する。',
  C: '相手のクリーチャーを2体まで選び、タップする。',
  H: '自分の墓地からクリーチャーを1枚手札に戻す。その後、山札の上から1枚をマナに置く。',
  D: 'カードを2枚引く。',
};
const KING_TEXT = {
  S: '出たとき、相手のクリーチャーを1体破壊する。',
  C: '出たとき、山札の上から2枚をシールドに加える。',
  H: '出たとき、自分の墓地からコスト5以下のクリーチャーを1体バトルゾーンに出す。',
  D: '出たとき、カードを3枚引く。',
};

const defCache = new Map();
/** バランス調整用（テストから変えられる） */
export const TWEAK = { heartCut: 1, heartCutMin: 5 };
export function resetDefCache() { defCache.clear(); }

/** カードの「性能」を返す（キャッシュ付き） */
export function def(card) {
  const key = card.joker ? (card.rank >= 2 ? 'EX' + card.rank : 'JOKER' + (card.rank === 1 ? 'R' : 'B')) : card.suit + card.rank;
  if (defCache.has(key)) return defCache.get(key);
  const d = buildDef(card);
  // 紅炎（♥）のコスト5以上のクリーチャーはコスト-1
  if (!card.joker && card.suit === 'H' && d.type === 'creature' && TWEAK.heartCut && d.cost >= TWEAK.heartCutMin) d.cost = Math.max(1, d.cost - TWEAK.heartCut);
  defCache.set(key, d);
  return d;
}

/** エクストラ（アルカナ）カード：トランプ以外の特別カード。デッキに合計1枚まで */
export const EXTRA = {
  2: { type: 'spell', name: '運命の輪', cost: 2, effect: 'exWheel', abilities: [], power: 0, breaker: 0,
    text: 'エクストラ呪文。全文明。カードを2枚引き、山札の上から1枚をマナに置く。' },
  3: { type: 'spell', name: '崩れゆく塔', cost: 6, effect: 'exTower', abilities: [], power: 0, breaker: 0,
    text: 'エクストラ呪文。全文明。相手のパワー5000以下のクリーチャーをすべて破壊する。' },
  4: { type: 'creature', name: '希望の星アストラ', cost: 4, power: 5000, breaker: 1, abilities: ['blocker'], onEnter: 'exStar',
    text: 'エクストラ。全文明。ブロッカー。出たとき、山札の上から1枚をシールドに加える。' },
  5: { type: 'creature', name: '太陽神ソル', cost: 7, power: 14000, breaker: 2, abilities: ['speed'], onEnter: 'exSun',
    text: 'エクストラ。全文明。スピードアタッカー。出たとき、自分のほかのクリーチャーをすべてアンタップする。W・ブレイカー。' },
};
export const isExtra = (c) => !!c && c.joker && c.rank >= 2;
export const isTrueJoker = (c) => !!c && c.joker && c.rank <= 1;

function buildDef(card) {
  if (card.joker && card.rank >= 2) {
    const e = EXTRA[card.rank];
    return { ...e, kind: 'extra', extra: true, suit: 'X', rankLabel: 'EX', trigger: false, allCiv: true, big: true };
  }
  if (card.joker && card.rank === 1) {
    // 赤のジョーカー：粘り強く守る
    return {
      type: 'creature', kind: 'joker', red: true, name: '紅蓮の道化師レッドジョーカー', suit: 'X', rankLabel: 'JK',
      cost: 5, power: 8000, breaker: 2, trigger: true, allCiv: true,
      abilities: ['rebirth', 'draw'], onEnter: 'jokerR',
      text: '全文明。S・トリガー。リバース・ドロー。出たとき、山札の上から1枚をシールドに加える。W・ブレイカー。',
      big: true,
    };
  }
  if (card.joker) {
    // 黒のジョーカー：攻めて壊す
    return {
      type: 'creature', kind: 'joker', black: true, name: '漆黒の道化師ブラックジョーカー', suit: 'X', rankLabel: 'JK',
      cost: 6, power: 10000, breaker: 2, trigger: true, allCiv: true,
      abilities: ['speed', 'blocker'], onEnter: 'jokerB',
      text: '全文明。S・トリガー。スピードアタッカー・ブロッカー。出たとき、相手のパワー8000以下のクリーチャーを1体破壊する。W・ブレイカー。',
      big: true,
    };
  }
  const s = card.suit, r = card.rank;
  const ab = SUITS[s].ability;
  const name = NAMES[s][r];
  if (r === 11) {
    return { type: 'spell', kind: 'jack', name, suit: s, rankLabel: 'J', cost: 3, power: 0, breaker: 0, trigger: true, abilities: [],
      effect: 'spell' + s, text: '呪文。S・トリガー。' + SPELL_TEXT[s] };
  }
  if (r === 12) {
    return { type: 'creature', kind: 'queen', evolution: true, name, suit: s, rankLabel: 'Q', cost: 4, power: 11000, breaker: 2, trigger: false,
      abilities: ab ? [ab] : [], text: `進化：自分の${SUITS[s].sym}クリーチャー1体の上に重ねて出す。進化したターンから攻撃できる。W・ブレイカー。`, big: true };
  }
  if (r === 13) {
    return { type: 'creature', kind: 'king', name, suit: s, rankLabel: 'K', cost: 7, power: 15000, breaker: 3, trigger: false,
      abilities: ab ? [ab] : [], onEnter: 'king' + s, text: 'T・ブレイカー。' + KING_TEXT[s], big: true };
  }
  if (r === 1) {
    return { type: 'creature', kind: 'ace', name, suit: s, rankLabel: 'A', cost: 6, power: 12000, breaker: 2, trigger: false,
      abilities: ab ? [ab] : [], onAttack: 'aceSnipe', text: 'W・ブレイカー。攻撃するとき、相手のパワー3000以下のクリーチャーを1体破壊する。', big: true };
  }
  return {
    type: 'creature', kind: 'number', name, suit: s, rankLabel: String(r), cost: COST_BY_RANK[r], power: r * 1000,
    breaker: r >= 9 ? 2 : 1, trigger: false, abilities: ab ? [ab] : [], text: r >= 9 ? 'W・ブレイカー。' : '',
  };
}

export const has = (card, ability) => def(card).abilities.includes(ability);
export const suitsOf = (card) => (card.joker ? SUIT_KEYS : [card.suit]);

/**
 * 1プレイヤー分のデッキ（52枚＋ジョーカー1枚）
 * uid はオンライン対戦で両方の端末が同じ番号になるよう、ゲームごとに振り直す
 */
export function makeDeck(owner, nextUid, spec = null) {
  // spec（チャレンジモード用）: { suits: ['S'], ranks: [1..13], copies: 3, jokers: 1 }
  const suits = (spec && spec.suits) || SUIT_KEYS;
  const ranks = (spec && spec.ranks) || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const copies = (spec && spec.copies) || 1;
  const jokers = spec && spec.jokers != null ? spec.jokers : 2; // 標準は黒・赤の2枚
  const deck = [];
  // 金・虹カード（見た目だけ）: foils = { 'S13': 'gold' }
  const foils = (spec && spec.foils) || {};
  const put = (s, r, j) => {
    const c = newCard(nextUid(), owner, s, r, j);
    const f = foils[cardKey(c)];
    if (f === 'gold' || f === 'rainbow') c.foil = f;
    const lv = foils['L:' + cardKey(c)];
    if (Number.isInteger(lv) && lv > 0) c.lv = Math.min(4, lv);
    deck.push(c);
  };
  // マイデッキ（デッキ構築）: list = ['S1', 'H13', 'X0', …]
  if (spec && Array.isArray(spec.list)) {
    for (const key of spec.list) {
      const k = parseCardKey(key);
      if (k) put(k.suit, k.rank, k.joker);
    }
    return deck;
  }
  for (let k = 0; k < copies; k++) for (const s of suits) for (const r of ranks) put(s, r, false);
  for (let j = 0; j < jokers; j++) put('X', j % 2, true); // 黒・赤を交互に
  return deck;
}
/** カードの種類を表す短い文字列（'S1' = ♠A、'X0' = ジョーカー） */
export const cardKey = (c) => (c.joker ? 'X' + (c.rank >= 1 && c.rank <= 5 ? c.rank : 0) : c.suit + c.rank);
export function parseCardKey(key) {
  const m = /^([SCHDX])(\d{1,2})$/.exec(String(key));
  if (!m) return null;
  if (m[1] === 'X') return /^[0-5]$/.test(m[2]) ? { suit: 'X', rank: Number(m[2]), joker: true } : null;
  const rank = Number(m[2]);
  if (rank < 1 || rank > 13) return null;
  return { suit: m[1], rank, joker: false };
}
/** 全53種類のキー */
export const ALL_KEYS = [...['S', 'C', 'H', 'D'].flatMap((s) => Array.from({ length: 13 }, (_, i) => s + (i + 1))), 'X0', 'X1']; // X0＝黒ジョーカー、X1＝赤ジョーカー
/** エクストラ（X2〜X5）。デッキに合計1枚まで */
export const EXTRA_KEYS = ['X2', 'X3', 'X4', 'X5'];
export const DECK_KEYS = [...ALL_KEYS, ...EXTRA_KEYS];

/** スートの相性：左が右に強い（バトルでパワー+1000） ♠→♥→♦→♣→♠ */
export const BEATS = { S: 'H', H: 'D', D: 'C', C: 'S' };
export const AFFINITY_BONUS = 1000;
export const DECK_SIZE = 40;
// ---------------- デッキの決まり ----------------
/** 同じカードは何枚まで入れられるか（ジョーカーは黒・赤それぞれ1枚まで） */
export const MAX_COPIES = 4;
export const maxCopies = (key) => (key[0] === 'X' ? 1 : MAX_COPIES);

/** 枚数を数える { 'S13': 2, … } */
export function countDeck(list) {
  const n = {};
  for (const k of list) n[k] = (n[k] || 0) + 1;
  return n;
}

export const MAX_EXTRA = 1;
export const extraCount = (list) => list.filter((k) => EXTRA_KEYS.includes(k)).length;
export function validDeck(list) {
  if (!Array.isArray(list) || list.length !== DECK_SIZE || !list.every((k) => DECK_KEYS.includes(k))) return false;
  if (extraCount(list) > MAX_EXTRA) return false;
  const n = countDeck(list);
  return Object.entries(n).every(([k, c]) => c <= maxCopies(k));
}

// ---------------- デッキコード ----------------
// 54種類それぞれの枚数（0〜4枚）を5進数で1つの大きな数にして、読みまちがえにくい32文字で書く
// （例：TD2-XXXX-XXXX-XXXX-XXXX-XXXX-XX）。前の形式（TD-XXXX-XXXX-XXX）も読める
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 26;
export function deckToCode(list) {
  const n = countDeck(list);
  // いちばん上の桁にエクストラ（0＝なし、1〜4＝X2〜X5）。前のコードは0なのでそのまま読める
  const ex = EXTRA_KEYS.findIndex((k) => n[k]) + 1;
  let v = BigInt(ex);
  for (let i = ALL_KEYS.length - 1; i >= 0; i--) v = v * 5n + BigInt(n[ALL_KEYS[i]] || 0);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) { s = B32[Number(v & 31n)] + s; v >>= 5n; }
  return 'TD2-' + s.match(/.{1,4}/g).join('-');
}
/** コードからデッキに戻す。読めなければ null */
export function codeToDeck(code) {
  const raw = String(code || '').toUpperCase();
  const v2 = /TD\s*2/.test(raw.slice(0, 6));
  let s = raw.replace(/^\s*TD\s*2?/, '').replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  let v = 0n;
  for (const ch of s) {
    const d = B32.indexOf(ch);
    if (d < 0) return null;
    v = (v << 5n) | BigInt(d);
  }
  let list = [];
  if (v2 || s.length === CODE_LEN) {
    if (s.length !== CODE_LEN) return null;
    for (let i = 0; i < ALL_KEYS.length; i++) { const c = Number(v % 5n); v /= 5n; for (let k = 0; k < c; k++) list.push(ALL_KEYS[i]); }
    const ex = Number(v);
    if (ex > EXTRA_KEYS.length) return null;
    if (ex) list.push(EXTRA_KEYS[ex - 1]);
  } else if (s.length === 11) {
    // 前の形式：入っている（1枚）／いない
    list = ALL_KEYS.filter((k, i) => (v >> BigInt(i)) & 1n);
  } else return null;
  return validDeck(list) ? list : null;
}

function newCard(uid, owner, suit, rank, joker) {
  return { uid, owner, suit, rank, joker, tapped: false, sick: false, under: [] };
}

/** 文字列のシードから決定的な乱数を作る（オンライン対戦で山札を一致させる） */
export function seededRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 説明文（詳細表示用） */
export function describe(card) {
  const d = def(card);
  const lines = [];
  if (d.type === 'spell') lines.push(d.text);
  else {
    if (d.text) lines.push(d.text);
    for (const a of d.abilities) if (d.kind !== 'joker' && d.kind !== 'extra') lines.push(`【${ABILITY_TEXT[a].label}】${ABILITY_TEXT[a].text}`);
  }
  return lines;
}
