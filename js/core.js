// Спільні дрібниці: збереження, форматування, створення елементів.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const SAVE_KEY = 'golovnyi-trener:v1';

  // Збереження в браузері. Три слоти кар'єри й контрольні точки (початок кожного тижня, останні 4) —
  // в IndexedDB (місця там вистачає); стиснуто (gzip + base64). Без IndexedDB — один слот у localStorage.
  const ACTIVE_KEY = 'golovnyi-trener:slot';
  const KEEP_BACKUPS = 4;
  const ls = {
    get(k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    del(k) { try { root.localStorage.removeItem(k); } catch (_) { /* приватне вікно */ } },
  };
  let dbp = null;
  function idb() {
    if (!root.indexedDB) return Promise.resolve(null);
    if (!dbp) dbp = new Promise((res) => {
      try {
        const rq = root.indexedDB.open('golovnyi-trener', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch (_) { res(null); }
    });
    return dbp;
  }
  async function kv(mode, fn) {
    const db = await idb();
    if (!db) return undefined;
    return new Promise((res) => {
      try {
        const tx = db.transaction('kv', mode), st = tx.objectStore('kv');
        const rq = fn(st);
        tx.oncomplete = () => res(rq ? rq.result : true);
        tx.onerror = tx.onabort = () => res(undefined);
      } catch (_) { res(undefined); }
    });
  }
  const kget = (k) => kv('readonly', (st) => st.get(k));
  const kput = (k, v) => kv('readwrite', (st) => st.put(v, k));
  const kdel = (k) => kv('readwrite', (st) => st.delete(k));
  const decodeRaw = async (raw) => (!raw ? null : raw.startsWith('{') ? JSON.parse(raw) : FM.saveio.decode(raw));

  let saveSeq = 0;
  let queue = Promise.resolve(); // записи по черзі: контрольні точки не перемішуються
  const enqueue = (fn) => (queue = queue.then(fn, fn));
  FM.store = {
    SLOTS: [1, 2, 3],
    active() { return Number(ls.get(ACTIVE_KEY)) || 1; },
    setActive(n) { ls.set(ACTIVE_KEY, String(n)); },
    async load() {
      try {
        const n = FM.store.active();
        const raw = await kget('slot:' + n);
        if (raw) return await decodeRaw(raw);
        if (n === 1) return await decodeRaw(ls.get(SAVE_KEY)); // давнє збереження з localStorage — перенесеться при наступному записі
        return null;
      } catch (_) { return null; }
    },
    /** Повертає Promise<bool>. Пізніший виклик перекриває ранній, навіть якщо той ще стискається. */
    async save(state, info = {}) {
      const my = ++saveSeq;
      let text;
      try {
        const json = JSON.stringify(state); // знімок одразу, поки стан не змінився
        text = typeof CompressionStream === 'function' ? await FM.saveio.encodeJson(json) : json;
      } catch (_) { return false; }
      const n = FM.store.active();
      return enqueue(async () => {
        if (my !== saveSeq) return true;
        try {
        if (await kput('slot:' + n, text)) {
          const tag = `${state.season.year}-${String(state.season.week).padStart(2, '0')}`;
          const meta = (await kget('meta:' + n)) || {};
          const backs = (meta.backs || []).slice();
          if (!backs.includes(tag)) { // перший запис тижня — контрольна точка
            await kput(`back:${n}:${tag}`, text);
            backs.push(tag);
            while (backs.length > KEEP_BACKUPS) await kdel(`back:${n}:${backs.shift()}`);
          }
          await kput('meta:' + n, { manager: state.manager, club: info.club || '', year: state.season.year, week: state.season.week, saved: Date.now(), backs });
          if (n === 1) ls.del(SAVE_KEY); // перенесено з localStorage
          return true;
        }
        if (n !== 1) return false; // без IndexedDB — лише перший слот
        return ls.set(SAVE_KEY, text);
      } catch (_) { return false; }
      });
    },
    async meta(n) { return (await kget('meta:' + n)) || (n === 1 && ls.get(SAVE_KEY) ? { legacy: true } : null); },
    /** Повернути слот до контрольної точки (початок тижня). */
    rollback(n, tag) { saveSeq++; return enqueue(() => rollbackNow(n, tag)); },
    clear(n = FM.store.active()) { saveSeq++; return enqueue(() => clearNow(n)); },
  };
  async function rollbackNow(n, tag) {
    const raw = await kget(`back:${n}:${tag}`);
    if (!raw) return false;
    await kput('slot:' + n, raw);
    const meta = (await kget('meta:' + n)) || {};
    meta.backs = (meta.backs || []).filter((t) => t <= tag); // пізніші точки вже не мають сенсу
    const [y, w] = tag.split('-').map(Number);
    meta.year = y; meta.week = w;
    await kput('meta:' + n, meta);
    return true;
  }
  async function clearNow(n) {
    const meta = await kget('meta:' + n);
    for (const t of (meta && meta.backs) || []) await kdel(`back:${n}:${t}`);
    await kdel('slot:' + n); await kdel('meta:' + n);
    if (n === 1) ls.del(SAVE_KEY);
  }

  /** el('div.card', { onclick }, [дочірні…]) — короткий конструктор DOM. */
  FM.el = function el(spec, attrs, children) {
    if (Array.isArray(attrs) || typeof attrs === 'string' || typeof attrs === 'number' || (typeof Node !== 'undefined' && attrs instanceof Node)) { children = attrs; attrs = null; }
    const [tag, ...classes] = spec.split('.');
    const node = document.createElement(tag || 'div');
    if (classes.length) node.className = classes.join(' ');
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children == null ? [] : children)) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  };

  /**
   * Збереження у вигляді тексту: «GT1.» + base64 стиснутого gzip JSON (якщо браузер уміє стискати),
   * інакше «GT0.» + base64 звичайного JSON. Розпізнає й просто JSON.
   */
  const b64 = {
    from(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); },
    to(str) { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; },
  };
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  FM.saveio = {
    encode(obj) { return FM.saveio.encodeJson(JSON.stringify(obj)); },
    async encodeJson(json) {
      const bytes = new TextEncoder().encode(json);
      if (typeof CompressionStream === 'function') return 'GT1.' + b64.from(await pipe(bytes, new CompressionStream('gzip')));
      return 'GT0.' + b64.from(bytes);
    },
    async decode(text) {
      const t = String(text).trim();
      if (t.startsWith('{')) return JSON.parse(t);
      if (t.startsWith('GT0.')) return JSON.parse(new TextDecoder().decode(b64.to(t.slice(4))));
      if (t.startsWith('GT1.')) {
        if (typeof DecompressionStream !== 'function') throw new Error('Цей браузер не вміє розпаковувати збереження.');
        return JSON.parse(new TextDecoder().decode(await pipe(b64.to(t.slice(4)), new DecompressionStream('gzip'))));
      }
      throw new Error('Це не схоже на збереження гри.');
    },
  };

  /** Українська множина: plural(3, 'очко', 'очки', 'очок') → «очки». */
  FM.plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  };

  FM.fmt = {
    money(mln) {
      if (mln == null) return '—';
      if (mln >= 1) return '€' + (mln >= 10 ? Math.round(mln) : mln.toFixed(1).replace('.', ',')) + ' млн';
      return '€' + Math.round(mln * 1000) + ' тис.';
    },
    int(n) { return n == null ? '—' : Math.round(n).toLocaleString('uk-UA'); },
    date(iso) {
      if (!iso) return '—';
      const [y, m, d] = iso.split('-');
      return `${d}.${m}.${y}`;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
