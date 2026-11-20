// Фінанси клубів і правління: доходи (телеправа, спонсори, квитки, призові), витрати (зарплати),
// фонд зарплат, очікування на сезон, довіра, звільнення, репутація тренера, пропозиції роботи.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;
  const r4 = (x) => Math.round(x * 10000) / 10000; // малі клуби: тижневі суми — тисячі євро

  /** Базовий тижневий дохід клубу (млн €): зарплати на старті × 1,12 — клуб трохи в плюсі, якщо не роздувати витрати. */
  function initClubs(W) {
    for (const c of W.clubs.values()) {
      if (c.income0 != null) continue;
      const bill = FM.market.wageBill(W, c.id);
      c.income0 = r4(Math.max(0.005, (bill * 1.12) / 1000));
      c.wageBudget = Math.round(bill * 1.06);
    }
  }

  const TARGETS = {
    title: { label: 'Виграти чемпіонат' },
    ucl: { label: 'Потрапити в Лігу чемпіонів' },
    europe: { label: 'Потрапити в єврокубки' },
    tophalf: { label: 'Фінішувати у верхній половині' },
    survive: { label: 'Зберегти місце в лізі' },
    promotion: { label: 'Вийти до вищої ліги' },
    midtable: { label: 'Не опинитися внизу таблиці' },
  };

  /** Ціль на сезон за силою складу: { kind, pos } — pos — найгірше місце, з яким ціль виконано. */
  function target(W, clubId) {
    const c = W.club(clubId);
    const ranked = W.clubsOf(c.league).map((x) => ({ id: x.id, lvl: W.clubLevel(x.id) })).sort((a, b) => b.lvl - a.lvl);
    const r = ranked.findIndex((x) => x.id === clubId) + 1;
    const n = ranked.length;
    const Z = FM.season.ZONES[c.league] || {};
    if (Z.promo) { // другий дивізіон: підвищення
      if (r <= Z.promo + 1) return { kind: 'promotion', pos: Z.promo, rank: r };
      if (r <= Math.ceil(n / 2) + 1) return { kind: 'tophalf', pos: Math.ceil(n / 2), rank: r };
      return { kind: 'midtable', pos: n - 3, rank: r };
    }
    const z = [Z.ucl || 1, Z.uel || 3, Z.rel || 3];
    if (r === 1) return { kind: 'title', pos: 1, rank: r };
    if (r <= z[0]) return { kind: 'ucl', pos: z[0], rank: r };
    if (r <= z[1] + 1) return { kind: 'europe', pos: z[1], rank: r };
    if (r <= Math.ceil(n / 2) + 1) return { kind: 'tophalf', pos: Math.ceil(n / 2), rank: r };
    return { kind: 'survive', pos: n - (z[2] || 3), rank: r };
  }

  function initSeason(W, state) {
    initClubs(W);
    const b = (state.board = state.board || { conf: 60, rep: null, seasons: 0 });
    if (b.rep == null) b.rep = Math.round(Math.min(80, Math.max(20, (W.clubLevel(state.clubId) - 60))));
    b.target = target(W, state.clubId);
    b.fin = { tv: 0, tickets: 0, prize: 0, wages: 0, transfers: 0 };
    b.balance0 = W.club(state.clubId).balance;
    b.fired = false;
  }

  /** Місце клубу в таблиці. */
  function position(W, S, clubId) {
    const t = FM.season.table(S, W, W.club(clubId).league);
    return { pos: t.findIndex((r) => r.id === clubId) + 1, row: t.find((r) => r.id === clubId), n: t.length, table: t };
  }

  /**
   * Тиждень: фінанси всіх клубів, довіра правління до людини. Викликати після закриття туру (S.week уже +1).
   * Повертає { fired } — якщо правління звільнило тренера.
   */
  function weekly(W, state) {
    const S = state.season;
    const w = S.week - 1;
    const fx = FM.season.fixturesOfWeek(S, w);
    const home = new Set(fx.map((f) => f.h));
    const posCache = {};
    const b = state.board;
    for (const c of W.clubs.values()) {
      const t = posCache[c.league] || (posCache[c.league] = FM.season.table(S, W, c.league));
      const pos = t.findIndex((r) => r.id === c.id) + 1;
      const rel = t.length > 1 ? 1 - (pos - 1) / (t.length - 1) : 0.5; // 1 — лідер
      const fixed = c.income0 * 0.7;
      const tickets = home.has(c.id) ? c.income0 * 0.6 * (0.8 + 0.35 * rel) * (FM.club ? FM.club.ticketFactor(W, c.id, rel) : 1) : 0; // удома — подвійна частка матчдею
      const wages = FM.market.wageBill(W, c.id) / 1000 + (c.id === state.clubId && FM.club ? FM.club.staffBill(state) / 1000 : 0);
      c.balance = r4(c.balance + fixed + tickets - wages);
      if (c.id === state.clubId) {
        b.fin.tv = r4(b.fin.tv + fixed); b.fin.tickets = r4(b.fin.tickets + tickets); b.fin.wages = r4(b.fin.wages + wages);
      }
    }
    // бонуси за голи (пункт контракту)
    for (const f of fx) for (const [, pid] of f.sc || []) {
      const p = W.player(pid);
      if (p && p.goalBonus && p.club) W.club(p.club).balance = r2(W.club(p.club).balance - p.goalBonus / 1000);
    }
    // довіра
    const mine = fx.find((f) => f.h === state.clubId || f.a === state.clubId);
    if (mine && mine.s) {
      const [g1, g2] = mine.h === state.clubId ? mine.s : [mine.s[1], mine.s[0]];
      const opp = mine.h === state.clubId ? mine.a : mine.h;
      const diff = W.clubLevel(opp) - W.clubLevel(state.clubId); // > 0 — суперник сильніший
      const res = g1 > g2 ? 2.2 + Math.max(0, diff) * 0.05 : g1 === g2 ? 0.3 + diff * 0.04 : -2.2 + Math.max(0, diff) * 0.06;
      b.conf += res;
    }
    const { pos } = position(W, S, state.clubId);
    if (S.week >= 6 && mine) b.conf += Math.max(-1.6, Math.min(1.2, (b.target.pos - pos) * 0.25));
    if (W.club(state.clubId).balance < 0) b.conf -= 1;
    b.conf = Math.max(0, Math.min(100, Math.round(b.conf * 10) / 10));
    if (S.week >= 10 && b.conf < 15 && !b.fired) { b.fired = true; return { fired: true, reason: 'Правління втратило довіру через погані результати.' }; }
    return { fired: false };
  }

  /** Кінець сезону: призові, оцінка правління, репутація. Повертає { fired, verdict, prize }. */
  function endSeason(W, state) {
    const S = state.season, b = state.board;
    // призові всім клубам
    for (const l of W.db.leagues) {
      const t = FM.season.table(S, W, l.id);
      t.forEach((row, i) => {
        const c = W.club(row.id);
        const prize = r4(c.income0 * 52 * 0.15 * (1 - i / (t.length - 1)));
        c.balance = r4(c.balance + prize);
        if (c.id === state.clubId) b.fin.prize = prize;
      });
    }
    const { pos } = position(W, S, state.clubId);
    const T = b.target.pos;
    let verdict, fired = false;
    if (pos <= T - 2 || (pos === 1 && T === 1)) { verdict = 'Блискуче: ціль перевиконано.'; b.conf = Math.min(100, b.conf + 20); b.rep = Math.min(100, b.rep + 8); }
    else if (pos <= T) { verdict = 'Ціль виконано.'; b.conf = Math.min(100, b.conf + 10); b.rep = Math.min(100, b.rep + 4); }
    else if (pos <= T + 2) { verdict = 'Ціль не виконано, але правління дає ще шанс.'; b.conf = Math.max(0, b.conf - 15); b.rep = Math.max(0, b.rep - 2); }
    else { verdict = 'Ціль провалено.'; b.conf -= 30; b.rep = Math.max(0, b.rep - 6); }
    if (pos === 1) b.rep = Math.min(100, b.rep + 6);
    if (b.conf < 20) { fired = true; verdict += ' Правління вирішило звільнити тренера.'; }
    b.conf = Math.max(0, Math.min(100, b.conf));
    b.seasons++;
    b.last = { pos, target: T, verdict };
    return { fired, verdict, prize: b.fin.prize, pos };
  }

  /** Пропозиції роботи: клуби, рівень яких відповідає репутації тренера. */
  function jobOffers(W, state, n = 3, seed = '') {
    const R = FM.rng(`jobs-${state.season.seed}-${state.season.week}-${seed}`);
    const rep = state.board ? state.board.rep : 40;
    const maxLvl = Math.min(60 + rep * 1.05, FM.career && state.coach ? FM.career.maxLevel(state) : 999); // репутація 50 → клуби до ~112, 90 → до ~155; не вище ліцензії
    const cands = [...W.clubs.values()].filter((c) => c.id !== state.clubId && W.clubLevel(c.id) <= maxLvl && W.clubLevel(c.id) >= maxLvl - 45);
    const out = [];
    while (out.length < n && cands.length) out.push(cands.splice(R.int(cands.length), 1)[0].id);
    return out.sort((a, b) => W.clubLevel(b) - W.clubLevel(a));
  }

  /** Очолити інший клуб. */
  function takeJob(W, state, clubId) {
    if (FM.career) FM.career.onJob(W, state, clubId);
    state.clubId = clubId;
    state.tactics = null;
    if (state.training) state.training.individual = {};
    state.offers = [];
    const conf = 55;
    initSeason(W, state);
    state.board.conf = conf;
    FM.market.news(state, `Ви очолили ${W.club(clubId).name}. Ціль правління: ${TARGETS[state.board.target.kind].label.toLowerCase()}.`);
  }

  FM.board = { initClubs, initSeason, target, position, weekly, endSeason, jobOffers, takeJob, TARGETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
