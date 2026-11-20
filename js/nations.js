// Збірні: склади з гравців бази, міжнародні вікна (по два матчі), чемпіонати Європи й світу,
// посада тренера збірної України паралельно з клубом.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const WINDOWS = [6, 13, 27]; // тижні міжнародних вікон
  const EUROPE = new Set(['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'UKR', 'POR', 'NED', 'BEL', 'CRO', 'SUI', 'DEN', 'AUT', 'NOR', 'TUR', 'SRB', 'SWE', 'POL',
    'WAL', 'HUN', 'SCO', 'CZE', 'SVK', 'SVN', 'GRE', 'ROU', 'IRL', 'NIR', 'FIN', 'GEO', 'ALB', 'BIH', 'MKD', 'ISL', 'ISR', 'MNE', 'KOS', 'BUL', 'ARM', 'AZE', 'LUX', 'BLR']);
  const COLORS = { UKR: ['#ffd500', '#005bbb'], ENG: ['#ffffff', '#c8102e'], ESP: ['#c60b1e', '#ffc400'], ITA: ['#0066b3', '#ffffff'], GER: ['#ffffff', '#000000'],
    FRA: ['#002395', '#ffffff'], POR: ['#c8102e', '#046a38'], NED: ['#ff6600', '#ffffff'], BRA: ['#ffdf00', '#009c3b'], ARG: ['#75aadb', '#ffffff'], BEL: ['#e30613', '#000000'],
    CRO: ['#ffffff', '#ff0000'], TUR: ['#e30a17', '#ffffff'], POL: ['#ffffff', '#dc143c'] };

  /** Збірні, у яких у базі щонайменше 16 гравців: { код: [гравці від найкращого] }. */
  let cache = null; // на час одного розрахунку (турнір, вікно) склади не змінюються
  function cached(W, fn) { const prev = cache; cache = { W, pools: null, str: {} }; try { return fn(); } finally { cache = prev; } }
  function pools(W) {
    if (cache && cache.W === W && cache.pools) return cache.pools;
    const v = poolsRaw(W);
    if (cache && cache.W === W) cache.pools = v;
    return v;
  }
  function poolsRaw(W) {
    const by = {};
    for (const p of W.players.values()) if (p.club && !p.retired && p.nat) (by[p.nat] = by[p.nat] || []).push(p);
    const out = {};
    for (const [code, list] of Object.entries(by)) if (list.length >= 16 && list.filter((p) => p.roles[0] === 'GK').length >= 2) out[code] = list.sort((a, b) => b.ca - a.ca);
    return out;
  }
  /** Заявка: 23 гравці (3 воротарі), найкращі за рівнем; picks — ручний вибір тренера-людини. */
  function squad(W, code, picks) {
    const all = pools(W)[code] || [];
    if (picks && picks.length) return picks.map((id) => W.player(id)).filter((p) => p && p.club && !p.retired && !p.injury);
    const gk = all.filter((p) => p.roles[0] === 'GK' && !p.injury).slice(0, 3);
    const out = all.filter((p) => p.roles[0] !== 'GK' && !p.injury).slice(0, 20);
    return gk.concat(out);
  }
  const teamClub = (code) => ({ id: 'n-' + code, name: FM.countries ? FM.countries.name(code) : code, nameEn: code, code, colors: COLORS[code] || ['#cfd6d2', '#4b5a52'], league: null });
  const strength = (W, code) => {
    if (cache && cache.W === W && cache.str[code] != null) return cache.str[code];
    const v = strengthRaw(W, code);
    if (cache && cache.W === W) cache.str[code] = v;
    return v;
  };
  const strengthRaw = (W, code) => { const s = squad(W, code); const top = s.map((p) => p.ca).sort((a, b) => b - a).slice(0, 14); return top.reduce((x, y) => x + y, 0) / Math.max(1, top.length); };

  function side(W, code, picks) {
    const players = squad(W, code, picks);
    const formation = FM.bestFormation(players);
    return { club: teamClub(code), players, formation, lineup: FM.pickLineup(players, formation) };
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
    if (!WINDOWS.includes(S.week) || !pools(W).UKR) return [];
    const done = (state.intl = state.intl || {}).played || [];
    const out = [];
    const used = [];
    // сезон перед турніром — відбір: група з 4 команд, у кожне вікно — по два матчі
    const Q = qualGroup(W, state);
    if (Q) {
      const wi = WINDOWS.indexOf(S.week);
      const opp = Q.group.filter((c) => c !== 'UKR');
      const plan = [[opp[0], true], [opp[1], false], [opp[2], true], [opp[0], false], [opp[1], true], [opp[2], false]];
      for (let k = 0; k < 2; k++) {
        const [o, home] = plan[wi * 2 + k];
        const id = `${S.year}-${S.week}-${k}`;
        if (!done.some((x) => x.id === id)) out.push({ id, opp: o, home, qual: Q.year });
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
    st.played = (st.played || []).concat([{ id: fx.id, opp: fx.opp, home: fx.home, score: fx.home ? m.score : [m.score[1], m.score[0]], s: state.season.year, qual: fx.qual }]).slice(-40);
    for (const r of m.ratings) {
      if (r.injury) r.player.injury = Math.max(r.player.injury || 0, r.injury);
      if (r.cond != null) r.player.fitness = Math.min(r.player.fitness ?? 100, r.cond);
      if (r.team === (fx.home ? 0 : 1)) { r.player.caps = (r.player.caps || 0) + 1; r.player.intlGoals = (r.player.intlGoals || 0) + r.goals; }
    }
  }

  /** Тиждень вікна: збірна України (якщо не тренує людина — грає автоматично) й втома гравців інших збірних. */
  function weekly(W, state, opts = {}) {
    const S = state.season;
    if (!WINDOWS.includes(S.week)) return [];
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
    const Q = qualGroup(W, state);
    if (Q) {
      const wi = WINDOWS.indexOf(S.week), [, a, b, c] = Q.group;
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
  // ---------------- Турнір: покроково (щоб матчі України можна було грати наживо) ----------------
  /**
   * Створити турнір. ukr: 'in' — Україна кваліфікувалася, 'out' — ні, null — за силою.
   * T = { name, kind, year, seed, groups: [[коди]], gm: [{ g, a, b, s }], ko: [[{ a, b, s, w }]], winner, stage: { код: етап } }.
   */
  function createTournament(W, year, seed, ukr) {
    const t = tournamentFor(year);
    if (!t) return null;
    const R = FM.rng(`tour-${seed}-${year}`);
    let teams = Object.keys(pools(W)).filter((c) => t.kind === 'wc' || EUROPE.has(c)).sort((a, b) => strength(W, b) - strength(W, a));
    if (ukr === 'out') teams = teams.filter((c) => c !== 'UKR');
    teams = teams.slice(0, t.size);
    if (ukr === 'in' && !teams.includes('UKR')) { teams.pop(); teams.push('UKR'); }
    if (teams.length < 8) return null;
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
    return { name: t.name, kind: t.kind, year, seed, groups, gm, ko: [], winner: null, stage: {} };
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
    if (T.kind === 'euro') q = q.concat(tabs.map((t) => ({ ...t[2], k: 2 })).sort((a, b) => b.pts - a.pts || b.gd - a.gd).slice(0, Math.max(0, 16 - q.length)));
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
  const summary = (T) => ({ name: T.name, winner: T.winner, final: T.final, ukr: T.stage.UKR || (T.groups.some((g) => g.includes('UKR')) ? null : 'не кваліфікувалася'), stage: T.stage });
  /** Зіграти весь турнір автоматично (для збірної, яку не тренує людина). */
  function tournament(W, year, seed, ukr) {
    const T = createTournament(W, year, seed, ukr);
    if (!T) return null;
    playUntil(W, T, null);
    return summary(T);
  }

  FM.nations = { qualGroup, qualTable, createTournament, nextMatch, recordTour, groupTable, summary, WINDOWS, EUROPE, canCoach, pools, squad, side, teamClub, strength, record, playNations, tournamentFor,
    fixtures: (state, W) => cached(W, () => fixtures(state, W)),
    weekly: (W, state, opts) => cached(W, () => weekly(W, state, opts)),
    playUntil: (W, T, code, opts) => cached(W, () => playUntil(W, T, code, opts)),
    tournament: (W, year, seed, ukr) => cached(W, () => tournament(W, year, seed, ukr)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
