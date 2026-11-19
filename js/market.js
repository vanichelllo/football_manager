// Трансфери й контракти: зарплати, бюджети, вікна, ціна продажу, торг із клубом і гравцем,
// пропозиції за ваших гравців, трансфери між клубами ШІ, кінець контрактів.
// Гроші: трансфери й баланс — у млн €, зарплати — у тис. € на тиждень.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const LEAGUE_MONEY = { eng: 3, esp: 2, ita: 1.6, ger: 1.8, fra: 1.4, ukr: 0.9 };
  const WAGE_MULT = { eng: 1.3, esp: 1.1, ita: 1, ger: 1.05, fra: 0.95, ukr: 0.55 };
  const MIN_WAGE = { eng: 8, esp: 4, ita: 3, ger: 4, fra: 3, ukr: 1 };

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
      const rich = Math.exp((W.clubLevel(c.id) - 100) / 25) * LEAGUE_MONEY[c.league];
      c.balance = Math.round(rich * 2.5 * 10) / 10;
    }
  }

  const wageBill = (W, clubId) => W.club(clubId).players.reduce((s, id) => s + (W.player(id).wage || 0), 0);

  // Трансферні вікна: літо — 4 перші тижні сезону, зима — тижні 21–24 (січень)
  const WINDOWS = [[0, 3], [20, 23]];
  const windowOpen = (S) => WINDOWS.some(([a, b]) => S.week >= a && S.week <= b);
  function nextWindow(S) {
    for (const [a] of WINDOWS) if (S.week < a) return a;
    return null; // наступне — влітку, на початку нового сезону
  }

  /** Наскільки гравець важливий для свого клубу: місце за рівнем у складі (0 — найкращий). */
  function rankInClub(W, p) {
    if (!p.club) return 99;
    return W.squad(p.club).sort((a, b) => b.ca - a.ca).findIndex((x) => x.id === p.id);
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
  function clubResponse(W, p, fee, buyerId, S) {
    if (!p.club) return { ok: true, ask: 0 };
    if (p.club === buyerId) return { ok: false, reason: 'Це ваш гравець.' };
    const sq = W.club(p.club).players.length;
    if (sq <= 18) return { ok: false, reason: 'Клуб не продає: у складі замало гравців.' };
    if (p.roles[0] === 'GK' && W.squad(p.club).filter((x) => x.roles[0] === 'GK').length <= 2) return { ok: false, reason: 'Клуб не продає одного з двох воротарів.' };
    if (p.boughtWeek != null && p.boughtSeason === S.year) return { ok: false, reason: 'Гравця щойно купили — клуб не продає його в тому ж сезоні.' };
    const ask = askingPrice(W, p, S);
    if (fee >= ask) return { ok: true, ask };
    if (fee >= ask * 0.75) return { ok: false, counter: ask, ask, reason: `Клуб просить ${fmtM(ask)}.` };
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
    return Math.round(base * k);
  }

  function playerResponse(W, p, buyerId, wage, years) {
    const demand = wageDemand(W, p, buyerId);
    if (demand == null) return { ok: false, reason: 'Гравець не хоче переходити в значно слабший клуб.' };
    const age = W.age(p) ?? 24;
    if (age >= 31 && years > 2) return { ok: false, demand, reason: 'У його віці клуб може запропонувати не більше двох років — або гравець просить коротший контракт.' };
    if (wage >= demand) return { ok: true, demand };
    if (wage >= demand * 0.9) return { ok: false, demand, reason: `Гравець хоче ${demand} тис. € на тиждень.` };
    return { ok: false, demand, reason: `Замало. Гравець розраховує приблизно на ${demand} тис. € на тиждень.` };
  }

  function news(state, text) {
    text = text.replace(/\.\.$/, '.'); // «€550 тис..» → «€550 тис.»
    state.news = (state.news || []).concat([{ s: state.season.year, w: state.season.week, text }]).slice(-60);
  }
  const fmtM = (v) => (v >= 1 ? '€' + (Math.round(v * 10) / 10).toString().replace('.', ',') + ' млн' : '€' + Math.round(v * 1000) + ' тис.');

  /** Завершити трансфер: гроші, контракт, перехід, запис в історію. */
  function complete(W, state, p, buyerId, fee, wage, years) {
    const from = p.club;
    const buyer = W.club(buyerId);
    buyer.balance = Math.round((buyer.balance - fee) * 100) / 100;
    if (from) W.club(from).balance = Math.round((W.club(from).balance + fee) * 100) / 100;
    W.move(p.id, buyerId);
    p.wage = wage;
    p.contract = state.season.year + years;
    p.boughtSeason = state.season.year; p.boughtWeek = state.season.week;
    delete p.listed; delete p.free;
    p.value = FM.marketValue(p.ca, W.age(p) ?? 24, buyer.league, p.pa);
    state.transfers = (state.transfers || []).concat([{ s: state.season.year, w: state.season.week, p: p.id, from: from || null, to: buyerId, fee }]).slice(-300);
    state.offers = (state.offers || []).filter((o) => o.pid !== p.id);
    return true;
  }

  /** Розірвати контракт: половина зарплати, що лишилась. Гравець стає вільним агентом. */
  function releaseCost(p, S) {
    const years = Math.max(0, (p.contract || S.year + 1) - S.year - 1) + (38 - S.week) / 38;
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
  function weekly(W, state) {
    const S = state.season;
    const R = FM.rng(`market-${S.seed}-${S.week}`);
    state.offers = (state.offers || []).filter((o) => S.week - o.w <= 2 && W.player(o.pid) && W.player(o.pid).club === state.clubId);
    // скаутські звіти: те, що замовили минулого тижня, — тепер відомо точно
    state.known = state.known || {};
    for (const id of state.scouting || []) state.known[id] = true;
    state.scouting = [];
    const open = windowOpen(S);
    const clubs = [...W.clubs.values()];

    if (open) {
      // пропозиції за гравців людини
      for (const p of W.squad(state.clubId)) {
        const big = p.value >= 4 && rankInClub(W, p) < 8;
        const chance = p.listed ? 0.45 : big ? 0.05 : 0.01;
        if (!R.chance(chance)) continue;
        const buyers = clubs.filter((c) => c.id !== state.clubId && c.balance > p.value * 0.9 && W.clubLevel(c.id) >= p.ca - 15);
        if (!buyers.length) continue;
        const b = R.pick(buyers);
        const fee = Math.round(p.value * (p.listed ? R.range(0.75, 1.05) : R.range(1.1, 1.45)) * 20) / 20;
        if (state.offers.some((o) => o.pid === p.id && o.from === b.id)) continue;
        state.offers.push({ id: `${S.year}-${S.week}-${p.id}-${b.id}`, pid: p.id, from: b.id, fee, w: S.week });
        news(state, `${b.name} пропонує ${fmtM(fee)} за гравця ${p.name}.`);
      }
      // клуби ШІ латають слабкі позиції
      for (const c of clubs) {
        if (c.id === state.clubId || !R.chance(0.12) || c.balance < 0.5) continue;
        const weak = weakestRole(W, c.id);
        if (!weak) continue;
        const lvl = W.clubLevel(c.id);
        const cands = [...W.players.values()].filter((p) => p.club && p.club !== c.id && p.club !== state.clubId && !p.retired
          && p.roles[0] === weak.role && p.ca > weak.v + 4 && p.ca <= lvl + 12 && (W.age(p) ?? 24) <= 31);
        let best = null;
        for (const p of cands) {
          const ask = askingPrice(W, p, S);
          if (ask > c.balance * 0.7 || clubResponse(W, p, ask, c.id, S).ok !== true) continue;
          if (wageDemand(W, p, c.id) == null) continue;
          if (!best || p.ca - ask * 0.5 > best.p.ca - best.ask * 0.5) best = { p, ask };
        }
        if (best) {
          const wage = wageDemand(W, best.p, c.id);
          const from = W.club(best.p.club);
          complete(W, state, best.p, c.id, best.ask, wage, 2 + R.int(3));
          if (best.ask >= 20 || c.league === W.club(state.clubId).league || from.league === W.club(state.clubId).league) {
            news(state, `Трансфер: ${best.p.name} — з ${from.name} до ${c.name} за ${fmtM(best.ask)}.`);
          }
        }
      }
    }
    ensureKeepers(W, state, R);
    // вільні агенти: клуби з малим складом підписують будь-коли
    const free = [...W.players.values()].filter((p) => p.free && !p.club && !p.retired);
    for (const c of clubs) {
      if (c.id === state.clubId || c.players.length >= 22 || !free.length) continue;
      const lvl = W.clubLevel(c.id);
      const pick = free.filter((p) => p.ca <= lvl + 5).sort((a, b) => b.ca - a.ca)[0];
      if (!pick) continue;
      complete(W, state, pick, c.id, 0, fairWage(pick.value, c.league), 1 + R.int(2));
      free.splice(free.indexOf(pick), 1);
    }
  }

  /** Клуби ШІ тримають щонайменше двох воротарів: вільний агент або юнак з академії. */
  function ensureKeepers(W, state, R) {
    for (const c of W.clubs.values()) {
      if (c.id === state.clubId) continue;
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
    const out = { expired: [], renewed: 0 };
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
    return Math.round(Math.max(p.wage || 0, fairWage(p.value, W.club(p.club).league)) * 1.1);
  }
  function renew(W, state, p, wage, years) {
    const demand = renewDemand(W, p);
    const age = W.age(p) ?? 24;
    if (age >= 31 && years > 2) return { ok: false, demand, reason: 'Гравцеві за 30 — не більше двох років.' };
    if (wage < demand) return { ok: false, demand, reason: `Гравець хоче ${demand} тис. € на тиждень.` };
    p.wage = wage; p.contract = state.season.year + 1 + years;
    return { ok: true, demand };
  }

  FM.market = { ensureKeepers, init, fairWage, wageBill, windowOpen, nextWindow, askingPrice, clubResponse, wageDemand, playerResponse,
    complete, release, releaseCost, weekly, endSeason, renewDemand, renew, rankInClub, news, fmtM, WINDOWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
