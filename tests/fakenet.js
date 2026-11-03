// テスト用：Firebase Realtime Database の代わりにメモリ上で動く簡易データベース
// （tests/lockstep.js と tests/online.html から使う。本番では使わない）
export function createFakeNet({ latency = 5 } = {}) {
  const root = {};
  const valueSubs = new Set();
  const childSubs = new Set();
  const clone = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
  const parts = (p) => p.split('/').filter(Boolean);
  const getAt = (p) => {
    let o = root;
    for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
    return o === undefined ? null : o;
  };
  const setAt = (p, v) => {
    const ks = parts(p);
    let o = root;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) delete o[last];
    else o[last] = clone(v);
  };
  let scheduled = false;
  const notify = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      for (const s of valueSubs) {
        const j = JSON.stringify(getAt(s.path));
        if (j !== s.last) { s.last = j; s.cb(JSON.parse(j)); }
      }
      for (const c of childSubs) {
        const v = getAt(c.path) || {};
        for (const k of Object.keys(v).sort()) if (!c.seen.has(k)) { c.seen.add(k); c.cb(k, clone(v[k])); }
      }
    }, latency);
  };
  const disconnectOps = new Map(); // clientId -> Map(path -> value)

  function client(id = Math.random().toString(36).slice(2)) {
    const ops = new Map();
    disconnectOps.set(id, ops);
    return {
      id,
      on(path, cb) {
        const s = { path, cb, last: undefined };
        valueSubs.add(s);
        setTimeout(() => { s.last = JSON.stringify(getAt(path)); cb(clone(getAt(path))); }, latency);
        return () => valueSubs.delete(s);
      },
      onChild(path, cb) {
        const s = { path, cb, seen: new Set() };
        childSubs.add(s);
        notify();
        return () => childSubs.delete(s);
      },
      async get(path) { return clone(getAt(path)); },
      async set(path, v) { setAt(path, v); notify(); },
      async update(path, obj) { for (const [k, v] of Object.entries(obj)) setAt(`${path}/${k}`, v); notify(); },
      async remove(path) { setAt(path, null); notify(); },
      async tx(path, fn) {
        const nv = fn(clone(getAt(path)));
        if (nv === undefined) return { committed: false, val: clone(getAt(path)) };
        setAt(path, nv); notify();
        return { committed: true, val: clone(nv) };
      },
      now() { return Date.now(); },
      onConnected(cb) { setTimeout(() => cb(true), latency); },
      onDisconnectSet(path, v) { ops.set(path, v); },
      cancelDisconnect(path) { ops.delete(path); },
      cleanOld() { return Promise.resolve(); },
      /** テスト用：この端末の通信が切れたことにする */
      drop() { for (const [p, v] of ops) setAt(p, v); notify(); },
    };
  }
  return { root, client };
}
