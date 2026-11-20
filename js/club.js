// Клуб і світ: персонал, інфраструктура, вболівальники, тренери клубів ШІ (стиль, звільнення, вакансії).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;
  const clampL = (v) => Math.max(1, Math.min(20, Math.round(v)));

  // ---------------- Персонал ----------------
  const ROLES = {
    assistant: { label: 'Асистент тренера', hint: 'Швидше знайомство з тактикою, точніші поради.', wage: 2.2 },
    coachAtt: { label: 'Тренер атаки', hint: 'Розвиток нападників, вінгерів, атакувальних півзахисників.', wage: 1.5 },
    coachDef: { label: 'Тренер оборони', hint: 'Розвиток захисників і опорних.', wage: 1.5 },
    gkCoach: { label: 'Тренер воротарів', hint: 'Розвиток воротарів.', wage: 1.2 },
    fitness: { label: 'Тренер з фізпідготовки', hint: 'Швидше відновлення, менше травм на тренуваннях.', wage: 1.3 },
    physio: { label: 'Лікар', hint: 'Травмовані повертаються швидше.', wage: 1.3 },
    youth: { label: 'Тренер молоді', hint: 'Кращі юнаки з академії.', wage: 1.2 },
  };
  const FIRST = ['Андрій', 'Сергій', 'Олег', 'Віктор', 'Юрій', 'Ігор', 'Марко', 'Луїс', 'Карлос', 'Ганс', 'Жан', 'Томас', 'Паоло', 'Мігель', 'Петер', 'Даніель'];
  const LAST = ['Коваль', 'Шевчук', 'Мельник', 'Гонсалес', 'Россі', 'Мюллер', 'Дюбуа', 'Сміт', 'Фернандес', 'Шмідт', 'Мартен', 'Бруно', 'Ковальчук', 'Ван Дейк', 'Ткаченко', 'Новак'];
  const randName = (R) => `${R.pick(FIRST)} ${R.pick(LAST)}`;
  // зарплати персоналу залежать від багатства клубу (state.staffK): у топ-клубі — повні, у скромному — частка
  const staffWage = (role, level, state) => Math.max(0.2, Math.round(ROLES[role].wage * level * ((state && state.staffK) || 1) * 10) / 10);

  function initStaff(W, state) {
    if (state.staff) return state.staff;
    const R = FM.rng(`staff-${state.season.seed}-${state.clubId}`);
    const base = Math.max(4, Math.min(16, (W.clubLevel(state.clubId) - 60) / 6));
    state.staff = {};
    for (const role of Object.keys(ROLES)) state.staff[role] = { name: randName(R), level: clampL(base + R.range(-3, 3)) };
    return state.staff;
  }
  const lvl = (state, role) => (state.staff && state.staff[role] ? state.staff[role].level : 10);
  /** Кандидати на посаду: три людини різного рівня й ціни. */
  function candidates(state, role) {
    const R = FM.rng(`cand-${state.season.seed}-${state.season.week}-${role}`);
    return [0, 1, 2].map(() => { const level = clampL(5 + R.int(16)); return { name: randName(R), level, wage: staffWage(role, level, state) }; }).sort((a, b) => b.level - a.level);
  }
  const staffBill = (state) => Object.entries(state.staff || {}).reduce((s, [r, x]) => s + staffWage(r, x.level, state), 0);

  /** Множник розвитку гравця вашого клубу: тренер за лінією й тренувальна база. */
  function growthMult(state, W, p) {
    const role = p.roles[0];
    const coach = role === 'GK' ? 'gkCoach' : ['ST', 'W', 'AM'].includes(role) ? 'coachAtt' : ['CB', 'FB', 'DM'].includes(role) ? 'coachDef' : null;
    const c = coach ? lvl(state, coach) : (lvl(state, 'coachAtt') + lvl(state, 'coachDef')) / 2;
    const fac = facilities(W, state.clubId).training;
    return (0.85 + c * 0.015) * (0.9 + fac * 0.01);
  }

  // ---------------- Інфраструктура ----------------
  function facilities(W, clubId) {
    const c = W.club(clubId);
    if (!c.fac) {
      const base = Math.max(3, Math.min(18, (W.clubLevel(clubId) - 60) / 6));
      c.fac = { training: clampL(base), youth: clampL(base - 1), cap0: c.capacity || 10000 };
    }
    return c.fac;
  }
  const UPGRADES = {
    training: { label: 'Тренувальна база', weeks: 10, cost: (W, c, f) => r2((1.5 + f.training * 0.6) * moneyK(c)), hint: 'Швидший розвиток усіх гравців.' },
    youth: { label: 'Академія', weeks: 12, cost: (W, c, f) => r2((1 + f.youth * 0.5) * moneyK(c)), hint: 'Кращі юнаки щороку.' },
    stadium: { label: 'Розширення стадіону (+5000 місць)', weeks: 30, cost: (W, c) => r2(12 * moneyK(c)), hint: 'Більше квитків — більший дохід.' },
  };
  const LEAGUE_MONEY = { eng: 3, esp: 2, ita: 1.6, ger: 1.8, fra: 1.4, ukr: 0.4, eng2: 1.2, esp2: 0.7, ita2: 0.6, ger2: 0.8, fra2: 0.5, ukr2: 0.15,
    por: 0.9, ned: 0.9, tur: 1, pol: 0.5 };
  const moneyK = (c) => LEAGUE_MONEY[c.league] || 0.6;
  /** Попросити правління про покращення. Повертає { ok, reason }. */
  function requestUpgrade(W, state, kind) {
    const c = W.club(state.clubId), f = facilities(W, c.id), U = UPGRADES[kind];
    if (f.building) return { ok: false, reason: `Уже триває будівництво: ${UPGRADES[f.building.kind].label.toLowerCase()}.` };
    if (kind !== 'stadium' && f[kind] >= 20) return { ok: false, reason: 'Уже найвищий рівень.' };
    const cost = U.cost(W, c, f);
    if (c.balance < cost * 1.3) return { ok: false, reason: `Правління відмовляє: на це потрібно ${FM.market.fmtM(cost)}, а на рахунку ${FM.market.fmtM(c.balance)} — замало із запасом.` };
    if (state.board && state.board.conf < 45) return { ok: false, reason: 'Правління відмовляє: спершу покажіть результати.' };
    c.balance = r2(c.balance - cost);
    f.building = { kind, left: U.weeks };
    if (state.board) state.board.fin.transfers = r2((state.board.fin.transfers || 0) - cost);
    return { ok: true, cost };
  }
  function buildWeek(W, state) {
    const c = W.club(state.clubId), f = facilities(W, c.id);
    if (!f.building) return null;
    if (--f.building.left > 0) return null;
    const kind = f.building.kind;
    delete f.building;
    if (kind === 'stadium') c.capacity = (c.capacity || 10000) + 5000; else f[kind] = Math.min(20, f[kind] + 1);
    return kind;
  }

  // ---------------- Вболівальники ----------------
  const PRICES = { low: { label: 'Низькі', k: 0.85, mood: 0.6, att: 0.06 }, normal: { label: 'Звичайні', k: 1, mood: 0, att: 0 }, high: { label: 'Високі', k: 1.2, mood: -0.6, att: -0.08 } };
  function fans(W, clubId) {
    const c = W.club(clubId);
    if (!c.fans) c.fans = { mood: 60, price: 'normal' };
    return c.fans;
  }
  /** Заповненість стадіону 0–1. */
  function attendance(W, clubId, rel) {
    const f = fans(W, clubId), pr = PRICES[f.price];
    return Math.max(0.3, Math.min(1, 0.55 + f.mood / 250 + (rel - 0.5) * 0.15 + pr.att));
  }
  /** Множник доходу від квитків (порівняно з базовим): заповненість, ціни, місткість. */
  function ticketFactor(W, clubId, rel) {
    const c = W.club(clubId), f = fans(W, clubId), fac = facilities(W, clubId);
    return attendance(W, clubId, rel) / 0.8 * PRICES[f.price].k * ((c.capacity || fac.cap0) / (fac.cap0 || 1));
  }
  function fansWeek(W, state, results) {
    for (const [clubId, res] of Object.entries(results)) {
      const f = fans(W, clubId);
      f.mood = Math.max(0, Math.min(100, f.mood + res * 3 + PRICES[f.price].mood + (60 - f.mood) * 0.03));
    }
    const mine = fans(W, state.clubId);
    if (mine.mood < 30 && state.board) state.board.conf = Math.max(0, state.board.conf - 0.3);
  }

  // ---------------- Тренери клубів ШІ ----------------
  const STYLES = {
    attack: { label: 'атакувальний', mentality: 1, pressing: 'high', passing: 'mixed' },
    possession: { label: 'контроль м’яча', mentality: 0, pressing: 'high', passing: 'short' },
    balanced: { label: 'збалансований', mentality: 0, pressing: 'normal', passing: 'mixed' },
    counter: { label: 'контратаки', mentality: -1, pressing: 'low', passing: 'direct' },
    defence: { label: 'оборонний', mentality: -1, pressing: 'normal', passing: 'mixed' },
  };
  function managers(W, state) {
    const R = FM.rng(`mgr-${state.season.seed}`);
    for (const c of W.clubs.values()) {
      if (c.manager) continue;
      const lv = W.clubLevel(c.id);
      c.manager = { name: randName(R), style: R.weighted(Object.keys(STYLES), (k) => ({ attack: lv > 140 ? 3 : 1, possession: lv > 140 ? 3 : 1, balanced: 3, counter: lv < 120 ? 2.5 : 1, defence: lv < 110 ? 2.5 : 0.7 }[k])), since: state.season.year };
    }
  }
  /** Тиждень тренерів ШІ: після 12-го туру клуб, що сильно не дотягує до очікувань, може звільнити тренера. */
  function managersWeek(W, state) {
    const S = state.season;
    if (S.week < 12) return [];
    const R = FM.rng(`sack-${S.seed}-${S.week}`);
    const out = [];
    const tables = {};
    for (const c of W.clubs.values()) {
      if (c.id === state.clubId || !c.manager) continue;
      const t = tables[c.league] || (tables[c.league] = FM.season.table(S, W, c.league));
      const pos = t.findIndex((r) => r.id === c.id) + 1;
      if (!pos || !t[pos - 1].p) continue;
      const ranked = W.clubsOf(c.league).map((x) => [x.id, W.clubLevel(x.id)]).sort((a, b) => b[1] - a[1]);
      const expect = ranked.findIndex((x) => x[0] === c.id) + 1;
      const gap = pos - expect; // скільки місць нижче очікуваного
      if (gap >= 6 && R.chance(0.04 + (gap - 6) * 0.01) && !(c.manager.since === S.year && S.week < 20)) {
        const old = c.manager.name;
        c.manager = { name: randName(R), style: R.pick(Object.keys(STYLES)), since: S.year, newWeek: S.week };
        c.vacancy = { week: S.week, year: S.year };
        out.push({ club: c, old, now: c.manager.name });
      }
    }
    return out;
  }
  /** Тактика ШІ за стилем тренера (поверх розрахунку за силою). */
  function aiStyle(c, mentality) {
    const st = c && c.manager && STYLES[c.manager.style];
    if (!st) return { mentality };
    const order = ['defensive', 'cautious', 'balanced', 'positive', 'attacking'];
    const i = Math.max(0, Math.min(4, order.indexOf(mentality) + st.mentality));
    return { mentality: order[i], pressing: st.pressing, passing: st.passing };
  }

  function init(W, state) {
    const inc = W.club(state.clubId).income0 || 1;
    state.staffK = Math.round(Math.max(0.02, Math.min(1, inc / 2)) * 100) / 100;
    initStaff(W, state);
    facilities(W, state.clubId);
    fans(W, state.clubId);
    managers(W, state);
  }

  FM.club = { ROLES, PRICES, UPGRADES, STYLES, init, initStaff, lvl, candidates, staffWage, staffBill, growthMult, facilities, requestUpgrade, buildWeek,
    fans, attendance, ticketFactor, fansWeek, managers, managersWeek, aiStyle };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
