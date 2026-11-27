// Поради штабу (як прийнято в жанрі): щотижнева нарада — асистент і тренери пропонують конкретні дії щодо гравців:
// індивідуальне тренування слабкого ключового атрибута, оренда для розвитку, продовження контракту, продаж зайвого,
// більше ігрового часу тому, кому обіцяли статус, пошук гравця на слабку позицію. «Погодитися» виконує дію.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const tick = (S) => S.year * 60 + S.week;
  const COACH = { GK: 'gkCoach', CB: 'coachDef', FB: 'coachDef', DM: 'coachDef', CM: 'coachAtt', AM: 'coachAtt', W: 'coachAtt', ST: 'coachAtt' };
  const NEED = { GK: 2, CB: 4, FB: 4, DM: 2, CM: 3, AM: 2, W: 3, ST: 3 };

  /** 1 гравець, 2 гравці, 5 гравців. */
  const plPlayers = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'гравець' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'гравці' : 'гравців'}`;
  const staffName = (state, role) => (state.staff && state.staff[role] ? state.staff[role].name : 'Асистент');
  const staffLabel = (role) => (FM.club && FM.club.ROLES[role] ? FM.club.ROLES[role].label.toLowerCase() : 'асистент');

  /** Найслабший важливий для позиції атрибут (для індивідуального тренування). */
  function weakKey(p) {
    const prof = (FM.dev && FM.dev.PROFILE[p.roles[0]]) || {};
    const keys = Object.keys(prof).filter((k) => prof[k] >= 1 && p.attrs[k] != null);
    return keys.sort((a, b) => p.attrs[a] - p.attrs[b])[0] || null;
  }

  /** Поради цього тижня (з кешем). name — як показувати ім'я гравця. */
  function advice(W, state, name = (p) => p.name) {
    const S = state.season, now = tick(S);
    if (state.backroom && state.backroom.t === now) return state.backroom.items;
    const dis = (state.brDismiss = Object.fromEntries(Object.entries(state.brDismiss || {}).filter(([, until]) => until > now)));
    const out = [];
    const add = (id, role, text, act) => { if (!dis[id] && !out.some((x) => x.id === id)) out.push({ id, who: staffName(state, role), role: staffLabel(role), text, act }); };
    const sq = W.squad(state.clubId).filter((p) => !(p.loan && p.loan.to !== state.clubId));
    const ranked = [...sq].sort((a, b) => b.ca - a.ca);
    const games = S.fixtures.filter((f) => f.s && f.l && (f.h === state.clubId || f.a === state.clubId)).length;
    const apps = (p) => (S.ps[p.id] || [0])[0];
    const tr = state.training || { individual: {} };
    const own = sq.filter((p) => !p.loan);

    // 1. Індивідуальне тренування молодим із запасом росту
    for (const p of own.filter((x) => (W.age(x) ?? 25) <= 23 && x.pa - x.ca >= 15 && !(tr.individual || {})[x.id]).sort((a, b) => (b.pa - b.ca) - (a.pa - a.ca)).slice(0, 2)) {
      const k = weakKey(p);
      if (k) add(`focus-${p.id}`, COACH[p.roles[0]], `${name(p)} має запас росту. Варто індивідуально тренувати «${FM.ATTRS[k].toLowerCase()}» — для його позиції це важливо, а зараз лише ${p.attrs[k]}.`, { kind: 'focus', pid: p.id, attr: k });
    }
    // 2. Оренда для розвитку
    for (const p of own.filter((x) => (W.age(x) ?? 25) <= 21 && ranked.indexOf(x) >= 16 && !x.injury && !x.loanListed && (games < 6 || apps(x) / games < 0.2)).slice(0, 1)) {
      add(`loan-${p.id}`, 'youth', `${name(p)} майже не грає. Оренда в клуб, де він виходитиме в основі, допоможе розвитку.`, { kind: 'loan', pid: p.id });
    }
    // 3. Контракт закінчується в гравця основи
    for (const p of own.filter((x) => ranked.indexOf(x) < 11 && (x.contract || S.year + 2) - S.year - 1 <= 0 && !x.retired).slice(0, 1)) {
      add(`renew-${p.id}`, 'assistant', `${name(p)}: контракт закінчується цього сезону. Якщо не продовжити — влітку гравець піде безкоштовно.`, { kind: 'renew', pid: p.id });
    }
    // 4. Обіцяний статус, а грає мало
    if (games >= 6 && FM.morale) for (const p of own) {
      const st = FM.morale.status(W, p), want = (FM.morale.EXPECT || {})[st];
      if (want == null || want < 0.5 || apps(p) / games >= want - 0.25) continue;
      add(`status-${p.id}`, 'assistant', `${name(p)} має статус «${FM.morale.STATUS[st].toLowerCase()}», але зіграв лише ${apps(p)} з ${games} матчів. Дайте йому більше часу або перегляньте статус — інакше він засмутиться.`, { kind: 'player', pid: p.id });
      break;
    }
    // 5. Зайвий дорогий ветеран
    for (const p of own.filter((x) => (W.age(x) ?? 25) >= 30 && ranked.indexOf(x) >= 18 && !x.listed && x.wage >= 10).slice(0, 1)) {
      add(`sell-${p.id}`, 'assistant', `${name(p)} уже не потрапляє до складу, а отримує ${p.wage} тис. € на тиждень. Варто виставити його на продаж.`, { kind: 'sell', pid: p.id });
    }
    // 6. Слабка позиція — доручити скауту
    const thin = Object.entries(NEED).map(([r, n]) => [r, own.filter((p) => p.roles[0] === r && !p.injury).length, n]).filter(([, have, n]) => have < n).sort((a, b) => (a[1] - a[2]) - (b[1] - b[2]))[0];
    if (thin) add(`need-${thin[0]}`, 'assistant', `На позиції «${FM.ROLE_NAME[thin[0]].toLowerCase()}» лише ${plPlayers(thin[1])} — замало на сезон. Доручімо скауту знайти підсилення.`, { kind: 'need', role: thin[0] });

    // Слабший асистент дає менше порад
    const lvl = FM.club ? FM.club.lvl(state, 'assistant') : 10;
    const PRI = { renew: 0, player: 1, need: 2, loan: 3, focus: 4, sell: 5 };
    const items = out.sort((a, b) => PRI[a.act.kind] - PRI[b.act.kind]).slice(0, lvl >= 14 ? 5 : lvl >= 8 ? 4 : 3);
    state.backroom = { t: now, items };
    return items;
  }

  /** Погодитися з порадою. Повертає { text, go } (go — куди перейти, якщо дію робить людина). */
  function accept(W, state, id, name = (p) => p.name) {
    const it = (state.backroom && state.backroom.items || []).find((x) => x.id === id);
    if (!it) return null;
    const a = it.act, p = a.pid ? W.player(a.pid) : null;
    state.backroom.items = state.backroom.items.filter((x) => x.id !== id);
    state.brDismiss = { ...(state.brDismiss || {}), [id]: tick(state.season) + 8 };
    if (a.kind === 'focus' && p) { state.training = state.training || { focus: 'balanced', intensity: 'normal', individual: {} }; state.training.individual = state.training.individual || {}; state.training.individual[p.id] = a.attr; return { text: `${name(p)} індивідуально тренує «${FM.ATTRS[a.attr].toLowerCase()}».` }; }
    if (a.kind === 'loan' && p) { p.loanListed = true; return { text: `${name(p)} доступний для оренди — клуби надсилатимуть пропозиції у трансферне вікно.` }; }
    if (a.kind === 'sell' && p) { p.listed = true; return { text: `${name(p)} виставлений на продаж.` }; }
    if (a.kind === 'need') {
      const sc = FM.market.scouts(state).find((s) => !s.region) || FM.market.scouts(state).find((s) => s.region === 'task');
      if (!sc) return { text: 'Усі скаути зайняті. Звільніть когось від завдання або найміть ще одного.', go: 'transfers' };
      sc.region = 'task'; sc.task = { ...FM.scouting.defTask(), pos: a.role, level: 'first' }; sc.seen = []; sc.empty = false;
      return { text: `Скаут ${sc.name} шукає гравця на позицію «${FM.ROLE_NAME[a.role].toLowerCase()}».` };
    }
    if ((a.kind === 'renew' || a.kind === 'player') && p) return { text: '', go: 'player-' + p.id };
    return null;
  }
  /** Відхилити: порада не повторюється 8 тижнів. */
  function dismiss(state, id) {
    if (state.backroom) state.backroom.items = (state.backroom.items || []).filter((x) => x.id !== id);
    state.brDismiss = { ...(state.brDismiss || {}), [id]: tick(state.season) + 8 };
  }

  FM.backroom = { advice, accept, dismiss, weakKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
