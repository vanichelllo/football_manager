// Спільні дрібниці: збереження, форматування, створення елементів.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const SAVE_KEY = 'golovnyi-trener:v1';

  // Збереження в браузері: стиснуте (gzip + base64), бо з 16 лігами сирий JSON — кілька мегабайтів,
  // а localStorage вміщає близько п’яти. Без стиснення в браузері — звичайний JSON.
  let saveSeq = 0;
  FM.store = {
    async load() {
      try {
        const raw = root.localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return raw.startsWith('{') ? JSON.parse(raw) : await FM.saveio.decode(raw);
      } catch (_) { return null; }
    },
    /** Повертає Promise<bool>. Пізніший виклик перекриває ранній, навіть якщо той ще стискається. */
    async save(state) {
      const my = ++saveSeq;
      try {
        const json = JSON.stringify(state); // знімок одразу, поки стан не змінився
        const text = typeof CompressionStream === 'function' ? await FM.saveio.encodeJson(json) : json;
        if (my !== saveSeq) return true;
        root.localStorage.setItem(SAVE_KEY, text);
        return true;
      } catch (_) { return false; }
    },
    clear() {
      saveSeq++;
      try { root.localStorage.removeItem(SAVE_KEY); } catch (_) { /* приватне вікно */ }
    },
  };

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
