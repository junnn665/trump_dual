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
  blocker: { badge: 'BL', label: 'ブロッカー', text: '相手クリーチャーの攻撃をタップしてブロックできる。' },
  rebirth: { badge: 'RB', label: 'リバース', text: '破壊されたとき、墓地ではなくマナゾーンに置く。' },
  draw: { badge: 'DR', label: 'ドロー', text: 'バトルゾーンに出たとき、カードを1枚引く。' },
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

/** カードの「性能」を返す（キャッシュ付き） */
export function def(card) {
  const key = card.joker ? 'JOKER' : card.suit + card.rank;
  if (defCache.has(key)) return defCache.get(key);
  const d = buildDef(card);
  defCache.set(key, d);
  return d;
}

function buildDef(card) {
  if (card.joker) {
    return {
      type: 'creature', kind: 'joker', name: '虹色の道化師ジョーカー', suit: 'X', rankLabel: 'JK',
      cost: 5, power: 9000, breaker: 2, trigger: true, allCiv: true,
      abilities: ['speed', 'blocker', 'rebirth', 'draw'],
      text: '全文明。S・トリガー。全スートの能力（SA・BL・RB・DR）をすべて持つ。W・ブレイカー。',
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
      abilities: [ab], text: `進化：自分の${SUITS[s].sym}クリーチャー1体の上に重ねて出す。進化したターンから攻撃できる。W・ブレイカー。`, big: true };
  }
  if (r === 13) {
    return { type: 'creature', kind: 'king', name, suit: s, rankLabel: 'K', cost: 7, power: 15000, breaker: 3, trigger: false,
      abilities: [ab], onEnter: 'king' + s, text: 'T・ブレイカー。' + KING_TEXT[s], big: true };
  }
  if (r === 1) {
    return { type: 'creature', kind: 'ace', name, suit: s, rankLabel: 'A', cost: 6, power: 12000, breaker: 2, trigger: false,
      abilities: [ab], onAttack: 'aceSnipe', text: 'W・ブレイカー。攻撃するとき、相手のパワー3000以下のクリーチャーを1体破壊する。', big: true };
  }
  return {
    type: 'creature', kind: 'number', name, suit: s, rankLabel: String(r), cost: COST_BY_RANK[r], power: r * 1000,
    breaker: r >= 9 ? 2 : 1, trigger: false, abilities: [ab], text: r >= 9 ? 'W・ブレイカー。' : '',
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
  const jokers = spec && spec.jokers != null ? spec.jokers : 1;
  const deck = [];
  for (let k = 0; k < copies; k++) for (const s of suits) for (const r of ranks) deck.push(newCard(nextUid(), owner, s, r, false));
  for (let j = 0; j < jokers; j++) deck.push(newCard(nextUid(), owner, 'X', 0, true));
  return deck;
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
    for (const a of d.abilities) if (d.kind !== 'joker') lines.push(`【${ABILITY_TEXT[a].label}】${ABILITY_TEXT[a].text}`);
  }
  return lines;
}
