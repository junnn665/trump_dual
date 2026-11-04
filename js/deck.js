// =========================================================
//  デッキ構築：54種類から40枚を選んで「マイデッキ」を作る
//   同じカードは4枚まで（黒・赤ジョーカーはそれぞれ1枚まで）
// =========================================================
import { ALL_KEYS, DECK_KEYS, EXTRA_KEYS, MAX_EXTRA, DECK_SIZE, validDeck, parseCardKey, def, SUITS, SUIT_KEYS, deckToCode, codeToDeck, maxCopies, MAX_COPIES } from './cards.js';
import { faceHTML } from './ui.js';
import { myFoils, myLevels } from './collection.js';
import { sfx } from './sound.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('td_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('td_' + k, JSON.stringify(v)); } catch { /* 無視 */ } },
};

const cardOf = (key) => ({ uid: 0, owner: 0, under: [], tapped: false, sick: false, ...parseCardKey(key), foil: myFoils()[key], lv: myLevels()[key] });

// ---------------- デッキの保存枠（5つまで・名前つき） ----------------
export const SLOTS = 5;
/** 保存してあるデッキ [{ name, list }]（前の「マイデッキ1つ」の形式からも引きつぐ） */
export function deckSlots() {
  let slots = store.get('decks', null);
  if (!Array.isArray(slots)) {
    const old = store.get('deck', null);
    slots = [{ name: 'マイデッキ1', list: Array.isArray(old) ? old : [] }];
  }
  while (slots.length < SLOTS) slots.push({ name: `マイデッキ${slots.length + 1}`, list: [] });
  return slots.slice(0, SLOTS).map((d, i) => ({ name: String((d && d.name) || `マイデッキ${i + 1}`).slice(0, 12), list: Array.isArray(d && d.list) ? d.list : [] }));
}
export function saveSlots(slots) { store.set('decks', slots); }
export function activeSlot() {
  const s = store.get('settings', {});
  return Math.max(0, Math.min(SLOTS - 1, Number(s.deckSlot) || 0));
}

/** いま使うデッキ（マイデッキが有効で正しければその40枚、なければ null＝標準54枚） */
export function activeDeck() {
  const s = store.get('settings', {});
  if (s.deckMode !== 'custom') return null;
  const d = deckSlots()[activeSlot()];
  return d && validDeck(d.list) ? d.list : null;
}
export function activeDeckName() {
  const s = store.get('settings', {});
  if (s.deckMode !== 'custom') return '標準デッキ';
  const d = deckSlots()[activeSlot()];
  return d && validDeck(d.list) ? d.name : '標準デッキ';
}

/** 対戦前のデッキえらび（標準＋保存した完成デッキ） */
export function openDeckPicker(app, onDone) {
  const ui = app.ui;
  const slots = deckSlots();
  const cur = app.settings.deckMode === 'custom' ? activeSlot() : -1;
  const row = (i, name, ok, sub) => `<button class="dk-row ${cur === i ? 'on' : ''}" data-i="${i}" ${ok ? '' : 'disabled'}><b>${name.replace(/[<>&"]/g, '')}</b><small>${sub}</small>${cur === i ? '<em>使用中</em>' : ''}</button>`;
  const m = ui.openModal(`<h2>🗂 どのデッキで戦う？</h2>
    <div class="dk-list">${row(-1, '標準デッキ', true, '54枚ぜんぶ')}${slots.map((d, i) => {
      const ok = validDeck(d.list);
      const by = {};
      for (const k of d.list) by[k[0]] = (by[k[0]] || 0) + 1;
      return row(i, d.name, ok, ok ? ['S', 'C', 'H', 'D'].map((s) => `${SUITS[s].sym}${by[s] || 0}`).join(' ') : `未完成（${d.list.length}/${DECK_SIZE}枚）`);
    }).join('')}</div>
    <div class="btns row"><button class="btn" data-a="edit">✏ デッキを編集</button><button class="btn ghost" data-a="close">閉じる</button></div>`, { center: true });
  m.el.querySelectorAll('.dk-row').forEach((b) => {
    b.onclick = () => {
      sfx.click();
      const i = Number(b.dataset.i);
      app.settings.deckMode = i < 0 ? 'standard' : 'custom';
      if (i >= 0) app.settings.deckSlot = i;
      app.applySettings();
      m.close();
      app.showRecord();
      if (onDone) onDone();
    };
  });
  m.el.querySelector('[data-a=edit]').onclick = () => { sfx.click(); m.close(); openDeckBuilder(app); };
  m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); m.close(); };
}

// おまかせデッキ：カードごとの点数が高い順に40枚
const PRESETS = {
  random: { name: '🎲 おまかせ', score: () => 0 },
  aggro: { name: '♠ 速攻', score: (c, d) => (c.suit === 'S' ? 6 : 0) + (d.cost <= 3 ? 3 : 0) + (d.trigger ? 2 : 0) - (d.cost >= 7 ? 3 : 0) },
  wall: { name: '♣ 要塞', score: (c, d) => (c.suit === 'C' ? 6 : 0) + (d.trigger ? 4 : 0) + (d.power >= 6000 ? 1 : 0) },
  big: { name: '♚ 大型', score: (c, d) => (d.power >= 8000 ? 5 : 0) + (d.big ? 3 : 0) + (d.trigger ? 3 : 0) + (d.cost <= 2 ? 1 : 0) },
  royal: { name: '👑 ロイヤル狙い', score: (c, d) => ([10, 11, 12, 13, 1].includes(c.rank) ? 6 : 0) + (c.suit === 'H' ? 2 : 0) + (d.trigger ? 2 : 0) },
};
/** おすすめデッキ：点数が高いカードほど多く入れる（おまかせは1枚ずつ） */
export function preset(id) {
  const p = PRESETS[id];
  const ranked = ALL_KEYS.map((k) => { const c = cardOf(k); return { k, s: p.score(c, def(c)) + Math.random() * 1.5 }; }).sort((a, b) => b.s - a.s);
  const list = [];
  const want = id === 'random' ? () => 1 : (i) => (i < 6 ? 3 : i < 16 ? 2 : 1);
  for (let pass = 0; pass < 3 && list.length < DECK_SIZE; pass++) {
    ranked.forEach(({ k }, i) => {
      const have = list.filter((x) => x === k).length;
      const target = Math.min(maxCopies(k), pass === 0 ? want(i) : have + 1);
      while (list.length < DECK_SIZE && have < target && list.filter((x) => x === k).length < target) list.push(k);
    });
  }
  return list.slice(0, DECK_SIZE);
}
const toCounts = (list) => { const n = new Map(); for (const k of list) if (DECK_KEYS.includes(k)) n.set(k, Math.min(maxCopies(k), (n.get(k) || 0) + 1)); return n; };
const toList = (counts) => DECK_KEYS.flatMap((k) => Array(counts.get(k) || 0).fill(k));
const total = (counts) => [...counts.values()].reduce((a, b) => a + b, 0);

export function openDeckBuilder(app, slotIdx = activeSlot()) {
  const ui = app.ui;
  const slots = deckSlots();
  let slot = slotIdx;
  let list = slots[slot].list.length ? slots[slot].list : preset('random');
  let chosen = toCounts(list); // カード → 枚数
  let mode = app.settings.deckMode === 'custom' ? 'custom' : 'standard';
  let dirty = false;

  const dbItem = (k) => `<div class="dex-item db-item" data-key="${k}">${faceHTML(cardOf(k))}<b class="db-check">×0</b><button class="db-minus" data-minus="${k}" aria-label="1枚へらす">−</button></div>`;
  const groups = [...SUIT_KEYS, 'X'].map((s) => `
    <h3 class="dex-h" style="color:${SUITS[s].color}">${SUITS[s].sym} ${SUITS[s].full}</h3>
    <div class="dex-grid">${ALL_KEYS.filter((k) => k[0] === s).map(dbItem).join('')}</div>`).join('')
    + `<h3 class="dex-h" style="color:#b9a6ff">✦ エクストラ（アルカナ）</h3><p class="dex-extra-note">トランプ以外の特別カード。全文明。デッキに<b>合計${MAX_EXTRA}枚</b>まで</p>
    <div class="dex-grid">${EXTRA_KEYS.map(dbItem).join('')}</div>`;

  const m = ui.openModal(`<h2>🗂 デッキ編成<small>40枚をえらぶ。タップで1枚追加・−で1枚へらす・長押しで詳しく見る<br>同じカードは${MAX_COPIES}枚まで（ジョーカーは黒・赤それぞれ1枚まで、エクストラは合計1枚まで）</small></h2>
    <div class="seg db-mode" data-key="mode"><button data-v="standard">標準（54枚ぜんぶ）</button><button data-v="custom">マイデッキ（40枚）</button></div>
    <div class="db-slots" id="db-slots"></div>
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

  const renderSlots = () => {
    m.el.querySelector('#db-slots').innerHTML = slots.map((d, i) => `<button class="db-slot ${i === slot ? 'on' : ''}" data-slot="${i}"><b>${d.name.replace(/[<>&"]/g, '')}</b><small>${i === slot ? `${total(chosen)}枚` : validDeck(d.list) ? '完成' : `${d.list.length}枚`}</small></button>`).join('')
      + '<button class="db-slot rename" data-rename="1">✏ 名前</button>';
  };
  const refresh = () => {
    const n = total(chosen);
    renderSlots();
    const listNow = toList(chosen);
    m.el.querySelector('#db-count').innerHTML = `<b class="${n === DECK_SIZE ? 'ok' : 'ng'}">${n}</b> / ${DECK_SIZE}枚`;
    const bySuit = {};
    for (const k of listNow) bySuit[k[0]] = (bySuit[k[0]] || 0) + 1;
    m.el.querySelector('#db-suits').innerHTML = [...SUIT_KEYS, 'X'].map((s) => `<span style="color:${SUITS[s].color}">${SUITS[s].sym}${bySuit[s] || 0}</span>`).join('');
    // コスト分布
    const curve = [0, 0, 0, 0, 0, 0, 0];
    let trig = 0;
    for (const k of listNow) { const d = def(cardOf(k)); curve[Math.min(7, d.cost) - 1]++; if (d.trigger) trig++; }
    const max = Math.max(1, ...curve);
    m.el.querySelector('#db-curve').innerHTML = curve.map((v, i) => `<div class="bar"><i style="height:${(v / max) * 100}%"></i><span>${v}</span><small>${i + 1}${i === 6 ? '+' : ''}</small></div>`).join('')
      + `<div class="db-trig">コスト別の枚数<br>S・トリガー ${trig}枚</div>`;
    m.el.querySelectorAll('.db-item').forEach((it) => {
      const c = chosen.get(it.dataset.key) || 0;
      it.classList.toggle('in', c > 0);
      it.classList.toggle('full', c >= maxCopies(it.dataset.key));
      it.querySelector('.db-check').textContent = '×' + c;
    });
    m.el.querySelectorAll('.db-mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    m.el.querySelector('.db-grid-wrap').classList.toggle('disabled', mode === 'standard');
    const msg = m.el.querySelector('#db-msg');
    msg.textContent = mode === 'standard' ? '標準デッキでは54枚すべてを使います' : n === DECK_SIZE ? '' : `あと${DECK_SIZE - n > 0 ? `${DECK_SIZE - n}枚えらんでね` : `${n - DECK_SIZE}枚外してね`}`;
    m.el.querySelector('[data-a=save]').disabled = mode === 'custom' && n !== DECK_SIZE;
    m.el.querySelector('#db-code').textContent = n === DECK_SIZE ? deckToCode(listNow) : 'デッキコード：40枚そろうと表示';
    m.el.querySelector('[data-code=copy]').disabled = n !== DECK_SIZE;
  };
  m.el.querySelector('.db-code').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-code]');
    if (!b) return;
    sfx.click();
    if (b.dataset.code === 'copy') {
      const code = deckToCode(toList(chosen));
      const text = `トランプ・デュエルのデッキコード ${code}`;
      try {
        if (navigator.share) { await navigator.share({ title: 'デッキコード', text }); return; }
      } catch { return; }
      try { await navigator.clipboard.writeText(code); ui.toast('デッキコードをコピーしました'); } catch { prompt('このコードを送ってね', code); }
      return;
    }
    const input = prompt('デッキコードを入力してね（例：TD2-XXXX-XXXX-…）');
    if (input == null) return;
    const list = codeToDeck(input);
    if (!list) { ui.toast('デッキコードが読めませんでした'); sfx.error(); return; }
    chosen = toCounts(list);
    mode = 'custom';
    refresh();
    ui.toast('デッキを読み込みました。「保存する」で確定');
  });

  m.el.querySelector('.db-grid-wrap').addEventListener('click', (e) => {
    if (ui.suppressClick) return;
    if (mode === 'standard') return;
    const minus = e.target.closest('[data-minus]');
    if (minus) {
      const k = minus.dataset.minus;
      const c = chosen.get(k) || 0;
      if (c > 0) { sfx.click(); if (c === 1) chosen.delete(k); else chosen.set(k, c - 1); refresh(); }
      return;
    }
    const it = e.target.closest('.db-item');
    if (!it) return;
    const k = it.dataset.key;
    const c = chosen.get(k) || 0;
    if (EXTRA_KEYS.includes(k) && EXTRA_KEYS.reduce((a, x) => a + (chosen.get(x) || 0), 0) >= MAX_EXTRA) { sfx.error(); ui.toast(`エクストラはデッキに合計${MAX_EXTRA}枚までです`); return; }
    if (c >= maxCopies(k)) { sfx.error(); ui.toast(k[0] === 'X' ? 'ジョーカーは1枚までです' : `同じカードは${MAX_COPIES}枚までです`); return; }
    if (total(chosen) >= DECK_SIZE) { sfx.error(); ui.toast(`${DECK_SIZE}枚までです（−で減らしてね）`); return; }
    sfx.click();
    chosen.set(k, c + 1);
    refresh();
  });
  m.el.querySelector('#db-slots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot],[data-rename]');
    if (!b) return;
    sfx.click();
    if (b.dataset.rename) {
      const v = prompt('デッキの名前（12文字まで）', slots[slot].name);
      if (v && v.trim()) { slots[slot].name = v.trim().slice(0, 12); saveSlots(slots); refresh(); }
      return;
    }
    // ほかの枠へ：いまの編集はその枠に一時保存してから切りかえ
    slots[slot].list = toList(chosen);
    slot = Number(b.dataset.slot);
    chosen = toCounts(slots[slot].list);
    mode = 'custom';
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
    chosen = toCounts(b.dataset.preset === 'clear' ? [] : preset(b.dataset.preset));
    refresh();
  });
  m.el.querySelector('[data-a=save]').onclick = () => {
    sfx.click();
    slots[slot].list = toList(chosen);
    saveSlots(slots);
    if (mode === 'custom') app.settings.deckSlot = slot;
    app.settings.deckMode = mode;
    app.applySettings();
    ui.toast(mode === 'custom' ? `「${slots[slot].name}」を保存して使います` : '保存しました（対戦は標準デッキ）');
    m.close();
    app.showRecord();
  };
  m.el.querySelector('[data-a=close]').onclick = () => { sfx.click(); saveSlots(slots.map((d, i) => (i === slot ? { ...d } : d))); m.close(); };
  ui.bindPeek(m.el.querySelector('.db-grid-wrap'), (el) => {
    const it = el.closest('.db-item');
    return it ? cardOf(it.dataset.key) : null;
  });
  refresh();
}
