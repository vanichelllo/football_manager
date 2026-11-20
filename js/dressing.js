// Розширення 4: роздягальня — групи впливу, лідери, збори команди, реакція на продаж лідера.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const LANG = { ENG: 'англомовні', SCO: 'англомовні', WAL: 'англомовні', IRL: 'англомовні', NIR: 'англомовні', USA: 'англомовні', CAN: 'англомовні', AUS: 'англомовні', JAM: 'англомовні',
    ESP: 'іспаномовні', ARG: 'іспаномовні', URU: 'іспаномовні', COL: 'іспаномовні', MEX: 'іспаномовні', ECU: 'іспаномовні', CHI: 'іспаномовні', PAR: 'іспаномовні', VEN: 'іспаномовні', PER: 'іспаномовні',
    BRA: 'португаломовні', POR: 'португаломовні', CPV: 'португаломовні', ANG: 'португаломовні',
    FRA: 'франкомовні', SEN: 'франкомовні', CIV: 'франкомовні', MLI: 'франкомовні', CMR: 'франкомовні', GUI: 'франкомовні', BFA: 'франкомовні', COD: 'франкомовні', ALG: 'франкомовні', MAR: 'франкомовні', TUN: 'франкомовні', BEL: 'франкомовні', SUI: 'франкомовні',
    GER: 'німецькомовні', AUT: 'німецькомовні', UKR: 'українці', ITA: 'італійці', NED: 'нідерландці', TUR: 'турки', POL: 'поляки',
    SRB: 'балканці', CRO: 'балканці', BIH: 'балканці', SVN: 'балканці', MNE: 'балканці', MKD: 'балканці' };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** Вплив гравця в роздягальні 0–100: лідерство, вік, матчі за збірну, рівень. */
  function influence(W, p) {
    const age = W.age(p) ?? 24;
    return Math.round(clamp((p.attrs.lea || 10) * 2.5 + Math.max(0, age - 20) * 1.6 + Math.min(p.caps || 0, 80) * 0.25 + (p.ca - 100) * 0.25 + (p.trust || 0) * 3, 0, 100));
  }
  /** Групи впливу: мова/країна (3+ гравці), ветерани (30+), молодь (до 21). */
  function groups(W, clubId) {
    const sq = W.squad(clubId);
    const by = {};
    for (const p of sq) { const k = LANG[p.nat] || null; if (k) (by[k] = by[k] || []).push(p); }
    const out = Object.entries(by).filter(([, l]) => l.length >= 3).map(([k, l]) => ({ id: 'lang:' + k, label: k[0].toUpperCase() + k.slice(1), players: l }));
    const vets = sq.filter((p) => (W.age(p) ?? 24) >= 30), kids = sq.filter((p) => (W.age(p) ?? 24) <= 21);
    if (vets.length >= 3) out.push({ id: 'vets', label: 'Ветерани', players: vets });
    if (kids.length >= 3) out.push({ id: 'kids', label: 'Молодь', players: kids });
    for (const g of out) {
      g.players.sort((a, b) => influence(W, b) - influence(W, a));
      g.leader = g.players[0];
      g.mood = Math.round(g.players.reduce((s, p) => s + FM.morale.get(p), 0) / g.players.length);
    }
    return out.sort((a, b) => b.players.length - a.players.length);
  }
  /** Лідери команди: троє з найбільшим впливом. */
  const leaders = (W, clubId) => W.squad(clubId).sort((a, b) => influence(W, b) - influence(W, a)).slice(0, 3);

  // ---------------- Збори команди ----------------
  const MEET = {
    motivate: { label: 'Налаштувати на важливий матч', hint: 'Найкраще перед дербі, топ-матчем чи кубком. Перед рядовою грою — менший ефект.' },
    demand: { label: 'Жорстка розмова', hint: 'Після серії поразок може струсонути команду. Коли все добре — дратує.' },
    praise: { label: 'Подякувати за роботу', hint: 'Після вдалої серії піднімає настрій. Якщо результатів немає — сприймуть як слабкість.' },
    unity: { label: 'Об’єднати групи', hint: 'Коли групи в роздягальні мають дуже різний настрій — зближує їх.' },
  };
  const weekKey = (S) => S.year * 100 + S.week;
  /** Останні результати клубу людини (ліга): [+1 / 0 / −1, …] від найновішого. */
  function recent(S, clubId, n = 4) {
    return S.fixtures.filter((f) => f.s && (f.h === clubId || f.a === clubId)).sort((a, b) => b.w - a.w).slice(0, n)
      .map((f) => Math.sign(f.h === clubId ? f.s[0] - f.s[1] : f.s[1] - f.s[0]));
  }
  /** Чи можна збирати команду (раз на 3 тижні). */
  const canMeet = (state) => !state.meeting || weekKey(state.season) - state.meeting.at >= 3;

  /**
   * Провести збори. big — наступний матч важливий (дербі, кубок, топ-суперник).
   * Повертає { text, good }. Ефект: настрій усіх і бонус сили на найближчий матч (state.meeting.boost).
   */
  function meet(W, state, kind, big) {
    const S = state.season, R = FM.rng(`meet-${S.seed}-${S.year}-${S.week}-${kind}`);
    const mot = FM.career ? FM.career.attr(state, 'mot') : 10;
    const res = recent(S, state.clubId), sum = res.reduce((a, b) => a + b, 0);
    const gs = groups(W, state.clubId);
    let good, mor, boost, text;
    const skill = (mot - 10) * 0.03;
    if (kind === 'motivate') { good = big ? R.chance(0.7 + skill) : R.chance(0.45 + skill); mor = good ? 3 : -1; boost = good ? (big ? 1.035 : 1.015) : 0.99;
      text = good ? (big ? 'Команда вийде на матч заряджена.' : 'Гравці налаштувалися, хоча матч і рядовий.') : 'Гравці не відчули, що матч особливий.'; }
    else if (kind === 'demand') { good = sum <= -2 ? R.chance(0.6 + skill) : R.chance(0.2 + skill); mor = good ? 2 : -5; boost = good ? 1.03 : 0.98;
      text = good ? 'Жорстка розмова струсонула команду.' : sum > 0 ? 'Гравці не розуміють, за що їх сварять після перемог.' : 'Розмова пройшла важко: частина команди образилася.'; }
    else if (kind === 'praise') { good = sum >= 2 ? R.chance(0.8 + skill) : R.chance(0.3 + skill); mor = good ? 5 : -2; boost = good ? 1.01 : 0.995;
      text = good ? 'Гравцям приємно: їхню роботу помітили.' : 'Похвала без результатів прозвучала дивно.'; }
    else { const spread = gs.length ? Math.max(...gs.map((g) => g.mood)) - Math.min(...gs.map((g) => g.mood)) : 0;
      good = spread >= 15 ? R.chance(0.65 + skill) : R.chance(0.35 + skill); mor = good ? 2 : 0; boost = 1;
      text = good ? 'Групи в роздягальні стали ближчими.' : 'Роздягальня й так дружна — збори нічого не змінили.';
      if (good) for (const g of gs) for (const p of g.players) p.morale = clamp(FM.morale.get(p) + (60 - g.mood) * 0.3, 0, 100); }
    for (const id of W.club(state.clubId).players) { const p = W.player(id); p.morale = clamp(FM.morale.get(p) + mor, 0, 100); }
    state.meeting = { at: weekKey(S), kind, good, boost, for: S.week };
    return { text, good };
  }
  /** Бонус від зборів на матч цього тижня. */
  const matchBoost = (state) => (state.meeting && state.meeting.for === state.season.week && state.meeting.at === weekKey(state.season) ? state.meeting.boost : 1);

  /** Продали гравця людини: якщо він лідер — його група (і трохи вся команда) засмучена. */
  function onSale(W, state, p) {
    const inf = influence(W, p);
    if (inf < 55) return null;
    const gs = groups(W, state.clubId);
    const hit = new Set();
    for (const g of gs) if (g.players.length && LANG[p.nat] && g.id === 'lang:' + LANG[p.nat]) for (const x of g.players) hit.add(x.id);
    for (const id of W.club(state.clubId).players) {
      const x = W.player(id);
      x.morale = clamp(FM.morale.get(x) - (hit.has(id) ? 8 : 3), 0, 100);
    }
    return `Роздягальня засмучена: пішов лідер ${p.name}.${hit.size ? ' Найбільше переживають його друзі.' : ''}`;
  }

  FM.dressing = { LANG, MEET, influence, groups, leaders, recent, canMeet, meet, matchBoost, onSale };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
