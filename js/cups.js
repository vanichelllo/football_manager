// Кубки: національні (по одному на країну, клуби вищої ліги) і єврокубки між клубами шести ліг гри
// (спрощено: Ліга чемпіонів — 20 клубів, Ліга Європи — 12; пари з двох матчів, фінал — один матч).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const NAMES = {
    eng: 'Кубок Англії', esp: 'Кубок Іспанії', ita: 'Кубок Італії', ger: 'Кубок Німеччини', fra: 'Кубок Франції', ukr: 'Кубок України',
    ucl: 'Ліга чемпіонів', uel: 'Ліга Європи',
  };
  // Скільки клубів кожної ліги грає в єврокубках: [Ліга чемпіонів, Ліга Європи]
  const EURO_SPOTS = { eng: [4, 2], esp: [4, 2], ita: [4, 2], ger: [4, 2], fra: [3, 2], ukr: [1, 2] };
  // Тижні раундів (номер тижня сезону, з 0); дві цифри — два матчі пари
  const WEEKS = {
    domestic: [[4], [9], [15], [22], [30]],
    domesticUkr: [[4], [9], [15], [21], [27]],
    ucl: [[5, 6], [11, 12], [17, 18], [25, 26], [33]],
    uel: [[5, 6], [17, 18], [25, 26], [33]],
  };
  const ROUND_NAMES = { 2: 'Фінал', 4: 'Півфінал', 8: 'Чвертьфінал', 16: '1/8 фіналу' };
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
    const ucl = [], uel = [];
    for (const l of W.db.leagues) {
      const order = tables && tables[l.id] ? tables[l.id] : W.clubsOf(l.id).sort((a, b) => b.strength - a.strength).map((c) => c.id);
      const [a, b] = EURO_SPOTS[l.id];
      ucl.push(...order.slice(0, a));
      uel.push(...order.slice(a, a + b));
    }
    const lvl = (id) => W.clubLevel(id);
    return { ucl: ucl.sort((x, y) => lvl(y) - lvl(x)), uel: uel.sort((x, y) => lvl(y) - lvl(x)) };
  }

  /** Усі кубки сезону. tables — { ліга: [id клубів за місцями] } минулого сезону або null. */
  function createAll(W, S, tables) {
    const R = FM.rng(`cups-${S.seed}`);
    const cups = {};
    for (const l of W.db.leagues) {
      const teams = W.clubsOf(l.id).sort((a, b) => W.clubLevel(b.id) - W.clubLevel(a.id)).map((c) => c.id);
      cups[l.id] = create(l.id, teams, l.id === 'ukr' ? WEEKS.domesticUkr : WEEKS.domestic, R);
    }
    const q = euroQualifiers(W, tables);
    cups.ucl = create('ucl', q.ucl, WEEKS.ucl, R);
    cups.uel = create('uel', q.uel, WEEKS.uel, R);
    return cups;
  }

  // Призові (млн €): за участь і за кожен виграний раунд
  const PRIZE = { ucl: [18, 10], uel: [5, 3], eng: [0.3, 0.8], esp: [0.2, 0.5], ita: [0.2, 0.5], ger: [0.2, 0.6], fra: [0.1, 0.4], ukr: [0.02, 0.06] };

  function shootout(W, a, b, R) {
    const gk = (id) => Math.max(...W.squad(id).filter((p) => p.roles[0] === 'GK').map((p) => (p.attrs.ref || 8) + (p.attrs.one || 8)), 10);
    const p = 0.5 + (gk(a) - gk(b)) * 0.012;
    return R.chance(Math.max(0.3, Math.min(0.7, p))) ? a : b;
  }

  /**
   * Зіграти матчі кубків цього тижня. opts: { name, user, myClub }.
   * Повертає список зіграних матчів: [{ cup, round, a, b, score, pens?, winner?, mine }].
   */
  function playWeek(W, state, opts = {}) {
    const S = state.season, cups = state.cups;
    if (!cups) return [];
    const R = FM.rng(`cupweek-${S.seed}-${S.week}`);
    const played = [];
    for (const cup of Object.values(cups)) {
      if (cup.winner) continue;
      const ri = cup.rounds.findIndex((r) => r.weeks.includes(S.week));
      if (ri < 0) continue;
      const round = cup.rounds[ri];
      if (!round.ties) continue; // жеребкування ще не відбулося (не мало б статися)
      const leg = round.weeks.indexOf(S.week);
      const final = round.size === 2;
      for (const [ti, tie] of round.ties.entries()) {
        if (tie.winner) continue;
        const [h, a] = leg === 1 ? [tie.b, tie.a] : [tie.a, tie.b];
        const f = { id: `${cup.id}-${ri}-${ti}-${leg}`, h, a };
        const { opts: mo } = FM.season.prepare(S, W, f, opts.name, opts.user);
        if (final) mo.neutral = true;
        const m = FM.match.play(mo);
        for (const r of m.ratings) if (r.injury) r.player.injury = Math.max(r.player.injury || 0, r.injury);
        tie.legs.push(leg === 1 ? [m.score[1], m.score[0]] : m.score.slice()); // рахунок завжди з боку tie.a
        const entry = { cup: cup.id, cupName: cup.name, round: round.name, h, a, score: m.score, mine: h === state.clubId || a === state.clubId };
        const lastLeg = leg === round.weeks.length - 1;
        if (lastLeg) {
          const ga = tie.legs.reduce((s, x) => s + x[0], 0), gb = tie.legs.reduce((s, x) => s + x[1], 0);
          tie.winner = ga > gb ? tie.a : gb > ga ? tie.b : shootout(W, tie.a, tie.b, R);
          if (ga === gb) { tie.pens = true; entry.pens = true; }
          entry.winner = tie.winner;
          const pr = PRIZE[cup.id] || [0, 0];
          const wc = W.club(tie.winner);
          wc.balance = r2(wc.balance + pr[1]);
          if (tie.winner === state.clubId && state.board) state.board.fin.prize = r2((state.board.fin.prize || 0) + pr[1]);
        }
        played.push(entry);
      }
      // раунд завершено — жеребкування наступного
      if (round.ties.every((t) => t.winner)) {
        const winners = round.ties.map((t) => t.winner);
        if (final) { cup.winner = winners[0]; continue; }
        const next = ri + 1;
        const teams = round.byes ? round.byes.concat(winners) : winners;
        drawRound(cup, next, teams, R);
      }
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

  FM.cups = { create, createAll, euroQualifiers, playWeek, payParticipation, clubStatus, NAMES, EURO_SPOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
