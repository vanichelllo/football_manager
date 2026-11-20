// Трансфери й контракти: зарплати, бюджети, вікна, ціна продажу, торг із клубом і гравцем,
// пропозиції за ваших гравців, трансфери між клубами ШІ, кінець контрактів.
// Гроші: трансфери й баланс — у млн €, зарплати — у тис. € на тиждень.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const LEAGUE_MONEY = { eng: 3, esp: 2, ita: 1.6, ger: 1.8, fra: 1.4, ukr: 0.9, eng2: 1.1, esp2: 0.6, ita2: 0.55, ger2: 0.7, fra2: 0.5, ukr2: 0.2,
    por: 1, ned: 1, tur: 1.1, pol: 0.5, bel: 0.9, sco: 0.7, gre: 0.7, cze: 0.55, den: 0.7, aut: 0.65, sui: 0.8 };
  const WAGE_MULT = { eng: 1.3, esp: 1.1, ita: 1, ger: 1.05, fra: 0.95, ukr: 0.55, eng2: 1.1, esp2: 0.8, ita2: 0.8, ger2: 0.85, fra2: 0.75, ukr2: 0.4,
    por: 0.8, ned: 0.85, tur: 1.1, pol: 0.65, bel: 0.8, sco: 0.7, gre: 0.7, cze: 0.6, den: 0.75, aut: 0.7, sui: 0.85 };
  const MIN_WAGE = { eng: 8, esp: 4, ita: 3, ger: 4, fra: 3, ukr: 1, eng2: 3, esp2: 1.5, ita2: 1.5, ger2: 2, fra2: 1.5, ukr2: 1, por: 1.5, ned: 2, tur: 2, pol: 1, bel: 1.5, sco: 1, gre: 1, cze: 1, den: 1.5, aut: 1.2, sui: 1.5 };

  /** Тижнева зарплата за ринковою ціною: ~15% ціни на рік. */
  function fairWage(value, league) {
    return Math.max(MIN_WAGE[league] || 1, Math.round(value * 2.9 * (WAGE_MULT[league] || 1)));
  }

  const hashN = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

  /** Контракти, зарплати й гроші клубів, яких ще немає (перший запуск або старе збереження). */
  function init(W, state) {
    const year = state.season.year;
    for (const p of W.players.values()) {
      if (!p.club || p.retired) continue;
      const lg = W.club(p.club).league;
      if (p.contract == null) {
        const age = W.age(p) ?? 24;
        const max = age <= 23 ? 5 : age <= 28 ? 4 : age <= 31 ? 3 : 2;
        p.contract = year + 1 + Math.floor(hashN(p.id + 'c') * max);
      }
      if (p.wage == null) p.wage = Math.round(fairWage(p.value, lg) * (0.75 + 0.5 * hashN(p.id + 'w')));
    }
    ensureKeepers(W, state, FM.rng(`keepers-${state.season.seed}`));
    for (const c of W.clubs.values()) {
      if (c.balance != null) continue;
      const rich = Math.exp((W.clubLevel(c.id) - 100) / 25) * (LEAGUE_MONEY[c.league] || 0.6);
      c.balance = Math.round(rich * 2.5 * 10) / 10;
    }
  }

  /** Фонд зарплат клубу: свої гравці + частка за орендованих + доплата за відданих в оренду. */
  // Хто в оренді: індекс замість перебору всієї бази (скидається при кожній зміні оренди)
  const loanIdx = new WeakMap();
  const loanReset = (W) => loanIdx.delete(W);
  function loanedOut(W, clubId) {
    let m = loanIdx.get(W);
    if (!m) {
      m = new Map();
      for (const p of W.players.values()) if (p.loan) (m.get(p.loan.from) || m.set(p.loan.from, []).get(p.loan.from)).push(p);
      loanIdx.set(W, m);
    }
    return m.get(clubId) || [];
  }
  function wageBill(W, clubId) {
    let s = 0;
    for (const id of W.club(clubId).players) { const p = W.player(id); s += (p.wage || 0) * (p.loan ? p.loan.share : 1); }
    for (const p of loanedOut(W, clubId)) if (p.loan && p.loan.from === clubId) s += (p.wage || 0) * (1 - p.loan.share);
    return Math.round(s);
  }

  // Трансферні вікна. Реальний календар: літо — з початку липня до 1 вересня, зима — січень (до 2 лютого).
  // Старі збереження (без календаря): 4 перші тижні сезону й тижні 21–24.
  const WINDOWS = [[0, 3], [20, 23]];
  const windows = (S) => (S && S.cal ? S.cal.windows : WINDOWS);
  const windowOpen = (S) => windows(S).some(([a, b]) => S.week >= a && S.week <= b);
  function nextWindow(S) {
    for (const [a] of windows(S)) if (S.week < a) return a;
    return null; // наступне — влітку, на початку нового сезону
  }

  /** Наскільки гравець важливий для свого клубу: місце за рівнем у складі (0 — найкращий). */
  function rankInClub(W, p) {
    if (!p.club) return 99;
    let r = 0;
    for (const id of W.club(p.club).players) { const q = W.player(id); if (q !== p && (q.ca > p.ca || (q.ca === p.ca && id < p.id))) r++; }
    return r;
  }

  /** Скільки клуб хоче за гравця, млн €. */
  function askingPrice(W, p, S) {
    if (!p.club) return 0;
    const yearsLeft = Math.max(0, (p.contract || S.year + 2) - S.year - 1);
    let k = 1.05;
    const rank = rankInClub(W, p);
    if (rank < 6) k *= 1.45; else if (rank < 11) k *= 1.2;
    k *= yearsLeft === 0 ? 0.55 : yearsLeft === 1 ? 0.8 : yearsLeft === 2 ? 0.95 : 1.1;
    if (p.listed) k *= 0.75;
    return Math.max(0.1, Math.round(p.value * k * 20) / 20);
  }

  /** Відповідь клубу на пропозицію. */
  function clubResponse(W, p, fee, buyerId, S, opts) {
    if (!p.club) return { ok: true, ask: 0 };
    if (p.club === buyerId) return { ok: false, reason: 'Це ваш гравець.' };
    const sq = W.club(p.club).players.length;
    if (sq <= 18) return { ok: false, reason: 'Клуб не продає: у складі замало гравців.' };
    if (p.roles[0] === 'GK' && W.squad(p.club).filter((x) => x.roles[0] === 'GK').length <= 2) return { ok: false, reason: 'Клуб не продає одного з двох воротарів.' };
    if (p.loan) return { ok: false, reason: 'Гравець в оренді — його не можна купити, доки він не повернеться.' };
    if (p.clause && fee >= p.clause) return { ok: true, ask: p.clause, clause: true }; // відступні: клуб не може відмовити
    if (p.boughtWeek != null && p.boughtSeason === S.year) return { ok: false, reason: 'Гравця щойно купили — клуб не продає його в тому ж сезоні.' };
    const ask = askingPrice(W, p, S) * (opts && opts.sellOn ? 0.9 : 1) * (FM.career ? FM.career.negFor(buyerId) : 1); // переговори тренера
    const r5 = (v) => Math.round(v * 20) / 20;
    if (fee >= ask - 0.001) return { ok: true, ask: r5(ask) };
    if (fee >= ask * 0.75) return { ok: false, counter: r5(ask), ask: r5(ask), reason: `Клуб просить ${fmtM(r5(ask))}.` };
    return { ok: false, ask, reason: `Пропозицію відхилено: клуб чекає приблизно ${fmtM(ask)}.` };
  }

  /** Скільки гравець хоче заробляти в новому клубі, тис. €/тиж., або null — не піде за жодні гроші. */
  function wageDemand(W, p, buyerId) {
    const buyer = W.club(buyerId);
    const base = Math.max(p.wage || 0, fairWage(p.value, buyer.league));
    const from = p.club ? W.clubLevel(p.club) : 0;
    const gap = from - W.clubLevel(buyerId); // наскільки новий клуб слабший
    if (gap > 28) return null;
    let k = p.club ? 1.15 : 1; // за перехід — надбавка
    if (gap > 8) k *= 1 + (gap - 8) * 0.03;
    if (gap < -10) k *= 0.95; // у сильніший клуб — охочіше
    return Math.round(base * k * (FM.career ? FM.career.negFor(buyerId) : 1) * (FM.agents ? FM.agents.greed(p) : 1));
  }

  /** Суперник у боротьбі за гравця (детерміновано на тиждень): { club, wage } або null. */
  function rival(W, state, p) {
    if (!p.club && p.ca < 100) return null;
    if (p.value < 3 && p.ca < 115) return null;
    const R = FM.rng(`rival-${state.season.seed}-${state.season.week}-${p.id}`);
    if (!R.chance(0.4)) return null;
    const me = state.clubId, lvl = W.clubLevel(me);
    const cands = [...W.clubs.values()].filter((c) => c.id !== me && c.id !== p.club && W.clubLevel(c.id) >= lvl - 8 && c.balance >= (p.club ? askingPrice(W, p, state.season) : 0));
    if (!cands.length) return null;
    const c = R.pick(cands);
    const d = wageDemand(W, p, c.id);
    return d == null ? null : { club: c.id, wage: Math.round(d * R.range(1, 1.18)) };
  }
  /** Комісія агента: 5% суми (або 4 тижневі зарплати для вільного агента), млн €. */
  const agentFee = (fee, wage, p) => Math.round(Math.max(fee * 0.05, (wage * 4) / 1000) * (p && FM.agents ? FM.agents.feeMult(p) : 1) * 100) / 100; // жадібний агент бере більше

  /** Наскільки пункти контракту знижують вимоги: відступні — −10%, бонус за голи — до −8%. */
  function clauseDiscount(p, clauses) {
    let k = 1;
    if (clauses && clauses.clause) k -= 0.1;
    if (clauses && clauses.goalBonus) k -= Math.min(0.08, clauses.goalBonus / Math.max(1, p.wage || 10) * 0.2);
    return k;
  }

  function playerResponse(W, p, buyerId, wage, years, opts = {}) {
    const raw = wageDemand(W, p, buyerId);
    const demand = raw == null ? null : Math.round(raw * clauseDiscount(p, opts.clauses));
    if (demand == null) return { ok: false, reason: 'Гравець не хоче переходити в значно слабший клуб.' };
    const age = W.age(p) ?? 24;
    if (age >= 31 && years > 2) return { ok: false, demand, reason: 'У його віці клуб може запропонувати не більше двох років — або гравець просить коротший контракт.' };
    if (opts.rival) {
      // гравець порівнює пропозиції: зарплата з поправкою на силу клубу
      const score = (w, clubId) => w * (1 + (W.clubLevel(clubId) - 100) * 0.006);
      if (score(wage, buyerId) < score(opts.rival.wage, opts.rival.club)) return { ok: false, demand: Math.max(demand, opts.rival.wage), reason: `Гравець обирає ${W.club(opts.rival.club).name}: там пропонують ${opts.rival.wage} тис. € на тиждень.` };
    }
    if (wage >= demand) return { ok: true, demand };
    if (wage >= demand * 0.9) return { ok: false, demand, reason: `Гравець хоче ${demand} тис. € на тиждень.` };
    return { ok: false, demand, reason: `Замало. Гравець розраховує приблизно на ${demand} тис. € на тиждень.` };
  }

  // Центр повідомлень: кожна новина має номер (для непрочитаних) і розділ
  const NEWS_CATS = {
    match: 'Матчі', cups: 'Кубки', transfers: 'Трансфери', players: 'Гравці', club: 'Клуб і правління', intl: 'Збірна', ach: 'Досягнення', world: 'Світ',
  };
  function newsCat(text) {
    if (/^Досягнення|^Досвід/.test(text)) return 'ach';
    if (/Збірна|збірн/.test(text)) return 'intl';
    if (/Кубок|Ліга чемпіонів|Ліга Європи|етап ліги|фінал|ТРОФЕЙ/i.test(text)) return 'cups';
    if (/обіцян|незадоволен|продажу|травм|завершив кар|настрій|розчарован/i.test(text)) return 'players';
    if (/купи|прода|трансфер|оренд|пропозиц|вікно|відступн|скаут|шортлист|підписав/i.test(text)) return 'transfers';
    if (/правлін|звільн|ліцензі|курс|Завершено|очолили|стадіон|академі|вилітає|виходить до/i.test(text)) return 'club';
    if (/тренер|звільнив/i.test(text)) return 'world';
    return 'match';
  }
  function news(state, text, cat) {
    text = text.replace(/\.\.$/, '.'); // «€550 тис..» → «€550 тис.»
    state.newsSeq = (state.newsSeq || 0) + 1;
    state.news = (state.news || []).concat([{ id: state.newsSeq, s: state.season.year, w: state.season.week, text, c: cat || newsCat(text) }]).slice(-200);
  }
  /** Скільки непрочитаних. */
  const unread = (state) => (state.news || []).filter((n) => n.id && n.id > (state.newsRead || 0)).length;
  const fmtM = (v) => (v >= 1 ? '€' + (Math.round(v * 10) / 10).toString().replace('.', ',') + ' млн' : '€' + Math.round(v * 1000) + ' тис.');

  /** Завершити трансфер: гроші, контракт, перехід, запис в історію. */
  function complete(W, state, p, buyerId, fee, wage, years, extra = {}) {
    const from = p.club;
    if (from && from === state.clubId && buyerId !== state.clubId && FM.dressing) { const t = FM.dressing.onSale(W, state, p); if (t) news(state, t, 'players'); }
    const buyer = W.club(buyerId);
    buyer.balance = Math.round((buyer.balance - fee - (extra.agent || 0)) * 100) / 100;
    // трансферний бюджет людини (js/budget.js): купівля — витрата, продаж — 75% повертається в бюджет
    if (FM.budget && state.clubId) {
      if (buyerId === state.clubId) FM.budget.spend(W, state, fee + (extra.agent || 0));
      else if (from === state.clubId && fee > 0) FM.budget.earn(W, state, fee);
    }
    if (from) {
      let toSeller = fee;
      if (p.sellOn && fee > 0) { // відсоток з наступного продажу — попередньому клубу
        const cut = Math.round(fee * p.sellOn.pct * 100) / 100;
        if (W.club(p.sellOn.club)) W.club(p.sellOn.club).balance = Math.round((W.club(p.sellOn.club).balance + cut) * 100) / 100;
        toSeller -= cut;
      }
      W.club(from).balance = Math.round((W.club(from).balance + toSeller) * 100) / 100;
    }
    delete p.sellOn; delete p.loan; delete p.clause; delete p.goalBonus; loanReset(W);
    if (extra.sellOn && from) p.sellOn = { club: from, pct: extra.sellOn };
    if (extra.clause) p.clause = extra.clause;
    if (extra.goalBonus) p.goalBonus = extra.goalBonus;
    if (extra.swap) { const q = W.player(extra.swap); W.move(q.id, from); delete q.listed; q.boughtSeason = state.season.year; q.boughtWeek = state.season.week; }
    W.move(p.id, buyerId);
    p.wage = wage;
    p.contract = state.season.year + years;
    p.boughtSeason = state.season.year; p.boughtWeek = state.season.week;
    if (buyerId === state.clubId && from !== state.clubId && FM.dressing && FM.dressing.onArrive) { const t = FM.dressing.onArrive(W, state, p); if (t) news(state, t, 'players'); }
    delete p.listed; delete p.free;
    p.value = FM.marketValue(p.ca, W.age(p) ?? 24, buyer.league, p.pa);
    state.transfers = (state.transfers || []).concat([{ s: state.season.year, w: state.season.week, p: p.id, from: from || null, to: buyerId, fee }]).slice(-300);
    state.offers = (state.offers || []).filter((o) => o.pid !== p.id);
    return true;
  }

  // ---------------- Оренди ----------------
  /** Чи можна взяти гравця в оренду: не основа свого клубу або молодий. */
  function loanable(W, p) {
    return p.club && !p.loan && ((W.age(p) ?? 30) <= 22 || rankInClub(W, p) >= 12);
  }
  const loanFee = (p) => Math.round(Math.max(0.05, p.value * 0.05) * 20) / 20;
  /** Узяти в оренду до кінця сезону: share — частка зарплати, яку платить орендар. */
  function loanIn(W, state, p, toClub, share) {
    const fee = loanFee(p);
    W.club(toClub).balance = Math.round((W.club(toClub).balance - fee) * 100) / 100;
    W.club(p.club).balance = Math.round((W.club(p.club).balance + fee) * 100) / 100;
    if (FM.budget && toClub === state.clubId) FM.budget.spend(W, state, fee);
    p.loan = { from: p.club, to: toClub, share, until: state.season.year };
    loanReset(W);
    W.move(p.id, toClub);
    delete p.listed;
    state.transfers = (state.transfers || []).concat([{ s: state.season.year, w: state.season.week, p: p.id, from: p.loan.from, to: toClub, fee, loan: true }]).slice(-300);
  }
  /** Пропозиції оренди для гравця людини: клуби, де він гратиме. */
  function loanOffers(W, state, p) {
    const R = FM.rng(`loan-${state.season.seed}-${state.season.week}-${p.id}`);
    const lvl = p.ca;
    const cands = [...W.clubs.values()].filter((c) => c.id !== state.clubId && c.players.length < 30 && W.clubLevel(c.id) >= lvl - 25 && W.clubLevel(c.id) <= lvl + 8);
    const out = [];
    while (out.length < 3 && cands.length) {
      const c = cands.splice(R.int(cands.length), 1)[0];
      out.push({ club: c.id, share: Math.round(R.range(0.5, 1) * 20) / 20 });
    }
    return out;
  }
  function returnLoans(W, state) {
    loanReset(W);
    const back = [];
    for (const p of W.players.values()) {
      if (!p.loan || p.loan.until > state.season.year) continue;
      const from = p.loan.from;
      delete p.loan;
      if (W.club(from)) { W.move(p.id, from); back.push(p); }
    }
    return back;
  }

  /** Розірвати контракт: половина зарплати, що лишилась. Гравець стає вільним агентом. */
  function releaseCost(p, S) {
    const years = Math.max(0, (p.contract || S.year + 1) - S.year - 1) + Math.max(0, FM.season.weeks(S) - S.week) / FM.season.weeks(S);
    return Math.round((p.wage || 0) * 52 * years * 0.5) / 1000; // млн €
  }
  function release(W, state, p) {
    const c = W.club(p.club);
    c.balance = Math.round((c.balance - releaseCost(p, state.season)) * 100) / 100;
    p.lastClub = p.club;
    W.move(p.id, null);
    p.free = true; delete p.listed;
  }

  /** Наскільки слабка позиція в клубі: найгірший з основних на ролі. */
  function weakestRole(W, clubId) {
    const sq = W.squad(clubId);
    const need = { GK: 1, CB: 2, FB: 2, DM: 1, CM: 2, AM: 1, W: 2, ST: 1 };
    let worst = null;
    for (const [r, n] of Object.entries(need)) {
      const best = sq.filter((p) => p.roles.includes(r) && !p.injury).map((p) => p.ca).sort((a, b) => b - a);
      const v = best.length >= n ? best[n - 1] : 0;
      if (!worst || v < worst.v) worst = { role: r, v };
    }
    return worst;
  }

  /**
   * Тиждень ринку: пропозиції за гравців людини, трансфери ШІ, підписання вільних агентів.
   * Викликати після закриття туру.
   */
  // ---------------- Динамічні ціни й чутки ----------------
  /** Ціни щотижня: форма, травми, повернення до норми. Для ваших гравців і шортлиста — новини про великі зміни. */
  function valuesWeek(W, state) {
    const S = state.season;
    const watch = new Set([...(state.shortlist || []), ...W.club(state.clubId).players]);
    for (const p of W.players.values()) {
      if (!p.club || p.retired) continue;
      const f = p.form && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 6.6;
      let target = Math.max(0.75, Math.min(1.45, 1 + (f - 6.6) * 0.28));
      if ((p.injury || 0) >= 4) target *= 0.85;
      const h = (p.hype ?? 1) + (target - (p.hype ?? 1)) * 0.15;
      p.hype = Math.round(h * 1000) / 1000;
      const base = FM.marketValue(p.ca, W.age(p) ?? 24, W.club(p.club).league, p.pa);
      p.value = Math.max(0.05, Math.round(base * p.hype * 20) / 20);
      if (watch.has(p.id) && p.value >= 1) {
        const ref = p.valueSeen || p.value;
        const ch = p.value / ref - 1;
        if (Math.abs(ch) >= 0.25) {
          news(state, `${p.club === state.clubId ? 'Ваш гравець' : 'Шортлист'}: ціна ${p.name} ${ch > 0 ? 'зросла' : 'впала'} до ${fmtM(p.value)} (${ch > 0 ? '+' : ''}${Math.round(ch * 100)}%).`, 'transfers');
          p.valueSeen = p.value;
        } else if (!p.valueSeen) p.valueSeen = p.value;
      }
    }
  }
  /** Чутки: сильніші клуби помічають ваших гравців у формі — у вікно від них частіше пропозиції. */
  function rumoursWeek(W, state, R) {
    const S = state.season, lvl = W.clubLevel(state.clubId);
    for (const p of W.squad(state.clubId)) {
      const f = p.form && p.form.length >= 3 ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 0;
      if (f < 7.2 || p.loan || (p.interest && p.interest.until > S.year * 100 + S.week) || !R.chance(0.08)) continue;
      const cands = [...W.clubs.values()].filter((c) => c.id !== state.clubId && W.clubLevel(c.id) > lvl + 5 && c.balance > p.value);
      if (!cands.length) continue;
      const c = R.pick(cands);
      p.interest = { club: c.id, until: S.year * 100 + S.week + 12 };
      news(state, `Чутки: ${c.name} стежить за грою ${p.name}. Скаути клубу були на вашому матчі.`, 'transfers');
    }
  }

  function weekly(W, state) {
    const S = state.season;
    const second = !!(FM.duo && FM.duo.second); // гра на двох: прохід за другого тренера — лише його справи
    const R = FM.rng(`market-${S.seed}-${S.week}${second ? '-2' : ''}`);
    const human = (id) => (FM.duo ? FM.duo.human(state, id) : id === state.clubId);
    if (!second) { valuesWeek(W, state); rumoursWeek(W, state, R); }
    state.offers = (state.offers || []).filter((o) => S.week - o.w <= 2 && W.player(o.pid) && W.player(o.pid).club === state.clubId);
    // скаутські звіти: те, що замовили минулого тижня, — тепер відомо точно
    state.known = state.known || {};
    for (const id of state.scouting || []) state.known[id] = true;
    state.scouting = [];
    const open = windowOpen(S);
    const deadline = open && windows(S).some(([, b]) => S.week === b);
    // довше вікно — менше угод за тиждень (старе вікно тривало 4 тижні)
    const cur = windows(S).find(([a, b]) => S.week >= a && S.week <= b);
    const wf = cur ? Math.min(1, 4 / (cur[1] - cur[0] + 1)) : 1;
    const clubs = [...W.clubs.values()];
    if (deadline && !second) news(state, 'День закриття трансферного вікна: клуби поспішають завершити угоди.');
    scoutsWeek(W, state);
    // шортлист: зміни у відстежуваних гравців
    state.slSeen = state.slSeen || {};
    for (const id of state.shortlist || []) {
      const p = W.player(id);
      if (!p) continue;
      const sig = `${p.club}|${p.listed ? 1 : 0}|${p.injury ? 1 : 0}|${p.retired ? 1 : 0}`;
      if (state.slSeen[id] && state.slSeen[id] !== sig) {
        const [club, listed] = state.slSeen[id].split('|');
        if (p.retired) news(state, `Шортлист: ${p.name} завершив кар'єру.`);
        else if (club !== String(p.club)) news(state, `Шортлист: ${p.name} перейшов до ${p.club ? W.club(p.club).name : 'вільних агентів'}.`);
        else if (listed === '0' && p.listed) news(state, `Шортлист: ${p.name} виставлений на трансфер.`);
      }
      state.slSeen[id] = sig;
    }

    if (open) {
      // пропозиції за гравців людини
      for (const p of W.squad(state.clubId)) {
        if (p.loan) continue;
        const big = p.value >= 4 && rankInClub(W, p) < 8;
        const hot = p.interest && p.interest.until > S.year * 100 + S.week && W.club(p.interest.club);
        let chance = (p.listed ? 0.45 : (big ? 0.05 : 0.01) * wf) * (deadline ? 1.6 : 1) * (hot ? 4 : 1);
        if (p.clause && big) chance = Math.max(chance, 0.04);
        if (!R.chance(chance)) continue;
        const buyers = clubs.filter((c) => !human(c.id) && c.balance > p.value * 0.9 && W.clubLevel(c.id) >= p.ca - 15);
        if (!buyers.length && !hot) continue;
        const b = hot && W.club(p.interest.club).balance > p.value * 0.9 ? W.club(p.interest.club) : R.pick(buyers.length ? buyers : [W.club(p.interest.club)]);
        let fee = Math.round(p.value * (p.listed ? R.range(0.75, 1.05) : R.range(1.1, 1.45)) * 20) / 20;
        const byClause = p.clause && b.balance >= p.clause && p.clause <= p.value * 1.6;
        if (byClause) fee = p.clause;
        if (byClause) { // відступні: клуб не може відмовити, гравець іде
          complete(W, state, p, b.id, fee, wageDemand(W, p, b.id) || p.wage, 3);
          news(state, `${b.name} сплатив відступні (${fmtM(fee)}) — ${p.name} іде від вас.`);
          continue;
        }
        if (state.offers.some((o) => o.pid === p.id && o.from === b.id)) continue;
        state.offers.push({ id: `${S.year}-${S.week}-${p.id}-${b.id}`, pid: p.id, from: b.id, fee, w: S.week });
        news(state, `${b.name} пропонує ${fmtM(fee)} за гравця ${p.name}.`);
      }
      // клуби ШІ виставляють старших не основних гравців — їх дешевше продати
      if (!second && windows(S).some(([a]) => S.week === a)) for (const c of clubs) {
        if (human(c.id)) continue;
        for (const p of W.squad(c.id)) if ((W.age(p) ?? 24) >= 31 && rankInClub(W, p) >= 8 && !p.loan) p.listed = true;
      }
      // зимова «паніка»: аутсайдери (нижні 4 місця) купують охочіше й переплачують
      const panic = new Set();
      if (!second && S.week >= windows(S)[1][0]) for (const l of W.db.leagues) { const t = FM.season.table(S, W, l.id); for (const r of t.slice(-4)) panic.add(r.id); }
      // суперники перехоплюють гравців з вашого шортлиста
      for (const id of state.shortlist || []) {
        const p = W.player(id);
        if (!p || !p.club || p.club === state.clubId || p.loan || !R.chance(deadline ? 0.06 : 0.025 * wf)) continue;
        const rivals = clubs.filter((c) => !human(c.id) && c.id !== p.club && c.balance > p.value * 1.6 && W.clubLevel(c.id) >= p.ca - 8 && W.clubLevel(c.id) <= p.ca + 20);
        if (!rivals.length) continue;
        const c = R.pick(rivals), ask = askingPrice(W, p, S), wd = wageDemand(W, p, c.id);
        if (wd == null || clubResponse(W, p, ask, c.id, S).ok !== true) continue;
        const from = W.club(p.club);
        complete(W, state, p, c.id, ask, wd, 3 + R.int(2));
        news(state, `Вас випередили: ${p.name} з вашого шортлиста переходить з ${from.name} до ${c.name} за ${fmtM(ask)}.`, 'transfers');
      }
      // клуби ШІ латають слабкі позиції: беруть молодших, бережуть бюджет і фонд зарплат
      if (!second) for (const c of clubs) {
        const scared = panic.has(c.id);
        if (human(c.id) || !R.chance((deadline ? 0.3 : 0.12 * wf) * (scared ? 2.5 : 1)) || c.balance < 0.5) continue;
        const weak = weakestRole(W, c.id);
        if (!weak) continue;
        const lvl = W.clubLevel(c.id);
        const room = (c.income0 || 1) * 1000 * 0.95 - wageBill(W, c.id); // скільки ще можна платити зарплат
        const cands = [...W.players.values()].filter((p) => p.club && p.club !== c.id && !human(p.club) && !p.retired && !p.loan
          && p.roles[0] === weak.role && p.ca > weak.v + 4 && p.ca <= lvl + 12 && (W.age(p) ?? 24) <= 31);
        let best = null;
        const score = (p, ask) => p.ca + (p.pa - p.ca) * 0.3 - Math.max(0, (W.age(p) ?? 24) - 27) * 2 - ask * 0.5;
        for (const p of cands) {
          const ask = askingPrice(W, p, S);
          if (ask > c.balance * (scared ? 0.8 : 0.5) || clubResponse(W, p, ask, c.id, S).ok !== true) continue;
          const wd = wageDemand(W, p, c.id);
          if (wd == null || wd > room + (W.squad(c.id).filter((x) => x.roles[0] === weak.role).length > 3 ? 0 : room * 0.2)) continue;
          if (!best || score(p, ask) > score(best.p, best.ask)) best = { p, ask };
        }
        if (best) {
          const wage = Math.round(wageDemand(W, best.p, c.id) * (scared ? 1.15 : 1));
          const from = W.club(best.p.club);
          const fee = Math.round(best.ask * (scared ? 1.15 : 1) * 20) / 20; // у паніці переплачують
          complete(W, state, best.p, c.id, fee, wage, 2 + R.int(3));
          if (scared && c.league === W.club(state.clubId).league) news(state, `Паніка: ${c.name}, що бореться за виживання, переплачує за ${best.p.name} — ${fmtM(fee)}.`, 'transfers');
          else if (best.ask >= 20 || c.league === W.club(state.clubId).league || from.league === W.club(state.clubId).league) {
            news(state, `Трансфер: ${best.p.name} — з ${from.name} до ${c.name} за ${fmtM(best.ask)}.`);
          }
        }
      }
    }
    if (second) return;
    ensureKeepers(W, state, R);
    // вільні агенти: клуби з малим складом підписують будь-коли
    const free = [...W.players.values()].filter((p) => p.free && !p.club && !p.retired);
    for (const c of clubs) {
      if (human(c.id) || c.players.length >= 22 || !free.length) continue;
      const lvl = W.clubLevel(c.id);
      const pick = free.filter((p) => p.ca <= lvl + 5).sort((a, b) => b.ca - a.ca)[0];
      if (!pick) continue;
      complete(W, state, pick, c.id, 0, fairWage(pick.value, c.league), 1 + R.int(2));
      free.splice(free.indexOf(pick), 1);
    }
  }

  // ---------------- Скаутська мережа ----------------
  const SCOUT_NAMES = ['Олег', 'Ігор', 'Сергій', 'Петро', 'Юрій', 'Вадим', 'Роман', 'Степан', 'Карло', 'Ганс', 'Жан', 'Тоні'];
  const SCOUT_LAST = ['Бондар', 'Шевчук', 'Мюллер', 'Россі', 'Дюбуа', 'Гарсія', 'Кравець', 'Сміт', 'Кох', 'Мартен', 'Лопес', 'Ткач'];
  /** Скаути: [{ id, name, level 1–20, region (ліга) | null, prog }]. Перший — безкоштовний, у своїй лізі. */
  function scouts(state) {
    if (!state.scoutStaff) state.scoutStaff = [{ id: 's0', name: 'Олег Бондар', level: 9, region: null, prog: 0 }];
    return state.scoutStaff;
  }
  const scoutWage = (s) => Math.round(s.level * 1.2); // тис. € на тиждень
  function hireScout(state, R) {
    const id = 's' + Date.now().toString(36) + R.int(1000);
    const level = 6 + R.int(12);
    const s = { id, name: `${R.pick(SCOUT_NAMES)} ${R.pick(SCOUT_LAST)}`, level, region: null, prog: 0 };
    scouts(state).push(s);
    return s;
  }
  /** Тиждень скаутів: покриття ліги (потрібно ~150 очок, швидкість — рівень скаута). */
  function scoutsWeek(W, state) {
    state.knownLeagues = state.knownLeagues || {};
    for (const s of scouts(state)) {
      if (!s.region || state.knownLeagues[s.region] || !W.league(s.region)) continue; // світові регіони — окремо (world-scout.js)
      s.prog += s.level;
      if (s.prog >= 150) {
        state.knownLeagues[s.region] = true;
        news(state, `Скаут ${s.name} завершив огляд ліги: ${W.league(s.region).name} — тепер усі гравці відомі точно.`);
        s.region = null; s.prog = 0;
      }
    }
    const me = W.club(state.clubId);
    if (me) me.balance = Math.round((me.balance - scouts(state).slice(1).reduce((x, s) => x + scoutWage(s), 0) / 1000) * 100) / 100;
  }
  /** Точність оцінки (амплітуда похибки рівня): що кращий головний скаут, то менше. */
  const scoutAccuracy = (state) => { const best = Math.max(...scouts(state).map((s) => s.level)); return Math.max(0.35, (22 - best) / 12); };

  /** Клуби ШІ тримають щонайменше двох воротарів: вільний агент або юнак з академії. */
  function ensureKeepers(W, state, R) {
    for (const c of W.clubs.values()) {
      if (FM.duo ? FM.duo.human(state, c.id) : c.id === state.clubId) continue;
      let gk = W.squad(c.id).filter((p) => p.roles[0] === 'GK').length;
      while (gk < 2) {
        const free = [...W.players.values()].filter((p) => p.free && !p.club && !p.retired && p.roles[0] === 'GK').sort((a, b) => b.ca - a.ca)[0];
        if (free) complete(W, state, free, c.id, 0, fairWage(free.value, c.league), 1 + R.int(2));
        else if (FM.dev) { const y = FM.dev.makeYouth(W, c.id, R, state.season.year, 'GK'); y.contract = state.season.year + 3; y.wage = fairWage(y.value, c.league); }
        else break;
        gk++;
      }
    }
  }

  /** Кінець сезону: контракти, що спливають. ШІ продовжує потрібних, решта — вільні агенти. Ваших — лише якщо продовжили. */
  function endSeason(W, state) {
    const S = state.season;
    const out = { expired: [], renewed: 0, returned: returnLoans(W, state) };
    const R = FM.rng(`contracts-${S.seed}`);
    for (const p of [...W.players.values()]) {
      if (!p.club || p.retired || (p.contract || 0) > S.year + 1) continue;
      const mine = p.club === state.clubId;
      const age = W.age(p) ?? 24;
      const keep = !mine && rankInClub(W, p) < 22 && age <= 32 && R.chance(0.8);
      if (keep) { p.contract = S.year + 1 + 1 + R.int(age <= 27 ? 4 : 2); p.wage = Math.round(Math.max(p.wage || 0, fairWage(p.value, W.club(p.club).league))); out.renewed++; continue; }
      out.expired.push(p);
      p.lastClub = p.club;
      W.move(p.id, null);
      p.free = true; delete p.listed;
      if (mine) news(state, `${p.name}: контракт закінчився, гравець пішов вільним агентом.`);
    }
    return out;
  }

  /** Продовжити контракт свого гравця. */
  function renewDemand(W, p) {
    return Math.round(Math.max(p.wage || 0, fairWage(p.value, W.club(p.club).league)) * 1.1 * (FM.agents ? FM.agents.greed(p) : 1));
  }
  function renew(W, state, p, wage, years) {
    const demand = renewDemand(W, p);
    const age = W.age(p) ?? 24;
    if (age >= 31 && years > 2) return { ok: false, demand, reason: 'Гравцеві за 30 — не більше двох років.' };
    if (wage < demand) return { ok: false, demand, reason: `Гравець хоче ${demand} тис. € на тиждень.` };
    p.wage = wage; p.contract = state.season.year + 1 + years;
    return { ok: true, demand };
  }

  FM.market = { windows, valuesWeek, rumoursWeek, WINDOWS, NEWS_CATS, newsCat, unread, rival, agentFee, clauseDiscount, loanable, loanFee, loanIn, loanOffers, returnLoans, scouts, hireScout, scoutWage, scoutAccuracy, ensureKeepers, init, fairWage, wageBill, windowOpen, nextWindow, askingPrice, clubResponse, wageDemand, playerResponse,
    complete, release, releaseCost, weekly, endSeason, renewDemand, renew, rankInClub, news, fmtM, WINDOWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
