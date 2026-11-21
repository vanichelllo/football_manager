// Історії клубу: не випадкові, а наслідки того, що відбувається. Гравець не забиває — про це пишуть, він нервує;
// юнак видав серію добрих матчів — прорив і інтерес великих клубів; сидить на лаві — приходить поговорити;
// команда на хвилі або в кризі — роздягальня реагує, капітан бере слово. Частина історій — листи з вибором.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const clamp = (x) => Math.max(0, Math.min(100, x));
  const mor = (p, d) => { if (p) p.morale = clamp((p.morale ?? 60) + d); };
  const r2 = (x) => Math.round(x * 100) / 100;
  const avg = (a) => (a && a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

  /** Останні результати клубу в лізі: масив 'w' | 'd' | 'l' (найновіший — останній). */
  function results(S, clubId) {
    return S.fixtures.filter((f) => f.s && (f.h === clubId || f.a === clubId)).sort((a, b) => a.w - b.w || (a.mid ? -1 : 1)).map((f) => {
      const d = f.h === clubId ? f.s[0] - f.s[1] : f.s[1] - f.s[0];
      return d > 0 ? 'w' : d < 0 ? 'l' : 'd';
    });
  }
  const streak = (res, kind) => { let n = 0; for (let i = res.length - 1; i >= 0 && res[i] === kind; i--) n++; return n; };
  const noLoss = (res) => { let n = 0; for (let i = res.length - 1; i >= 0 && res[i] !== 'l'; i--) n++; return n; };

  // Листи з вибором: реєструються в js/events.js (вага 0 — випадково не випадають), відповідь — FM.events.answer
  const CHOICES = [
    { id: 'st_drought', story: true, w: 0, opts: [
      ['Публічно підтримати', 'Скажете пресі, що вірите в нього. Він відчує довіру.', (c) => { mor(c.p, 7); return `${c.n(c.p)} вдячний за підтримку: «Голи прийдуть».`; }],
      ['Дати відпочити на лаві', 'Хай подивиться збоку й перезавантажиться.', (c) => { mor(c.p, -4); if (FM.medical) FM.medical.rest(c.state, c.p.id); return `${c.n(c.p)} пропустить наступний матч. Він не в захваті, але розуміє.`; }],
      ['Додаткові тренування з ударів', 'Індивідуальна робота з тренером нападників.', (c) => { mor(c.p, 2); if (c.p.attrs.fin != null && c.R.chance(0.4)) c.p.attrs.fin = Math.min(20, c.p.attrs.fin + 1); return `${c.n(c.p)} лишається після тренувань і б’є по воротах до темряви.`; }]] },
    { id: 'st_minutes', story: true, w: 0, opts: [
      ['Пообіцяти більше ігрового часу', 'Він чекатиме виходів найближчими тижнями.', (c) => { mor(c.p, 9); c.p.minPromise = { y: c.state.season.year, w: c.state.season.week + 6, apps: ((c.state.season.ps[c.p.id] || [])[0] || 0) + 3 }; return `${c.n(c.p)} задоволений розмовою. Обіцянка: щонайменше 3 матчі за 6 тижнів.`; }],
      ['Боротися за місце', 'Чесно: основу треба заслужити.', (c) => { if (c.p.h && c.p.h.pro >= 13) { mor(c.p, 2); return `${c.n(c.p)}: «Зрозумів, доведу на тренуваннях».`; } mor(c.p, -6); return `${c.n(c.p)} вийшов з кабінету похмурий.`; }],
      ['Запропонувати оренду', 'Він виставлений на оренду, щоб грати регулярно.', (c) => { c.p.listed = true; mor(c.p, 3); return `${c.n(c.p)} виставлений на трансфер: він хоче регулярної практики.`; }]] },
    { id: 'st_retire', story: true, w: 0, opts: [
      ['Умовити зіграти ще сезон', 'Досвід у роздягальні безцінний.', (c) => { mor(c.p, 5); c.p.stayOn = c.state.season.year; return `${c.n(c.p)} погодився: «Ще один сезон — заради цієї команди».`; }],
      ['Запропонувати місце в тренерському штабі', 'Після кар’єри — тренер молоді.', (c) => { mor(c.p, 8); c.p.futureCoach = true; return `${c.n(c.p)} зворушений: після завершення кар’єри він працюватиме в клубі.`; }],
      ['Залишити рішення йому', 'Без тиску.', (c) => { mor(c.p, 1); return `${c.n(c.p)} візьме паузу, щоб подумати.`; }]] },
    { id: 'st_home', story: true, w: 0, opts: [
      ['Допомогти перевезти родину', 'Клуб оплатить переїзд.', (c) => { mor(c.p, 12); const cl = c.W.club(c.state.clubId); cl.balance = r2(cl.balance - Math.max(0.02, (cl.income0 || 0.05) * 0.3)); return `Родина ${c.g(c.p)} переїхала. Він нарешті посміхається на тренуваннях.`; }],
      ['Призначити наставника', 'Досвідчений партнер допоможе адаптуватися.', (c) => { mor(c.p, 6); return `Ветерани взяли ${c.g(c.p)} під опіку — показують місто, кличуть на вечері.`; }],
      ['Сам звикне', 'Час лікує.', (c) => { mor(c.p, -4); return `${c.n(c.p)} усе ще сумує за домом.`; }]] },
    { id: 'st_crisis', story: true, w: 0, opts: [
      ['Чесна розмова з командою', 'Збори без тренерського штабу: кожен каже, що думає.', (c) => { if (c.R.chance(0.65)) { for (const x of c.sq) mor(x, 4); return 'Розмова вийшла важкою, але корисною — команда згуртувалася.'; } for (const x of c.sq) mor(x, -2); return 'Розмова переросла в сварку. Атмосфера погіршилась.'; }],
      ['Закриті тренування й дисципліна', 'Більше роботи, менше слів.', (c) => { for (const x of c.sq) mor(x, -1); c.state.crisisBoost = { y: c.state.season.year, w: c.state.season.week, k: 1.02 }; return 'Тиждень важкої роботи: гравці втомлені, але зібрані.'; }],
      ['Публічно розкритикувати гравців', 'Правлінню сподобається, роздягальні — ні.', (c) => { for (const x of c.sq) mor(x, -4); if (c.state.board) c.state.board.conf = Math.min(100, c.state.board.conf + 3); return 'Ваші слова на першплані всіх газет. Гравці ображені.'; }]] },
  ];
  if (FM.events) for (const c of CHOICES) if (!FM.events.EVENTS.some((e) => e.id === c.id)) FM.events.EVENTS.push(c);
  const raise = (state, id, ask, p) => { state.evPending = { id, ask, ids: { p: p ? p.id : null }, opts: CHOICES.find((c) => c.id === id).opts.map(([l, h]) => [l, h]) }; };

  /**
   * Історії тижня (після матчів). Повертає новини [{ text, cat }]; лист з вибором кладе в state.evPending (якщо пошта вільна).
   * name(p) — ім'я, gen(p) — родовий відмінок або null.
   */
  function week(W, state, name = (p) => p.name, gen = null) {
    const S = state.season, out = [], g = (p) => (gen && gen(p)) || name(p);
    const R = FM.rng(`story-${S.seed}-${S.year}-${S.week}-${state.clubId}`);
    const seen = (state.stories = state.stories || {});
    const now = S.year * 100 + S.week;
    const fresh = (key, gap) => { if (seen[key] && now - seen[key] < gap) return false; seen[key] = now; return true; };
    const sq = W.squad(state.clubId).filter((p) => !p.loan);
    const ranked = [...sq].sort((a, b) => b.ca - a.ca);
    const myGames = S.fixtures.filter((f) => f.s && (f.h === state.clubId || f.a === state.clubId)).length;
    const res = results(S, state.clubId);
    let letter = !!state.evPending;
    const ask = (id, text, p) => { if (letter) return false; letter = true; raise(state, id, text, p); out.push({ text: '✉ ' + text + ' Рішення — у листі з дією.', cat: 'players' }); return true; };

    // ---- команда: хвиля, криза, капітан ----
    const ws = streak(res, 'w'), ls = streak(res, 'l'), nl = noLoss(res);
    if (ws >= 4 && fresh('wave-' + ws, 3)) {
      for (const p of sq) mor(p, 2);
      out.push({ text: R.pick([`Команда на хвилі: ${ws} перемог поспіль! У роздягальні сміються й жартують, на тренуваннях — вогонь.`, `${ws} перемог поспіль. Газети пишуть про «нову силу ліги», вболівальники мріють.`]), cat: 'club' });
      if (FM.club) { const f = FM.club.fans(W, state.clubId); f.mood = clamp(f.mood + 3); }
    } else if (nl >= 8 && fresh('unbeaten-' + nl, 4)) out.push({ text: `Без поразок уже ${nl} матчів. Суперники виходять проти вас обережніше.`, cat: 'club' });
    if (ls >= 3 && fresh('crisis', 6)) {
      const cap = ranked.find((p) => (p.attrs.lea || 0) >= 14 && (p.morale ?? 60) >= 50);
      if (cap && R.chance(0.5)) { for (const p of sq) mor(p, 2); out.push({ text: `${name(cap)} зібрав команду після ${ls} поразок поспіль: «Ми все виправимо — разом». Роздягальня прислухалась до лідера.`, cat: 'players' }); }
      else ask('st_crisis', `Криза: ${ls} поразки поспіль. Гравці опустили голови, преса вимагає відповідей. Як діяти?`, null);
    }
    // ---- гравці ----
    for (const p of R.pick ? sq.slice().sort(() => R.next() - 0.5) : sq) {
      const age = W.age(p) ?? 25, fg = p.fg || [], role = p.roles[0], st = S.ps[p.id] || [0, 0];
      // серія голів
      if (fg.length >= 3 && fg.slice(-3).every((x) => x > 0) && fresh('hot-' + p.id, 6)) {
        mor(p, 3);
        const n = fg.slice().reverse().findIndex((x) => !x); const run = n < 0 ? fg.length : n;
        out.push({ text: R.pick([`${name(p)} у вогні: забиває ${run} матчі поспіль.`, `${run} матчі поспіль з голом — ${name(p)} не зупинити. Скаути інших клубів уже в блокнотах.`]), cat: 'players' });
        continue;
      }
      // посуха
      if (['ST', 'W', 'AM'].includes(role) && fg.length >= 5 && fg.slice(-5).every((x) => !x) && ranked.indexOf(p) < 14 && fresh('dry-' + p.id, 10)) {
        mor(p, -3);
        if (!ask('st_drought', `${name(p)} не забиває вже 5 матчів. Він нервує, журналісти пишуть про «кризу нападника». Що робити?`, p)) out.push({ text: `${name(p)} не забиває 5 матчів поспіль. Преса питає, чи не час щось змінити.`, cat: 'players' });
        continue;
      }
      // прорив молодого
      if (age <= 21 && p.form && p.form.length >= 3 && avg(p.form) >= 7.1 && fresh('brk-' + p.id, 40)) {
        mor(p, 5);
        p.value = r2(p.value * 1.12);
        const big = [...W.clubs.values()].filter((c) => c.id !== state.clubId && W.clubLevel(c.id) > W.clubLevel(state.clubId) + 8 && c.balance > p.value * 2);
        const fan = big.length ? R.pick(big) : null;
        if (fan) p.interest = { club: fan.id, until: S.year * 100 + S.week + 10 };
        out.push({ text: `Прорив: ${age}-річний ${name(p)} видав серію сильних матчів (середня оцінка ${avg(p.form).toFixed(1).replace('.', ',')}).${fan ? ` Ним уже цікавиться ${fan.name}.` : ''}`, cat: 'players' });
        continue;
      }
      // мало грає
      if (myGames >= 8 && age >= 21 && ranked.indexOf(p) < 15 && !p.injury && st[0] / myGames < 0.3 && (p.morale ?? 60) < 58 && !p.minPromise && fresh('min-' + p.id, 12)) {
        if (ask('st_minutes', `${name(p)} просить розмови: за сезон лише ${st[0]} ${FM.plural ? FM.plural(st[0], 'матч', 'матчі', 'матчів') : 'матчів'} з ${myGames}. Він хоче грати.`, p)) continue;
      }
      // ветеран думає про завершення
      if (age >= 33 && myGames >= 12 && st[0] / myGames < 0.4 && !p.stayOn && !p.futureCoach && fresh('ret-' + p.id, 60)) {
        if (ask('st_retire', `${name(p)} (${age} р.) зізнається: думає, чи не час завершувати кар’єру.`, p)) continue;
      }
      // туга за домом
      const lgC = W.league(W.club(state.clubId).league).country;
      if (p.nat !== lgC && age <= 24 && p.joined && (S.year * 100 + S.week) - (p.joined[0] * 100 + p.joined[1]) < 20 && (p.morale ?? 60) < 52 && fresh('home-' + p.id, 50)) {
        if (ask('st_home', `${name(p)} важко звикає до нової країни: сумує за родиною, погано спить.`, p)) continue;
      }
      // віха сезону
      if ((st[1] === 10 || st[1] === 20) && fresh(`goals${st[1]}-${p.id}`, 60)) out.push({ text: `${name(p)} забив ${st[1]}-й гол у сезоні ліги!`, cat: 'players' });
    }
    // ---- обіцянки ігрового часу ----
    for (const p of sq) {
      const pr = p.minPromise;
      if (!pr || pr.y !== S.year || S.week < pr.w) continue;
      const apps = (S.ps[p.id] || [0])[0];
      delete p.minPromise;
      if (apps >= pr.apps) { mor(p, 5); out.push({ text: `${name(p)} задоволений: обіцянку дати ігровий час виконано.`, cat: 'players' }); }
      else { mor(p, -15); p.wantsOut = true; out.push({ text: `${name(p)} обурений: обіцяних матчів він так і не отримав. Тепер він просить продажу.`, cat: 'players' }); }
    }
    return out.slice(0, 3);
  }

  /** Новини світу для різноманіття: травми зірок, неймовірні серії, сенсації в інших клубах вашої ліги. */
  function world(W, state, name = (p) => p.name) {
    const S = state.season, out = [];
    const R = FM.rng(`wstory-${S.seed}-${S.year}-${S.week}`);
    if (!R.chance(0.45)) return out;
    const my = W.club(state.clubId).league;
    const clubs = W.clubsOf(my).filter((c) => c.id !== state.clubId);
    const stars = clubs.flatMap((c) => W.squad(c.id).sort((a, b) => b.ca - a.ca).slice(0, 2));
    const hurt = stars.filter((p) => p.injury >= 4);
    const kinds = [];
    if (hurt.length) kinds.push(() => { const p = R.pick(hurt); return `Удар для ${W.club(p.club).name}: ${name(p)} вибув на ${p.injury} тиж.`; });
    const hot = stars.filter((p) => p.fg && p.fg.length >= 3 && p.fg.slice(-3).every((x) => x > 0));
    if (hot.length) kinds.push(() => { const p = R.pick(hot); return `${name(p)} (${W.club(p.club).name}) забиває три матчі поспіль — головна загроза ліги зараз.`; });
    const tables = FM.season.table(S, W, my);
    const leader = tables[0], bottom = tables[tables.length - 1];
    if (leader && leader.p >= 5) kinds.push(() => `Лідер ліги ${W.club(leader.id).name} (${leader.pts} оч.) — ${leader.form.slice(-3).every((x) => x === 'W') ? 'три перемоги поспіль, відрив росте' : 'спіткнувся, гонка за титул відкрита'}.`);
    if (bottom && bottom.p >= 6) kinds.push(() => `${W.club(bottom.id).name} на останньому місці: уболівальники вимагають відставки тренера.`);
    if (kinds.length) out.push(R.pick(kinds)());
    return out;
  }

  FM.stories = { week, world, results, streak, CHOICES };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
