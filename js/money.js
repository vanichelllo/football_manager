// Гроші клубу (як у FM): абонементи, відвідуваність кожного домашнього матчу, продаж атрибутики (футболки зірок).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r4 = (x) => Math.round(x * 10000) / 10000;

  // Абонементи: ціна сезонного квитка щодо звичайного (знижка) і скільки фанатів купують
  const SEASON_TICKETS = {
    none: { label: 'Не продавати', share: 0, k: 0 },
    cheap: { label: 'Дешеві (−35%)', share: 0.45, k: 0.65, hint: 'Більше проданих, фанати раді, але з кожного матчу менше.' },
    normal: { label: 'Звичайні (−20%)', share: 0.32, k: 0.8, hint: 'Золота середина.' },
    dear: { label: 'Дорогі (−5%)', share: 0.16, k: 0.95, hint: 'Купують лише найвідданіші.' },
  };
  /** Скільки абонементів купили б: частка стадіону від настрою фанатів і сили клубу. */
  function seasonTicketShare(W, clubId, kind) {
    const T = SEASON_TICKETS[kind] || SEASON_TICKETS.none;
    if (!T.share) return 0;
    const mood = FM.club.fans(W, clubId).mood;
    return Math.max(0.03, Math.min(0.7, T.share * (0.6 + mood / 125)));
  }
  /**
   * Продати абонементи на сезон (лише в передсезоння, раз на сезон). Гроші — одразу, а з кожного
   * домашнього матчу квиткова виручка менша на частку абонементів. Повертає { ok, sold, money, text }.
   */
  function sellSeasonTickets(W, state, kind) {
    const S = state.season, c = W.club(state.clubId);
    state.st = state.st || {};
    if (state.st.year === S.year) return { ok: false, text: 'Абонементи на цей сезон уже продано.' };
    const lg = S.cal && S.cal.leagues[c.league];
    if (lg && S.week >= lg.start) return { ok: false, text: 'Абонементи продають лише до першого туру.' };
    const share = seasonTicketShare(W, c.id, kind);
    const homeGames = Math.round(S.fixtures.filter((f) => f.h === c.id).length);
    // виручка з домашнього матчу ≈ income0 × 0,6 × ticketFactor (як у FM.board.weekly)
    const perMatch = (c.income0 || 0.01) * 0.6 * FM.club.ticketFactor(W, c.id, 0.5);
    const money = r4(perMatch * share * homeGames * (SEASON_TICKETS[kind] || {}).k);
    state.st = { year: S.year, kind, share };
    if (!share) return { ok: true, sold: 0, money: 0, text: 'Абонементів цього сезону не буде.' };
    c.balance = r4(c.balance + money);
    if (state.board && state.board.fin) state.board.fin.tickets = r4((state.board.fin.tickets || 0) + money);
    const sold = Math.round((c.capacity || 10000) * share);
    FM.club.fans(W, c.id).mood = Math.min(100, FM.club.fans(W, c.id).mood + (kind === 'cheap' ? 4 : kind === 'normal' ? 2 : 0));
    return { ok: true, sold, money, text: `Продано ${sold.toLocaleString('uk-UA')} абонементів на ${FM.market.fmtM(money)}.`.replace('..', '.') };
  }
  /** Частка місць, уже оплачених абонементами (з кожного домашнього матчу виручка менша на неї). */
  const stShare = (state) => (state.st && state.st.year === state.season.year ? state.st.share || 0 : 0);

  /** Глядачі на домашньому матчі: місткість × заповненість (настрій, місце, суперник, дербі, погода). */
  function attendance(W, state, homeId, awayId, rel, derby, weather) {
    const c = W.club(homeId);
    let fill = FM.club.attendance(W, homeId, rel);
    const gap = W.clubLevel(awayId) - W.clubLevel(homeId);
    if (gap > 0) fill += Math.min(0.12, gap * 0.006); // сильний суперник збирає більше
    if (derby) fill += 0.12;
    if (weather === 'snow' || weather === 'rain') fill -= 0.06;
    if (homeId === state.clubId) fill = Math.max(fill, stShare(state)); // абонементники приходять
    const R = FM.rng(`att-${state.season.seed}-${state.season.week}-${homeId}`);
    fill = Math.max(0.2, Math.min(1, fill + R.range(-0.04, 0.04)));
    return { n: Math.round((c.capacity || 8000) * fill), fill };
  }

  /**
   * Атрибутика за тиждень (млн €): база від доходу клубу, настрій фанатів, зірки (збірна, рівень),
   * свіжий підпис зірки — сплеск продажів футболок з прізвищем. Повертає { money, star }.
   */
  function merch(W, state) {
    const c = W.club(state.clubId), S = state.season;
    const sq = W.squad(state.clubId);
    const stars = sq.filter((p) => p.ca >= 150 || (p.caps || 0) >= 40).length;
    const fresh = sq.filter((p) => p.boughtSeason === S.year && S.week - (p.boughtWeek ?? -9) <= 2 && p.value >= 8).sort((a, b) => b.value - a.value)[0];
    const mood = FM.club.fans(W, c.id).mood;
    let money = (c.income0 || 0.01) * 0.04 * (0.6 + mood / 100) * (1 + stars * 0.06) * (FM.cal ? FM.cal.weekK(S) : 1);
    if (fresh) money += fresh.value * 0.012;
    money = r4(money);
    c.balance = r4(c.balance + money);
    if (state.board && state.board.fin) state.board.fin.merch = r4((state.board.fin.merch || 0) + money);
    return { money, star: fresh || null };
  }

  FM.money = { SEASON_TICKETS, seasonTicketShare, sellSeasonTickets, stShare, attendance, merch };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
