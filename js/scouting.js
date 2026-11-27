// Скаутські завдання (як прийнято в жанрі): скаут шукає гравців за вашими критеріями — де шукати, позиція, вік,
// рівень, максимальна ціна — і щотижня надсилає рекомендації з оцінкою A–D: сильні й слабкі сторони, ціна,
// чи захоче перейти. Рекомендації живуть 12 тижнів; їх можна додати до шортлиста або відхилити.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const AGES = [['any', 'будь-який', 0, 99], ['u21', 'до 21', 0, 21], ['u24', 'до 24', 0, 24], ['prime', '24–29', 24, 29], ['exp', '30+', 30, 99]];
  const LEVELS = [['first', 'підсилення основи'], ['rotation', 'гравець ротації'], ['prospect', 'перспективний'], ['any', 'будь-який']];
  const PRICES = [0, 0.5, 1, 2, 5, 10, 20, 50]; // млн €, 0 — без обмеження
  const POS = ['any', 'GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
  const defTask = () => ({ area: 'all', pos: 'any', age: 'any', level: 'first', price: 0 });
  const tick = (S) => S.year * 60 + S.week;
  const KEEP = 12; // тижнів живе рекомендація

  /** Підпис завдання людською мовою. */
  function describe(W, task) {
    const t = { ...defTask(), ...task };
    const area = t.area === 'all' ? 'усі ліги' : t.area === 'my' ? 'своя ліга' : t.area === 'free' ? 'вільні агенти' : (W.league(t.area) || {}).name || t.area;
    const pos = t.pos === 'any' ? 'будь-яка позиція' : FM.ROLE_NAME[t.pos].toLowerCase();
    const age = AGES.find((a) => a[0] === t.age)[1], lvl = LEVELS.find((l) => l[0] === t.level)[1];
    return `${area}; ${pos}; вік ${age}; ${lvl}${t.price ? `; до ${FM.market.fmtM(t.price)}` : ''}`;
  }

  /** Попередній відбір без важких розрахунків. */
  function pool(W, state, task) {
    const t = { ...defTask(), ...task }, S = state.season, me = W.club(state.clubId);
    const [, , a0, a1] = AGES.find((a) => a[0] === t.age);
    const myLvl = W.clubLevel(me.id);
    const out = [];
    for (const p of W.players.values()) {
      if (p.retired || p.virtual || p.talent || p.club === state.clubId || (p.loan && p.loan.to === state.clubId)) continue;
      if (t.area === 'free') { if (p.club || !p.free) continue; }
      else {
        if (!p.club) continue;
        const lg = W.club(p.club).league;
        if (t.area === 'my' ? lg !== me.league : t.area !== 'all' && lg !== t.area) continue;
        if (W.clubLevel(p.club) - myLvl > 25) continue; // із набагато сильнішого клубу не перейде
      }
      if (t.pos !== 'any' && !p.roles.includes(t.pos)) continue;
      const age = W.age(p) ?? 25;
      if (age < a0 || age > a1) continue;
      if (t.level === 'prospect' && age > 21) continue;
      if (t.price && p.club && FM.market.askingPrice(W, p, S) > t.price) continue;
      out.push(p);
    }
    return out;
  }

  /** Випадкова вибірка n елементів (часткове перемішування). */
  function sample(arr, n, R) {
    const a = arr.slice(), k = Math.min(n, a.length);
    for (let i = 0; i < k; i++) { const j = i + R.int(a.length - i); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, k);
  }

  const OK = { first: ['A', 'B'], rotation: ['B', 'C'], prospect: ['A', 'B', 'C'], any: ['A', 'B', 'C'] };
  /** Чи підходить звіт під рівень завдання. */
  function fits(rep, level, p, W) {
    if (!OK[level].includes(rep.grade)) return false;
    if (level === 'prospect') return (W.age(p) ?? 25) <= 21 && rep.notes.some((n) => n.startsWith('перспектива'));
    return true;
  }

  /**
   * Тиждень: скаути із завданням надсилають рекомендації. Повертає [{ text, pid }] для пошти.
   * Кращий скаут переглядає більше кандидатів і рідше помиляється з оцінкою.
   */
  function week(W, state) {
    const S = state.season, now = tick(S), out = [];
    state.scoutRecs = (state.scoutRecs || []).filter((r) => { const p = W.player(r.pid); return p && !p.retired && p.club !== state.clubId && now - r.t <= KEEP; });
    for (const sc of FM.market.scouts(state)) {
      if (sc.region !== 'task') continue;
      sc.task = { ...defTask(), ...(sc.task || {}) };
      const R = FM.rng(`srec-${S.seed}-${S.year}-${S.week}-${sc.id}`);
      if (!R.chance(0.35 + sc.level * 0.025)) continue;
      sc.seen = (sc.seen || []).slice(-60);
      const cands = pool(W, state, sc.task).filter((p) => !sc.seen.includes(p.id) && !state.scoutRecs.some((r) => r.pid === p.id) && !(state.shortlist || []).includes(p.id));
      if (!cands.length) {
        if (!sc.empty) out.push({ text: `Скаут ${sc.name}: за критеріями (${describe(W, sc.task)}) нікого не знайшов. Розширте пошук.` });
        sc.empty = true; continue;
      }
      sc.empty = false;
      const look = sample(cands, 4 + sc.level, R);
      const GR = { A: 4, B: 3, C: 2, D: 1 };
      const scored = look.map((p) => ({ p, rep: FM.deals.report(W, state, p, { ca: p.ca, pa: p.pa, known: true }) })).filter((x) => fits(x.rep, sc.task.level, x.p, W));
      if (!scored.length) continue; // цього тижня нічого гідного
      scored.sort((a, b) => GR[b.rep.grade] - GR[a.rep.grade] || b.p.ca - a.p.ca);
      // слабкий скаут іноді рекомендує не найкращого
      const pick = R.chance((20 - sc.level) / 40) ? R.pick(scored) : scored[0];
      const { p, rep } = pick;
      sc.seen.push(p.id);
      state.known = state.known || {}; state.known[p.id] = true; // скаут бачив його наживо
      const ask = p.club ? FM.market.askingPrice(W, p, S) : 0;
      const keen = !p.club ? 'вільний агент' : W.clubLevel(state.clubId) >= W.clubLevel(p.club) ? 'охоче перейде' : W.clubLevel(p.club) - W.clubLevel(state.clubId) > 12 ? 'перейде неохоче' : 'готовий говорити';
      const rec = { id: `${now}-${sc.id}-${p.id}`, pid: p.id, scout: sc.name, t: now, grade: rep.grade, text: rep.text, pros: rep.pros, cons: rep.cons, ask, keen };
      state.scoutRecs.push(rec);
      out.push({ pid: p.id, text: `Скаут ${sc.name} рекомендує: ${p.name} (${p.club ? W.club(p.club).name : 'вільний агент'}, ${FM.positions(p)}, ${W.age(p)} р.) — оцінка ${rep.grade}: ${rep.text.toLowerCase()}.`
        + `${rep.pros.length ? ` Сильні сторони: ${rep.pros.join(', ')}.` : ''}${rep.cons.length ? ` Слабкі: ${rep.cons.join(', ')}.` : ''} ${p.club ? `Ціна ~${FM.market.fmtM(ask)}, ${keen}.` : 'Можна підписати без компенсації.'}` });
    }
    state.scoutRecs = state.scoutRecs.slice(-30);
    return out;
  }

  const dismiss = (state, id) => { state.scoutRecs = (state.scoutRecs || []).filter((r) => r.id !== id); };

  FM.scouting = { AGES, LEVELS, PRICES, POS, defTask, describe, pool, week, dismiss, KEEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
