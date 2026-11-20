// Щоденна рутина (як у FM): розклад тренувань по днях, наставництво, доручення асистентові.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  // Заняття дня: rec — відновлення свіжості, growth — розвиток, fam — засвоєння схеми, inj — ризик травм.
  // «Звичайний тиждень» (відновлення, техніка, тактика, фізпідготовка, підготовка) дорівнює старому «Збалансованому» плану.
  const SESSIONS = {
    recovery: { label: 'Відновлення', short: 'Відн.', rec: 7, growth: 0.1, fam: 0.3, inj: 0.1, hint: 'Після матчу: свіжість відновлюється швидше.' },
    technical: { label: 'Техніка', short: 'Тех.', rec: 3, growth: 0.24, fam: 0.2, inj: 0.18, hint: 'Розвиток атрибутів, помірне навантаження.' },
    tactics: { label: 'Тактика', short: 'Такт.', rec: 4, growth: 0.15, fam: 1, inj: 0.12, hint: 'Команда засвоює схему.' },
    fitness: { label: 'Фізпідготовка', short: 'Фіз.', rec: 1, growth: 0.26, fam: 0, inj: 0.32, hint: 'Найбільше росте, але втомлює й травмує.' },
    prep: { label: 'Підготовка до матчу', short: 'Підг.', rec: 4, growth: 0.08, fam: 0.6, inj: 0.1, boost: 0.012, hint: 'Напередодні матчу: розбір суперника й стандартів (+1% до гри).' },
    rest: { label: 'Вихідний', short: 'Вих.', rec: 9, growth: 0, fam: 0, inj: 0, morale: 0.4, hint: 'Відпочинок: свіжість і настрій.' },
  };
  const DAYS = [1, 2, 3, 4, 5];
  // Шаблони тижня (пн–пт) для тренера, що складає розклад сам (назви — як у старих планах тренувань)
  const TEMPLATES = {
    balanced: ['recovery', 'technical', 'tactics', 'fitness', 'prep'],
    prep: ['recovery', 'tactics', 'technical', 'tactics', 'prep'],
    recovery: ['rest', 'recovery', 'technical', 'tactics', 'prep'],
    development: ['technical', 'fitness', 'technical', 'fitness', 'prep'],
  }; // пн–пт; субота — день туру, неділя — вихідний
  const DAY_UK = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  /** Розклад, який склав би асистент: напередодні матчу — підготовка, після — відновлення. matchDays — дні матчів цього тижня. */
  function auto(matchDays, kind, tpl) {
    const md = new Set(matchDays);
    const out = {};
    const cycle = tpl ? TEMPLATES[tpl] || TEMPLATES.balanced : kind === 'preseason' ? ['fitness', 'tactics', 'fitness', 'technical', 'tactics'] : kind === 'free' ? ['technical', 'fitness', 'tactics', 'technical', 'rest'] : ['recovery', 'technical', 'tactics', 'fitness', 'prep'];
    for (const d of DAYS) {
      if (md.has(d)) out[d] = 'match';
      else if (md.has(d + 1) || (d === 5 && md.has(6))) out[d] = 'prep';
      else if (md.has(d - 1) || (d === 1 && !tpl && kind !== 'preseason' && kind !== 'free')) out[d] = 'recovery';
      else out[d] = cycle[d - 1];
    }
    // два матчі за тиждень — без важкої фізпідготовки
    if (matchDays.length >= 2) for (const d of DAYS) if (out[d] === 'fitness') out[d] = 'technical';
    return out;
  }

  /** Тижневий підсумок розкладу — у тому ж вигляді, що й плани тренувань (recovery, growth, fam, injury). */
  function aggregate(days) {
    let rec = 3, growth = 0.17, fam = 0, inj = 0.18, morale = 0;
    for (const d of DAYS) {
      const s = SESSIONS[days[d]];
      if (!s) continue; // день матчу
      rec += s.rec; growth += s.growth; fam += s.fam; inj += s.inj; morale += s.morale || 0;
    }
    return { recovery: rec, growth: Math.round(growth * 100) / 100, fam: Math.round(fam * 10) / 10, injury: Math.round(inj * 100) / 100, morale };
  }
  /** Множник гри в матчі дня matchDay: підготовка напередодні. */
  function prepBoost(days, matchDay) {
    const s = days && SESSIONS[days[matchDay - 1]];
    return s && s.boost ? 1 + s.boost : 1;
  }

  // ---------------- Наставництво ----------------
  const canMentor = (W, p) => (W.age(p) ?? 25) >= 26 && (((p.h && p.h.pro) || 11) >= 12 || (p.attrs.lea || 10) >= 13);
  const canLearn = (W, p) => (W.age(p) ?? 25) <= 21;
  const MAX_PER_MENTOR = 2;
  /** Пари «учень → наставник» вашого клубу (вибулих прибирає). */
  function pairs(W, state) {
    const m = (state.mentor = state.mentor || {});
    for (const [y, o] of Object.entries(m)) {
      const a = W.player(y), b = W.player(o);
      if (!a || !b || a.club !== state.clubId || b.club !== state.clubId || !canLearn(W, a)) delete m[y];
    }
    return Object.entries(m).map(([y, o]) => ({ young: W.player(y), mentor: W.player(o) }));
  }
  function assign(W, state, youngId, mentorId) {
    const y = W.player(youngId), o = W.player(mentorId);
    if (!y || !o || !canLearn(W, y) || !canMentor(W, o)) return { ok: false, reason: 'Не підходить: учень — до 21 року, наставник — від 26 і професіонал або лідер.' };
    pairs(W, state);
    if (Object.values(state.mentor).filter((x) => x === mentorId).length >= MAX_PER_MENTOR && state.mentor[youngId] !== mentorId) return { ok: false, reason: `У наставника вже ${MAX_PER_MENTOR} учні.` };
    state.mentor[youngId] = mentorId;
    return { ok: true };
  }
  /** Поради: найкращі наставники для молодих без наставника. */
  function suggest(W, state) {
    const sq = W.squad(state.clubId);
    const used = {};
    for (const o of Object.values(pairs(W, state).reduce((a, x) => (a[x.young.id] = x.mentor.id, a), {}))) used[o] = (used[o] || 0) + 1;
    const mentors = sq.filter((p) => canMentor(W, p)).sort((a, b) => ((b.h && b.h.pro) || 11) + (b.attrs.lea || 10) - ((a.h && a.h.pro) || 11) - (a.attrs.lea || 10));
    const out = [];
    for (const y of sq.filter((p) => canLearn(W, p) && !(state.mentor || {})[p.id]).sort((a, b) => b.pa - a.pa)) {
      const same = mentors.filter((o) => (used[o.id] || 0) < MAX_PER_MENTOR).sort((a, b) => (FM.ROLE_LINE[b.roles[0]] === FM.ROLE_LINE[y.roles[0]]) - (FM.ROLE_LINE[a.roles[0]] === FM.ROLE_LINE[y.roles[0]]))[0];
      if (!same) break;
      used[same.id] = (used[same.id] || 0) + 1;
      out.push({ young: y, mentor: same });
    }
    return out;
  }
  /** Тиждень наставництва: учень переймає характер (професіоналізм, стабільність, великі матчі) і росте швидше. */
  function mentorWeek(W, state) {
    const news = [];
    for (const { young: y, mentor: o } of pairs(W, state)) {
      y.h = y.h || {}; o.h = o.h || {};
      for (const k of ['pro', 'con', 'big']) {
        const a = y.h[k] || 10, b = o.h[k] || 10;
        if (b <= a) continue;
        const nv = Math.round((a + (b - a) * 0.025) * 1000) / 1000;
        if (Math.floor(nv) > Math.floor(a)) news.push(`${y.name} переймає ${({ pro: 'професіоналізм', con: 'стабільність', big: 'характер у великих матчах' })[k]} у наставника ${o.name}.`);
        y.h[k] = nv;
      }
      y.morale = Math.min(100, (y.morale ?? 60) + 0.3);
    }
    return news;
  }
  const growthMult = (state, p) => ((state.mentor || {})[p.id] ? 1.08 : 1);

  // ---------------- Доручення асистентові ----------------
  const DELEGATE = {
    training: { label: 'Розклад тренувань', hint: 'Асистент щотижня складає розклад під матчі тижня.', def: true },
    press: { label: 'Прес-конференції', hint: 'Асистент відповідає журналістам стримано.', def: false },
    friendlies: { label: 'Передсезонні товариські', hint: 'Асистент грає їх сам, «Продовжити» не зупиняється.', def: false },
    youth: { label: 'Контракти молоді', hint: 'Асистент продовжує контракти гравців до 21 року, що спливають, на вимогу гравця.', def: false },
    lowOffers: { label: 'Дешеві пропозиції', hint: 'Асистент відхиляє пропозиції за ваших гравців, нижчі за 85% ціни.', def: false },
  };
  const delegated = (state, k) => { const d = state.deleg || {}; return k in d ? !!d[k] : DELEGATE[k].def; };
  /** Тижневі доручення: контракти молоді, дешеві пропозиції. Повертає новини. */
  function delegateWeek(W, state) {
    const S = state.season, news = [];
    if (delegated(state, 'youth')) for (const p of W.squad(state.clubId)) {
      if ((W.age(p) ?? 25) > 21 || p.loan || (p.contract || 9999) > S.year + 1) continue;
      const demand = FM.market.renewDemand(W, p);
      if (FM.market.renew(W, state, p, demand, 3).ok) news.push(`Асистент продовжив контракт ${p.name} до ${p.contract} (${demand} тис. €/тиж.).`);
    }
    if (delegated(state, 'lowOffers')) {
      const low = (state.offers || []).filter((o) => { const p = W.player(o.pid); return p && o.fee < p.value * 0.85; });
      if (low.length) {
        state.offers = state.offers.filter((o) => !low.includes(o));
        news.push(`Асистент відхилив ${low.length === 1 ? 'дешеву пропозицію' : `дешеві пропозиції (${low.length})`} за ваших гравців.`);
      }
    }
    return news;
  }

  FM.routine = { TEMPLATES, SESSIONS, DAYS, DAY_UK, auto, aggregate, prepBoost, canMentor, canLearn, pairs, assign, suggest, mentorWeek, growthMult, MAX_PER_MENTOR, DELEGATE, delegated, delegateWeek };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
