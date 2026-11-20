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
  /**
   * Найкращі друзі в команді: пари співвітчизників чи гравців однієї мови, близьких за віком.
   * Детерміновано (без випадковості між сеансами). Повертає [[a, b], …].
   */
  function friends(W, clubId) {
    const sq = W.squad(clubId).filter((p) => !p.loan);
    const h = (s) => { let x = 7; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) % 1000003; return x / 1000003; };
    const cands = [];
    for (let i = 0; i < sq.length; i++) for (let j = i + 1; j < sq.length; j++) {
      const a = sq[i], b = sq[j];
      const same = a.nat === b.nat ? 2 : LANG[a.nat] && LANG[a.nat] === LANG[b.nat] ? 1 : 0;
      const gap = Math.abs((W.age(a) ?? 25) - (W.age(b) ?? 25));
      if (!same || gap > 5) continue;
      cands.push([same + (5 - gap) * 0.3 + h(a.id + b.id) * 0.5, a, b]);
    }
    cands.sort((x, y) => y[0] - x[0]);
    const used = new Set(), out = [];
    for (const [, a, b] of cands) if (!used.has(a.id) && !used.has(b.id)) { used.add(a.id); used.add(b.id); out.push([a, b]); }
    return out;
  }
  const friendOf = (W, clubId, pid) => { for (const [a, b] of friends(W, clubId)) { if (a.id === pid) return b; if (b.id === pid) return a; } return null; };
  /** Новачок: співвітчизники в команді допомагають адаптуватися. */
  function onArrive(W, state, p) {
    const mates = W.squad(state.clubId).filter((x) => x !== p && (x.nat === p.nat || (LANG[p.nat] && LANG[x.nat] === LANG[p.nat])));
    if (mates.length >= 2) { p.morale = clamp(FM.morale.get(p) + 6, 0, 100); return `${p.name} швидко освоюється: у команді ${mates.length} гравців, які говорять його мовою.`; }
    if (!mates.length && !LANG[p.nat]) { p.morale = clamp(FM.morale.get(p) - 4, 0, 100); return `${p.name} поки почувається самотньо: у команді немає жодного співвітчизника.`; }
    return null;
  }

  function onSale(W, state, p) {
    const fr = friendOf(W, state.clubId, p.id);
    let friendTxt = '';
    if (fr) { fr.morale = clamp(FM.morale.get(fr) - 10, 0, 100); friendTxt = ` ${fr.name} сумує за найкращим другом.`; }
    const inf = influence(W, p);
    if (inf < 55) return friendTxt ? friendTxt.trim() : null;
    const gs = groups(W, state.clubId);
    const hit = new Set();
    for (const g of gs) if (g.players.length && LANG[p.nat] && g.id === 'lang:' + LANG[p.nat]) for (const x of g.players) hit.add(x.id);
    for (const id of W.club(state.clubId).players) {
      const x = W.player(id);
      x.morale = clamp(FM.morale.get(x) - (hit.has(id) ? 8 : 3), 0, 100);
    }
    return `Роздягальня засмучена: пішов лідер ${p.name}.${hit.size ? ' Найбільше переживають його друзі.' : ''}${friendTxt}`;
  }

  FM.dressing = { friends, friendOf, onArrive, LANG, MEET, influence, groups, leaders, recent, canMeet, meet, matchBoost, onSale };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
