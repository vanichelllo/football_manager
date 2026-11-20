// Бюджети клубу (як у FM): трансферний бюджет окремо від балансу, зарплатний — фонд зарплат клубу.
// Гроші можна перекидати між ними (1 млн € трансферного бюджету ≈ 19 тис. € на тиждень зарплат — річна сума),
// кредит у банку, прогноз балансу на кінець сезону, продаж прав на назву стадіону.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;
  const WEEKS_YEAR = 52;
  const SALE_SHARE = 0.75; // правління повертає в трансферний бюджет 75% виручки від продажів

  /** Бюджет на сезон: створює правління (частина балансу + невелика сума з доходів). */
  function init(W, state) {
    const c = W.club(state.clubId), S = state.season;
    const transfer = Math.max(0, r2(Math.min(c.balance, Math.max(0, c.balance) * 0.45 + (c.income0 || 0.01) * 38 * 0.05)));
    state.budget = { year: S.year, club: c.id, transfer, start: transfer, spent: 0, earned: 0, moved: 0 };
    return state.budget;
  }
  /** Поточний бюджет. Створюється, коли вперше потрібен у сезоні чи новому клубі — уже після виплат за єврокубки. */
  function get(W, state) {
    const b = state.budget;
    if (!b || b.club !== state.clubId || b.year !== state.season.year) return init(W, state);
    return b;
  }
  /** Скільки можна витратити на трансфер зараз: менше з бюджету й балансу. */
  const available = (W, state) => Math.max(0, Math.min(get(W, state).transfer, W.club(state.clubId).balance));
  const canSpend = (W, state, amount) => amount <= available(W, state) + 1e-9;
  function spend(W, state, amount) { const b = get(W, state); b.transfer = r2(Math.max(0, b.transfer - amount)); b.spent = r2(b.spent + amount); }
  function earn(W, state, amount) { const b = get(W, state); const add = r2(amount * SALE_SHARE); b.transfer = r2(b.transfer + add); b.earned = r2(b.earned + add); return add; }

  /** Перекинути: mln > 0 — з трансферного в зарплатний (тис. €/тиж.); mln < 0 — навпаки. Повертає { ok, text }. */
  function move(W, state, mln) {
    const b = get(W, state), c = W.club(state.clubId);
    const weekly = Math.round((mln * 1000) / WEEKS_YEAR); // тис. € на тиждень
    if (!mln || !weekly) return { ok: false, text: 'Сума замала.' };
    if (mln > 0 && mln > b.transfer + 1e-9) return { ok: false, text: 'У трансферному бюджеті стільки немає.' };
    if (mln < 0) {
      const bill = FM.market.wageBill(W, c.id);
      if (c.wageBudget + weekly < bill) return { ok: false, text: `Зарплатний бюджет не може бути меншим за нинішні зарплати (${bill} тис. €/тиж.).` };
    }
    b.transfer = r2(b.transfer - mln);
    c.wageBudget = Math.round(c.wageBudget + weekly);
    b.moved = r2(b.moved + mln);
    return { ok: true, text: mln > 0 ? `${FM.market.fmtM(mln)} перекинуто в зарплати: фонд — ${c.wageBudget} тис. €/тиж.` : `${-weekly} тис. €/тиж. зарплат перекинуто в трансфери: бюджет — ${FM.market.fmtM(b.transfer)}.` };
  }
  /** Скільки трансферних грошей дає тиждень зарплат і навпаки (для повзунка). */
  const toWeekly = (mln) => Math.round((mln * 1000) / WEEKS_YEAR);
  const toMln = (weekly) => r2((weekly * WEEKS_YEAR) / 1000);

  // ---------------- Кредит ----------------
  const LOAN_RATE = 0.08, LOAN_WEEKS = 96;
  /** Найбільший кредит: чверть річного доходу клубу (не менше €0,5 млн). */
  const loanMax = (W, state) => r2(Math.max(0.5, (W.club(state.clubId).income0 || 0.01) * WEEKS_YEAR * 0.25));
  function takeLoan(W, state, amount) {
    if (state.loan && state.loan.left > 0) return { ok: false, text: 'Спершу поверніть чинний кредит.' };
    if (state.board && state.board.conf < 45) return { ok: false, text: 'Правління не дозволяє брати кредит: довіра замала.' };
    const max = loanMax(W, state);
    amount = r2(Math.min(max, Math.max(0.1, amount)));
    const total = r2(amount * (1 + LOAN_RATE));
    state.loan = { amount, total, left: LOAN_WEEKS, perWeek: r2(total / LOAN_WEEKS), paid: 0, s: state.season.year };
    const c = W.club(state.clubId);
    c.balance = r2(c.balance + amount);
    get(W, state).transfer = r2(get(W, state).transfer + amount);
    if (state.board) state.board.conf = Math.max(0, state.board.conf - 2);
    return { ok: true, text: `Банк видав ${FM.market.fmtM(amount)} (повернути ${FM.market.fmtM(total)} за два роки, ${FM.market.fmtM(state.loan.perWeek)} на тиждень). Гроші — у трансферному бюджеті.` };
  }
  /** Тиждень: платіж за кредитом. Повертає новину, коли кредит повернуто. */
  function loanWeek(W, state) {
    const L = state.loan;
    if (!L || L.left <= 0) return null;
    const pay = L.left === 1 ? r2(L.total - L.paid) : L.perWeek;
    const c = W.club(state.clubId);
    c.balance = r2(c.balance - pay); L.paid = r2(L.paid + pay); L.left--;
    if (state.board && state.board.fin) state.board.fin.loan = r2((state.board.fin.loan || 0) + pay);
    return L.left === 0 ? `Кредит повернуто повністю (${FM.market.fmtM(L.total)}).` : null;
  }
  function repayLoan(W, state) {
    const L = state.loan, c = W.club(state.clubId);
    if (!L || L.left <= 0) return { ok: false, text: 'Кредиту немає.' };
    const rest = r2((L.total - L.paid) * 0.97); // за дострокове погашення — знижка 3% відсотків
    if (c.balance < rest) return { ok: false, text: `Не вистачає грошей: потрібно ${FM.market.fmtM(rest)}.` };
    c.balance = r2(c.balance - rest); L.paid = L.total; L.left = 0;
    return { ok: true, text: `Кредит погашено достроково: ${FM.market.fmtM(rest)}.` };
  }

  // ---------------- Прогноз і права на назву ----------------
  /** Прогноз балансу на кінець сезону за середнім тижнем (без трансферів і призових). */
  function forecast(W, state) {
    const S = state.season, f = (state.board && state.board.fin) || {}, c = W.club(state.clubId);
    const total = FM.season.weeks(S), done = Math.max(1, S.week), left = Math.max(0, total - S.week);
    const net = ((f.tv || 0) + (f.tickets || 0) + (f.sponsor || 0) + (f.merch || 0) - (f.wages || 0) - (f.loan || 0)) / done;
    return { weekly: r2(net), end: r2(c.balance + net * left), left };
  }
  const naming = (W, state) => r2(Math.max(0.3, (W.club(state.clubId).income0 || 0.01) * 26));
  function sellNaming(W, state) {
    const c = W.club(state.clubId);
    if (c.namingSold) return { ok: false, text: 'Права на назву стадіону вже продано.' };
    const money = naming(W, state);
    c.namingSold = { s: state.season.year, sponsor: (FM.finance && FM.finance.BRANDS ? FM.finance.BRANDS[Math.floor(Math.random() * FM.finance.BRANDS.length)] : 'Спонсор') };
    c.balance = r2(c.balance + money);
    get(W, state).transfer = r2(get(W, state).transfer + money * 0.5);
    FM.club.fans(W, c.id).mood = Math.max(0, FM.club.fans(W, c.id).mood - 12);
    if (state.board && state.board.fin) state.board.fin.sponsor = r2((state.board.fin.sponsor || 0) + money);
    return { ok: true, text: `Стадіон тепер «${c.namingSold.sponsor} Арена»: ${FM.market.fmtM(money)}, половина — у трансферний бюджет. Фанати обурені.` };
  }

  FM.budget = { SALE_SHARE, init, get, available, canSpend, spend, earn, move, toWeekly, toMln, loanMax, takeLoan, loanWeek, repayLoan, forecast, naming, sellNaming, LOAN_RATE, LOAN_WEEKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
