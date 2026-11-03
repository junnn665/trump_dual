// =========================================================
//  デッキ構築：53種類から40枚を選んで「マイデッキ」を作る
// =========================================================
import { ALL_KEYS, DECK_SIZE, validDeck, parseCardKey, def, SUITS, SUIT_KEYS, deckToCode, codeToDeck } from './cards.js';
import { faceHTML } from './ui.js';
import { myFoils } from './collection.js';
import { sfx } from './sound.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('td_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('td_' + k, JSON.stringify(v)); } catch { /* 無視 */ } },
};

const cardOf = (key) => ({ uid: 0, owner: 0, under: [], tapped: false, sick: false, ...parseCardKey(key), foil: myFoils()[key] });

/** いま使うデッキ（マイデッキが有効で正しければその40枚、なければ null＝標準53枚） */
export function activeDeck() {
  const s = store.get('settings', {});
  const list = store.get('deck', null);
  return s.deckMode === 'custom' && validDeck(list) ? list : null;
}

// おまかせデッキ：カードごとの点数が高い順に40枚
const PRESETS = {
  random: { name: '🎲 おまかせ', score: () => 0 },
  aggro: { name: '♠ 速攻', score: (c, d) => (c.suit === 'S' ? 6 : 0) + (d.cost <= 3 ? 3 : 0) + (d.trigger ? 2 : 0) - (d.cost >= 7 ? 3 : 0) },
  wall: { name: '♣ 要塞', score: (c, d) => (c.suit === 'C' ? 6 : 0) + (d.trigger ? 4 : 0) + (d.power >= 6000 ? 1 : 0) },
  big: { name: '♚ 大型', score: (c, d) => (d.power >= 8000 ? 5 : 0) + (d.big ? 3 : 0) + (d.trigger ? 3 : 0) + (d.cost <= 2 ? 1 : 0) },
  royal: { name: '👑 ロイヤル狙い', score: (c, d) => ([10, 11, 12, 13, 1].includes(c.rank) ? 6 : 0) + (c.suit === 'H' ? 2 : 0) + (d.trigger ? 2 : 0) },
};
function preset(id) {
  const p = PRESETS[id];
  return ALL_KEYS.map((k) => { const c = cardOf(k); return { k, s: p.score(c, def(c)) + Math.random() * 1.5 }; })
    .sort((a, b) => b.s - a.s).slice(0, DECK_SIZE).map((x) => x.k);
}

export function openDeckBuilder(app) {
  const ui = app.ui;
  let list = store.get('deck', null);
  if (!Array.isArray(list)) list = preset('random');
  let chosen = new Set(list.filter((k) => ALL_KEYS.includes(k)));
  let mode = app.settings.deckMode === 'custom' ? 'custom' : 'standard';

  const groups = [...SUIT_KEYS, 'X'].map((s) => `
    <h3 class="dex-h" style="color:${SUITS[s].color}">${SUITS[s].sym} ${SUITS[s].full}</h3>
    <div class="dex-grid">${ALL_KEYS.filter((k) => k[0] === s).map((k) => `<div class="dex-item db-item" data-key="${k}">${faceHTML(cardOf(k))}<b class="db-check">✓</b></div>`).join('')}</div>`).join('');

  const m = ui.openModal(`<h2>🗂 デッキ編成<small>40枚をえらぶ（同じカードは1枚まで）・長押しで詳しく見る</small></h2>
    <div class="seg db-mode" data-key="mode"><button data-v="standard">標準（53枚ぜんぶ）</button><button data-v="custom">マイデッキ（40枚）</button></div>
    <div class="db-head">
      <div class="db-count" id="db-count"></div>
      <div class="db-suits" id="db-suits"></div>
    </div>
    <div class="db-curve" id="db-curve"></div>
    <div class="db-presets">${Object.entries(PRESETS).map(([id, p]) => `<button class="btn small" data-preset="${id}">${p.name}</button>`).join('')}<button class="btn small ghost" data-preset="clear">ぜんぶ外す</button></div>
    <div class="db-code"><code id="db-code"></code><button class="btn small" data-code="copy">📋 コピー</button><button class="btn small" data-code="load">📥 コードで読み込む</button></div>
    <div class="dex db-grid-wrap">${groups}</div>
    <p class="mp-msg" id="db-msg"></p>
    <div class="btns row"><button class="btn primary" data-a="save">保存する</button><button class="btn ghost" data-a="close">閉じる</button></div>`, { center: true, dismiss: false });
  m.el.querySelector('.sheet').classList.add('wide');

  const refresh = () => {
    const n = chosen.size;
    m.el.querySelector('#db-count').innerHTML = `<b class="${n === DECK_SIZE ? 'ok' : 'ng'}">${n}</b> / ${DECK_SIZE}枚`;
    const bySuit = {};
    for (const k of chosen) bySuit[k[0]] = (bySuit[k[0]] || 0) + 1;
    m.el.querySelector('#db-suits').innerHTML = [...SUIT_KEYS, 'X'].map((s) => `<span style="color:${SUITS[s].color}">${SUITS[s].sym}${bySuit[s] || 0}</span>`).join('');
    // コスト分布
    const curve = [0, 0, 0, 0, 0, 0, 0];
    let trig = 0;
    for (const k of chosen) { const d = def(cardOf(k)); curve[Math.min(7, d.cost) - 1]++; if (d.trigger) trig++; }
    const max = Math.max(1, ...curve);
    m.el.querySelector('#db-curve').innerHTML = curve.map((v, i) => `<div class="bar"><i style="height:${(v / max) * 100}%"></i><span>${v}</span><small>${i + 1}${i === 6 ? '+' : ''}</small></div>`).join('')
      + `<div class="db-trig">コスト別の枚数<br>S・トリガー ${trig}枚</div>`;
    m.el.querySelectorAll('.db-item').forEach((it) => it.classList.toggle('in', chosen.has(it.dataset.key)));
    m.el.querySelectorAll('.db-mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    m.el.querySelector('.db-grid-wrap').classList.toggle('disabled', mode === 'standard');
    const msg = m.el.querySelector('#db-msg');
    msg.textContent = mode === 'standard' ? '標準デッキでは53枚すべてを使います' : n === DECK_SIZE ? '' : `あと${DECK_SIZE - n > 0 ? `${DECK_SIZE - n}枚えらんでね` : `${n - DECK_SIZE}枚外してね`}`;
    m.el.querySelector('[data-a=save]').disabled = mode === 'custom' && n !== DECK_SIZE;
    m.el.querySelector('#db-code').textContent = n === DECK_SIZE ? deckToCode([...chosen]) : 'デッキコード：40枚そろうと表示';
    m.el.querySelector('[data-code=copy]').disabled = n !== DECK_SIZE;
  };
  m.el.querySelector('.db-code').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-code]');
    if (!b) return;
    sfx.click();
    if (b.dataset.code === 'copy') {
      const code = deckToCode([...chosen]);
      const text = `トランプ・デュエルのデッキコード ${code}`;
      try {
        if (navigator.share) { await navigator.share({ title: 'デッキコード', text }); return; }
      } catch { return; }
      try { await navigator.clipboard.writeText(code); ui.toast('デッキコードをコピーしました'); } catch { prompt('このコードを送ってね', code); }
      return;
    }
    const input = prompt('デッキコードを入力してね（例：TD-1A2B-3C4D-5EF）');
    if (input == null) return;
    const list = codeToDeck(input);
    if (!list) { ui.toast('デッキコードが読めませんでした'); sfx.error(); return; }
    chosen = new Set(list);
    mode = 'custom';
    refresh();
    ui.toast('デッキを読み込みました。「保存する」で確定');
  });

  m.el.querySelector('.db-grid-wrap').addEventListener('click', (e) => {
    if (ui.suppressClick) return;
    const it = e.target.closest('.db-item');
    if (!it || mode === 'standard') return;
    sfx.click();
    const k = it.dataset.key;
    if (chosen.has(k)) chosen.delete(k);
    else if (chosen.size < DECK_SIZE) chosen.add(k);
    else { ui.toast(`${DECK_SIZE}枚までです`); return; }
    refresh();
  });
  m.el.querySelector('.db-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    sfx.click();
    mode = b.dataset.v;
    refresh();
  });
  m.el.querySelector('.db-presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    sfx.click();
    mode = 'custom';
    chosen = new Set(b.dataset.preset === 'clear' ? [] : preset(b.dataset.preset));
    refresh();
  });
  m.el.querySelector('[data-a=save]').onclick = () => {
    sfx.click();
    if (mode === 'custom') store.set('deck', [...chosen]);
    app.settings.deckMode = mode;
    app.applySettings();
    ui.toast(mode === 'custom' ? 'マイデッキを保存しました' : '標準デッキを使います');
    m.close();
    app.showRecord();
  };
  m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
  ui.bindPeek(m.el.querySelector('.db-grid-wrap'), (el) => {
    const it = el.closest('.db-item');
    return it ? cardOf(it.dataset.key) : null;
  });
  refresh();
}
