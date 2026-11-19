// Спільні дрібниці: збереження, форматування, створення елементів.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const SAVE_KEY = 'golovnyi-trener:v1';

  FM.store = {
    load() {
      try {
        const raw = root.localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    },
    save(state) {
      try { root.localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
    },
    clear() {
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
