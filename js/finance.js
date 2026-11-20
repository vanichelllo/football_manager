// Розширення 7: спонсори й фінансовий фейр-плей (ФФП).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r4 = (x) => Math.round(x * 10000) / 10000;
  // вигадані бренди (без справжніх торгових марок)
  const BRANDS = ['Атлас Банк', 'Нова Енергія', 'Сокіл Телеком', 'Вітрило Авіа', 'Магістраль Логістик', 'Зерно Агро', 'Кварц Технології', 'Оберіг Страхування',
    'Альта Мобайл', 'Меркурій Авто', 'Полісся Ліс', 'Хвиля Напої', 'Сузір’я Медіа', 'Граніт Буд', 'Ліра Фарма', 'Борей Енерго'];

  /** Три пропозиції спонсора на сезон: стабільна, бонусна, змішана. Суми — частка базового доходу клубу. */
  function offers(W, state) {
    const S = state.season, c = W.club(state.clubId), R = FM.rng(`spons-${S.seed}-${S.year}-${state.clubId}`);
    const base = (c.income0 || 0.1) * (0.9 + (state.board ? state.board.rep : 50) / 250); // репутація тренера трохи піднімає суми
    const names = BRANDS.slice();
    const pick = () => names.splice(R.int(names.length), 1)[0];
    return [
      { id: 'fixed', name: pick(), label: 'Стабільний', perWeek: r4(base * 0.22), win: 0, trophy: 0, hint: 'Однакова сума щотижня, без ризику.' },
      { id: 'bonus', name: pick(), label: 'Бонусний', perWeek: r4(base * 0.1), win: r4(base * 0.3), trophy: r4(base * 8), hint: 'Менше щотижня, але бонус за кожну перемогу й за трофей.' },
      { id: 'mixed', name: pick(), label: 'Змішаний', perWeek: r4(base * 0.16), win: r4(base * 0.12), trophy: r4(base * 3), hint: 'Посередині.' },
    ];
  }
  function choose(W, state, id) {
    const o = offers(W, state).find((x) => x.id === id);
    if (!o) return null;
    state.sponsor = { ...o, year: state.season.year, earned: 0 };
    return state.sponsor;
  }
  /** Тиждень: виплата спонсора (за перемогу — бонус). won — чи виграв клуб матч ліги цього тижня. */
  function week(W, state, won) {
    const sp = state.sponsor, c = W.club(state.clubId);
    if (!sp || sp.year !== state.season.year) return 0;
    const pay = r4(sp.perWeek + (won ? sp.win : 0));
    c.balance = r4(c.balance + pay); sp.earned = r4(sp.earned + pay);
    if (state.board) state.board.fin.sponsor = r4((state.board.fin.sponsor || 0) + pay);
    return pay;
  }
  /** Трофей — бонус спонсора. */
  function trophy(W, state, n) {
    const sp = state.sponsor;
    if (!sp || !n || !sp.trophy) return 0;
    const pay = r4(sp.trophy * n);
    W.club(state.clubId).balance = r4(W.club(state.clubId).balance + pay); sp.earned = r4(sp.earned + pay);
    return pay;
  }

  // ---------------- Фінансовий фейр-плей ----------------
  /** Частка витрат від доходу: (зарплати + третина чистих витрат на трансфери) / (усі доходи). */
  function ratio(state) {
    const f = (state.board && state.board.fin) || {};
    const income = (f.tv || 0) + (f.tickets || 0) + (f.prize || 0) + (f.sponsor || 0) + Math.max(0, f.transfers || 0);
    const spend = (f.wages || 0) + Math.max(0, -(f.transfers || 0)) / 3;
    return income > 0 ? spend / income : 0;
  }
  const LIMIT = 1.1, WARN = 0.95; // звичайний клуб без трансферів — ~0,75–0,85
  /** Підсумок сезону: штраф і заборона трансферів, якщо витрати перевищили межу. */
  function endSeason(W, state) {
    const r = ratio(state), c = W.club(state.clubId);
    if (r <= WARN) return { ok: true, ratio: r, text: `ФФП: витрати — ${Math.round(r * 100)}% доходів. Усе гаразд.` };
    if (r <= LIMIT) return { ok: true, ratio: r, text: `ФФП: витрати — ${Math.round(r * 100)}% доходів. Близько до межі (${Math.round(LIMIT * 100)}%), обережніше з зарплатами.` };
    const f = state.board.fin, fine = r4(((f.tv || 0) + (f.tickets || 0)) * 0.05);
    c.balance = r4(c.balance - fine);
    state.embargo = state.season.year + 1; // заборона купівлі в літнє вікно нового сезону
    return { ok: false, ratio: r, fine, text: `ФФП порушено: витрати — ${Math.round(r * 100)}% доходів (межа ${Math.round(LIMIT * 100)}%). Штраф ${FM.market.fmtM(fine)} і заборона купувати гравців у літнє вікно.` };
  }
  /** Чи діє заборона трансферів (лише літнє вікно сезону після порушення). */
  const embargoed = (state) => state.embargo === state.season.year && state.season.week < 10;

  FM.finance = { BRANDS, offers, choose, week, trophy, ratio, LIMIT, WARN, endSeason, embargoed };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
