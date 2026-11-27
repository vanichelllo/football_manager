// Переговори про контракт (як прийнято в жанрі): статус у складі, зарплата й термін, підйомні, бонус за лояльність,
// агентські; бонуси за матч, гол, суху гру, невихід із запасу; пункти — щорічне підвищення, підвищення при виході
// в лігу вище, зниження при вильоті, мінімальні відступні, опція продовження. Агент оцінює пакет загалом:
// зарплату можна «добрати» бонусами й пунктами. Раундів небагато — жадібний агент швидко втрачає терпіння.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;

  const STATUS = { key: 'Ключовий гравець', first: 'Гравець основи', rotation: 'Ротація', backup: 'Запасний', prospect: 'Перспективний', youth: 'Молодий гравець', notneeded: 'Не потрібен' };
  const ORDER = ['key', 'first', 'rotation', 'backup', 'prospect', 'youth', 'notneeded'];
  const RANK = { key: 4, first: 3, rotation: 2, prospect: 1.5, backup: 1, youth: 0.5, notneeded: 0 }; // наскільки статус «вищий»
  const SHARE = { key: 0.85, first: 0.7, rotation: 0.45, backup: 0.2, prospect: 0.25, youth: 0.1, notneeded: 0.05 }; // частка матчів, якої чекає

  /** Статус, на який гравець розраховує в цьому клубі (за силою серед гравців клубу). */
  function expected(W, p, clubId) {
    const sq = W.squad(clubId).filter((x) => x.id !== p.id && !x.loan).sort((a, b) => b.ca - a.ca);
    const rank = sq.filter((x) => x.ca > p.ca).length;
    const age = W.age(p) ?? 24;
    if (age <= 18 && rank >= 11) return 'youth';
    if (age <= 21 && (p.pa || 0) >= p.ca + 18 && rank >= 11) return 'prospect';
    if (rank < 3) return 'key';
    if (rank < 11) return 'first';
    if (rank < 17) return 'rotation';
    return 'backup';
  }
  /** Скільки років хоче гравець: молоді — довше, ветерани — коротше. */
  function prefYears(W, p) { const a = W.age(p) ?? 25; return a <= 23 ? 5 : a <= 27 ? 4 : a <= 30 ? 3 : 2; }

  /** Звичні бонуси для цієї зарплати й позиції (тис. €). */
  function typicalBonuses(p, wage) {
    const r = p.roles[0], atk = ['ST', 'W', 'AM'].includes(r), def = ['GK', 'CB', 'FB'].includes(r);
    return { app: Math.max(1, Math.round(wage * 0.06)), goal: atk ? Math.round(wage * 0.15) : 0, clean: def ? Math.round(wage * 0.1) : 0, unused: Math.round(wage * 0.02) };
  }
  /** Початкова пропозиція клубу (те, що бачить тренер, відкривши переговори). */
  function draft(W, state, p, clubId, kind) {
    const base = kind === 'renew' ? FM.market.renewDemand(W, p) : FM.market.wageDemand(W, p, clubId);
    const wage = Math.round((base || p.wage || 5) * 0.85);
    return { status: expected(W, p, clubId), wage, years: prefYears(W, p), signOn: 0, loyalty: 0, agent: kind === 'renew' ? 0 : r2(FM.market.agentFee(0, wage, p)),
      bonus: { app: 0, goal: 0, clean: 0, unused: 0 }, clause: { rise: 0, promo: 0, releg: 0, release: 0, ext: false } };
  }

  /** Що агент вважає справедливим: вимога (тис. €/тиж.) з поправками на статус, термін, характер. */
  function required(W, state, p, clubId, offer, kind) {
    const base = kind === 'renew' ? FM.market.renewDemand(W, p) : FM.market.wageDemand(W, p, clubId);
    if (base == null) return null;
    const exp = expected(W, p, clubId);
    const steps = RANK[exp] - RANK[offer.status];
    let k = 1;
    if (steps > 0) k *= 1 + steps * 0.14; // нижчий статус — хоче більше грошей
    else if (steps < 0) k *= 1 + steps * 0.04; // вищий — радий, просить трохи менше
    const dy = Math.abs(offer.years - prefYears(W, p));
    k *= 1 + dy * 0.03;
    if (offer.clause.ext) k *= 1.03; // опція продовження — на користь клубу
    if (offer.clause.releg) k *= 1 + offer.clause.releg / 100 * 0.25;
    if (offer.clause.release > 0) k *= offer.clause.release <= (p.value || 1) * 1.6 ? 0.92 : 0.96; // відступні — гравцеві подобається свобода
    return Math.round(base * k);
  }
  /** Вартість пакета для гравця в «тижневому еквіваленті» (тис. €/тиж.). */
  function worth(W, p, offer) {
    const st = SHARE[offer.status] ?? 0.4, r = p.roles[0];
    const goalsPerMatch = { ST: 0.4, W: 0.25, AM: 0.25, CM: 0.1, DM: 0.05, FB: 0.04, CB: 0.04, GK: 0 }[r] || 0.05;
    const cleanP = ['GK', 'CB', 'FB'].includes(r) ? 0.3 : 0;
    const b = offer.bonus;
    let v = offer.wage;
    v += (offer.signOn || 0) * 1000 / Math.max(1, offer.years * 52);
    v += (offer.loyalty || 0) / 52;
    v += (b.app || 0) * st + (b.goal || 0) * st * goalsPerMatch + (b.clean || 0) * st * cleanP + (b.unused || 0) * (1 - st) * 0.5;
    v += offer.wage * (offer.clause.rise || 0) / 100 * (offer.years - 1) / 2;
    v += offer.wage * (offer.clause.promo || 0) / 100 * 0.15;
    return v;
  }

  /**
   * Відповідь агента на пропозицію. neg — стан переговорів { rounds, max }.
   * Повертає { ok, near, req, worth, text, walked }.
   */
  function evaluate(W, state, p, clubId, offer, kind, neg) {
    const req = required(W, state, p, clubId, offer, kind);
    if (req == null) return { ok: false, text: 'Гравець не хоче переходити в значно слабший клуб.', walked: true };
    const age = W.age(p) ?? 24;
    if (age >= 31 && offer.years > 2) return { ok: false, req, text: 'Гравцеві за 30: агент наполягає на контракті не довше двох років.' };
    const exp = expected(W, p, clubId);
    if (RANK[exp] - RANK[offer.status] >= 2 && RANK[exp] >= 3) return { ok: false, req, text: `${STATUS[offer.status]}? Гравець розраховує щонайменше на статус «${STATUS[exp].toLowerCase()}» — на інше не погодиться.` };
    const agentWant = kind === 'renew' ? 0 : FM.market.agentFee(0, offer.wage, p);
    const agentShort = agentWant > 0 && offer.agent < agentWant * 0.7;
    const w = worth(W, p, offer) * (agentShort ? 0.93 : 1);
    neg.rounds = (neg.rounds || 0) + 1;
    if (w >= req) return { ok: true, req, worth: w, text: 'Агент задоволений: гравець погоджується на ці умови.' };
    const left = neg.max - neg.rounds;
    if (left <= 0) return { ok: false, req, worth: w, walked: true, text: 'Агент утомився від переговорів і припиняє їх. Спробуйте знову за кілька тижнів.' };
    const gap = Math.round(req - w);
    if (w >= req * 0.93) return { ok: false, near: true, req, worth: w, text: `Майже. Не вистачає приблизно ${gap} тис. € на тиждень — зарплатою, підйомними чи бонусами.${agentShort ? ' І агент хоче більші агентські.' : ''} Ще раундів: ${left}.` };
    return { ok: false, req, worth: w, text: `Далеко від очікувань: гравець цінує себе на ${req} тис. € на тиждень (з урахуванням статусу й терміну).${agentShort ? ' Агентські — замалі.' : ''} Ще раундів: ${left}.` };
  }
  /** «Запропонуйте свої умови» — агент називає пакет, на який гравець погодиться. */
  function suggest(W, state, p, clubId, offer, kind) {
    const o = JSON.parse(JSON.stringify(offer));
    o.status = RANK[o.status] < RANK[expected(W, p, clubId)] ? expected(W, p, clubId) : o.status;
    o.years = Math.min(o.years, (W.age(p) ?? 24) >= 31 ? 2 : 5);
    const req = required(W, state, p, clubId, o, kind) || o.wage;
    o.bonus = { ...typicalBonuses(p, Math.round(req * 0.9)), ...Object.fromEntries(Object.entries(o.bonus).filter(([, v]) => v > 0)) };
    o.agent = kind === 'renew' ? 0 : Math.max(o.agent, r2(FM.market.agentFee(0, req, p)));
    // зарплата — те, чого бракує після бонусів
    o.wage = Math.max(1, Math.round(req - (worth(W, p, { ...o, wage: 0 }) - 0)));
    if (worth(W, p, o) < req) o.wage += Math.ceil(req - worth(W, p, o));
    return o;
  }

  /** Підписати: зарплата, термін, статус, бонуси й пункти — гравцеві; підйомні — з балансу. */
  function apply(W, state, p, offer, clubId) {
    const S = state.season;
    p.wage = offer.wage; p.contract = S.year + 1 + offer.years;
    p.squadStatus = offer.status; p.statusClub = clubId;
    const b = offer.bonus;
    p.bonus = b.app || b.goal || b.clean || b.unused ? { ...b } : null;
    if (b.goal) p.goalBonus = b.goal; else delete p.goalBonus;
    p.loyalty = offer.loyalty || 0;
    p.clauseSet = { rise: offer.clause.rise || 0, promo: offer.clause.promo || 0, releg: offer.clause.releg || 0, ext: !!offer.clause.ext };
    if (offer.clause.release > 0) p.clause = offer.clause.release; else if (p.club === clubId) delete p.clause;
    if (offer.signOn > 0) {
      const c = W.club(clubId); c.balance = r2(c.balance - offer.signOn);
      if (FM.budget && clubId === state.clubId) FM.budget.spend(W, state, offer.signOn);
      if (state.board && state.board.fin) state.board.fin.transfers = r2((state.board.fin.transfers || 0) - offer.signOn);
    }
  }

  /** Тиждень: бонуси гравцям клубу за матчі минулого тижня (за вихід, гол, суху гру, невихід із запасу). Повертає суму (млн €). */
  function weekBonuses(W, state) {
    const S = state.season, w = S.week - 1, me = state.clubId;
    const fx = S.fixtures.filter((f) => f.w === w && f.s && (f.h === me || f.a === me));
    if (!fx.length) return 0;
    let total = 0;
    for (const f of fx) {
      const home = f.h === me, ga = home ? f.s[1] : f.s[0];
      const scorers = (f.sc || []).filter(([t]) => t === (home ? 0 : 1)).map(([, id]) => id);
      for (const p of W.squad(me)) {
        const b = p.bonus;
        if (!b) continue;
        const played = p.lastPlayed === w;
        if (played) {
          total += b.app || 0;
          total += (b.goal || 0) * scorers.filter((id) => id === p.id).length;
          if (!ga && ['GK', 'CB', 'FB'].includes(p.roles[0])) total += b.clean || 0;
        } else if (!p.injury) total += (b.unused || 0) * 0.5; // приблизно: половину матчів сидить на лаві
      }
    }
    const m = r2(total / 1000);
    if (m > 0) { const c = W.club(me); c.balance = r2(c.balance - m); if (state.board && state.board.fin) state.board.fin.wages = r2((state.board.fin.wages || 0) + m); }
    return m;
  }
  /** Кінець сезону: бонус за лояльність, щорічне підвищення, пункти про вихід у вищу лігу й виліт. */
  function seasonEnd(W, state, info = {}) {
    const me = state.clubId, out = [];
    let loyal = 0;
    for (const p of W.squad(me)) {
      if (p.loyalty) loyal += p.loyalty;
      const cs = p.clauseSet;
      if (!cs) continue;
      if (cs.rise) p.wage = Math.round(p.wage * (1 + cs.rise / 100));
      if (info.promoted && cs.promo) { p.wage = Math.round(p.wage * (1 + cs.promo / 100)); out.push(`${p.name}: зарплата +${cs.promo}% за вихід у вищу лігу.`); }
      if (info.relegated && cs.releg) { p.wage = Math.round(p.wage * (1 - cs.releg / 100)); out.push(`${p.name}: зарплата −${cs.releg}% через виліт.`); }
    }
    if (loyal > 0) { const c = W.club(me); c.balance = r2(c.balance - loyal / 1000); out.unshift(`Бонуси за лояльність гравцям: ${FM.market.fmtM(r2(loyal / 1000))}.`); }
    return out;
  }
  /** Опція продовження (на користь клубу): +1 рік на тих самих умовах. */
  function exerciseExt(W, state, p) {
    if (!p.clauseSet || !p.clauseSet.ext) return { ok: false, text: 'У контракті немає опції продовження.' };
    p.contract += 1; p.clauseSet.ext = false;
    return { ok: true, text: `Клуб скористався опцією: контракт ${p.name} продовжено до літа ${p.contract}.` };
  }

  FM.contracts = { STATUS, ORDER, SHARE, expected, prefYears, typicalBonuses, draft, required, worth, evaluate, suggest, apply, weekBonuses, seasonEnd, exerciseExt };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
