// Прес-конференції за ситуацією: питання залежать від суперника, серії, таблиці, конкретних гравців
// (посуха, прорив, травма лідера, інтерес інших клубів), тиску правління й останнього матчу. 2–3 питання,
// кожна відповідь має наслідки: настрій команди чи конкретного гравця, довіра правління, фанати, налаштованість на матч.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const clamp = (x) => Math.max(0, Math.min(100, x));
  const avg = (a) => (a && a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

  // Кожне питання: when(c) — чи доречне; q(c) — текст; a(c) — [[відповідь, ефект]]
  // ефект: { team, p (настрій гравця c.p), conf, fans, rep, focus (налаштованість на наступний матч, ×), note }
  const Q = [
    { id: 'derby', when: (c) => c.derby, q: (c) => `Попереду дербі, суперник — ${c.opp}. Що для вас означає цей матч?`, a: () => [
      ['Це найважливіший матч сезону для вболівальників.', { fans: 3, team: 1, focus: 1.02 }],
      ['Це лише три очки, як і будь-які інші.', { fans: -2, team: 0.5 }],
      ['Ми покажемо, хто господар у місті.', { fans: 4, team: 2, focus: 1.025, risky: true }]] },
    { id: 'fav', when: (c) => c.opp && c.lvlDiff > 6, q: (c) => `Наступний суперник — ${c.opp}, і ви явний фаворит. Чи не боїтеся недооцінити його?`, a: () => [
      ['Ні. Ми поважаємо кожного суперника.', { team: 1, focus: 1.01 }],
      ['Ми сильніші й маємо це довести.', { team: 1.5, conf: 0.5, risky: true }],
      ['Футбол непередбачуваний, усе можливо.', { team: -0.5 }]] },
    { id: 'under', when: (c) => c.opp && c.lvlDiff < -6, q: (c) => `Суперник — ${c.opp}, він значно сильніший. Чи вірите ви в успіх?`, a: () => [
      ['Нам нічого втрачати — підемо вперед.', { team: 2, focus: 1.02 }],
      ['Будемо грати від оборони й чекати шансу.', { team: 0.5, focus: 1.01 }],
      ['Реалістично — нічия буде успіхом.', { team: -1.5, fans: -1 }]] },
    { id: 'wins', when: (c) => c.ws >= 3, q: (c) => `${c.ws} перемоги поспіль. У чому секрет?`, a: () => [
      ['Гравці працюють як ніколи — усе заслуга їх.', { team: 2 }],
      ['Ми ще нічого не виграли, рано радіти.', { team: 0.5, conf: 0.5, focus: 1.01 }],
      ['Моя тактика працює, суперники не знають, що робити.', { team: -1, conf: 1, rep: 1 }]] },
    { id: 'losses', when: (c) => c.ls >= 2, q: (c) => `${c.ls} поразки поспіль. Ви відчуваєте тиск?`, a: () => [
      ['Відповідальність — на мені, не на гравцях.', { team: 2, conf: -0.5 }],
      ['Дехто має подивитися на себе в дзеркало.', { team: -2, conf: 1 }],
      ['Це просто погана смуга, ми з неї вийдемо.', { team: 0.5 }]] },
    { id: 'board', when: (c) => c.conf != null && c.conf < 35, q: () => 'Кажуть, правління вже шукає вам заміну. Прокоментуєте?', a: () => [
      ['Я зосереджений на роботі й вірю в команду.', { team: 1, conf: 1 }],
      ['Хай правління говорить зі мною, а не через газети.', { conf: -3, fans: 2, rep: 1 }],
      ['Розумію невдоволення. Результати мають бути кращими.', { conf: 2, team: -0.5 }]] },
    { id: 'title', when: (c) => c.pos === 1 && c.played >= 10, q: () => 'Ви лідируєте. Це команда, яка виграє чемпіонат?', a: () => [
      ['Так. Ми граємо за титул.', { team: 2, fans: 3, conf: 1, risky: true }],
      ['Думаємо лише про наступний матч.', { team: 1, focus: 1.01 }],
      ['Сезон довгий, конкуренти сильні.', { team: 0 }]] },
    { id: 'releg', when: (c) => c.pos >= c.teams - 2 && c.played >= 8, q: () => 'Ви в зоні вильоту. Команда здатна врятуватися?', a: () => [
      ['Так. Кожен матч тепер — фінал.', { team: 2, focus: 1.02 }],
      ['Потрібне підсилення в найближче вікно.', { team: -2, conf: 1 }],
      ['Я вірю в цих гравців.', { team: 2.5, conf: -0.5 }]] },
    { id: 'dry', when: (c) => c.dry, q: (c) => `${c.n(c.dry)} не забиває вже кілька матчів. Чи збережете ви йому місце в складі?`, pk: 'dry', a: () => [
      ['Безперечно. Він забиватиме.', { p: 6 }],
      ['Місце в складі треба заслуговувати щотижня.', { p: -4, team: 0.5 }],
      ['Про склад говоритиму з гравцями, а не з пресою.', { p: 1 }]] },
    { id: 'star', when: (c) => c.hot, q: (c) => `${c.n(c.hot)} у чудовій формі. Як вам удається отримувати від нього максимум?`, pk: 'hot', a: () => [
      ['Він сам так працює — заслуга лише його.', { p: 4 }],
      ['Він може ще краще.', { p: -1, team: 0.5 }],
      ['Футбол — командна гра, не хочу виділяти когось одного.', { p: -1.5, team: 1.5 }]] },
    { id: 'kid', when: (c) => c.kid, q: (c) => `Молодий ${c.n(c.kid)} яскраво проявив себе. Він стане зіркою?`, pk: 'kid', a: () => [
      ['У нього величезний потенціал.', { p: 4, fans: 1 }],
      ['Йому ще багато працювати — не будемо поспішати.', { p: 1, team: 0.5 }],
      ['Звичайно, якщо не загордиться.', { p: -2 }]] },
    { id: 'rumour', when: (c) => c.wanted, q: (c) => `Кажуть, ${c.n(c.wanted)} цікавляться інші клуби. Його продадуть?`, pk: 'wanted', a: () => [
      ['Він не продається.', { p: 3, fans: 2, conf: -0.5 }],
      ['Кожен гравець має свою ціну.', { p: -3, conf: 1 }],
      ['Не коментую чутки.', { p: 0 }]] },
    { id: 'injury', when: (c) => c.injured, q: (c) => `Як команда впорається без травмованого ${c.g(c.injured)}?`, pk: 'injured', a: () => [
      ['Інші отримають шанс — я в них вірю.', { team: 1.5 }],
      ['Це велика втрата, буде важко.', { team: -1, p: 2 }],
      ['Шукатимемо заміну на ринку.', { team: -1.5, conf: 0.5 }]] },
    { id: 'feud', when: (c) => c.feud, q: (c) => `Тренер суперника заявив, що ваша команда «переоцінена». Ваша відповідь?`, a: () => [
      ['Відповімо на полі.', { team: 1.5, focus: 1.02 }],
      ['Хай спершу подивиться на свою таблицю.', { fans: 3, team: 1, risky: true }],
      ['Не буду коментувати слова колег.', { team: 0.5, rep: 0.5 }]] },
    { id: 'style', when: () => true, q: () => 'Уболівальники критикують стиль гри. Що відповісте?', a: () => [
      ['Результат важливіший за красу.', { team: 0.5, conf: 0.5 }],
      ['Ми працюємо над атакою, буде краще.', { team: 1, fans: 1 }],
      ['Критика несправедлива.', { team: 1, conf: -1 }]] },
    { id: 'form', when: () => true, q: () => 'Як ви оцінюєте форму команди?', a: () => [
      ['Задоволений: хлопці працюють чудово.', { team: 2 }],
      ['Є над чим працювати, але рухаємося правильно.', { team: 0.5, conf: 0.5 }],
      ['Дехто грає нижче свого рівня — будуть зміни.', { team: -1.5, conf: 1 }]] },
    // ---- після матчу ----
    { id: 'post_big', post: true, when: (c) => c.last && c.last.d >= 3, q: (c) => `${c.last.score} з ${c.last.opp} — справжній розгром. Це найкращий матч команди?`, a: () => [
      ['Так, ідеальний вечір.', { team: 2, fans: 2 }],
      ['Добре, але помилки були, розберемо.', { team: 0.5, focus: 1.01 }],
      ['Суперник сьогодні просто не з’явився.', { team: 1, rep: -0.5 }]] },
    { id: 'post_bad', post: true, when: (c) => c.last && c.last.d <= -3, q: (c) => `${c.last.score} з ${c.last.opp} — болюча поразка. Що сталося?`, a: () => [
      ['Це моя відповідальність, перепрошую перед уболівальниками.', { fans: 2, team: 1, conf: -0.5 }],
      ['Деякі гравці сьогодні підвели команду.', { team: -3, conf: 0.5 }],
      ['Такий день, забудемо й рухаємося далі.', { team: 0.5, fans: -1 }]] },
    { id: 'post_late', post: true, when: (c) => c.last && c.last.late, q: () => 'Вирішальний гол на останніх хвилинах — що відчули?', a: () => [
      ['Ця команда ніколи не здається!', { team: 2, fans: 2 }],
      ['Пощастило, треба вирішувати такі матчі раніше.', { team: 0.5, focus: 1.01 }]] },
    { id: 'post_red', post: true, when: (c) => c.last && c.last.red, q: () => 'Вилучення змінило матч. Як оцінюєте рішення арбітра?', a: () => [
      ['Суддя помилився — це вкрало в нас очки.', { fans: 2, conf: -1, team: 1, risky: true }],
      ['Рішення правильне, гравцеві треба бути розумнішим.', { team: -1, conf: 0.5 }],
      ['Не коментую суддівство.', { rep: 0.5 }]] },
  ];

  /** Обставини для питань: суперник, серії, таблиця, гравці, останній матч. */
  function context(W, state, info = {}) {
    const S = state.season, my = W.club(state.clubId);
    const res = FM.stories ? FM.stories.results(S, state.clubId) : [];
    const sq = W.squad(state.clubId).filter((p) => !p.loan);
    const ranked = [...sq].sort((a, b) => b.ca - a.ca);
    const t = FM.season.table(S, W, my.league), row = t.find((r) => r.id === my.id) || {};
    const pickBy = (fn) => ranked.slice(0, 16).find(fn) || null;
    const c = {
      W, state, n: info.name || ((p) => p.name), g: (p) => (info.gen && info.gen(p)) || (info.name || ((q) => q.name))(p),
      opp: info.opp ? info.club(W.club(info.opp)) : null, oppG: null,
      lvlDiff: info.opp ? W.clubLevel(my.id) - W.clubLevel(info.opp) : 0,
      derby: !!(info.opp && FM.rivals && FM.rivals.isDerby(W, my.id, info.opp)),
      feud: !!(info.opp && state.mind && state.mind.club === info.opp),
      ws: FM.stories ? FM.stories.streak(res, 'w') : 0, ls: FM.stories ? FM.stories.streak(res, 'l') : 0,
      conf: state.board ? state.board.conf : null, pos: t.indexOf(row) + 1, teams: t.length, played: row.p || 0,
      dry: pickBy((p) => ['ST', 'W', 'AM'].includes(p.roles[0]) && p.fg && p.fg.length >= 3 && p.fg.slice(-3).every((x) => !x)),
      hot: pickBy((p) => p.fg && p.fg.length >= 2 && p.fg.slice(-2).every((x) => x > 0)),
      kid: sq.find((p) => (W.age(p) ?? 30) <= 21 && p.form && p.form.length >= 2 && avg(p.form) >= 7) || null,
      wanted: pickBy((p) => p.interest && p.interest.until > S.year * 100 + S.week),
      injured: ranked.slice(0, 6).find((p) => p.injury >= 2) || null,
      last: info.last || null,
    };
    return c;
  }

  /** Питання прес-конференції: 2–3 доречні, без повторів останніх. kind — 'pre' (перед матчем) або 'post'. */
  function build(W, state, info = {}, kind = 'pre') {
    const S = state.season;
    const c = context(W, state, info);
    const R = FM.rng(`press-${S.seed}-${S.year}-${S.week}-${kind}`);
    const recent = state.pressRecent || [];
    let pool = Q.filter((q) => !!q.post === (kind === 'post') && q.when(c) && !recent.includes(q.id));
    const generic = pool.filter((q) => q.id === 'style' || q.id === 'form');
    pool = pool.filter((q) => !generic.includes(q));
    const n = kind === 'post' ? Math.min(2, pool.length) : 3;
    const picked = [];
    while (picked.length < n && pool.length) picked.push(pool.splice(R.int(pool.length), 1)[0]);
    while (picked.length < (kind === 'post' ? 1 : 2) && generic.length) picked.push(generic.splice(R.int(generic.length), 1)[0]);
    return picked.map((q) => ({ id: q.id, q: q.q(c), a: q.a(c).map(([text, fx]) => [text, fx]), pid: q.pk && c[q.pk] ? c[q.pk].id : null }));
  }

  /** Відповідь: застосувати ефект. Повертає текст реакції. */
  function answer(W, state, item, i, name = (p) => p.name) {
    const S = state.season, fx = item.a[i][1];
    const sq = W.squad(state.clubId);
    if (fx.team) for (const p of sq) p.morale = clamp((p.morale ?? 60) + fx.team);
    const pl = item.pid ? W.player(item.pid) : null;
    if (fx.p && pl) pl.morale = clamp((pl.morale ?? 60) + fx.p);
    if (fx.conf && state.board) state.board.conf = clamp(state.board.conf + fx.conf);
    if (fx.rep && state.board) state.board.rep = clamp(state.board.rep + fx.rep);
    if (fx.fans && FM.club) { const f = FM.club.fans(W, state.clubId); f.mood = clamp(f.mood + fx.fans); }
    if (fx.focus) state.pressFocus = { y: S.year, w: S.week, k: Math.max(state.pressFocus && state.pressFocus.y === S.year && state.pressFocus.w === S.week ? state.pressFocus.k : 1, fx.focus) };
    // гучні заяви: якщо наступний матч програно — критика в пресі (див. app.js)
    if (fx.risky) state.pressBold = { y: S.year, w: S.week };
    state.pressRecent = (state.pressRecent || []).concat([item.id]).slice(-6);
    const bits = [];
    if (fx.team >= 1.5) bits.push('гравцям сподобалися ваші слова');
    else if (fx.team <= -1.5) bits.push('дехто в роздягальні образився');
    if (pl && fx.p >= 3) bits.push(`${name(pl)} вдячний за підтримку`);
    else if (pl && fx.p <= -2) bits.push(`${name(pl)} сприйняв слова болісно`);
    if (fx.conf >= 1) bits.push('правління оцінило вимогливість');
    else if (fx.conf <= -1) bits.push('правлінню відповідь не сподобалась');
    if (fx.fans >= 2) bits.push('уболівальники в захваті');
    else if (fx.fans <= -1) bits.push('уболівальники розчаровані');
    if (fx.focus) bits.push('команда налаштована на матч');
    if (fx.risky) bits.push('гучна заява — тепер усі чекають результату');
    return bits.length ? bits.join('; ') + '.' : 'Відповідь сприйняли спокійно.';
  }
  const focus = (state) => { const f = state.pressFocus, S = state.season; return f && f.y === S.year && f.w === S.week ? f.k : 1; };

  FM.press = { Q, context, build, answer, focus };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
