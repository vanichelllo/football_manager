// Кубки: національні (по одному на країну, клуби вищої ліги) і єврокубки між клубами шести ліг гри
// (спрощено: Ліга чемпіонів — 20 клубів, Ліга Європи — 12; пари з двох матчів, фінал — один матч).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const NAMES = {
    eng: 'Кубок Англії', esp: 'Кубок Іспанії', ita: 'Кубок Італії', ger: 'Кубок Німеччини', fra: 'Кубок Франції', ukr: 'Кубок України',
    por: 'Кубок Португалії', ned: 'Кубок Нідерландів', tur: 'Кубок Туреччини', pol: 'Кубок Польщі',
    bel: 'Кубок Бельгії', sco: 'Кубок Шотландії', gre: 'Кубок Греції', cze: 'Кубок Чехії', den: 'Кубок Данії', aut: 'Кубок Австрії', sui: 'Кубок Швейцарії',
    ucl: 'Ліга чемпіонів', uel: 'Ліга Європи', uecl: 'Ліга конференцій',
  };
  // Місця в єврокубках: [Ліга чемпіонів, Ліга Європи, Ліга конференцій]. З усіма 17 вищими лігами — рівно по 36 клубів;
  // якщо ліг менше — скільки є (непарне число — найслабший вибуває).
  const EURO_SPOTS = {
    eng: [5, 2, 1], esp: [5, 2, 1], ita: [4, 3, 1], ger: [4, 3, 1], fra: [3, 3, 2], por: [2, 3, 2], ned: [2, 2, 3], ukr: [2, 2, 3],
    bel: [1, 3, 2], tur: [1, 3, 2], sco: [1, 2, 2], aut: [1, 2, 2], cze: [1, 2, 2], gre: [1, 1, 3], den: [1, 1, 3], sui: [1, 1, 3], pol: [1, 1, 3],
  };
  const EURO_LEAGUE_WEEKS = [5, 7, 9, 11, 14, 16, 18, 20];
  const EURO_KO_WEEKS = [[23, 24], [26, 27], [29, 30], [32, 33], [36]];
  // Тижні раундів (номер тижня сезону, з 0); дві цифри — два матчі пари
  const WEEKS = {
    domestic: [[4], [9], [15], [22], [30]],
    domesticUkr: [[4], [9], [15], [21], [27]],
    ucl: [[5, 6], [11, 12], [17, 18], [25, 26], [33]],
    uel: [[5, 6], [17, 18], [25, 26], [33]],
  };
  const ROUND_NAMES = { 2: 'Фінал', 4: 'Півфінал', 8: 'Чвертьфінал', 16: '1/8 фіналу', 32: '1/16 фіналу', 64: '1/32 фіналу' };
  const r2 = (x) => Math.round(x * 100) / 100;

  /**
   * Сітка на виліт. teams — id клубів від найсильнішого. Якщо їх не степінь двійки — стиковий раунд для найслабших.
   */
  function create(id, teams, weeks, R) {
    let P = 1;
    while (P * 2 <= teams.length) P *= 2;
    const rounds = [];
    const extra = teams.length - P;
    const playIn = extra > 0 ? teams.slice(teams.length - 2 * extra) : [];
    const byes = teams.slice(0, teams.length - 2 * extra);
    let wi = 0;
    if (extra > 0) {
      const pool = playIn.slice();
      const ties = [];
      while (pool.length) { const a = pool.splice(R.int(pool.length), 1)[0]; const b = pool.splice(R.int(pool.length), 1)[0]; ties.push({ a, b, legs: [], winner: null }); }
      rounds.push({ name: 'Стиковий раунд', weeks: weeks[wi++], ties, byes });
    }
    // наступні раунди заповнюються, коли відомі переможці
    for (let n = P; n >= 2; n /= 2) rounds.push({ name: ROUND_NAMES[n] || `1/${n / 2} фіналу`, weeks: weeks[wi++] || [weeks[weeks.length - 1][0]], ties: null, size: n });
    const cup = { id, name: NAMES[id] || id, rounds, teams: teams.slice(), winner: null };
    if (!extra) drawRound(cup, 0, teams, R);
    return cup;
  }

  function drawRound(cup, ri, teams, R) {
    const pool = teams.slice();
    const ties = [];
    while (pool.length > 1) { const a = pool.splice(R.int(pool.length), 1)[0]; const b = pool.splice(R.int(pool.length), 1)[0]; ties.push({ a, b, legs: [], winner: null }); }
    cup.rounds[ri].ties = ties;
  }

  /** Учасники єврокубків: з таблиць минулого сезону, а в першому — за силою клубів у минулих сезонах (strength). */
  function euroQualifiers(W, tables) {
    const ucl = [], uel = [], uecl = [];
    for (const l of W.db.leagues) {
      if ((l.tier || 1) !== 1 || !EURO_SPOTS[l.id]) continue;
      // таблиця минулого сезону — лише клуби, що й досі в цій лізі (хто вилетів, у єврокубки не йде)
      const order = (tables && tables[l.id] ? tables[l.id] : W.clubsOf(l.id).sort((a, b) => b.strength - a.strength).map((c) => c.id)).filter((id) => W.club(id));
      const [a, b, c = 0] = EURO_SPOTS[l.id];
      ucl.push(...order.slice(0, a));
      uel.push(...order.slice(a, a + b));
      uecl.push(...order.slice(a + b, a + b + c));
    }
    const lvl = (id) => W.clubLevel(id);
    const even = (list) => { const s = list.sort((x, y) => lvl(y) - lvl(x)); if (s.length % 2) s.pop(); return s; }; // етап ліги — парна кількість
    return { ucl: even(ucl), uel: even(uel), uecl: even(uecl) };
  }

  /** Тижні раундів кубка країни: рівномірно між 4-м і 30-м тижнем (УПЛ — до 27-го). */
  function domesticWeeks(nRounds, last) {
    const out = [];
    for (let i = 0; i < nRounds; i++) out.push([Math.round(4 + (i * (last - 4)) / Math.max(1, nRounds - 1))]);
    return out;
  }
  function roundsFor(n) { let P = 1; while (P * 2 <= n) P *= 2; return Math.log2(P) + (n > P ? 1 : 0); }

  /** Усі кубки сезону. tables — { ліга: [id клубів за місцями] } минулого сезону або null. */
  function createAll(W, S, tables) {
    const R = FM.rng(`cups-${S.seed}`);
    const cups = {};
    for (const l of W.db.leagues) {
      if ((l.tier || 1) !== 1) continue;
      // кубок країни: вища ліга + другий дивізіон тієї ж країни
      const lower = W.db.leagues.filter((x) => x.up === l.id).map((x) => x.id);
      const teams = [...W.clubs.values()].filter((c) => c.league === l.id || lower.includes(c.league))
        .sort((a, b) => W.clubLevel(b.id) - W.clubLevel(a.id)).map((c) => c.id);
      cups[l.id] = create(l.id, teams, domesticWeeks(roundsFor(teams.length), l.id === 'ukr' ? 27 : 30), R);
    }
    const q = euroQualifiers(W, tables);
    cups.ucl = createEuro('ucl', q.ucl, W, R);
    cups.uel = createEuro('uel', q.uel, W, R);
    if (q.uecl.length >= 8) cups.uecl = createEuro('uecl', q.uecl, W, R);
    return cups;
  }

  // ---------------- Єврокубки: етап ліги (36 клубів, 8 турів) ----------------
  /** Пари етапу ліги: 8 турів, кожен — 4 вдома й 4 на виїзді, без повторів і без суперників зі своєї країни. */
  function leaguePhase(teams, W, R) {
    const country = (id) => W.club(id).league.replace(/2$/, '');
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = R.int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const nR = Math.min(8, teams.length - 1);
    let rounds = null;
    for (let attempt = 0; attempt < 60 && !rounds; attempt++) {
      const met = new Set();
      const out = [];
      let strict = attempt < 40; // спершу — без суперників зі своєї країни
      for (let r = 0; r < nR; r++) {
        // пошук досконалого паросполучення з поверненням (обмеження кроків)
        let steps = 0;
        const pairs = [];
        const free = new Set(teams);
        const dfs = () => {
          if (!free.size) return true;
          if (++steps > 4000) return false;
          const a = [...free][0];
          free.delete(a);
          for (const b of shuffle([...free].filter((x) => !met.has(a + '|' + x) && (!strict || country(a) !== country(x))))) {
            free.delete(b); pairs.push([a, b]);
            if (dfs()) return true;
            pairs.pop(); free.add(b);
          }
          free.add(a);
          return false;
        };
        if (teams.length % 2 || !dfs()) { out.length = 0; break; }
        for (const [x, y] of pairs) { met.add(x + '|' + y); met.add(y + '|' + x); }
        out.push(pairs);
      }
      if (out.length === nR) rounds = out;
    }
    if (!rounds) { // запасний варіант: просте коло
      rounds = [];
      const t = teams.slice();
      for (let r = 0; r < nR; r++) { const g = []; for (let i = 0; i < t.length / 2; i++) g.push([t[i], t[t.length - 1 - i]]); rounds.push(g); t.splice(1, 0, t.pop()); }
    }
    // дім і виїзд: орієнтація за ейлеровим циклом — у кожного рівно половина матчів удома
    const adj = new Map(teams.map((t) => [t, []]));
    const edges = [];
    rounds.forEach((g, r) => g.forEach(([x, y], i) => { const e = { x, y, r, i, used: false }; edges.push(e); adj.get(x).push(e); adj.get(y).push(e); }));
    const ptr = new Map(teams.map((t) => [t, 0]));
    for (const start of teams) {
      const stack = [start];
      while (stack.length) {
        const v = stack[stack.length - 1], list = adj.get(v);
        let k = ptr.get(v);
        while (k < list.length && list[k].used) k++;
        ptr.set(v, k);
        if (k === list.length) { stack.pop(); continue; }
        const e = list[k]; e.used = true;
        const to = e.x === v ? e.y : e.x;
        rounds[e.r][e.i] = [v, to];
        stack.push(to);
      }
    }
    return rounds;
  }

  function createEuro(id, teams, W, R) {
    const rounds = leaguePhase(teams, W, R);
    const fixtures = [];
    rounds.forEach((games, r) => games.forEach(([h, a]) => fixtures.push({ r, w: EURO_LEAGUE_WEEKS[r], h, a, s: null })));
    const ko = [
      { name: 'Стикові матчі', weeks: EURO_KO_WEEKS[0], ties: null, size: 32 },
      { name: '1/8 фіналу', weeks: EURO_KO_WEEKS[1], ties: null, size: 16 },
      { name: 'Чвертьфінал', weeks: EURO_KO_WEEKS[2], ties: null, size: 8 },
      { name: 'Півфінал', weeks: EURO_KO_WEEKS[3], ties: null, size: 4 },
      { name: 'Фінал', weeks: EURO_KO_WEEKS[4], ties: null, size: 2 },
    ];
    return { id, name: NAMES[id], teams: teams.slice(), phase: { fixtures }, rounds: ko, winner: null };
  }

  /** Таблиця етапу ліги. */
  function phaseTable(cup) {
    const rows = new Map(cup.teams.map((t) => [t, { id: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
    for (const f of cup.phase.fixtures) {
      if (!f.s) continue;
      const h = rows.get(f.h), a = rows.get(f.a), [x, y] = f.s;
      h.p++; a.p++; h.gf += x; h.ga += y; a.gf += y; a.ga += x;
      if (x > y) { h.w++; a.l++; h.pts += 3; } else if (x < y) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
    }
    return [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }
  /** Етап ліги завершено: 1–8 — одразу в 1/8 фіналу, 9–24 — стикові пари (9–24, 10–23, …), 25+ — вибувають. */
  function seedKnockout(cup) {
    if (cup.rounds[0].ties || cup.phase.fixtures.some((f) => !f.s)) return;
    const t = phaseTable(cup).map((r) => r.id);
    if (t.length < 24) { // замало клубів для стикових: перша шістнадцятка — одразу в 1/8 фіналу (1–16, 2–15, …)
      cup.rounds[0].ties = []; cup.rounds[0].skipped = true;
      const top = t.slice(0, 16);
      cup.rounds[1].ties = top.slice(0, 8).map((x, i) => ({ a: top[15 - i], b: x, legs: [], winner: null })).filter((x) => x.a && x.b);
      cup.phase.done = true;
      return;
    }
    const top8 = t.slice(0, 8), mid = t.slice(8, 24);
    cup.rounds[0].ties = [];
    for (let i = 0; i < mid.length / 2; i++) cup.rounds[0].ties.push({ a: mid[i], b: mid[mid.length - 1 - i], legs: [], winner: null });
    cup.rounds[0].byes = top8;
    cup.phase.done = true;
  }

  // Призові (млн €): за участь і за кожен виграний раунд
  const PRIZE = { ucl: [18, 10, 2.1], uel: [5, 3, 0.5], uecl: [2.5, 1.5, 0.25], bel: [0.05, 0.1], sco: [0.05, 0.1], gre: [0.05, 0.1], cze: [0.03, 0.08],
    den: [0.04, 0.08], aut: [0.04, 0.08], sui: [0.05, 0.1], eng: [0.3, 0.8], esp: [0.2, 0.5], ita: [0.2, 0.5], ger: [0.2, 0.6], fra: [0.1, 0.4], ukr: [0.02, 0.06],
    por: [0.1, 0.2], ned: [0.1, 0.2], tur: [0.1, 0.2], pol: [0.03, 0.08] }; // [участь, раунд, перемога в етапі ліги]

  function shootout(W, a, b, R) {
    const gk = (id) => Math.max(...W.squad(id).filter((p) => p.roles[0] === 'GK').map((p) => (p.attrs.ref || 8) + (p.attrs.one || 8)), 10);
    const p = 0.5 + (gk(a) - gk(b)) * 0.012;
    return R.chance(Math.max(0.3, Math.min(0.7, p))) ? a : b;
  }

  /** Рахунок пари з боку tie.a після матчу leg (h — господарі цього матчу). */
  function applyLeg(W, state, cup, ri, ti, leg, m) {
    const round = cup.rounds[ri], tie = round.ties[ti];
    const [h, a] = leg === 1 ? [tie.b, tie.a] : [tie.a, tie.b];
    for (const r of m.ratings) {
      if (r.injury) r.player.injury = Math.max(r.player.injury || 0, r.injury);
      if (r.cond != null) r.player.fitness = r.cond; // свіжість після кубкового матчу
    }
    tie.legs.push(leg === 1 ? [m.score[1], m.score[0]] : m.score.slice());
    const entry = { cup: cup.id, cupName: cup.name, round: round.name, h, a, score: m.score, mine: h === state.clubId || a === state.clubId };
    if (leg === round.weeks.length - 1) {
      const ga = tie.legs.reduce((x, y) => x + y[0], 0), gb = tie.legs.reduce((x, y) => x + y[1], 0);
      const R = FM.rng(`pens-${state.season.seed}-${cup.id}-${ri}-${ti}`);
      tie.winner = ga > gb ? tie.a : gb > ga ? tie.b : shootout(W, tie.a, tie.b, R);
      if (ga === gb) { tie.pens = true; entry.pens = true; }
      entry.winner = tie.winner;
      const pr = PRIZE[cup.id] || [0, 0];
      const wc = W.club(tie.winner);
      wc.balance = r2(wc.balance + pr[1]);
      if (tie.winner === state.clubId && state.board) state.board.fin.prize = r2((state.board.fin.prize || 0) + pr[1]);
    }
    return entry;
  }

  /** Раунд завершено — визначити переможця кубка або провести жеребкування наступного раунду. */
  function advanceRound(cup, ri, state) {
    const round = cup.rounds[ri];
    if (!round.ties.every((t) => t.winner)) return;
    const winners = round.ties.map((t) => t.winner);
    if (round.size === 2) { cup.winner = winners[0]; return; }
    if (cup.rounds[ri + 1].ties) return;
    if (cup.phase && ri === 0) { // 1/8 фіналу: переможці стикових проти 1–8 етапу ліги
      const R = FM.rng(`draw-${state.season.seed}-${cup.id}-${ri}`);
      const pool = winners.slice();
      cup.rounds[1].ties = round.byes.map((b) => ({ a: pool.splice(R.int(pool.length), 1)[0], b, legs: [], winner: null })); // сіяний — другий матч удома
      return;
    }
    drawRound(cup, ri + 1, round.byes ? round.byes.concat(winners) : winners, FM.rng(`draw-${state.season.seed}-${cup.id}-${ri}`));
  }

  /** Пара людини цього тижня, яку ще не зіграно: { cup, ri, ti, leg, f, neutral } або null. */
  function pendingTie(state, clubId) {
    const S = state.season;
    for (const cup of Object.values(state.cups || {})) {
      if (cup.winner) continue;
      if (cup.phase && !cup.phase.done) {
        const fi = cup.phase.fixtures.findIndex((f) => f.w === S.week && !f.s && (f.h === clubId || f.a === clubId));
        if (fi >= 0) {
          const f = cup.phase.fixtures[fi];
          return { cup, phaseFix: fi, round: { name: `Етап ліги, ${f.r + 1}-й тур`, weeks: [S.week], size: 0 }, tie: { legs: [] }, leg: 0, neutral: false, f: { id: `${cup.id}-L-${fi}`, h: f.h, a: f.a } };
        }
        continue;
      }
      const ri = cup.rounds.findIndex((r) => r.weeks.includes(S.week));
      if (ri < 0 || !cup.rounds[ri].ties) continue;
      const round = cup.rounds[ri], leg = round.weeks.indexOf(S.week);
      const ti = round.ties.findIndex((t) => (t.a === clubId || t.b === clubId) && !t.winner && t.legs.length === leg);
      if (ti < 0) continue;
      const tie = round.ties[ti];
      const [h, a] = leg === 1 ? [tie.b, tie.a] : [tie.a, tie.b];
      return { cup, ri, ti, leg, round, tie, neutral: round.size === 2, f: { id: `${cup.id}-${ri}-${ti}-${leg}`, h, a } };
    }
    return null;
  }

  /** Записати результат пари людини, зіграної наживо. */
  function finishPending(W, state, pend, m) {
    if (pend.phaseFix != null) return applyPhase(W, state, pend.cup, pend.phaseFix, m);
    const entry = applyLeg(W, state, pend.cup, pend.ri, pend.ti, pend.leg, m);
    advanceRound(pend.cup, pend.ri, state);
    return entry;
  }

  /**
   * Зіграти матчі кубків цього тижня. opts: { name, user, gen, skipClub } — пару клубу skipClub не грати (її зіграють наживо).
   * Повертає список зіграних матчів: [{ cup, round, h, a, score, pens?, winner?, mine }].
   */
  /** Записати матч етапу ліги. */
  function applyPhase(W, state, cup, fi, m) {
    const f = cup.phase.fixtures[fi];
    for (const r of m.ratings) {
      if (r.injury) r.player.injury = Math.max(r.player.injury || 0, r.injury);
      if (r.cond != null) r.player.fitness = r.cond;
    }
    f.s = m.score.slice();
    const pr = PRIZE[cup.id];
    const win = f.s[0] > f.s[1] ? f.h : f.s[1] > f.s[0] ? f.a : null;
    if (win && pr[2]) { W.club(win).balance = r2(W.club(win).balance + pr[2]); if (win === state.clubId && state.board) state.board.fin.prize = r2((state.board.fin.prize || 0) + pr[2]); }
    seedKnockout(cup);
    return { cup: cup.id, cupName: cup.name, round: `етап ліги, ${f.r + 1}-й тур`, h: f.h, a: f.a, score: m.score, mine: f.h === state.clubId || f.a === state.clubId };
  }

  function playWeek(W, state, opts = {}) {
    const S = state.season, cups = state.cups;
    if (!cups) return [];
    const played = [];
    for (const cup of Object.values(cups)) {
      if (cup.winner) continue;
      if (cup.phase && !cup.phase.done) {
        cup.phase.fixtures.forEach((f, fi) => {
          if (f.w !== S.week || f.s) return;
          if (opts.skipClub && (f.h === opts.skipClub || f.a === opts.skipClub)) return;
          const { opts: mo } = FM.season.prepare(S, W, { id: `${cup.id}-L-${fi}`, h: f.h, a: f.a }, opts.name, opts.user);
          mo.gen = opts.gen;
          played.push(applyPhase(W, state, cup, fi, FM.match.play(mo)));
        });
        continue;
      }
      const ri = cup.rounds.findIndex((r) => r.weeks.includes(S.week));
      if (ri < 0 || !cup.rounds[ri].ties) continue;
      const round = cup.rounds[ri];
      const leg = round.weeks.indexOf(S.week);
      for (const [ti, tie] of round.ties.entries()) {
        if (tie.winner || tie.legs.length !== leg) continue;
        if (opts.skipClub && (tie.a === opts.skipClub || tie.b === opts.skipClub)) continue;
        const [h, a] = leg === 1 ? [tie.b, tie.a] : [tie.a, tie.b];
        const f = { id: `${cup.id}-${ri}-${ti}-${leg}`, h, a };
        const { opts: mo } = FM.season.prepare(S, W, f, opts.name, opts.user);
        if (round.size === 2) mo.neutral = true;
        mo.gen = opts.gen;
        played.push(applyLeg(W, state, cup, ri, ti, leg, FM.match.play(mo)));
      }
      advanceRound(cup, ri, state);
    }
    return played;
  }

  /** Призові за участь (на початку сезону). */
  function payParticipation(W, state) {
    for (const cup of Object.values(state.cups)) {
      const pr = PRIZE[cup.id] || [0, 0];
      for (const id of cup.teams) {
        const c = W.club(id);
        c.balance = r2(c.balance + pr[0]);
        if (id === state.clubId && state.board) state.board.fin.prize = r2((state.board.fin.prize || 0) + pr[0]);
      }
    }
  }

  /** Кубки, де клуб ще бореться, і його найближчий матч. */
  function clubStatus(state, clubId) {
    const out = [];
    for (const cup of Object.values(state.cups || {})) {
      if (!cup.teams.includes(clubId)) continue;
      let status = null;
      if (cup.phase && !cup.phase.done) {
        const t = phaseTable(cup), pos = t.findIndex((r) => r.id === clubId) + 1;
        out.push({ cup, phasePos: pos, round: { name: `етап ліги, ${pos}-е місце`, weeks: [] } });
        continue;
      }
      if (cup.phase && cup.phase.done && !cup.rounds[0].ties.some((t) => t.a === clubId || t.b === clubId) && !(cup.rounds[0].byes || []).includes(clubId)) {
        out.push({ cup, out: 'етап ліги' }); continue;
      }
      for (const r of cup.rounds) {
        if (!r.ties) { if (r.byes && r.byes.includes(clubId)) continue; break; }
        const t = r.ties.find((x) => x.a === clubId || x.b === clubId);
        if (r.byes && r.byes.includes(clubId)) continue;
        if (!t) break;
        if (!t.winner) { status = { cup, round: r, tie: t }; break; }
        if (t.winner !== clubId) { status = { cup, out: r.name }; break; }
      }
      if (cup.winner === clubId) status = { cup, won: true };
      out.push(status || { cup });
    }
    return out;
  }

  // зони таблиці вищих ліг — за квотами єврокубків
  if (FM.season && FM.season.ZONES) for (const [id, [a, b, c = 0]] of Object.entries(EURO_SPOTS)) {
    const z = (FM.season.ZONES[id] = FM.season.ZONES[id] || { rel: 2 });
    z.ucl = a; z.uel = a + b; z.uecl = a + b + c;
  }

  FM.cups = { phaseTable, leaguePhase, pendingTie, finishPending, create, createAll, euroQualifiers, playWeek, payParticipation, clubStatus, NAMES, EURO_SPOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
