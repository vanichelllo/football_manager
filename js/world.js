// Світ гри поверх бази FM_DB: пошук клубів і гравців, вік, позиції, «зірки» рівня.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const ROLE_LABEL = { GK: 'ВР', CB: 'ЦЗ', DM: 'ОП', CM: 'ЦП', AM: 'АП', ST: 'НП' };
  const ROLE_NAME = {
    GK: 'Воротар', CB: 'Центральний захисник', FB: 'Крайній захисник', DM: 'Опорний півзахисник',
    CM: 'Центральний півзахисник', AM: 'Атакувальний півзахисник', W: 'Вінгер', ST: 'Нападник',
  };
  const ROLE_ORDER = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
  const ROLE_LINE = { GK: 'gk', CB: 'def', FB: 'def', DM: 'mid', CM: 'mid', AM: 'mid', W: 'att', ST: 'att' };

  const ATTRS = {
    fin: 'Удар', pas: 'Пас', dri: 'Дриблінг', cro: 'Подачі', tac: 'Відбір', hea: 'Гра головою',
    dec: 'Рішення', pos: 'Позиціонування', otb: 'Відкривання', wor: 'Працездатність',
    pac: 'Швидкість', sta: 'Витривалість', str: 'Сила',
    ref: 'Реакція', han: 'Гра руками', one: 'Один на один', aer: 'Гра на виході', kic: 'Гра ногами',
  };
  const ATTR_GROUPS = {
    outfield: [['Технічні', ['fin', 'pas', 'dri', 'cro', 'tac', 'hea']], ['Ментальні', ['dec', 'pos', 'otb', 'wor']], ['Фізичні', ['pac', 'sta', 'str']]],
    gk: [['Воротарські', ['ref', 'han', 'one', 'aer', 'kic']], ['Ментальні', ['dec', 'pos']], ['Фізичні', ['pac', 'sta', 'str']]],
  };

  function createWorld(db) {
    const clubs = new Map(db.clubs.map((c) => [c.id, c]));
    const players = new Map(db.players.map((p) => [p.id, p]));
    const leagues = new Map(db.leagues.map((l) => [l.id, l]));
    const today = db.seasonStart;

    const w = {
      db, clubs, players, leagues, today,
      league: (id) => leagues.get(id),
      club: (id) => clubs.get(id),
      player: (id) => players.get(id),
      clubsOf(leagueId) {
        return db.clubs.filter((c) => c.league === leagueId).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
      },
      squad(clubId) {
        return clubs.get(clubId).players.map((id) => players.get(id)).sort(w.bySquadOrder);
      },
      bySquadOrder(a, b) {
        return ROLE_ORDER.indexOf(a.roles[0]) - ROLE_ORDER.indexOf(b.roles[0]) || b.ca - a.ca;
      },
      age(p) {
        if (!p.born) return null;
        const b = new Date(p.born), d = new Date(today);
        let a = d.getFullYear() - b.getFullYear();
        if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
        return a;
      },
      /** Сила клубу — середній CA найкращих 16 гравців. */
      clubLevel(clubId) {
        const top = w.squad(clubId).map((p) => p.ca).sort((a, b) => b - a).slice(0, 16);
        return top.length ? top.reduce((s, x) => s + x, 0) / top.length : 0;
      },
    };
    return w;
  }

  /** Підпис позиції: ЛЗ/ПЗ, ЛВ/ПВ з урахуванням сторони. */
  function roleLabel(role, side) {
    if (role === 'FB') return side === 'L' ? 'ЛЗ' : side === 'R' ? 'ПЗ' : 'КЗ';
    if (role === 'W') return side === 'L' ? 'ЛВ' : side === 'R' ? 'ПВ' : 'В';
    return ROLE_LABEL[role] || role;
  }
  const positions = (p) => p.roles.map((r, i) => roleLabel(r, i === 0 ? p.side : null)).join(', ');

  /** CA/PA → зірки 0,5–5 (як у жанрі): 190+ — п'ять зірок. */
  const stars = (v) => Math.max(0.5, Math.min(5, Math.round(((v - 55) / 27) * 2) / 2));

  Object.assign(FM, { createWorld, roleLabel, positions, stars, ROLE_NAME, ROLE_LINE, ATTRS, ATTR_GROUPS });
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
