// =========================================================
//  カードの絵柄（本物のトランプ風）
//   2〜10：本物と同じ並びのマーク（下半分は逆さ）
//   A    ：大きな飾りマーク
//   J・Q・K：上下対称の絵札
//   JOKER：道化師
//  すべて SVG で描く（画像ファイル不要・拡大してもきれい）
// =========================================================
import { SUITS } from './cards.js';

// スートの形（0〜100 の箱に収まる）
const SUIT_SHAPES = {
  S: '<path d="M50 4C34 26 6 42 6 64c0 17 20 26 37 15-2 9-7 15-14 19h42c-7-4-12-10-14-19 17 11 37 2 37-15C94 42 66 26 50 4z"/>',
  H: '<path d="M50 94C22 70 3 52 3 31 3 15 15 4 29 4c10 0 17 6 21 14 4-8 11-14 21-14 14 0 26 11 26 27 0 21-19 39-47 63z"/>',
  D: '<path d="M50 2Q68 28 90 50 68 72 50 98 32 72 10 50 32 28 50 2z"/>',
  C: '<circle cx="50" cy="27" r="20"/><circle cx="27" cy="58" r="20"/><circle cx="73" cy="58" r="20"/><path d="M45 50h10c0 22 5 36 16 47H29c11-11 16-25 16-47z"/>',
};

/** ページに1回だけ、スートの形を <symbol> として登録する */
export function installSuitSymbols() {
  if (document.getElementById('suit-defs')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'suit-defs';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = Object.entries(SUIT_SHAPES).map(([k, d]) => `<symbol id="suit-${k}" viewBox="0 0 100 100">${d}</symbol>`).join('')
    + `<linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f2c23a"/><stop offset="1" stop-color="#a86a06"/></linearGradient>`
    + `<linearGradient id="g-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d5e"/><stop offset=".25" stop-color="#ffc531"/><stop offset=".5" stop-color="#2fbf71"/><stop offset=".75" stop-color="#2fa8ff"/><stop offset="1" stop-color="#8b6cff"/></linearGradient>`;
  document.body.prepend(svg);
}

const pip = (s, x, y, size, color, flip = false) =>
  `<use href="#suit-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="3"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;

// 本物のトランプと同じマークの並び（列 L/M/R、行 0〜1）
const L = 30, M = 50, R = 70;
const LAYOUT = {
  2: [[M, 0], [M, 1]],
  3: [[M, 0], [M, 0.5], [M, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [M, 0.75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [M, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [M, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [M, 5 / 6], [L, 1], [R, 1]],
};
const TOP = 31, BOTTOM = 86; // マークを置く高さの範囲（viewBox 0 0 100 142）

function pips(s, rank, color) {
  const size = rank <= 3 ? 20 : rank <= 8 ? 17 : 15;
  return LAYOUT[rank].map(([x, t]) => {
    const y = TOP + (BOTTOM - TOP) * t;
    return pip(s, x, y, size, color, t > 0.5);
  }).join('');
}

function ace(s, color) {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r1 = 30, r2 = i % 2 ? 36 : 40;
    return `<line x1="${50 + Math.cos(a) * r1}" y1="${61 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * r2}" y2="${61 + Math.sin(a) * r2}"/>`;
  }).join('');
  return `<g stroke="url(#g-gold)" stroke-width="2" stroke-linecap="round">${rays}</g>
    <circle cx="50" cy="61" r="28" fill="none" stroke="url(#g-gold)" stroke-width="2.5"/>
    <circle cx="50" cy="61" r="24" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>
    ${pip(s, 50, 61, 36, color)}
    <path d="M30 98q20 8 40 0" fill="none" stroke="url(#g-gold)" stroke-width="2"/>`;
}

/** 絵札（上半分を描いて、下半分は180度回転させて同じ絵を描く） */
function court(s, kind, color) {
  const skin = '#f6d7b0', ink = '#3a2412', gold = 'url(#g-gold)';
  let hair = '', crown = '', item = '';
  if (kind === 'king') {
    hair = `<path d="M43 39q7 12 14 0v3q-7 10-14 0z" fill="#e8e2d0" stroke="${ink}" stroke-width=".6"/>`;
    crown = `<path d="M42 33l1-8 3.5 4 3.5-6 3.5 6 3.5-4 1 8z" fill="${gold}" stroke="${ink}" stroke-width=".6"/><circle cx="50" cy="29.5" r="1.3" fill="${color}"/>`;
    item = `<path d="M63 30v28" stroke="#d9dde8" stroke-width="2.4"/><path d="M59 34h8" stroke="${gold}" stroke-width="2.4"/><circle cx="63" cy="29" r="1.6" fill="${gold}"/>`;
  } else if (kind === 'queen') {
    hair = `<path d="M43 36q-3 8 1 14M57 36q3 8-1 14" stroke="#7a4a1c" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    crown = `<path d="M44 32q6-6 12 0l-1-4-2.5 2-2.5-4-2.5 4-2.5-2z" fill="${gold}" stroke="${ink}" stroke-width=".6"/><circle cx="50" cy="27" r="1.4" fill="${color}"/>`;
    item = `<g transform="translate(63 44)"><circle r="2.4" fill="${color}"/><circle cx="3" r="2" fill="#fff" opacity=".85"/><circle cx="-3" r="2" fill="#fff" opacity=".85"/><circle cy="3" r="2" fill="#fff" opacity=".85"/><circle cy="-3" r="2" fill="#fff" opacity=".85"/><circle r="1.4" fill="${gold}"/><path d="M0 3v14" stroke="#2f8f4f" stroke-width="1.2"/></g>`;
  } else {
    hair = `<path d="M44 35q6-4 12 0v2q-6-3-12 0z" fill="#7a4a1c"/>`;
    crown = `<path d="M43 33q7-9 14 0z" fill="${color}" stroke="${ink}" stroke-width=".6"/><path d="M56 30q8-8 10-2" stroke="${gold}" stroke-width="1.6" fill="none"/>`;
    item = `<path d="M36 26v34" stroke="#c9a06a" stroke-width="1.6"/><path d="M36 27q-6 4 0 9z" fill="#d9dde8" stroke="${ink}" stroke-width=".5"/>`;
  }
  const half = `
    <path d="M30 61l20-17 20 17z" fill="${color}" stroke="${ink}" stroke-width=".7"/>
    <path d="M36 61l14-12 14 12" fill="none" stroke="${gold}" stroke-width="1.6"/>
    <path d="M42 61l8-7 8 7" fill="none" stroke="#fff" stroke-width="1" opacity=".7"/>
    <ellipse cx="50" cy="46" rx="9" ry="3" fill="${gold}" stroke="${ink}" stroke-width=".5"/>
    <circle cx="50" cy="38" r="6.2" fill="${skin}" stroke="${ink}" stroke-width=".7"/>
    <circle cx="47.8" cy="37.6" r=".7" fill="${ink}"/><circle cx="52.2" cy="37.6" r=".7" fill="${ink}"/>
    <path d="M48.4 41q1.6 1 3.2 0" stroke="#b5503a" stroke-width=".7" fill="none"/>
    ${hair}${crown}${item}`;
  return `<rect x="20" y="24" width="60" height="74" rx="3" fill="${color}" opacity=".16"/>
    <rect x="20" y="24" width="60" height="74" rx="3" fill="none" stroke="${color}" stroke-width="1.4"/>
    <rect x="22.5" y="26.5" width="55" height="69" rx="2" fill="none" stroke="url(#g-gold)" stroke-width=".8"/>
    <clipPath id="cp-${s}-${kind}"><rect x="20" y="24" width="60" height="74" rx="3"/></clipPath>
    <g clip-path="url(#cp-${s}-${kind})">
      <g>${half}</g>
      <g transform="rotate(180 50 61)">${half}</g>
    </g>
    <line x1="20" y1="61" x2="80" y2="61" stroke="${color}" stroke-width=".8" opacity=".6"/>
    ${pip(s, 27, 31, 9, color)}${pip(s, 73, 91, 9, color, true)}`;
}

function joker(red) {
  const ink = '#3a2412';
  // 赤：赤と金の帽子・黒：黒と紫の帽子
  const [c1, c2, c3, bg] = red ? ['#ff2e45', '#ff9d1c', '#ffd45a', '#ff4d5e'] : ['#2a2340', '#8b6cff', '#5a4a8a', '#3a2d6a'];
  return `<rect x="16" y="22" width="68" height="78" rx="4" fill="${bg}" opacity=".16"/>
    <path d="M50 52q-14-18-30-12 10 2 14 14z" fill="${c1}" stroke="${ink}" stroke-width=".7"/>
    <path d="M50 52q14-18 30-12-10 2-14 14z" fill="${c2}" stroke="${ink}" stroke-width=".7"/>
    <path d="M50 52q-3-22 0-30 3 8 0 30z" fill="${c3}" stroke="${ink}" stroke-width=".7"/>
    <circle cx="20" cy="40" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".5"/>
    <circle cx="80" cy="40" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".5"/>
    <circle cx="50" cy="22" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".5"/>
    <path d="M38 54h24l-3 4H41z" fill="${c2}" stroke="${ink}" stroke-width=".6"/>
    <circle cx="50" cy="66" r="10" fill="#fff6ec" stroke="${ink}" stroke-width=".8"/>
    <path d="M46 61l-2 3M54 61l2 3" stroke="${ink}" stroke-width="1"/>
    <circle cx="45" cy="65" r="1" fill="${ink}"/><circle cx="55" cy="65" r="1" fill="${ink}"/>
    <circle cx="50" cy="68" r="1.8" fill="#ff4d5e"/>
    <path d="M44 71q6 5 12 0" stroke="${ink}" stroke-width="1" fill="none"/>
    <path d="M36 82q14 10 28 0l-4 12H40z" fill="${c1}" stroke="${ink}" stroke-width=".7"/>
    <path d="M36 80q4 4 7 0 4 4 7 0 4 4 7 0 4 4 7 0" fill="none" stroke="#fff" stroke-width="2"/>`;
}

/** エクストラ（アルカナ）の絵柄 */
function arcana(rank) {
  const ink = '#2a1a4a';
  const bg = `<rect x="16" y="22" width="68" height="78" rx="4" fill="url(#g-gold)" opacity=".18"/>
    <rect x="19" y="25" width="62" height="72" rx="3" fill="none" stroke="#8b6cff" stroke-width=".6" stroke-dasharray="2 1.5"/>`;
  const roman = { 2: 'X', 3: 'XVI', 4: 'XVII', 5: 'XIX', 6: 'I', 7: 'VII', 8: 'IX', 9: 'XX', 10: 'XIII' }[rank];
  const num = `<text x="50" y="35" text-anchor="middle" font-size="7" font-weight="900" fill="#6b4bd6" font-family="Georgia, serif">${roman}</text>`;
  let pic = '';
  if (rank === 2) { // 運命の輪
    const spokes = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<line x1="50" y1="64" x2="${50 + 17 * Math.cos(a)}" y2="${64 + 17 * Math.sin(a)}" stroke="${ink}" stroke-width="1"/>`; }).join('');
    pic = `<circle cx="50" cy="64" r="20" fill="#ffe9a8" stroke="${ink}" stroke-width="1.2"/><circle cx="50" cy="64" r="17" fill="none" stroke="#8b6cff" stroke-width="1.5"/>${spokes}
      <circle cx="50" cy="64" r="5" fill="url(#g-gold)" stroke="${ink}" stroke-width=".8"/>
      ${['♠', '♥', '♦', '♣'].map((m, i) => { const a = (i * Math.PI) / 2 - Math.PI / 4; return `<text x="${50 + 11 * Math.cos(a)}" y="${66.5 + 11 * Math.sin(a)}" text-anchor="middle" font-size="6" fill="${['#8b6cff', '#ff4d5e', '#2fa8ff', '#2fbf71'][i]}">${m}</text>`; }).join('')}`;
  } else if (rank === 3) { // 塔
    pic = `<path d="M40 92V52l10-8 10 8v40z" fill="#9a8fb8" stroke="${ink}" stroke-width="1"/>
      <path d="M37 52h26l-2-5H39z" fill="#6f638f" stroke="${ink}" stroke-width=".8"/>
      <rect x="46" y="60" width="8" height="10" rx="4" fill="#ffd45a" stroke="${ink}" stroke-width=".6"/>
      <rect x="47" y="78" width="6" height="14" fill="${ink}"/>
      <path d="M62 30l-8 14h6l-7 13 14-17h-7l7-10z" fill="#fff36b" stroke="#ff9d1c" stroke-width=".8"/>
      <path d="M33 60l-6 4M67 66l7 3M30 74l-5 1" stroke="#ff6a3d" stroke-width="1.6" stroke-linecap="round"/>`;
  } else if (rank === 4) { // 星
    const star = (x, y, r, f) => { const p = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`; }).join(' '); return `<polygon points="${p}" fill="${f}" stroke="${ink}" stroke-width=".7"/>`; };
    pic = `${star(50, 62, 20, 'url(#g-gold)')}${star(28, 44, 5, '#9fd8ff')}${star(73, 46, 4, '#ffa3ab')}${star(30, 84, 4, '#8ef0b8')}${star(72, 84, 5, '#b9a6ff')}
      <path d="M22 96q28-10 56 0" fill="none" stroke="#2fa8ff" stroke-width="1.4"/>`;
  } else if (rank === 6) { // 魔術師
    pic = `<path d="M38 50l12-14 12 14z" fill="#6b4bd6" stroke="${ink}" stroke-width=".8"/><circle cx="50" cy="56" r="7" fill="#fff6ec" stroke="${ink}" stroke-width=".8"/>
      <circle cx="47.5" cy="55.5" r=".9" fill="${ink}"/><circle cx="52.5" cy="55.5" r=".9" fill="${ink}"/><path d="M47 59q3 2 6 0" stroke="${ink}" stroke-width=".8" fill="none"/>
      <path d="M40 92l4-28h12l4 28z" fill="#8b6cff" stroke="${ink}" stroke-width=".8"/>
      <line x1="62" y1="70" x2="72" y2="48" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/><circle cx="72" cy="47" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".6"/>
      <path d="M26 80l3-3 3 3-3 3zM70 86l2-2 2 2-2 2zM28 48l2-2 2 2-2 2z" fill="#ffd45a"/>
      <text x="50" y="44" text-anchor="middle" font-size="5" fill="#ffd45a">∞</text>`;
  } else if (rank === 7) { // 戦車
    pic = `<path d="M26 74h48l-4 12H30z" fill="#9a8fb8" stroke="${ink}" stroke-width="1"/><rect x="34" y="58" width="32" height="16" rx="2" fill="#6b4bd6" stroke="${ink}" stroke-width="1"/>
      <circle cx="34" cy="88" r="7" fill="#ffe9a8" stroke="${ink}" stroke-width="1"/><circle cx="66" cy="88" r="7" fill="#ffe9a8" stroke="${ink}" stroke-width="1"/>
      <path d="M34 81v14M27 88h14M66 81v14M59 88h14" stroke="${ink}" stroke-width=".7"/>
      <path d="M50 58V44l10 4-10 4" fill="#ff4d5e" stroke="${ink}" stroke-width=".7"/>
      <path d="M18 66h8M16 72h8M18 78h6" stroke="#ff9d1c" stroke-width="1.6" stroke-linecap="round"/>`;
  } else if (rank === 8) { // 隠者
    pic = `<path d="M36 94l6-40q8-10 16 0l6 40z" fill="#5a4a8a" stroke="${ink}" stroke-width="1"/>
      <path d="M42 54q8-12 16 0q-8 6-16 0z" fill="#3a2d6a" stroke="${ink}" stroke-width=".7"/>
      <path d="M48 58q2 6 4 0" stroke="#fff" stroke-width="1.6" fill="none"/>
      <line x1="66" y1="94" x2="68" y2="56" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/>
      <path d="M68 50l5 4v8h-10v-8z" fill="#ffd45a" stroke="${ink}" stroke-width=".7"/><circle cx="68" cy="58" r="2.4" fill="#fff36b"/>
      <circle cx="68" cy="58" r="9" fill="#fff36b" opacity=".25"/>`;
  } else if (rank === 9) { // 審判
    pic = `<path d="M24 54q6-10 16-6 4-8 12-4 8-6 14 2 10 0 10 8z" fill="#c9c2dd" stroke="${ink}" stroke-width=".8"/>
      <path d="M54 56l-10 16h8l-9 18 18-22h-9l8-12z" fill="#fff36b" stroke="#ff9d1c" stroke-width=".9"/>
      <path d="M30 84l4-4M70 82l-4-3M26 92h8M66 92h8" stroke="#ffd45a" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M58 46q6-6 10 0" stroke="url(#g-gold)" stroke-width="2" fill="none"/>`;
  } else if (rank === 10) { // 死神
    pic = `<path d="M34 94q-2-34 16-44 18 10 16 44z" fill="#2a2340" stroke="${ink}" stroke-width="1"/>
      <circle cx="50" cy="58" r="8" fill="#f2efe6" stroke="${ink}" stroke-width=".8"/><circle cx="47" cy="57" r="1.6" fill="${ink}"/><circle cx="53" cy="57" r="1.6" fill="${ink}"/>
      <path d="M47 62h6M48.5 62v2M51.5 62v2" stroke="${ink}" stroke-width=".7"/>
      <line x1="70" y1="94" x2="70" y2="40" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/>
      <path d="M70 40q-18-4-24 8q10-6 24-2z" fill="#cfd8e3" stroke="${ink}" stroke-width=".8"/>`;
  } else { // 太陽
    const rays = Array.from({ length: 16 }, (_, i) => { const a = (i * Math.PI) / 8, r1 = 15, r2 = i % 2 ? 22 : 27; return `<line x1="${50 + r1 * Math.cos(a)}" y1="${63 + r1 * Math.sin(a)}" x2="${50 + r2 * Math.cos(a)}" y2="${63 + r2 * Math.sin(a)}" stroke="#ff9d1c" stroke-width="${i % 2 ? 1.4 : 2.4}" stroke-linecap="round"/>`; }).join('');
    pic = `${rays}<circle cx="50" cy="63" r="14" fill="url(#g-gold)" stroke="${ink}" stroke-width="1"/>
      <circle cx="45" cy="61" r="1.3" fill="${ink}"/><circle cx="55" cy="61" r="1.3" fill="${ink}"/><path d="M44 67q6 5 12 0" stroke="${ink}" stroke-width="1.1" fill="none"/>`;
  }
  return bg + num + pic;
}

const cache = new Map();

/** カード1枚分の絵柄 SVG（viewBox 0 0 100 142、カード全面に重ねる） */
export function artSVG(card, kind) {
  const key = card.joker ? 'JK' + card.rank : card.suit + card.rank;
  if (cache.has(key)) return cache.get(key);
  const s = card.joker ? 'X' : card.suit;
  const color = SUITS[s].color;
  let body;
  if (card.joker && card.rank >= 2) body = arcana(card.rank);
  else if (card.joker) body = joker(card.rank === 1);
  else if (card.rank >= 2 && card.rank <= 10) body = pips(s, card.rank, color);
  else if (card.rank === 1) body = `<g transform="translate(50 30) scale(.9) translate(-50 -34)">${ace(s, color)}</g>`;
  else body = `<g transform="translate(50 24) scale(.91) translate(-50 -24)">${court(s, kind, color)}</g>`;
  if (card.joker && card.rank < 2) body = `<g transform="translate(50 22) scale(.92) translate(-50 -22)">${body}</g>`;
  // 右上のインデックス（数字＋マーク）
  const label = card.joker ? '' : { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] || String(card.rank);
  const index = card.joker
    ? `<text x="88" y="17" text-anchor="middle" font-size="9" font-weight="900" fill="${card.rank >= 2 ? '#6b4bd6' : card.rank === 1 ? '#e01e35' : '#1b1446'}" stroke="#fff" stroke-width=".3" font-family="Georgia, serif" letter-spacing="-.3">${card.rank >= 2 ? 'EX' : 'JKR'}</text>`
    : `<text x="88" y="18" text-anchor="middle" font-size="${label.length > 1 ? 13 : 16}" font-weight="900" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width=".5" font-family="Georgia, 'Times New Roman', serif">${label}</text>${pip(s, 88, 26, 9, color)}`;
  const svg = `<svg class="c-svg" viewBox="0 0 100 142" preserveAspectRatio="none" aria-hidden="true">${body}${index}</svg>`;
  cache.set(key, svg);
  return svg;
}
