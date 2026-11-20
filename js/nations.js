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
    for (let k = 0; k < 2; k++) {
      const id = `${S.year}-${S.week}-${k}`;
      const opp = opponent(W, 'UKR', `intl-${S.seed}-${id}`, used);
      used.push(opp);
      if (!done.some((x) => x.id === id)) out.push({ id, opp, home: k === 0 });
    }
    return out;
  }

  /** Записати матч збірної: втома й травми викликаних гравців. */
  function record(W, state, fx, m) {
    const st = (state.intl = state.intl || {});
    st.played = (st.played || []).concat([{ id: fx.id, opp: fx.opp, home: fx.home, score: fx.home ? m.score : [m.score[1], m.score[0]], s: state.season.year }]).slice(-40);
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
  /** Зіграти турнір: групи по 4, далі плей-оф. Повертає { name, winner, final, ukr: етап } або null. */
  function tournament(W, year, seed) {
    const t = tournamentFor(year);
    if (!t) return null;
    const R = FM.rng(`tour-${seed}-${year}`);
    let teams = Object.keys(pools(W)).filter((c) => t.kind === 'wc' || EUROPE.has(c)).sort((a, b) => strength(W, b) - strength(W, a)).slice(0, t.size);
    if (teams.length < 8) return null;
    while (teams.length % 4) teams.pop();
    // групи: кошики за силою
    const groups = [];
    const nG = teams.length / 4;
    for (let g = 0; g < nG; g++) groups.push([]);
    for (let pot = 0; pot < 4; pot++) {
      const potT = teams.slice(pot * nG, pot * nG + nG);
      for (let i = potT.length - 1; i > 0; i--) { const j = R.int(i + 1); [potT[i], potT[j]] = [potT[j], potT[i]]; }
      potT.forEach((c, g) => groups[g].push(c));
    }
    const stage = {};
    const table = groups.map((g, gi) => {
      const rows = new Map(g.map((c) => [c, { c, pts: 0, gd: 0, gf: 0 }]));
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const m = playNations(W, g[i], g[j], `tour-${seed}-${year}-g${gi}-${i}${j}`, { neutral: true });
        const [x, y] = m.score, a = rows.get(g[i]), b = rows.get(g[j]);
        a.gf += x; b.gf += y; a.gd += x - y; b.gd += y - x;
        if (x > y) a.pts += 3; else if (y > x) b.pts += 3; else { a.pts++; b.pts++; }
      }
      const sorted = [...rows.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      sorted.forEach((r, k) => { stage[r.c] = k < 2 ? null : 'груповий етап'; });
      return sorted;
    });
    let ko = table.flatMap((g) => g.slice(0, 2).map((r) => r.c));
    if (t.kind === 'euro') ko = ko.concat(table.map((g) => g[2]).sort((a, b) => b.pts - a.pts || b.gd - a.gd).slice(0, 16 - ko.length).map((r) => r.c));
    while (ko.length & (ko.length - 1)) ko.pop();
    for (const c of table.flatMap((g) => g.map((r) => r.c))) if (!ko.includes(c) && stage[c] == null) stage[c] = 'груповий етап';
    const names = { 16: '1/8 фіналу', 8: 'чвертьфінал', 4: 'півфінал', 2: 'фінал' };
    let round = ko, final = null;
    while (round.length > 1) {
      const next = [];
      for (let i = 0; i < round.length; i += 2) {
        const a = round[i], b = round[i + 1];
        const m = playNations(W, a, b, `tour-${seed}-${year}-k${round.length}-${i}`, { neutral: true });
        let win = m.score[0] > m.score[1] ? a : m.score[1] > m.score[0] ? b : (R.chance(0.5) ? a : b);
        const lose = win === a ? b : a;
        stage[lose] = names[round.length] || `1/${round.length / 2}`;
        if (round.length === 2) final = { a, b, score: m.score, winner: win };
        next.push(win);
      }
      round = next;
    }
    stage[round[0]] = 'переможець';
    return { name: t.name, winner: round[0], final, ukr: stage.UKR || (teams.includes('UKR') ? null : 'не кваліфікувалася'), stage };
  }

  FM.nations = { WINDOWS, EUROPE, canCoach, pools, squad, side, teamClub, strength, record, playNations, tournamentFor,
    fixtures: (state, W) => cached(W, () => fixtures(state, W)),
    weekly: (W, state, opts) => cached(W, () => weekly(W, state, opts)),
    tournament: (W, year, seed) => cached(W, () => tournament(W, year, seed)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
