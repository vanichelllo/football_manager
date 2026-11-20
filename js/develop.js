// Розвиток гравців: тренування, ріст молоді, старіння, травми, завершення кар'єри, юнаки, кінець сезону.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  // Ваги атрибутів для ролей (як у двигуні матчу) — що росте першим
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

  // Тренування: на що зроблено наголос (множники для груп атрибутів) і інтенсивність
  const FOCUS = {
    balanced: { label: 'Збалансоване', w: {} },
    attack: { label: 'Атака', w: { fin: 2.2, otb: 2, dri: 1.6, cro: 1.4 } },
    defence: { label: 'Оборона', w: { tac: 2.2, pos: 2, hea: 1.6, str: 1.3 } },
    physical: { label: 'Фізика', w: { pac: 2, sta: 2.2, str: 2, wor: 1.4 } },
    technique: { label: 'Техніка й гра в пас', w: { pas: 2.2, dri: 1.8, dec: 1.8, cro: 1.3, kic: 1.5 } },
  };
  // План тижня: відновлення свіжості, ріст, знайомство з тактикою, ризик травм
  const PLANS = {
    balanced: { label: 'Збалансований', hint: 'Усього потроху.', recovery: 22, growth: 1, fam: 2, injury: 1 },
    prep: { label: 'Підготовка до матчу', hint: 'Відпрацювання тактики: команда швидше звикає до схеми.', recovery: 24, growth: 0.9, fam: 6, injury: 0.9 },
    recovery: { label: 'Відновлення', hint: 'Найкраще після кубка посеред тижня: свіжість відновлюється швидше.', recovery: 32, growth: 0.85, fam: 1, injury: 0.7 },
    development: { label: 'Розвиток', hint: 'Більше роботи над атрибутами, але гравці гірше відновлюються.', recovery: 14, growth: 1.15, fam: 1, injury: 1.25 },
  };
  const INTENSITY = {
    low: { label: 'Легке', growth: 0.85, injury: 0.6 },
    normal: { label: 'Звичайне', growth: 1, injury: 1 },
    high: { label: 'Інтенсивне', growth: 1.18, injury: 1.7 },
  };

  // Наскільки швидко гравець наближається до свого потенціалу (частка «розриву» за тиждень)
  function growthRate(age) {
    if (age <= 17) return 0.016;
    return { 18: 0.014, 19: 0.013, 20: 0.012, 21: 0.01, 22: 0.008, 23: 0.006, 24: 0.005, 25: 0.004, 26: 0.003, 27: 0.002 }[age] || 0;
  }

  /** Тривалість травми в тижнях: здебільшого коротка, зрідка — довга. */
  function injuryWeeks(R) {
    const x = R.next();
    if (x < 0.35) return 1;
    if (x < 0.6) return 2;
    if (x < 0.8) return 3 + R.int(2);
    if (x < 0.95) return 5 + R.int(4);
    return 9 + R.int(12);
  }

  function attrWeight(p, k, growth, focus, individual, age) {
    if (p.attrs[k] >= 20 && growth) return 0;
    if (p.attrs[k] <= 1 && !growth) return 0;
    let w = 1 + 3 * ((ROLE_W[p.roles[0]] || {})[k] || 0) * 3;
    if (growth) {
      if (focus && FOCUS[focus].w[k]) w *= FOCUS[focus].w[k];
      if (individual === k) w *= 4;
      if (age <= 20 && (k === 'str' || k === 'sta')) w *= 1.5;
    } else if (k === 'pac' || k === 'sta') w *= 3;
    else if (k === 'dec' || k === 'pos') w *= 0.3; // досвід з віком не втрачається
    return w;
  }

  /** Змінити один атрибут на ±1; рівень (CA) змінюється на стільки, на скільки це змінило гру на позиції. */
  function shiftAttr(p, R, growth, focus, individual, age) {
    const keys = Object.keys(p.attrs);
    const k = R.weighted(keys, (x) => attrWeight(p, x, growth, focus, individual, age));
    if (attrWeight(p, k, growth, focus, individual, age) === 0) return;
    const before = FM.caFromAttrs(p);
    p.attrs[k] += growth ? 1 : -1;
    p.ca = Math.max(1, Math.min(200, p.ca + FM.caFromAttrs(p) - before));
    if (growth && p.ca > p.pa) p.ca = p.pa;
  }

  /**
   * Тиждень розвитку для всіх гравців. opts: { training: { focus, intensity, individual: {id: атрибут} }, myClub, seed }
   * Повертає список травмованих на тренуваннях: [{ id, weeks }].
   */
  function weekly(W, S, opts = {}) {
    const R = FM.rng(`dev-${S.seed}-${S.week}`);
    const tr = opts.training || {};
    const games = {}; // скільки матчів зіграв клуб
    for (const f of S.fixtures) if (f.s) { games[f.h] = (games[f.h] || 0) + 1; games[f.a] = (games[f.a] || 0) + 1; }
    const hurt = [];
    const k = FM.cal ? FM.cal.weekK(S) : 1; // розвиток і травми на тренуваннях — за сезон стільки ж, скільки в старому календарі
    for (const p of W.players.values()) {
      if (p.retired) continue;
      const age = W.age(p) ?? 24;
      const mine = p.club && p.club === opts.myClub;
      const inten = INTENSITY[(mine && tr.intensity) || 'normal'];
      const plan = mine && opts.plan ? opts.plan : PLANS[(mine && tr.plan) || 'balanced']; // розклад по днях (js/routine.js) або план
      // травма на тренуванні
      if (p.club && !p.injury && R.chance(0.006 * k * inten.injury * plan.injury * (mine && opts.injuryMult ? opts.injuryMult : 1))) { p.injury = Math.min(4, injuryWeeks(R)); hurt.push({ id: p.id, weeks: p.injury }); }
      const clubGames = p.club ? games[p.club] || 0 : 0;
      const apps = (S.ps[p.id] && S.ps[p.id][0]) || 0;
      const share = p.loan && p.loan.aff ? Math.max(0.8, clubGames ? Math.min(1, apps / clubGames) : 0) : clubGames ? Math.min(1, apps / clubGames) : 0.4; // у фарм-клубі — гарантована практика
      let g = Math.max(0, p.pa - p.ca) * growthRate(age) * (0.55 + 0.9 * share) * inten.growth * plan.growth * (0.8 + ((p.h && p.h.pro) || 10) / 50) // професіоналізм
        * (mine && opts.growthMult ? opts.growthMult(p) : 1) * k; // тренери й база
      if (p.injury) g *= 0.3;
      if (!p.club) g *= 0.5; // без клубу розвиток повільніший
      if (age >= 30) g -= (0.02 + (age - 30) * 0.03) * k;
      g += (R.next() - 0.5) * 0.04 * k;
      p.dg = Math.round(((p.dg || 0) + g) * 1000) / 1000;
      let guard = 0;
      while (p.dg >= 1 && p.ca < p.pa && guard++ < 5) { shiftAttr(p, R, true, mine ? tr.focus : null, mine && tr.individual ? tr.individual[p.id] : null, age); p.dg -= 1; }
      while (p.dg <= -1 && guard++ < 5) { shiftAttr(p, R, false, null, null, age); p.dg += 1; }
      if (p.ca >= p.pa && p.dg > 0) p.dg = 0;
      if (S.week % 4 === 0 && p.club) p.value = FM.marketValue(p.ca, age, W.club(p.club).league, p.pa);
    }
    return hurt;
  }

  // ---------------- Юнаки ----------------
  const LEAGUE_NAT = { eng: 'ENG', esp: 'ESP', ita: 'ITA', ger: 'GER', fra: 'FRA', ukr: 'UKR' };
  const NAME_SET = { ENG: 'ENG', SCO: 'ENG', WAL: 'ENG', IRL: 'ENG', ESP: 'ESP', ITA: 'ITA', GER: 'GER', AUT: 'GER', FRA: 'FRA', UKR: 'UKR',
    BRA: 'BRA', POR: 'BRA', NED: 'NED', BEL: 'NED', POL: 'POL', TUR: 'TUR', CRO: 'CRO', CZE: 'POL', SVK: 'POL', DEN: 'SCA', NOR: 'SCA', SWE: 'SCA', SUI: 'GER', GRE: 'GRE', SCO: 'ENG', SRB: 'CRO', NGA: 'AFR', SEN: 'AFR', CIV: 'AFR', MAR: 'AFR', ARG: 'ESP' };
  const PROFILE = {
    GK: { ref: 3, han: 2.5, one: 2, aer: 2, kic: 0, dec: 1, pos: 2, pac: -3, sta: -2, str: 0 },
    CB: { fin: -5, pas: -1, dri: -3, cro: -4, tac: 3, hea: 3, dec: 1, pos: 3, otb: -4, wor: 0.5, pac: 0, sta: 0, str: 2.5 },
    FB: { fin: -4, pas: 0, dri: 0, cro: 2, tac: 2, hea: -1, dec: 0, pos: 1.5, otb: -1, wor: 2, pac: 2.5, sta: 2.5, str: -0.5 },
    DM: { fin: -3, pas: 1.5, dri: -1, cro: -2, tac: 3, hea: 0.5, dec: 2, pos: 2.5, otb: -2, wor: 2.5, pac: -0.5, sta: 2, str: 1.5 },
    CM: { fin: -1, pas: 3, dri: 1, cro: 0, tac: 0.5, hea: -1, dec: 2.5, pos: 0.5, otb: 1, wor: 2, pac: 0, sta: 2, str: 0 },
    AM: { fin: 1.5, pas: 3, dri: 3, cro: 0.5, tac: -3, hea: -2, dec: 2, pos: -2, otb: 2.5, wor: 0, pac: 1, sta: 0, str: -1 },
    W: { fin: 1, pas: 0.5, dri: 3.5, cro: 2.5, tac: -3, hea: -2.5, dec: 0.5, pos: -2.5, otb: 2, wor: 0.5, pac: 3.5, sta: 1, str: -1.5 },
    ST: { fin: 3.5, pas: -0.5, dri: 1, cro: -2, tac: -4, hea: 1.5, dec: 1, pos: -3, otb: 3.5, wor: 0, pac: 1.5, sta: 0, str: 1.5 },
  };
  const NEED = { GK: 3, CB: 5, FB: 4, DM: 2, CM: 4, AM: 2, W: 3, ST: 4 }; // скільки гравців ролі тримає клуб

  function makeYouth(W, clubId, R, year, forceRole, golden, bonus = 0) {
    const c = W.club(clubId);
    const country = (W.league(c.league) || {}).country || LEAGUE_NAT[c.league] || 'ENG';
    const nat = R.chance(0.82) ? country : R.pick(['UKR', 'ENG', 'ESP', 'ITA', 'GER', 'FRA', 'BRA', 'NGA', 'SEN', 'POR', 'NED', 'BEL', 'CRO', 'SRB', 'POL', 'MAR', 'CIV', 'ARG']);
    const names = FM.names[NAME_SET[nat] || nat] || FM.names[NAME_SET[country] || country] || FM.names.ENG;
    const [f, fe] = R.pick(names.first), [l, le] = R.pick(names.last);
    const have = {};
    for (const id of c.players) { const r = W.player(id).roles[0]; have[r] = (have[r] || 0) + 1; }
    const role = forceRole || R.weighted(Object.keys(NEED), (r) => Math.max(0.3, NEED[r] - (have[r] || 0) + 1));
    const side = role === 'FB' || role === 'W' ? R.pick(['L', 'R']) : null;
    const age = 16 + R.int(2);
    const lvl = W.clubLevel(clubId);
    const ca = Math.round(Math.max(30, lvl * 0.45 + R.range(-8, 8)));
    let pa = lvl + R.range(-28, 22);
    if (R.chance(0.04)) pa += 25; // рідкісний талант
    if (golden) pa += 15; // «золоте покоління» академії
    pa += bonus; // тренер молоді й академія
    pa = Math.round(Math.max(ca + 20, Math.min(195, pa)));
    const mid = ca / 10.5 + 0.8;
    const attrs = {};
    for (const [k, off] of Object.entries(PROFILE[role])) attrs[k] = Math.max(1, Math.min(20, Math.round(mid + off + R.range(-1.8, 1.8))));
    const used = new Set(c.players.map((id) => W.player(id).number));
    let number = 30 + R.int(40);
    while (used.has(number)) number++;
    const month = 1 + R.int(12), day = 1 + R.int(28);
    const p = {
      club: clubId, name: `${f} ${l}`, nameEn: `${fe} ${le}`, born: `${year - age - (month > 7 ? 1 : 0)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, // на 1 серпня — рівно age
      nat, number, roles: [role], side, height: role === 'GK' || role === 'CB' ? 183 + R.int(12) : 170 + R.int(16),
      caps: 0, intlGoals: 0, leagueApps: 0, leagueGoals: 0, attrs, ca: 0, pa, youth: year,
    };
    p.ca = FM.caFromAttrs(p);
    p.pa = Math.max(p.pa, p.ca + 15);
    p.value = FM.marketValue(p.ca, age, c.league, p.pa);
    return W.addPlayer(p);
  }

  /**
   * Кінець сезону: завершення кар'єри, звільнення зайвих у клубах ШІ, юнаки, історія рівня.
   * Повертає звіт { retired, youth, released } (масиви гравців).
   */
  function endSeason(W, state) {
    const S = state.season;
    const R = FM.rng(`end-${S.seed}`);
    const year = S.year + 1; // рік нового сезону
    const report = { retired: [], youth: [], released: [] };
    // історія рівня й кар'єри: [сезон, клуб, ігри, голи, передачі, середня оцінка ×10]
    for (const p of W.players.values()) {
      if (p.retired) continue;
      p.hist = (p.hist || []).concat([[S.year, p.ca]]).slice(-12);
      const st = S.ps[p.id];
      if (p.club || st) p.career = (p.career || []).concat([[S.year, p.club || p.lastClub || null, st ? st[0] : 0, st ? st[1] : 0, st ? st[2] : 0, st && st[0] ? Math.round(st[3] / st[0]) : 0]]).slice(-25);
    }
    // завершення кар'єри
    for (const p of W.players.values()) {
      if (p.retired) continue;
      const age = (W.age(p) ?? 24) + 1;
      let prob = age >= 39 ? 1 : age >= 34 ? (age - 33) * 0.22 : 0;
      if (age >= 32 && p.ca < 90) prob += 0.2;
      if (!p.club && age >= 31) prob += 0.35;
      if (prob > 0 && R.chance(prob)) {
        report.retired.push(p);
        p.lastClub = p.club || p.lastClub || null;
        if (p.club) W.move(p.id, null);
        p.retired = S.year;
        delete p.free;
      }
    }
    // юнаки
    report.golden = [];
    for (const c of W.clubs.values()) {
      const golden = R.chance(0.03); // зрідка академія видає «золоте покоління»
      if (golden) report.golden.push(c.id);
      const n = 2 + R.int(3) + (golden ? 2 : 0);
      const bonus = c.id === state.clubId ? state.youthBonus || 0 : c.fac ? (c.fac.youth - 10) * 0.8 : 0;
      for (let i = 0; i < n; i++) report.youth.push(makeYouth(W, c.id, R, year, null, golden, bonus));
    }
    // клуби ШІ тримають щонайменше 20 гравців: бракує (закінчилися контракти) — дозаповнюють з академії
    for (const c of W.clubs.values()) {
      if (c.id === state.clubId) continue;
      for (let k = W.club(c.id).players.length; k < 20; k++) report.youth.push(makeYouth(W, c.id, R, year, null, false, 2));
    }
    // клуби ШІ тримають не більше 30 гравців: відпускають найслабших дорослих
    for (const c of W.clubs.values()) {
      if (c.id === state.clubId) continue;
      const sq = W.squad(c.id);
      if (sq.length <= 30) continue;
      const gkCount = sq.filter((p) => p.roles[0] === 'GK').length;
      const cand = sq.filter((p) => (W.age(p) ?? 24) >= 20 && !(p.roles[0] === 'GK' && gkCount <= 3))
        .sort((a, b) => a.ca + (a.pa - a.ca) * 0.3 - (b.ca + (b.pa - b.ca) * 0.3));
      for (const p of cand.slice(0, sq.length - 30)) { p.lastClub = c.id; W.move(p.id, null); p.free = true; report.released.push(p); }
    }
    return report;
  }

  /**
   * Нагороди сезону для ліги: найкращий гравець, молодий гравець (до 21), бомбардир, символічна збірна (4-3-3).
   * Повертає { mvp, young, boot: [id, голи], xi: [id…] } — id гравців або null.
   */
  function awards(W, S, leagueId) {
    const size = W.db.leagues.find((l) => l.id === leagueId).size;
    const minApps = Math.round((size - 1) * 2 * 0.55);
    const rows = Object.entries(S.ps).map(([id, st]) => ({ p: W.player(id), st })).filter((x) => x.p && x.p.club && W.club(x.p.club).league === leagueId);
    const avg = (x) => x.st[3] / x.st[0] / 10 + x.st[1] * 0.02 + x.st[2] * 0.01;
    const regulars = rows.filter((x) => x.st[0] >= minApps).sort((a, b) => avg(b) - avg(a));
    const young = regulars.filter((x) => (W.age(x.p) ?? 30) <= 21)[0];
    const boot = [...rows].sort((a, b) => b.st[1] - a.st[1] || a.st[0] - b.st[0])[0];
    const xi = [];
    for (const [role, n] of [['GK', 1], ['FB', 2], ['CB', 2], ['DM', 1], ['CM', 1], ['AM', 1], ['W', 2], ['ST', 1]]) {
      xi.push(...regulars.filter((x) => x.p.roles[0] === role && !xi.includes(x.p.id)).slice(0, n).map((x) => x.p.id));
    }
    return { mvp: regulars[0] ? regulars[0].p.id : null, young: young ? young.p.id : null, boot: boot ? [boot.p.id, boot.st[1]] : null, xi };
  }

  /** Почати новий сезон: дата, календар, рівень на старті (для «прогресу за сезон»). */
  function newSeason(W, state) {
    const year = state.season.year + 1;
    W.today = `${year}-08-01`;
    for (const p of W.players.values()) {
      if (p.retired) continue;
      p.ca0 = p.ca;
      if (p.club) p.value = FM.marketValue(p.ca, W.age(p) ?? 24, W.club(p.club).league, p.pa);
    }
    state.season = FM.season.create(W, `${state.season.seed}-${year}`);
  }

  FM.dev = { PROFILE, NAME_SET, awards, PLANS, weekly, endSeason, newSeason, makeYouth, injuryWeeks, FOCUS, INTENSITY, ROLE_W };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
