// Генератор випадкових чисел із зерном (mulberry32): однакове зерно — однаковий матч.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  function seedFrom(value) {
    if (typeof value === 'number') return value >>> 0;
    let h = 1779033703 ^ String(value).length;
    for (let i = 0; i < String(value).length; i++) {
      h = Math.imul(h ^ String(value).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  FM.rng = function rng(seed) {
    let a = seedFrom(seed == null ? Date.now() : seed);
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      chance: (p) => next() < p,
      int: (n) => Math.floor(next() * n),
      range: (lo, hi) => lo + next() * (hi - lo),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      /** Вибір за вагами: weighted(список, елемент → вага). */
      weighted(items, weight) {
        let total = 0;
        const ws = items.map((x) => { const w = Math.max(0, weight(x)) || 0; total += w; return w; }); // NaN → 0
        let r = next() * total;
        for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
        return items[items.length - 1];
      },
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
