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
    zero: {
      label: 'Невідомий тренер', desc: 'Ви — нікому не відомий тренер з ліцензією C. Великі клуби навіть не відповідають: на резюме відгукнулися лише кілька найслабших. Ціль — за 10 сезонів стати чемпіоном однієї з топ-5 ліг.', seasons: 10,
      clubs: (W) => {
        // найслабші клуби кожної ліги: по одному з нижніх дивізіонів і найслабших чемпіонатів
        const all = [...W.clubs.values()].map((c) => ({ c, l: W.clubLevel(c.id) })).sort((a, b) => a.l - b.l);
        const seen = new Set(), out = [];
        for (const { c } of all) { if (seen.has(c.league)) continue; seen.add(c.league); out.push(c); if (out.length >= 8) break; }
        return out;
      },
      setup: (W, state) => {
        if (state.board) { state.board.rep = 8; state.board.conf = 55; }
        if (state.coach) { state.coach.licence = 'C'; for (const k of Object.keys(state.coach.attrs)) state.coach.attrs[k] = Math.min(state.coach.attrs[k], k === 'mot' ? 8 : 7); }
      },
      check: (W, st, info) => (info.champion && TOP5.includes(info.league) ? 'done' : null),
    },
    academy: {
      label: 'Лише свої', desc: 'Будь-який клуб. Три сезони без купівлі гравців (вільні агенти й оренди — теж ні). Ціль — виграти кубок країни.', seasons: 3, noBuy: true,
      clubs: (W) => null, // будь-який
      check: (W, st, info) => (info.cupWon ? 'done' : null),
    },
  };
  function start(state, id, W) {
    const d = DEFS[id];
    state.challenge = { id, from: state.season.year, until: state.season.year + d.seasons - 1, status: 'ongoing' };
    if (d.setup && W) d.setup(W, state);
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
