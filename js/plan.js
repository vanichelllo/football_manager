// План «Перші кроки в клубі» (як у FM перед сезоном): асистент оцінює склад і веде тренера по кроках —
// правління, тактика, тренування, скаути, слабкі позиції, зайві гравці, контракти, штаб, товариський матч.
// Кроки позначаються виконаними самі, за станом гри; будь-який можна пропустити.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const ROLE_UK = { GK: 'воротар', CB: 'центральний захисник', FB: 'крайній захисник', DM: 'опорний півзахисник', CM: 'центральний півзахисник', AM: 'атакувальний півзахисник', W: 'вінгер', ST: 'нападник' };
  const ROLE_PL = { GK: 'воротарі', CB: 'центральні захисники', FB: 'крайні захисники', DM: 'опорні півзахисники', CM: 'центральні півзахисники', AM: 'атакувальні півзахисники', W: 'вінгери', ST: 'нападники' };
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

  /**
   * Звіт асистента про склад: слабкі позиції (замало гравців або слабкі гравці основи),
   * зайві гравці, контракти лідерів, що закінчуються. formation — схема, під яку оцінювати (типово — найкраща).
   */
  function report(W, clubId, year, formation) {
    const sq = W.squad(clubId);
    const best = FM.bestFormation(sq);
    const f = formation && FM.FORMATIONS[formation] ? formation : best;
    const lu = FM.pickLineup(sq, f);
    const xiIds = new Set(lu.xi.map((x) => x.player.id));
    const xiAvg = avg(lu.xi.map((x) => x.player.ca));
    const cnt = {};
    for (const s of FM.FORMATIONS[f]) cnt[s.role] = (cnt[s.role] || 0) + 1;

    const needs = [];
    for (const role of Object.keys(cnt)) {
      const can = sq.filter((p) => !p.injury || p.injury < 8).filter((p) => FM.fit(p, { role }) >= 0.94);
      const need = role === 'GK' ? 2 : cnt[role] + Math.max(1, Math.ceil(cnt[role] / 2));
      const starters = lu.xi.filter((x) => x.slot.role === role);
      const sCa = avg(starters.map((x) => x.player.ca * FM.fit(x.player, x.slot)));
      const weak = sCa < xiAvg * 0.9;
      const thin = can.length < need;
      if (weak || thin) needs.push({ role, label: ROLE_UK[role], plural: ROLE_PL[role], have: can.length, need, starterCa: Math.round(sCa), weak, thin, sev: (weak ? 2 : 0) + (thin ? 1 : 0) + (role === 'GK' && thin ? 2 : 0) });
    }
    needs.sort((a, b) => b.sev - a.sev || a.have - b.have);

    const thinRoles = new Set(needs.filter((n) => n.thin).map((n) => n.role));
    const rank = new Map([...sq].sort((a, b) => b.ca - a.ca).map((p, i) => [p.id, i]));
    const talent = (p) => (W.age(p) ?? 25) <= 21 && p.pa - p.ca >= 15;
    // кандидати: не в основі, не серед 18 найсильніших, не талант, не на позиції, де й так бракує людей
    const cands = sq.filter((p) => !xiIds.has(p.id) && rank.get(p.id) >= 18 && !talent(p) && !p.loan && !thinRoles.has(p.roles[0])).sort((a, b) => a.ca - b.ca);
    const out = new Set(cands.filter((p) => p.ca < xiAvg * 0.78 && (W.age(p) ?? 25) > 21).map((p) => p.id));
    for (const p of cands) if (sq.length - out.size > 26) out.add(p.id); // склад більший за 26 — найслабші зайві
    const gks = sq.filter((p) => p.roles[0] === 'GK' && !out.has(p.id)).sort((a, b) => b.ca - a.ca);
    for (const p of gks.slice(3)) if (!talent(p)) out.add(p.id); // четвертий воротар не потрібен
    const surplus = sq.filter((p) => out.has(p.id)).sort((a, b) => a.ca - b.ca);
    const expiring = sq.filter((p) => (p.contract || 9999) <= year + 1 && rank.get(p.id) < 14 && !p.loan);
    return { formation: f, best, xiAvg: Math.round(xiAvg), size: sq.length, needs: needs.slice(0, 4), surplus, expiring };
  }

  const STEPS = {
    board: { title: 'Дізнайтеся очікування правління', hint: 'Ціль на сезон, бюджет і спонсор. Від цілі залежить, наскільки терпляче правління.' },
    squad: { title: 'Прочитайте звіт асистента про склад', hint: 'Де бракує гравців, хто слабкий в основі, кого варто продати.' },
    tactics: { title: 'Оберіть тактику під склад', hint: 'Схема, у якій найкращі гравці грають на своїх позиціях. Нову схему команда засвоює кілька тижнів.' },
    training: { title: 'Налаштуйте тренування', hint: 'Перед сезоном — підготовка до матчу (звикання до схеми) або розвиток молоді.' },
    scouts: { title: 'Дайте скаутам завдання', hint: 'Скаут, закріплений за лігою, розвідує всіх її гравців; у світі шукає таланти.' },
    needs: { title: 'Закрийте слабкі позиції', hint: 'Знайдіть гравців на позиції зі звіту й додайте до шортлиста або купіть.' },
    surplus: { title: 'Позбудьтеся зайвих гравців', hint: 'Слабкі запасні беруть зарплату й не грають. Виставте їх на продаж або в оренду.' },
    contracts: { title: 'Продовжіть контракти лідерів', hint: 'Гравець з контрактом, що спливає, може піти безкоштовно.' },
    staff: { title: 'Перевірте тренерський штаб', hint: 'Асистент, тренери, фізіо: від них залежать розвиток гравців і травми.' },
    friendly: { title: 'Зіграйте товариський матч', hint: 'Перевірте тактику в грі, перш ніж почнеться ліга.' },
  };
  const FIRST = ['board', 'squad', 'tactics', 'training', 'scouts', 'needs', 'surplus', 'contracts', 'staff', 'friendly'];
  const PRESEASON = ['squad', 'needs', 'surplus', 'contracts', 'tactics', 'training', 'friendly'];

  /** Новий план: first — початок кар'єри чи новий клуб, інакше — передсезонна підготовка. */
  function create(W, state, first) {
    const S = state.season;
    const r = report(W, state.clubId, S.year, state.tactics && state.tactics.formation);
    state.plan = { club: state.clubId, year: S.year, first: !!first, steps: first ? FIRST.slice() : PRESEASON.slice(), visits: {}, done: {}, skip: {},
      needRoles: r.needs.map((n) => n.role), surplusIds: r.surplus.map((p) => p.id), expIds: r.expiring.map((p) => p.id),
      fr0: (state.friendlies || []).length, sl0: (state.shortlist || []).length };
    return state.plan;
  }

  /** Поточний план (створює передсезонний на початку нового сезону). null — плану на цей сезон немає. */
  function current(W, state) {
    const S = state.season;
    let pl = state.plan;
    if (pl && pl.club !== state.clubId) pl = create(W, state, true); // новий клуб — план з нуля
    else if (!pl && S.week > 3) { state.plan = { club: state.clubId, year: S.year, none: true }; return null; } // давнє збереження посеред сезону
    else if (!pl) pl = create(W, state, true);
    else if (pl.year !== S.year && S.week <= 3) pl = create(W, state, false);
    if (pl.none || pl.year !== S.year) return null;
    return pl;
  }

  /** Чи виконано крок — за станом гри. */
  function isDone(W, state, pl, id) {
    if (pl.done[id]) return true;
    const S = state.season, mine = (p) => p && p.club === state.clubId;
    switch (id) {
      case 'board': return !!pl.visits.board;
      case 'squad': return !!pl.visits.squad;
      case 'tactics': return !!pl.visits.tactics;
      case 'training': return !!pl.visits.training;
      case 'staff': return !!pl.visits.office;
      case 'scouts': return FM.market.scouts(state).some((s) => s.region);
      case 'friendly': return (state.friendlies || []).length > pl.fr0;
      case 'needs': return pl.needRoles.every((role) => {
        const fits = (p) => p && FM.fit(p, { role }) >= 0.94;
        const bought = (state.transfers || []).some((t) => t.to === state.clubId && t.s === S.year && fits(W.player(t.p)));
        const listed = (state.shortlist || []).some((id2) => { const p = W.player(id2); return fits(p) && !mine(p); });
        return bought || listed;
      });
      case 'surplus': return pl.surplusIds.every((pid) => { const p = W.player(pid); return !mine(p) || p.listed || p.loan || (state.u21 || []).includes(pid); });
      case 'contracts': return pl.expIds.every((pid) => { const p = W.player(pid); return !mine(p) || (p.contract || 9999) > S.year + 1; });
      default: return false;
    }
  }

  /** Кроки з позначками: [{ id, title, hint, done, skipped }]. */
  function steps(W, state, pl) {
    return pl.steps.map((id) => {
      const done = isDone(W, state, pl, id);
      if (done) pl.done[id] = true; // виконаний крок лишається виконаним
      return { id, ...STEPS[id], done, skipped: !done && !!pl.skip[id] };
    });
  }
  function progress(W, state, pl) {
    const st = steps(W, state, pl);
    const closed = st.filter((s) => s.done || s.skipped).length;
    return { total: st.length, done: st.filter((s) => s.done).length, closed, next: st.find((s) => !s.done && !s.skipped) || null, all: closed === st.length };
  }
  /** Відвідування екрана — для кроків «подивитися». */
  function visit(state, screen) {
    const pl = state.plan;
    if (!pl || pl.none || pl.visits[screen]) return false;
    if (!['board', 'squad', 'tactics', 'training', 'office'].includes(screen)) return false;
    pl.visits[screen] = 1;
    return true;
  }

  /** Порада щодо тренування перед сезоном. */
  function trainingAdvice(W, state, familiarity) {
    const sq = W.squad(state.clubId);
    const f = state.tactics && state.tactics.formation;
    if (f && (familiarity[f] || 0) < 70) return { plan: 'prep', why: `команда ще погано знає схему ${f}` };
    const young = sq.filter((p) => (W.age(p) ?? 25) <= 21 && p.pa - p.ca >= 20).length;
    if (young >= 5) return { plan: 'development', why: `у складі ${young} талановитих молодих гравців` };
    return { plan: 'prep', why: 'перед стартом сезону варто відпрацювати тактику' };
  }

  /** Ліга для скаута: найближча за силою до вашої, ще не розвідана. */
  function scoutLeague(W, state) {
    const mine = W.club(state.clubId).league;
    const lvl = (l) => avg(W.clubsOf(l).map((c) => W.clubLevel(c.id)));
    const my = lvl(mine);
    const busy = new Set(FM.market.scouts(state).map((s) => s.region));
    const cands = W.db.leagues.filter((l) => l.id !== mine && !(state.knownLeagues || {})[l.id] && !busy.has(l.id));
    cands.sort((a, b) => Math.abs(lvl(a.id) - my) - Math.abs(lvl(b.id) - my));
    return cands[0] ? cands[0].id : null;
  }

  FM.plan = { ROLE_UK, STEPS, FIRST, PRESEASON, report, create, current, isDone, steps, progress, visit, trainingAdvice, scoutLeague };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
