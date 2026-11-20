// Реалістичний календар сезону (як у FM): передсезоння з початку липня, кожна ліга стартує й фінішує у свій час,
// міжнародні вікна FIFA (вересень, жовтень, листопад, березень) без матчів ліг, зимові перерви, «боксінг-дей» в Англії,
// тури посеред тижня, коли вихідних не вистачає; єврокубки й кубки країн — у реальні тижні.
// Одиниця гри — тиждень (неділя–субота, субота — день туру); календар каже, який тиждень яка дата.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const DAY = 86400000;

  /** Перший тиждень сезону закінчується в суботу, не раніше 4 липня. */
  function seasonStart(year) {
    const d = new Date(Date.UTC(year, 6, 4, 12));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const yr = (Y, m) => (m >= 7 ? Y : Y + 1); // липень–грудень — рік старту, січень–червень — наступний
  /** Номер тижня сезону, у який припадає дата [місяць, день]. */
  function weekOf(start, Y, md) {
    const s = Date.parse(start + 'T12:00:00Z');
    let t = Date.UTC(yr(Y, md[0]), md[0] - 1, md[1], 12);
    if (new Date(t).getUTCDay() === 0) t -= DAY; // неділя — той самий тур вихідних, що й субота
    return Math.floor((t - (s - 6 * DAY)) / (7 * DAY));
  }
  /** Субота в межах [день, день + 6] місяця. */
  function satFrom(Y, m, from) {
    const d = new Date(Date.UTC(yr(Y, m), m - 1, from, 12));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    return [d.getUTCMonth() + 1, d.getUTCDate()];
  }

  // Ліги: старт, фініш, зимова перерва (тижні без туру), боксінг-дей. Дати — орієнтовно як у сезоні 2026/27.
  const LEAGUES = {
    eng: { start: [8, 15], end: [5, 23], boxing: true },
    eng2: { start: [8, 8], end: [5, 2], boxing: true },
    esp: { start: [8, 15], end: [5, 23], brk: [[12, 27], [1, 2]] },
    esp2: { start: [8, 15], end: [5, 30], brk: [[12, 27], [1, 2]] },
    ita: { start: [8, 22], end: [5, 23] },
    ita2: { start: [8, 22], end: [5, 9], brk: [[12, 30], [1, 9]] },
    ger: { start: [8, 22], end: [5, 15], brk: [[12, 23], [1, 9]] },
    ger2: { start: [8, 1], end: [5, 15], brk: [[12, 23], [1, 16]] },
    fra: { start: [8, 15], end: [5, 15], brk: [[12, 20], [1, 2]] },
    fra2: { start: [8, 8], end: [5, 8], brk: [[12, 20], [1, 2]] },
    ukr: { start: [8, 1], end: [5, 30], brk: [[12, 13], [2, 20]] },
    ukr2: { start: [8, 1], end: [5, 30], brk: [[12, 6], [3, 6]] },
    por: { start: [8, 8], end: [5, 16], boxing: true },
    ned: { start: [8, 8], end: [5, 16], brk: [[12, 20], [1, 9]] },
    tur: { start: [8, 8], end: [5, 23], brk: [[12, 27], [1, 16]] },
    pol: { start: [7, 18], end: [5, 23], brk: [[12, 13], [1, 30]] },
    bel: { start: [7, 25], end: [5, 16], brk: [[12, 27], [1, 9]] },
    sco: { start: [8, 1], end: [5, 16], brk: [[1, 3], [1, 16]], boxing: true },
    gre: { start: [8, 22], end: [5, 16], brk: [[12, 27], [1, 2]] },
    cze: { start: [7, 18], end: [5, 23], brk: [[12, 13], [2, 6]] },
    den: { start: [7, 18], end: [5, 23], brk: [[12, 6], [2, 13]] },
    aut: { start: [7, 25], end: [5, 23], brk: [[12, 13], [2, 6]] },
    sui: { start: [7, 18], end: [5, 23], brk: [[12, 20], [1, 23]] },
  };
  const DEFAULT = { start: [8, 8], end: [5, 23], brk: [[12, 20], [1, 9]] };

  // Єврокубки: 8 турів етапу ліги (вівторок/середа), плей-оф — двоматчеві пари, фінал наприкінці травня.
  const EURO_LEAGUE = [[9, 16], [9, 30], [10, 21], [11, 4], [11, 25], [12, 9], [1, 20], [1, 27]];
  const EURO_KO = [[[2, 17], [2, 24]], [[3, 10], [3, 17]], [[4, 7], [4, 14]], [[4, 28], [5, 5]], [[5, 29]]];
  // Кубки країн: раунди від серпня до фіналу в середині травня (беремо останні — скільки раундів у кубку).
  const DOMESTIC = [[8, 26], [9, 23], [10, 28], [12, 2], [2, 10], [4, 22], [5, 16]];

  /**
   * Календар сезону, що стартує влітку року Y. rounds — { ліга: кількість турів }.
   * Повертає { start, total, intl, windows, euroLeague, euroKO, domestic, leagues, plan: { ліга: [{ w, mid }] } }.
   */
  function build(Y, rounds) {
    const start = seasonStart(Y);
    const W = (md) => weekOf(start, Y, md);
    const intl = [satFrom(Y, 9, 3), satFrom(Y, 10, 8), satFrom(Y, 11, 12), satFrom(Y, 3, 22)].map(W);
    const windows = [[0, W([9, 1])], [W([1, 2]), W([2, 2])]];
    const euroLeague = EURO_LEAGUE.map(W);
    const euroKO = EURO_KO.map((pair) => pair.map(W));
    const euroWeeks = new Set([...euroLeague, ...euroKO.flat()]);
    const leagues = {}, plan = {}, domestic = {};
    for (const id of Object.keys(rounds)) {
      const cfg = LEAGUES[id] || DEFAULT;
      const s = W(cfg.start), e = W(cfg.end);
      const brk = cfg.brk ? [W(cfg.brk[0]), W(cfg.brk[1])] : null;
      const inBreak = (w) => !!brk && w >= brk[0] && w <= brk[1];
      const slots = [];
      for (let w = s; w <= e; w++) if (!intl.includes(w) && !inBreak(w)) slots.push(w);
      // кубок країни: раунд, що випав на перерву чи вікно збірних, — на перший вільний тиждень після
      let prev = -1;
      const dom = DOMESTIC.map((md) => { let w = Math.max(W(md), prev + 1); while (inBreak(w) || intl.includes(w)) w++; prev = w; return w; });
      domestic[id] = dom;
      const n = rounds[id], L = slots.length;
      let moments;
      if (L >= n) moments = Array.from({ length: n }, (_, i) => ({ w: slots[n > 1 ? Math.round((i * (L - 1)) / (n - 1)) : 0], mid: 0 }));
      else {
        // вихідних не вистачає — тури посеред тижня (вівторок), не в тижні єврокубків і кубка; боксінг-дей — першим
        const busy = new Set([...euroWeeks, ...dom]);
        const need = n - L;
        const cands = slots.filter((w) => !busy.has(w));
        const picks = [];
        if (cfg.boxing) for (const md of [[12, 26], [12, 30]]) { const w = W(md); if (slots.includes(w) && !picks.includes(w) && picks.length < need) picks.push(w); }
        const rest = cands.filter((w) => !picks.includes(w));
        const left = need - picks.length;
        if (left >= rest.length) picks.push(...rest);
        else for (let i = 0; i < left; i++) picks.push(rest[Math.floor(((i + 0.5) * rest.length) / left)]);
        for (const w of slots) if (picks.length < need && !picks.includes(w)) picks.push(w); // і тижні з кубками, якщо інакше ніяк
        moments = slots.map((w) => ({ w, mid: 0 })).concat(picks.map((w) => ({ w, mid: 1 })))
          .sort((a, b) => a.w - b.w || b.mid - a.mid);
        while (moments.length < n) moments.push({ w: moments[moments.length - 1].w, mid: 1 }); // крайній випадок
      }
      plan[id] = moments.slice(0, n);
      leagues[id] = { start: s, end: plan[id][plan[id].length - 1].w, brk };
    }
    const last = Math.max(...Object.values(plan).map((m) => m[m.length - 1].w), ...euroKO.flat(), ...Object.values(domestic).map((d) => d[d.length - 1]));
    return { v: 1, start, total: last + 1, intl, windows, euroLeague, euroKO, domestic, leagues, plan };
  }

  /** Коефіцієнт «тиждень у сезоні»: стара гра мала 38 тижнів — гроші й розвиток за тиждень нормуємо до них. */
  const weekK = (S) => (S && S.cal ? 38 / S.cal.total : 1);
  /** День тижня матчу: 2 — вівторок (тур посеред тижня), 3 — середа (кубки, Ліга чемпіонів), 4 — четвер (ЛЄ, ЛК), 6 — субота. */
  const cupDay = (cupId) => (cupId === 'uel' || cupId === 'uecl' ? 4 : 3);
  /** Що за тиждень: передсезоння, перерва в лізі, вікно збірних. */
  function weekKind(S, leagueId, w) {
    const c = S && S.cal;
    if (!c) return null;
    if (c.intl.includes(w)) return 'intl';
    const l = c.leagues[leagueId];
    if (!l) return null;
    if (w < l.start) return 'preseason';
    if (w > l.end) return 'after';
    if (l.brk && w >= l.brk[0] && w <= l.brk[1]) return 'break';
    return null;
  }

  /**
   * Тиждень реального календаря, що відповідає «старому» тижню (38 тижнів від середини серпня):
   * правила гри, записані в старих тижнях (наприклад, «після 20-го тижня»), лягають на ту саму дату.
   */
  function at(S, oldWeek) {
    if (!S || !S.cal) return oldWeek;
    const d = new Date(Date.parse(FM.season ? FM.season.firstSaturday(S.year) + 'T12:00:00Z' : `${S.year}-08-09T12:00:00Z`) + oldWeek * 7 * DAY);
    return weekOf(S.cal.start, S.year, [d.getUTCMonth() + 1, d.getUTCDate()]);
  }

  FM.cal = { at, LEAGUES, seasonStart, weekOf, build, weekK, cupDay, weekKind };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
