// Збірні: склади з гравців бази, міжнародні вікна (по два матчі), чемпіонати Європи й світу,
// посада тренера збірної України паралельно з клубом.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const WINDOWS = [6, 13, 27]; // тижні міжнародних вікон (старі збереження без календаря)
  // реальний календар: вересень, жовтень, листопад (відбір / Ліга націй); березневе вікно — без офіційних матчів
  const windows = (S) => (S && S.cal ? S.cal.intl.slice(0, 3) : WINDOWS);
  const EUROPE = new Set(['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'UKR', 'POR', 'NED', 'BEL', 'CRO', 'SUI', 'DEN', 'AUT', 'NOR', 'TUR', 'SRB', 'SWE', 'POL',
    'WAL', 'HUN', 'SCO', 'CZE', 'SVK', 'SVN', 'GRE', 'ROU', 'IRL', 'NIR', 'FIN', 'GEO', 'ALB', 'BIH', 'MKD', 'ISL', 'ISR', 'MNE', 'KOS', 'BUL', 'ARM', 'AZE', 'LUX', 'BLR']);
  const COLORS = { UKR: ['#ffd500', '#005bbb'], ENG: ['#ffffff', '#c8102e'], ESP: ['#c60b1e', '#ffc400'], ITA: ['#0066b3', '#ffffff'], GER: ['#ffffff', '#000000'],
    FRA: ['#002395', '#ffffff'], POR: ['#c8102e', '#046a38'], NED: ['#ff6600', '#ffffff'], BRA: ['#ffdf00', '#009c3b'], ARG: ['#75aadb', '#ffffff'], BEL: ['#e30613', '#000000'],
    CRO: ['#ffffff', '#ff0000'], TUR: ['#e30a17', '#ffffff'], POL: ['#ffffff', '#dc143c'] };

  /** Збірні, у яких у базі щонайменше 16 гравців: { код: [гравці від найкращого] }. */
  let cache = null; // на час одного розрахунку (турнір, вікно) склади не змінюються
  function cached(W, fn) { const prev = cache; cache = { W, pools: null, str: {} }; try { return fn(); } finally { cache = prev; } }
  // поза розрахунком — короткий кеш (1,5 с): екрани й підсумки сезону викликають pools/strength сотні разів поспіль
  let memo = { W: null, at: 0, pools: null, str: {} };
  const fresh = (W) => memo.W === W && Date.now() - memo.at < 1500;
  /** Скинути кеш (склади збірних змінилися: згенеровано гравців, тиждень зіграно). */
  const invalidate = () => { memo = { W: null, at: 0, pools: null, str: {} }; if (cache) { cache.pools = null; cache.str = {}; } };
  function pools(W) {
    if (cache && cache.W === W && cache.pools) return cache.pools;
    if (!cache && fresh(W) && memo.pools) return memo.pools;
    const v = poolsRaw(W);
    if (cache && cache.W === W) cache.pools = v;
    else memo = { W, at: Date.now(), pools: v, str: {} };
    return v;
  }
  function poolsRaw(W) {
    const by = {};
    for (const p of W.players.values()) if ((p.club || p.virtual) && !p.retired && p.nat) (by[p.nat] = by[p.nat] || []).push(p); // virtual — згенеровані гравці збірних
    const out = {};
    for (const [code, list] of Object.entries(by)) if (list.length >= 16 && list.filter((p) => p.roles[0] === 'GK').length >= 2) out[code] = list.sort((a, b) => b.ca - a.ca);
    return out;
  }
  /** Заявка: 23 гравці (3 воротарі), найкращі за рівнем; picks — ручний вибір тренера-людини. */
  function squad(W, code, picks) {
    const all = pools(W)[code] || [];
    if (picks && picks.length) return picks.map((id) => W.player(id)).filter((p) => p && (p.club || p.virtual) && !p.retired && !p.injury);
    const gk = all.filter((p) => p.roles[0] === 'GK' && !p.injury).slice(0, 3);
    const out = all.filter((p) => p.roles[0] !== 'GK' && !p.injury).slice(0, 20);
    return gk.concat(out);
  }
  const teamClub = (code) => ({ id: 'n-' + code, name: FM.countries ? FM.countries.name(code) : code, nameEn: code, code, colors: COLORS[code] || ['#cfd6d2', '#4b5a52'], league: null });
  const strength = (W, code) => {
    if (cache && cache.W === W && cache.str[code] != null) return cache.str[code];
    if (!cache && fresh(W) && memo.str[code] != null) return memo.str[code];
    const v = strengthRaw(W, code);
    if (cache && cache.W === W) cache.str[code] = v;
    else if (fresh(W)) memo.str[code] = v;
    return v;
  };
  const strengthRaw = (W, code) => { const s = squad(W, code); const top = s.map((p) => p.ca).sort((a, b) => b - a).slice(0, 14); return top.reduce((x, y) => x + y, 0) / Math.max(1, top.length); };

  // ---------------- Тренери збірних (персонал) ----------------
  const COACH_STYLES = { attack: ['атакувальний', 'positive', 'high', 'mixed'], possession: ['контроль м’яча', 'balanced', 'high', 'short'], balanced: ['збалансований', 'balanced', 'normal', 'mixed'],
    counter: ['контратаки', 'cautious', 'low', 'direct'], defence: ['оборонний', 'cautious', 'normal', 'mixed'] };
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  /** Головний тренер збірної: ім'я з імен країни, стиль; сильні збірні частіше атакують. */
  function coachOf(W, code) {
    const set = FM.names && FM.names[NAMES_OF[code] || (FM.dev && FM.dev.NAME_SET && FM.dev.NAME_SET[code]) || code] || (FM.names && FM.names.ENG);
    const h = hashS('coach-' + code);
    const name = set ? `${set.first[h % set.first.length][0]} ${set.last[(h >>> 8) % set.last.length][0]}` : 'Тренер';
    const st = strength(W, code), keys = Object.keys(COACH_STYLES);
    const style = st > 145 ? keys[h % 2] : st < 115 ? keys[3 + (h % 2)] : keys[(h >>> 4) % keys.length];
    return { name, style, label: COACH_STYLES[style][0] };
  }
  function side(W, code, picks) {
    const players = squad(W, code, picks);
    const formation = FM.bestFormation(players);
    const st = COACH_STYLES[coachOf(W, code).style];
    return { club: teamClub(code), players, formation, lineup: FM.pickLineup(players, formation), mentality: st[1], pressing: st[2], passing: st[3] };
  }
  function playNations(W, a, b, seed, opts = {}) {
    const A = side(W, a, opts.picksA), B = side(W, b, opts.picksB);
    return FM.match.play({ home: A, away: B, seed, neutral: !!opts.neutral, name: opts.name });
  }

  /** Суперник у вікні: інша збірна близької сили (детерміновано). */
  function opponent(W, code, seed, used) {
    const R = FM.rng(seed);
    const s = strength(W, code);
    const cands = Object.keys(pools(W)).filter((c) => c !== code && !used.includes(c)).sort((x, y) => Math.abs(strength(W, x) - s) - Math.abs(strength(W, y) - s)).slice(0, 10);
    return R.pick(cands);
  }

  /** Матчі збірної України цього тижня (якщо міжнародне вікно): [{ id, opp, home }]. */
  function fixtures(state, W) {
    const S = state.season;
    if (!windows(S).includes(S.week) || !pools(W).UKR) return [];
    const done = (state.intl = state.intl || {}).played || [];
    const out = [];
    const used = [];
    // сезон перед турніром — відбір: група з 4 команд, у кожне вікно — по два матчі
    // відбір на турнір або Ліга націй: група з 4, у кожне вікно — по два матчі
    const Q = qualGroup(W, state), NL = Q ? null : nlGroup(W, state), G = Q || NL;
    if (G && G.group.length === 4) {
      const wi = windows(S).indexOf(S.week);
      const opp = G.group.filter((c) => c !== 'UKR');
      const plan = [[opp[0], true], [opp[1], false], [opp[2], true], [opp[0], false], [opp[1], true], [opp[2], false]];
      for (let k = 0; k < 2; k++) {
        const [o, home] = plan[wi * 2 + k];
        const id = `${S.year}-${S.week}-${k}`;
        if (!done.some((x) => x.id === id)) out.push({ id, opp: o, home, qual: Q ? Q.year : undefined, nl: NL ? NL.year : undefined, comp: G.name });
      }
      return out;
    }
    for (let k = 0; k < 2; k++) {
      const id = `${S.year}-${S.week}-${k}`;
      const opp = opponent(W, 'UKR', `intl-${S.seed}-${id}`, used);
      used.push(opp);
      if (!done.some((x) => x.id === id)) out.push({ id, opp, home: k === 0 });
    }
    return out;
  }

  /** Кваліфікаційна група сезону перед турніром: { year, name, group: [UKR, сильніший, рівний, слабший], other: [[a, b, s]] } або null. */
  function qualGroup(W, state) {
    const S = state.season, t = tournamentFor(S.year + 1);
    if (!t || !pools(W).UKR) return null;
    const st = (state.intl = state.intl || {});
    if (st.qual && st.qual.year === S.year + 1) return st.qual;
    const R = FM.rng(`qual-${S.seed}-${S.year}`);
    const field = Object.keys(pools(W)).filter((c) => c !== 'UKR' && (t.kind === 'wc' || EUROPE.has(c))).sort((a, b) => strength(W, b) - strength(W, a));
    const u = strength(W, 'UKR');
    const stronger = field.filter((c) => strength(W, c) > u + 3), weaker = field.filter((c) => strength(W, c) < u - 3);
    const near = field.filter((c) => !stronger.includes(c) && !weaker.includes(c));
    const pick = (list, fb) => (list.length ? list[R.int(Math.min(list.length, 8))] : fb.shift());
    const rest = field.slice();
    const a = pick(stronger.slice(-8), rest), b = pick(near.filter((c) => c !== a), rest.filter((c) => c !== a)), c = pick(weaker.slice(0, 8).filter((x) => x !== a && x !== b), rest.filter((x) => x !== a && x !== b));
    st.qual = { year: S.year + 1, name: `Відбір: ${t.name}`, group: ['UKR', a, b, c].filter(Boolean), other: [] };
    return st.qual;
  }
  /** Таблиця кваліфікаційної групи (матчі України + інших команд групи). */
  function qualTable(state) {
    const Q = state.intl && state.intl.qual;
    if (!Q) return [];
    const rows = Object.fromEntries(Q.group.map((c) => [c, { c, p: 0, pts: 0, gd: 0, gf: 0 }]));
    const add = (a, b, x, y) => { const A = rows[a], B = rows[b]; if (!A || !B) return; A.p++; B.p++; A.gf += x; B.gf += y; A.gd += x - y; B.gd += y - x; if (x > y) A.pts += 3; else if (y > x) B.pts += 3; else { A.pts++; B.pts++; } };
    for (const x of (state.intl.played || []).filter((x) => x.qual === Q.year)) add('UKR', x.opp, x.score[0], x.score[1]);
    for (const [a, b, sc] of Q.other) add(a, b, sc[0], sc[1]);
    return Object.values(rows).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }

  /** Записати матч збірної: втома й травми викликаних гравців. */
  function record(W, state, fx, m) {
    const st = (state.intl = state.intl || {});
    st.played = (st.played || []).concat([{ id: fx.id, opp: fx.opp, home: fx.home, score: fx.home ? m.score : [m.score[1], m.score[0]], s: state.season.year, qual: fx.qual, nl: fx.nl, comp: fx.comp }]).slice(-40);
    for (const r of m.ratings) {
      if (r.injury) r.player.injury = Math.max(r.player.injury || 0, r.injury);
      if (r.cond != null) r.player.fitness = Math.min(r.player.fitness ?? 100, r.cond);
      if (r.team === (fx.home ? 0 : 1)) { r.player.caps = (r.player.caps || 0) + 1; r.player.intlGoals = (r.player.intlGoals || 0) + r.goals; }
    }
  }

  /** Тиждень вікна: збірна України (якщо не тренує людина — грає автоматично) й втома гравців інших збірних. */
  function weekly(W, state, opts = {}) {
    invalidate();
    const S = state.season;
    if (!windows(S).includes(S.week)) return [];
    const res = [];
    const coach = state.intl && state.intl.coach;
    const picks = coach && state.intl.picks && state.intl.picks.length >= 16 ? state.intl.picks : null;
    for (const fx of fixtures(state, W)) {
      const m = playNations(W, fx.home ? 'UKR' : fx.opp, fx.home ? fx.opp : 'UKR', `intl-${S.seed}-${fx.id}`, { name: opts.name, [fx.home ? 'picksA' : 'picksB']: picks });
      record(W, state, fx, m);
      if (coach && state.board) { // репутація тренера збірної
        const [g1, g2] = fx.home ? m.score : [m.score[1], m.score[0]];
        state.board.rep = Math.max(0, Math.min(100, state.board.rep + (g1 > g2 ? 1 : g1 < g2 ? -1 : 0)));
      }
      res.push({ fx, m });
    }
    // інші матчі кваліфікаційної групи цього вікна
    const Q = qualGroup(W, state) || nlGroup(W, state);
    if (Q && Q.group.length === 4) {
      const wi = windows(S).indexOf(S.week), [, a, b, c] = Q.group;
      const plan = [[[b, c], [a, c]], [[c, a], [b, a]], [[a, b], [c, b]]][wi] || [];
      for (const [h, aw] of plan) if (h && aw && !Q.other.some((x) => x[3] === `${S.week}-${h}-${aw}`)) {
        const m = playNations(W, h, aw, `qual-${S.seed}-${S.week}-${h}-${aw}`, {});
        Q.other.push([h, aw, m.score, `${S.week}-${h}-${aw}`]);
      }
    }
    // гравці інших збірних теж їздять на матчі: трохи втоми, зрідка травма
    const R = FM.rng(`intl-fatigue-${S.seed}-${S.week}`);
    for (const [code] of Object.entries(pools(W))) {
      if (code === 'UKR') continue;
      for (const p of squad(W, code).slice(0, 18)) {
        p.fitness = Math.min(p.fitness ?? 100, 82 + R.int(10));
        if (R.chance(0.015)) p.injury = Math.max(p.injury || 0, 1 + R.int(3));
      }
    }
    return res;
  }

  /** Чи можна очолити збірну України: репутація тренера щонайменше 55. */
  const canCoach = (state) => !!(state.board && state.board.rep >= 55);

  /** Турнір після сезону: чемпіонат Європи (парні роки) або світу (2030, 2034…). */
  function tournamentFor(year) {
    if (year % 4 === 0) return { kind: 'euro', name: `Чемпіонат Європи ${year}`, size: 24 };
    if (year % 4 === 2) return { kind: 'wc', name: `Чемпіонат світу ${year}`, size: 32 };
    return null;
  }
  // ---------------- Конфедерації й згенеровані гравці збірних ----------------
  const CONFED = {
    conmebol: ['BRA', 'ARG', 'URU', 'COL', 'ECU', 'PAR', 'CHI', 'PER', 'VEN', 'BOL'],
    caf: ['MAR', 'SEN', 'NGA', 'CIV', 'EGY', 'ALG', 'TUN', 'CMR', 'GHA', 'MLI', 'RSA', 'COD', 'BFA', 'GUI', 'CPV', 'ZAM', 'ANG', 'GAB', 'BEN', 'EQG', 'MTN', 'UGA', 'TAN', 'SUD'],
    afc: ['JPN', 'KOR', 'AUS', 'IRN', 'KSA', 'QAT', 'UZB', 'IRQ', 'UAE', 'JOR', 'CHN', 'OMA', 'BHR', 'SYR', 'PLE', 'KGZ', 'THA', 'VIE', 'IND', 'IDN', 'LBN', 'TJK', 'KUW', 'PRK'],
    concacaf: ['USA', 'MEX', 'CAN', 'CRC', 'PAN', 'JAM', 'HON', 'SLV', 'HAI', 'GUA', 'TRI', 'CUW', 'SUR', 'NCA', 'GUY', 'BER'],
    uefa: [...EUROPE],
  };
  // середній рівень (1–200) гравців, які грають на батьківщині: так генеруються ті, кого немає в базі
  const NAT_BASE = { BRA: 138, ARG: 136, URU: 126, COL: 125, ECU: 120, PAR: 114, CHI: 112, PER: 108, VEN: 108, BOL: 96,
    MAR: 124, SEN: 122, NGA: 120, CIV: 120, EGY: 118, ALG: 116, TUN: 112, CMR: 114, GHA: 112, MLI: 112, RSA: 108, COD: 110, BFA: 108, GUI: 104, CPV: 104,
    ZAM: 98, ANG: 98, GAB: 100, BEN: 96, EQG: 94, MTN: 92, UGA: 92, TAN: 88, SUD: 88,
    JPN: 126, KOR: 122, AUS: 116, IRN: 116, KSA: 110, QAT: 106, UZB: 108, IRQ: 104, UAE: 100, JOR: 102, CHN: 96, OMA: 94, BHR: 92, SYR: 92, PLE: 90,
    KGZ: 86, THA: 90, VIE: 90, IND: 82, IDN: 92, LBN: 86, TJK: 86, KUW: 84, PRK: 86,
    USA: 122, MEX: 122, CAN: 116, CRC: 106, PAN: 108, JAM: 104, HON: 98, SLV: 92, HAI: 94, GUA: 90, TRI: 90, CUW: 92, SUR: 94, NCA: 82, GUY: 84, BER: 80 };
  const NAMES_OF = { BRA: 'BRA', POR: 'BRA', CPV: 'BRA', ANG: 'BRA', ARG: 'ESP', URU: 'ESP', COL: 'ESP', ECU: 'ESP', PAR: 'ESP', CHI: 'ESP', PER: 'ESP', VEN: 'ESP', BOL: 'ESP',
    MEX: 'ESP', CRC: 'ESP', PAN: 'ESP', HON: 'ESP', SLV: 'ESP', GUA: 'ESP', NCA: 'ESP', EQG: 'ESP',
    USA: 'ENG', CAN: 'ENG', AUS: 'ENG', JAM: 'ENG', TRI: 'ENG', GUY: 'ENG', BER: 'ENG', SCO: 'ENG', WAL: 'ENG', IRL: 'ENG', NIR: 'ENG',
    MAR: 'AFR', SEN: 'AFR', NGA: 'AFR', CIV: 'AFR', EGY: 'AFR', ALG: 'AFR', TUN: 'AFR', CMR: 'AFR', GHA: 'AFR', MLI: 'AFR', RSA: 'AFR', COD: 'AFR', BFA: 'AFR', GUI: 'AFR',
    ZAM: 'AFR', GAB: 'AFR', BEN: 'AFR', MTN: 'AFR', UGA: 'AFR', TAN: 'AFR', SUD: 'AFR', HAI: 'FRA', CUW: 'NED', SUR: 'NED',
    JPN: 'ASI', KOR: 'ASI', PRK: 'ASI', CHN: 'ASI', THA: 'ASI', VIE: 'ASI', IDN: 'ASI', IND: 'ASI', UZB: 'ASI', KGZ: 'ASI', TJK: 'ASI',
    IRN: 'TUR', KSA: 'TUR', QAT: 'TUR', IRQ: 'TUR', UAE: 'TUR', JOR: 'TUR', OMA: 'TUR', BHR: 'TUR', SYR: 'TUR', PLE: 'TUR', LBN: 'TUR', KUW: 'TUR',
    NOR: 'SCA', SWE: 'SCA', DEN: 'SCA', FIN: 'SCA', ISL: 'SCA', SRB: 'CRO', CRO: 'CRO', BIH: 'CRO', SVN: 'CRO', MNE: 'CRO', MKD: 'CRO', KOS: 'CRO', ALB: 'CRO', BUL: 'CRO', ROU: 'CRO',
    CZE: 'POL', SVK: 'POL', HUN: 'POL', BLR: 'UKR', GEO: 'UKR', ARM: 'UKR', AZE: 'TUR', GRE: 'GRE', ISR: 'ENG', LUX: 'FRA', SUI: 'GER', AUT: 'GER', BEL: 'NED' };
  const confedOf = (code) => Object.keys(CONFED).find((k) => CONFED[k].includes(code)) || null;
  const NEED = { GK: 3, CB: 4, FB: 4, DM: 2, CM: 3, AM: 2, W: 3, ST: 2 };
  /** Рівень для генерації: таблиця вище; для Європи — за рівнем країни в рейтингах (tier). */
  const baseOf = (code) => NAT_BASE[code] || 100;

  /**
   * Згенерувати гравців для збірних, яким у базі не вистачає складу (23 гравці, 3 воротарі).
   * Це вигадані гравці, що «грають на батьківщині» (у лігах поза грою): p.virtual = true, у трансфери не потрапляють.
   * Повертає кількість нових.
   */
  function ensurePools(W, state) {
    const R = FM.rng(`natgen-${state.season.seed}-${state.season.year}`);
    const by = {};
    for (const p of W.players.values()) if ((p.club || p.virtual) && !p.retired && p.nat) (by[p.nat] = by[p.nat] || []).push(p);
    let made = 0;
    const all = [...CONFED.conmebol, ...CONFED.caf, ...CONFED.afc, ...CONFED.concacaf, ...CONFED.uefa];
    for (const code of all) {
      const have = by[code] || [];
      const roles = {};
      for (const p of have) roles[p.roles[0]] = (roles[p.roles[0]] || 0) + 1;
      const missing = [];
      for (const [r, n] of Object.entries(NEED)) for (let k = roles[r] || 0; k < n; k++) missing.push(r);
      while (have.length + missing.length < 23) missing.push(R.pick(['CB', 'CM', 'W', 'ST', 'FB']));
      if (!missing.length) continue;
      const names = FM.names[NAMES_OF[code]] || FM.names.ENG;
      for (const role of missing) {
        const [f, fe] = R.pick(names.first), [l, le] = R.pick(names.last);
        const age = 20 + R.int(13);
        const ca = Math.round(Math.max(55, Math.min(165, baseOf(code) + R.range(-14, 8))));
        const mid = ca / 10.5 + 0.8, attrs = {};
        for (const [k, off] of Object.entries(FM.dev.PROFILE[role])) attrs[k] = Math.max(1, Math.min(20, Math.round(mid + off + R.range(-1.8, 1.8))));
        const year = state.season.year, month = 1 + R.int(12), day = 1 + R.int(28);
        const p = { club: null, virtual: true, name: `${f} ${l}`, nameEn: `${fe} ${le}`, nat: code, number: null, roles: [role],
          side: role === 'FB' || role === 'W' ? R.pick(['L', 'R']) : null, born: `${year - age - (month > 7 ? 1 : 0)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          height: role === 'GK' || role === 'CB' ? 183 + R.int(12) : 168 + R.int(17), caps: R.int(30), intlGoals: 0, attrs, ca: 0, pa: 0, gen: ['born', 'height'] };
        p.ca = FM.caFromAttrs(p); p.pa = p.ca + (age < 24 ? R.int(20) : 0);
        p.value = FM.marketValue(p.ca, age, 'pol', p.pa);
        W.addPlayer(p);
        made++;
      }
    }
    invalidate();
    return made;
  }

  // ---------------- Ліга націй (у сезони без відбору) ----------------
  /** Дивізіон ліги для команди за рангом сили серед європейських збірних: A — 1–16, B — 17–32, C — решта. */
  function nlTierByRank(W, code) {
    const eu = Object.keys(pools(W)).filter((c) => EUROPE.has(c)).sort((a, b) => strength(W, b) - strength(W, a));
    const r = eu.indexOf(code);
    return r < 16 ? 'A' : r < 32 ? 'B' : 'C';
  }
  /** Група Ліги націй України на цей сезон (якщо наступного літа немає Євро/ЧС). */
  function nlGroup(W, state) {
    const S = state.season;
    if (tournamentFor(S.year + 1) || !pools(W).UKR) return null;
    const st = (state.intl = state.intl || {});
    if (st.nl && st.nl.year === S.year) return st.nl;
    const tier = st.nlTier || nlTierByRank(W, 'UKR');
    const R = FM.rng(`nl-${S.seed}-${S.year}`);
    const eu = Object.keys(pools(W)).filter((c) => EUROPE.has(c) && c !== 'UKR').sort((a, b) => strength(W, b) - strength(W, a));
    const band = tier === 'A' ? eu.slice(0, 18) : tier === 'B' ? eu.slice(12, 34) : eu.slice(28);
    const pool = band.slice();
    const group = ['UKR'];
    while (group.length < 4 && pool.length) group.push(pool.splice(R.int(pool.length), 1)[0]);
    st.nl = { year: S.year, tier, name: `Ліга націй, дивізіон ${tier}`, group, other: [] };
    return st.nl;
  }
  /** Підсумок Ліги націй: підвищення/пониження України; переможець дивізіону A — у фінал чотирьох. */
  function nlEnd(W, state) {
    const st = state.intl || {}, NL = st.nl;
    if (!NL || NL.year !== state.season.year) return null;
    const tab = groupTableOf(NL, st.played || [], 'nl');
    const pos = tab.findIndex((r) => r.c === 'UKR') + 1;
    const T = ['A', 'B', 'C'], i = T.indexOf(NL.tier);
    let text = `${NL.name}: Україна — ${pos}-е місце в групі.`;
    if (pos === 1 && i > 0) { st.nlTier = T[i - 1]; text += ` Підвищення до дивізіону ${T[i - 1]}!`; }
    else if (pos === 4 && i < 2) { st.nlTier = T[i + 1]; text += ` Пониження до дивізіону ${T[i + 1]}.`; }
    else st.nlTier = NL.tier;
    return { text, finals: NL.tier === 'A' && pos === 1 };
  }
  /** Таблиця групи (матчі України з тегом + інші матчі групи). */
  function groupTableOf(G, played, tag) {
    const rows = Object.fromEntries(G.group.map((c) => [c, { c, p: 0, pts: 0, gd: 0, gf: 0 }]));
    const add = (a, b, x, y) => { const A = rows[a], B = rows[b]; if (!A || !B) return; A.p++; B.p++; A.gf += x; B.gf += y; A.gd += x - y; B.gd += y - x; if (x > y) A.pts += 3; else if (y > x) B.pts += 3; else { A.pts++; B.pts++; } };
    for (const x of played.filter((x) => x[tag] === G.year)) add('UKR', x.opp, x.score[0], x.score[1]);
    for (const [a, b, sc] of G.other) add(a, b, sc[0], sc[1]);
    return Object.values(rows).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }

  // ---------------- Континентальні турніри (літо непарних років) ----------------
  const CONTINENTAL = [
    { id: 'copa', name: 'Кубок Америки', teams: () => [...CONFED.conmebol, 'USA', 'MEX'], thirds: 2 },
    { id: 'afcon', name: 'Кубок африканських націй', teams: () => CONFED.caf.slice(0, 24), thirds: 4 },
    { id: 'asian', name: 'Кубок Азії', teams: () => CONFED.afc.slice(0, 24), thirds: 4 },
    { id: 'gold', name: 'Золотий кубок КОНКАКАФ', teams: () => CONFED.concacaf.slice(0, 16), thirds: 0 },
  ];

  // ---------------- Турнір: покроково (щоб матчі України можна було грати наживо) ----------------
  /**
   * Створити турнір. ukr: 'in' — Україна кваліфікувалася, 'out' — ні, null — за силою.
   * T = { name, kind, year, seed, groups: [[коди]], gm: [{ g, a, b, s }], ko: [[{ a, b, s, w }]], winner, stage: { код: етап } }.
   */
  function createTournament(W, year, seed, ukr) {
    const t = tournamentFor(year);
    if (!t) return null;
    const P = pools(W), byStr = (list) => list.filter((c) => P[c]).sort((a, b) => strength(W, b) - strength(W, a));
    let teams;
    if (t.kind === 'wc') { // квоти конфедерацій: Європа 13, Південна Америка 6, Африка 5, Азія 5, КОНКАКАФ 3
      const Q = { uefa: 13, conmebol: 6, caf: 5, afc: 5, concacaf: 3 };
      teams = Object.entries(Q).flatMap(([k, n]) => byStr(CONFED[k]).filter((c) => !(ukr === 'out' && c === 'UKR')).slice(0, n));
    } else teams = byStr([...EUROPE]).filter((c) => !(ukr === 'out' && c === 'UKR')).slice(0, t.size);
    if (ukr === 'in' && !teams.includes('UKR')) { const eu = teams.filter((c) => EUROPE.has(c)); teams.splice(teams.indexOf(eu[eu.length - 1]), 1, 'UKR'); }
    return createCustom(W, { name: t.name, kind: t.kind, year, seed, teams: byStr(teams), thirds: t.kind === 'euro' ? 4 : 0 });
  }
  /** Турнір з будь-яким списком команд: групи по 4 (кошики за силою), далі плей-оф; thirds — скільки найкращих третіх проходять. */
  function createCustom(W, o) {
    const R = FM.rng(`tour-${o.seed}-${o.year}-${o.name}`);
    const teams = o.teams.slice();
    if (teams.length < 4) return null;
    while (teams.length % 4) teams.pop();
    const nG = teams.length / 4, groups = Array.from({ length: nG }, () => []);
    for (let pot = 0; pot < 4; pot++) {
      const potT = teams.slice(pot * nG, pot * nG + nG);
      for (let i = potT.length - 1; i > 0; i--) { const j = R.int(i + 1); [potT[i], potT[j]] = [potT[j], potT[i]]; }
      potT.forEach((c, g) => groups[g].push(c));
    }
    const gm = [];
    for (const [md, pairs] of [[0, [[0, 1], [2, 3]]], [1, [[0, 2], [1, 3]]], [2, [[0, 3], [1, 2]]]]) // три тури
      groups.forEach((g, gi) => pairs.forEach(([i, j]) => gm.push({ md, g: gi, a: g[i], b: g[j], s: null })));
    return { name: o.name, kind: o.kind, year: o.year, seed: o.seed, thirds: o.thirds || 0, groups, gm, ko: [], winner: null, stage: {} };
  }
  /** Лише плей-оф (фінал чотирьох): teams — від найсильнішого. */
  function createKO(W, o) {
    const t = o.teams;
    return { name: o.name, kind: 'ko', year: o.year, seed: o.seed, thirds: 0, groups: [], gm: [], ko: [[{ a: t[0], b: t[3], s: null }, { a: t[1], b: t[2], s: null }]], winner: null, stage: {} };
  }
  const KO_NAMES = { 16: '1/8 фіналу', 8: 'чвертьфінал', 4: 'півфінал', 2: 'фінал' };
  function groupTable(T, gi) {
    const rows = Object.fromEntries(T.groups[gi].map((c) => [c, { c, g: gi, p: 0, pts: 0, gd: 0, gf: 0 }]));
    for (const m of T.gm) if (m.g === gi && m.s) {
      const A = rows[m.a], B = rows[m.b], [x, y] = m.s;
      A.p++; B.p++; A.gf += x; B.gf += y; A.gd += x - y; B.gd += y - x;
      if (x > y) A.pts += 3; else if (y > x) B.pts += 3; else { A.pts++; B.pts++; }
    }
    return Object.values(rows).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }
  /** Наступний незіграний матч: { kind: 'g'|'k', m, round? } або null. */
  function nextMatch(T) {
    const g = T.gm.find((m) => !m.s);
    if (g) return { kind: 'g', m: g, label: `груповий етап, ${g.md + 1}-й тур` };
    if (!T.ko.length) buildKO(T);
    const round = T.ko[T.ko.length - 1];
    const k = round && round.find((m) => !m.s);
    if (k) return { kind: 'k', m: k, label: KO_NAMES[round.length * 2] || 'плей-оф' };
    return null;
  }
  /** Сітка плей-оф після груп: найкращі 16 за місцем у групі й очками; 1-й проти 16-го… (не з однієї групи, коли можна). */
  function buildKO(T) {
    const tabs = T.groups.map((g, gi) => groupTable(T, gi));
    let q = tabs.flatMap((t) => t.slice(0, 2).map((r, k) => ({ ...r, k })));
    if (T.thirds) q = q.concat(tabs.map((t) => ({ ...t[2], k: 2 })).sort((a, b) => b.pts - a.pts || b.gd - a.gd).slice(0, T.thirds));
    q.sort((a, b) => a.k - b.k || b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    while (q.length & (q.length - 1)) q.pop();
    for (const t of tabs) for (const r of t) if (!q.some((x) => x.c === r.c)) T.stage[r.c] = 'груповий етап';
    const n = q.length, pairs = [];
    const used = new Set();
    for (let i = 0; i < n / 2; i++) {
      const a = q[i]; if (used.has(a.c)) continue;
      let j = n - 1 - i;
      for (let k = n - 1; k >= n / 2; k--) if (!used.has(q[k].c) && q[k].g !== a.g) { j = k; break; } // уникати суперника з групи
      if (used.has(q[j].c)) j = q.findIndex((x, k) => k >= n / 2 && !used.has(x.c));
      used.add(a.c); used.add(q[j].c);
      pairs.push({ a: a.c, b: q[j].c, s: null });
    }
    T.ko.push(pairs);
  }
  /** Записати результат матчу (m — результат двигуна; у плей-оф нічия — пенальті). */
  function recordTour(T, nm, m, R) {
    nm.m.s = m.score.slice();
    if (nm.kind === 'k') {
      const [x, y] = nm.m.s;
      nm.m.w = x > y ? nm.m.a : y > x ? nm.m.b : (R.chance(0.5) ? nm.m.a : nm.m.b);
      if (x === y) nm.m.pens = true;
      const round = T.ko[T.ko.length - 1];
      T.stage[nm.m.w === nm.m.a ? nm.m.b : nm.m.a] = KO_NAMES[round.length * 2] || 'плей-оф';
      if (round.every((x2) => x2.s)) {
        if (round.length === 1) { T.winner = round[0].w; T.stage[T.winner] = 'переможець'; T.final = { a: round[0].a, b: round[0].b, score: round[0].s, winner: round[0].w }; }
        else { const next = []; for (let i = 0; i < round.length; i += 2) next.push({ a: round[i].w, b: round[i + 1].w, s: null }); T.ko.push(next); }
      }
    }
  }
  /** Зіграти автоматично до наступного матчу команди code (або до кінця). Повертає цей матч або null. */
  function playUntil(W, T, code, opts = {}) {
    const R = FM.rng(`tourpens-${T.seed}-${T.year}`);
    let nm;
    while ((nm = nextMatch(T))) {
      if (code && (nm.m.a === code || nm.m.b === code)) return nm;
      const m = playNations(W, nm.m.a, nm.m.b, `tour-${T.seed}-${T.year}-${nm.kind}-${nm.m.a}-${nm.m.b}`, { neutral: true, name: opts.name });
      recordTour(T, nm, m, R);
    }
    return null;
  }
  /** Підсумок турніру для звіту. */
  const summary = (T) => ({ name: T.name, winner: T.winner, final: T.final, ukr: T.stage.UKR || (T.groups.some((g) => g.includes('UKR')) || (T.ko[0] || []).some((m) => m.a === 'UKR' || m.b === 'UKR') ? null : 'не кваліфікувалася'), stage: T.stage });
  /** Зіграти весь турнір автоматично (для збірної, яку не тренує людина). */
  function tournament(W, year, seed, ukr) {
    const T = createTournament(W, year, seed, ukr);
    if (!T) return null;
    playUntil(W, T, null);
    return summary(T);
  }

  FM.nations = { windows, invalidate, CONFED, NAT_BASE, CONTINENTAL, coachOf, ensurePools, nlGroup, nlEnd, groupTableOf, nlTierByRank, createCustom, createKO, confedOf, qualGroup, qualTable, createTournament, nextMatch, recordTour, groupTable, summary, WINDOWS, EUROPE, canCoach, pools, squad, side, teamClub, strength, record, playNations, tournamentFor,
    fixtures: (state, W) => cached(W, () => fixtures(state, W)),
    weekly: (W, state, opts) => cached(W, () => weekly(W, state, opts)),
    playUntil: (W, T, code, opts) => cached(W, () => playUntil(W, T, code, opts)),
    tournament: (W, year, seed, ukr) => cached(W, () => tournament(W, year, seed, ukr)),
    /** Континентальні турніри літа: [{ name, winner, final, stage }]. */
    continental: (W, year, seed) => cached(W, () => CONTINENTAL.map((c) => {
      const P = pools(W), teams = c.teams().filter((x) => P[x]).sort((a, b) => strength(W, b) - strength(W, a));
      const T = createCustom(W, { name: `${c.name} ${year}`, kind: c.id, year, seed, teams, thirds: c.thirds });
      if (!T) return null;
      playUntil(W, T, null);
      return summary(T);
    }).filter(Boolean)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
