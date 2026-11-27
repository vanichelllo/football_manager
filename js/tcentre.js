// Трансферний центр (як прийнято в жанрі): додаткові виплати в пропозиції (за голи, за вихід у вищу лігу,
// відсоток з наступного продажу, оренда назад, дата переходу), що шукає клуб-продавець, статус гравця в клубі;
// пропозиції оренди за ваших гравців з відсотком зарплати й обіцянкою ігрового часу; переходи наприкінці сезону.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;

  const SELL_ON = [0, 10, 15, 20, 25, 30, 50];
  const GOALS = [[0, 'Без бонусу'], [10, 'Після 10 голів'], [20, 'Після 20 голів'], [30, 'Після 30 голів']];
  const PLAYTIME = { star: 'Основний гравець', first: 'Важливий гравець основи', rotation: 'Ротація', backup: 'Запасний' };

  /** Що клуб-продавець думає про гравця. */
  function statusAt(W, p) {
    if (!p.club) return 'Вільний агент';
    if (p.listed) return 'Виставлений на продаж';
    const sq = W.squad(p.club).sort((a, b) => b.ca - a.ca), r = sq.findIndex((x) => x.id === p.id);
    return r < 3 ? 'Незамінний для клубу' : r < 11 ? 'Гравець основи' : r < 17 ? 'Ротація' : 'Запасний';
  }
  /** Кого шукає клуб: дві найслабші позиції. */
  function needs(W, clubId) {
    const need = { GK: 1, CB: 2, FB: 2, DM: 1, CM: 2, AM: 1, W: 2, ST: 1 };
    const sq = W.squad(clubId);
    return Object.entries(need).map(([r, n]) => { const b = sq.filter((p) => p.roles.includes(r)).map((p) => p.ca).sort((a, b2) => b2 - a); return [r, b.length >= n ? b[n - 1] : 0]; })
      .sort((a, b) => a[1] - b[1]).slice(0, 2).map(([r]) => r);
  }
  /**
   * Скільки «додають» до суми додаткові умови (у млн €, як їх оцінює продавець).
   * ex: { sellOn (%), goals (кількість) і goalsFee, promo (сума), loanBack, later (перехід наприкінці сезону) }
   */
  function extrasValue(fee, ex = {}) {
    let v = 0;
    if (ex.sellOn) v += fee * ex.sellOn / 100 * 0.45;
    if (ex.goals && ex.goalsFee) v += ex.goalsFee * (ex.goals <= 10 ? 0.45 : ex.goals <= 20 ? 0.3 : 0.18);
    if (ex.promoFee) v += ex.promoFee * 0.3;
    if (ex.loanBack) v += fee * 0.08;
    if (ex.later) v += fee * 0.05;
    return r2(v);
  }
  /** Потенційна повна сума угоди (з усіма бонусами). */
  const potential = (fee, ex = {}) => r2(fee + (ex.goalsFee || 0) + (ex.promoFee || 0) + (ex.appsBonus || 0));

  /** Записати бонуси продавцю за голи й за вихід у вищу лігу (перевіряються щотижня й наприкінці сезону). */
  function registerExtras(state, p, fromClub, ex = {}) {
    if (!fromClub) return;
    const S = state.season;
    if (ex.goals && ex.goalsFee) state.addons = (state.addons || []).concat([{ to: fromClub, pid: p.id, goals: ex.goals, bonus: ex.goalsFee, got: 0, lastG: (S.ps[p.id] && S.ps[p.id][1]) || 0, y: S.year, kind: 'goals' }]);
    if (ex.promoFee) state.promoAddons = (state.promoAddons || []).concat([{ to: fromClub, pid: p.id, bonus: ex.promoFee, y: S.year }]);
  }
  /** Тиждень: бонуси за голи. Повертає новини. */
  function weekGoals(W, state) {
    const S = state.season, me = W.club(state.clubId), news = [];
    for (const a of state.addons || []) {
      if (a.kind !== 'goals' || a.done) continue;
      const p = W.player(a.pid);
      if (!p || p.club !== state.clubId) { a.done = true; continue; }
      const cur = (S.ps[p.id] && S.ps[p.id][1]) || 0;
      if (a.y !== S.year) { a.y = S.year; a.lastG = 0; }
      a.got += Math.max(0, cur - a.lastG); a.lastG = cur;
      if (a.got >= a.goals) {
        a.done = true;
        me.balance = r2(me.balance - a.bonus);
        if (W.club(a.to)) W.club(a.to).balance = r2(W.club(a.to).balance + a.bonus);
        news.push(`${p.name} забив ${a.goals} голів — виплачено бонус ${FM.market.fmtM(a.bonus)} клубу ${W.club(a.to) ? W.club(a.to).name : ''}.`);
      }
    }
    state.addons = (state.addons || []).filter((a) => !a.done);
    return news;
  }
  /** Кінець сезону: бонуси продавцям за вихід у вищу лігу. */
  function seasonPromo(W, state, promoted) {
    const me = W.club(state.clubId), out = [];
    for (const a of state.promoAddons || []) {
      if (!promoted) continue;
      me.balance = r2(me.balance - a.bonus);
      if (W.club(a.to)) W.club(a.to).balance = r2(W.club(a.to).balance + a.bonus);
      out.push(`Вихід у вищу лігу: бонус ${FM.market.fmtM(a.bonus)} клубу ${W.club(a.to) ? W.club(a.to).name : ''} за ${W.player(a.pid) ? W.player(a.pid).name : 'гравця'}.`);
    }
    state.promoAddons = [];
    return out;
  }

  // ---------------- Перехід наприкінці сезону ----------------
  /** Угода, яка відбудеться з початком наступного сезону (гроші — тоді ж). */
  function addFuture(state, d) { state.future = (state.future || []).concat([{ ...d, s: state.season.year }]); }
  /** Початок нового сезону: провести відкладені переходи. Повертає новини. */
  function runFuture(W, state, signer) {
    const out = [];
    for (const d of state.future || []) {
      const p = W.player(d.pid);
      if (!p || p.retired || p.club !== d.from) { out.push(`Відкладений перехід ${p ? p.name : 'гравця'} не відбувся: гравець уже не в тому клубі.`); continue; }
      const r = signer(p, d);
      out.push(r);
    }
    state.future = [];
    return out;
  }

  // ---------------- Оренди ваших гравців ----------------
  /** Тиждень (у вікно): клуби пропонують узяти в оренду гравців, які в вас мало грають. */
  function loanWeekly(W, state, name = (p) => p.name) {
    const S = state.season, out = [];
    if (!FM.market.windowOpen(S)) { state.loanOffers = []; return out; }
    const R = FM.rng(`loanoff-${S.seed}-${S.year}-${S.week}`);
    const games = S.fixtures.filter((f) => f.s && (f.h === state.clubId || f.a === state.clubId)).length;
    const sq = W.squad(state.clubId).filter((p) => !p.loan && !p.injury);
    const ranked = [...sq].sort((a, b) => b.ca - a.ca);
    state.loanOffers = (state.loanOffers || []).filter((o) => S.week - o.w <= 2 && W.player(o.pid) && W.player(o.pid).club === state.clubId);
    for (const p of sq) {
      const age = W.age(p) ?? 25, rank = ranked.indexOf(p), apps = (S.ps[p.id] || [0])[0];
      const fringe = rank >= 14 || (games >= 6 && apps / games < 0.25);
      if (!fringe || age > 26 || state.loanOffers.some((o) => o.pid === p.id)) continue;
      if (!R.chance(p.listed ? 0.25 : 0.07)) continue;
      const opts = FM.market.loanOffers(W, state, p);
      if (!opts.length) continue;
      const o = opts[0], lvl = W.clubLevel(o.club);
      const role = p.ca >= lvl + 5 ? 'star' : p.ca >= lvl - 5 ? 'first' : p.ca >= lvl - 15 ? 'rotation' : 'backup';
      const share = Math.round(Math.min(1, Math.max(0, R.range(0, 1.1))) * 4) / 4; // 0, 25, 50, 75, 100% зарплати
      const off = { id: `${S.year}-${S.week}-${p.id}-${o.club}`, pid: p.id, club: o.club, share, role, w: S.week, months: R.pick([3, 6, 12]) };
      state.loanOffers.push(off);
      out.push(`${W.club(o.club).name} хоче взяти ${name(p)} в оренду: платить ${Math.round(share * 100)}% зарплати, ${PLAYTIME[role].toLowerCase()}.`);
    }
    return out.slice(0, 3);
  }
  function acceptLoan(W, state, id) {
    const o = (state.loanOffers || []).find((x) => x.id === id);
    if (!o) return null;
    const p = W.player(o.pid);
    state.loanOffers = state.loanOffers.filter((x) => x.pid !== o.pid);
    if (!p || p.club !== state.clubId) return null;
    FM.market.loanIn(W, state, p, o.club, o.share);
    p.loan.promise = o.role;
    return `${p.name} іде в оренду до ${W.club(o.club).name} до кінця сезону (${PLAYTIME[o.role].toLowerCase()}, вони платять ${Math.round(o.share * 100)}% зарплати).`;
  }
  const rejectLoan = (state, id) => { state.loanOffers = (state.loanOffers || []).filter((x) => x.id !== id); };

  FM.tcentre = { SELL_ON, GOALS, PLAYTIME, statusAt, needs, extrasValue, potential, registerExtras, weekGoals, seasonPromo, addFuture, runFuture, loanWeekly, acceptLoan, rejectLoan };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
