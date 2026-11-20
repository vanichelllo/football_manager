// Гра на двох на одному телефоні: двоє тренерів у різних клубах одного світу ходять по черзі.
// Спільне (світ, сезон, кубки, день тижня) лежить у state; усе, що належить тренерові (клуб, правління, тактика,
// пошта, бюджет…), — у state поточного тренера, а другого — у state.duo.other. swap() міняє їх місцями.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  // ключі, спільні для обох тренерів
  const SHARED = new Set(['version', 'season', 'cups', 'names', 'started', 'stableIds', 'world', 'day', 'duo', 'exPlayers', 'lastBackup', 'backupLater', 'intl']);
  const D = {
    SHARED,
    second: false, // зараз іде прохід тижня за другого тренера (лише його власні справи)
    on: (state) => !!(state && state.duo && state.duo.other && state.duo.other.clubId),
    otherClub: (state) => (D.on(state) ? state.duo.other.clubId : null),
    /** Чи це клуб людини (будь-якого з двох тренерів). */
    human: (state, id) => id === state.clubId || id === D.otherClub(state),
    /**
     * Пропустити клуб у загальному циклі по всіх клубах: у звичайному проході — клуб другого тренера
     * (його порахують окремо, як «свій»), у проході за другого тренера — усі, крім його клубу.
     */
    skip(state, id) {
      if (!D.on(state)) return false;
      return D.second ? id !== state.clubId : id === D.otherClub(state);
    },
    /** Поміняти тренерів місцями. */
    swap(state) {
      const d = state.duo, mine = {};
      for (const k of Object.keys(state)) if (!SHARED.has(k)) { mine[k] = state[k]; delete state[k]; }
      Object.assign(state, d.other);
      d.other = mine;
      d.turn = d.turn ? 0 : 1;
      return state;
    },
    /** Виконати fn за другого тренера (і повернути все як було). */
    as(state, fn) {
      D.swap(state);
      try { return fn(); } finally { D.swap(state); }
    },
  };
  FM.duo = D;
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
