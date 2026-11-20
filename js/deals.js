// Складні угоди (як у FM): розстрочка, бонус продавцю за матчі, опція викупу в оренді;
// звіти скаутів з оцінкою A–D, рекомендацією, сильними й слабкими сторонами.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---------------- Розстрочка й бонуси ----------------
  const INSTALMENTS = [[0, 'Уся сума одразу'], [0.5, '50% одразу, решта — протягом року'], [0.7, '30% одразу, решта — протягом двох років']];
  const APPS_BONUS = [[0, 'Без бонусу'], [25, 'Бонус після 25 матчів'], [50, 'Бонус після 50 матчів']];
  /**
   * Скільки «варта» пропозиція для клубу-продавця: розстрочка — трохи менше (гроші пізніше),
   * бонус за матчі — частково (може й не виплатитися).
   */
  function offerValue(fee, extra = {}) {
    const def = extra.inst || 0;
    const k = def ? 1 - def * (def > 0.6 ? 0.1 : 0.06) : 1;
    const bonus = extra.apps && extra.bonus ? extra.bonus * (extra.apps <= 25 ? 0.6 : 0.4) : 0;
    return r2(fee * k + bonus);
  }
  /** Після підписання: записати платежі в розстрочку й бонус за матчі. */
  function register(state, p, fromClub, fee, extra = {}) {
    if (!fromClub) return;
    const S = state.season;
    if (extra.inst && fee > 0) {
      const weeks = extra.inst > 0.6 ? 96 : 48;
      state.payables = (state.payables || []).concat([{ to: fromClub, from: state.clubId, pid: p.id, left: weeks, perWeek: r2((fee * extra.inst) / weeks), total: r2(fee * extra.inst) }]);
    }
    if (extra.apps && extra.bonus) state.addons = (state.addons || []).concat([{ to: fromClub, pid: p.id, apps: extra.apps, bonus: extra.bonus, got: 0, last: (S.ps[p.id] && S.ps[p.id][0]) || 0, y: S.year }]);
  }
  /** Сума, яку покупець платить одразу. */
  const upfront = (fee, inst) => r2(fee * (1 - (inst || 0)));
  /** Щотижня: платежі за розстрочкою й бонуси за матчі. Повертає новини. */
  function week(W, state) {
    const S = state.season, news = [];
    const me = W.club(state.clubId);
    for (const d of state.payables || []) {
      if (d.left <= 0) continue;
      const pay = d.left === 1 ? r2(d.total - (d.paid || 0)) : d.perWeek; // останній платіж — залишок після округлень
      d.paid = r2((d.paid || 0) + pay);
      me.balance = r2(me.balance - pay);
      if (W.club(d.to)) W.club(d.to).balance = r2(W.club(d.to).balance + pay);
      if (state.board && state.board.fin) state.board.fin.transfers = r2((state.board.fin.transfers || 0) - pay);
      d.left--;
      if (!d.left) news.push(`Останній платіж за розстрочкою (${FM.market.fmtM(d.total)}) — клубу ${W.club(d.to) ? W.club(d.to).name : ''}.`);
    }
    state.payables = (state.payables || []).filter((d) => d.left > 0);
    for (const a of state.addons || []) {
      const p = W.player(a.pid);
      if (!p || a.done) continue;
      if (p.club !== state.clubId) { a.done = true; continue; } // продали раніше — бонус згорає
      const cur = (S.ps[p.id] && S.ps[p.id][0]) || 0;
      if (a.y !== S.year) { a.y = S.year; a.last = 0; }
      a.got += Math.max(0, cur - a.last); a.last = cur;
      if (a.got >= a.apps) {
        a.done = true;
        me.balance = r2(me.balance - a.bonus);
        if (W.club(a.to)) W.club(a.to).balance = r2(W.club(a.to).balance + a.bonus);
        if (state.board && state.board.fin) state.board.fin.transfers = r2((state.board.fin.transfers || 0) - a.bonus);
        news.push(`${p.name} зіграв ${a.apps} матчів — виплачено бонус ${FM.market.fmtM(a.bonus)} клубу ${W.club(a.to) ? W.club(a.to).name : ''}.`);
      }
    }
    state.addons = (state.addons || []).filter((a) => !a.done);
    return news;
  }
  /** Борги клубу за розстрочкою (млн €). */
  const debt = (state) => r2((state.payables || []).reduce((s, d) => s + d.total - (d.paid || 0), 0));

  // ---------------- Опція викупу ----------------
  /** Ціна опції викупу для оренди: ціна гравця × 1,1. Оренда з опцією дорожча на 25%. */
  const optionPrice = (W, p, S) => r2(Math.max(0.1, FM.market.askingPrice(W, p, S) * 1.1));
  /** Скористатися опцією: викупити орендованого гравця. */
  function exercise(W, state, p) {
    const S = state.season, me = W.club(state.clubId);
    if (!p.loan || p.loan.to !== state.clubId || !p.loan.option) return { ok: false, text: 'Опції викупу немає.' };
    if (!FM.market.windowOpen(S) && p.loan.until > S.year) return { ok: false, text: 'Викупити можна у відкрите трансферне вікно або наприкінці сезону.' };
    if (me.balance < p.loan.option) return { ok: false, text: `Не вистачає грошей: опція — ${FM.market.fmtM(p.loan.option)}.` };
    const owner = p.loan.from, price = p.loan.option;
    me.balance = r2(me.balance - price);
    if (W.club(owner)) W.club(owner).balance = r2(W.club(owner).balance + price);
    if (state.board && state.board.fin) state.board.fin.transfers = r2((state.board.fin.transfers || 0) - price);
    delete p.loan;
    p.contract = S.year + 3; p.boughtSeason = S.year; p.boughtWeek = S.week;
    state.transfers = (state.transfers || []).concat([{ s: S.year, w: S.week, p: p.id, from: owner, to: state.clubId, fee: price }]).slice(-300);
    return { ok: true, text: `${p.name} — ваш гравець: опцію викупу (${FM.market.fmtM(price)}) використано.` };
  }

  // ---------------- Звіти скаутів ----------------
  const GRADE_TEXT = { A: 'Купувати: одразу підсилить основу', B: 'Варто подумати: рівень основи', C: 'Гравець ротації', D: 'Не підсилить команду' };
  const ROLE_KEYS = {
    GK: ['ref', 'one', 'han', 'pos', 'kic', 'dec'], CB: ['tac', 'hea', 'pos', 'str', 'pac', 'dec', 'pas'], FB: ['pac', 'tac', 'cro', 'sta', 'pos', 'dri'],
    DM: ['tac', 'pos', 'pas', 'dec', 'sta', 'str'], CM: ['pas', 'dec', 'sta', 'tec', 'tac', 'lon'], AM: ['pas', 'dri', 'tec', 'dec', 'lon', 'fin'],
    W: ['pac', 'dri', 'cro', 'tec', 'fin', 'sta'], ST: ['fin', 'otb', 'hea', 'pac', 'dri', 'str'],
  };
  /**
   * Звіт: { grade, text, pros, cons, notes, sure } — порівняння з вашим найкращим на цій позиції.
   * seen — { ca, pa, known } (рівень, яким його бачать скаути).
   */
  function report(W, state, p, seen) {
    const role = p.roles[0], slot = { role, side: p.side };
    const mine = W.squad(state.clubId).filter((x) => FM.fit(x, slot) >= 0.94 && x.id !== p.id);
    const best = mine.map((x) => FM.roleRating(x, role) * FM.fit(x, slot)).sort((a, b) => b - a);
    const his = FM.roleRating(p, role) * (seen.known ? 1 : 1 + (seen.ca - p.ca) / Math.max(40, p.ca));
    const ref = best[0] ?? 0, second = best[1] ?? 0;
    const diff = his - ref;
    let grade = diff >= 0.8 ? 'A' : diff >= -0.3 ? 'B' : his >= second - 0.5 ? 'C' : 'D';
    const age = W.age(p) ?? 25;
    const prospect = age <= 21 && seen.pa >= Math.max(...mine.map((x) => x.ca), 0);
    if (prospect && grade > 'B') grade = String.fromCharCode(grade.charCodeAt(0) - 1);
    const A = p.attrs, keys = ROLE_KEYS[role] || [];
    const sorted = keys.filter((k) => A[k] != null).sort((a, b) => A[b] - A[a]);
    const pros = sorted.slice(0, 3).filter((k) => A[k] >= 12).map((k) => `${FM.ATTRS[k]} (${A[k]})`);
    const cons = sorted.slice(-2).filter((k) => A[k] <= 11).map((k) => `${FM.ATTRS[k]} (${A[k]})`);
    const h = p.h || {}, notes = [];
    if ((h.pro || 11) >= 15) notes.push('справжній професіонал');
    if ((h.pro || 11) <= 7) notes.push('сумнівний професіоналізм');
    if ((h.con || 11) <= 8) notes.push('нестабільний');
    if ((h.big || 10) >= 15) notes.push('любить великі матчі');
    if ((h.inj || 8) >= 14) notes.push('схильний до травм');
    if (prospect) notes.push(`перспектива: потенціал вище за ваших гравців`);
    if (age >= 31) notes.push('вік: лишилося 1–3 роки на піку');
    if (p.club && FM.market) {
      const ask = FM.market.askingPrice(W, p, state.season);
      notes.push(ask > p.value * 1.35 ? `завищена ціна (${FM.market.fmtM(ask)})` : ask < p.value * 0.9 ? `вигідна ціна (${FM.market.fmtM(ask)})` : `ціна відповідає рівню (${FM.market.fmtM(ask)})`);
    }
    return { grade, text: GRADE_TEXT[grade], pros, cons, notes, sure: !!seen.known, role };
  }

  FM.deals = { INSTALMENTS, APPS_BONUS, offerValue, register, upfront, week, debt, optionPrice, exercise, report, GRADE_TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
