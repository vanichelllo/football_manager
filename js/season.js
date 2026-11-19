// Сезон: календар (кожен з кожним двічі), тури, таблиці, бомбардири, статистика гравців, дискваліфікації.
// Стан сезону — простий об'єкт, який зберігається в localStorage разом із кар'єрою.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const START = '2026-08-15'; // перша субота сезону

  /** Двоколовий календар методом кола; ліга з непарною кількістю отримала б «вихідний», але в нас усі парні. */
  function roundRobin(ids, R) {
    const t = ids.slice();
    for (let i = t.length - 1; i > 0; i--) { const j = R.int(i + 1); [t[i], t[j]] = [t[j], t[i]]; }
    const n = t.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const games = [];
      for (let i = 0; i < n / 2; i++) {
        let h = t[i], a = t[n - 1 - i];
        if (r % 2 === 1) [h, a] = [a, h]; // у непарних турах ряди міняються ролями: дім і виїзд чергуються
        games.push([h, a]);
      }
      rounds.push(games);
      t.splice(1, 0, t.pop()); // перший стоїть, решта обертається
    }
    return rounds.concat(rounds.map((g) => g.map(([h, a]) => [a, h])));
  }

  function create(W, seed) {
    const R = FM.rng('calendar-' + seed);
    const fixtures = [];
    for (const l of W.db.leagues) {
      const ids = W.db.clubs.filter((c) => c.league === l.id).map((c) => c.id);
      roundRobin(ids, R).forEach((games, r) => games.forEach(([h, a]) => {
        fixtures.push({ id: fixtures.length, l: l.id, w: r, h, a, s: null, g: null });
      }));
    }
    return { v: 1, seed: String(seed), week: 0, fixtures, ps: {}, bans: {}, yc: {} };
  }

  const weeks = (S) => 1 + Math.max(...S.fixtures.map((f) => f.w));
  const isOver = (S) => S.week >= weeks(S);
  const dateOf = (w) => {
    const d = new Date(START + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7 * w);
    return d.toISOString().slice(0, 10);
  };
  const fixturesOfWeek = (S, w) => S.fixtures.filter((f) => f.w === w);
  const clubFixtures = (S, clubId) => S.fixtures.filter((f) => f.h === clubId || f.a === clubId);
  const nextFixture = (S, clubId) => clubFixtures(S, clubId).find((f) => !f.s) || null;

  /** Гравці, які пропускають матч (червона або 5 жовтих). */
  const unavailable = (S, clubId, W) => new Set(W.club(clubId).players.filter((id) => S.bans[id]));

  function sideFor(S, W, clubId) {
    const players = W.squad(clubId);
    const out = unavailable(S, clubId, W);
    const available = players.filter((p) => !out.has(p.id));
    const formation = FM.bestFormation(available);
    return { club: W.club(clubId), players: available, formation, lineup: FM.pickLineup(available, formation) };
  }

  function play(S, W, f, name) {
    const hs = sideFor(S, W, f.h), as = sideFor(S, W, f.a);
    const m = FM.match.play({
      home: { club: { ...hs.club, name: name ? name.club(hs.club) : hs.club.name }, players: hs.players, formation: hs.formation, lineup: hs.lineup },
      away: { club: { ...as.club, name: name ? name.club(as.club) : as.club.name }, players: as.players, formation: as.formation, lineup: as.lineup },
      seed: `${S.seed}-${f.id}`, name: name ? name.player : undefined,
    });
    return { m, hs, as };
  }

  /** Записати результат матчу: рахунок, голи, статистику гравців, картки й дискваліфікації. */
  function record(S, f, m) {
    f.s = m.score.slice();
    f.sc = []; // [команда, автор]
    for (const r of m.ratings) {
      const st = (S.ps[r.id] = S.ps[r.id] || [0, 0, 0, 0, 0, 0]); // ігри, голи, паси, сума оцінок ×10, жовті, червоні
      st[0]++; st[1] += r.goals; st[2] += r.assists; st[3] += Math.round(r.rating * 10); st[4] += r.yellow; st[5] += r.red ? 1 : 0;
      for (let k = 0; k < r.goals; k++) f.sc.push([r.team, r.id]);
      // дискваліфікація: [скільки матчів, тиждень, коли отримав] — відбувається лише в наступних турах
      const ban = () => { const b = S.bans[r.id]; S.bans[r.id] = [(b ? b[0] : 0) + 1, f.w]; };
      if (r.red) ban();
      else if (r.yellow) {
        S.yc[r.id] = (S.yc[r.id] || 0) + r.yellow;
        if (S.yc[r.id] >= 5) { S.yc[r.id] -= 5; ban(); }
      }
    }
  }

  /**
   * Зіграти поточний тиждень. skip — id матчу, який уже записано (матч гравця з трансляцією).
   * Повертає список зіграних матчів тижня.
   */
  function playWeek(S, W, opts = {}) {
    const list = fixturesOfWeek(S, S.week);
    // дискваліфікації відбуваються в матчі, який пропущено: знімаємо після туру з тих клубів, що грали
    const playedClubs = new Set();
    // хто був дискваліфікований ще до цього туру — саме він пропустив матч
    const banned = Object.keys(S.bans).filter((id) => S.bans[id][1] < S.week);
    for (const f of list) {
      playedClubs.add(f.h); playedClubs.add(f.a);
      if (f.s) continue;
      const { m } = play(S, W, f, opts.name);
      record(S, f, m);
    }
    for (const id of banned) {
      const p = W.player(id);
      if (p && playedClubs.has(p.club) && S.bans[id]) { S.bans[id][0]--; if (S.bans[id][0] <= 0) delete S.bans[id]; }
    }
    S.week++;
    return list;
  }

  /** Турнірна таблиця: очки, різниця, забиті; форма — останні 5. */
  function table(S, W, leagueId) {
    const rows = new Map(W.db.clubs.filter((c) => c.league === leagueId).map((c) => [c.id, { id: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
    for (const f of S.fixtures) {
      if (f.l !== leagueId || !f.s) continue;
      const [hg, ag] = f.s, h = rows.get(f.h), a = rows.get(f.a);
      h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (hg < ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }
    const name = (id) => W.club(id).name;
    return [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || name(a.id).localeCompare(name(b.id), 'uk'));
  }

  /** Бомбардири (key = 1) або асистенти (key = 2) ліги. */
  function leaders(S, W, leagueId, key = 1, n = 10) {
    return Object.entries(S.ps)
      .map(([id, st]) => ({ id, st, p: W.player(id) }))
      .filter((x) => x.p && W.club(x.p.club).league === leagueId && x.st[key] > 0)
      .sort((a, b) => b.st[key] - a.st[key] || a.st[0] - b.st[0])
      .slice(0, n);
  }

  // Зони таблиці: єврокубки й виліт (формат 2026/27, спрощено)
  const ZONES = {
    eng: { ucl: 4, uel: 5, uecl: 6, rel: 3 }, esp: { ucl: 4, uel: 5, uecl: 6, rel: 3 }, ita: { ucl: 4, uel: 5, uecl: 6, rel: 3 },
    ger: { ucl: 4, uel: 5, uecl: 6, rel: 2, playoff: 1 }, fra: { ucl: 3, uel: 4, uecl: 5, rel: 2, playoff: 1 },
    ukr: { ucl: 1, uel: 2, uecl: 3, rel: 2, playoff: 2 },
  };
  function zone(leagueId, pos, size) {
    const z = ZONES[leagueId];
    if (pos <= z.ucl) return 'ucl';
    if (pos <= z.uel) return 'uel';
    if (pos <= z.uecl) return 'uecl';
    if (pos > size - z.rel) return 'rel';
    if (z.playoff && pos > size - z.rel - z.playoff) return 'playoff';
    return null;
  }

  FM.season = { create, weeks, isOver, dateOf, fixturesOfWeek, clubFixtures, nextFixture, sideFor, play, record, playWeek, table, leaders, zone, roundRobin };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
