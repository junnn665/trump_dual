// =========================================================
//  オンライン対戦の「手順」の流れ
//  両方の端末が同じシードで同じエンジンを動かし、判断（操作・選択）だけを
//  rooms/duel-<番号>-m/r<回>/m00000, m00001 … の順に送り合う（ロックステップ方式）
// =========================================================
const pad = (n) => String(n).padStart(5, '0');

export class MoveStream {
  /**
   * @param {object} net   NET（on/onChild/set…）
   * @param {string} path  手順を置く場所
   * @param {Array} preloaded 参加時点ですでにある手順（途中参加・再読みこみ用）
   */
  constructor(net, path, preloaded = []) {
    this.net = net;
    this.path = path;
    this.moves = [...preloaded];
    this.initial = preloaded.length;
    this.cursor = 0;
    this.buffer = new Map();
    this.waiters = [];
    this.aborted = false;
    this.onDesync = null;
    this.unsub = net.onChild ? net.onChild(path, (key, val) => this.receive(key, val)) : null;
  }

  static async load(net, path) {
    const v = (await net.get(path)) || {};
    const moves = Object.keys(v).filter((k) => /^m\d+$/.test(k)).sort().map((k) => v[k]);
    // 途中が欠けていたら、欠けた所までにする
    const out = [];
    const keys = Object.keys(v).filter((k) => /^m\d+$/.test(k)).sort();
    for (let i = 0; i < keys.length; i++) { if (keys[i] !== 'm' + pad(i)) break; out.push(moves[i]); }
    return new MoveStream(net, path, out);
  }

  /** 過去の手順を早送り中か（演出を省略する） */
  get replaying() { return this.cursor < this.initial; }
  hasNext() { return !this.aborted && this.cursor < this.moves.length; }
  take() { return this.moves[this.cursor++]; }

  next() {
    if (this.aborted) return Promise.resolve({ t: 'abort' });
    if (this.hasNext()) return Promise.resolve(this.take());
    return new Promise((res) => this.waiters.push(res));
  }

  receive(key, val) {
    if (!/^m\d+$/.test(key) || !val) return;
    const idx = Number(key.slice(1));
    if (idx < this.moves.length) return; // 自分が送ったもの・受信ずみ
    this.buffer.set(idx, val);
    while (this.buffer.has(this.moves.length)) {
      const i = this.moves.length;
      this.moves.push(this.buffer.get(i));
      this.buffer.delete(i);
    }
    while (this.waiters.length && this.hasNext()) this.waiters.shift()(this.take());
  }

  async publish(mv) {
    const idx = this.moves.length;
    const clean = {};
    for (const [k, v] of Object.entries(mv)) if (v !== null && v !== undefined) clean[k] = v;
    this.moves.push(clean);
    this.cursor++;
    try {
      await this.net.set(`${this.path}/m${pad(idx)}`, clean);
    } catch (e) {
      console.warn('送信失敗', e);
      if (this.onError) this.onError(e);
    }
  }

  desync(kinds, mv) {
    if (this.onDesync) this.onDesync(kinds, mv);
    this.abort();
  }

  abort() {
    this.aborted = true;
    for (const w of this.waiters) w({ t: 'abort' });
    this.waiters = [];
  }

  close() {
    this.abort();
    if (this.unsub) this.unsub();
    this.unsub = null;
  }
}
