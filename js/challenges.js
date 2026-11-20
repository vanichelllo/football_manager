// Розширення 17: режим «Виклик» — сценарії з ціллю й терміном.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const TOP5 = ['eng', 'esp', 'ita', 'ger', 'fra'];
  const DEFS = {
    rescue: {
      label: 'Порятунок', desc: 'Найслабший клуб топ-ліги. Ціль — зберегти місце в лізі в першому ж сезоні.', seasons: 1,
      clubs: (W) => TOP5.map((l) => W.clubsOf(l).sort((a, b) => W.clubLevel(a.id) - W.clubLevel(b.id))[0]).filter(Boolean),
      check: (W, st, info) => (info.relegated ? 'failed' : 'done'),
    },
    rise: {
      label: 'Від низів до Ліги чемпіонів', desc: 'Клуб другого дивізіону. Ціль — за 5 сезонів вийти до вищої ліги й потрапити в зону Ліги чемпіонів.', seasons: 5,
      clubs: (W) => W.db.leagues.filter((l) => l.tier === 2).map((l) => W.clubsOf(l.id).sort((a, b) => W.clubLevel(a.id) - W.clubLevel(b.id))[Math.floor(W.clubsOf(l.id).length * 0.4)]).filter(Boolean),
      check: (W, st, info) => (!info.tier2 && info.pos <= ((FM.season.ZONES[info.league] || {}).ucl || 0) ? 'done' : null),
    },
    academy: {
      label: 'Лише свої', desc: 'Будь-який клуб. Три сезони без купівлі гравців (вільні агенти й оренди — теж ні). Ціль — виграти кубок країни.', seasons: 3, noBuy: true,
      clubs: (W) => null, // будь-який
      check: (W, st, info) => (info.cupWon ? 'done' : null),
    },
  };
  function start(state, id) {
    const d = DEFS[id];
    state.challenge = { id, from: state.season.year, until: state.season.year + d.seasons - 1, status: 'ongoing' };
    return state.challenge;
  }
  /** Чи заборонені купівлі (режим «Лише свої»). */
  const noBuy = (state) => !!(state.challenge && state.challenge.status === 'ongoing' && DEFS[state.challenge.id].noBuy);
  /** Підсумок сезону: виконано / провалено / триває. Повертає текст для новин або null. */
  function endSeason(W, state, info) {
    const c = state.challenge;
    if (!c || c.status !== 'ongoing') return null;
    const d = DEFS[c.id];
    let r = d.check(W, state, info);
    if (!r && state.season.year >= c.until) r = 'failed';
    if (!r) return `Виклик «${d.label}»: триває, залишилося сезонів — ${c.until - state.season.year}.`;
    c.status = r; c.done = state.season.year;
    if (r === 'done') { state.ach = state.ach || {}; state.ach['challenge_' + c.id] = `${state.season.year}/${String(state.season.year + 1).slice(2)}`; }
    return r === 'done' ? `ВИКЛИК ВИКОНАНО: «${d.label}»! ${d.desc.split('.').slice(-2, -1)[0] || ''}`.trim() : `Виклик «${d.label}» провалено. Можна почати новий у слоті збереження.`;
  }
  FM.challenges = { DEFS, start, noBuy, endSeason };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
