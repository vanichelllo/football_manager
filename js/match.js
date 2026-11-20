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
    '4-1-4-1': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('FB', 'R'), S('DM'), S('W', 'L'), S('CM'), S('CM'), S('W', 'R'), S('ST')],
    '4-4-1-1': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('FB', 'R'), S('W', 'L'), S('CM'), S('CM'), S('W', 'R'), S('AM'), S('ST')],
    '4-3-1-2': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('FB', 'R'), S('DM'), S('CM'), S('CM'), S('AM'), S('ST'), S('ST')],
    '3-4-3': [S('GK'), S('CB'), S('CB'), S('CB'), S('FB', 'L'), S('CM'), S('CM'), S('FB', 'R'), S('W', 'L'), S('ST'), S('W', 'R')],
    '5-3-2': [S('GK'), S('FB', 'L'), S('CB'), S('CB'), S('CB'), S('FB', 'R'), S('CM'), S('DM'), S('CM'), S('ST'), S('ST')],
  };

  // Варіанти ролей: власні ваги атрибутів (сума 1) і внесок у лінії (unit). std — звичайна роль.
  const VARIANTS = {
    GK: { std: { label: 'Воротар' }, sweeper: { label: 'Воротар-чистильник', w: { ref: 0.25, one: 0.25, han: 0.15, kic: 0.15, pac: 0.1, dec: 0.1 }, unit: { mid: 0.15 } } },
    CB: { std: { label: 'Центральний захисник' }, bpd: { label: 'Захисник-розігрувач', w: { tac: 0.2, pos: 0.2, pas: 0.2, hea: 0.15, dec: 0.15, str: 0.1 }, unit: { mid: 0.25, def: 0.9 } },
      stopper: { label: 'Стопер', w: { tac: 0.3, str: 0.25, hea: 0.2, pos: 0.15, pac: 0.1 }, unit: { def: 1.1 } } },
    FB: { std: { label: 'Крайній захисник' }, wb: { label: 'Вінгбек', w: { pac: 0.25, cro: 0.25, sta: 0.2, dri: 0.1, tac: 0.1, wor: 0.1 }, unit: { att: 0.45, def: 0.5, mid: 0.35 } },
      inv: { label: 'Інвертований захисник', w: { pas: 0.25, dec: 0.2, tac: 0.2, pos: 0.2, sta: 0.15 }, unit: { mid: 0.6, def: 0.6 } } },
    DM: { std: { label: 'Опорний півзахисник' }, anchor: { label: 'Якір', w: { pos: 0.3, tac: 0.3, dec: 0.2, str: 0.2 }, unit: { def: 0.85, mid: 0.6 } },
      dlp: { label: 'Диспетчер з глибини', w: { pas: 0.35, dec: 0.25, pos: 0.15, tac: 0.1, sta: 0.15 }, unit: { mid: 1, def: 0.45 } },
      bwm: { label: 'Руйнівник', w: { tac: 0.35, wor: 0.25, str: 0.2, sta: 0.2 }, unit: { def: 0.8, mid: 0.6 }, cards: 1.4 } },
    CM: { std: { label: 'Центральний півзахисник' }, b2b: { label: 'Від штрафного до штрафного', w: { sta: 0.25, wor: 0.2, pas: 0.2, tac: 0.15, fin: 0.1, otb: 0.1 }, unit: { att: 0.5, def: 0.45 } },
      ap: { label: 'Плеймейкер', w: { pas: 0.35, dec: 0.25, dri: 0.2, otb: 0.1, fin: 0.1 }, unit: { att: 0.45, mid: 1.1, def: 0.15 } } },
    AM: { std: { label: 'Атакувальний півзахисник' }, enganche: { label: 'Класична «десятка»', w: { pas: 0.35, dec: 0.3, dri: 0.25, otb: 0.1 }, unit: { mid: 1, att: 0.6 } },
      shadow: { label: 'Тіньовий нападник', w: { fin: 0.3, otb: 0.3, dri: 0.2, pac: 0.2 }, unit: { att: 1, mid: 0.5 }, shoot: 1.6 } },
    W: { std: { label: 'Вінгер' }, inside: { label: 'Інсайд', w: { fin: 0.3, dri: 0.25, otb: 0.2, pac: 0.15, dec: 0.1 }, unit: { att: 1 }, shoot: 1.5 },
      wide: { label: 'Флангова гра', w: { cro: 0.35, pac: 0.3, dri: 0.2, sta: 0.15 }, unit: { att: 0.7, mid: 0.5 }, assist: 1.4 } },
    ST: { std: { label: 'Нападник' }, target: { label: 'Таргетмен', w: { hea: 0.3, str: 0.3, fin: 0.25, otb: 0.15 } },
      poacher: { label: 'Браконьєр', w: { fin: 0.45, otb: 0.35, pac: 0.2 }, shoot: 1.3 },
      false9: { label: 'Фальшива «дев\u2019ятка»', w: { pas: 0.25, dri: 0.25, dec: 0.2, fin: 0.2, otb: 0.1 }, unit: { mid: 0.6, att: 0.85 }, assist: 1.5, shoot: 0.8 } },
  };
  // Індивідуальні інструкції: зміна внеску в лінії
  const INSTR = {
    none: { label: 'Без інструкції' },
    attack: { label: 'Більше в атаку', d: { att: 0.25, def: -0.2 } },
    defend: { label: 'Більше в оборону', d: { att: -0.2, def: 0.25 } },
    free: { label: 'Вільна роль', d: { att: 0.2, mid: 0.1, def: -0.25 } },
    mark: { label: 'Персональна опіка', d: { att: -0.3, def: 0.1 } },
  };
  // Погода: множники для частоти моментів, якості, втоми; довгі/короткі передачі
  const WEATHER = {
    sun: { label: 'Сонячно', rate: 1, q: 1, tire: 1 },
    cloud: { label: 'Хмарно', rate: 1, q: 1, tire: 1 },
    rain: { label: 'Дощ', rate: 1.02, q: 0.96, tire: 1.05, shortPenalty: 0.5 },
    snow: { label: 'Сніг', rate: 0.88, q: 0.93, tire: 1.1, shortPenalty: 0.6 },
    wind: { label: 'Сильний вітер', rate: 1, q: 0.97, tire: 1, directPenalty: 0.5 },
    heat: { label: 'Спека', rate: 0.96, q: 1, tire: 1.3 },
  };
  /** Погода на матч: залежить від місяця й країни. */
  function weatherFor(dateISO, league, R) {
    const m = Number(String(dateISO).slice(5, 7));
    const winter = m === 12 || m <= 2, summer = m >= 6 && m <= 8;
    const north = league === 'eng' || league === 'ger' || league === 'ukr';
    const table = winter ? { cloud: 3, rain: north ? 3 : 2, snow: league === 'ukr' ? 3 : league === 'ger' ? 1.5 : 0.3, wind: 1.5, sun: north ? 1 : 3 }
      : summer ? { sun: 5, cloud: 2, rain: 1, heat: league === 'esp' || league === 'ita' ? 3 : 1 } : { sun: 3, cloud: 3, rain: north ? 3 : 1.5, wind: 1 };
    return R.weighted(Object.keys(table), (k) => table[k]);
  }

  const variantOf = (slot) => (slot.variant && VARIANTS[slot.role] && VARIANTS[slot.role][slot.variant]) || null;
  /** Внесок позиції в лінію з урахуванням варіанта ролі й інструкції. */
  function unitWeight(slot, unit) {
    const v = variantOf(slot);
    let w = v && v.unit && v.unit[unit] != null ? v.unit[unit] : UNIT[unit][slot.role] || 0;
    const ins = slot.instr && INSTR[slot.instr];
    if (ins && ins.d && ins.d[unit] && slot.role !== 'GK') w = Math.max(0, w + ins.d[unit]);
    return w;
  }

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
  const FORMATION_BIAS = { '4-3-3': 1, '4-2-3-1': 1, '4-4-2': 0.995, '4-1-4-1': 0.99, '4-4-1-1': 0.99, '4-3-1-2': 0.985, '3-5-2': 0.975, '3-4-3': 0.97, '5-3-2': 0.97 };
  // Калібрування (tests/match.test.js): середнє співвідношення атаки до оборони і базова реалізація моменту.
  const RATIO_REF = 1;
  const BASE_Q = 0.073;

  // ваги ролей і варіантів — масивами (рахується дуже часто: підбір складу перебирає всі схеми)
  const W_ENTRIES = new Map();
  const wEntries = (role, variant) => {
    const k = role + '|' + (variant || '');
    let e = W_ENTRIES.get(k);
    if (!e) {
      const v = variant && VARIANTS[role] && VARIANTS[role][variant];
      e = Object.entries((v && v.w) || WEIGHTS[role]);
      W_ENTRIES.set(k, e);
    }
    return e;
  };
  function roleRating(p, role, variant) {
    const at = p.attrs, e = wEntries(role, variant);
    let s = 0;
    for (let i = 0; i < e.length; i++) s += (at[e[i][0]] ?? 5) * e[i][1];
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
    else {
      f = Math.max(...r.map((x) => (NEAR[x] && NEAR[x][slot.role]) || 0.55));
      const exp = p.posExp && p.posExp[slot.role]; // освоєння нової позиції (0–100)
      if (exp) f += (0.94 - f) * Math.min(1, exp / 100);
    }
    if (slot.side && p.side && p.side !== slot.side && (slot.role === 'FB' || slot.role === 'W')) f *= 0.95;
    return f;
  }

  const slotValue = (p, slot) => roleRating(p, slot.role, slot.variant) * fit(p, slot);

  /** Позиції схеми з урахуванням тактики: змінені ролі, варіанти, інструкції. */
  function slotsFor(formation, tac) {
    return FORMATIONS[formation].map((s, i) => {
      const role = i === 0 ? 'GK' : (tac && tac.roles && tac.roles[i]) || s.role;
      return { role, side: role === 'FB' || role === 'W' ? s.side || (tac && tac.sides && tac.sides[i]) || null : null,
        variant: (tac && tac.variants && tac.variants[i]) || null, instr: (tac && tac.instr && tac.instr[i]) || null };
    });
  }

  /** Найкращий склад під схему: жадібно, починаючи з найдефіцитніших позицій. */
  function pickLineup(players, formation = '4-3-3', unavailable = new Set(), memo = null) {
    const slots = FORMATIONS[formation];
    const pool = players.filter((p) => !unavailable.has(p.id));
    const have = {};
    for (const p of pool) have[p.roles[0]] = (have[p.roles[0]] || 0) + 1;
    const order = slots.map((s, i) => i).sort((i, j) => (have[slots[i].role] || 0) - (have[slots[j].role] || 0));
    const xi = new Array(slots.length);
    const used = new Set();
    for (const i of order) {
      let best = null, bv = -1;
      const sl = slots[i];
      let mm = null;
      if (memo) { const sig = sl.role + '|' + (sl.variant || '') + '|' + (sl.side || ''); mm = memo.get(sig) || memo.set(sig, new Map()).get(sig); }
      for (const p of pool) {
        if (used.has(p.id)) continue;
        let v = mm ? mm.get(p.id) : undefined;
        if (v === undefined) { v = slotValue(p, sl); if (mm) mm.set(p.id, v); }
        if (v > bv) { bv = v; best = p; }
      }
      if (!best) { // доступних менше одинадцяти — виходить хтось, хто ще не відновився (найменше лишилося лікуватися)
        best = players.filter((p) => !used.has(p.id)).sort((a, b) => (a.injury || 0) - (b.injury || 0) || slotValue(b, slots[i]) - slotValue(a, slots[i]))[0];
        if (!best) throw new Error('Замало гравців для складу');
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
  function lineupFromIds(players, formation, ids, tac) {
    const slots = slotsFor(formation, tac);
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
    const memo = new Map();
    for (const f of Object.keys(FORMATIONS)) {
      const v = pickLineup(players, f, undefined, memo).xi.reduce((s, x) => s + slotValue(x.player, x.slot), 0) * (FORMATION_BIAS[f] || 1);
      if (v > bv) { bv = v; best = f; }
    }
    return best;
  }

  /** Сили ліній (шкала 1–20): атака, контроль, оборона, воротар. entries: [{ p, slot, cond?, out? }]. */
  function unitsFrom(entries, marked) {
    const live = entries.filter((x) => !x.out);
    // свіжість, настрій (мораль — якщо підключено morale.js), персональна опіка суперника
    const eff = (x) => slotValue(x.p, x.slot) * (0.82 + 0.18 * (x.cond ?? 100) / 100) * (FM.morale ? FM.morale.factor(x.p) : 1)
      * (marked && marked.has(x.p.id) ? 0.88 : 1) * (x.mf || 1);
    const u = {};
    for (const unit of ['att', 'mid', 'def']) {
      let s = 0, w = 0;
      for (const x of live) { const k = unitWeight(x.slot, unit); s += eff(x) * k; w += k; }
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
    goalAssist: [' Асистент — {a}.', ' Гольова передача: {a}.', ' Асист {aG}.', ' Передача {aG} — і гол!'],
    header: ['Подача з флангу, {a} шукає партнера. {p} б’є головою…', 'Навіс від {a}! {p} вистрибує вище за всіх…', 'Навіс {aG} з флангу! {p} б’є головою…'],
    through: ['{a} віддає проникаючу передачу. {p} сам на сам…', 'Комбінація в штрафному: {a} — {p}, удар…', 'Чудова передача {aG}! {p} сам на сам…'],
    corner: ['Кутовий. Подає {a}… {p} б’є головою!', 'Подача з кутового від {a}, у боротьбі {p}…', 'Кутовий {aG}! {p} першим на м’ячі…'],
    freekick: ['Штрафний у небезпечній зоні. До м’яча підходить {p}…', 'Штрафний! {p} пробиває через стінку…', 'Штрафний. Б’є {p}, ціль — дев’ятка…'],
    solo: ['{p} обіграє захисника й б’є…', '{p} пробиває з-за меж штрафного…', 'Удар із дальньої дистанції, б’є {p}…'],
    saved: ['Сейв! {gk} на місці.', 'Воротар {gk} рятує команду!', '{gk} відбиває на кутовий.', 'Чудовий сейв {gkG}!'],
    wide: ['Повз ворота.', 'Вище воріт.', 'Трохи поруч зі стійкою.'],
    blocked: ['Удар заблоковано.', 'Захисники кидаються під м’яч.'],
    post: ['У стійку!', 'У поперечину!'],
    penalty: ['Пенальті! У штрафному збили гравця {team} — {p}.', 'Суддя показує на точку! Фол на {team}, постраждав {p}.'],
    penGoal: ['До м’яча підходить {p}… ГОЛ!', 'Пенальті реалізовано, бив {p}!'],
    penMiss: ['Б’є {p}… {gk} тягне пенальті!', 'Б’є {p}… мимо!'],
    yellow: ['Жовта картка: {p} ({team}).', 'Жорсткий підкат, жовта — {p} ({team}).', 'Жовта картка для {pG} ({team}).'],
    red2: ['Друга жовта й червона: {p} ({team}) залишає поле.'],
    red: ['Пряма червона! Вилучено: {p} ({team}).'],
    injury: ['Травма: {p} ({team}) не може продовжувати гру.', '{p} ({team}) кульгає й просить заміну — схоже на травму.'],
    sub: ['Заміна, {team}: виходить {on}, залишає поле {off}.', 'Заміна, {team}: {on} замість {offG}.'],
    half: ['Перерва. {score}.'],
    second: ['Почався другий тайм.'],
    full: ['Фінальний свисток! {score}.'],
    pressure: ['{team} тисне, м’яч надовго в чужій половині.', '{team} контролює м’яч і шукає прострільну передачу.', '{team} кидається вперед!'],
  };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  /** Шаблони, для яких є всі змінні (родовий відмінок {xG} — лише для українських імен). */
  const usable = (list, v) => list.filter((t) => [...t.matchAll(/\{(\w+)\}/g)].every((m) => v[m[1]] != null));

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
    const gen = opts.gen || (() => null); // родовий відмінок імені (або null)
    const weather = WEATHER[opts.weather] ? opts.weather : 'cloud';
    const WX = WEATHER[weather];
    const shotLog = []; // для підсумку: { t, min, x, y, xg, goal, kind }
    /** Коефіцієнт гравця на цей матч: форма, стабільність (день на день не приходиться), великі матчі. */
    const matchFactor = (p) => {
      const h = p.h || {};
      const form = p.form && p.form.length ? Math.max(-0.03, Math.min(0.03, (p.form.reduce((a, b) => a + b, 0) / p.form.length - 6.6) * 0.02)) : 0;
      const daily = (R.next() - 0.5) * 0.1 * (20 - (h.con || 12)) / 19;
      const big = opts.big ? ((h.big || 10) - 10) * 0.004 : 0;
      return 1 + form + daily + big;
    };
    const sides = [opts.home, opts.away].map((t, k) => {
      const formation = t.formation || bestFormation(t.players);
      const lu = t.lineup || pickLineup(t.players, formation);
      const onPitch = lu.xi.map((x) => ({ p: x.player, slot: x.slot, cond: x.player.fitness ?? 100, yellow: 0, out: false, mf: matchFactor(x.player) }));
      return {
        k, club: t.club, formation, onPitch, autoSubs: !t.manual, boost: t.boost || 1, // boost — збори команди перед матчем
        tactic: { mentality: t.mentality || 'balanced', pressing: t.pressing || 'normal', passing: t.passing || 'mixed' },
        mentality: MENTALITY[t.mentality || 'balanced'] || 0, pressing: PRESSING[t.pressing || 'normal'] || 0, passing: PASSING[t.passing || 'mixed'] || 0,
        bench: lu.bench.slice(), subsLeft: 5, subWindows: 3, units: null,
        stats: { goals: 0, shots: 0, onTarget: 0, poss: 0, yellow: 0, red: 0, xg: 0 },
        perf: new Map(lu.xi.map((x) => [x.player.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true }])),
        lineup: lu, takers: t.takers || {}, marked: new Set(), familiarity: t.familiarity == null ? 1 : t.familiarity,
        stats_extra: null,
      };
    });
    for (const t of sides) Object.assign(t.stats, { corners: 0, fouls: 0 });
    const [H, A] = sides;
    const homeAdv = opts.neutral ? 1 : 1.12;
    const events = [];
    const score = () => `${H.club.name} ${H.stats.goals}:${A.stats.goals} ${A.club.name}`;
    const say = (min, type, team, key, vars = {}) => {
      const text = Array.isArray(key) ? key.join('') : fill(R.pick(T[key]), { home: H.club.name, away: A.club.name, ...vars });
      events.push({ min, type, team: team == null ? null : team.k, text, score: [H.stats.goals, A.stats.goals] });
    };

    function compute(t) {
      t.units = unitsFrom(t.onPitch, t.marked);
      if (t.boost && t.boost !== 1) for (const k of ['att', 'mid', 'def']) t.units[k] *= t.boost; // ефект промови в перерві
      const cap = t.onPitch.find((x) => !x.out && x.p.id === t.takers.captain) || t.onPitch.filter((x) => !x.out).sort((a, b) => (b.p.attrs.lea || 0) - (a.p.attrs.lea || 0))[0];
      if (cap) for (const k of ['att', 'mid', 'def']) t.units[k] *= 1 + ((cap.p.attrs.lea || 10) - 10) * 0.002; // лідерство капітана
      const fam = 0.95 + 0.05 * t.familiarity; // незнайома тактика — до −5%
      for (const k of ['att', 'mid', 'def']) t.units[k] *= fam;
    }

    function chanceRates(min) {
      // контроль м'яча: пресинг відбирає м'яч частіше, короткі передачі його бережуть
      const ctrl = (t) => t.units.mid * (1 + 0.055 * t.pressing - 0.045 * t.passing * (t.passing < 0 && WX.shortPenalty ? WX.shortPenalty : 1));
      const mh = ctrl(H) ** 1.5 * homeAdv, ma = ctrl(A) ** 1.5;
      const share = mh / (mh + ma); // частка володіння господарів
      const rate = (t, o, sh) => {
        let r = 23 * (0.24 + 0.52 * sh); // моментів за матч
        r *= 1 + 0.1 * t.mentality + 0.06 * o.mentality + 0.06 * t.passing; // довгі передачі — більше, але гірших моментів
        // рахунок: хто програє наприкінці — тисне, хто веде — тримає
        const diff = t.stats.goals - o.stats.goals;
        if (min > 60 && diff < 0) r *= 1.25; else if (min > 70 && diff > 0) r *= 0.85;
        return (r * WX.rate) / 94;
      };
      return { share, h: rate(H, A, share) * (opts.neutral ? 1 : 1.09), a: rate(A, H, 1 - share) * (opts.neutral ? 1 : 0.92) };
    }

    const vMul = (x, key) => { const v = variantOf(x.slot); const ins = x.slot.instr; return (v && v[key]) || 1; };
    const insMul = (x) => (x.slot.instr === 'attack' || x.slot.instr === 'free' ? 1.3 : x.slot.instr === 'defend' || x.slot.instr === 'mark' ? 0.6 : 1);
    const pickShooter = (t) => R.weighted(t.onPitch.filter((x) => !x.out && x.slot.role !== 'GK'),
      (x) => ({ ST: 3.2, W: 2, AM: 2, CM: 0.9, DM: 0.4, FB: 0.45, CB: 0.4 }[x.slot.role] || 0.5) * vMul(x, 'shoot') * insMul(x) * (x.p.attrs.fin + x.p.attrs.otb) ** 1.4);
    const pickAssister = (t, shooter) => R.weighted(t.onPitch.filter((x) => !x.out && x !== shooter && x.slot.role !== 'GK'),
      (x) => ({ AM: 2.4, W: 2.2, CM: 1.8, FB: 1.2, ST: 1.1, DM: 0.8, CB: 0.3 }[x.slot.role] || 0.5) * vMul(x, 'assist') * (x.p.attrs.pas + x.p.attrs.cro + x.p.attrs.dri / 2) ** 1.3
        * (x.p.traits && x.p.traits.includes('playmaker') ? 1.3 : 1) * Math.sqrt((x.p.attrs.tec || 10) / 10));
    const hasT = (p, t) => p.traits && p.traits.includes(t);
    const onPitchById = (t, id) => id && t.onPitch.find((x) => !x.out && x.p.id === id);
    /** Виконавець стандарту: призначений у тактиці (якщо на полі) або найкращий за атрибутами. */
    function taker(t, kind) {
      const set = onPitchById(t, t.takers[kind]);
      if (set) return set;
      const key = { pen: (x) => x.p.attrs.fin * 2 + x.p.attrs.dec, fk: (x) => (x.p.attrs.set || 8) * 2 + x.p.attrs.fin, corner: (x) => (x.p.attrs.set || 8) * 2 + (x.p.attrs.cro || 0) }[kind];
      return t.onPitch.filter((x) => !x.out && x.slot.role !== 'GK').sort((a, b) => key(b) - key(a))[0];
    }
    /** Записати удар для підсумку матчу (координати умовні: 100 — ворота суперника). */
    function logShot(t, kind, q, goal) {
      const R2 = R.next(), R3 = R.next();
      const x = kind === 'pen' ? 89 : kind === 'header' || kind === 'corner' ? 88 + R2 * 7 : kind === 'through' ? 80 + R2 * 12 : kind === 'freekick' ? 70 + R2 * 10 : 68 + R2 * 16;
      const y = kind === 'pen' ? 50 : 50 + (R3 - 0.5) * (kind === 'header' || kind === 'corner' ? 24 : 50);
      shotLog.push({ t: t.k, min: minuteNum, x: Math.round(x), y: Math.round(y), xg: Math.round(q * 100) / 100, goal, kind });
    }
    const G = (p) => gen(p) || null;

    function chance(t, o, min) {
      const shooter = pickShooter(t);
      const gkX = o.onPitch.find((x) => !x.out && x.slot.role === 'GK');
      const gkName = gkX ? name(gkX.p) : 'воротар';
      const sPerf = t.perf.get(shooter.p.id);
      t.stats.shots++; sPerf.shots++;
      // якість моменту: атака проти оборони; реалізація: удар проти воротаря
      const ratio = t.units.att / (0.75 * o.units.def + 0.25 * o.units.gk) / RATIO_REF;
      let q = BASE_Q * ratio ** 1.15 * WX.q;
      const finish = (shooter.p.attrs.fin * 0.7 + shooter.p.attrs.dec * 0.3) / 12;
      q *= Math.min(1.5, Math.max(0.6, finish));
      q *= (1 - 0.06 * t.passing * (t.passing > 0 && WX.directPenalty ? 1 / WX.directPenalty : 1)) * (1 + 0.05 * o.pressing); // високий пресинг суперника лишає простір за спиною

      if (R.chance(0.013)) { // пенальті (~0,3 за матч)
        const tk = taker(t, 'pen');
        const tPerf = t.perf.get(tk.p.id);
        say(min, 'chance', t, 'penalty', { p: name(shooter.p), team: t.club.name });
        t.stats.xg += 0.76;
        const goal = R.chance(0.68 + tk.p.attrs.fin * 0.008);
        logShot(t, 'pen', 0.76, goal);
        if (goal) {
          t.stats.goals++; t.stats.onTarget++; tPerf.goals++;
          if (gkX) o.perf.get(gkX.p.id).conceded++;
          say(min, 'goal', t, 'penGoal', { p: name(tk.p) });
        } else {
          if (gkX) o.perf.get(gkX.p.id).saves++;
          say(min, 'miss', t, 'penMiss', { p: name(tk.p), gk: gkName });
        }
        return;
      }
      const sp = shooter.p;
      const kind = R.weighted(['header', 'through', 'solo'], (k) => ({
        header: (1 + sp.attrs.hea / 10) * (hasT(sp, 'header') ? 1.6 : 1) * ((sp.attrs.bra || 10) / 12) ** 0.3,
        through: 2 * (hasT(sp, 'runner') ? 1.5 : 1),
        solo: (1 + sp.attrs.dri / 10) * (hasT(sp, 'shootsLong') || hasT(sp, 'dribbler') ? 1.5 : 1),
      }[k]));
      if (kind === 'solo') q *= 0.7 + 0.3 * ((sp.attrs.lon || sp.attrs.fin) / 12); // удари здалеку — дальні удари
      const assister = kind === 'solo' ? null : pickAssister(t, shooter);
      finishChance(t, o, min, kind, shooter, assister, q, gkX, gkName);
    }

    /** Завершення моменту: гол або сейв / повз / блок / стійка. */
    function finishChance(t, o, min, kind, shooter, assister, q, gkX, gkName) {
      const sPerf = t.perf.get(shooter.p.id);
      const vars = { p: name(shooter.p), pG: G(shooter.p), a: assister ? name(assister.p) : '', aG: assister ? G(assister.p) : null, gk: gkName, gkG: gkX ? G(gkX.p) : null, team: t.club.name };
      const lead = fill(R.pick(usable(T[kind], vars)), vars);
      t.stats.xg += q;
      const goal = R.chance(q);
      logShot(t, kind, q, goal);
      if (assister) t.perf.get(assister.p.id).keyPasses = (t.perf.get(assister.p.id).keyPasses || 0) + 1;
      if (goal) {
        t.stats.goals++; t.stats.onTarget++; sPerf.goals++;
        if (assister) t.perf.get(assister.p.id).assists++;
        if (gkX) o.perf.get(gkX.p.id).conceded++;
        say(min, 'goal', t, [lead, ' ', fill(R.pick(usable(T.goal, vars)), vars), assister ? fill(R.pick(usable(T.goalAssist, vars)), vars) : '']);
      } else {
        const out = R.weighted(['saved', 'wide', 'blocked', 'post'], (k) => ({ saved: 0.4 * (o.units.gk / 12), wide: 0.36, blocked: 0.18, post: 0.06 }[k]));
        if (out === 'saved') { t.stats.onTarget++; if (gkX) o.perf.get(gkX.p.id).saves++; }
        if (out === 'blocked') { // блок — захисник суперника
          const bl = R.weighted(o.onPitch.filter((x) => !x.out && x.slot.role !== 'GK'), (x) => ({ CB: 3, DM: 2, FB: 1.5, CM: 1 }[x.slot.role] || 0.3) * x.p.attrs.pos);
          if (bl) o.perf.get(bl.p.id).blocks = (o.perf.get(bl.p.id).blocks || 0) + 1;
        }
        say(min, 'chance', t, [lead, ' ', fill(R.pick(usable(T[out], vars)), vars)]);
        // кутовий після сейву чи блоку
        if ((out === 'saved' || out === 'blocked' || out === 'wide') && R.chance(out === 'wide' ? 0.15 : 0.7)) corner(t, o, min);
      }
    }

    /** Кутовий: подача й удар головою найкращого в повітрі. */
    function corner(t, o, min) {
      t.stats.corners++;
      if (!R.chance(0.22)) return;
      const tk = taker(t, 'corner');
      const header = t.onPitch.filter((x) => !x.out && x !== tk && x.slot.role !== 'GK').sort((a, b) => (b.p.attrs.hea + b.p.attrs.str / 2) - (a.p.attrs.hea + a.p.attrs.str / 2))[R.int(3)];
      if (!header) return;
      const gkX = o.onPitch.find((x) => !x.out && x.slot.role === 'GK');
      t.stats.shots++; t.perf.get(header.p.id).shots++;
      const q = 0.075 * Math.min(1.5, Math.max(0.6, (header.p.attrs.hea + ((tk.p.attrs.set || 8) + (tk.p.attrs.cro || 8)) / 2) / 26)) * WX.q;
      finishChance(t, o, min, 'corner', header, tk, q, gkX, gkX ? name(gkX.p) : 'воротар');
    }

    /** Прямий штрафний. */
    function freekick(t, o, min) {
      const tk = taker(t, 'fk');
      if (!tk) return;
      const gkX = o.onPitch.find((x) => !x.out && x.slot.role === 'GK');
      t.stats.shots++; t.perf.get(tk.p.id).shots++; t.stats.fouls++;
      const q = 0.055 * Math.min(1.6, Math.max(0.5, ((tk.p.attrs.set || 8) * 1.5 + tk.p.attrs.fin * 0.5) / 26)) * WX.q;
      finishChance(t, o, min, 'freekick', tk, null, q, gkX, gkX ? name(gkX.p) : 'воротар');
    }

    function card(t, min) {
      // гравець із жовтою грає обережніше
      const x = R.weighted(t.onPitch.filter((y) => !y.out), (y) => ({ CB: 2, DM: 2.2, FB: 1.6, CM: 1.3, W: 0.8, AM: 0.8, ST: 0.9, GK: 0.2 }[y.slot.role]) * ((y.p.attrs.tac ?? 3) + 4) / 10 * (y.yellow ? 0.12 : 1) * vMul(y, 'cards') * (y.p.traits && y.p.traits.includes('tackler') ? 1.25 : 1));
      const perf = t.perf.get(x.p.id);
      t.stats.fouls++;
      const vars = { p: name(x.p), pG: G(x.p), team: t.club.name };
      if (R.chance(0.012)) { x.out = true; perf.red = true; t.stats.red++; say(min, 'red', t, 'red', vars); compute(t); return; }
      x.yellow++; perf.yellow++; t.stats.yellow++;
      if (x.yellow >= 2) { x.out = true; perf.red = true; t.stats.red++; say(min, 'red', t, 'red2', vars); compute(t); return; }
      say(min, 'yellow', t, [fill(R.pick(usable(T.yellow, vars)), vars)]);
    }

    /** Травма: гравця міняють (навіть якщо заміни ручні), а як замін немає — команда грає в меншості. */
    function injury(t, min) {
      const x = R.weighted(t.onPitch.filter((y) => !y.out), (y) => (y.slot.role === 'GK' ? 0.3 : 1) * (125 - y.cond) * (0.6 + ((y.p.h && y.p.h.inj) || 8) / 20));
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
        t.onPitch.push({ p: best, slot: x.slot, cond: best.fitness ?? 100, yellow: 0, out: false, subbedOn: minuteNum, mf: matchFactor(best) });
        t.perf.set(best.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true, from: minuteNum });
        t.subsLeft--;
        say(min, 'sub', t, [fill(R.pick(usable(T.sub, { team: t.club.name, on: name(best), off: name(x.p), offG: G(x.p) })), { team: t.club.name, on: name(best), off: name(x.p), offG: G(x.p) })]);
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
        t.onPitch.push({ p: best, slot: tired.slot, cond: best.fitness ?? 100, yellow: 0, out: false, subbedOn: min, mf: matchFactor(best) });
        t.perf.set(best.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true, from: min });
        t.subsLeft--; made++;
        say(min, 'sub', t, [fill(R.pick(usable(T.sub, { team: t.club.name, on: name(best), off: name(tired.p), offG: G(tired.p) })), { team: t.club.name, on: name(best), off: name(tired.p), offG: G(tired.p) })]);
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
      t.onPitch.push({ p: b, slot: x.slot, cond: b.fitness ?? 100, yellow: 0, out: false, subbedOn: minuteNum || 1, mf: matchFactor(b) });
      t.perf.set(b.id, { min: 0, goals: 0, assists: 0, shots: 0, saves: 0, conceded: 0, yellow: 0, red: false, played: true, from: minuteNum });
      t.subsLeft--;
      say(current, 'sub', t, [fill(R.pick(usable(T.sub, { team: t.club.name, on: name(b), off: name(x.p), offG: G(x.p) })), { team: t.club.name, on: name(b), off: name(x.p), offG: G(x.p) })]);
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

    /** Перейти на іншу схему посеред матчу: гравці на полі перерозподіляються по нових позиціях. */
    function setShape(k, formation, tac) {
      const t = sides[k];
      if (done || !FORMATIONS[formation]) return false;
      const slots = slotsFor(formation, tac);
      const live = t.onPitch.filter((x) => !x.out);
      const free = live.slice();
      const order = slots.map((sl, i) => i).sort((i, j) => (slots[i].role === 'GK' ? -1 : 0) - (slots[j].role === 'GK' ? -1 : 0));
      const assigned = new Map();
      for (const i of order) {
        if (!free.length) break;
        let best = free[0], bv = -1;
        for (const x of free) { const v = slotValue(x.p, slots[i]); if (v > bv) { bv = v; best = x; } }
        assigned.set(best, slots[i]);
        free.splice(free.indexOf(best), 1);
      }
      for (const [x, sl] of assigned) x.slot = sl;
      t.formation = formation;
      if (tac) setTactics(k, tac);
      t.familiarity = tac && tac.familiarity != null ? tac.familiarity : t.familiarity;
      compute(t);
      say(current, 'info', t, [`${t.club.name} перебудовується на ${formation}.`]);
      return true;
    }

    /** Промова в перерві: множник сили на другий тайм і мораль гравців на полі. */
    function halftimeTalk(k, kind, mult = 1) {
      const t = sides[k], o = sides[1 - k];
      if (!FM.morale || t.talked) return null;
      const e = FM.morale.talkEffect(kind, t.stats.goals - o.stats.goals, R);
      if (mult !== 1) { e.boost = 1 + (e.boost - 1) * (e.boost > 1 ? mult : 1); e.morale = e.morale > 0 ? e.morale * mult : e.morale; } // мотивація тренера
      t.talked = true; t.boost = e.boost;
      for (const x of t.onPitch) if (!x.out) x.p.morale = Math.max(0, Math.min(100, FM.morale.get(x.p) + e.morale));
      compute(t);
      say(current, 'info', t, [`Перерва, роздягальня ${t.club.name}: ${e.text}`]);
      return e;
    }

    // ---- матч ----
    // персональна опіка: найкращий атакувальний гравець суперника грає гірше
    for (const t of sides) {
      if (!t.onPitch.some((x) => x.slot.instr === 'mark')) continue;
      const o = sides[1 - t.k];
      const star = o.onPitch.filter((x) => ['ST', 'AM', 'W'].includes(x.slot.role)).sort((a, b) => slotValue(b.p, b.slot) - slotValue(a.p, a.slot))[0];
      if (star) o.marked.add(star.p.id);
    }
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
      if (e.pi === 1 && timeline[idx - 2] && timeline[idx - 2].pi === 0) say(46, 'half', null, 'second'); // перша хвилина другого тайму (не компенсація першого)
      const cr = chanceRates(e.m);
      possH += cr.share; ticks++;
      // втома: витривалість, пресинг
      for (const t of sides) for (const x of t.onPitch) if (!x.out) x.cond = Math.max(30, x.cond - (0.42 - x.p.attrs.sta * 0.014) * (x.slot.role === 'GK' ? 0.3 : 1 + 0.25 * t.pressing) * WX.tire);
      if (e.m % 5 === 0) { compute(H); compute(A); }
      if (R.chance(cr.h)) chance(H, A, e.label);
      if (R.chance(cr.a)) chance(A, H, e.label);
      for (const t of sides) if (R.chance(1.9 / 94 * (1 + 0.2 * t.pressing) * (opts.derby ? 1.35 : 1))) card(t, e.label); // у дербі — більше карток
      for (const t of sides) if (R.chance(0.0045 * WX.rate)) freekick(t, sides[1 - t.k], e.label);
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
      const RS = FM.rng(String(opts.seed) + ':stats'); // окреме зерно: статистика не змінює перебіг матчу
      const poss = [H.stats.poss || 50, 100 - (H.stats.poss || 50)];
      for (const t of sides) {
        const o = sides[1 - t.k];
        // командні обсяги: передачі — від володіння, відбори — від володіння суперника
        const teamPasses = Math.round(poss[t.k] * (9 + 0.8 * t.passing * -1) * RS.range(0.92, 1.08));
        const teamDef = (100 - poss[t.k]) * 0.36 * (1 + 0.15 * t.pressing);
        const W8 = {
          pass: { GK: 0.5, CB: 1.15, FB: 1, DM: 1.45, CM: 1.5, AM: 1.1, W: 0.85, ST: 0.55 },
          tack: { GK: 0, CB: 1.2, FB: 1.1, DM: 1.6, CM: 0.95, AM: 0.4, W: 0.45, ST: 0.25 },
          int: { GK: 0, CB: 1.5, FB: 1, DM: 1.4, CM: 0.8, AM: 0.3, W: 0.3, ST: 0.15 },
          drib: { GK: 0, CB: 0.15, FB: 0.6, DM: 0.35, CM: 0.6, AM: 1.3, W: 1.7, ST: 0.9 },
        };
        const live = t.onPitch.map((x) => ({ x, m: ((x.subbedOff || 93) - (x.subbedOn || 0)) / 93 }));
        const share = (key, attr) => { const ws = live.map(({ x, m }) => (W8[key][x.slot.role] || 0.5) * ((x.p.attrs[attr] || 10) / 12) * m); const sum = ws.reduce((a, b) => a + b, 0) || 1; return ws.map((w) => w / sum); };
        const sp = share('pass', 'pas'), st = share('tack', 'tac'), si = share('int', 'pos'), sd = share('drib', 'dri');
        let tPass = 0, tOk = 0, tTack = 0;
        live.forEach(({ x }, i) => {
          const pf = t.perf.get(x.p.id);
          pf.passes = Math.round(teamPasses * sp[i] * RS.range(0.8, 1.2));
          const acc = Math.max(0.55, Math.min(0.95, 0.72 + ((x.p.attrs.pas || 10) - 10) * 0.016 + ((x.p.attrs.dec || 10) - 10) * 0.006 - 0.025 * t.passing - 0.03 * o.pressing + RS.range(-0.04, 0.04)));
          pf.passOk = Math.round(pf.passes * acc);
          pf.tackles = Math.round(teamDef * 0.55 * st[i] * RS.range(0.6, 1.4));
          pf.interceptions = Math.round(teamDef * 0.35 * si[i] * RS.range(0.6, 1.4));
          pf.dribbles = Math.round(poss[t.k] * 0.16 * sd[i] * RS.range(0.5, 1.5));
          pf.duels = Math.round((pf.tackles + pf.dribbles) * (0.9 + ((x.p.attrs.str || 10) + (x.p.attrs.bra || 10) - 20) * 0.02) + RS.int(3));
          tPass += pf.passes; tOk += pf.passOk; tTack += pf.tackles;
        });
        t.stats.passes = tPass; t.stats.passPct = tPass ? Math.round((tOk / tPass) * 100) : 0; t.stats.tackles = tTack;
      }
      for (const t of sides) {
        const o = sides[1 - t.k];
        const res = Math.sign(t.stats.goals - o.stats.goals);
        for (const x of t.onPitch) {
          const pf = t.perf.get(x.p.id);
          const minutes = (x.subbedOff || 93) - (x.subbedOn || 0);
          let r = 6.3 + 0.25 * res + pf.goals * 1.0 + pf.assists * 0.6 + pf.shots * 0.05 - pf.yellow * 0.2 - (pf.red ? 1.5 : 0);
          r += (pf.keyPasses || 0) * 0.12 + ((pf.tackles || 0) + (pf.interceptions || 0) + (pf.blocks || 0)) * 0.03 + (pf.passes ? (pf.passOk / pf.passes - 0.8) * 0.8 : 0);
          if (x.slot.role === 'GK') r += pf.saves * 0.25 - pf.conceded * 0.35 + (o.stats.goals === 0 ? 0.6 : 0);
          else if (LINE[x.slot.role] === 'def') r += (o.stats.goals === 0 ? 0.5 : -0.15 * o.stats.goals);
          r += (slotValue(x.p, x.slot) - 12) * 0.06 + R.range(-0.35, 0.35);
          if (minutes < 20) r = 6 + (r - 6) * 0.5;
          ratings.push({ team: t.k, id: x.p.id, player: x.p, role: x.slot.role, rating: Math.round(Math.max(3, Math.min(10, r)) * 10) / 10,
            goals: pf.goals, assists: pf.assists, yellow: pf.yellow, red: pf.red, injury: pf.injury || 0, on: x.subbedOn || null, off: x.subbedOff || null, cond: Math.round(x.cond),
            slot: x.slot, out: !!x.out, st: { min: minutes, shots: pf.shots, keyPasses: pf.keyPasses || 0, passes: pf.passes || 0, passOk: pf.passOk || 0, tackles: pf.tackles || 0,
              interceptions: pf.interceptions || 0, blocks: pf.blocks || 0, dribbles: pf.dribbles || 0, duels: pf.duels || 0, saves: pf.saves, conceded: pf.conceded } });
        }
      }
      const motm = [...ratings].sort((a, b) => b.rating - a.rating)[0];
      final = {
        score: [H.stats.goals, A.stats.goals], events,
        stats: [H.stats, A.stats].map((st) => ({ ...st, xg: Math.round(st.xg * 100) / 100 })),
        ratings, motm, formations: [H.formation, A.formation], units: startUnits,
        lineups: sides.map((t) => t.lineup), shots: shotLog, weather,
        fitness: sides.flatMap((t) => t.onPitch.map((x) => [x.p.id, Math.round(x.cond), x.subbedOn ? 93 - x.subbedOn : (x.subbedOff || 93)])),
      };
      return final;
    }

    /** Статистика наживо (володіння — за зіграні хвилини). */
    function liveStats() {
      const ph = ticks ? Math.round((possH / ticks) * 100) : 50;
      return sides.map((t, k) => ({ ...t.stats, poss: k === 0 ? ph : 100 - ph, xg: Math.round(t.stats.xg * 100) / 100 }));
    }

    return {
      step, result, sub, setTactics, setShape, halftimeTalk, liveStats, sides, events, shots: shotLog, weather,
      get halftime() { return idx > 0 && idx < timeline.length && timeline[idx - 1].pi === 0 && timeline[idx].pi === 1; },
      get done() { return done; },
      get minute() { return current; },
      get minuteNum() { return minuteNum; },
    };
  }

  /** Зіграти матч від початку до кінця. */
  function play(opts) { return create(opts).result(); }

  Object.assign(FM, { FORMATIONS, VARIANTS, INSTR, WEATHER, weatherFor, slotsFor, unitWeight, roleRating, fit, slotValue, pickLineup, lineupFromIds, bestFormation, lineupUnits,
    match: { play, create, MENTALITY, PRESSING, PASSING, TACTIC_UK } });
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
