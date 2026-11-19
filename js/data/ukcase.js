// Родовий відмінок українських чоловічих імен і прізвищ («Андрій Шевченко» → «Андрія Шевченка»).
// Лише для імен кирилицею; що не впізнали — null (тоді трансляція бере фразу в називному відмінку).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const VOW = 'аеєиіїоуюяь';
  const SIBIL = 'жчшщ';

  function word(w, isFirst) {
    if (!/^[А-ЯІЇЄҐа-яіїєґ'’-]+$/.test(w)) return null;
    if (w.includes('-')) { const parts = w.split('-').map((x) => word(x, isFirst)); return parts.every(Boolean) ? parts.join('-') : null; }
    const low = w.toLowerCase();
    const end = (x) => low.endsWith(x);
    const cut = (n, add) => w.slice(0, w.length - n) + add;
    if (isFirst && low === 'ілля') return 'Іллі';
    if (isFirst && low === 'лев') return 'Лева';
    if (isFirst && low === 'павло') return 'Павла';
    if (isFirst && low === 'петро') return 'Петра';
    if (end('ський') || end('цький') || end('зький')) return cut(2, 'ого');
    if (end('ий')) return cut(2, 'ого');
    if (end('ій')) return cut(1, 'я'); // Андрій → Андрія, Бабій → Бабія
    if (end('ець')) return cut(3, 'ця'); // Кравець → Кравця
    if (end('ь')) return cut(1, 'я');
    if (end('о')) return cut(1, 'а'); // Шевченко → Шевченка, Данило → Данила
    if (end('я')) return cut(1, 'і');
    if (end('а')) return cut(1, SIBIL.includes(low[low.length - 2]) ? 'і' : 'и'); // Микола → Миколи
    if (end('ей') || end('ай')) return cut(1, 'я');
    if (!VOW.includes(low[low.length - 1])) return w + 'а'; // Олександр → Олександра, Мудрик → Мудрика
    return null;
  }

  /** Родовий відмінок повного імені (одне чи два слова) або null. */
  FM.ukGen = function ukGen(full) {
    const parts = String(full).trim().split(/\s+/);
    if (!parts.length || parts.length > 3) return null;
    const out = parts.map((w, i) => word(w, i === 0 && parts.length > 1));
    return out.every(Boolean) ? out.join(' ') : null;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
