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

function joker() {
  const ink = '#3a2412';
  return `<rect x="16" y="22" width="68" height="78" rx="4" fill="url(#g-rainbow)" opacity=".18"/>
    <path d="M50 52q-14-18-30-12 10 2 14 14z" fill="#ff4d5e" stroke="${ink}" stroke-width=".7"/>
    <path d="M50 52q14-18 30-12-10 2-14 14z" fill="#2fa8ff" stroke="${ink}" stroke-width=".7"/>
    <path d="M50 52q-3-22 0-30 3 8 0 30z" fill="#ffc531" stroke="${ink}" stroke-width=".7"/>
    <circle cx="20" cy="40" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".5"/>
    <circle cx="80" cy="40" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".5"/>
    <circle cx="50" cy="22" r="3" fill="url(#g-gold)" stroke="${ink}" stroke-width=".5"/>
    <path d="M38 54h24l-3 4H41z" fill="#8b6cff" stroke="${ink}" stroke-width=".6"/>
    <circle cx="50" cy="66" r="10" fill="#fff6ec" stroke="${ink}" stroke-width=".8"/>
    <path d="M46 61l-2 3M54 61l2 3" stroke="${ink}" stroke-width="1"/>
    <circle cx="45" cy="65" r="1" fill="${ink}"/><circle cx="55" cy="65" r="1" fill="${ink}"/>
    <circle cx="50" cy="68" r="1.8" fill="#ff4d5e"/>
    <path d="M44 71q6 5 12 0" stroke="${ink}" stroke-width="1" fill="none"/>
    <path d="M36 82q14 10 28 0l-4 12H40z" fill="url(#g-rainbow)" stroke="${ink}" stroke-width=".7"/>
    <path d="M36 80q4 4 7 0 4 4 7 0 4 4 7 0 4 4 7 0" fill="none" stroke="#fff" stroke-width="2"/>`;
}

const cache = new Map();

/** カード1枚分の絵柄 SVG（viewBox 0 0 100 142、カード全面に重ねる） */
export function artSVG(card, kind) {
  const key = card.joker ? 'JK' : card.suit + card.rank;
  if (cache.has(key)) return cache.get(key);
  const s = card.joker ? 'X' : card.suit;
  const color = SUITS[s].color;
  let body;
  if (card.joker) body = joker();
  else if (card.rank >= 2 && card.rank <= 10) body = pips(s, card.rank, color);
  else if (card.rank === 1) body = `<g transform="translate(50 30) scale(.9) translate(-50 -34)">${ace(s, color)}</g>`;
  else body = `<g transform="translate(50 24) scale(.91) translate(-50 -24)">${court(s, kind, color)}</g>`;
  if (card.joker) body = `<g transform="translate(50 22) scale(.92) translate(-50 -22)">${body}</g>`;
  // 右上のインデックス（数字＋マーク）
  const label = card.joker ? '' : { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] || String(card.rank);
  const index = card.joker
    ? `<text x="88" y="17" text-anchor="middle" font-size="9" font-weight="900" fill="url(#g-rainbow)" stroke="#3a2412" stroke-width=".4" font-family="Georgia, serif" letter-spacing="-.3">JKR</text>`
    : `<text x="88" y="18" text-anchor="middle" font-size="${label.length > 1 ? 13 : 16}" font-weight="900" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width=".5" font-family="Georgia, 'Times New Roman', serif">${label}</text>${pip(s, 88, 26, 9, color)}`;
  const svg = `<svg class="c-svg" viewBox="0 0 100 142" preserveAspectRatio="none" aria-hidden="true">${body}${index}</svg>`;
  cache.set(key, svg);
  return svg;
}
