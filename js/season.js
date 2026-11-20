// Сезон: календар (кожен з кожним двічі), тури, таблиці, бомбардири, статистика гравців, дискваліфікації.
// Стан сезону — простий об'єкт, який зберігається в localStorage разом із кар'єрою.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  if (!FM.cal && typeof require === 'function') require('./calendar.js');

  /** Перша субота сезону: не раніше 9 серпня року, у якому починається сезон. */
  function firstSaturday(year) {
    const d = new Date(Date.UTC(year, 7, 9, 12));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

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

  const SEASON_WEEKS = 38;
  /**
   * Новий сезон за реальним календарем (js/calendar.js): передсезоння з липня, свої дати старту й фінішу кожної ліги,
   * вікна збірних, зимові перерви, тури посеред тижня (f.mid — вівторок). opts.legacy — старий календар (38 тижнів поспіль).
   */
  function create(W, seed, opts = {}) {
    const R = FM.rng('calendar-' + seed);
    const fixtures = [];
    const year = Number(String(W.today).slice(0, 4));
    const byLeague = {};
    for (const l of W.db.leagues) byLeague[l.id] = roundRobin([...W.clubs.values()].filter((c) => c.league === l.id).map((c) => c.id), R);
    const cal = opts.legacy ? null : FM.cal.build(year, Object.fromEntries(Object.entries(byLeague).map(([id, r]) => [id, r.length])));
    for (const l of W.db.leagues) {
      const rounds = byLeague[l.id];
      // старий календар: ліга з більш ніж 38 турами грає два тури за тиждень
      const legacyWeek = (r) => (rounds.length <= SEASON_WEEKS ? r : Math.floor((r * SEASON_WEEKS) / rounds.length));
      rounds.forEach((games, r) => games.forEach(([h, a]) => {
        const m = cal ? cal.plan[l.id][r] : { w: legacyWeek(r), mid: 0 };
        fixtures.push({ id: fixtures.length, l: l.id, r, w: m.w, ...(m.mid ? { mid: 1 } : {}), h, a, s: null, g: null });
      }));
    }
    if (cal) delete cal.plan; // тури вже в fixtures
    return { v: cal ? 2 : 1, seed: String(seed), year, start: cal ? cal.start : firstSaturday(year), week: 0, fixtures, ps: {}, bans: {}, yc: {}, ...(cal ? { cal } : {}) };
  }

  const weeks = (S) => (S.cal ? S.cal.total : 1 + Math.max(...S.fixtures.map((f) => f.w)));
  const isOver = (S) => S.week >= weeks(S);
  const dateOf = (w, S) => {
    const d = new Date(((S && S.start) || firstSaturday(2026)) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7 * w);
    return d.toISOString().slice(0, 10);
  };
  const fixturesOfWeek = (S, w) => S.fixtures.filter((f) => f.w === w);
  const clubFixtures = (S, clubId) => S.fixtures.filter((f) => f.h === clubId || f.a === clubId);
  const nextFixture = (S, clubId) => clubFixtures(S, clubId).find((f) => !f.s) || null;

  /** Гравці, які пропускають матч (червона або 5 жовтих). */
  /** Хто не може грати: дискваліфіковані й травмовані. */
  const unavailable = (S, clubId, W) => new Set(W.club(clubId).players.filter((id) => S.bans[id] || W.player(id).injury > 0));

  /**
   * Склад і тактика клубу на матч. user — { clubId, tactics } гравця-людини: його склад береться з тактики.
   * Суперники обирають ментальність за співвідношенням сил.
   */
  function sideFor(S, W, clubId, user, oppId, home) {
    if (Array.isArray(user)) user = user.find((u) => u && u.clubId === clubId) || null; // гра на двох: тренер саме цього клубу
    let players = W.squad(clubId);
    if (user && user.clubId === clubId && user.reserve && user.reserve.size) { // молодіжна команда — не в заявці основи
      const first = players.filter((p) => !user.reserve.has(p.id));
      if (first.length >= 16) players = first;
    }
    const out = unavailable(S, clubId, W);
    const available = players.filter((p) => !out.has(p.id));
    // замало здорових — грають ті, кому лишилося лікуватися найменше (дискваліфіковані — ні)
    if (available.length < 11) available.push(...players.filter((p) => out.has(p.id) && !(S.bans[p.id] && S.bans[p.id][0] > 0)).sort((a, b) => (a.injury || 0) - (b.injury || 0)).slice(0, 11 - available.length));
    if (available.length < 11) available.push(...players.filter((p) => !available.includes(p)).slice(0, 11 - available.length)); // крайній випадок
    // криза: здорових замало — у заявку йдуть ті, хто травмований найлегше
    if (available.length < 14) {
      const extra = players.filter((p) => out.has(p.id) && !S.bans[p.id]).sort((a, b) => (a.injury || 0) - (b.injury || 0));
      available.push(...extra.slice(0, 14 - available.length));
    }
    if (user && user.clubId === clubId && user.tactics) {
      const t = user.tactics;
      const lineup = FM.lineupFromIds(available, t.formation, t.ids, t);
      return { club: W.club(clubId), players: available, formation: t.formation, lineup, mentality: t.mentality, pressing: t.pressing, passing: t.passing, takers: t.takers || {}, setp: t.setp, oppi: t.oppi,
        familiarity: user.familiarity ? Math.min(1, (user.familiarity[t.formation] || 0) / 100) : 1, boost: user.boost || 1 };
    }
    // ШІ дає відпочити втомленим (свіжість < 72), якщо є кому їх замінити
    const fresh = available.filter((p) => (p.fitness ?? 100) >= 72);
    const pool = fresh.length >= 15 && fresh.filter((p) => p.roles[0] === 'GK').length ? fresh : available;
    const formation = FM.bestFormation(pool);
    let mentality = 'balanced';
    if (oppId) {
      const diff = W.clubLevel(clubId) - W.clubLevel(oppId) + (home ? 3 : -3);
      mentality = diff > 12 ? 'attacking' : diff > 5 ? 'positive' : diff < -12 ? 'defensive' : diff < -5 ? 'cautious' : 'balanced';
    }
    const st = FM.club ? FM.club.aiStyle(W.club(clubId), mentality) : { mentality }; // стиль тренера ШІ
    return { club: W.club(clubId), players: available, formation, lineup: FM.pickLineup(pool, formation), mentality: st.mentality, pressing: st.pressing, passing: st.passing };
  }

  /** Параметри матчу для двигуна (FM.match.create або play). */
  function prepare(S, W, f, name, user) {
    const hs = sideFor(S, W, f.h, user, f.a, true), as = sideFor(S, W, f.a, user, f.h, false);
    const side = (x) => ({ club: { ...x.club, name: name ? name.club(x.club) : x.club.name }, players: x.players, formation: x.formation,
      lineup: x.lineup, mentality: x.mentality, pressing: x.pressing, passing: x.passing, takers: x.takers, setp: x.setp, oppi: x.oppi, familiarity: x.familiarity, boost: x.boost });
    // погода — за датою й країною господарів (детерміновано для матчу)
    const weather = FM.weatherFor ? FM.weatherFor(dateOf(f.w != null ? f.w : S.week, S), W.club(f.h).league, FM.rng(`wx-${S.seed}-${f.id}`)) : null;
    const derby = FM.rivals ? FM.rivals.derby(W, f.h, f.a) : null;
    return { hs, as, opts: { home: side(hs), away: side(as), seed: `${S.seed}-${f.id}`, name: name ? name.player : undefined, gen: name ? name.gen : undefined, weather, derby, big: !!derby } };
  }

  function play(S, W, f, name, user) {
    const { hs, as, opts } = prepare(S, W, f, name, user);
    return { m: FM.match.play(opts), hs, as };
  }

  /** Записати результат матчу: рахунок, голи, статистику гравців, картки й дискваліфікації. */
  function record(S, f, m) {
    f.s = m.score.slice();
    if (m.ownGoals && (m.ownGoals[0] || m.ownGoals[1])) f.og = m.ownGoals.slice(); // автоголи — не в статистиці гравців
    // хвилини голів: [команда, хвилина] — для рахунків інших матчів під час трансляції
    const gm = (m.events || []).filter((e) => e.type === 'goal').map((e) => [e.team, Math.min(120, parseInt(String(e.min), 10) + (String(e.min).includes('+') ? Number(String(e.min).split('+')[1]) : 0))]);
    if (gm.length) f.gm = gm;
    if (FM.morale) FM.morale.recordRatings(m);
    f.sc = []; // [команда, автор]
    for (const r of m.ratings) {
      const st = (S.ps[r.id] = S.ps[r.id] || [0, 0, 0, 0, 0, 0]); // ігри, голи, паси, сума оцінок ×10, жовті, червоні
      st[0]++; st[1] += r.goals; st[2] += r.assists; st[3] += Math.round(r.rating * 10); st[4] += r.yellow; st[5] += r.red ? 1 : 0;
      for (let k = 0; k < r.goals; k++) f.sc.push([r.team, r.id]);
      // дискваліфікація: [скільки матчів, тиждень, коли отримав] — відбувається лише в наступних турах
      const ban = () => { const b = S.bans[r.id]; S.bans[r.id] = [(b ? b[0] : 0) + 1, f.w]; };
      if (r.injury) r.player.injury = Math.max(r.player.injury || 0, r.injury);
      if (r.cond != null) r.player.fitness = r.cond;
      // форма: оцінки за 5 останніх матчів
      r.player.form = (r.player.form || []).concat([r.rating]).slice(-5);
      // освоєння нової позиції: зіграв на ній щонайменше тайм
      const mins = (r.off || 93) - (r.on || 0);
      if (mins >= 45 && r.role !== 'GK' && !r.player.roles.includes(r.role)) {
        const p = r.player, ada = (p.h && p.h.ada) || 10;
        p.posExp = p.posExp || {};
        p.posExp[r.role] = Math.min(100, (p.posExp[r.role] || 0) + 3 + ada * 0.25);
        if (p.posExp[r.role] >= 100) { p.roles.push(r.role); delete p.posExp[r.role]; p.learned = (p.learned || []).concat([r.role]); }
      }
      if (r.red) ban();
      else if (r.yellow) {
        S.yc[r.id] = (S.yc[r.id] || 0) + r.yellow;
        if (S.yc[r.id] >= 5) { S.yc[r.id] -= 5; ban(); }
      }
    }
  }

  /** Зіграти всі ще не зіграні матчі поточного тижня, крім skip (матч людини, який вона грає наживо). opts.midOnly — лише тури посеред тижня. */
  function playOthers(S, W, opts = {}) {
    const skip = new Set([].concat(opts.skip ?? [])); // один матч або кілька (гра на двох)
    const list = fixturesOfWeek(S, S.week).filter((f) => !f.s && !skip.has(f.id));
    const mids = list.filter((f) => f.mid);
    for (const f of mids) record(S, f, play(S, W, f, opts.name, opts.user).m);
    if (mids.length) midRecover(W, mids); // між вівторком і суботою гравці трохи відновлюються
    if (opts.midOnly) return;
    for (const f of list) if (!f.mid && !f.s) record(S, f, play(S, W, f, opts.name, opts.user).m);
  }
  /** Відновлення свіжості між туром посеред тижня і суботою (пів тижня). */
  function midRecover(W, fixtures) {
    const clubs = new Set(fixtures.flatMap((f) => [f.h, f.a]));
    for (const c of clubs) for (const id of W.club(c).players) {
      const p = W.player(id);
      if (p && p.fitness != null) { p.fitness = Math.min(100, p.fitness + 11 + (p.attrs.sta || 10) * 0.3); if (p.fitness >= 100) delete p.fitness; }
    }
  }
  /** Дата дня тижня (0 — неділя … 6 — субота) тижня w. */
  function dayDate(S, w, day) {
    const d = new Date(dateOf(w, S) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - (6 - day));
    return d.toISOString().slice(0, 10);
  }
  /** Дата матчу ліги: тур посеред тижня — вівторок, звичайний — субота. */
  const fixtureDate = (S, f) => dayDate(S, f.w, f.mid ? 2 : 6);

  /** Закрити тиждень: дискваліфікації тих, хто пропустив матч, минають; наступний тиждень. */
  function advance(S, W, opts = {}) {
    const playedClubs = new Set();
    for (const f of fixturesOfWeek(S, S.week)) { playedClubs.add(f.h); playedClubs.add(f.a); }
    // дискваліфікований ще до цього туру — саме він пропустив матч
    for (const id of Object.keys(S.bans)) {
      if (S.bans[id][1] >= S.week) continue;
      const p = W.player(id);
      if (p && playedClubs.has(p.club)) { S.bans[id][0]--; if (S.bans[id][0] <= 0) delete S.bans[id]; }
    }
    // травми: мінус тиждень; свіжість відновлюється (у людини — за планом тренувань)
    for (const p of W.players.values()) {
      if (p.injury > 0) { p.injury--; if (p.injury <= 0) delete p.injury; }
      if (p.fitness != null) {
        const o = p.club === opts.myClub ? opts : (opts.also || []).find((x) => x.myClub === p.club);
        const plan = o && o.recovery ? o.recovery : 22;
        p.fitness = Math.min(100, p.fitness + plan + (p.attrs.sta || 10) * 0.6);
        if (p.fitness >= 100) delete p.fitness;
      }
    }
    S.week++;
  }

  /** Зіграти весь поточний тиждень і перейти до наступного (з тижнем розвитку гравців, якщо підключено develop.js). */
  function playWeek(S, W, opts = {}) {
    const list = fixturesOfWeek(S, S.week);
    playOthers(S, W, { name: opts.name, user: opts.user });
    advance(S, W, { recovery: opts.dev && opts.dev.recovery, myClub: opts.dev && opts.dev.myClub, also: opts.dev && opts.dev.also });
    if (FM.dev && opts.develop !== false) FM.dev.weekly(W, S, opts.dev || {});
    return list;
  }

  /** Турнірна таблиця: очки, різниця, забиті; форма — останні 5. */
  function table(S, W, leagueId) {
    const rows = new Map([...W.clubs.values()].filter((c) => c.league === leagueId).map((c) => [c.id, { id: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
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
      .filter((x) => x.p && x.p.club && W.club(x.p.club).league === leagueId && x.st[key] > 0)
      .sort((a, b) => b.st[key] - a.st[key] || a.st[0] - b.st[0])
      .slice(0, n);
  }

  // Зони таблиці: єврокубки й виліт (формат 2026/27, спрощено)
  // Зони таблиці. Для вищих ліг ucl/uel — місця в єврокубках гри (js/cups.js EURO_SPOTS), rel — виліт;
  // для других дивізіонів promo — підвищення (скільки ж вилітає з вищої ліги).
  const ZONES = {
    eng: { ucl: 5, uel: 7, rel: 3 }, esp: { ucl: 5, uel: 7, rel: 3 }, ita: { ucl: 4, uel: 7, rel: 3 },
    ger: { ucl: 4, uel: 7, rel: 2, playoff: 1 }, fra: { ucl: 3, uel: 7, rel: 2, playoff: 1 }, ukr: { ucl: 3, uel: 7, rel: 2, playoff: 1 }, // playoff — стикові з третім другого дивізіону
    por: { ucl: 3, uel: 7, rel: 0 }, ned: { ucl: 3, uel: 7, rel: 0 }, tur: { ucl: 3, uel: 8, rel: 0 }, pol: { ucl: 3, uel: 8, rel: 0 },
    bel: { rel: 0 }, sco: { rel: 0 }, gre: { rel: 0 }, cze: { rel: 0 }, den: { rel: 0 }, aut: { rel: 0 }, sui: { rel: 0 }, // ucl/uel/uecl — з квот (cups.js)
    eng2: { promo: 3, po: [3, 6] }, esp2: { promo: 3, po: [3, 6] }, ita2: { promo: 3, po: [3, 6] }, ger2: { promo: 2, rpo: 3 }, fra2: { promo: 2, rpo: 3 }, ukr2: { promo: 2, rpo: 3 },
  };
  function zone(leagueId, pos, size) {
    const z = ZONES[leagueId] || {};
    if (z.po) return pos <= z.promo - 1 ? 'promo' : pos >= z.po[0] && pos <= z.po[1] ? 'playoff' : null; // плей-оф за третю путівку
    if (z.rpo) return pos <= z.promo ? 'promo' : pos === z.rpo ? 'playoff' : null;
    if (z.promo) return pos <= z.promo ? 'promo' : null;
    if (pos <= z.ucl) return 'ucl';
    if (pos <= z.uel) return 'uel';
    if (z.uecl && pos <= z.uecl) return 'uecl';
    if (z.rel && pos > size - z.rel) return 'rel';
    if (z.playoff && pos > size - z.rel - z.playoff) return 'playoff';
    return null;
  }

  /**
   * Підвищення й виліт між вищою й другою лігою країни (кількість — ZONES[друга].promo).
   * Повертає [{ club, from, to, up }]. Викликати після сезону, до створення нового календаря.
   */
  /**
   * Плей-оф після сезону (як у реальних лігах): за третю путівку вгору (3–6 місця другого дивізіону — півфінали з двох
   * матчів, фінал на нейтральному полі) і стикові за виживання (3-є місце другого дивізіону проти третього з кінця вищого).
   * play(h, a, id) — зіграти матч (повертає рахунок [гол господарів, гол гостей]). Повертає { ліга: { up: [], down: [], log: [] } }.
   */
  function playoffs(W, S, play) {
    const out = {};
    const tie = (a, b, id, two) => {
      const l1 = play(a, b, id + '-1'), l2 = two ? play(b, a, id + '-2') : [0, 0];
      const ga = l1[0] + (two ? l2[1] : 0), gb = l1[1] + (two ? l2[0] : 0);
      const pens = ga === gb;
      const win = pens ? (W.clubLevel(a) + Math.random() * 20 > W.clubLevel(b) + Math.random() * 20 ? a : b) : ga > gb ? a : b;
      return { win, lose: win === a ? b : a, txt: `${W.club(a).name} — ${W.club(b).name} ${two ? `${l1.join(':')}, ${l2[1]}:${l2[0]}` : l1.join(':')}${pens ? ' (пенальті)' : ''}` };
    };
    for (const l of W.db.leagues) {
      const Z = ZONES[l.id];
      if (!l.up || !Z) continue;
      const lower = table(S, W, l.id), upper = table(S, W, l.up);
      if (Z.po) { // за путівку вгору: 3 проти 6, 4 проти 5, фінал
        const [from, to] = Z.po, ids = lower.slice(from - 1, to).map((r) => r.id);
        if (ids.length < 4) continue;
        const s1 = tie(ids[0], ids[3], `po-${l.id}-s1`, true), s2 = tie(ids[1], ids[2], `po-${l.id}-s2`, true);
        const fin = tie(s1.win, s2.win, `po-${l.id}-f`, false);
        out[l.id] = { up: [fin.win], skipAuto: ids[0], log: [`Півфінали: ${s1.txt}; ${s2.txt}.`, `Фінал на нейтральному полі: ${fin.txt}. ${W.club(fin.win).name} виходить вгору!`], winner: fin.win, name: `Плей-оф ${l.name}` };
      } else if (Z.rpo) { // стикові: 3-є місце внизу проти третього з кінця вгорі
        const a = upper[upper.length - (ZONES[l.up] && ZONES[l.up].rel ? ZONES[l.up].rel : 2) - 1], b = lower[Z.rpo - 1];
        if (!a || !b) continue;
        const r = tie(a.id, b.id, `rpo-${l.id}`, true);
        out[l.id] = { up: r.win === b.id ? [b.id] : [], down: r.win === b.id ? [a.id] : [], log: [`Стикові матчі: ${r.txt}. ${r.win === b.id ? `${W.club(b.id).name} виходить вгору, ${W.club(a.id).name} вилітає!` : `${W.club(a.id).name} зберігає місце.`}`], winner: r.win, name: `Стикові матчі ${W.league(l.up).name} — ${l.name}`, clubs: [a.id, b.id] };
      }
    }
    return out;
  }

  function promote(W, S, po = null) {
    const moves = [];
    for (const l of W.db.leagues) {
      if (!l.up || !ZONES[l.id] || !ZONES[l.id].promo) continue;
      const P = po && po[l.id];
      // з плей-оф за путівку: напряму вгору на одного менше, третій — переможець плей-оф
      const n = ZONES[l.id].promo - (P && ZONES[l.id].po ? 1 : 0);
      const upTable = table(S, W, l.up), downTable = table(S, W, l.id);
      const down = upTable.slice(-(n + (P && ZONES[l.id].po ? 1 : 0))).map((r) => r.id), up = downTable.slice(0, n).map((r) => r.id);
      if (P) { up.push(...P.up.filter((id) => !up.includes(id))); for (const id of P.down || []) if (!down.includes(id)) down.push(id); }
      for (const id of down) { W.club(id).league = l.id; moves.push({ club: id, from: l.up, to: l.id, up: false }); }
      for (const id of up) { W.club(id).league = l.up; moves.push({ club: id, from: l.id, to: l.up, up: true }); }
    }
    return moves;
  }

  FM.season = { playoffs, midRecover, dayDate, fixtureDate, promote, ZONES, unavailable, firstSaturday, create, weeks, isOver, dateOf, fixturesOfWeek, clubFixtures, nextFixture, sideFor, prepare, play, record, playOthers, advance, playWeek, table, leaders, zone, roundRobin };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
