// Двигун матчу: склад під схему, сили ліній, хвилинна симуляція, трансляція, статистика, оцінки.
// Не залежить від сторінки: працює і в браузері (FM.match), і в Node (тести калібрування).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  // ---------------- Схеми й позиції ----------------
  const S = (role, side) => ({ role, side: side || null });
  const FORMATIONS = {
    '4-3-3': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('FB', 'R'), S('DM'), S('CM'), S('CM'), S('W', 'L'), S('ST'), S('W', 'R')],
    '4-2-3-1': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('FB', 'R'), S('DM'), S('DM'), S('W', 'L'), S('AM'), S('W', 'R'), S('ST')],
    '4-4-2': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('FB', 'R'), S('W', 'L'), S('CM'), S('CM'), S('W', 'R'), S('ST'), S('ST')],
    '3-5-2': [S('GK'), S('CB'), S('CB'), S('CB'), S('FB', 'L'), S('DM'), S('CM'), S('CM'), S('FB', 'R'), S('ST'), S('ST')],
  };

  // Ваги атрибутів для кожної ролі (сума 1) — з них рахується рейтинг гравця на позиції, шкала 1–20.
  const WEIGHTS = {
    GK: { ref: 0.3, han: 0.2, one: 0.2, aer: 0.15, pos: 0.1, dec: 0.05 },
    CB: { tac: 0.25, pos: 0.25, hea: 0.2, str: 0.15, pac: 0.1, dec: 0.05 },
    FB: { tac: 0.2, pac: 0.2, pos: 0.15, cro: 0.15, sta: 0.15, wor: 0.1, dri: 0.05 },
    DM: { tac: 0.25, pos: 0.2, pas: 0.2, dec: 0.15, wor: 0.1, sta: 0.1 },
    CM: { pas: 0.3, dec: 0.2, wor: 0.15, sta: 0.15, tac: 0.1, dri: 0.1 },
    AM: { pas: 0.25, dri: 0.25, dec: 0.15, otb: 0.15, fin: 0.2 },
    W: { dri: 0.25, pac: 0.25, cro: 0.2, otb: 0.1, fin: 0.1, dec: 0.1 },
    ST: { fin: 0.35, otb: 0.2, pac: 0.15, hea: 0.1, str: 0.1, dri: 0.1 },
  };
  const LINE = { GK: 'gk', CB: 'def', FB: 'def', DM: 'mid', CM: 'mid', AM: 'mid', W: 'att', ST: 'att' };
  // Наскільки кожна роль впливає на атаку, контроль м'яча й оборону
  const UNIT = {
    att: { ST: 1, W: 0.8, AM: 0.8, CM: 0.35, FB: 0.2, DM: 0.1 },
    mid: { CM: 1, DM: 0.8, AM: 0.8, W: 0.4, FB: 0.3, ST: 0.2 },
    def: { CB: 1, FB: 0.7, DM: 0.6, CM: 0.3, W: 0.1, AM: 0.1 },
  };
  const NEAR = { // схожі позиції: гравець зіграє там непогано
    CB: { FB: 0.82, DM: 0.8 }, FB: { CB: 0.85, W: 0.8, DM: 0.72 }, DM: { CM: 0.92, CB: 0.82 }, CM: { DM: 0.9, AM: 0.88, W: 0.72 },
    AM: { CM: 0.88, W: 0.85, ST: 0.82 }, W: { AM: 0.85, ST: 0.84, FB: 0.7 }, ST: { W: 0.82, AM: 0.8 },
  };

  // Більшість клубів грає в чотири захисники; 3-5-2 обирається, лише коли склад під неї явно кращий.
  const FORMATION_BIAS = { '4-3-3': 1, '4-2-3-1': 1, '4-4-2': 0.995, '3-5-2': 0.975 };
  // Калібрування (tests/match.test.js): середнє співвідношення атаки до оборони і базова реалізація моменту.
  const RATIO_REF = 1;
  const BASE_Q = 0.085;

  function roleRating(p, role) {
    let s = 0;
    for (const [a, w] of Object.entries(WEIGHTS[role])) s += (p.attrs[a] ?? 5) * w;
    return s;
  }

  /** Наскільки гравцеві підходить місце в схемі: 1 — рідна позиція. */
  function fit(p, slot) {
    const r = p.roles;
    if (slot.role === 'GK') return r[0] === 'GK' ? 1 : 0.2;
    if (r[0] === 'GK') return 0.25;
    let f;
    if (r[0] === slot.role) f = 1;
    else if (r.includes(slot.role)) f = 0.94;
    else f = Math.max(...r.map((x) => (NEAR[x] && NEAR[x][slot.role]) || 0.55));
    if (slot.side && p.side && p.side !== slot.side && (slot.role === 'FB' || slot.role === 'W')) f *= 0.95;
    return f;
  }

  const slotValue = (p, slot) => roleRating(p, slot.role) * fit(p, slot);

  /** Найкращий склад під схему: жадібно, починаючи з найдефіцитніших позицій. */
  function pickLineup(players, formation = '4-3-3', unavailable = new Set()) {
    const slots = FORMATIONS[formation];
    const pool = players.filter((p) => !unavailable.has(p.id));
    const order = slots.map((s, i) => i).sort((i, j) => {
      const scarcity = (s) => pool.filter((p) => p.roles[0] === s.role).length;
      return scarcity(slots[i]) - scarcity(slots[j]);
    });
    const xi = new Array(slots.length);
    const used = new Set();
    for (const i of order) {
      let best = null, bv = -1;
      for (const p of pool) {
        if (used.has(p.id)) continue;
        const v = slotValue(p, slots[i]);
        if (v > bv) { bv = v; best = p; }
      }
      xi[i] = best;
      used.add(best.id);
    }
    const rest = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.ca - a.ca);
    const bench = [];
    const gk = rest.find((p) => p.roles[0] === 'GK');
    if (gk) bench.push(gk);
    for (const p of rest) if (bench.length < 9 && p !== gk) bench.push(p);
    return { formation, xi: xi.map((p, i) => ({ player: p, slot: slots[i] })), bench };
  }

  /**
   * Склад із збереженої тактики: ids — id гравців по позиціях схеми (null — «на розсуд помічника»).
   * Недоступних (дискваліфікованих, проданих) замінює найкращий вільний.
   */
  function lineupFromIds(players, formation, ids) {
    const slots = FORMATIONS[formation];
    const byId = new Map(players.map((p) => [p.id, p]));
    const used = new Set();
    const xi = slots.map((slot, i) => {
      const p = ids && byId.get(ids[i]);
      if (p && !used.has(p.id)) { used.add(p.id); return { player: p, slot }; }
      return { player: null, slot };
    });
    for (const x of xi) {
      if (x.player) continue;
      let best = null, bv = -1;
      for (const p of players) { if (used.has(p.id)) continue; const v = slotValue(p, x.slot); if (v > bv) { bv = v; best = p; } }
      x.player = best; used.add(best.id); x.auto = true;
    }
    const rest = players.filter((p) => !used.has(p.id)).sort((a, b) => b.ca - a.ca);
    const bench = [];
    const gk = rest.find((p) => p.roles[0] === 'GK');
    if (gk) bench.push(gk);
    for (const p of rest) if (bench.length < 9 && p !== gk) bench.push(p);
    return { formation, xi, bench };
  }

  /** Схема, у якій склад найсильніший (для суперників і автопідбору). */
  function bestFormation(players) {
    let best = '4-3-3', bv = -1;
    for (const f of Object.keys(FORMATIONS)) {
      const v = pickLineup(players, f).xi.reduce((s, x) => s + slotValue(x.player, x.slot), 0) * (FORMATION_BIAS[f] || 1);
      if (v > bv) { bv = v; best = f; }
    }
    return best;
  }

  /** Сили ліній (шкала 1–20): атака, контроль, оборона, воротар. entries: [{ p, slot, cond?, out? }]. */
  function unitsFrom(entries) {
    const live = entries.filter((x) => !x.out);
    const eff = (x) => slotValue(x.p, x.slot) * (0.82 + 0.18 * (x.cond ?? 100) / 100);
    const u = {};
    for (const unit of ['att', 'mid', 'def']) {
      let s = 0, w = 0;
      for (const x of live) { const k = UNIT[unit][x.slot.role] || 0; s += eff(x) * k; w += k; }
      // вилучений гравець: та сама середня сила, але на менше людей
      u[unit] = (w ? s / w : 5) * (live.length >= 11 ? 1 : 1 - 0.07 * (11 - live.length));
    }
    const gk = live.find((x) => x.slot.role === 'GK');
    u.gk = gk ? eff(gk) : 4;
    return u;
  }
  const lineupUnits = (lineup) => unitsFrom(lineup.xi.map((x) => ({ p: x.player, slot: x.slot })));

  // ---------------- Трансляція ----------------
  // Імена лише в називному відмінку: українські відмінки чужих імен автоматично не відміняються.
  const T = {
    kickoff: ['Стартовий свисток! {home} — {away}, поїхали.', 'Почали! На полі {home} і {away}.'],
    goal: ['ГОЛ! Забиває {p}!', 'ГОЛ! {p} не помиляється!', 'ГОЛ! М’яч у сітці, автор — {p}!', 'ГОЛ! {team} радіє, забив {p}!'],
    goalAssist: [' Асистент — {a}.', ' Гольова передача: {a}.'],
    header: ['Подача з флангу, {a} шукає партнера. {p} б’є головою…', 'Навіс від {a}! {p} вистрибує вище за всіх…'],
    through: ['{a} віддає проникаючу передачу. {p} сам на сам…', 'Комбінація в штрафному: {a} — {p}, удар…'],
    solo: ['{p} обіграє захисника й б’є…', '{p} пробиває з-за меж штрафного…', 'Удар із дальньої дистанції, б’є {p}…'],
    saved: ['Сейв! {gk} на місці.', 'Воротар {gk} рятує команду!', '{gk} відбиває на кутовий.'],
    wide: ['Повз ворота.', 'Вище воріт.', 'Трохи поруч зі стійкою.'],
    blocked: ['Удар заблоковано.', 'Захисники кидаються під м’яч.'],
    post: ['У стійку!', 'У поперечину!'],
    penalty: ['Пенальті! У штрафному збили гравця {team} — {p}.', 'Суддя показує на точку! Фол на {team}, постраждав {p}.'],
    penGoal: ['До м’яча підходить {p}… ГОЛ!', 'Пенальті реалізовано, бив {p}!'],
    penMiss: ['Б’є {p}… {gk} тягне пенальті!', 'Б’є {p}… мимо!'],
    yellow: ['Жовта картка: {p} ({team}).', 'Жорсткий підкат, жовта — {p} ({team}).'],
    red2: ['Друга жовта й червона: {p} ({team}) залишає поле.'],
    red: ['Пряма червона! Вилучено: {p} ({team}).'],
    injury: ['Травма: {p} ({team}) не може продовжувати гру.', '{p} ({team}) кульгає й просить заміну — схоже на травму.'],
    sub: ['Заміна, {team}: виходить {on}, залишає поле {off}.'],
    half: ['Перерва. {score}.'],
    second: ['Почався другий тайм.'],
    full: ['Фінальний свисток! {score}.'],
    pressure: ['{team} тисне, м’яч надовго в чужій половині.', '{team} контролює м’яч і шукає прострільну передачу.', '{team} кидається вперед!'],
  };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

  // ---------------- Симуляція ----------------
  const MENTALITY = { defensive: -2, cautious: -1, balanced: 0, positive: 1, attacking: 2 };
  const PRESSING = { low: -1, normal: 0, high: 1 };
  const PASSING = { short: -1, mixed: 0, direct: 1 };
  const TACTIC_UK = {
    mentality: { defensive: 'оборонний', cautious: 'обережний', balanced: 'збалансований', positive: 'сміливий', attacking: 'атакувальний' },
    pressing: { low: 'низький пресинг', normal: 'звичайний пресинг', high: 'високий пресинг' },
    passing: { short: 'короткі передачі', mixed: 'змішані передачі', direct: 'довгі передачі' },
  };

  /**
   * Створити матч, яким можна керувати по хвилинах.
   * opts: { home: {club, players, formation?, lineup?, mentality?, pressing?, passing?, manual?}, away: {…},
   *         seed, name: (p) → ім'я, neutral?: bool, subs?: false }
   * manual: true — заміни робить людина (помічник не втручається, доки його не попросять).
   * Повертає { step(), done, minute, sides, events, sub(), setTactics(), result() }.
   */
  function create(opts) {
    const R = FM.rng(opts.seed);
    const name = opts.name || ((p) => p.name);
    const sides = [opts.home, opts.away].map((t, k) => {
      const formation = t.formation || bestFormation(t.players);
      const lu = t.lineup || pickLineup(t.players, formation);
      const onPitch = lu.xi.map((x) => ({ p: x.player, slot: x.slot, cond: 100, yellow: 0, out: false }));
      return {
        k, club: t.club, formation, onPitch, autoSubs: !t.manual,
        tactic: { mentality: t.mentality || 'balanced', pressing: t.pressing || 'normal', passing: t.passing || 'mixed' },
        mentality: MENTALITY[t.mentality || 'balanced'] || 0, pressing: PRESSING[t.pressing || 'normal'] || 0, passing: PASSING[t.passing || 'mixed'] || 0,
        bench: lu.bench.slice(), subsLeft: 5, subWindows: 3, units: null,
        stats: { goals: 0, shots: 0, onTarget: 0, poss: 0, yellow: 0, red: 0, xg: 0 },
        perf: new Map(lu.xi.map((x) => [x.player.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true }])),
        lineup: lu,
      };
    });
    const [H, A] = sides;
    const homeAdv = opts.neutral ? 1 : 1.12;
    const events = [];
    const score = () => `${H.club.name} ${H.stats.goals}:${A.stats.goals} ${A.club.name}`;
    const say = (min, type, team, key, vars = {}) => {
      const text = Array.isArray(key) ? key.join('') : fill(R.pick(T[key]), { home: H.club.name, away: A.club.name, ...vars });
      events.push({ min, type, team: team == null ? null : team.k, text, score: [H.stats.goals, A.stats.goals] });
    };

    function compute(t) { t.units = unitsFrom(t.onPitch); }

    function chanceRates(min) {
      // контроль м'яча: пресинг відбирає м'яч частіше, короткі передачі його бережуть
      const ctrl = (t) => t.units.mid * (1 + 0.04 * t.pressing - 0.035 * t.passing);
      const mh = ctrl(H) ** 1.5 * homeAdv, ma = ctrl(A) ** 1.5;
      const share = mh / (mh + ma); // частка володіння господарів
      const rate = (t, o, sh) => {
        let r = 23 * (0.24 + 0.52 * sh); // моментів за матч
        r *= 1 + 0.07 * t.mentality + 0.05 * o.mentality + 0.06 * t.passing; // довгі передачі — більше, але гірших моментів
        // рахунок: хто програє наприкінці — тисне, хто веде — тримає
        const diff = t.stats.goals - o.stats.goals;
        if (min > 60 && diff < 0) r *= 1.25; else if (min > 70 && diff > 0) r *= 0.85;
        return r / 94;
      };
      return { share, h: rate(H, A, share) * (opts.neutral ? 1 : 1.09), a: rate(A, H, 1 - share) * (opts.neutral ? 1 : 0.92) };
    }

    const pickShooter = (t) => R.weighted(t.onPitch.filter((x) => !x.out && x.slot.role !== 'GK'),
      (x) => ({ ST: 3.2, W: 2, AM: 2, CM: 0.9, DM: 0.4, FB: 0.45, CB: 0.4 }[x.slot.role] || 0.5) * (x.p.attrs.fin + x.p.attrs.otb) ** 1.4);
    const pickAssister = (t, shooter) => R.weighted(t.onPitch.filter((x) => !x.out && x !== shooter && x.slot.role !== 'GK'),
      (x) => ({ AM: 2.4, W: 2.2, CM: 1.8, FB: 1.2, ST: 1.1, DM: 0.8, CB: 0.3 }[x.slot.role] || 0.5) * (x.p.attrs.pas + x.p.attrs.cro + x.p.attrs.dri / 2) ** 1.3);

    function chance(t, o, min) {
      const shooter = pickShooter(t);
      const gkX = o.onPitch.find((x) => !x.out && x.slot.role === 'GK');
      const gkName = gkX ? name(gkX.p) : 'воротар';
      const sPerf = t.perf.get(shooter.p.id);
      t.stats.shots++; sPerf.shots++;
      // якість моменту: атака проти оборони; реалізація: удар проти воротаря
      const ratio = t.units.att / (0.75 * o.units.def + 0.25 * o.units.gk) / RATIO_REF;
      let q = BASE_Q * ratio ** 1.15;
      const finish = (shooter.p.attrs.fin * 0.7 + shooter.p.attrs.dec * 0.3) / 12;
      q *= Math.min(1.5, Math.max(0.6, finish));
      q *= (1 - 0.06 * t.passing) * (1 + 0.05 * o.pressing); // високий пресинг суперника лишає простір за спиною

      if (R.chance(0.013)) { // пенальті (~0,3 за матч)
        const taker = t.onPitch.filter((x) => !x.out && x.slot.role !== 'GK').sort((a, b) => b.p.attrs.fin - a.p.attrs.fin)[0];
        const tPerf = t.perf.get(taker.p.id);
        say(min, 'chance', t, 'penalty', { p: name(shooter.p), team: t.club.name });
        t.stats.xg += 0.76;
        if (R.chance(0.68 + taker.p.attrs.fin * 0.008)) {
          t.stats.goals++; t.stats.onTarget++; tPerf.goals++;
          if (gkX) o.perf.get(gkX.p.id).conceded++;
          say(min, 'goal', t, 'penGoal', { p: name(taker.p) });
        } else {
          if (gkX) o.perf.get(gkX.p.id).saves++;
          say(min, 'miss', t, 'penMiss', { p: name(taker.p), gk: gkName });
        }
        return;
      }
      const kind = R.weighted(['header', 'through', 'solo'], (k) => ({ header: 1 + shooter.p.attrs.hea / 10, through: 2, solo: 1 + shooter.p.attrs.dri / 10 }[k]));
      const assister = kind === 'solo' ? null : pickAssister(t, shooter);
      const vars = { p: name(shooter.p), a: assister ? name(assister.p) : '', gk: gkName, team: t.club.name };
      const lead = fill(R.pick(T[kind]), vars);
      t.stats.xg += q;
      if (R.chance(q)) {
        t.stats.goals++; t.stats.onTarget++; sPerf.goals++;
        if (assister) t.perf.get(assister.p.id).assists++;
        if (gkX) o.perf.get(gkX.p.id).conceded++;
        say(min, 'goal', t, [lead, ' ', fill(R.pick(T.goal), vars), assister ? fill(R.pick(T.goalAssist), vars) : '']);
      } else {
        const out = R.weighted(['saved', 'wide', 'blocked', 'post'], (k) => ({ saved: 0.4 * (o.units.gk / 12), wide: 0.36, blocked: 0.18, post: 0.06 }[k]));
        if (out === 'saved') { t.stats.onTarget++; if (gkX) o.perf.get(gkX.p.id).saves++; }
        say(min, 'chance', t, [lead, ' ', fill(R.pick(T[out]), vars)]);
      }
    }

    function card(t, min) {
      // гравець із жовтою грає обережніше
      const x = R.weighted(t.onPitch.filter((y) => !y.out), (y) => ({ CB: 2, DM: 2.2, FB: 1.6, CM: 1.3, W: 0.8, AM: 0.8, ST: 0.9, GK: 0.2 }[y.slot.role]) * ((y.p.attrs.tac ?? 3) + 4) / 10 * (y.yellow ? 0.12 : 1));
      const perf = t.perf.get(x.p.id);
      const vars = { p: name(x.p), team: t.club.name };
      if (R.chance(0.012)) { x.out = true; perf.red = true; t.stats.red++; say(min, 'red', t, 'red', vars); compute(t); return; }
      x.yellow++; perf.yellow++; t.stats.yellow++;
      if (x.yellow >= 2) { x.out = true; perf.red = true; t.stats.red++; say(min, 'red', t, 'red2', vars); compute(t); return; }
      say(min, 'yellow', t, 'yellow', vars);
    }

    /** Травма: гравця міняють (навіть якщо заміни ручні), а як замін немає — команда грає в меншості. */
    function injury(t, min) {
      const x = R.weighted(t.onPitch.filter((y) => !y.out), (y) => (y.slot.role === 'GK' ? 0.3 : 1) * (125 - y.cond));
      if (!x) return;
      const pf = t.perf.get(x.p.id);
      pf.injury = FM.dev ? FM.dev.injuryWeeks(R) : 1 + R.int(3);
      say(min, 'injury', t, 'injury', { p: name(x.p), team: t.club.name });
      const pool = t.bench.filter((b) => (x.slot.role === 'GK') === (b.roles[0] === 'GK'));
      if (t.subsLeft > 0 && pool.length) {
        let best = pool[0], bv = -1;
        for (const b of pool) { const v = slotValue(b, x.slot); if (v > bv) { bv = v; best = b; } }
        t.bench.splice(t.bench.indexOf(best), 1);
        x.out = true; x.subbedOff = minuteNum;
        t.onPitch.push({ p: best, slot: x.slot, cond: 100, yellow: 0, out: false, subbedOn: minuteNum });
        t.perf.set(best.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true, from: minuteNum });
        t.subsLeft--;
        say(min, 'sub', t, 'sub', { team: t.club.name, on: name(best), off: name(x.p) });
      } else { x.out = true; x.subbedOff = minuteNum; }
      compute(t);
    }

    function aiSubs(t, o, min) {
      if (opts.subs === false || !t.autoSubs || t.subsLeft <= 0 || t.subWindows <= 0 || !t.bench.length) return;
      if (!(min === 60 || min === 70 || min === 80)) return;
      const diff = t.stats.goals - o.stats.goals;
      const n = min === 60 ? (diff < 0 ? 2 : 1) : min === 70 ? 2 : 2;
      let made = 0;
      for (let i = 0; i < n && t.subsLeft > 0; i++) {
        const tired = t.onPitch.filter((x) => !x.out && x.slot.role !== 'GK' && !x.subbedOn).sort((a, b) => (a.cond - a.yellow * 8) - (b.cond - b.yellow * 8))[0];
        if (!tired || (tired.cond > 82 && diff >= 0 && min < 75)) break;
        let best = null, bv = -1;
        for (const b of t.bench) { if (b.roles[0] === 'GK') continue; const v = slotValue(b, tired.slot); if (v > bv) { bv = v; best = b; } }
        if (!best) break;
        t.bench.splice(t.bench.indexOf(best), 1);
        tired.out = true; tired.subbedOff = min;
        t.onPitch.push({ p: best, slot: tired.slot, cond: 100, yellow: 0, out: false, subbedOn: min });
        t.perf.set(best.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true, from: min });
        t.subsLeft--; made++;
        say(min, 'sub', t, 'sub', { team: t.club.name, on: name(best), off: name(tired.p) });
      }
      if (made) { t.subWindows--; compute(t); }
    }

    // ---- ручні рішення тренера ----
    let current = 0;
    function sub(k, outId, inId) {
      const t = sides[k];
      const x = t.onPitch.find((y) => !y.out && y.p.id === outId);
      const b = t.bench.find((p) => p.id === inId);
      if (done || !x || !b || t.subsLeft <= 0) return false;
      t.bench.splice(t.bench.indexOf(b), 1);
      x.out = true; x.subbedOff = minuteNum || 1;
      t.onPitch.push({ p: b, slot: x.slot, cond: 100, yellow: 0, out: false, subbedOn: minuteNum || 1 });
      t.perf.set(b.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true, from: minuteNum });
      t.subsLeft--;
      say(current, 'sub', t, 'sub', { team: t.club.name, on: name(b), off: name(x.p) });
      compute(t);
      return true;
    }
    function setTactics(k, tac) {
      const t = sides[k];
      const changed = [];
      for (const key of ['mentality', 'pressing', 'passing']) {
        if (!tac[key] || tac[key] === t.tactic[key]) continue;
        t.tactic[key] = tac[key];
        changed.push(TACTIC_UK[key][tac[key]]);
      }
      t.mentality = MENTALITY[t.tactic.mentality]; t.pressing = PRESSING[t.tactic.pressing]; t.passing = PASSING[t.tactic.passing];
      if (changed.length && !done) say(current, 'info', t, [`${t.club.name}: тренер змінює підхід — ${changed.join(', ')}.`]);
      return changed.length > 0;
    }

    // ---- матч ----
    compute(H); compute(A);
    const startUnits = [{ ...H.units }, { ...A.units }];
    say(0, 'kickoff', null, 'kickoff');
    const added = [1 + R.int(3), 2 + R.int(4)];
    const timeline = [];
    for (let m = 1; m <= 45 + added[0]; m++) timeline.push({ m, pi: 0, label: m > 45 ? `45+${m - 45}` : m, extra: m > 45 });
    for (let m = 46; m <= 90 + added[1]; m++) timeline.push({ m, pi: 1, label: m > 90 ? `90+${m - 90}` : m, extra: m > 90 });
    let idx = 0, possH = 0, ticks = 0, done = false, minuteNum = 0;

    /** Одна хвилина матчу. Повертає false, коли матч уже закінчився. */
    function step() {
      if (done) return false;
      const e = timeline[idx++];
      current = e.label; minuteNum = e.m;
      if (e.m === 46) say(46, 'half', null, 'second');
      const cr = chanceRates(e.m);
      possH += cr.share; ticks++;
      // втома: витривалість, пресинг
      for (const t of sides) for (const x of t.onPitch) if (!x.out) x.cond = Math.max(40, x.cond - (0.42 - x.p.attrs.sta * 0.014) * (x.slot.role === 'GK' ? 0.3 : 1 + 0.25 * t.pressing));
      if (e.m % 5 === 0) { compute(H); compute(A); }
      if (R.chance(cr.h)) chance(H, A, e.label);
      if (R.chance(cr.a)) chance(A, H, e.label);
      for (const t of sides) if (R.chance(1.9 / 94 * (1 + 0.2 * t.pressing))) card(t, e.label);
      for (const t of sides) if (R.chance(0.003 * (1 + 0.3 * t.pressing))) injury(t, e.label);
      if (R.chance(0.035)) {
        const t = R.chance(cr.share) ? H : A;
        say(e.label, 'info', t, 'pressure', { team: t.club.name });
      }
      if (e.pi === 1 && !e.extra) { aiSubs(H, A, e.m); aiSubs(A, H, e.m); }
      if (e.pi === 0 && timeline[idx].pi === 1) say('45+' + added[0], 'half', null, 'half', { score: score() });
      if (idx >= timeline.length) {
        H.stats.poss = Math.round((possH / ticks) * 100);
        A.stats.poss = 100 - H.stats.poss;
        say('90+' + added[1], 'full', null, 'full', { score: score() });
        done = true;
      }
      return true;
    }

    // ---- підсумок і оцінки 3–10 ----
    let final = null;
    function result() {
      while (step()); // якщо матч не дограли — догравання
      if (final) return final;
      const ratings = [];
      for (const t of sides) {
        const o = sides[1 - t.k];
        const res = Math.sign(t.stats.goals - o.stats.goals);
        for (const x of t.onPitch) {
          const pf = t.perf.get(x.p.id);
          const minutes = (x.subbedOff || 93) - (x.subbedOn || 0);
          let r = 6.3 + 0.25 * res + pf.goals * 1.0 + pf.assists * 0.6 + pf.shots * 0.05 - pf.yellow * 0.2 - (pf.red ? 1.5 : 0);
          if (x.slot.role === 'GK') r += pf.saves * 0.25 - pf.conceded * 0.35 + (o.stats.goals === 0 ? 0.6 : 0);
          else if (LINE[x.slot.role] === 'def') r += (o.stats.goals === 0 ? 0.5 : -0.15 * o.stats.goals);
          r += (slotValue(x.p, x.slot) - 12) * 0.06 + R.range(-0.35, 0.35);
          if (minutes < 20) r = 6 + (r - 6) * 0.5;
          ratings.push({ team: t.k, id: x.p.id, player: x.p, role: x.slot.role, rating: Math.round(Math.max(3, Math.min(10, r)) * 10) / 10,
            goals: pf.goals, assists: pf.assists, yellow: pf.yellow, red: pf.red, injury: pf.injury || 0, on: x.subbedOn || null, off: x.subbedOff || null });
        }
      }
      const motm = [...ratings].sort((a, b) => b.rating - a.rating)[0];
      final = {
        score: [H.stats.goals, A.stats.goals], events,
        stats: [H.stats, A.stats].map((st) => ({ ...st, xg: Math.round(st.xg * 100) / 100 })),
        ratings, motm, formations: [H.formation, A.formation], units: startUnits,
        lineups: sides.map((t) => t.lineup),
      };
      return final;
    }

    /** Статистика наживо (володіння — за зіграні хвилини). */
    function liveStats() {
      const ph = ticks ? Math.round((possH / ticks) * 100) : 50;
      return sides.map((t, k) => ({ ...t.stats, poss: k === 0 ? ph : 100 - ph, xg: Math.round(t.stats.xg * 100) / 100 }));
    }

    return {
      step, result, sub, setTactics, liveStats, sides, events,
      get done() { return done; },
      get minute() { return current; },
      get minuteNum() { return minuteNum; },
    };
  }

  /** Зіграти матч від початку до кінця. */
  function play(opts) { return create(opts).result(); }

  Object.assign(FM, { FORMATIONS, roleRating, fit, slotValue, pickLineup, lineupFromIds, bestFormation, lineupUnits, match: { play, create, MENTALITY, PRESSING, PASSING, TACTIC_UK } });
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
