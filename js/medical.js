// Медичний центр (як у FM): ризик травми кожного гравця на тиждень, чинники ризику, поради, відпочинок.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  /** Схильність до травм: та сама формула, що в двигуні матчу й тренуваннях (h.inj 1–20, середнє ~8). */
  const prone = (p) => 0.6 + ((p.h && p.h.inj) || 8) / 20;
  /** Втома: втомлені травмуються частіше. */
  const tiredK = (p) => ((p.fitness ?? 100) < 70 ? 1.8 : (p.fitness ?? 100) < 85 ? 1.3 : 1);

  /**
   * Ризик травми на тиждень (0–1) і чинники. ctx — { planInjury (розклад тижня), injuryMult (фізіо й фітнес-тренер),
   * matches (скільки матчів цього тижня), k (нормування календаря), rested (Set) }.
   */
  function risk(W, p, ctx = {}) {
    if (p.injury) return { r: 1, level: 'out', why: [`травма: ще ${p.injury} тиж.`] };
    const rested = ctx.rested && ctx.rested.has(p.id);
    const train = 0.006 * (ctx.k ?? 1) * (ctx.planInjury ?? 1) * (ctx.injuryMult ?? 1) * (rested ? 0.3 : 1);
    const match = rested || (p.roles[0] === 'GK') ? 0 : (ctx.matches ?? 1) * 0.022 * ((ctx.starter && !ctx.starter.has(p.id)) ? 0.3 : 1);
    const age = W.age(p) ?? 25;
    const ageK = age >= 32 ? 1.25 : age >= 29 ? 1.1 : 1;
    const r = Math.min(0.5, (train + match) * prone(p) * tiredK(p) * ageK);
    const why = [];
    if (prone(p) >= 1.2) why.push('схильний до травм');
    if (tiredK(p) > 1) why.push(`втома (${Math.round(p.fitness)}%)`);
    if (ageK > 1) why.push(`вік ${age}`);
    if ((ctx.matches ?? 1) >= 2 && match) why.push('два матчі за тиждень');
    if ((ctx.planInjury ?? 1) > 1.1 && !rested) why.push('важкий тиждень тренувань');
    if (rested) why.push('відпочиває');
    return { r, level: r >= 0.07 ? 'high' : r >= 0.04 ? 'mid' : 'low', why };
  }
  const LEVEL_UK = { low: 'низький', mid: 'помірний', high: 'високий', out: 'травмований' };

  /** Порада лікаря для гравця з високим ризиком. */
  function advice(p, rk) {
    if (rk.level === 'out') return null;
    if (rk.level !== 'high') return null;
    if ((p.fitness ?? 100) < 75) return 'Дати відпочити тиждень';
    return 'Не ставити в основу в обох матчах тижня';
  }

  /** Відпочинок гравця цього тижня: не грає, тренується легко, наприкінці тижня — повністю свіжий. */
  function rest(state, pid) {
    const key = `${state.season.year}-${state.season.week}`;
    state.rest = state.rest && state.rest.key === key ? state.rest : { key, ids: [] };
    if (state.rest.ids.includes(pid)) state.rest.ids = state.rest.ids.filter((x) => x !== pid);
    else state.rest.ids.push(pid);
    return state.rest.ids.includes(pid);
  }
  const rested = (state) => new Set(state.rest && state.rest.key === `${state.season.year}-${state.season.week}` ? state.rest.ids : []);
  /** Кінець тижня: ті, хто відпочивав, — свіжі. */
  function restWeek(W, state, prevKey) {
    if (!state.rest || state.rest.key !== prevKey) return [];
    const back = [];
    for (const id of state.rest.ids) { const p = W.player(id); if (p) { delete p.fitness; back.push(p); } }
    state.rest = null;
    return back;
  }

  FM.medical = { prone, risk, LEVEL_UK, advice, rest, rested, restWeek };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
