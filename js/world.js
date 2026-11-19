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

  const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

  /**
   * Світ кар'єри: змінні копії клубів і гравців бази.
   * saved — результат w.export() (відмінності від реальної бази), щоб продовжити кар'єру.
   */
  function createWorld(db, saved) {
    const baseP = new Map(db.players.map((p) => [p.id, p]));
    const baseC = new Map(db.clubs.map((c) => [c.id, c]));
    const players = new Map(clone(db.players).map((p) => [p.id, p]));
    const clubs = new Map(clone(db.clubs).map((c) => [c.id, c]));
    const leagues = new Map(db.leagues.map((l) => [l.id, l]));
    let today = db.seasonStart;
    let seq = db.players.length; // id для нових гравців (юнаки)

    if (saved) {
      today = saved.today || today;
      seq = saved.seq || seq;
      for (const [id, patch] of Object.entries(saved.p || {})) if (players.has(id)) Object.assign(players.get(id), patch);
      for (const p of saved.np || []) players.set(p.id, p);
      for (const [id, patch] of Object.entries(saved.c || {})) if (clubs.has(id)) Object.assign(clubs.get(id), patch);
    }

    /** Склад кожного клубу — з поля club гравців (гравець без клубу — вільний агент або завершив кар'єру). */
    function reindex() {
      for (const c of clubs.values()) c.players = [];
      for (const p of players.values()) if (p.club && clubs.has(p.club)) clubs.get(p.club).players.push(p.id);
    }
    reindex();

    const w = {
      db, clubs, players, leagues,
      get today() { return today; },
      set today(v) { today = v; },
      league: (id) => leagues.get(id),
      club: (id) => clubs.get(id),
      player: (id) => players.get(id),
      base: (id) => baseP.get(id) || null,
      reindex,
      clubsOf(leagueId) {
        return [...clubs.values()].filter((c) => c.league === leagueId).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
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
      /** Перевести гравця в інший клуб (null — вільний агент / завершив кар'єру). */
      move(pid, clubId) {
        const p = players.get(pid);
        if (p.club && clubs.has(p.club)) { const l = clubs.get(p.club).players; const i = l.indexOf(pid); if (i >= 0) l.splice(i, 1); }
        p.club = clubId;
        if (clubId) clubs.get(clubId).players.push(pid);
      },
      /** Додати нового гравця (юнака). Повертає його. */
      addPlayer(p) {
        p.id = 'n' + seq++;
        p.generated = true;
        players.set(p.id, p);
        if (p.club) clubs.get(p.club).players.push(p.id);
        return p;
      },
      /** Повернути гравцеві реальні дані з бази (скасувати редагування). */
      resetPlayer(id, fields) {
        const b = baseP.get(id), p = players.get(id);
        if (!b) return;
        for (const k of fields || Object.keys(b)) if (k !== 'club') p[k] = clone(b[k]);
      },
      resetClub(id, fields) {
        const b = baseC.get(id), c = clubs.get(id);
        for (const k of fields || Object.keys(b)) if (k !== 'players') c[k] = clone(b[k]);
      },
      /** Відмінності від реальної бази — для збереження. */
      export() {
        const out = { v: 1, today, seq, p: {}, np: [], c: {} };
        for (const p of players.values()) {
          const b = baseP.get(p.id);
          if (!b) { out.np.push(p); continue; }
          const patch = {};
          for (const k of new Set([...Object.keys(p), ...Object.keys(b)])) {
            if (k === 'id') continue;
            if (JSON.stringify(p[k]) !== JSON.stringify(b[k])) patch[k] = p[k] === undefined ? null : p[k];
          }
          if (Object.keys(patch).length) out.p[p.id] = patch;
        }
        for (const c of clubs.values()) {
          const b = baseC.get(c.id), patch = {};
          for (const k of Object.keys(c)) if (k !== 'players' && JSON.stringify(c[k]) !== JSON.stringify(b[k])) patch[k] = c[k];
          if (Object.keys(patch).length) out.c[c.id] = patch;
        }
        return out;
      },
    };
    w.calibrate = () => calibrateCA(w);
    calibrateCA(w);
    return w;
  }

  // ---------------- Рівень з атрибутів і ціна ----------------
  // Ваги атрибутів для ролей (ті самі, що в двигуні матчу): з них рахується CA після редагування чи розвитку.
  const ROLE_W = {
    GK: { ref: 0.3, han: 0.2, one: 0.2, aer: 0.15, pos: 0.1, dec: 0.05 },
    CB: { tac: 0.25, pos: 0.25, hea: 0.2, str: 0.15, pac: 0.1, dec: 0.05 },
    FB: { tac: 0.2, pac: 0.2, pos: 0.15, cro: 0.15, sta: 0.15, wor: 0.1, dri: 0.05 },
    DM: { tac: 0.25, pos: 0.2, pas: 0.2, dec: 0.15, wor: 0.1, sta: 0.1 },
    CM: { pas: 0.3, dec: 0.2, wor: 0.15, sta: 0.15, tac: 0.1, dri: 0.1 },
    AM: { pas: 0.25, dri: 0.25, dec: 0.15, otb: 0.15, fin: 0.2 },
    W: { dri: 0.25, pac: 0.25, cro: 0.2, otb: 0.1, fin: 0.1, dec: 0.1 },
    ST: { fin: 0.35, otb: 0.2, pac: 0.15, hea: 0.1, str: 0.1, dri: 0.1 },
  };
  const roleScore = (p, role) => {
    let s = 0;
    for (const [a, wt] of Object.entries(ROLE_W[role])) s += (p.attrs[a] ?? 5) * wt;
    return s;
  };
  let CA_FIT = null; // { role: [a, b] } — CA ≈ a + b × рейтинг ролі (найменші квадрати по реальній базі)
  function calibrateCA(w) {
    if (CA_FIT) return;
    const acc = {};
    for (const p of w.db.players) {
      const r = p.roles[0];
      const x = roleScore(p, r), y = p.ca;
      const a = (acc[r] = acc[r] || { n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 });
      a.n++; a.sx += x; a.sy += y; a.sxx += x * x; a.sxy += x * y;
    }
    CA_FIT = {};
    for (const [r, a] of Object.entries(acc)) {
      const b = (a.n * a.sxy - a.sx * a.sy) / (a.n * a.sxx - a.sx * a.sx);
      CA_FIT[r] = [(a.sy - b * a.sx) / a.n, b];
    }
  }
  /** Поточний рівень (CA, 1–200) з атрибутів гравця на його основній позиції. */
  function caFromAttrs(p) {
    const [a, b] = CA_FIT[p.roles[0]] || [0, 10];
    return Math.max(1, Math.min(200, Math.round(a + b * roleScore(p, p.roles[0]))));
  }

  const LEAGUE_MULT = { eng: 1.6, esp: 1.3, ita: 1.15, ger: 1.2, fra: 1.1, ukr: 0.9 };
  /** Орієнтовна ринкова ціна, млн € (та сама формула, що й у збирачі бази). */
  function marketValue(ca, age, league, pa = ca) {
    if (age < 24) ca = ca + (pa - ca) * 0.5 * (24 - age) / 6;
    const ageMult = age <= 23 ? 1.35 : age <= 27 ? 1.15 : age <= 29 ? 0.9 : age <= 31 ? 0.6 : age <= 33 ? 0.35 : 0.15;
    const v = 0.22 * Math.exp((ca - 80) / 16) * (LEAGUE_MULT[league] || 1) * ageMult;
    return Math.round(Math.max(0.05, Math.min(200, v)) * 20) / 20;
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

  Object.assign(FM, { createWorld, roleLabel, positions, stars, caFromAttrs, marketValue, ROLE_NAME, ROLE_LINE, ATTRS, ATTR_GROUPS, ROLE_ORDER });
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
