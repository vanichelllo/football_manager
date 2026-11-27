// Інтерфейс: початок кар'єри, огляд клубу, склад, картка гравця, ліги, налаштування.
(async function () {
  'use strict';
  const { el, fmt, store } = FM;
  const app = document.getElementById('app');

  if (!window.FM_DB) {
    app.replaceChildren(el('div.start', [
      el('h1', 'Немає бази даних'),
      el('p', ['Файл data/db.js не знайдено. Зберіть базу командою ', el('code', 'node tools/build-db.js'), ' (див. README).']),
    ]));
    return;
  }

  let state = await store.load();
  // збереження з давньої бази (порядкові id) — переводимо на стабільні id
  const upgradeIds = (st) => (st && !st.stableIds && window.FM_DB.legacyIds ? Object.assign(FM.remapIds(st, window.FM_DB.legacyIds), { stableIds: true }) : st);
  state = upgradeIds(state);
  // Світ кар'єри: реальна база + зміни цієї кар'єри (розвиток, трансфери, редагування)
  let W = FM.createWorld(window.FM_DB, state && state.world);
  if (state && !W.club(state.clubId)) { state = null; W = FM.createWorld(window.FM_DB); } // база змінилась — клубу вже немає
  // давніші збереження (до етапу 3) — створюємо сезон
  if (state && !state.season) { state.season = FM.season.create(W, String(Date.now())); saveGame(); }

  if (state) { FM.market.init(W, state); if (!state.board) FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state); FM.nations.ensurePools(W, state); }

  /** Кубки сезону; у старому збереженні — створити й догнати пропущені тижні. */
  function ensureCups() {
    if (state.cups) return;
    state.cups = FM.cups.createAll(W, state.season, null);
    FM.cups.payParticipation(W, state);
    const now = state.season.week;
    for (let w = 0; w < now; w++) { state.season.week = w; FM.cups.playWeek(W, state, { name: NAMES, user: USER() }); }
    state.season.week = now;
  }

  /** Зберегти кар'єру разом зі змінами світу. */
  function saveGame() {
    state.world = W.export();
    store.save(state, { club: clubName(W.club(state.clubId)) }).then((ok) => { if (!ok) console.warn('Не вдалося зберегти гру в браузері'); slotMeta = null; });
  }
  let slotMeta = null; // описи слотів збереження (завантажуються асинхронно)
  /** Почати з чистого аркуша: свіжий світ з реальної бази. */
  function resetCareer() {
    store.clear(); state = null; W = FM.createWorld(window.FM_DB);
    pre = null; tableLeague = null; browseLeague = null;
  }
  const seasonLabel = () => { const y = state ? state.season.year : 2026; return `${y}/${String(y + 1).slice(2)}`; };

  /** Позначка «орієнтовно» для даних, яких немає у Wikipedia (їх згенеровано). */
  const genMark = (p, k) => ((p.gen || []).includes(k) ? el('small.muted', { title: 'У Wikipedia цих даних немає — значення згенеровано' }, ' · орієнтовно') : null);
  const ageTxt = (p) => (W.age(p) != null ? `${W.age(p)} р.` : 'вік невідомий');
  const nameOf = (p) => (state && state.names === 'en' ? p.nameEn : p.name);
  const clubName = (c) => (state && state.names === 'en' ? c.nameEn : c.name);
  /** Родовий відмінок для українських гравців (у трансляції: «Навіс Шевченка»). */
  const genOf = (p) => (state && state.names !== 'en' && p.nat === 'UKR' ? FM.ukGen(nameOf(p)) : null);
  const NAMES = { club: (c) => clubName(c), player: (p) => nameOf(p), gen: genOf, stat: (p) => ((state && state.season.ps[p.id]) || [])[1] || 0 }; // stat — голи гравця в лізі цього сезону (для коментаря)
  const pstat = (id) => (state && state.season.ps[id]) || null; // [ігри, голи, паси, сума оцінок ×10, ЖК, ЧК]
  const banned = (id) => !!(state && state.season.bans[id]);

  /** Чи знаємо гравця точно: свій клуб, своя ліга, розвідали скаути. Інакше — лише приблизно. */
  function known(p) {
    if (!state) return true;
    if (state.known && state.known[p.id]) return true;
    if (!p.club) return false;
    if (state.knownLeagues && state.knownLeagues[W.club(p.club).league]) return true;
    return p.club === state.clubId || W.club(p.club).league === W.club(state.clubId).league;
  }
  const fuzz = (p, key, amp) => {
    let h = 2166136261; const s = p.id + key + (state ? state.season.seed : '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.round((((h >>> 0) / 4294967296) - 0.5) * 2 * amp * (state ? FM.market.scoutAccuracy(state) : 1));
  };
  /** Рівень, яким його бачить тренер: точний або оцінка скаутів (±10). */
  const seenCA = (p) => (known(p) ? p.ca : Math.max(1, p.ca + fuzz(p, 'ca', 10)));
  const seenPA = (p) => (known(p) ? p.pa : Math.max(1, p.pa + fuzz(p, 'pa', 18)));

  function badge(c, big) {
    const b = el('div.badge' + (big ? '.big' : ''), { title: clubName(c), 'aria-hidden': 'true' }, el('span', c.code));
    b.style.setProperty('--c1', c.colors[0] || '#ccc');
    b.style.setProperty('--c2', c.colors[1] || c.colors[0] || '#333');
    return b;
  }

  function starsEl(v, label) {
    const s = FM.stars(v);
    const full = Math.floor(s), half = s % 1 ? 1 : 0;
    return el('span.stars', { title: `${label}: ${String(s).replace('.', ',')} з 5`, 'aria-label': `${label}: ${s} з 5` },
      ['★'.repeat(full), half ? '⯪' : '', el('span.off', '★'.repeat(5 - full - half))]);
  }

  function attrClass(v) { return v <= 5 ? 'a1' : v <= 10 ? 'a2' : v <= 15 ? 'a3' : 'a4'; }

  // ---------------- Маршрути ----------------
  function go(view) { if (location.hash !== '#' + view) location.hash = view; else render(); }
  window.addEventListener('hashchange', render);

  let lastView = null; // який екран показано — щоб не скидати прокрутку при оновленні того самого
  function render() {
    clearTimeout(liveTimer); // пішли з трансляції — матч догравається миттєво й записується
    if (activeLive) activeLive.finish();
    if (!state) { applySkin(null); return renderStart(); }
    if (!state.cups) { ensureCups(); saveGame(); } // старе збереження без кубків
    let view = location.hash.slice(1) || 'inbox'; // як у FM: головний екран — пошта
    if (FM.duo.on(state) && state.duo.handoff) view = 'duo'; // гра на двох: передати телефон
    if (state.sacked && !['sacked', 'options', 'interview'].includes(view.split('-')[0])) view = 'sacked';
    const [name, arg] = view.split(/-(.+)/);
    const screens = { overview: screenOverview, squad: screenSquad, player: screenPlayer, leagues: screenLeagues, club: screenClub, match: screenMatch, tactics: screenTactics, transfers: screenTransfers, office: screenOffice, cups: screenCups, help: screenHelp, board: screenBoard, sacked: screenSacked, training: screenTraining, report: screenReport, history: screenHistory, coach: screenCoach, inbox: screenInbox, dressing: screenDressing, u21: screenU21, media: screenMedia, search: screenSearch, charts: screenCharts, calendar: screenCalendar, compare: screenCompare, holiday: screenHoliday, awards: screenAwards, planner: screenPlanner, plan: screenPlan, medical: screenMedical, interview: screenInterview, nations: screenNations, edit: screenEditPlayer, editclub: screenEditClub, fixtures: screenSeason, table: screenTable, options: screenSettings, duo: screenDuo };
    planTouch(name);
    if (name !== 'inbox') inboxBase = null;
    const body = (screens[name] || screenOverview)(arg);
    // той самий екран (натиснули кнопку, змінили фільтр) — прокрутка лишається; інший екран — на початок
    const same = view === lastView;
    const SCROLLERS = '.side, .table-wrap';
    const keep = same ? { y: window.scrollY, x: [...app.querySelectorAll(SCROLLERS)].map((e) => e.scrollLeft) } : null;
    app.replaceChildren(shell(name, body));
    if (keep) {
      window.scrollTo(0, keep.y);
      app.querySelectorAll(SCROLLERS).forEach((e, i) => { if (keep.x[i]) e.scrollLeft = keep.x[i]; });
    } else {
      window.scrollTo(0, 0);
      // на телефоні меню — горизонтальна стрічка: показати в ній відкритий пункт
      const side = app.querySelector('.side'), cur = app.querySelector('.nav [aria-current="page"]');
      if (side && cur && side.scrollWidth > side.clientWidth) side.scrollLeft = Math.max(0, cur.offsetLeft - (side.clientWidth - cur.offsetWidth) / 2);
    }
    lastView = view;
  }

  // ---------------- Оформлення: «Класичний менеджер» (темне, кольори клубу) або світле ----------------
  const SKIN_KEY = 'golovnyi-trener:skin';
  let skin = (() => { try { return localStorage.getItem(SKIN_KEY) === 'light' ? 'light' : 'classic'; } catch (_) { return 'classic'; } })();
  const setSkin = (v) => { skin = v; try { localStorage.setItem(SKIN_KEY, v); } catch (_) { /* приватне вікно */ } };
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  /** Кольори клубу в оформленні: тло шапки, смуга, помітний на темному акцент. */
  function applySkin(club) {
    const r = document.documentElement;
    r.dataset.skin = skin;
    const c = (club && club.colors) || ['#2b5c8a', '#ffffff'];
    const [a, b] = [c[0], c[1] || '#ffffff'];
    r.style.setProperty('--club', a); r.style.setProperty('--club-2', b); r.style.setProperty('--club-fg', readableOn(a));
    // акцент на темному тлі: світліший з кольорів клубу, якщо він не надто темний; інакше — блакитний гри
    const hi = [a, b].filter((x) => lum(x) > 0.28 && lum(x) < 0.97).sort((x, y) => Math.abs(lum(x) - 0.6) - Math.abs(lum(y) - 0.6))[0] || (lum(a) >= 0.97 || lum(b) >= 0.97 ? '#e8edf2' : '#5fb0ff');
    r.style.setProperty('--club-hi', hi); r.style.setProperty('--club-hi-fg', readableOn(hi));
  }

  function shell(active, body) {
    const my = W.club(state.clubId);
    applySkin(my);
    const item = (id, label, disabled) => el('button', {
      type: 'button', 'aria-current': active === id ? 'page' : null, disabled: disabled || null, onclick: () => go(id),
    }, disabled ? [label, el('span.soon', 'скоро')] : label);
    return el('div.shell', [
      el('aside.side', [
        el('div.club-head', [badge(my), el('b', clubName(my))]),
        el('nav.nav', { 'aria-label': 'Меню' }, [
          planNav() ? item('plan', planNav()) : null, item('overview', 'Огляд'), item('inbox', (() => { const n = FM.market.unread(state); return n ? ['Повідомлення ', el('span.count', { 'aria-label': `${n} непрочитаних` }, String(n))] : 'Повідомлення'; })()), item('squad', 'Склад'), item('planner', 'План складу'), item('dressing', 'Роздягальня'), item('u21', 'Молодь U-21'), item('leagues', 'Ліги й клуби'),
          item('fixtures', 'Сезон'), item('calendar', 'Календар'), item('table', 'Таблиця'), item('charts', 'Графіки'), item('cups', 'Кубки'), item('match', 'Товариський'),
          item('tactics', 'Тактика'), item('training', 'Тренування'), item('medical', 'Медцентр'), item('transfers', 'Трансфери'), item('search', 'Пошук'), item('office', 'Клуб'), item('board', 'Правління'), item('media', 'Медіа'), item('coach', 'Тренер'), item('nations', 'Збірна'), item('awards', 'Нагороди'), item('history', 'Історія'), item('help', 'Довідка'),
          item('options', 'Налаштування'),
        ]),
        el('div.foot', [`Тренер: ${state.manager}`, el('br'), `Сезон ${seasonLabel()}`, el('br'), el('a.muted', { href: '#options', title: versionText() }, versionText(true))]),
      ]),
      el('main.main', [topbar(), tutorialBox(active), ...[].concat(body)]),
    ]);
  }

  // ---------------- Початок кар'єри ----------------
  function renderStart() {
    let leagueId = 'ukr', clubId = null, challenge = null;
    const grid = el('div.club-grid');
    const chBox = el('div.tabs', { role: 'group', 'aria-label': 'Режим' });
    const chNote = el('p.muted');
    function drawChallenges() {
      chBox.replaceChildren(...[[null, 'Звичайна кар’єра'], ...Object.entries(FM.challenges.DEFS).map(([k, d]) => [k, 'Виклик: ' + d.label])].map(([k, label]) =>
        el('button', { type: 'button', 'aria-pressed': String(challenge === k), onclick: () => { challenge = k; clubId = null; startBtn.disabled = true; picked.textContent = 'Оберіть клуб'; drawChallenges(); drawTabs(); drawClubs(); } }, label)));
      chNote.textContent = challenge ? FM.challenges.DEFS[challenge].desc : 'Будь-який клуб, цілі ставить правління.';
    }
    const tabs = el('div.tabs', { role: 'group', 'aria-label': 'Ліга' });
    const nameInput = el('input', { id: 'manager-name', type: 'text', value: 'Новий тренер', maxlength: 40, autocomplete: 'off' });
    const tutInput = el('input', { id: 'tutorial', type: 'checkbox', checked: true });
    const duoInput = el('input', { id: 'duo', type: 'checkbox', onchange: () => { duoBox.hidden = !duoInput.checked; } });
    const name2 = el('input', { id: 'manager-name-2', type: 'text', value: 'Другий тренер', maxlength: 40, autocomplete: 'off' });
    const duoBox = el('div.field', { hidden: true }, [el('label', { for: 'manager-name-2' }, 'Ім’я другого тренера'), name2, el('p.muted', 'Клуб другому тренерові оберете на наступному кроці. Ходите по черзі на одному телефоні.')]);
    const startBtn = el('button.btn.primary', { type: 'button', disabled: true, onclick: begin }, 'Почати кар’єру');
    const picked = el('span.muted', 'Оберіть клуб');

    function drawTabs() {
      tabs.hidden = !!(challenge && FM.challenges.DEFS[challenge].clubs(W));
      tabs.replaceChildren(...W.db.leagues.map((l) => el('button', {
        type: 'button', 'aria-pressed': String(l.id === leagueId),
        onclick: () => { leagueId = l.id; drawTabs(); drawClubs(); },
      }, l.name)));
    }
    function drawClubs() {
      const only = challenge && FM.challenges.DEFS[challenge].clubs(W);
      const list = (only || W.clubsOf(leagueId)).map((c) => ({ c, lvl: W.clubLevel(c.id) })).sort((a, b) => b.lvl - a.lvl);
      grid.replaceChildren(...list.map(({ c, lvl }) => el('button.club-card', {
        type: 'button', 'aria-pressed': String(c.id === clubId),
        onclick: () => { clubId = c.id; picked.textContent = c.name; startBtn.disabled = false; drawClubs(); },
      }, [badge(c), el('span.t', [el('b', c.name), el('small', c.stadium || c.nameEn), starsEl(lvl, 'Рівень клубу')])])));
    }
    function begin() {
      if (!clubId) return;
      state = { version: 1, manager: nameInput.value.trim() || 'Новий тренер', clubId, names: 'uk', started: W.today,
        season: FM.season.create(W, String(Date.now())), tutorial: tutInput.checked ? { step: 0 } : null, stableIds: true };
      FM.market.init(W, state);
      FM.board.initSeason(W, state);
      FM.club.init(W, state);
      FM.career.init(W, state);
      if (challenge) FM.challenges.start(state, challenge, W);
      FM.nations.ensurePools(W, state); // гравці для збірних, яких немає в базі
      state.day = 0;
      ensureCups();
      FM.missions.current(W, state);
      if (duoInput.checked) return renderSecond(name2.value.trim() || 'Другий тренер');
      saveGame();
      go('inbox');
    }
    drawChallenges(); drawTabs(); drawClubs();
    // інші кар'єри в слотах збереження
    const startSlots = el('div');
    Promise.all(store.SLOTS.map((n) => store.meta(n))).then((list) => {
      const act = store.active();
      const other = store.SLOTS.filter((n, i) => n !== act && list[i]);
      if (other.length) startSlots.replaceChildren(el('div.panel', [el('b', `Слот ${act} порожній. Інші кар’єри: `),
        ...other.map((n) => { const m = list[n - 1]; return el('button.btn', { type: 'button', onclick: () => { store.setActive(n); location.reload(); } }, m.legacy ? `Слот ${n}` : `Слот ${n}: ${m.club}, ${m.year}/${String(m.year + 1).slice(2)}`); })]));
    });
    app.replaceChildren(el('div.start', [
      el('div.hero', [
        el('h1', 'Головний тренер'),
        el('p', `Реальні клуби й гравці ${W.db.leagues.length} ліг, сезон 2026/27. Оберіть команду, яку очолите.`),
      ]),
      startSlots,
      el('div.field', [el('label', { for: 'manager-name' }, 'Ваше ім’я'), nameInput]),
      el('label.check', [tutInput, ' Показувати підказки для новачка']),
      el('label.check', [duoInput, ' Гра на двох на одному телефоні (два тренери, два клуби)']),
      duoBox,
      el('div.field', [el('b', 'Режим'), chBox, chNote]),
      tabs,
      grid,
      el('div.panel.confirm', [picked, startBtn]),
      el('p.note', `Дані: ${W.db.source}. Знімок від ${fmt.date(W.db.snapshot)}. Атрибути вирахувані з реальних фактів і можуть не збігатися з вашим уявленням про гравця.`),
    ]));
  }

  /** Гра на двох: другий тренер обирає клуб (інший, ніж у першого). */
  function renderSecond(name) {
    const first = state.clubId;
    let leagueId = W.club(first).league, clubId = null;
    const tabs = el('div.tabs', { role: 'group', 'aria-label': 'Ліга' }), grid = el('div.club-grid');
    const startBtn = el('button.btn.primary', { type: 'button', disabled: true, onclick: () => {
      state.duo = { turn: 0, other: {} };
      FM.duo.swap(state); // тепер у state — лише спільне: створюємо кар'єру другого тренера
      Object.assign(state, { manager: name, clubId, tutorial: null });
      FM.board.initSeason(W, state);
      FM.club.init(W, state);
      FM.career.init(W, state);
      FM.missions.current(W, state);
      FM.market.news(state, `Ви очолили ${clubName(W.club(clubId))}. Гра на двох: суперник по дивану — ${state.duo.other.manager} (${clubName(W.club(state.duo.other.clubId))}).`, 'club');
      FM.duo.swap(state); // починає перший тренер
      FM.career.init(W, state);
      saveGame();
      go('duo');
    } }, 'Почати гру на двох');
    const picked = el('span.muted', 'Оберіть клуб');
    const drawTabs = () => tabs.replaceChildren(...W.db.leagues.map((l) => el('button', { type: 'button', 'aria-pressed': String(l.id === leagueId), onclick: () => { leagueId = l.id; drawTabs(); drawClubs(); } }, l.name)));
    const drawClubs = () => grid.replaceChildren(...W.clubsOf(leagueId).filter((c) => c.id !== first).map((c) => ({ c, lvl: W.clubLevel(c.id) })).sort((a, b) => b.lvl - a.lvl).map(({ c, lvl }) => el('button.club-card', {
      type: 'button', 'aria-pressed': String(c.id === clubId), onclick: () => { clubId = c.id; picked.textContent = c.name; startBtn.disabled = false; drawClubs(); },
    }, [badge(c), el('span.t', [el('b', c.name), el('small', c.stadium || c.nameEn), starsEl(lvl, 'Рівень клубу')])])));
    drawTabs(); drawClubs();
    app.replaceChildren(el('div.start', [
      el('div.hero', [el('h1', `${name}: оберіть клуб`), el('p', `Перший тренер — ${state.manager}, ${clubName(W.club(first))}. Найцікавіше — клуби однієї ліги: дербі на дивані!`)]),
      tabs, grid, el('div.panel.confirm', [picked, startBtn]),
    ]));
  }

  // ---------------- Навчання для новачка (крок 48) ----------------
  const TUTORIAL = [
    ['overview', 'Огляд клубу', 'Тут головне: найсильніші гравці й молодь, новини, гроші, найближчий матч. Сюди варто зазирати щотижня.'],
    ['squad', 'Склад', 'Натисніть на гравця — відкриється картка: атрибути 1–20, форма, контракт, характер. Зі своїми гравцями там же можна поговорити й дати обіцянку.'],
    ['tactics', 'Тактика', 'Схема, ролі, ментальність, пресинг, передачі. Нова схема спершу працює гірше: команді треба кілька тижнів, щоб звикнути. Можна зберегти до трьох тактик.'],
    ['training', 'Тренування', 'План тижня: навантаження проти відновлення. Втомлені гравці грають гірше й частіше травмуються — ротуйте склад.'],
    ['fixtures', 'Сезон', '«Грати з трансляцією» — ви керуєте замінами, тактикою й промовою в перерві. «Одразу результат» — швидко. Кубкові матчі з’являються тут же.'],
    ['transfers', 'Трансфери', 'Пошук гравців за лігою й позицією, шортлист, скаути. Купувати й продавати можна, коли відкрите трансферне вікно (початок сезону й зима).'],
    ['board', 'Правління', 'Ціль на сезон, довіра й довгострокове бачення. Якщо довіра впаде нижче 15 — звільнять. Тут же — вакансії й пропозиції роботи.'],
    ['coach', 'Тренер', 'Ваші навички, ліцензія (від неї залежить, які клуби вас візьмуть) і досягнення.'],
    ['inbox', 'Повідомлення', 'Усі новини кар’єри за розділами. Число в меню — скільки непрочитаних. Ось і все — успіхів! Підказки можна ввімкнути знову в «Налаштуваннях».'],
  ];
  function tutorialBox(active) {
    const t = state && state.tutorial;
    if (!t || t.step >= TUTORIAL.length) return null;
    const [scr, title, text] = TUTORIAL[t.step];
    const off = () => { state.tutorial = null; saveGame(); render(); };
    if (scr !== active) {
      return el('div.tutorial.small', [el('span', [`Підказка ${t.step + 1} з ${TUTORIAL.length}: `, el('b', title)]),
        el('button.btn', { type: 'button', onclick: () => go(scr) }, 'Відкрити'), el('button.btn.link', { type: 'button', onclick: off }, 'Вимкнути підказки')]);
    }
    return el('div.tutorial', { role: 'note' }, [el('b', `${t.step + 1}/${TUTORIAL.length} · ${title}`), el('p', text),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', onclick: () => { t.step++; saveGame(); if (t.step < TUTORIAL.length) go(TUTORIAL[t.step][0]); else { state.tutorial = null; saveGame(); render(); } } }, t.step + 1 < TUTORIAL.length ? 'Далі' : 'Готово'),
        el('button.btn', { type: 'button', onclick: off }, 'Вимкнути підказки')])]);
  }

  // ---------------- Огляд ----------------
  function screenOverview() {
    const c = W.club(state.clubId);
    const sq = W.squad(c.id);
    const best = [...sq].sort((a, b) => b.ca - a.ca).slice(0, 5);
    const young = sq.filter((p) => (W.age(p) || 30) <= 21).sort((a, b) => b.pa - a.pa).slice(0, 5);
    const ages = sq.map(W.age).filter((a) => a != null);
    const value = sq.reduce((s, p) => s + p.value, 0);
    const rank = W.clubsOf(c.league).map((x) => ({ id: x.id, lvl: W.clubLevel(x.id) })).sort((a, b) => b.lvl - a.lvl).findIndex((x) => x.id === c.id) + 1;

    const mini = (list, title) => el('div.panel', [el('h3', title), el('ul.plist', list.map((p) => el('li', [
      el('a', { href: '#player-' + p.id }, nameOf(p)), starsEl(title.startsWith('Най') ? p.ca : p.pa, title.startsWith('Най') ? 'Рівень' : 'Потенціал')]))) ]);

    return [
      el('header', [
        el('div', { style: { display: 'flex', gap: '0.9rem', alignItems: 'center' } }, [badge(c, true), el('div', [el('h1', clubName(c)), el('div.muted', `${W.league(c.league).name} · ${c.fullName || c.nameEn}`)])]),
        el('div.head-actions', [starsEl(W.clubLevel(c.id), 'Рівень клубу'), el('a.btn', { href: '#editclub-' + c.id }, 'Редагувати клуб')]),
      ]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Клуб'), el('dl.facts', [
          el('dt', 'Стадіон'), el('dd', c.stadium || '—'),
          el('dt', 'Місткість'), el('dd', fmt.int(c.capacity)),
          el('dt', 'Заснований'), el('dd', c.founded || '—'),
          el('dt', 'Сила в лізі'), el('dd', `${rank}-е місце з ${W.clubsOf(c.league).length} за складом`),
        ])]),
        el('div.panel', [el('h3', 'Склад'), el('dl.facts', [
          el('dt', 'Гравців'), el('dd', sq.length),
          el('dt', 'Середній вік'), el('dd', ages.length ? (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1).replace('.', ',') : '—'),
          el('dt', 'Легіонерів'), el('dd', sq.filter((p) => p.nat !== W.league(c.league).country).length),
          el('dt', 'Вартість'), el('dd', fmt.money(value)),
        ])]),
      ]),
      seasonPanel(),
      missionsCard(),
      tipsPanel(4),
      newsPanel(),
      el('div.grid', [mini(best, 'Найкращі гравці'), mini(young, 'Найперспективніша молодь (до 21)')]),
    ];
  }

  // ---------------- Таблиця з сортуванням і фільтрами (як у FM) ----------------
  // Клік по заголовку — сортування (ще раз — навпаки), пошук, швидкі фільтри, вибір стовпців, «Показати ще».
  // Налаштування кожної таблиці (сортування, фільтри, стовпці) запам'ятовуються в браузері.
  const TBL_KEY = 'golovnyi-trener:tables';
  const tblState = (() => { try { return JSON.parse(localStorage.getItem(TBL_KEY) || '{}'); } catch (_) { return {}; } })();
  const saveTbl = () => { try { localStorage.setItem(TBL_KEY, JSON.stringify(tblState)); } catch (_) { /* приватне вікно */ } };
  /**
   * cfg: { rows, cols: [{ k, label, v(row) — значення для сортування, cell(row) — вміст, num, cls(row), title, hide (сховано типово), asc (спершу за зростанням) }],
   *   filters: [{ k, label, type: 'tabs' | 'select' | 'check', options: [[значення, підпис]], test(row, значення), def }],
   *   search(row) — текст для пошуку, rowClick(row), rowCls(row), limit, sort: { k, dir }, empty, caption }
   */
  function dataTable(id, cfg) {
    const st = (tblState[id] = tblState[id] || {});
    st.f = st.f || {};
    st.hide = st.hide || {};
    const limit0 = cfg.limit || 60;
    let limit = limit0, q = '';
    const fval = (f) => (st.f[f.k] !== undefined ? st.f[f.k] : f.def !== undefined ? f.def : f.type === 'check' ? false : 'all');
    const visible = () => cfg.cols.filter((c) => !(st.hide[c.k] ?? c.hide));
    const sortCol = () => cfg.cols.find((c) => c.k === (st.s && st.s.k)) || cfg.cols.find((c) => cfg.sort && c.k === cfg.sort.k) || null;
    const box = el('div.dt'), toolbar = el('div.dt-bar'), info = el('div.dt-info'), body = el('div.table-wrap' + (cfg.flat ? '.flat' : ''));
    const rowsNow = () => {
      let rows = cfg.rows.filter((r) => (cfg.filters || []).every((f) => { const v = fval(f); return f.type === 'check' ? (!v || f.test(r, v)) : (v === 'all' || f.test(r, v)); }));
      if (q && cfg.search) { const qq = q.toLowerCase(); rows = rows.filter((r) => cfg.search(r).toLowerCase().includes(qq)); }
      const c = sortCol();
      if (c && c.v) {
        const dir = st.s && st.s.k === c.k ? st.s.dir : (cfg.sort && cfg.sort.k === c.k ? cfg.sort.dir : c.asc ? 1 : -1);
        const dec = rows.map((r) => [c.v(r), r]);
        dec.sort((a, b) => {
          const x = a[0], y = b[0];
          if (x == null || x === '') return 1; if (y == null || y === '') return -1; // порожні — завжди внизу
          return (typeof x === 'string' ? x.localeCompare(y, 'uk') : x - y) * dir;
        });
        rows = dec.map((d) => d[1]);
      }
      return rows;
    };
    const drawBody = () => {
      const rows = rowsNow(), cols = visible(), c = sortCol();
      const dir = c && (st.s && st.s.k === c.k ? st.s.dir : cfg.sort && cfg.sort.k === c.k ? cfg.sort.dir : c.asc ? 1 : -1);
      info.replaceChildren(...[el('span.muted', `Показано ${Math.min(limit, rows.length)} з ${rows.length}${rows.length !== cfg.rows.length ? ` (усього ${cfg.rows.length})` : ''}`),
        rows.length > limit ? el('button.btn.link', { type: 'button', onclick: () => { limit += 50; drawBody(); } }, 'Показати ще 50') : null].filter(Boolean));
      body.replaceChildren(rows.length ? el('table', [
        cfg.caption ? el('caption', cfg.caption) : null,
        el('thead', el('tr', cols.map((col) => el('th' + (col.num ? '.num' : ''), {
          scope: 'col', title: col.title || (col.v ? 'Сортувати' : null), 'data-sort': col.v ? col.k : null,
          'aria-sort': c && c.k === col.k ? (dir > 0 ? 'ascending' : 'descending') : null,
          onclick: col.v ? () => { const cur = st.s && st.s.k === col.k ? st.s.dir : (c && c.k === col.k ? dir : null); st.s = { k: col.k, dir: cur ? -cur : (col.asc ? 1 : -1) }; saveTbl(); limit = limit0; drawBody(); } : null,
        }, [col.label, c && c.k === col.k ? el('span.sort-ar', { 'aria-hidden': 'true' }, dir > 0 ? ' ▲' : ' ▼') : null])))),
        el('tbody', rows.slice(0, limit).map((r) => el('tr' + (cfg.rowClick ? '.row-link' : '') + (cfg.rowCls ? cfg.rowCls(r) || '' : ''), { onclick: cfg.rowClick ? () => cfg.rowClick(r) : null },
          cols.map((col) => el('td' + (col.num ? '.num' : '') + (col.cls ? '.' + col.cls(r) : ''), col.cell ? [].concat(col.cell(r)).flat(2) : col.v ? String(col.v(r) ?? '—') : ''))))),
      ]) : el('p.muted.dt-empty', cfg.empty || 'Нічого не знайдено — змініть фільтри.'));
    };
    const drawBar = () => {
      const filt = (cfg.filters || []).map((f) => {
        const v = fval(f), set = (nv) => { st.f[f.k] = nv; saveTbl(); limit = limit0; drawBar(); drawBody(); };
        if (f.type === 'tabs') return el('div.tabs.dt-tabs', { role: 'group', 'aria-label': f.label }, f.options.map(([ov, ol]) => el('button', { type: 'button', 'aria-pressed': String(String(v) === String(ov)), onclick: () => set(ov) }, ol)));
        if (f.type === 'check') return el('label.check', [el('input', { type: 'checkbox', checked: v || null, onchange: (e) => set(e.target.checked) }), ' ' + f.label]);
        return el('label.dt-sel', [el('span.muted', f.label + ' '), el('select', { onchange: (e) => set(e.target.value) }, f.options.map(([ov, ol]) => el('option', { value: ov, selected: String(v) === String(ov) || null }, ol)))]);
      });
      const active = (cfg.filters || []).some((f) => String(fval(f)) !== String(f.def !== undefined ? f.def : f.type === 'check' ? false : 'all')) || st.s;
      toolbar.replaceChildren(...[
        cfg.search ? el('input.dt-q', { type: 'search', placeholder: 'Пошук за іменем', 'aria-label': 'Пошук', value: q, oninput: (e) => { q = e.target.value; limit = limit0; drawBody(); } }) : null,
        ...filt,
        el('details.dt-cols', [el('summary', 'Стовпці'), el('div', cfg.cols.map((col) => el('label.check', [el('input', { type: 'checkbox', checked: !(st.hide[col.k] ?? col.hide) || null,
          onchange: (e) => { st.hide[col.k] = !e.target.checked; saveTbl(); drawBody(); } }), ' ' + (col.full || col.label)])))]),
        active ? el('button.btn.link', { type: 'button', onclick: () => { st.f = {}; delete st.s; saveTbl(); q = ''; limit = limit0; drawBar(); drawBody(); } }, 'Скинути') : null,
      ].filter(Boolean));
    };
    drawBar(); drawBody();
    box.append(toolbar, info, body);
    return box;
  }
  /** Фільтри, спільні для списків гравців: лінія, вік. */
  const LINE_TABS = { k: 'line', label: 'Лінія', type: 'tabs', options: [['all', 'Усі'], ['gk', 'ВР'], ['def', 'Захист'], ['mid', 'Півзахист'], ['att', 'Атака']], test: (p, v) => FM.ROLE_LINE[(p.p || p).roles[0]] === v };
  const AGE_SEL = { k: 'age', label: 'Вік', type: 'select', options: [['all', 'будь-який'], ['21', 'до 21'], ['23', 'до 23'], ['24-29', '24–29'], ['30', '30+']],
    test: (p, v) => { const a = W.age(p.p || p) ?? 25; return v === '21' ? a <= 21 : v === '23' ? a <= 23 : v === '30' ? a >= 30 : a >= 24 && a <= 29; } };
  const avgRating = (id) => { const st = pstat(id); return st && st[0] ? st[3] / st[0] / 10 : null; };
  const f1 = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ','));

  // ---------------- Склад ----------------
  function squadTable(clubId) {
    const mine = clubId === state.clubId, S = state.season;
    const posOrder = (p) => FM.ROLE_ORDER.indexOf(p.roles[0]) * 10 + (p.side === 'L' ? 0 : p.side === 'R' ? 2 : 1);
    const nameCell = (p) => {
      const td = [nameOf(p)];
      td.push(...(p.captain ? [' ', el('span.muted', { title: 'Капітан' }, '(К)')] : []), ...(p.onLoanFrom ? [' ', el('span.soon', { title: 'В оренді з ' + p.onLoanFrom }, 'оренда')] : []),
        ...(banned(p.id) ? [' ', el('span.chip.bad', { title: 'Пропускає наступний матч' }, 'дискв.')] : []),
        ...(p.edited ? [' ', el('span.chip', { title: 'Дані змінено в редакторі' }, '✎')] : []),
        ...(state && (state.u21 || []).includes(p.id) ? [' ', el('span.chip', { title: 'У молодіжній команді — не в заявці основи' }, 'U-21')] : []),
        ...(p.injury ? [' ', el('span.chip.bad', { title: `Травма, ще ${p.injury} тиж.` }, '+' + p.injury)] : []),
        ...(p.youth ? [' ', el('span.chip', { title: 'Вихованець академії' }, 'юнак')] : []),
        ...(p.listed ? [' ', el('span.chip', { title: 'Виставлений на трансфер' }, 'продаж')] : []),
        ...(p.loan ? [' ', el('span.chip', { title: `В оренді з ${clubName(W.club(p.loan.from))}` }, 'оренда')] : []),
        ...(p.wantsOut ? [' ', el('span.chip.bad', { title: 'Просить продати його' }, 'хоче піти')] : []));
      return td;
    };
    const STATUS = { k: 'status', label: 'Стан', type: 'select', options: [['all', 'усі'], ['ok', 'готові грати'], ['inj', 'травмовані'], ['ban', 'дискваліфіковані'], ['tired', 'втомлені (<80%)'], ['listed', 'на продажі'], ['loan', 'в оренді'], ['u21', 'у U-21'], ['exp', 'контракт спливає'], ['unhappy', 'незадоволені']],
      test: (p, v) => ({ ok: !p.injury && !banned(p.id), inj: p.injury > 0, ban: banned(p.id), tired: (p.fitness ?? 100) < 80, listed: !!p.listed, loan: !!p.loan, u21: (state.u21 || []).includes(p.id),
        exp: (p.contract || 9999) <= S.year + 1, unhappy: FM.morale.get(p) < 40 }[v]) };
    return dataTable(mine ? 'squad' : 'squad-other', {
      rows: W.squad(clubId), search: (p) => `${p.name} ${p.nameEn || ''} ${nameOf(p)}`, rowClick: (p) => go('player-' + p.id), sort: { k: 'pos', dir: 1 },
      filters: [LINE_TABS, mine ? STATUS : null, AGE_SEL].filter(Boolean),
      cols: [
        { k: 'number', label: '№', v: (p) => p.number ?? null, num: true, asc: true },
        { k: 'name', label: 'Гравець', v: nameOf, cell: nameCell, asc: true, cls: () => 'name' },
        { k: 'pos', label: 'Позиція', full: 'Позиція', v: posOrder, cell: (p) => FM.positions(p), asc: true, cls: (p) => 'pos.line-' + FM.ROLE_LINE[p.roles[0]] },
        { k: 'age', label: 'Вік', v: (p) => W.age(p), num: true, asc: true },
        { k: 'nat', label: 'Країна', v: (p) => FM.countries.name(p.nat), asc: true },
        { k: 'ca', label: 'Рівень', v: (p) => p.ca, cell: (p) => starsEl(p.ca, 'Рівень') },
        { k: 'pa', label: 'Потенціал', v: (p) => p.pa, cell: (p) => starsEl(p.pa, 'Потенціал') },
        { k: 'fit', label: 'Свіж.', full: 'Свіжість', title: 'Свіжість, %', v: (p) => Math.round(p.fitness ?? 100), num: true },
        { k: 'sharp', label: 'Ритм', full: 'Ігрова форма', title: 'Ігрова форма, %: падає без матчів', v: (p) => Math.round(FM.attrs.sharp(p)), cell: (p) => { const v = Math.round(FM.attrs.sharp(p)); return el('span' + (v < 70 ? '.warn-t' : ''), v + '%'); }, num: true },
        { k: 'last5', label: 'Останні 5', full: 'Оцінки за останні 5 матчів', v: (p) => (p.form && p.form.length ? p.form[p.form.length - 1] : null), cell: (p) => el('span.last5', (p.form || []).map((r) => el('i', { title: String(r).replace('.', ','), style: { height: Math.max(15, Math.min(100, (r - 4) * 20)) + '%' }, class: r >= 7.3 ? 'hi' : r < 6.2 ? 'lo' : '' }))), hide: !mine },
        { k: 'apps', label: 'Ігри', full: 'Ігри за сезон', v: (p) => (pstat(p.id) || [0])[0], num: true },
        { k: 'goals', label: 'Голи', v: (p) => (pstat(p.id) || [0, 0])[1], num: true },
        { k: 'ast', label: 'Пас.', full: 'Гольові передачі', v: (p) => (pstat(p.id) || [0, 0, 0])[2], num: true, hide: true },
        { k: 'rating', label: 'Оц.', full: 'Середня оцінка', v: (p) => avgRating(p.id), cell: (p) => f1(avgRating(p.id)), num: true },
        { k: 'form', label: 'Форма', full: 'Форма (5 матчів)', v: (p) => (p.form && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null), cell: (p) => f1(p.form && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null), num: true, hide: true },
        { k: 'caps', label: 'Збірна', v: (p) => p.caps || 0, cell: (p) => (p.caps ? `${p.caps} (${p.intlGoals || 0})` : '—'), num: true, hide: !mine },
        { k: 'value', label: 'Ціна', v: (p) => p.value, cell: (p) => fmt.money(p.value), num: true },
        { k: 'wage', label: 'Зарплата', full: 'Зарплата, тис. €/тиж.', v: (p) => p.wage || 0, num: true, hide: !mine },
        { k: 'contract', label: 'Контракт', v: (p) => p.contract ?? null, num: true, asc: true },
        { k: 'morale', label: 'Настрій', v: (p) => FM.morale.get(p), cell: (p) => el('span.mood.m' + Math.min(4, Math.floor(FM.morale.get(p) / 20.01)), { title: p.mr ? 'Причина: ' + p.mr : null }, FM.morale.label(p)), hide: !mine },
      ],
    });
  }

  function screenSquad() {
    const c = W.club(state.clubId);
    return [
      el('header', [el('h1', 'Склад'), el('span.muted', `${W.club(c.id).players.length} гравців · клік по заголовку — сортування`)]),
      squadTable(c.id),
    ];
  }

  // ---------------- Гравець ----------------
  function screenPlayer(id) {
    const p = W.player(id);
    if (!p) return [el('p', 'Гравця не знайдено.')];
    // гравець без клубу (вільний агент, завершив кар'єру) — показуємо останній клуб сірим
    const c = W.club(p.club) || { ...(W.club(p.lastClub) || W.club(state.clubId)), id: null, colors: ['#9aa39e', '#5b6a61'] };
    const groups = FM.ATTR_GROUPS[p.roles[0] === 'GK' ? 'gk' : 'outfield'];
    const shirt = el('div.shirt', p.number ?? '—');
    shirt.style.background = c.colors[0]; shirt.style.color = readableOn(c.colors[0]);
    const mineP = p.club === state.clubId && !p.retired;
    const TABS = [['profile', 'Профіль'], ['stats', 'Статистика'], ['deal', mineP ? 'Контракт' : 'Трансфер'], ...(mineP && !(p.loan && p.loan.to === state.clubId) ? [['talk', 'Розмова']] : [])];
    if (!TABS.some(([k]) => k === playerTab)) playerTab = 'profile';
    const sec = (k, ...kids) => (playerTab === k ? kids : []);
    return [
      el('div.player-top', [
        shirt,
        el('div', { style: { minWidth: 0 } }, [
          el('h1', nameOf(p)),
          el('div.muted', [c.id ? el('a', { href: c.id === state.clubId ? '#squad' : '#club-' + c.id }, clubName(c)) : (p.retired ? 'завершив кар’єру' : p.virtual ? `грає на батьківщині (${FM.countries.name(p.nat)}) · згенерований гравець збірної` : 'вільний агент'), ` · ${FM.ROLE_NAME[p.roles[0]]} (${FM.positions(p)})`]),
        ]),
        el('div.actions', [
          el('button.btn', { type: 'button', 'aria-pressed': String((state.compare || []).includes(p.id)), onclick: () => { toggleCompare(p.id); render(); } }, (state.compare || []).includes(p.id) ? '✓ У порівнянні' : 'Порівняти'),
          (state.compare || []).length >= 2 && (state.compare || []).includes(p.id) ? el('a.btn', { href: '#compare' }, `Порівняння (${state.compare.length})`) : null,
          el('a.btn.edit-btn', { href: '#edit-' + p.id }, p.edited ? 'Редагувати (змінено)' : 'Редагувати'),
        ]),
      ]),
      el('div.ptabs', { role: 'tablist' }, TABS.map(([k, l]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(playerTab === k), onclick: () => { playerTab = k; render(); } }, l))),
      ...sec('profile', el('div.panel.pcard', [
        el('div.pcard-top', [radarSvg(p), playerCard(p), el('div.pcard-pos', [posMap(p), el('small.muted', 'Зелене — рідна позиція, жовте — може грати, бліде — освоює.')])]),
        el('h3', { style: { marginTop: '1rem' } }, ['Атрибути', el('small.muted', ` · підсвічено ключові для позиції «${FM.roleLabel(p.roles[0], p.side)}»`)]),
        el('div.attrs.attrs-full', ATTR_BLOCKS(p)),
        known(p) ? null : el('p.note', 'Гравця не розвідано: атрибути приблизні. Відправте скаута, щоб дізнатися точно.')])),
      ...sec('profile', el('div.grid', [
        el('div.panel', [el('h3', 'Особисте'), el('dl.facts', [
          el('dt', 'Дата народження'), el('dd', p.born ? [`${fmt.date(p.born)} (${W.age(p)} р.)`, genMark(p, 'born')] : '—'),
          el('dt', 'Країна'), el('dd', [FM.countries.name(p.nat), genMark(p, 'nat')]),
          el('dt', 'Зріст'), el('dd', p.height ? [`${p.height} см`, genMark(p, 'height')] : '—'),
          el('dt', 'Збірна'), el('dd', p.caps ? `${p.caps} матчів, ${p.intlGoals || 0} голів` : 'не грав'),
          el('dt', 'Кар’єра в лігах'), el('dd', p.leagueApps != null ? `${p.leagueApps} матчів, ${p.leagueGoals || 0} голів` : '—'),
          ...(p.onLoanFrom ? [el('dt', 'Оренда'), el('dd', 'з клубу ' + p.onLoanFrom)] : []),
        ])]),
        el('div.panel', [el('h3', 'Оцінка'), el('dl.facts', [
          el('dt', 'Рівень'), el('dd', [starsEl(seenCA(p), 'Рівень'), known(p) ? '' : el('small.muted', ' оцінка скаутів')]),
          el('dt', 'Потенціал'), el('dd', starsEl(seenPA(p), 'Потенціал')),
          ...(p.club && !p.retired ? [el('dt', 'Агент'), el('dd', (() => { const a = FM.agents.of(p); return [a.name, el('small.muted', ` · ${FM.agents.label(a)}${a.super ? ' · суперагент' : ''}`)]; })())] : []),
          el('dt', 'Ціна'), el('dd', [fmt.money(p.value), p.hype > 1.05 ? el('small.trend.up', { title: 'Форма піднімає ціну' }, ` ▲ ${Math.round((p.hype - 1) * 100)}%`) : p.hype < 0.95 ? el('small.trend.down', { title: 'Погана форма або травма знижують ціну' }, ` ▼ ${Math.round((1 - p.hype) * 100)}%`) : null,
            p.interest && p.club === state.clubId && p.interest.until > state.season.year * 100 + state.season.week && W.club(p.interest.club) ? el('small.muted', ` · цікавиться ${clubName(W.club(p.interest.club))}`) : null]),
          ...(p.club && p.contract ? [el('dt', 'Контракт'), el('dd', `до літа ${p.contract}, ${p.wage} тис. € на тиждень`)] : []),
          ...(p.listed ? [el('dt', 'Трансфер'), el('dd', 'виставлений на продаж')] : []),
          ...(p.club === state.clubId ? [el('dt', 'Настрій'), el('dd', `${FM.morale.label(p)}${p.mr ? ` (${p.mr})` : ''}${p.wantsOut ? ' · просить продажу' : ''}`),
            el('dt', 'Статус'), el('dd', FM.morale.STATUS[FM.morale.status(W, p)])] : []),
          ...(p.injury ? [el('dt', 'Травма'), el('dd', `ще ${p.injury} тиж.`)] : []),
          ...(p.retired ? [el('dt', 'Кар\u2019єра'), el('dd', `завершив у ${p.retired}/${String(p.retired + 1).slice(2)}`)] : []),
          ...(!p.club && !p.retired ? [el('dt', 'Клуб'), el('dd', p.virtual ? 'клуб на батьківщині (поза лігами гри)' : 'вільний агент')] : []),
          ...((p.hist && p.hist.length) ? [el('dt', 'Рівень за сезонами'), el('dd', p.hist.map(([y, v]) => `${y}/${String(y + 1).slice(2)}: ${v}`).concat([`зараз: ${p.ca}`]).join(' · '))] : []),
          ...(() => {
            const st = pstat(p.id);
            if (!st) return [el('dt', 'Сезон'), el('dd', 'ще не грав')];
            return [el('dt', 'Сезон'), el('dd', `${st[0]} матчів, ${st[1]} голів, ${st[2]} передач`),
              el('dt', 'Середня оцінка'), el('dd', (st[3] / st[0] / 10).toFixed(2).replace('.', ',')),
              el('dt', 'Картки'), el('dd', `${st[4]} жовтих, ${st[5]} червоних` + (banned(p.id) ? ' · пропускає наступний матч' : ''))];
          })(),
        ]), p.wiki ? el('p.note', ['Факти: ', el('a', { href: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.wiki.replace(/ /g, '_')), target: '_blank', rel: 'noopener' }, 'Wikipedia')]) : null]),
      ])),
      ...sec('profile', playerExtras(p)),
      ...sec('stats', awardsLine(p), devChart(p), seasonStatsPanel(p)),
      ...sec('deal', !p.retired && p.club !== state.clubId && !p.virtual ? scoutPanel(p) : null, p.retired ? el('p.muted', 'Гравець завершив кар’єру.') : p.club === state.clubId ? myPlayerPanel(p) : transferPanel(p)),
      ...sec('talk', talkPanel(p)),
    ];
  }
  let playerTab = 'profile';
  /** Атрибути групами — повний набір (js/attrs.js); точні — для розвіданих, діапазон — для інших; ключові для позиції підсвічено. */
  function ATTR_BLOCKS(p) {
    const key = FM.attrs.keyAttrs(p.roles[0]);
    return FM.attrs.groups(p).map(([title, keys]) => el('div', [
      el('h3', title),
      el('ul', keys.map((k) => {
        const v = FM.attrs.attr(p, k), cls = key.has(k) ? '.key' : '';
        if (known(p)) return el('li' + cls, [FM.attrs.label(k), el('b.' + attrClass(v), v)]);
        const d = 1 + Math.abs(fuzz(p, k, 2)), mid = Math.max(1, Math.min(20, v + fuzz(p, k + 'm', 1)));
        const lo = Math.max(1, mid - d), hi = Math.min(20, mid + d);
        return el('li' + cls, [FM.attrs.label(k), el('b.' + attrClass(mid), `${lo}–${hi}`)]);
      })),
    ]));
  }
  /** Радар складових гравця (оборона, фізика, швидкість, креативність…), як у жанрі. */
  function radarSvg(p) {
    const data = FM.attrs.radar(p), n = data.length, R = 70, cx = 110, cy = 95;
    const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
    const ring = (v) => data.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
    const fuzzK = known(p) ? 0 : 0.06;
    const poly = data.map(([, v], i) => pt(i, Math.max(0.05, Math.min(1, v / 20 + (fuzzK ? fuzz(p, 'r' + i, 1) * fuzzK : 0)))).map((x) => x.toFixed(1)).join(',')).join(' ');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-40 -4 300 200'); svg.setAttribute('class', 'radar'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Радар: ' + data.map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
    const add = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; svg.appendChild(e); return e; };
    for (const v of [0.25, 0.5, 0.75, 1]) add('polygon', { points: ring(v), class: 'radar-grid' });
    data.forEach((_, i) => { const [x, y] = pt(i, 1); add('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'radar-grid' }); });
    add('polygon', { points: poly, class: 'radar-area' });
    data.forEach(([name], i) => { const [x, y] = pt(i, 1.2); add('text', { x: x.toFixed(1), y: (y + 3).toFixed(1), 'text-anchor': Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end', class: 'radar-label' }, name); });
    return svg;
  }
  /** Особисте як у профілі жанру: нога, зріст і вага, характер, опис у медіа, свіжість і ігрова форма. */
  function playerCard(p) {
    const cond = Math.round(p.fitness ?? 100), sh = Math.round(FM.attrs.sharp(p));
    const bar = (v) => el('span.meter', el('i', { style: { width: v + '%' }, class: v < 70 ? 'low' : '' }));
    return el('dl.facts.pcard-facts', [
      el('dt', 'Робоча нога'), el('dd', FM.attrs.FOOT[FM.attrs.foot(p)]),
      el('dt', 'Зріст / вага'), el('dd', `${p.height ? p.height + ' см' : '—'} / ${FM.attrs.weight(p)} кг`),
      el('dt', 'Характер'), el('dd', known(p) ? FM.attrs.personality(p) : 'невідомо — потрібен скаут'),
      el('dt', 'Думка медіа'), el('dd', FM.attrs.media(p)),
      ...(p.traits && p.traits.length ? [el('dt', 'Улюблені прийоми'), el('dd', p.traits.map((t) => FM.TRAITS[t]).join(', '))] : []),
      el('dt', 'Свіжість'), el('dd', [bar(cond), ` ${cond}%`]),
      el('dt', 'Ігрова форма'), el('dd', [bar(sh), ` ${sh}%`, sh < 70 ? el('small.muted', ' — давно не грав') : null]),
    ]);
  }
  /** Позиції на полі: рідна, можливі, ті, що освоює. */
  function posMap(p) {
    const XY = { GK: [50, 92], CB: [50, 77], FB: [13, 70], DM: [50, 62], CM: [50, 48], AM: [50, 33], W: [13, 28], ST: [50, 14] };
    const dots = [];
    const put = (role, cls, side) => {
      const [x, y] = XY[role] || [50, 50];
      const xs = role === 'FB' || role === 'W' ? (side === 'R' ? [100 - x] : side === 'L' ? [x] : [x, 100 - x]) : [x];
      for (const xx of xs) dots.push(el('i.' + cls, { style: { left: xx + '%', top: y + '%' }, title: FM.roleLabel(role, side) }, FM.roleLabel(role, side)));
    };
    p.roles.forEach((r, i) => put(r, i === 0 ? 'nat' : 'alt', p.side));
    for (const r of Object.keys(p.posExp || {})) put(r, 'lrn', p.side);
    return el('div.posmap', { role: 'img', 'aria-label': 'Позиції: ' + FM.positions(p) }, dots);
  }
  /** Статистика сезону на окремій вкладці. */
  function seasonStatsPanel(p) {
    const st = pstat(p.id);
    if (!st) return el('div.panel', [el('h3', 'Сезон'), el('p.muted', 'Цього сезону ще не грав.')]);
    return el('div.panel', [el('h3', `Сезон ${seasonLabel()}`), el('dl.facts', [
      el('dt', 'Матчі'), el('dd', String(st[0])), el('dt', 'Голи'), el('dd', String(st[1])), el('dt', 'Гольові передачі'), el('dd', String(st[2])),
      el('dt', 'Середня оцінка'), el('dd', (st[3] / st[0] / 10).toFixed(2).replace('.', ',')),
      el('dt', 'Картки'), el('dd', `${st[4]} жовтих, ${st[5]} червоних`),
      ...(p.form && p.form.length ? [el('dt', 'Останні оцінки'), el('dd', p.form.map((x) => String(x).replace('.', ',')).join(' · '))] : []),
      ...(p.fg && p.fg.length ? [el('dt', 'Голи в останніх матчах'), el('dd', p.fg.join(' · '))] : []),
    ])]);
  }

  // ---------------- Розмови з гравцем (крок 42) ----------------
  let talkMsg2 = null;
  function talkPanel(p) {
    const opts = FM.career.talkOptions(W, state, p);
    const mine = (state.promises || []).filter((x) => x.pid === p.id);
    const S = state.season;
    return el('div.panel', [el('h3', 'Розмова з гравцем'),
      el('p.muted', `Настрій: ${FM.morale.label(p).toLowerCase()} (${Math.round(FM.morale.get(p))}). Статус: ${FM.morale.STATUS[FM.morale.status(W, p)].toLowerCase()}.${p.wantsOut ? ' Просить продажу.' : ''}${p.trust ? ` Довіра до вас: ${p.trust > 0 ? '+' : ''}${p.trust}.` : ''}`),
      mine.length ? el('ul.plain', mine.map((x) => el('li', `Обіцянка: ${FM.career.TALK[x.kind].label.toLowerCase()} — термін до ${Math.min(x.due, FM.season.weeks(state.season) - 1) + 1}-го тижня${x.kind === 'time' ? ` (зіграно ${((S.ps[p.id] && S.ps[p.id][0]) || 0) - x.apps0} з ${x.need})` : ''}.`))) : null,
      el('div.actions', opts.map((o) => el('button.btn', { type: 'button', title: o.off || o.hint, disabled: o.off ? true : null, onclick: () => {
        const r = FM.career.talk(W, state, p, o.kind); talkMsg2 = { id: p.id, text: r.text, good: r.good }; saveGame(); render();
      } }, o.label))),
      talkMsg2 && talkMsg2.id === p.id ? el(talkMsg2.good ? 'p.msg-ok' : 'p.msg-bad', talkMsg2.text) : el('small.muted', 'Наведіть на варіант, щоб побачити, коли він доречний. З одним гравцем — не частіше ніж раз на 4 тижні.'),
    ]);
  }

  /** Розвиток гравця: рівень (1–200) наприкінці кожного сезону й по тижнях цього сезону (для ваших гравців). */
  function devChart(p) {
    if (!known(p)) return null;
    const pts = (p.hist || []).map(([y, ca]) => [y + 1, ca, `${ca} (кінець сезону ${y}/${String(y + 1).slice(2)})`]);
    for (const [y, w, ca] of (state.caLog || {})[p.id] || []) pts.push([y + (w + 1) / 50, ca, `${ca} (${y}/${String(y + 1).slice(2)}, тиждень ${w + 1})`]);
    pts.push([state.season.year + (state.season.week + 1) / 50, p.ca, `${p.ca} (зараз)`]);
    pts.sort((a, b) => a[0] - b[0]);
    if (pts.length < 2) return null;
    return el('div.panel', [el('h3', 'Розвиток'), lineChart([{ label: 'рівень', pts, focus: true }], { yMin: Math.max(1, Math.min(...pts.map((x) => x[1])) - 5), yMax: Math.max(p.pa, ...pts.map((x) => x[1])),
      xLabel: (x) => String(Math.floor(x)), aria: 'Розвиток рівня гравця' }), el('small.muted', `Рівень (1–200) з часом; верх шкали — потенціал (${p.pa}).`)]);
  }

  /** Опис прихованих рис (точно — лише для своїх і розвіданих). */
  function hiddenText(p) {
    const h = p.h || {}, out = [];
    if (h.con >= 15) out.push('дуже стабільний'); else if (h.con <= 7) out.push('нестабільний: то блискуче, то провально');
    if (h.big >= 15) out.push('розквітає у великих матчах'); else if (h.big <= 6) out.push('губиться у великих матчах');
    if (h.inj >= 14) out.push('схильний до травм'); else if (h.inj <= 5) out.push('рідко травмується');
    if (h.pro >= 15) out.push('справжній професіонал'); else if (h.pro <= 6) out.push('не надто старанний на тренуваннях');
    if (h.ada >= 15) out.push('швидко освоює нові позиції');
    return out;
  }

  function playerExtras(p) {
    const blocks = [];
    const facts = [];
    if (p.traits && p.traits.length) facts.push(el('dt', 'Прийоми'), el('dd', p.traits.map((t) => FM.TRAITS[t]).join(', ')));
    if (known(p)) { const h = hiddenText(p); facts.push(el('dt', 'Характер'), el('dd', h.length ? h.join(', ') : 'нічим особливим не вирізняється')); }
    if (p.form && p.form.length) {
      const avg = p.form.reduce((a, b) => a + b, 0) / p.form.length;
      facts.push(el('dt', 'Форма'), el('dd', [el('b.rating' + (avg >= 7.3 ? '.hi' : avg < 6.2 ? '.lo' : ''), avg.toFixed(1).replace('.', ',')), ` (останні оцінки: ${p.form.map((x) => String(x).replace('.', ',')).join(' · ')})`]));
    }
    const learning = Object.entries(p.posExp || {}).filter(([, v]) => v > 0);
    if (learning.length) facts.push(el('dt', 'Освоює позиції'), el('dd', learning.map(([r, v]) => `${FM.roleLabel(r)} — ${Math.round(v)}%`).join(', ')));
    if (p.learned && p.learned.length) facts.push(el('dt', 'Освоїв'), el('dd', p.learned.map((r) => FM.roleLabel(r)).join(', ')));
    if (p.awards && p.awards.length) facts.push(el('dt', 'Нагороди'), el('dd', p.awards.join('; ')));
    if (facts.length) blocks.push(el('div.panel', [el('h3', 'Гравець'), el('dl.facts', facts)]));
    if (p.career && p.career.length) blocks.push(el('div.panel', [el('h3', 'Кар\u2019єра'), el('div.table-wrap.flat', el('table', [
      el('thead', el('tr', [el('th', 'Сезон'), el('th', 'Клуб'), el('th.num', 'Ігри'), el('th.num', 'Голи'), el('th.num', 'Передачі'), el('th.num', 'Оцінка')])),
      el('tbody', [...p.career].reverse().map(([y, c, g, gl, as, r]) => el('tr', [el('td', `${y}/${String(y + 1).slice(2)}`), el('td', c && W.club(c) ? clubName(W.club(c)) : '—'),
        el('td.num', g), el('td.num', gl), el('td.num', as), el('td.num', r ? (r / 10).toFixed(2).replace('.', ',') : '—')]))),
    ]))]));
    return blocks.length ? el('div.grid', blocks) : null;
  }

  // ---------------- Переговори про контракт (js/contracts.js) ----------------
  let neg = null; // { pid, kind: 'renew' | 'new', offer, rounds, max, msg, ok }
  /**
   * Панель пропозиції контракту. kind — 'renew' (продовження) або 'new' (новий гравець).
   * onAgree(offer) — що зробити, коли агент погодився (перевірки бюджету й підписання).
   */
  function contractPanel(p, kind, onAgree) {
    const S = state.season, me = W.club(state.clubId), now = S.year * 100 + S.week;
    if (!neg || neg.pid !== p.id || neg.kind !== kind) {
      const ag = FM.agents ? FM.agents.of(p) : { greed: 1 };
      neg = { pid: p.id, kind, offer: FM.contracts.draft(W, state, p, me.id, kind), rounds: 0, max: ag.greed > 1.2 ? 3 : 5, msg: 'Це перша пропозиція клубу — змініть умови й надішліть агентові.', ok: null };
    }
    if (p.negBlock && p.negBlock > now) return el('div.panel', [el('h3', 'Контракт'), el('p.msg-bad', `Агент не хоче розмовляти до тижня ${p.negBlock % 100 + 1}. Спробуйте пізніше.`)]);
    const o = neg.offer, exp = FM.contracts.expected(W, p, me.id), pref = FM.contracts.prefYears(W, p);
    const bill = FM.market.wageBill(W, me.id), wages = W.squad(me.id).map((x) => x.wage || 0).filter((x) => x > 0);
    const field = (id, label, input, help) => el('div.field.cf', [el('label', { for: id }, label), input, help ? el('small.muted', help) : null]);
    const num = (id, v, step, max) => el('input', { id, type: 'number', min: 0, max, step, value: v ?? 0, inputmode: 'decimal' });
    const sel = (id, v, opts) => el('select', { id }, opts.map(([k, l]) => el('option', { value: String(k), selected: String(v) === String(k) || null }, l)));
    const read = () => {
      const g = (id) => document.getElementById(id);
      const n = (id) => Math.max(0, Number(g(id).value) || 0);
      return { status: g('c-status').value, wage: Math.round(n('c-wage')), years: Number(g('c-years').value), signOn: n('c-sign'), loyalty: Math.round(n('c-loyal')), agent: kind === 'renew' ? 0 : n('c-agent'),
        bonus: { app: Math.round(n('c-app')), goal: Math.round(n('c-goal')), clean: Math.round(n('c-clean')), unused: Math.round(n('c-unused')) },
        clause: { rise: Number(g('c-rise').value), promo: Number(g('c-promo').value), releg: Number(g('c-releg').value), release: n('c-release'), ext: g('c-ext').checked } };
    };
    const propose = () => {
      neg.offer = read();
      const r = FM.contracts.evaluate(W, state, p, me.id, neg.offer, kind, neg);
      neg.msg = r.text; neg.ok = r.ok;
      if (r.walked) { p.negBlock = now + 3; neg = null; FM.market.news(state, `Агент ${nameOf(p)}: переговори припинено.`, 'transfers'); saveGame(); return render(); }
      if (r.ok) { const res = onAgree(neg.offer); if (res && res.msg) { neg.msg = res.msg; neg.ok = res.ok; } if (res && res.ok) neg = null; }
      saveGame(); render();
    };
    return el('div.panel.contract', [
      el('div.panel-head', [el('h3', kind === 'renew' ? 'Новий контракт' : 'Пропозиція контракту'), el('small.muted', `Раунд ${neg.rounds + 1} з ${neg.max}`)]),
      el('div.agent-say', [el('b', `Агент: ${FM.agents ? FM.agents.of(p).name : ''}`), el('p', neg.msg)]),
      el('div.cgrid', [
        el('div.cblock', [el('b', 'Основне'),
          field('c-status', 'Статус у складі', sel('c-status', o.status, FM.contracts.ORDER.map((k) => [k, FM.contracts.STATUS[k] + (k === exp ? ' — очікує' : '')])), 'Обіцяний статус: якщо гравець гратиме менше, ніж обіцяно, він засмутиться.'),
          field('c-wage', 'Зарплата, тис. € на тиждень', num('c-wage', o.wage, 1, 5000)),
          field('c-years', 'Тривалість', sel('c-years', o.years, [1, 2, 3, 4, 5].map((y) => [y, `${y} р. (до літа ${S.year + 1 + y})${y === pref ? ' — хоче' : ''}`]))),
          field('c-loyal', 'Бонус за лояльність, тис. € на рік', num('c-loyal', o.loyalty, 10, 50000)),
          field('c-sign', 'Підйомні, млн € (разово)', num('c-sign', o.signOn, 0.05, 100)),
          kind === 'renew' ? el('input', { id: 'c-agent', type: 'hidden', value: 0 }) : field('c-agent', 'Агентські, млн €', num('c-agent', o.agent, 0.05, 100), `Агент розраховує приблизно на ${M(FM.market.agentFee(0, o.wage, p))}.`)]),
        el('div.cblock', [el('b', 'Бонуси, тис. €'),
          field('c-app', 'За матч', num('c-app', o.bonus.app, 1, 1000)), field('c-goal', 'За гол', num('c-goal', o.bonus.goal, 1, 1000)),
          field('c-clean', 'За суху гру', num('c-clean', o.bonus.clean, 1, 1000)), field('c-unused', 'За невихід із запасу', num('c-unused', o.bonus.unused, 1, 1000))]),
        el('div.cblock', [el('b', 'Пункти'),
          field('c-rise', 'Щорічне підвищення', sel('c-rise', o.clause.rise, [[0, 'немає'], [5, '5%'], [10, '10%'], [15, '15%']])),
          field('c-promo', 'Підвищення при виході в лігу вище', sel('c-promo', o.clause.promo, [[0, 'немає'], [10, '10%'], [25, '25%'], [50, '50%']])),
          field('c-releg', 'Зниження при вильоті', sel('c-releg', o.clause.releg, [[0, 'немає'], [10, '10%'], [25, '25%'], [50, '50%']])),
          field('c-release', 'Мінімальні відступні, млн € (0 — без них)', num('c-release', o.clause.release, 0.5, 1000), 'Гравцеві подобається свобода: з відступними він просить менше.'),
          el('label.check', [el('input', { id: 'c-ext', type: 'checkbox', checked: o.clause.ext || null }), ' Опція клубу продовжити на рік'])]),
        el('div.cblock.cinfo', [el('b', 'Довідка'), el('dl.facts', [
          el('dt', 'Очікує статус'), el('dd', FM.contracts.STATUS[exp]),
          el('dt', 'Хоче контракт'), el('dd', `${pref} р.`),
          el('dt', 'Зараз отримує'), el('dd', p.wage ? `${p.wage} тис. €/тиж.` : '—'),
          el('dt', 'Найбільша зарплата в клубі'), el('dd', `${Math.max(0, ...wages)} тис. €/тиж.`),
          el('dt', 'Середня в клубі'), el('dd', `${wages.length ? Math.round(wages.reduce((a, b) => a + b, 0) / wages.length) : 0} тис. €/тиж.`),
          el('dt', 'Фонд зарплат'), el('dd', `${me.wageBudget} тис. €/тиж., витрачено ${bill}`),
          el('dt', 'Пакет коштує гравцеві'), el('dd', `≈ ${Math.round(FM.contracts.worth(W, p, o))} тис. €/тиж. разом з бонусами`),
        ])]),
      ]),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', onclick: propose }, 'Запропонувати'),
        el('button.btn', { type: 'button', title: 'Агент назве пакет, на який гравець погодиться', onclick: () => { neg.offer = FM.contracts.suggest(W, state, p, me.id, read(), kind); neg.msg = 'Агент: «Ось контракт, який нас влаштує». Можна надіслати або змінити.'; render(); } }, 'Умови агента'),
        el('button.btn', { type: 'button', onclick: () => { neg = null; render(); } }, 'Скинути'),
        el('button.btn.link', { type: 'button', onclick: () => { neg = null; deal = null; render(); } }, 'Припинити переговори'),
      ]),
      neg.ok === false && neg.rounds ? el('p.muted', 'Зарплату можна «добрати» підйомними, бонусами, щорічним підвищенням або вищим статусом.') : null,
    ]);
  }

  // ---------------- Трансфери: панелі в картці гравця ----------------
  let deal = null; // поточні перемовини: { pid, stage: 'club' | 'player', fee, msg, ok }
  let renewMsg = null, confirmRelease = null, loanShow = null;
  const M = (v) => FM.market.fmtM(v);
  const numField = (id, label, value, step, min, max) => el('div.field', [el('label', { for: id }, label),
    el('input', { id, type: 'number', value, step, min, max, inputmode: 'decimal' })]);

  function shortlistBtn(p) {
    const on = (state.shortlist || []).includes(p.id);
    return el('button.btn', { type: 'button', 'aria-pressed': String(on), onclick: (e) => {
      if (e && e.stopPropagation) e.stopPropagation(); // у рядку таблиці — не відкривати картку
      state.shortlist = on ? state.shortlist.filter((x) => x !== p.id) : (state.shortlist || []).concat([p.id]);
      saveGame(); render();
    } }, on ? '★ У шортлисті' : '☆ До шортлиста');
  }

  /** Звіт скаута: оцінка A–D порівняно з вашими гравцями на позиції, рекомендація, сильні й слабкі сторони. */
  function scoutPanel(p) {
    const r = FM.deals.report(W, state, p, { ca: seenCA(p), pa: seenPA(p), known: known(p) });
    return el('div.panel.scout-rep', [el('div.panel-head', [el('h3', 'Звіт скаута'), el('span.grade.g-' + r.grade, { title: r.text }, r.grade)]),
      el('p', [el('b', r.text), r.sure ? '' : el('span.muted', ' · оцінка приблизна: гравця не розвідано')]),
      el('div.grid', [
        el('div', [el('small.muted', 'Сильні сторони'), r.pros.length ? el('ul.plain', r.pros.map((t) => el('li', '+ ' + t))) : el('p.muted', 'Нічого видатного.')]),
        el('div', [el('small.muted', 'Слабкі сторони'), r.cons.length ? el('ul.plain', r.cons.map((t) => el('li', '− ' + t))) : el('p.muted', 'Явних слабкостей немає.')]),
      ]),
      r.notes.length ? el('p.muted', r.notes.join(' · ')) : null]);
  }

  function transferPanel(p) {
    const S = state.season, me = W.club(state.clubId);
    if (!deal || deal.pid !== p.id) deal = { pid: p.id, stage: p.club ? 'club' : 'player', fee: p.club ? FM.market.askingPrice(W, p, S) : 0, msg: null };
    if (p.virtual) return el('div.panel', [el('h3', 'Трансфер'), el('p.muted', 'Цей гравець згенерований для збірної й грає в лізі поза грою — купити його не можна.')]);
    const open = FM.market.windowOpen(S) || !p.club;
    const scouting = (state.scouting || []).includes(p.id);
    const cap = 2 + FM.market.scouts(state).length;
    const blocks = [el('div.panel-head', [el('h3', p.club ? 'Трансфер' : 'Підписати вільного агента'), shortlistBtn(p)])];
    blocks.push(el('p.muted', `Ваш баланс: ${M(me.balance)}. ` + (p.club ? `Клуб орієнтовно хоче ${M(FM.market.askingPrice(W, p, S))}.` : 'Вільного агента можна підписати будь-коли, без відступних.')
      + (p.clause ? ` У контракті — відступні ${M(p.clause)}: за таку суму клуб не може відмовити.` : '') + (p.loan ? ' Гравець зараз в оренді.' : '')));
    if (!known(p)) blocks.push(el('div.actions', [el('button.btn', { type: 'button', disabled: scouting || (state.scouting || []).length >= cap || null, onclick: () => {
      state.scouting = (state.scouting || []).concat([p.id]); saveGame(); render();
    } }, scouting ? 'Скаут уже працює — звіт за тиждень' : (state.scouting || []).length >= cap ? `Скаути зайняті (${cap} на тиждень)` : 'Відправити скаута')]));
    if (!open && p.club && !p.loan && (deal.stage === 'club' || (deal.ex && deal.ex.later))) blocks.push(el('p.muted', 'Трансферне вікно закрите, але можна домовитися про перехід наприкінці сезону — гравець приєднається з початком нового сезону.'));
    else if (!open) {
      const nw = FM.market.nextWindow(S);
      blocks.push(el('p', `Трансферне вікно закрите. ${nw != null ? `Відкриється на ${nw + 1}-му тижні (${fmt.date(FM.season.dateOf(nw, S))}).` : 'Наступне — влітку, на початку нового сезону.'}`));
      return el('div.panel', blocks);
    }
    if (p.loan) return el('div.panel', blocks);
    if (deal.msg) blocks.push(el('p.' + (deal.ok ? 'msg-ok' : 'msg-bad'), deal.msg));
    const rv = FM.market.rival(W, state, p);
    if (rv) blocks.push(el('p.rival', `Гравцем також цікавиться ${clubName(W.club(rv.club))}.`));
    if (deal.stage === 'club') {
      const mine = W.squad(me.id).filter((x) => !x.loan);
      if (p.club) blocks.push(el('div.seller-info', [el('dl.facts', [
        el('dt', 'Статус у клубі'), el('dd', FM.tcentre.statusAt(W, p)),
        el('dt', 'Клуб шукає'), el('dd', FM.tcentre.needs(W, p.club).map((r) => FM.ROLE_NAME[r].toLowerCase()).join(', ')),
        el('dt', 'Ринкова вартість'), el('dd', M(p.value)),
        ...(deal.ex ? [el('dt', 'Потенційна сума'), el('dd', M(FM.tcentre.potential(deal.fee, { ...deal.ex, appsBonus: deal.bonus })))] : []),
      ]), el('small.muted', 'Клуб охочіше погодиться, якщо запропонувати гравця на позицію, яку він шукає.')]));
      blocks.push(el('div.pre-row', [numField('bid-fee', 'Гроші, млн €', deal.fee, 0.05, 0, 400),
        el('div.field', [el('label', { for: 'bid-swap' }, 'Гравець в обмін'), el('select', { id: 'bid-swap' }, [el('option', { value: '' }, 'Без обміну'),
          ...mine.sort((a, b) => b.value - a.value).map((x) => el('option', { value: x.id, selected: deal.swap === x.id || null }, `${nameOf(x)} · ${M(x.value)}`))])]),
        el('div.field', [el('label', { for: 'bid-date' }, 'Дата переходу'), el('select', { id: 'bid-date' }, [...(open ? [['now', 'Одразу']] : []), ['later', 'Наприкінці сезону']].map(([v, l]) => el('option', { value: v, selected: (deal.ex && deal.ex.later ? 'later' : 'now') === v || null }, l)))]),
        el('div.field', [el('label', { for: 'bid-sellon' }, '% з наступного продажу'), el('select', { id: 'bid-sellon' }, FM.tcentre.SELL_ON.map((v) => el('option', { value: v, selected: ((deal.ex && deal.ex.sellOn) || 0) === v || null }, v ? `${v}%` : 'немає')))]),
        el('div.field', [el('label', { for: 'bid-goals' }, 'Бонус за голи'), el('select', { id: 'bid-goals' }, FM.tcentre.GOALS.map(([v, l]) => el('option', { value: v, selected: ((deal.ex && deal.ex.goals) || 0) === v || null }, v ? `${l} (+20% суми)` : l)))]),
        W.league(me.league).tier === 2 ? el('label.check', [el('input', { id: 'bid-promo', type: 'checkbox', checked: (deal.ex && deal.ex.promoFee) || null }), ' Бонус після виходу у вищу лігу (+15% суми)']) : null,
        el('label.check', [el('input', { id: 'bid-loanback', type: 'checkbox', checked: (deal.ex && deal.ex.loanBack) || null }), ' Оренда назад до кінця сезону']),
        el('label.check', [el('input', { id: 'bid-fixed', type: 'checkbox', checked: deal.fixed || null }), ' Без торгу (лише «так» або «ні»)']),
        el('div.field', [el('label', { for: 'bid-inst' }, 'Оплата'), el('select', { id: 'bid-inst' }, FM.deals.INSTALMENTS.map(([v, l]) => el('option', { value: v, selected: (deal.inst || 0) === v || null }, l)))]),
        el('div.field', [el('label', { for: 'bid-apps' }, 'Бонус продавцю'), el('select', { id: 'bid-apps' }, FM.deals.APPS_BONUS.map(([v, l]) => el('option', { value: v, selected: (deal.apps || 0) === v || null }, v ? `${l} (+15% суми)` : l)))]),
        el('button.btn.primary', { type: 'button', onclick: () => {
          const fee = Math.max(0, Number(document.getElementById('bid-fee').value) || 0);
          const swap = document.getElementById('bid-swap').value || null;
          const g = (id) => document.getElementById(id);
          const goals = Number(g('bid-goals').value) || 0;
          const ex = { sellOn: Number(g('bid-sellon').value) || 0, goals, goalsFee: goals ? Math.round(fee * 0.2 * 20) / 20 : 0, promoFee: g('bid-promo') && g('bid-promo').checked ? Math.round(fee * 0.15 * 20) / 20 : 0,
            loanBack: g('bid-loanback').checked, later: g('bid-date').value === 'later' };
          deal.ex = ex; deal.fixed = g('bid-fixed').checked;
          const sellOn = false;
          const inst = Number(document.getElementById('bid-inst').value) || 0, apps = Number(document.getElementById('bid-apps').value) || 0;
          const bonus = apps ? Math.round(fee * 0.15 * 20) / 20 : 0;
          if (!FM.budget.canSpend(W, state, fee)) { deal.msg = `Не вистачає трансферного бюджету: ${M(FM.budget.available(W, state))}. Перекиньте гроші із зарплатного бюджету («Правління» → «Бюджети») або продайте когось.`; deal.ok = false; return render(); }
          if (FM.deals.upfront(fee, inst) > me.balance) { deal.msg = `Не вистачає грошей: баланс ${M(me.balance)}${inst ? `, одразу треба ${M(FM.deals.upfront(fee, inst))}` : ''}.`; deal.ok = false; return render(); }
          if (buyBlocked()) { deal.msg = buyBlocked(); deal.ok = false; return render(); }
          const swapVal = swap ? W.player(swap).value * 0.85 : 0; // гравець в обмін рахується як 85% його ціни
          const r0 = FM.market.clubResponse(W, p, FM.deals.offerValue(fee, { inst, apps, bonus }) + swapVal + FM.tcentre.extrasValue(fee, ex), me.id, S, { sellOn });
          const r = deal.fixed && !r0.ok ? { ...r0, counter: null, reason: `${clubName(W.club(p.club))} відхиляє пропозицію.` } : r0; // без торгу — без зустрічної ціни
          deal.swap = swap; deal.sellOn = sellOn; deal.inst = inst; deal.apps = apps; deal.bonus = bonus;
          if (r.ok) { deal.terms = [inst ? `розстрочка: одразу ${M(FM.deals.upfront(fee, inst))}` : '', apps ? `бонус ${M(bonus)} після ${apps} матчів` : '', ex.goals ? `${M(ex.goalsFee)} після ${ex.goals} голів` : '', ex.promoFee ? `${M(ex.promoFee)} за вихід у вищу лігу` : '', ex.sellOn ? `${ex.sellOn}% з наступного продажу` : '', ex.loanBack ? 'оренда назад до кінця сезону' : '', ex.later ? 'перехід наприкінці сезону' : ''].filter(Boolean).join(', '); deal.stage = 'player'; deal.fee = fee; deal.msg = `${clubName(W.club(p.club))} погоджується${r.clause ? ' (відступні)' : ''}: ${M(fee)}${swap ? ` + ${nameOf(W.player(swap))}` : ''}${sellOn ? ', 15% з наступного продажу' : ''}${deal.terms ? '; ' + deal.terms : ''}. Тепер — контракт із гравцем.`; deal.ok = true; }
          else { deal.fee = r.counter ? Math.max(0, Math.round((r.counter - swapVal) * 20) / 20) : fee; deal.msg = r.reason; deal.ok = false; }
          render();
        } }, 'Запропонувати')]));
      if (FM.market.loanable(W, p)) blocks.push(el('div.loan-box', [el('b', 'Або взяти в оренду до кінця сезону'),
        el('p.muted', `Клуб хоче ${M(FM.market.loanFee(p))} за оренду. Ви платите частину зарплати (${p.wage} тис. €/тиж.).`),
        el('div.pre-row', [el('div.field', [el('label', { for: 'loan-share' }, 'Ваша частка зарплати'), el('select', { id: 'loan-share' }, [0.5, 0.75, 1].map((x) => el('option', { value: x, selected: x === 0.75 || null }, Math.round(x * 100) + '%')))]),
          el('label.check', [el('input', { id: 'loan-opt', type: 'checkbox' }), ` Опція викупу за ${M(FM.deals.optionPrice(W, p, S))} (оренда +25%)`]),
          el('button.btn', { type: 'button', onclick: () => {
            const share = Number(document.getElementById('loan-share').value);
            const opt = document.getElementById('loan-opt').checked;
            const gap = W.clubLevel(p.club) - W.clubLevel(me.id);
            if (gap > 15 + 10 * share) { deal.msg = 'Клуб не хоче віддавати гравця в настільки слабкий клуб.'; deal.ok = false; return render(); }
            if (FM.market.loanFee(p) > me.balance || !FM.budget.canSpend(W, state, FM.market.loanFee(p) * (document.getElementById('loan-opt').checked ? 1.25 : 1))) { deal.msg = `Не вистачає грошей на оренду (трансферний бюджет ${M(FM.budget.available(W, state))}).`; deal.ok = false; return render(); }
            if (buyBlocked()) { deal.msg = buyBlocked(); deal.ok = false; return render(); }
            if (share < 0.75 && W.clubLevel(p.club) > W.clubLevel(me.id)) { deal.msg = 'Сильніший клуб хоче, щоб ви платили щонайменше 75% зарплати.'; deal.ok = false; return render(); }
            const owner = p.club, extraFee = opt ? Math.round(FM.market.loanFee(p) * 0.25 * 100) / 100 : 0;
            FM.market.loanIn(W, state, p, me.id, share);
            if (opt) { p.loan.option = FM.deals.optionPrice(W, p, S); me.balance = Math.round((me.balance - extraFee) * 100) / 100; FM.budget.spend(W, state, extraFee); W.club(owner).balance = Math.round((W.club(owner).balance + extraFee) * 100) / 100; }
            FM.market.news(state, `${nameOf(p)} — в оренді у вас до кінця сезону${opt ? `, з опцією викупу за ${M(p.loan.option)}` : ''}.`);
            state.known = state.known || {}; state.known[p.id] = true;
            deal = null; saveGame(); render();
          } }, 'Взяти в оренду')])]));
    } else {
      const raw = FM.market.wageDemand(W, p, me.id);
      if (raw == null) { blocks.push(el('p.msg-bad', 'Гравець не хоче переходити в значно слабший клуб.')); return el('div.panel', blocks); }
      if (rv) blocks.push(el('p.msg-bad', `${clubName(W.club(rv.club))} теж хоче підписати гравця й пропонує ${rv.wage} тис. € на тиждень.`));
      blocks.push(contractPanel(p, 'new', (offer) => {
        const wage = offer.wage, years = offer.years, clause = offer.clause.release || 0;
        if (rv) { const score = (w, clubId) => w * (1 + (W.clubLevel(clubId) - 100) * 0.006); if (score(FM.contracts.worth(W, p, offer), me.id) < score(rv.wage, rv.club)) return { ok: false, msg: `Гравець обирає ${clubName(W.club(rv.club))}: там пропонують ${rv.wage} тис. € на тиждень. Додайте до пакета.` }; }
        const ag = offer.agent || 0;
        if (!FM.budget.canSpend(W, state, deal.fee + ag + (offer.signOn || 0))) return { ok: false, msg: `Не вистачає трансферного бюджету: ${M(FM.budget.available(W, state))}, а з агентськими й підйомними треба ${M(deal.fee + ag + (offer.signOn || 0))}.` };
        if (FM.deals.upfront(deal.fee, deal.inst) + ag + (offer.signOn || 0) > me.balance) return { ok: false, msg: `Не вистачає грошей: баланс ${M(me.balance)}.` };
        const bill = FM.market.wageBill(W, me.id) - (deal.swap ? W.player(deal.swap).wage || 0 : 0);
        if (bill + wage > me.wageBudget) return { ok: false, msg: `Правління не погоджує: фонд зарплат ${me.wageBudget} тис. €/тиж., уже витрачено ${bill}. Продайте когось або запропонуйте менше.` };
        const from = p.club ? clubName(W.club(p.club)) : null;
        const ex = deal.ex || {};
        if (ex.later && p.club) { // перехід наприкінці сезону: гроші й підписання — з початком нового сезону
          FM.tcentre.addFuture(state, { pid: p.id, from: p.club, fee: deal.fee, inst: deal.inst, apps: deal.apps, bonus: deal.bonus, swap: deal.swap, ex, offer });
          FM.market.news(state, `Домовилися: ${nameOf(p)} перейде з ${from} наприкінці сезону за ${M(deal.fee)}. Контракт — ${wage} тис. € на тиждень.`, 'transfers');
          deal = null; saveGame();
          return { ok: true };
        }
        const now = FM.deals.upfront(deal.fee, deal.inst), fromId = p.club;
        state.board.fin.transfers = Math.round((state.board.fin.transfers - now - ag) * 100) / 100;
        FM.market.complete(W, state, p, me.id, now, wage, years, { agent: ag, sellOn: (ex.sellOn || 0) / 100, clause: clause || null, goalBonus: offer.bonus.goal || null, swap: deal.swap });
        FM.contracts.apply(W, state, p, offer, me.id);
        FM.deals.register(state, p, fromId, deal.fee, { inst: deal.inst, apps: deal.apps, bonus: deal.bonus });
        FM.tcentre.registerExtras(state, p, fromId, ex);
        if (ex.loanBack && fromId && W.club(fromId)) { FM.market.loanIn(W, state, p, fromId, 1, { free: true }); FM.market.news(state, `${nameOf(p)} лишається в ${from} в оренді до кінця сезону.`, 'transfers'); }
        if (deal.fee - now > 0) FM.budget.spend(W, state, deal.fee - now); // розстрочка: бюджет рахує всю суму одразу
        state.known = state.known || {}; state.known[p.id] = true;
        FM.market.news(state, `Ви підписали ${nameOf(p)}${from ? ` (${from}, ${M(deal.fee)}${deal.swap ? ' + обмін' : ''})` : ' (вільний агент)'}: ${wage} тис. € на тиждень до літа ${p.contract}, статус — ${FM.contracts.STATUS[offer.status].toLowerCase()}.`);
        deal = null; saveGame();
        return { ok: true };
      }));
    }
    return el('div.panel', blocks);
  }

  function myPlayerPanel(p) {
    const S = state.season;
    const yearsLeft = (p.contract || S.year + 2) - S.year - 1;
    if (p.loan && p.loan.to === state.clubId) {
      return el('div.panel', [el('h3', 'Оренда'), el('p', `В оренді з клубу ${clubName(W.club(p.loan.from))} до кінця сезону. Ви платите ${Math.round(p.loan.share * 100)}% зарплати (${Math.round(p.wage * p.loan.share)} тис. €/тиж.).`),
        p.loan.option ? el('div.actions', [el('button.btn.primary', { type: 'button', onclick: () => { const r = FM.deals.exercise(W, state, p); renewMsg = r.text; if (r.ok) FM.market.news(state, r.text, 'transfers'); saveGame(); render(); } }, `Викупити за ${M(p.loan.option)}`)]) : null,
        renewMsg ? el('p.muted', renewMsg) : null]);
    }
    const blocks = [el('h3', 'Контракт і трансфер'),
      el('p', `Контракт до літа ${p.contract} (${yearsLeft <= 0 ? 'закінчується цього сезону' : `ще ${yearsLeft} р. після цього сезону`}), ${p.wage} тис. € на тиждень.`
        + (p.clause ? ` Відступні: ${M(p.clause)}.` : '') + (p.goalBonus ? ` Бонус за гол: ${p.goalBonus} тис. €.` : '') + (p.sellOn ? ` ${Math.round(p.sellOn.pct * 100)}% з наступного продажу отримає ${clubName(W.club(p.sellOn.club))}.` : ''))];
    if (renewMsg && renewMsg.pid === p.id) blocks.push(el('p.' + (renewMsg.ok ? 'msg-ok' : 'msg-bad'), renewMsg.text));
    blocks.push(el('p.muted', `Статус у складі: ${FM.morale.STATUS[FM.morale.status(W, p)]}${p.bonus ? ` · бонуси: ${[p.bonus.app ? `${p.bonus.app} за матч` : '', p.bonus.goal ? `${p.bonus.goal} за гол` : '', p.bonus.clean ? `${p.bonus.clean} за суху гру` : ''].filter(Boolean).join(', ')} тис. €` : ''}${p.loyalty ? ` · лояльність ${p.loyalty} тис. €/рік` : ''}${p.clauseSet && p.clauseSet.rise ? ` · щорічне підвищення ${p.clauseSet.rise}%` : ''}.`));
    if (p.clauseSet && p.clauseSet.ext && yearsLeft <= 1) blocks.push(el('div.actions', [el('button.btn', { type: 'button', onclick: () => { const r = FM.contracts.exerciseExt(W, state, p); renewMsg = { pid: p.id, ok: r.ok, text: r.text }; saveGame(); render(); } }, 'Скористатися опцією продовження')]));
    blocks.push(contractPanel(p, 'renew', (offer) => {
      const me = W.club(state.clubId), bill = FM.market.wageBill(W, me.id);
      if (bill - (p.wage || 0) + offer.wage > me.wageBudget) return { ok: false, msg: `Правління не погоджує: перевищено фонд зарплат (${me.wageBudget} тис. €/тиж.). Перекиньте гроші в «Клуб → Бюджети» або запропонуйте менше.` };
      FM.contracts.apply(W, state, p, offer, me.id);
      renewMsg = { pid: p.id, ok: true, text: `Контракт підписано: до літа ${p.contract}, ${p.wage} тис. € на тиждень, статус — ${FM.contracts.STATUS[offer.status].toLowerCase()}.` };
      FM.market.news(state, `${nameOf(p)} підписав новий контракт до літа ${p.contract}.`, 'players');
      return { ok: true };
    }));
    if (FM.market.windowOpen(S)) {
      if (loanShow === p.id) {
        const offers = FM.market.loanOffers(W, state, p);
        blocks.push(el('div.loan-box', [el('b', 'Хто хоче взяти в оренду'), offers.length ? el('ul.plist', offers.map((o) => el('li', [
          el('span', `${clubName(W.club(o.club))} · платить ${Math.round(o.share * 100)}% зарплати`),
          el('button.btn', { type: 'button', onclick: () => { FM.market.loanIn(W, state, p, o.club, o.share); FM.market.news(state, `${nameOf(p)} іде в оренду до ${clubName(W.club(o.club))} до кінця сезону.`); loanShow = null; saveGame(); go('squad'); } }, 'Віддати')]))) : el('p.muted', 'Охочих немає.')]));
      }
    }
    blocks.push(el('div.actions', [
      FM.market.windowOpen(S) ? el('button.btn', { type: 'button', onclick: () => { loanShow = loanShow === p.id ? null : p.id; render(); } }, 'Віддати в оренду') : null,
      el('button.btn', { type: 'button', onclick: () => { if (p.listed) delete p.listed; else p.listed = true; saveGame(); render(); } }, p.listed ? 'Зняти з трансферу' : 'Виставити на трансфер'),
      confirmRelease === p.id
        ? el('span.confirm-inline', [`Розірвати контракт? Компенсація ${M(FM.market.releaseCost(p, S))}. `,
          el('button.btn', { type: 'button', onclick: () => { FM.market.release(W, state, p); FM.market.news(state, `Контракт із ${nameOf(p)} розірвано.`); confirmRelease = null; saveGame(); go('squad'); } }, 'Так'),
          el('button.btn', { type: 'button', onclick: () => { confirmRelease = null; render(); } }, 'Ні')])
        : el('button.btn', { type: 'button', onclick: () => { confirmRelease = p.id; render(); } }, 'Розірвати контракт'),
    ]));
    blocks.push(el('p.note', 'Гравцям у трансфер-листі частіше надходять пропозиції, але дешевші. Контракт, що закінчується, треба продовжити до кінця сезону — інакше гравець піде безкоштовно.'));
    return el('div.panel', blocks);
  }

  // ---------------- Правління ----------------
  function confBar(v) {
    return el('div.confbar', { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v), 'aria-label': 'Довіра правління' },
      el('i', { style: { width: v + '%' }, class: v < 30 ? 'low' : v < 55 ? 'mid' : 'high' }));
  }
  // ---------------- Співбесіда (як у FM): відповіді задають ціль і обіцянки ----------------
  let interview = null;
  function startInterview(id, done) { interview = { id, done, a: {} }; go('interview'); }
  function screenInterview() {
    if (!interview) return screenOverview();
    const c = W.club(interview.id), iv = interview;
    const t = FM.board.target(W, c.id);
    const ready = FM.boardroom.INTERVIEW.every((q) => iv.a[q.k]);
    return [
      el('header', [el('div', { style: { display: 'flex', gap: '0.9rem', alignItems: 'center' } }, [badge(c, true), el('div', [el('h1', `Співбесіда: ${clubName(c)}`), el('div.muted', `${W.league(c.league).name} · правління чекає: ${FM.board.TARGETS[t.kind].label.toLowerCase()}`)])])]),
      ...FM.boardroom.INTERVIEW.map((q) => el('div.panel', [el('h3', q.q), el('ul.plist.iv', q.a.map(([k, text, eff]) => el('li', [
        el('label.check', [el('input', { type: 'radio', name: 'iv-' + q.k, checked: iv.a[q.k] === k || null, onchange: () => { iv.a[q.k] = k; render(); } }), ' ', el('b', text)]),
        el('small.muted', eff)])))])),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', disabled: !ready || null, onclick: () => {
          interview = null; iv.done();
          const notes = FM.boardroom.applyInterview(W, state, iv.a);
          FM.market.news(state, `Співбесіда в ${clubName(c)} пройшла успішно. ${notes.join(' ')}`, 'club');
          saveGame();
        } }, 'Підписати контракт'),
        el('button.btn', { type: 'button', onclick: () => { interview = null; history.back(); } }, 'Відмовитися'),
      ]),
    ];
  }

  function offerList(ids, onTake) {
    return el('ul.plist', ids.map((id) => {
      const c = W.club(id);
      return el('li', [el('span.club-cell', [badge(c), el('span', [clubName(c), el('small.muted', ` ${W.league(c.league).name}`)])]),
        el('span', [starsEl(W.clubLevel(id), 'Рівень клубу'), ' ', el('button.btn', { type: 'button', onclick: () => startInterview(id, () => onTake(id)) }, 'На співбесіду')])]);
    }));
  }
  /** Поради штабу: щотижнева нарада, кожну пораду можна прийняти або відхилити. */
  let brMsg = null;
  function backroomCard() {
    const items = FM.backroom.advice(W, state, nameOf);
    if (brMsg && brMsg.w !== state.season.week) brMsg = null;
    if (!items.length && !brMsg) return null;
    return el('div.panel.backroom', [el('h3', 'Поради штабу'),
      items.length ? el('ul.plist', items.map((it) => el('li.br-item', [
        el('div', [el('small.muted', `${it.who}, ${it.role}`), el('p', it.text)]),
        el('span.offer-btns', [
          el('button.btn.primary', { type: 'button', onclick: () => { const r = FM.backroom.accept(W, state, it.id, nameOf); brMsg = r && r.text ? { w: state.season.week, text: r.text } : null; if (r && r.text) FM.market.news(state, r.text, 'club'); saveGame(); if (r && r.go) go(r.go); else render(); } },
            it.act.kind === 'renew' || it.act.kind === 'player' ? 'До гравця' : 'Погодитися'),
          el('button.btn', { type: 'button', onclick: () => { FM.backroom.dismiss(state, it.id); saveGame(); render(); } }, 'Ні'),
        ]),
      ]))) : null,
      brMsg ? el('p.msg-ok', brMsg.text) : null]);
  }

  /** Нарада з правлінням про очікування на сезон (до першого матчу ліги). */
  function expectCard() {
    if (!FM.boardroom.expectOpen(W, state)) return null;
    const opts = FM.boardroom.expectOptions(W, state);
    const TITLE = { up: 'Амбітніше', board: 'Пропозиція правління', down: 'Скромніше' };
    return el('div.panel.expect-card', [el('h3', 'Очікування на сезон: нарада з правлінням'),
      el('p.muted', 'Оберіть ціль на сезон. Від неї залежать бюджети; виконання цілі правління оцінить наприкінці сезону.'),
      el('div.expect-opts', opts.map((o) => el('div.expect-opt' + (o.k === 'board' ? '.rec' : ''), [
        el('small.muted', TITLE[o.k]), el('b', FM.board.TARGETS[o.target.kind].label),
        el('dl.facts', [el('dt', 'Трансферний бюджет'), el('dd', M(o.transfer)), el('dt', 'Фонд зарплат'), el('dd', `${o.wage} тис. €/тиж.`)]),
        el('small.muted', o.note),
        el('button.btn' + (o.k === 'board' ? '.primary' : ''), { type: 'button', onclick: () => { const r = FM.boardroom.setExpect(W, state, o.k); FM.market.news(state, r.text, 'club'); saveGame(); render(); } }, 'Погодитися'),
      ]))),
    ]);
  }

  function screenBoard() {
    const b = state.board, me = W.club(state.clubId), S = state.season;
    const { pos } = FM.board.position(W, S, state.clubId);
    const f = b.fin;
    const conf = b.conf;
    const mood = conf >= 75 ? 'Правління задоволене вашою роботою.' : conf >= 50 ? 'Правління спокійне.' : conf >= 30 ? 'Правління занепокоєне.' : 'Правління на межі: ще кілька поразок — і вас звільнять.';
    const offers = state.jobOffers || [];
    return [
      el('header', [el('h1', 'Правління'), el('span.muted', `${state.manager} · репутація ${b.rep} з 100`)]),
      expectCard(),
      el('div.grid', [
        el('div.panel', [el('h3', 'Очікування на сезон'),
          el('p.big', FM.board.TARGETS[b.target.kind].label),
          el('p.muted', `Потрібно не нижче ${b.target.pos}-го місця. Зараз: ${S.fixtures.some((x) => x.s) ? pos + '-е' : 'сезон не почався'}. За складом клуб ${b.target.rank}-й у лізі.`),
          el('h3', { style: { marginTop: '1rem' } }, `Довіра: ${Math.round(conf)} з 100`), confBar(conf), el('p', mood),
          b.last ? el('p.note', `Минулий сезон: ${b.last.pos}-е місце. ${b.last.verdict}`) : null]),
        el('div.panel', [el('h3', `Фінанси сезону ${seasonLabel()}`), el('dl.facts', [
          el('dt', 'Баланс'), el('dd', FM.market.fmtM(me.balance)),
          el('dt', 'Телеправа й спонсори'), el('dd', '+' + FM.market.fmtM(f.tv)),
          el('dt', 'Квитки'), el('dd', '+' + FM.market.fmtM(f.tickets)),
          el('dt', 'Призові'), el('dd', f.prize ? '+' + FM.market.fmtM(f.prize) : 'наприкінці сезону'),
          el('dt', 'Спонсор'), el('dd', f.sponsor ? '+' + FM.market.fmtM(f.sponsor) : '—'),
          el('dt', 'Атрибутика'), el('dd', f.merch ? '+' + FM.market.fmtM(f.merch) : '—'),
          el('dt', 'Зарплати'), el('dd', '−' + FM.market.fmtM(f.wages)),
          el('dt', 'Трансфери'), el('dd', f.transfers ? (f.transfers > 0 ? '+' : '−') + FM.market.fmtM(Math.abs(f.transfers)) : '—'),
          el('dt', 'Фонд зарплат'), el('dd', `${FM.market.wageBill(W, me.id)} з ${me.wageBudget} тис. € на тиждень`),
          ...(FM.deals.debt(state) ? [el('dt', 'Борг за розстрочкою'), el('dd', FM.market.fmtM(FM.deals.debt(state)))] : []),
        ]), el('p.note', 'Дохід клубу розрахований так, щоб за стартових зарплат сезон був трохи в плюсі. Дорогі контракти з’їдають прибуток; від’ємний баланс знижує довіру.')]),
      ]),
      budgetPanel(),
      sponsorPanel(),
      requestsPanel(),
      affiliatePanel(),
      visionPanel(),
      (() => {
        const maxLvl = Math.min(60 + b.rep * 1.05, FM.career.maxLevel(state));
        const vac = [...W.clubs.values()].filter((c) => c.vacancy && c.vacancy.year === S.year && c.id !== state.clubId && W.clubLevel(c.id) <= maxLvl && S.week - c.vacancy.week <= 3);
        return vac.length ? el('div.panel', [el('h3', 'Вакансії'), el('p.muted', 'Ці клуби щойно звільнили тренерів і готові говорити з вами.'),
          offerList(vac.map((c) => c.id), (id) => { FM.board.takeJob(W, state, id); FM.club.init(W, state); delete W.club(id).vacancy; state.staff = null; FM.club.initStaff(W, state); pre = null; tableLeague = null; saveGame(); go('overview'); })]) : null;
      })(),
      offers.length ? el('div.panel', [el('h3', 'Пропозиції роботи'), el('p.muted', 'Вами цікавляться клуби. Перехід — одразу, з поточного тижня.'),
        offerList(offers, (id) => { FM.board.takeJob(W, state, id); state.jobOffers = []; pre = null; tableLeague = null; saveGame(); go('overview'); })]) : null,
    ];
  }

  let budMsg = null;
  /** Бюджети: трансферний і зарплатний, перекидання між ними, кредит, прогноз, права на назву стадіону. */
  function budgetPanel() {
    const me = W.club(state.clubId), b = FM.budget.get(W, state), bill = FM.market.wageBill(W, me.id);
    const room = Math.max(0, me.wageBudget - bill); // вільне в зарплатному
    const minM = -FM.budget.toMln(room), maxM = Math.round(b.transfer * 100) / 100;
    let v = 0;
    const out = el('p.muted.bud-preview', 'Посуньте повзунок: вліво — у трансфери, вправо — у зарплати.');
    const slider = el('input', { type: 'range', min: String(Math.min(0, minM)), max: String(Math.max(0, maxM)), step: '0.05', value: '0', 'aria-label': 'Перекинути між бюджетами', oninput: (e) => {
      v = Number(e.target.value);
      out.textContent = !v ? 'Без змін.' : v > 0 ? `${M(v)} з трансферного → +${FM.budget.toWeekly(v)} тис. €/тиж. у зарплатний (трансфери: ${M(b.transfer - v)}, зарплати: ${me.wageBudget + FM.budget.toWeekly(v)} тис.)`
        : `${-FM.budget.toWeekly(v)} тис. €/тиж. із зарплатного → +${M(-v)} у трансферний (трансфери: ${M(b.transfer - v)}, зарплати: ${me.wageBudget + FM.budget.toWeekly(v)} тис.)`;
    } });
    const fc = FM.budget.forecast(W, state), L = state.loan && state.loan.left > 0 ? state.loan : null;
    let loanAmt = Math.round(FM.budget.loanMax(W, state) * 100) / 100;
    return el('div.panel.budget', [el('h3', 'Бюджети'),
      el('div.grid', [
        el('div', [el('small.muted', 'Трансферний бюджет'), el('p.big', M(FM.budget.available(W, state))), el('small.muted', `на старті ${M(b.start)} · витрачено ${M(b.spent)} · з продажів +${M(b.earned)} (75% виручки)`)]),
        el('div', [el('small.muted', 'Зарплатний бюджет'), el('p.big', `${me.wageBudget} тис. €/тиж.`), el('small.muted', `зайнято ${bill} · вільно ${room} тис. €/тиж.`)]),
      ]),
      el('div.field.bud-move', [el('b', 'Перекинути гроші між бюджетами'), el('div.bud-slider', [el('small', 'У трансфери'), slider, el('small', 'У зарплати')]), out,
        el('button.btn', { type: 'button', onclick: () => { if (!v) return; const r = FM.budget.move(W, state, v); budMsg = r.text; if (r.ok) FM.market.news(state, r.text, 'club'); saveGame(); render(); } }, 'Застосувати')]),
      el('p.note', '1 млн € трансферного бюджету = 19 тис. € на тиждень зарплат (річна сума). Більший зарплатний бюджет — можна платити більше новим гравцям; більший трансферний — купувати дорожчих.'),
      budMsg ? el('p.msg-ok', budMsg) : null,
      el('dl.facts', [
        el('dt', 'Прогноз на кінець сезону'), el('dd', `${M(fc.end)} (${fc.weekly >= 0 ? '+' : ''}${M(fc.weekly)} на тиждень, без трансферів і призових)`),
        el('dt', 'Кредит'), el('dd', L ? `${M(L.total - L.paid)} ще повернути · ${M(L.perWeek)}/тиж., ${L.left} тиж.` : 'немає'),
        el('dt', 'Назва стадіону'), el('dd', me.namingSold ? `«${me.namingSold.sponsor} Арена» (продано ${me.namingSold.s})` : me.stadium || '—'),
      ]),
      el('div.actions', [
        L ? el('button.btn', { type: 'button', onclick: () => { const r = FM.budget.repayLoan(W, state); budMsg = r.text; saveGame(); render(); } }, 'Погасити кредит достроково')
          : el('span.bud-loan', [el('label', { for: 'loan-amt' }, 'Кредит, млн € '), el('input', { id: 'loan-amt', type: 'number', min: '0.1', max: String(loanAmt), step: '0.1', value: String(loanAmt), style: { width: '6rem' }, onchange: (e) => { loanAmt = Number(e.target.value) || loanAmt; } }),
            el('button.btn', { type: 'button', title: `До ${M(FM.budget.loanMax(W, state))}, 8% за два роки`, onclick: () => { const r = FM.budget.takeLoan(W, state, loanAmt); budMsg = r.text; if (r.ok) FM.market.news(state, r.text, 'club'); saveGame(); render(); } }, 'Взяти')]),
        me.namingSold ? null : el('button.btn', { type: 'button', title: 'Одноразові гроші; фанатам не сподобається', onclick: () => { const r = FM.budget.sellNaming(W, state); budMsg = r.text; if (r.ok) FM.market.news(state, r.text, 'club'); saveGame(); render(); } }, `Продати права на назву стадіону (${M(FM.budget.naming(W, state))})`),
      ]),
    ]);
  }
  let reqMsg = null, affCands = null;
  /** Прохання до правління: одне кожного виду на сезон. */
  function requestsPanel() {
    const b = state.board;
    return el('div.panel', [el('h3', 'Прохання до правління'),
      b.contract ? el('p.muted', `Ваш контракт — до літа ${b.contract}.`) : null,
      el('ul.plist.reqs', Object.entries(FM.boardroom.REQUESTS).map(([k, d]) => el('li', [
        el('span', [el('b', d.label), el('small.muted', ' ' + d.hint)]),
        el('button.btn', { type: 'button', disabled: (FM.boardroom.asked(state, k) && k !== 'affiliate') || null, onclick: () => {
          const r = FM.boardroom.request(W, state, k);
          reqMsg = [r.ok, r.text]; affCands = r.cands || null;
          if (r.ok && k !== 'affiliate') FM.market.news(state, `Правління: ${r.text}`, 'club');
          saveGame(); render();
        } }, FM.boardroom.asked(state, k) && k !== 'affiliate' ? 'Уже просили' : 'Попросити')]))),
      reqMsg ? el('p.' + (reqMsg[0] ? 'msg-ok' : 'msg-bad'), reqMsg[1]) : null,
      affCands ? el('ul.plist', affCands.map((c) => el('li', [el('span.club-cell', [badge(c), el('span', [clubName(c), el('small.muted', ` ${W.league(c.league).name}`)])]),
        el('button.btn', { type: 'button', onclick: () => { const r = FM.boardroom.request(W, state, 'affiliate', c.id); reqMsg = [r.ok, r.text]; affCands = null; if (r.ok) FM.market.news(state, r.text, 'club'); saveGame(); render(); } }, 'Обрати')]))) : null,
      el('p.note', 'Покращення бази, академії й стадіону — на екрані «Клуб».'),
    ]);
  }
  /** Фарм-клуби: оренда молоді з гарантованою практикою. */
  function affiliatePanel() {
    const aff = (state.affiliates || []).filter((id) => W.club(id));
    if (!aff.length) return null;
    const sq = W.squad(state.clubId).filter((p) => (W.age(p) ?? 30) <= 23 && !p.loan).sort((a, b) => b.pa - a.pa);
    const sel = el('select', { id: 'aff-p', 'aria-label': 'Гравець' }, sq.map((p) => el('option', { value: p.id }, `${nameOf(p)} (${W.age(p)}, ${FM.positions(p)})`)));
    const csel = el('select', { id: 'aff-c', 'aria-label': 'Фарм-клуб' }, aff.map((id) => el('option', { value: id }, clubName(W.club(id)))));
    const there = [...W.players.values()].filter((p) => p.loan && p.loan.aff && p.loan.from === state.clubId);
    return el('div.panel', [el('h3', 'Фарм-клуби'),
      el('ul.plist', aff.map((id) => el('li', [el('span.club-cell', [badge(W.club(id)), el('span', [clubName(W.club(id)), el('small.muted', ` ${W.league(W.club(id).league).name}`)])]), starsEl(W.clubLevel(id), 'Рівень')]))),
      there.length ? el('p', ['В оренді у партнерів: ', ...there.flatMap((p, i) => [i ? ', ' : '', el('a', { href: '#player-' + p.id }, nameOf(p))])]) : null,
      sq.length ? el('div.pre-row', [el('div.field', [el('label', { for: 'aff-p' }, 'Гравець до 23'), sel]), el('div.field', [el('label', { for: 'aff-c' }, 'Куди'), csel]),
        el('button.btn', { type: 'button', onclick: () => { const r = FM.boardroom.sendToAffiliate(W, state, sel.value, csel.value); reqMsg = [r.ok, r.text]; if (r.ok) FM.market.news(state, r.text, 'transfers'); saveGame(); render(); } }, 'Віддати в оренду')]) : null,
      el('p.note', 'У фарм-клубі гравець гарантовано грає й розвивається як гравець основи; партнер платить половину зарплати. Повертається наприкінці сезону. Оренда — у відкрите трансферне вікно.'),
    ]);
  }

  function sponsorPanel() {
    const sp = state.sponsor && state.sponsor.year === state.season.year ? state.sponsor : null;
    const r = FM.finance.ratio(state), pct = Math.round(r * 100);
    const ffp = el('div', [el('b', `Фінансовий фейр-плей: витрати — ${pct}% доходів`), el('div.confbar', { role: 'meter', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 120, 'aria-label': 'Частка витрат' },
      el('i', { style: { width: Math.min(100, pct / 1.2) + '%' }, class: r > FM.finance.LIMIT ? 'low' : r > FM.finance.WARN ? 'mid' : 'high' })),
      el('small.muted', `Межа — ${Math.round(FM.finance.LIMIT * 100)}%: зарплати плюс третина чистих витрат на трансфери проти всіх доходів сезону. Порушення — штраф і заборона купівлі в наступне літнє вікно.${FM.finance.embargoed(state) ? ' ЗАРАЗ ДІЄ ЗАБОРОНА ТРАНСФЕРІВ.' : ''}`)]);
    return el('div.panel', [el('h3', 'Спонсор'), sp
      ? el('p', [el('b', sp.name), ` (${sp.label.toLowerCase()}): ${FM.market.fmtM(sp.perWeek)} на тиждень${sp.win ? `, ${FM.market.fmtM(sp.win)} за перемогу` : ''}${sp.trophy ? `, ${FM.market.fmtM(sp.trophy)} за трофей` : ''}. Уже виплачено: ${FM.market.fmtM(sp.earned)}.`])
      : el('div', [el('p.muted', 'Оберіть спонсора на цей сезон:'), el('ul.plist', FM.finance.offers(W, state).map((o) => el('li', [el('span', [el('b', o.name), el('small.muted', ` ${o.label}: ${FM.market.fmtM(o.perWeek)}/тиж.${o.win ? `, +${FM.market.fmtM(o.win)} за перемогу` : ''}${o.trophy ? `, +${FM.market.fmtM(o.trophy)} за трофей` : ''} · ${o.hint}`)]),
        el('button.btn', { type: 'button', onclick: () => { const x = FM.finance.choose(W, state, o.id); FM.market.news(state, `Новий спонсор: ${x.name}.`, 'club'); saveGame(); render(); } }, 'Підписати')])))]),
      ffp]);
  }

  function visionPanel() {
    const v = state.vision && state.vision.club === state.clubId ? state.vision : FM.career.makeVision(W, state);
    const ST = { ongoing: ['триває', ''], done: ['виконано', '.ok'], failed: ['не вдалося', '.bad'], kept: ['минулого сезону — виконано', '.ok'], missed: ['минулого сезону — ні', '.bad'] };
    return el('div.panel', [el('h3', `Бачення правління (з сезону ${v.since}/${String(v.since + 1).slice(2)})`),
      el('ul.plist', v.goals.map((g) => el('li', [el('span', g.label), el('b.vstat' + ST[g.status][1], ST[g.status][0])]))),
      el('p.note', 'Довгострокові цілі перевіряються наприкінці кожного сезону: виконана — довіра зростає (+10, щосезонна +3), провалена — падає (−12, щосезонна −5).')]);
  }

  function screenSacked() {
    const sk = state.sacked;
    if (!sk) return screenOverview();
    return [
      el('header', [el('h1', 'Вас звільнено')]),
      el('div.panel', [el('p', sk.reason), el('p', `${clubName(W.club(state.clubId))} шукає нового тренера. Ваша репутація: ${state.board.rep} з 100.`)]),
      el('div.panel', [el('h3', 'Пропозиції роботи'), sk.offers.length ? offerList(sk.offers, (id) => {
        FM.board.takeJob(W, state, id); state.sacked = null; state.jobOffers = []; pre = null; tableLeague = null; saveGame(); go('overview');
      }) : el('p.muted', 'Поки ніхто не телефонує.')]),
      el('p.note', 'Можна також почати нову кар’єру в «Налаштуваннях».'),
    ];
  }

  function shortlistPanel() {
    const S = state.season;
    const ids = (state.shortlist || []).filter((id) => W.player(id));
    const players = ids.map((id) => W.player(id));
    const grade = new Map(players.map((p) => [p.id, p.club === state.clubId || p.retired ? null : FM.deals.report(W, state, p, { ca: seenCA(p), pa: seenPA(p), known: known(p) })]));
    const GR = { A: 4, B: 3, C: 2, D: 1 };
    return el('div.panel', [el('h3', 'Шортлист'), ids.length ? dataTable('shortlist', {
      rows: players, flat: true, rowClick: (p) => go('player-' + p.id), sort: { k: 'grade', dir: -1 }, search: (p) => nameOf(p),
      filters: [LINE_TABS, { k: 'gr', label: 'Оцінка', type: 'select', options: [['all', 'будь-яка'], ['A', 'лише A'], ['AB', 'A або B']], test: (p, v) => { const g = grade.get(p.id); return !!g && v.includes(g.grade); } },
        { k: 'sale', label: 'На продажі', type: 'check', test: (p) => !!p.listed }],
      cols: [
        { k: 'grade', label: 'Оц.', full: 'Оцінка скаута', v: (p) => (grade.get(p.id) ? GR[grade.get(p.id).grade] : null), cell: (p) => { const g = grade.get(p.id); return g ? el('span.grade.g-' + g.grade, { title: g.text }, g.grade) : '—'; } },
        { k: 'name', label: 'Гравець', v: nameOf, asc: true, cls: () => 'name' },
        { k: 'pos', label: 'Поз.', v: (p) => FM.ROLE_ORDER.indexOf(p.roles[0]), cell: (p) => FM.positions(p), asc: true },
        { k: 'club', label: 'Клуб', v: (p) => (p.club ? clubName(W.club(p.club)) : p.retired ? 'завершив' : 'вільний'), asc: true },
        { k: 'age', label: 'Вік', v: (p) => W.age(p), num: true, asc: true },
        { k: 'ca', label: 'Рівень', v: seenCA, cell: (p) => starsEl(seenCA(p), 'Рівень') },
        { k: 'pa', label: 'Потенціал', v: seenPA, cell: (p) => starsEl(seenPA(p), 'Потенціал'), hide: true },
        { k: 'price', label: 'Ціна', v: (p) => (p.club ? FM.market.askingPrice(W, p, S) : null), cell: (p) => (p.club ? M(FM.market.askingPrice(W, p, S)) : '—'), num: true, asc: true },
        { k: 'contract', label: 'Контракт', v: (p) => (p.club ? p.contract ?? null : null), num: true, asc: true, hide: true },
        { k: 'status', label: 'Статус', cell: (p) => [p.listed ? el('span.chip', 'продаж') : null, p.injury ? el('span.chip.bad', 'травма') : null, p.loan ? el('span.chip', 'в оренді') : null, p.clause ? el('span.chip', `відступні ${M(p.clause)}`) : null] },
      ],
    }) : el('p.muted', 'Порожньо. Додавайте гравців кнопкою «☆ До шортлиста» в їхніх картках — про зміни (трансфер, продаж, травма) повідомлять новини.')]);
  }

  /** Критерії пошуку для скаута: де, позиція, вік, рівень, ціна. */
  function scoutTaskRow(sc) {
    const t = (sc.task = { ...FM.scouting.defTask(), ...(sc.task || {}) });
    const sel = (k, label, opts) => el('label.dt-sel', [el('span.muted', label + ' '), el('select.tiny', { 'aria-label': label, onchange: (e) => { t[k] = k === 'price' ? Number(e.target.value) : e.target.value; sc.seen = []; sc.empty = false; saveGame(); render(); } },
      opts.map(([v, l]) => el('option', { value: v, selected: String(t[k]) === String(v) || null }, l)))]);
    return el('div.scout-task', [
      sel('area', 'Де', [['all', 'усі ліги'], ['my', 'своя ліга'], ['free', 'вільні агенти'], ...W.db.leagues.map((l) => [l.id, l.name])]),
      sel('pos', 'Позиція', FM.scouting.POS.map((r) => [r, r === 'any' ? 'будь-яка' : FM.ROLE_NAME[r].toLowerCase()])),
      sel('age', 'Вік', FM.scouting.AGES.map(([v, l]) => [v, l])),
      sel('level', 'Рівень', FM.scouting.LEVELS),
      sel('price', 'Ціна', FM.scouting.PRICES.map((v) => [v, v ? `до ${M(v)}` : 'будь-яка'])),
    ]);
  }

  /** Рекомендації скаутів: оцінка, гравець, ціна; до шортлиста або відхилити. */
  function scoutRecsPanel() {
    const recs = (state.scoutRecs || []).filter((r) => W.player(r.pid)).slice().reverse();
    const GR = { A: 4, B: 3, C: 2, D: 1 };
    return el('div.panel', [el('h3', 'Рекомендації скаутів'), recs.length ? dataTable('scoutrecs', {
      rows: recs, flat: true, rowClick: (r) => go('player-' + r.pid), sort: { k: 'grade', dir: -1 }, search: (r) => nameOf(W.player(r.pid)),
      cols: [
        { k: 'grade', label: 'Оц.', full: 'Оцінка скаута', v: (r) => GR[r.grade], cell: (r) => el('span.grade.g-' + r.grade, { title: r.text }, r.grade) },
        { k: 'name', label: 'Гравець', v: (r) => nameOf(W.player(r.pid)), asc: true, cls: () => 'name' },
        { k: 'pos', label: 'Поз.', v: (r) => FM.ROLE_ORDER.indexOf(W.player(r.pid).roles[0]), cell: (r) => FM.positions(W.player(r.pid)), asc: true },
        { k: 'age', label: 'Вік', v: (r) => W.age(W.player(r.pid)), num: true, asc: true },
        { k: 'club', label: 'Клуб', v: (r) => { const p = W.player(r.pid); return p.club ? clubName(W.club(p.club)) : 'вільний'; }, asc: true },
        { k: 'price', label: 'Ціна', v: (r) => r.ask, cell: (r) => (r.ask ? M(r.ask) : '—'), num: true, asc: true },
        { k: 'keen', label: 'Перехід', v: (r) => r.keen, hide: true },
        { k: 'scout', label: 'Скаут', v: (r) => r.scout, hide: true },
        { k: 'act', label: '', cell: (r) => el('span.offer-btns', [shortlistBtn(W.player(r.pid)), el('button.btn', { type: 'button', onclick: (e) => { e.stopPropagation(); FM.scouting.dismiss(state, r.id); saveGame(); render(); } }, 'Відхилити')]) },
      ],
    }) : el('p.muted', 'Поки немає. Дайте скауту завдання «Пошук гравців» — він надсилатиме рекомендації щотижня.'),
    el('p.note', `Рекомендація лишається ${FM.scouting.KEEP} тижнів. Гравець, якого бачив скаут, оцінюється точно.`)]);
  }

  function scoutsPanel() {
    const list = FM.market.scouts(state);
    const R = FM.rng(Date.now());
    return el('div.panel', [el('h3', 'Скаутська мережа'),
      el('p.muted', `Точність оцінок залежить від найкращого скаута. Скаут, закріплений за лігою, за кілька тижнів розвідує всіх її гравців. Індивідуальних звітів на тиждень: ${2 + list.length}.`),
      el('ul.plist', list.map((sc, i) => el('li', [
        el('span', [el('b', sc.name), el('small.muted', ` рівень ${sc.level}${i ? `, ${FM.market.scoutWage(sc)} тис. €/тиж.` : ', головний'}`)]),
        el('span.offer-btns', [
          el('select.tiny', { 'aria-label': 'Регіон скаута', onchange: (e) => { sc.region = e.target.value || null; sc.prog = 0; if (sc.region === 'task' && !sc.task) sc.task = FM.scouting.defTask(); saveGame(); render(); } }, [el('option', { value: '' }, 'Без завдання'),
            el('option', { value: 'task', selected: sc.region === 'task' || null }, 'Пошук гравців'),
            el('optgroup', { label: 'Ліги гри' }, W.db.leagues.filter((l) => !(state.knownLeagues || {})[l.id] && l.id !== W.club(state.clubId).league).map((l) => el('option', { value: l.id, selected: sc.region === l.id || null }, l.name))),
            el('optgroup', { label: 'Світ: пошук талантів' }, Object.entries(FM.worldScout.REGIONS).map(([k, r]) => el('option', { value: k, selected: sc.region === k || null }, r.label)))]),
          sc.region && W.league(sc.region) ? el('small.muted', `${Math.min(99, Math.round(sc.prog / 1.5))}%`) : sc.region === 'task' ? null : sc.region ? el('small.muted', 'шукає таланти') : null,
          i ? el('button.btn', { type: 'button', onclick: () => { state.scoutStaff = list.filter((x) => x !== sc); saveGame(); render(); } }, 'Звільнити') : null,
        ]),
        sc.region === 'task' ? scoutTaskRow(sc) : null,
      ]))),
      list.length < 5 ? el('div.actions', [el('button.btn', { type: 'button', onclick: () => { const sc = FM.market.hireScout(state, R); FM.market.news(state, `Найнято скаута: ${sc.name}, рівень ${sc.level}.`); saveGame(); render(); } }, 'Найняти скаута')]) : null,
      Object.keys(state.knownLeagues || {}).length ? el('p.note', 'Розвідано ліги: ' + Object.keys(state.knownLeagues).map((l) => W.league(l).name).join(', ') + '.') : null,
    ]);
  }

  // ---------------- Графіки (розширення 14) ----------------
  /**
   * Лінійний графік (SVG): тонкі лінії 2px, лінія фокусу — колір акценту, решта — сірий фон; одна вісь;
   * підказка при наведенні на кожну точку. series: [{ label, pts: [[x, y, підказка?]], focus }].
   * opts: { invert (менше — вище), yMin, yMax, xLabel(x), yLabel(y), aria }.
   */
  function lineChart(series, opts = {}) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, a = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); for (const c of kids) n.append(c); return n; };
    const all = series.flatMap((x) => x.pts);
    if (!all.length) return el('p.muted', 'Даних поки немає.');
    const W0 = 320, H0 = 160, L = 44, Rr = 60, T = 10, B = 24;
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
    let y0 = opts.yMin ?? Math.min(...ys), y1 = opts.yMax ?? Math.max(...ys);
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const X = (x) => L + ((x - x0) / (x1 - x0)) * (W0 - L - Rr);
    const Y = (y) => { const k = (y - y0) / (y1 - y0); return opts.invert ? T + k * (H0 - T - B) : H0 - B - k * (H0 - T - B); };
    const ticks = [y0, (y0 + y1) / 2, y1];
    const fy = opts.yLabel || ((v) => String(Math.round(v)));
    const fx = opts.xLabel || ((v) => String(v));
    const kids = [];
    for (const t of ticks) { kids.push(svg('line', { x1: L, x2: W0 - Rr, y1: Y(t), y2: Y(t), class: 'ch-grid' })); kids.push(svg('text', { x: L - 4, y: Y(t) + 3, class: 'ch-tick', 'text-anchor': 'end' }, [document.createTextNode(fy(t))])); }
    for (const t of [x0, Math.round((x0 + x1) / 2), x1]) kids.push(svg('text', { x: X(t), y: H0 - 6, class: 'ch-tick', 'text-anchor': 'middle' }, [document.createTextNode(fx(t))]));
    const ordered = [...series].sort((a, b) => (a.focus ? 1 : 0) - (b.focus ? 1 : 0)); // фокус — поверх
    for (const sr of ordered) {
      if (!sr.pts.length) continue;
      const d = sr.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
      kids.push(svg('path', { d, class: sr.focus ? 'ch-line focus' : 'ch-line' }));
      const last = sr.pts[sr.pts.length - 1];
      kids.push(svg('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4, class: sr.focus ? 'ch-dot focus' : 'ch-dot' }));
      if (sr.label && (sr.focus || series.length <= 5)) kids.push(svg('text', { x: X(last[0]) + 6, y: Y(last[1]) + 3, class: sr.focus ? 'ch-label focus' : 'ch-label' }, [document.createTextNode(sr.label.length > 9 ? sr.label.slice(0, 8) + '…' : sr.label)]));
      // зони наведення більші за точки
      for (const p of sr.pts) { const hit = svg('circle', { cx: X(p[0]), cy: Y(p[1]), r: 7, class: 'ch-hit' }); hit.append(svg('title', {}, [document.createTextNode(`${sr.label ? sr.label + ': ' : ''}${p[2] || fy(p[1])} · ${fx(p[0])}`)])); kids.push(hit); }
    }
    return svg('svg', { viewBox: `0 0 ${W0} ${H0}`, class: 'chart', role: 'img', 'aria-label': opts.aria || 'Графік' }, kids);
  }

  /** Місце й очки клубів ліги після кожного туру (для графіків). */
  function leagueProgress(leagueId) {
    const S = state.season, ids = W.clubsOf(leagueId).map((c) => c.id);
    const row = Object.fromEntries(ids.map((id) => [id, { pts: 0, gd: 0, gf: 0 }]));
    const weeks = [...new Set(S.fixtures.filter((f) => f.l === leagueId && f.s).map((f) => f.w))].sort((a, b) => a - b);
    const pos = Object.fromEntries(ids.map((id) => [id, []])), pts = Object.fromEntries(ids.map((id) => [id, []]));
    weeks.forEach((w, i) => {
      for (const f of S.fixtures) if (f.l === leagueId && f.w === w && f.s) {
        const [a, b] = f.s, H = row[f.h], A = row[f.a];
        H.gf += a; A.gf += b; H.gd += a - b; A.gd += b - a;
        if (a > b) H.pts += 3; else if (b > a) A.pts += 3; else { H.pts++; A.pts++; }
      }
      const order = ids.slice().sort((x, y) => row[y].pts - row[x].pts || row[y].gd - row[x].gd || row[y].gf - row[x].gf);
      order.forEach((id, k) => { pos[id].push([i + 1, k + 1]); pts[id].push([i + 1, row[id].pts]); });
    });
    return { pos, pts, rounds: weeks.length };
  }

  function screenCharts() {
    const me = W.club(state.clubId), lg = me.league;
    const pr = leagueProgress(lg);
    const top = Object.keys(pr.pts).sort((a, b) => (pr.pts[b].slice(-1)[0] || [0, 0])[1] - (pr.pts[a].slice(-1)[0] || [0, 0])[1]).slice(0, 5);
    if (!top.includes(me.id)) top.push(me.id);
    const bal = (state.balHist || []).filter((x) => x[0] === state.season.year);
    const size = W.clubsOf(lg).length;
    return [
      el('header', [el('h1', 'Графіки'), el('span.muted', `${W.league(lg).name} · сезон ${seasonLabel()}`)]),
      el('div.grid', [
        el('div.panel', [el('h3', `Місце ${clubName(me)} після кожного туру`), lineChart([{ label: clubName(me), pts: pr.pos[me.id], focus: true }],
          { invert: true, yMin: 1, yMax: size, xLabel: (x) => `${x}-й тур`, yLabel: (y) => `${Math.round(y)}-е`, aria: 'Місце в таблиці по турах' })]),
        el('div.panel', [el('h3', 'Гонка за перші місця: очки'), lineChart(top.map((id) => ({ label: clubName(W.club(id)), pts: pr.pts[id], focus: id === me.id })),
          { yMin: 0, xLabel: (x) => `${x}-й тур`, aria: 'Очки лідерів по турах' }),
          el('div.ch-legend', top.map((id) => el('span', [el('i' + (id === me.id ? '.focus' : '')), `${clubName(W.club(id))} ${(pr.pts[id].slice(-1)[0] || [0, 0])[1]}`]))),
          el('small.muted', 'Ваш клуб — кольором, лідери — сірим (наведіть на точку, щоб побачити клуб).')]),
        el('div.panel', [el('h3', 'Баланс клубу за тижнями'), lineChart([{ label: clubName(me), pts: bal.map((x) => [x[1] + 1, x[2], FM.market.fmtM(x[2])]), focus: true }],
          { xLabel: (x) => `тиж. ${x}`, yLabel: (y) => FM.market.fmtM(y), aria: 'Баланс клубу за тижнями' })]),
      ]),
      el('p.note', 'Розвиток гравця за сезонами — на його картці (блок «Розвиток»).'),
    ];
  }

  // ---------------- Розширений пошук гравців (розширення 13) ----------------
  const SF0 = () => ({ q: '', league: 'all', nat: 'all', role: 'all', ageMin: 15, ageMax: 40, valMax: '', wageMax: '', contract: 'all', paMin: '', free: false, listed: false,
    a1: '', v1: 14, a2: '', v2: 14, a3: '', v3: 14, caMin: '' });
  let sf = null;
  function screenSearch() {
    sf = sf || SF0();
    const S = state.season;
    const seen = (p, k) => (known(p) ? p.attrs[k] : p.attrs[k] + fuzz(p, k + 'm', 1));
    const seenCA = (p) => (known(p) ? p.ca : p.ca + fuzz(p, 'ca', 8)), seenPA = (p) => (known(p) ? p.pa : p.pa + fuzz(p, 'pa', 12));
    const allAttrs = Object.keys(FM.ATTRS);
    const q = sf.q.trim().toLowerCase();
    const attrsF = [[sf.a1, sf.v1], [sf.a2, sf.v2], [sf.a3, sf.v3]].filter(([a]) => a);
    const t0 = Date.now();
    let res = [];
    for (const p of W.players.values()) {
      if (p.retired || p.club === state.clubId) continue;
      if (p.virtual || (sf.free ? p.club : !p.club && !p.talent)) continue;
      if (sf.listed && !p.listed) continue;
      if (sf.league !== 'all' && (!p.club || W.club(p.club).league !== sf.league)) continue;
      if (sf.nat !== 'all' && p.nat !== sf.nat) continue;
      if (sf.role !== 'all' && !p.roles.includes(sf.role)) continue;
      const age = W.age(p) ?? 24;
      if (age < sf.ageMin || age > sf.ageMax) continue;
      if (sf.valMax !== '' && p.value > Number(sf.valMax)) continue;
      if (sf.wageMax !== '' && (p.wage || 0) > Number(sf.wageMax)) continue;
      if (sf.contract !== 'all' && (p.contract || 9999) > S.year + Number(sf.contract)) continue;
      if (sf.paMin !== '' && seenPA(p) < Number(sf.paMin)) continue;
      if (sf.caMin && seenCA(p) < Number(sf.caMin)) continue;
      if (attrsF.some(([a, v]) => (p.attrs[a] == null ? true : seen(p, a) < Number(v)))) continue;
      if (q && !(p.name.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q))) continue;
      res.push(p);
    }
    const total = res.length;
    const set = (k) => (e) => { sf[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; render(); };
    const field = (id, label, input) => el('div.field', [el('label', { for: id }, label), input]);
    const selF = (id, label, k, opts) => field(id, label, el('select', { id, onchange: set(k) }, opts.map(([v, t]) => el('option', { value: v, selected: String(sf[k]) === String(v) || null }, t))));
    const numF = (id, label, k, min, max, step = 1) => field(id, label, el('input', { id, type: 'number', min, max, step, value: sf[k], onchange: set(k) }));
    const nats = [...new Set([...W.players.values()].filter((p) => p.club && !p.retired).map((p) => p.nat))].filter(Boolean).sort((a, b) => FM.countries.name(a).localeCompare(FM.countries.name(b), 'uk'));
    const attrOpts = [['', '—'], ...allAttrs.map((a) => [a, FM.ATTRS[a]])];
    return [
      el('header', [el('h1', 'Пошук гравців'), el('span.muted', `Знайдено ${total} · ${Date.now() - t0} мс`)]),
      el('div.panel', [el('div.filters', [
        field('s-q', 'Ім’я', el('input', { id: 's-q', type: 'search', value: sf.q, placeholder: 'частина імені', onchange: set('q') })),
        selF('s-league', 'Ліга', 'league', [['all', 'Усі'], ...W.db.leagues.map((l) => [l.id, l.name])]),
        selF('s-nat', 'Країна', 'nat', [['all', 'Усі'], ...nats.map((n) => [n, FM.countries.name(n)])]),
        selF('s-role', 'Позиція', 'role', [['all', 'Усі'], ...FM.ROLE_ORDER.map((r) => [r, FM.ROLE_NAME[r]])]),
        numF('s-amin', 'Вік від', 'ageMin', 15, 45), numF('s-amax', 'Вік до', 'ageMax', 15, 45),
        numF('s-val', 'Ціна до, млн €', 'valMax', 0, 300, 0.5), numF('s-wage', 'Зарплата до, тис. €/тиж.', 'wageMax', 0, 2000),
        selF('s-con', 'Контракт закінчується', 'contract', [['all', 'Будь-коли'], ['0', 'Цього сезону'], ['1', 'До наступного'], ['2', 'За 2 сезони']]),
        numF('s-pa', 'Потенціал від (1–200)', 'paMin', 0, 200),
        ...[1, 2, 3].map((i) => el('div.field.attr-f', [el('label', { for: 's-a' + i }, `Атрибут ${i}`), el('div.row', [
          el('select', { id: 's-a' + i, onchange: set('a' + i) }, attrOpts.map(([v, t]) => el('option', { value: v, selected: sf['a' + i] === v || null }, t))),
          el('input', { type: 'number', min: 1, max: 20, value: sf['v' + i], 'aria-label': `Атрибут ${i}, не менше`, onchange: set('v' + i) })])])),
        numF('s-camin', 'Рівень від (1–200)', 'caMin', 0, 200),
        el('label.check', [el('input', { type: 'checkbox', checked: sf.free || null, onchange: set('free') }), ' Лише вільні агенти й таланти']),
        el('label.check', [el('input', { type: 'checkbox', checked: sf.listed || null, onchange: set('listed') }), ' Лише виставлені на продаж']),
        el('button.btn', { type: 'button', onclick: () => { sf = SF0(); render(); } }, 'Скинути'),
      ])]),
      dataTable('search', {
        rows: res, rowClick: (p) => go('player-' + p.id), sort: { k: 'ca', dir: -1 },
        cols: [
          { k: 'name', label: 'Гравець', v: nameOf, cell: (p) => [el('a', { href: '#player-' + p.id }, nameOf(p)), known(p) ? null : el('small.muted', ' ≈')], asc: true },
          { k: 'pos', label: 'Поз.', v: (p) => FM.ROLE_ORDER.indexOf(p.roles[0]), cell: (p) => FM.positions(p), asc: true },
          { k: 'age', label: 'Вік', v: (p) => W.age(p), num: true, asc: true },
          { k: 'club', label: 'Клуб', v: (p) => (p.club ? clubName(W.club(p.club)) : p.talent ? 'талант зі світу' : 'вільний'), asc: true },
          { k: 'nat', label: 'Країна', v: (p) => FM.countries.name(p.nat), asc: true, hide: true },
          { k: 'ca', label: 'Рівень', v: seenCA, cell: (p) => starsEl(seenCA(p), 'Рівень'), num: true },
          { k: 'pa', label: 'Потенціал', v: seenPA, cell: (p) => starsEl(seenPA(p), 'Потенціал'), num: true },
          { k: 'value', label: 'Ціна', v: (p) => p.value, cell: (p) => FM.market.fmtM(p.value), num: true, asc: true },
          { k: 'wage', label: 'Зарплата', v: (p) => p.wage || 0, num: true, hide: true },
          { k: 'contract', label: 'Контракт', v: (p) => p.contract ?? null, num: true, asc: true },
          { k: 'rating', label: 'Оц.', full: 'Середня оцінка', v: (p) => avgRating(p.id), cell: (p) => f1(avgRating(p.id)), num: true, hide: true },
          ...attrsF.map(([a]) => ({ k: 'a-' + a, label: FM.ATTRS[a], v: (p) => (p.attrs[a] == null ? null : seen(p, a)), num: true })),
          ...allAttrs.filter((a) => !attrsF.some(([x]) => x === a)).map((a) => ({ k: 'a-' + a, label: FM.ATTRS[a], v: (p) => (p.attrs[a] == null ? null : seen(p, a)), num: true, hide: true })),
        ],
      }),
      el('p.note', '≈ — гравця не розвідано: значення приблизні. Ваші гравці в пошук не потрапляють.'),
    ];
  }

  // ---------------- Медіа й уболівальники (розширення 8) ----------------
  // ---------------- Газета туру ----------------
  const PAPERS = ['Футбольний вісник', 'Спорт-Експрес', 'Голова гра', 'Трибуна', 'Вечірній матч'];
  /** Випуск газети після туру вашої ліги: заголовок, результати, гравець туру, цитата тренера, фото дня. */
  function makePaper() {
    const S = state.season, w = S.week - 1, L = W.club(state.clubId).league;
    const fx = S.fixtures.filter((f) => f.w === w && f.l === L && f.s);
    if (!fx.length) return;
    const R = FM.rng(`paper-${S.seed}-${S.year}-${w}`);
    const mine = fx.find((f) => f.h === state.clubId || f.a === state.clubId);
    const big = [...fx].sort((a, b) => Math.abs(b.s[0] - b.s[1]) - Math.abs(a.s[0] - a.s[1]) || (b.s[0] + b.s[1]) - (a.s[0] + a.s[1]))[0];
    const t = FM.season.table(S, W, L), leader = W.club(t[0].id);
    const nm = (id) => clubName(W.club(id));
    let head;
    if (mine) {
      const home = mine.h === state.clubId, gf = home ? mine.s[0] : mine.s[1], ga = home ? mine.s[1] : mine.s[0], opp = nm(home ? mine.a : mine.h);
      head = gf - ga >= 3 ? `РОЗГРОМ! ${nm(state.clubId)} не залишив шансів ${opp}` : gf > ga ? `${nm(state.clubId)} дотискає ${opp}` : gf === ga ? `Нічия з ${opp}: очки поділено` : ga - gf >= 3 ? `Катастрофа: ${opp} ганьбить ${nm(state.clubId)}` : `${opp} сильніший цього разу`;
    } else head = `${nm(big.h)} — ${nm(big.a)} ${big.s.join(':')}: головний матч туру`;
    const tw = (state.aw || {}).totw, starIdx = tw && tw.w === w ? tw.r.indexOf(Math.max(...tw.r)) : -1;
    const star = starIdx >= 0 ? { pid: tw.ids[starIdx], r: tw.r[starIdx] } : null;
    const QUOTES = mine ? (() => { const home = mine.h === state.clubId, d = (home ? mine.s[0] - mine.s[1] : mine.s[1] - mine.s[0]);
      return d > 0 ? ['«Хлопці виконали все, що ми готували тиждень».', '«Це перемога характеру».', '«Радіємо, але вже думаємо про наступний матч».']
        : d === 0 ? ['«Очко — теж результат. Але ми хотіли більшого».', '«Нам бракувало точності в завершенні».']
          : ['«Беру відповідальність на себе».', '«Такі матчі треба забувати й працювати».', '«Ми розберемо помилки на відео».']; })() : ['«Стежимо за суперниками, але думаємо про себе».'];
    const PHOTOS = ['📸 Фанати з величезним банером на трибуні', '📸 Тренер аплодує вболівальникам після свистка', '📸 Воротар у польоті — найкращий сейв туру', '📸 Гравці святкують гол купою-малою', '📸 Маленький фанат з автографом кумира', '📸 Порожні трибуни під дощем'];
    state.paper = { s: S.year, w, name: R.pick(PAPERS), head, leader: leader.id, star, quote: R.pick(QUOTES), photo: R.pick(PHOTOS),
      results: fx.map((f) => [f.h, f.a, f.s]), date: FM.season.dateOf(w, S) };
  }
  function paperPanel() {
    const P = state.paper;
    if (!P) return null;
    return el('div.panel.paper', [el('div.paper-mast', [el('b', P.name), el('small.muted', fmt.date(P.date))]),
      el('h2.paper-head', P.head),
      el('p.paper-photo', P.photo),
      el('div.grid', [
        el('div', [el('b', 'Результати туру'), el('ul.plain', P.results.map(([h, a, sc]) => el('li' + (h === state.clubId || a === state.clubId ? '.mine' : ''), `${clubName(W.club(h))} ${sc.join(':')} ${clubName(W.club(a))}`)))]),
        el('div', [P.star && W.player(P.star.pid) ? el('p', [el('b', 'Гравець туру: '), el('a', { href: '#player-' + P.star.pid }, nameOf(W.player(P.star.pid))), ` (${clubName(W.club(W.player(P.star.pid).club))}), оцінка ${String(P.star.r).replace('.', ',')}`]) : null,
          el('p', [el('b', 'Лідер: '), clubName(W.club(P.leader))]),
          el('p.paper-quote', [el('b', `${state.manager}: `), P.quote])]),
      ])]);
  }

  function screenMedia() {
    const me = W.club(state.clubId), m = state.media || { press: [], posts: [], followers: 0 };
    const pr = FM.media.pressure(W, state), fans = FM.club.fans(W, me.id).mood;
    const fmtN = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10 + ' млн').replace('.', ',') : n >= 1e3 ? Math.round(n / 1e3) + ' тис.' : String(n));
    return [
      el('header', [el('h1', 'Медіа'), el('span.muted', `Підписників у клубу: ${fmtN(m.followers || 0)} · настрій фанатів ${Math.round(fans)}`)]),
      paperPanel(),
      el('div.panel', [el('b', `Тиск медіа: ${pr} з 100`), el('div.confbar', { role: 'meter', 'aria-valuenow': pr, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Тиск медіа' },
        el('i', { style: { width: pr + '%' }, class: pr >= 70 ? 'low' : pr >= 45 ? 'mid' : 'high' })),
        el('small.muted', 'Тиск росте від поганих результатів, невдоволених уболівальників і недовіри правління. Понад 80 — фанати вимагають відставки, і правління нервує.')]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Заголовки'), m.press.length ? el('ul.news.press', m.press.slice().reverse().slice(0, 15).map((h) => el('li.tone' + (h.tone > 0 ? '-up' : h.tone < 0 ? '-down' : ''), [el('small.muted', `${h.paper} · тиждень ${h.w + 1}`), el('b', h.text)]))) : el('p.muted', 'Поки тихо — зіграйте матч.')]),
        el('div.panel', [el('h3', 'Соцмережі вболівальників'), m.posts.length ? el('ul.news.posts', m.posts.slice().reverse().slice(0, 12).map((x) => el('li.post-' + x.kind, [el('span', x.text), el('small.muted', ` ♥ ${fmtN(x.likes)}`)]))) : el('p.muted', 'Порожньо.')]),
      ]),
    ];
  }

  // ---------------- Молодіжна команда U-21 (розширення 5) ----------------
  function screenU21() {
    const Y = FM.youth, sq = Y.squad(W, state), st = state.u21Stats || {}, res = (state.u21Results || []).slice().reverse();
    const cands = W.squad(state.clubId).filter((p) => Y.eligible(W, p) && !sq.includes(p));
    const row = (p, inU21) => el('li', [el('span', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${ageTxt(p)}${inU21 && st[p.id] ? ` · ${st[p.id][0]} м., ${st[p.id][1]} г., оцінка ${(st[p.id][2] / st[p.id][0] / 10).toFixed(1).replace('.', ',')}` : ''}`)]),
      el('span.offer-btns', [starsEl(p.ca, 'Рівень'), starsEl(known(p) ? p.pa : p.pa, 'Потенціал'),
        el('button.btn', { type: 'button', onclick: () => { if (inU21) Y.promote(state, p.id); else Y.toU21(W, state, p.id); saveGame(); render(); } }, inU21 ? 'До основи' : 'У U-21')])]);
    const w = res.filter((r) => r.score[0] > r.score[1]).length, d = res.filter((r) => r.score[0] === r.score[1]).length;
    return [
      el('header', [el('h1', 'Молодіжна команда U-21'), el('span.muted', `${sq.length} гравців · сезон: ${w} В, ${d} Н, ${res.length - w - d} П`)]),
      el('p.note', 'Гравці до 21 року в U-21 щотижня грають у молодіжній лізі й ростуть майже як гравці основи (на лаві — повільніше). До заявки першої команди вони не потрапляють, доки не підвищите. Вихованці академії після сезону одразу йдуть сюди. Для матчів потрібно щонайменше 7 гравців.'),
      el('div.grid', [
        el('div.panel', [el('h3', 'Склад U-21'), sq.length ? el('ul.plist', sq.sort((a, b) => b.pa - a.pa).map((p) => row(p, true))) : el('p.muted', 'Порожньо.')]),
        el('div.panel', [el('h3', 'Можна перевести (до 21 року, в основі)'), cands.length ? el('ul.plist', cands.map((p) => row(p, false))) : el('p.muted', 'Таких гравців немає.')]),
      ]),
      el('div.panel', [el('h3', 'Результати'), res.length ? el('ul.plist', res.slice(0, 12).map((r) => el('li', [el('span', `${r.w}-й тиждень · U-21 ${clubName(W.club(r.opp))}`),
        el('b', r.score.join(':') + (r.scorers.length ? ` (${r.scorers.map((id) => W.player(id) ? nameOf(W.player(id)).split(' ').slice(-1)[0] : '').join(', ')})` : ''))]))) : el('p.muted', 'Ще не грали.')]),
    ];
  }

  // ---------------- Роздягальня (розширення 4) ----------------
  let meetMsg = null;
  /** Чи важливий найближчий матч: кубок, дербі, суперник не слабший за нас. */
  function nextIsBig() {
    const S = state.season;
    if (FM.cups.pendingTie(state, state.clubId)) return true;
    const f = myFixture();
    if (!f) return false;
    const opp = f.h === state.clubId ? f.a : f.h;
    return (FM.rivals && FM.rivals.isDerby(W, state.clubId, opp)) || W.clubLevel(opp) >= W.clubLevel(state.clubId) - 4;
  }
  function screenDressing() {
    const D = FM.dressing, gs = D.groups(W, state.clubId), lead = D.leaders(W, state.clubId);
    const tm = Math.round(FM.morale.teamMorale(W, state.clubId));
    const res = D.recent(state.season, state.clubId).map((r) => (r > 0 ? 'В' : r < 0 ? 'П' : 'Н')).join(' ');
    const big = nextIsBig();
    return [
      el('header', [el('h1', 'Роздягальня'), el('span.muted', `Настрій команди: ${FM.morale.label({ morale: tm }).toLowerCase()} (${tm}) · останні матчі: ${res || '—'}`)]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Лідери'), el('ul.plist', lead.map((p) => el('li', [el('span', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${ageTxt(p)}`)]), el('b', `вплив ${D.influence(W, p)}`)]))),
          el('p.note', 'Вплив залежить від лідерських якостей, віку, матчів за збірну й рівня. Продаж лідера засмучує команду.')]),
        el('div.panel', [el('h3', 'Збори команди'),
          el('p.muted', `Найближчий матч ${big ? 'важливий — налаштування спрацює краще' : 'рядовий'}. Збори — не частіше ніж раз на 3 тижні; ефект — настрій і невеликий бонус сили на найближчий матч.`),
          el('div.actions', Object.entries(D.MEET).map(([k, m]) => el('button.btn', { type: 'button', title: m.hint, disabled: D.canMeet(state) ? null : true, onclick: () => {
            const r = D.meet(W, state, k, big); meetMsg = r; saveGame(); render();
          } }, m.label))),
          meetMsg ? el(meetMsg.good ? 'p.msg-ok' : 'p.msg-bad', meetMsg.text) : !D.canMeet(state) ? el('small.muted', 'Наступні збори — за кілька тижнів.') : null]),
      ]),
      el('div.panel', [el('h3', 'Групи впливу'), gs.length ? el('div.grid', gs.map((g) => el('div.group', [
        el('b', `${g.label} · ${g.players.length}`), el('div.muted', `Лідер: ${nameOf(g.leader)} · настрій ${g.mood}`),
        el('div', { class: 'confbar', role: 'meter', 'aria-valuenow': g.mood, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Настрій групи' }, el('i', { style: { width: g.mood + '%' }, class: g.mood < 40 ? 'low' : g.mood < 60 ? 'mid' : 'high' })),
        el('small.muted', g.players.slice(1, 6).map((p) => nameOf(p)).join(', ') + (g.players.length > 6 ? '…' : '')),
      ]))) : el('p.muted', 'Помітних груп немає — команда згуртована.')]),
      (() => { const fr = FM.dressing.friends(W, state.clubId); return el('div.panel', [el('h3', `Найкращі друзі: ${fr.length} пар`), fr.length ? el('ul.plist', fr.map(([a, b]) => el('li', [
        el('span', ['🤝 ', el('a', { href: '#player-' + a.id }, nameOf(a)), ' і ', el('a', { href: '#player-' + b.id }, nameOf(b))]), el('small.muted', a.nat === b.nat ? FM.countries.name(a.nat) : 'одна мова')]))) : el('p.muted', 'Близьких друзів у команді немає.'),
        el('p.note', 'Продасте одного — інший сумуватиме. Новачкові легше, коли в команді є співвітчизники.')]); })(),
    ];
  }

  // ---------------- Таланти зі світу (розширення 3) ----------------
  let talentMsg = null;
  function talentsPanel() {
    const list = (state.talents || []).map((id) => W.player(id)).filter((p) => p && p.talent);
    const now = state.season.year * 100 + state.season.week;
    return el('div.panel', [el('h3', 'Таланти зі світу'),
      el('p.muted', 'Відправте скаута в регіон «Світ» (Південна Америка, Африка, Азія…) — він привозитиме звіти про молодих гравців, яких немає в лігах гри. Підписання — за компенсацію за виховання; через ~8 тижнів таланта забере інший клуб.'),
      list.length ? el('ul.plist', list.map((p) => el('li', [
        el('span', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${W.age(p)} р., ${FM.countries.name(p.nat)} · ${FM.worldScout.REGIONS[p.talent.region].label} · ще ${Math.max(0, p.talent.until - now)} тиж.`)]),
        el('span.offer-btns', [starsEl(p.ca, 'Рівень'), starsEl(p.pa, 'Потенціал'), el('button.btn', { type: 'button', onclick: () => {
          const r = buyBlocked() ? { ok: false, reason: buyBlocked() } : FM.worldScout.sign(W, state, p.id); talentMsg = r.ok ? `${p.name} — ваш гравець! Зарплата ${r.wage} тис. €/тиж., контракт на 5 років.` : r.reason; saveGame(); render();
        } }, `Підписати за ${FM.market.fmtM(p.talent.fee)}`)]),
      ]))) : el('p.muted', 'Звітів поки немає.'),
      talentMsg ? el('p.msg-ok', talentMsg) : null]);
  }

  // ---------------- Клуб: персонал, інфраструктура, вболівальники ----------------
  let staffPick = null, officeMsg = null;
  function screenOffice() {
    const me = W.club(state.clubId), staff = FM.club.initStaff(W, state), fac = FM.club.facilities(W, me.id), fans = FM.club.fans(W, me.id);
    const rows = Object.entries(FM.club.ROLES).map(([role, d]) => {
      const x = staff[role];
      const list = staffPick === role ? FM.club.candidates(state, role) : null;
      return el('li.staff-row', [
        el('div', [el('b', d.label), el('div.muted', `${x.name} · рівень ${x.level} · ${String(FM.club.staffWage(role, x.level, state)).replace(".", ",")} тис. €/тиж.`), el('small.muted', d.hint)]),
        el('button.btn', { type: 'button', onclick: () => { staffPick = staffPick === role ? null : role; render(); } }, staffPick === role ? 'Сховати' : 'Шукати заміну'),
        list ? el('ul.plist.cands', list.map((c) => el('li', [el('span', [`${c.name} · рівень ${c.level} · ${String(Math.round(c.wage * 10) / 10).replace('.', ',')} тис. €/тиж.`, c.note ? el('small.muted', ` · ${c.note}`) : null]),
          el('button.btn', { type: 'button', onclick: () => { staff[role] = { name: c.name, level: c.level }; if (c.ex) { const x = (state.exPlayers || []).find((y) => y.pid === c.ex); if (x) x.taken = state.clubId; } staffPick = null; officeMsg = `${d.label}: тепер ${c.name}.`; saveGame(); render(); } }, 'Найняти')]))) : null,
      ]);
    });
    const att = Math.round(FM.club.attendance(W, me.id, 0.5) * 100);
    return [
      el('header', [el('h1', 'Клуб'), el('span.muted', `Персонал коштує ${String(Math.round(FM.club.staffBill(state) * 10) / 10).replace(".", ",")} тис. € на тиждень`)]),
      officeMsg ? el('p.msg-ok', officeMsg) : null,
      el('div.panel', [el('h3', 'Доручення асистентові'), el('p.muted', 'Що асистент робить сам, щоб ви займалися головним.'),
        el('ul.plist.deleg', Object.entries(FM.routine.DELEGATE).map(([k, d]) => el('li', [el('label.check', [
          el('input', { type: 'checkbox', checked: FM.routine.delegated(state, k) || null, onchange: (e) => { state.deleg = { ...(state.deleg || {}), [k]: e.target.checked }; saveGame(); } }),
          ' ', el('b', d.label)]), el('small.muted', d.hint)])))]),
      el('div.panel', [el('h3', 'Персонал'), el('ul.staff', rows)]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Інфраструктура'), el('dl.facts', [
          el('dt', 'Тренувальна база'), el('dd', `рівень ${fac.training} з 20`), el('dt', 'Академія'), el('dd', `рівень ${fac.youth} з 20`),
          el('dt', 'Стадіон'), el('dd', `${fmt.int(me.capacity)} місць`),
          fac.building ? el('dt', 'Будується') : null, fac.building ? el('dd', `${FM.club.UPGRADES[fac.building.kind].label.toLowerCase()}, ще ${fac.building.left} тиж.`) : null,
        ]), el('div.actions', Object.entries(FM.club.UPGRADES).map(([k, U]) => el('button.btn', { type: 'button', disabled: fac.building || null, title: U.hint, onclick: () => {
          const r = FM.club.requestUpgrade(W, state, k); officeMsg = r.ok ? `Правління погодило: ${U.label.toLowerCase()} за ${FM.market.fmtM(r.cost)}, готово за ${U.weeks} тиж.` : r.reason; saveGame(); render();
        } }, `${U.label} — ${FM.market.fmtM(U.cost(W, me, fac))}`))), el('p.note', 'Покращення погоджує правління: потрібні гроші із запасом і довіра.')]),
        el('div.panel', [el('h3', 'Вболівальники'), el('dl.facts', [
          el('dt', 'Настрій'), el('dd', [confBar(fans.mood), `${Math.round(fans.mood)} з 100`]),
          el('dt', 'Заповненість стадіону'), el('dd', `≈${att}%`),
        ]), el('div.field', [el('b', 'Ціни квитків'), el('div.tabs', Object.entries(FM.club.PRICES).map(([k, d]) => el('button', { type: 'button', 'aria-pressed': String(fans.price === k), onclick: () => { fans.price = k; saveGame(); render(); } }, d.label)))]),
          ticketsPanel(),
          el('p.note', 'Високі ціни — більше грошей з квитка, але менше людей і гірший настрій. Перемоги вдома радують уболівальників; якщо вони дуже незадоволені, правління нервує.')]),
      ]),
    ];
  }

  let stMsg = null;
  /** Абонементи й відвідуваність: продаж у передсезоння, середня й рекордна кількість глядачів, останні матчі. */
  function ticketsPanel() {
    const S = state.season, me = W.club(state.clubId), st = state.st && state.st.year === S.year ? state.st : null;
    const log = (state.attLog || []).filter((x) => x.s === S.year);
    const avg = log.length ? Math.round(log.reduce((a, x) => a + x.n, 0) / log.length) : null;
    const rec = ((FM.awards.aw(state).rec || {})[state.clubId] || {}).attendance;
    const lg = S.cal && S.cal.leagues[me.league], canSell = !st && (!lg || S.week < lg.start);
    let pick = 'normal';
    return el('div.tickets', [
      el('b', 'Абонементи'),
      st ? el('p', st.share ? `Продано ${fmt.int(Math.round((me.capacity || 0) * st.share))} (${Math.round(st.share * 100)}% стадіону, ${FM.money.SEASON_TICKETS[st.kind].label.toLowerCase()}).` : 'Цього сезону без абонементів.')
        : canSell ? el('div.pre-row', [el('div.field', [el('label', { for: 'st-kind' }, 'Ціна абонемента'), el('select', { id: 'st-kind', onchange: (e) => { pick = e.target.value; } },
          Object.entries(FM.money.SEASON_TICKETS).map(([k, d]) => el('option', { value: k, selected: k === 'normal' || null }, `${d.label}${d.share ? ` · ≈${Math.round(FM.money.seasonTicketShare(W, me.id, k) * 100)}% стадіону` : ''}`)))]),
          el('button.btn', { type: 'button', onclick: () => { const r = FM.money.sellSeasonTickets(W, state, pick); stMsg = r.text; if (r.ok && r.money) FM.market.news(state, r.text, 'club'); saveGame(); render(); } }, 'Продати абонементи')])
          : el('p.muted', 'Абонементи продають лише в передсезоння.'),
      stMsg ? el('p.msg-ok', stMsg) : null,
      el('dl.facts', [el('dt', 'Середня відвідуваність'), el('dd', avg ? `${fmt.int(avg)} (${Math.round((avg / (me.capacity || 1)) * 100)}%)` : '—'),
        el('dt', 'Рекорд'), el('dd', rec ? `${fmt.int(rec.v)} — з ${rec.opp}` : '—')]),
      log.length ? el('ul.plain.att-log', log.slice(-5).reverse().map((x) => el('li', `${clubName(W.club(x.opp))}: ${fmt.int(x.n)} (${x.fill}%)`))) : null,
    ]);
  }

  // ---------------- День дедлайну (як у FM) ----------------
  /**
   * Останній тиждень вікна: таймер до закриття, стрічка угод вікна, «панічні пропозиції» —
   * клуби в останню мить продають гравців зі знижкою 20–35%.
   */
  let dlMsg = null;
  function deadlinePanel() {
    const S = state.season, me = W.club(state.clubId);
    const win = FM.market.windows(S).find(([a, b]) => S.week >= a && S.week <= b);
    if (!win || S.week !== win[1]) return null;
    const dlDay = S.cal ? 1 : 5, day = curDay();
    const left = day <= dlDay ? (dlDay - day) * 24 + (24 - 8) : 0;
    const key = `${S.year}-${S.week}`;
    if (!state.dl || state.dl.key !== key) {
      // панічні пропозиції: корисні вам гравці, яких клуби готові віддати дешевше
      const R = FM.rng(`dl-${S.seed}-${key}`), side = mySide(), xiAvg = side.lineup.xi.reduce((a, x) => a + x.player.ca, 0) / 11;
      const budget = FM.budget.available(W, state);
      const cands = [...W.players.values()].filter((p) => p.club && p.club !== state.clubId && !p.loan && !p.retired && !p.virtual && p.ca >= xiAvg * 0.93 && (W.age(p) ?? 30) <= 31
        && W.club(p.club).players.length > 20 && FM.market.askingPrice(W, p, S) <= Math.max(1, budget * 1.6));
      const list = [];
      for (let i = 0; i < 40 && list.length < 3 && cands.length; i++) {
        const p = cands.splice(R.int(cands.length), 1)[0];
        if (FM.market.wageDemand(W, p, state.clubId) == null) continue;
        list.push({ pid: p.id, price: Math.round(FM.market.askingPrice(W, p, S) * (0.65 + R.next() * 0.15) * 20) / 20 });
      }
      state.dl = { key, list };
    }
    const deals = (state.transfers || []).filter((t) => t.s === S.year && t.w >= win[0] && t.w <= win[1] && t.fee > 0).slice(-12).reverse();
    return el('div.panel.deadline', [
      el('div.plan-card-head', [el('h3', '⏰ День дедлайну'), el('b.dl-timer', left > 0 ? `до закриття ${left} год` : 'вікно закривається опівночі!')]),
      el('p.muted', 'Останні години трансферного вікна: клуби поспішають, ціни падають, рішення — швидкі.'),
      state.dl.list.length ? el('ul.plist.dl-offers', state.dl.list.map((x) => {
        const p = W.player(x.pid);
        if (!p || p.club === state.clubId || x.done) return el('li', [el('span.muted', p ? `${nameOf(p)} — угоду закрито` : '—')]);
        const wage = FM.market.wageDemand(W, p, state.clubId);
        return el('li', [el('span', [el('b', '🔥 '), el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${W.age(p)} р., ${clubName(W.club(p.club))} · ціна ${M(FM.market.askingPrice(W, p, S))} → `), el('b', M(x.price))]),
          el('button.btn.primary', { type: 'button', onclick: () => {
            if (!FM.budget.canSpend(W, state, x.price)) { dlMsg = `Не вистачає трансферного бюджету (${M(FM.budget.available(W, state))}).`; return render(); }
            if (FM.market.wageBill(W, me.id) + wage > me.wageBudget) { dlMsg = `Гравець хоче ${wage} тис. €/тиж. — фонд зарплат не дозволяє. Перекиньте гроші в зарплати («Правління» → «Бюджети»).`; return render(); }
            if (buyBlocked()) { dlMsg = buyBlocked(); return render(); }
            const from = clubName(W.club(p.club));
            FM.market.complete(W, state, p, me.id, x.price, wage, 3);
            state.board.fin.transfers = Math.round((state.board.fin.transfers - x.price) * 100) / 100;
            x.done = true; state.known = state.known || {}; state.known[p.id] = true;
            FM.market.news(state, `Угода в останню мить! ${nameOf(p)} переходить з ${from} за ${M(x.price)}.`, 'transfers');
            dlMsg = `${nameOf(p)} — ваш гравець! Зарплата ${wage} тис. €/тиж.`; saveGame(); render();
          } }, `Купити за ${M(x.price)}`)]);
      })) : el('p.muted', 'Панічних пропозицій для вас немає.'),
      dlMsg ? el('p.msg-ok', dlMsg) : null,
      el('b', 'Стрічка угод вікна'),
      deals.length ? el('ul.plain.dl-feed', deals.map((t) => { const p = W.player(t.p); return el('li' + (t.fee >= 20 ? '.big' : ''), `${t.fee >= 20 ? '💥 ' : ''}${p ? p.name : '?'}: ${t.from && W.club(t.from) ? W.club(t.from).name : 'вільний'} → ${W.club(t.to) ? W.club(t.to).name : ''}, ${M(t.fee)}`); })) : el('p.muted', 'Поки тихо.'),
    ]);
  }

  // ---------------- Екран «Трансфери» ----------------
  let tf = { role: '', maxAge: 35, maxPrice: 0, league: 'all', nat: 'all', minCa: 0, minAge: 15, listed: false, expiring: false, known: false };
  let tcTab = 'centre';
  function screenTransfers() {
    const S = state.season, me = W.club(state.clubId);
    const open = FM.market.windowOpen(S);
    const nw = FM.market.nextWindow(S);
    const offers = (state.offers || []).filter((o) => W.player(o.pid) && W.player(o.pid).club === state.clubId);
    const accept = (o) => { acceptOffer(o); saveGame(); render(); };
    const reject = (o) => { rejectOffer(o); saveGame(); render(); };

    let list = [...W.players.values()].filter((p) => !p.retired && p.club !== state.clubId && !p.virtual);
    if (tf.league === 'free') list = list.filter((p) => !p.club && p.free);
    else { list = list.filter((p) => p.club); if (tf.league !== 'all') list = list.filter((p) => W.club(p.club).league === tf.league); }
    if (tf.role) list = list.filter((p) => p.roles.includes(tf.role));
    if (tf.nat !== 'all') list = list.filter((p) => p.nat === tf.nat);
    list = list.filter((p) => { const a = W.age(p) ?? 24; return a <= tf.maxAge && a >= tf.minAge; });
    if (tf.minCa) list = list.filter((p) => FM.stars(seenCA(p)) >= tf.minCa);
    if (tf.listed) list = list.filter((p) => p.listed);
    if (tf.expiring) list = list.filter((p) => (p.contract || 9999) <= S.year + 1);
    if (tf.known) list = list.filter((p) => known(p));
    const price = new Map(list.map((p) => [p.id, p.club ? FM.market.askingPrice(W, p, S) : 0]));
    if (tf.maxPrice > 0) list = list.filter((p) => price.get(p.id) <= tf.maxPrice);
    const nats = [...new Set([...W.players.values()].filter((p) => p.club && !p.retired).map((p) => p.nat))].filter(Boolean).sort((a, b) => FM.countries.name(a).localeCompare(FM.countries.name(b), 'uk'));

    const sel = (id, label, value, opts, onch) => el('div.field', [el('label', { for: id }, label), el('select', { id, onchange: (e) => { onch(e.target.value); render(); } },
      opts.map(([v, n]) => el('option', { value: v, selected: String(v) === String(value) || null }, n)))]);
    const myDeals = (state.transfers || []).filter((t) => t.to === state.clubId || t.from === state.clubId).slice(-10).reverse();

    const TABS = [['centre', 'Центр'], ['search', 'Пошук'], ['targets', 'Цілі'], ['unwanted', 'Непотрібні'], ['dev', 'Розвиток'], ['scouts', 'Скаути'], ['history', 'Історія']];
    const tab = (k, ...kids) => (tcTab === k ? kids : []);
    const mineAll = W.squad(state.clubId).filter((x) => !x.loan || x.loan.from === state.clubId);
    const games = S.fixtures.filter((f) => f.s && (f.h === state.clubId || f.a === state.clubId)).length;
    const listed = mineAll.filter((x) => x.listed);
    const fringe = mineAll.filter((x) => !x.listed && !x.loan && FM.morale.status(W, x) === 'backup' && (W.age(x) ?? 25) >= 22);
    const youngDev = mineAll.filter((x) => !x.loan && (W.age(x) ?? 25) <= 21 && (games < 6 || ((S.ps[x.id] || [0])[0] / games) < 0.3));
    const loanOffers = (state.loanOffers || []).filter((o) => W.player(o.pid) && W.player(o.pid).club === state.clubId);
    const pl = (x, extra) => el('li', [el('span', [el('a', { href: '#player-' + x.id }, nameOf(x)), el('small.muted', ` ${FM.positions(x)}, ${W.age(x)} р. · ${extra || ''}`)]), starsEl(seenCA(x), 'Рівень')]);
    return [
      el('header', [el('h1', 'Трансфери'), el('span.muted', open ? 'Трансферне вікно відкрите' : `Вікно закрите · ${nw != null ? `відкриється на ${nw + 1}-му тижні` : 'наступне — влітку'}`)]),
      el('div.tabs.tc-tabs', TABS.map(([k, l]) => el('button', { type: 'button', 'aria-pressed': String(tcTab === k), onclick: () => { tcTab = k; render(); } }, l + (k === 'centre' && (offers.length + loanOffers.length) ? ` (${offers.length + loanOffers.length})` : '')))),
      ...tab('centre', deadlinePanel(), el('div.grid', [
        el('div.panel', [el('h3', 'Фінанси'), el('dl.facts', [
          el('dt', 'Трансферний бюджет'), el('dd', el('b', M(FM.budget.available(W, state)))),
          el('dt', 'Баланс'), el('dd', M(me.balance)),
          el('dt', 'Зарплати'), el('dd', `${FM.market.wageBill(W, me.id)} з ${me.wageBudget} тис. € на тиждень`),
          el('dt', 'Гравців'), el('dd', me.players.length),
        ])]),
        el('div.panel', [el('h3', 'Пропозиції за ваших гравців'), offers.length ? el('ul.plist', offers.map((o) => el('li', [
          el('span', [el('a', { href: '#player-' + o.pid }, nameOf(W.player(o.pid))), el('small.muted', ` ← ${clubName(W.club(o.from))}, ${M(o.fee)}`)]),
          el('span.offer-btns', [el('button.btn', { type: 'button', disabled: !open || null, onclick: () => accept(o) }, 'Продати'), el('button.btn', { type: 'button', onclick: () => reject(o) }, 'Ні')]),
        ]))) : el('p.muted', 'Немає. Виставте гравців на трансфер у їхніх картках, щоб привернути покупців.')]),
      ]),
        el('div.panel', [el('h3', 'Хочуть узяти в оренду ваших гравців'), loanOffers.length ? el('ul.plist', loanOffers.map((o) => { const x = W.player(o.pid); return el('li', [
          el('span', [el('a', { href: '#player-' + x.id }, nameOf(x)), el('small.muted', ` → ${clubName(W.club(o.club))} · платить ${Math.round(o.share * 100)}% зарплати · ${FM.tcentre.PLAYTIME[o.role].toLowerCase()}`)]),
          el('span.offer-btns', [el('button.btn', { type: 'button', disabled: !open || null, onclick: () => { const t = FM.tcentre.acceptLoan(W, state, o.id); if (t) FM.market.news(state, t, 'transfers'); saveGame(); render(); } }, 'Погодитися'),
            el('button.btn', { type: 'button', onclick: () => { FM.tcentre.rejectLoan(state, o.id); saveGame(); render(); } }, 'Ні')])]); })) : el('p.muted', 'Поки що немає. Клуби пропонують оренду гравцям, які в вас мало грають.')]),
        (state.future || []).length ? el('div.panel', [el('h3', 'Переходи наприкінці сезону'), el('ul.plist', state.future.map((d) => { const x = W.player(d.pid); return x ? el('li', [el('span', [el('a', { href: '#player-' + x.id }, nameOf(x)), el('small.muted', ` ← ${clubName(W.club(d.from))}`)]), el('b', M(d.fee))]) : null; }))]) : null,
      (() => { const out = [...W.players.values()].filter((x) => x.loan && x.loan.from === state.clubId);
        return out.length ? el('div.panel', [el('h3', 'Ваші гравці в оренді'), el('ul.plist', out.map((x) => el('li', [el('a', { href: '#player-' + x.id }, nameOf(x)),
          el('span.muted', `${clubName(W.club(x.club))} · ${(S.ps[x.id] || [0])[0]} ігор`)])))]) : null; })(),
      ),
      ...tab('search', el('div.panel', [el('h3', 'Пошук гравців'),
        el('div.filters', [
          sel('f-league', 'Ліга', tf.league, [['all', 'Усі ліги'], ...W.db.leagues.map((l) => [l.id, l.name]), ['free', 'Вільні агенти']], (v) => { tf.league = v; }),
          sel('f-role', 'Позиція', tf.role, [['', 'Будь-яка'], ...['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'].map((r) => [r, FM.ROLE_NAME[r]])], (v) => { tf.role = v; }),
          sel('f-nat', 'Країна', tf.nat, [['all', 'Усі'], ...nats.map((n) => [n, FM.countries.name(n)])], (v) => { tf.nat = v; }),
          sel('f-amin', 'Вік від', tf.minAge, [[15, 'будь-який'], [18, 18], [21, 21], [24, 24], [28, 28], [31, 31]], (v) => { tf.minAge = Number(v); }),
          sel('f-age', 'Вік до', tf.maxAge, [[19, 19], [21, 21], [23, 23], [25, 25], [28, 28], [31, 31], [35, 'будь-який']], (v) => { tf.maxAge = Number(v); }),
          sel('f-ca', 'Рівень від', tf.minCa, [[0, 'будь-який'], [1.5, '★½'], [2, '★★'], [2.5, '★★½'], [3, '★★★'], [3.5, '★★★½'], [4, '★★★★']], (v) => { tf.minCa = Number(v); }),
          sel('f-price', 'Ціна до', tf.maxPrice, [[0, 'будь-яка'], [0.5, '€500 тис.'], [1, '€1 млн'], [3, '€3 млн'], [10, '€10 млн'], [25, '€25 млн'], [60, '€60 млн']], (v) => { tf.maxPrice = Number(v); }),
          el('label.check', [el('input', { type: 'checkbox', checked: tf.listed || null, onchange: (e) => { tf.listed = e.target.checked; render(); } }), ' Лише на продажі']),
          el('label.check', [el('input', { type: 'checkbox', checked: tf.expiring || null, onchange: (e) => { tf.expiring = e.target.checked; render(); } }), ' Контракт спливає']),
          el('label.check', [el('input', { type: 'checkbox', checked: tf.known || null, onchange: (e) => { tf.known = e.target.checked; render(); } }), ' Лише розвідані']),
        ]),
        dataTable('tf', {
          rows: list, flat: true, search: (p) => `${p.name} ${p.nameEn || ''} ${nameOf(p)}`, rowClick: (p) => go('player-' + p.id), sort: { k: 'ca', dir: -1 },
          cols: [
            { k: 'name', label: 'Гравець', v: nameOf, cell: (p) => [nameOf(p), known(p) ? '' : el('small.muted', ' ≈'), p.listed ? el('span.chip', ' продаж') : ''], asc: true, cls: () => 'name' },
            { k: 'club', label: 'Клуб', v: (p) => (p.club ? clubName(W.club(p.club)) : 'вільний'), asc: true },
            { k: 'league', label: 'Ліга', v: (p) => (p.club ? W.league(W.club(p.club).league).name : ''), asc: true, hide: true },
            { k: 'pos', label: 'Поз.', v: (p) => FM.ROLE_ORDER.indexOf(p.roles[0]), cell: (p) => FM.roleLabel(p.roles[0], p.side), asc: true, cls: (p) => 'pos.line-' + FM.ROLE_LINE[p.roles[0]] },
            { k: 'age', label: 'Вік', v: (p) => W.age(p), num: true, asc: true },
            { k: 'nat', label: 'Країна', v: (p) => FM.countries.name(p.nat), asc: true, hide: true },
            { k: 'ca', label: 'Рівень', v: seenCA, cell: (p) => starsEl(seenCA(p), 'Рівень') },
            { k: 'pa', label: 'Потенціал', v: seenPA, cell: (p) => starsEl(seenPA(p), 'Потенціал') },
            { k: 'price', label: 'Ціна', v: (p) => price.get(p.id), cell: (p) => (p.club ? M(price.get(p.id)) : '—'), num: true, asc: true },
            { k: 'wage', label: 'Зарплата', v: (p) => p.wage || 0, num: true, hide: true },
            { k: 'contract', label: 'Контракт', v: (p) => (p.club ? p.contract ?? null : null), num: true, asc: true },
            { k: 'apps', label: 'Ігри', full: 'Ігри за сезон', v: (p) => (pstat(p.id) || [0])[0], num: true, hide: true },
            { k: 'goals', label: 'Голи', v: (p) => (pstat(p.id) || [0, 0])[1], num: true, hide: true },
            { k: 'rating', label: 'Оц.', full: 'Середня оцінка', v: (p) => avgRating(p.id), cell: (p) => f1(avgRating(p.id)), num: true, hide: true },
          ],
        }),
        el('p.note', 'Рівень гравців з інших ліг — оцінка скаутів (≈). Клік по заголовку — сортування; «Стовпці» — що показувати.'),
      ])),
      ...tab('targets', shortlistPanel()),
      ...tab('unwanted', el('div.panel', [el('h3', `Виставлені на продаж (${listed.length})`), listed.length ? el('ul.plist', listed.map((x) => pl(x, `ціна ${M(x.value)}`))) : el('p.muted', 'Нікого. Виставити гравця — у його картці («Контракт» → «Виставити на трансфер»).')]),
        el('div.panel', [el('h3', 'Можна відпустити'), el('p.muted', 'Запасні, які рідко грають: їхні зарплати можна звільнити для підсилення.'), fringe.length ? el('ul.plist', fringe.map((x) => pl(x, `${(S.ps[x.id] || [0])[0]} ігор, ${x.wage} тис. €/тиж.`))) : el('p.muted', 'Таких немає.')])),
      ...tab('dev', el('div.panel', [el('h3', 'Список розвитку'), el('p.muted', 'Молоді гравці, яким бракує ігрової практики: оренда в слабший клуб пришвидшить їхній розвиток.'),
        youngDev.length ? el('ul.plist', youngDev.map((x) => pl(x, `${(S.ps[x.id] || [0])[0]} ігор з ${games}, потенціал ${'★'.repeat(Math.round(FM.stars(seenPA(x))))}`))) : el('p.muted', 'Усі молоді гравці отримують достатньо практики.')])),
      ...tab('scouts', scoutRecsPanel(), scoutsPanel(), talentsPanel()),
      ...tab('history', el('div.panel', [el('h3', 'Ваші угоди'), myDeals.length ? el('ul.plist', myDeals.map((t) => el('li', [
        el('span', [el('a', { href: '#player-' + t.p }, nameOf(W.player(t.p))), el('small.muted', ` ${t.to === state.clubId ? '← ' + (t.from ? clubName(W.club(t.from)) : 'вільний агент') : '→ ' + clubName(W.club(t.to))}`)]),
        el('b', t.fee ? M(t.fee) : 'безкоштовно')]))) : el('p.muted', 'Поки що жодної.')])),
    ];
  }

  function readableOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#000';
    const n = parseInt(m[1], 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#111' : '#fff';
  }

  // ---------------- Ліги й інші клуби ----------------
  let browseLeague = null;
  function screenLeagues() {
    browseLeague = browseLeague || W.club(state.clubId).league;
    const list = W.clubsOf(browseLeague).map((c) => ({ c, lvl: W.clubLevel(c.id), n: c.players.length })).sort((a, b) => b.lvl - a.lvl);
    return [
      el('header', [el('h1', 'Ліги й клуби')]),
      el('div.tabs', W.db.leagues.map((l) => el('button', { type: 'button', 'aria-pressed': String(l.id === browseLeague), onclick: () => { browseLeague = l.id; render(); } }, l.name))),
      dataTable('clubs', {
        rows: list.map((x, i) => ({ ...x, rank: i + 1 })), search: (x) => `${clubName(x.c)} ${x.c.nameEn || ''}`, rowClick: (x) => go(x.c.id === state.clubId ? 'squad' : 'club-' + x.c.id), sort: { k: 'lvl', dir: -1 },
        cols: [
          { k: 'rank', label: '#', full: 'Місце за силою', v: (x) => x.rank, num: true, asc: true },
          { k: 'name', label: 'Клуб', v: (x) => clubName(x.c), cell: (x) => el('span', { style: { display: 'inline-flex', gap: '0.5rem', alignItems: 'center' } }, [badge(x.c), clubName(x.c)]), asc: true, cls: () => 'name' },
          { k: 'coach', label: 'Тренер', v: (x) => (x.c.id === state.clubId ? state.manager : x.c.manager ? x.c.manager.name : ''), cell: (x) => (x.c.id === state.clubId ? state.manager : x.c.manager ? `${x.c.manager.name} (${FM.club.STYLES[x.c.manager.style].label})` : '—'), asc: true },
          { k: 'stadium', label: 'Стадіон', v: (x) => x.c.stadium || '', asc: true, hide: true },
          { k: 'cap', label: 'Місткість', v: (x) => x.c.capacity || 0, cell: (x) => fmt.int(x.c.capacity), num: true },
          { k: 'lvl', label: 'Рівень', v: (x) => x.lvl, cell: (x) => starsEl(x.lvl, 'Рівень клубу') },
          { k: 'value', label: 'Вартість складу', v: (x) => W.squad(x.c.id).reduce((a, p) => a + p.value, 0), cell: (x) => fmt.money(W.squad(x.c.id).reduce((a, p) => a + p.value, 0)), num: true },
          { k: 'n', label: 'Гравців', v: (x) => x.n, num: true },
          { k: 'bal', label: 'Баланс', v: (x) => x.c.balance, cell: (x) => FM.market.fmtM(x.c.balance), num: true, hide: true },
        ],
      }),
    ];
  }

  function screenClub(id) {
    const c = W.club(id);
    if (!c) return [el('p', 'Клуб не знайдено.')];
    return [
      el('header', [
        el('div', { style: { display: 'flex', gap: '0.9rem', alignItems: 'center' } }, [badge(c, true), el('div', [el('h1', clubName(c)), el('div.muted', `${W.league(c.league).name} · ${c.stadium || ''}`)])]),
        el('div.head-actions', [starsEl(W.clubLevel(c.id), 'Рівень клубу'), el('a.btn', { href: '#editclub-' + c.id }, 'Редагувати клуб')]),
      ]),
      squadTable(c.id),
    ];
  }

  // ---------------- Тактика ----------------
  const ROLE_SHORT = (slot) => FM.roleLabel(slot.role, slot.side);
  const TUK = { ...FM.match.TACTIC_UK, fluid: FM.match.FLUID_UK };
  const DUTY_SHORT = { D: 'О', S: 'П', A: 'А' };
  /** Позиція з обов'язком: «ЦП-П», «НП-А» (як у жанрі). */
  const ROLE_DUTY = (slot) => `${FM.roleLabel(slot.role, slot.side)}${slot.role === 'GK' ? '' : '-' + DUTY_SHORT[FM.dutyOf(slot)]}`;
  const ROLE_Y = { GK: 91, CB: 77, FB: 70, DM: 58, CM: 46, AM: 32, W: 24, ST: 13 };
  /** Розстановка на полі для будь-якої схеми: [x, y] у відсотках (y — від чужих воріт до своїх). */
  function layoutXY(slots) {
    const bands = {};
    slots.forEach((s, i) => { const y = ROLE_Y[s.role]; (bands[y] = bands[y] || []).push(i); });
    const out = new Array(slots.length);
    for (const [y, idx] of Object.entries(bands)) {
      const left = idx.filter((i) => slots[i].side === 'L'), right = idx.filter((i) => slots[i].side === 'R');
      const mid = idx.filter((i) => !slots[i].side);
      left.forEach((i) => { out[i] = [12, +y]; });
      right.forEach((i) => { out[i] = [88, +y]; });
      const lo = left.length || right.length ? 32 : 22, hi = 100 - lo;
      mid.forEach((i, k) => { out[i] = [mid.length === 1 ? 50 : lo + (k * (hi - lo)) / (mid.length - 1), +y]; });
    }
    return out;
  }

  function availablePlayers(clubId) {
    return W.squad(clubId).filter((p) => !banned(p.id) && !(p.injury > 0));
  }

  const TSETS = ['A', 'B', 'C'];
  const TSET_UK = { A: 'А', B: 'Б', C: 'В' };
  /** Знайомство зі схемами (0–100): звична схема на старті — 100, решта — 30. */
  function familiarity() {
    if (!state.familiarity) {
      state.familiarity = {};
      for (const f of Object.keys(FM.FORMATIONS)) state.familiarity[f] = 30;
      if (state.tactics) state.familiarity[state.tactics.formation] = 100;
    }
    return state.familiarity;
  }
  /** Перемкнути активну тактику (А/Б/В). Нова — копія поточної. */
  function switchTacticSet(key) {
    myTactics();
    state.tacticSets = state.tacticSets || {};
    state.tacticSets[state.tacticKey || 'A'] = state.tactics;
    state.tacticKey = key;
    state.tactics = state.tacticSets[key] || JSON.parse(JSON.stringify(state.tactics));
    state.tacticSets[key] = state.tactics;
  }

  /** Тактика гравця: створюється помічником при першому зверненні. */
  function myTactics() {
    if (!state.tactics) {
      const avail = availablePlayers(state.clubId);
      const formation = FM.bestFormation(avail);
      state.tactics = { formation, ids: FM.pickLineup(avail, formation).xi.map((x) => x.player.id), mentality: 'balanced', pressing: 'normal', passing: 'mixed' };
      saveGame();
    }
    const t = state.tactics;
    t.roles = t.roles || {}; t.variants = t.variants || {}; t.instr = t.instr || {}; t.takers = t.takers || {};
    return t;
  }
  const USER1 = () => ({ clubId: state.clubId, tactics: myTactics(), familiarity: familiarity(), reserve: new Set([...FM.youth.set(state), ...FM.medical.rested(state)]), // U-21 і ті, хто відпочиває
    boost: FM.dressing.matchBoost(state) * FM.routine.prepBoost(weekSchedule(), (curEvent() || { day: 6 }).day) * mindBoost() * FM.press.focus(state) * crisisBoost() }); // збори + підготовка напередодні + словесна дуель + преса + криза
  const crisisBoost = () => { const c = state.crisisBoost, S = state.season; return c && c.y === S.year && S.week - c.w <= 1 ? c.k : 1; };
  /** Тренер-людина для рушія матчів; у грі на двох — обидва (склад і тактика другого — його власні). */
  const USER = () => (FM.duo.on(state) ? [USER1(), FM.duo.as(state, USER1)] : USER1());
  const mindBoost = () => { const m = state.mind, S = state.season, ev = curEvent(); return m && m.key === `${S.year}-${S.week}` && ev && ev.opp === m.club ? m.boost : 1; };

  function mySide() {
    const t = myTactics();
    const players = availablePlayers(state.clubId);
    const lineup = FM.lineupFromIds(players, t.formation, t.ids, t);
    return { club: W.club(state.clubId), players, formation: t.formation, lineup, units: FM.lineupUnits(lineup),
      mentality: t.mentality, pressing: t.pressing, passing: t.passing, takers: t.takers, setp: t.setp, oppi: t.oppi, fluid: t.fluid, ti: t.ti, familiarity: Math.min(1, (familiarity()[t.formation] || 0) / 100) };
  }

  const shortName = (p) => { const n = nameOf(p).split(' '); return n.length > 1 ? n.slice(1).join(' ') : n[0]; };
  const fitClass = (f) => (f >= 0.97 ? 'fit-ok' : f >= 0.85 ? 'fit-mid' : 'fit-bad');

  function pitch(lineup, captainId) {
    const xy = layoutXY(lineup.xi.map((x) => x.slot));
    return el('div.pitch', { role: 'img', 'aria-label': `Розстановка ${lineup.formation}` }, [
      el('div.pitch-lines'),
      ...lineup.xi.map((x, i) => el('a.pl.' + fitClass(FM.fit(x.player, x.slot)) + (x.auto ? '.auto' : ''), {
        href: '#player-' + x.player.id, style: { left: xy[i][0] + '%', top: xy[i][1] + '%' },
        title: `${nameOf(x.player)} — ${ROLE_SHORT(x.slot)}${x.slot.variant ? ', ' + FM.VARIANTS[x.slot.role][x.slot.variant].label.toLowerCase() : ''}`,
      }, [el('span.pl-num', x.player.number ?? ROLE_SHORT(x.slot)), el('span.pl-name', shortName(x.player) + (x.player.id === captainId ? ' (К)' : ''))])),
    ]);
  }

  // ---------------- Редактор складу (як у FM): натисни позицію на полі — обери гравця ----------------
  let lineupSel = { slot: null, pid: null };
  function lineupEditor(t, side, save) {
    const xi = side.lineup.xi, xiIds = xi.map((y) => y.player.id);
    const reserve = new Set([...FM.youth.set(state), ...FM.medical.rested(state)]);
    const pool = availablePlayers(state.clubId).filter((p) => !reserve.has(p.id));
    const benchIds = new Set(side.lineup.bench.map((p) => p.id));
    const status = (p) => { const j = xiIds.indexOf(p.id); return j >= 0 ? ['xi', `основа · ${ROLE_SHORT(xi[j].slot)}`] : benchIds.has(p.id) ? ['bench', 'запас'] : ['res', 'поза заявкою']; };
    const assign = (i, pid) => {
      const ids = xiIds.slice(), j = ids.indexOf(pid), old = ids[i];
      if (j >= 0) ids[j] = ids[i]; // уже в основі — міняються місцями
      ids[i] = pid;
      t.ids = ids;
      if (Array.isArray(t.bench) && j < 0) t.bench = t.bench.filter((x) => x !== pid).concat(t.bench.includes(old) ? [] : [old]).slice(0, 9); // замінений — на лаву
      lineupSel = { slot: null, pid: null };
      save();
    };
    const pickSlot = (i) => {
      if (lineupSel.pid) return assign(i, lineupSel.pid);
      lineupSel = { slot: lineupSel.slot === i ? null : i, pid: null };
      render();
      setTimeout(() => { const el2 = document.getElementById('lineup-picker'); if (el2 && lineupSel.slot != null) el2.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30);
    };
    const xy = layoutXY(xi.map((x) => x.slot));
    const field = el('div.pitch.pitch-edit', { role: 'group', 'aria-label': `Склад: ${side.lineup.formation}. Натисніть позицію, щоб обрати гравця` }, [
      el('div.pitch-lines'),
      ...xi.map((x, i) => {
        const fv = FM.fit(x.player, x.slot), cond = Math.round(x.player.fitness ?? 100);
        return el('button.pl.' + fitClass(fv) + (x.auto ? '.auto' : '') + (lineupSel.slot === i ? '.sel' : ''), {
          type: 'button', style: { left: xy[i][0] + '%', top: xy[i][1] + '%' }, 'aria-pressed': String(lineupSel.slot === i),
          title: `${ROLE_SHORT(x.slot)}: ${nameOf(x.player)} — натисніть, щоб замінити`, onclick: () => pickSlot(i),
        }, [el('span.pl-num', ROLE_SHORT(x.slot)), el('span.pl-role', ROLE_DUTY(x.slot)), el('span.pl-name', shortName(x.player) + (x.player.id === t.takers.captain ? ' (К)' : '')),
          el('span.pl-cond', el('i', { style: { width: cond + '%' }, class: cond < 75 ? 'low' : '' }))]);
      }),
    ]);
    let picker;
    if (lineupSel.slot != null && xi[lineupSel.slot]) {
      const x = xi[lineupSel.slot];
      const cands = pool.filter((p) => p.id !== x.player.id).sort((a, b) => FM.slotValue(b, x.slot) - FM.slotValue(a, x.slot));
      picker = el('div.lineup-picker', { id: 'lineup-picker' }, [
        el('div.lp-head', [el('b', `${ROLE_SHORT(x.slot)}: зараз ${nameOf(x.player)}`), el('button.btn.link', { type: 'button', onclick: () => { lineupSel = { slot: null, pid: null }; render(); } }, 'Скасувати')]),
        el('p.muted', 'Оберіть, хто зіграє на цій позиції. Якщо він уже в основі — гравці поміняються місцями.'),
        el('ul.lp-list', cands.map((p) => {
          const fv = FM.fit(p, x.slot), [st, stl] = status(p), cond = Math.round(p.fitness ?? 100);
          const fa = p.form && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null;
          return el('li', el('button', { type: 'button', onclick: () => assign(lineupSel.slot, p.id) }, [
            el('span.fitdot.' + fitClass(fv), { title: fv >= 0.97 ? 'Рідна позиція' : fv >= 0.85 ? 'Може зіграти' : 'Не його позиція' }),
            el('span.lp-name', [el('b', nameOf(p)), el('small.muted', ` ${FM.positions(p)}`)]),
            el('span.lp-val', { title: 'Наскільки підходить на цю позицію (1–20)' }, String(Math.round(FM.slotValue(p, x.slot) * 10) / 10).replace('.', ',')),
            el('span.lp-cond' + (cond < 75 ? '.low' : ''), { title: 'Свіжість' }, cond + '%'),
            el('span.lp-form', { title: 'Форма: середня оцінка за останні матчі' }, fa ? fa.toFixed(1).replace('.', ',') : '—'),
            el('span.chip.lp-st.' + st, stl),
          ]));
        })),
      ]);
    } else {
      picker = el('div.lineup-picker.hint', { id: 'lineup-picker' }, [
        el('b', 'Як змінити склад'),
        el('ol.plain-ol', [
          el('li', 'Натисніть на гравця на полі — з’явиться список, кого можна поставити на цю позицію (найкращі — вгорі).'),
          el('li', 'Оберіть гравця. Якщо він уже в основі — двоє поміняються місцями, якщо був у запасі — замінений піде на лаву.'),
          el('li', 'Колір кружечка: зелений — рідна позиція, жовтий — може зіграти, червоний — не його позиція. Смужка — свіжість.'),
        ]),
        lineupSel.pid ? el('p.msg-ok', `Обрано: ${nameOf(W.player(lineupSel.pid))}. Тепер натисніть позицію на полі.`) : null,
        el('div.actions', [
          el('button.btn', { type: 'button', onclick: () => { t.ids = FM.lineupFromIds(side.players, t.formation, null, t).xi.map((y) => y.player.id); lineupSel = { slot: null, pid: null }; save(); } }, 'Автопідбір: найкращий склад'),
        ]),
      ]);
    }
    // усі гравці: швидкий вибір «гравець → позиція»
    const list = el('div.lineup-squad', [el('h3', 'Гравці'), el('ul.lp-list.compact', pool.slice().sort((a, b) => FM.ROLE_ORDER.indexOf(a.roles[0]) - FM.ROLE_ORDER.indexOf(b.roles[0]) || b.ca - a.ca).map((p) => {
      const [st, stl] = status(p), cond = Math.round(p.fitness ?? 100);
      return el('li', el('button', { type: 'button', 'aria-pressed': String(lineupSel.pid === p.id), title: 'Натисніть, потім — позицію на полі', onclick: () => { lineupSel = { slot: null, pid: lineupSel.pid === p.id ? null : p.id }; render(); } }, [
        el('span.pos.line-' + FM.ROLE_LINE[p.roles[0]], FM.roleLabel(p.roles[0], p.side)), el('span.lp-name', nameOf(p)), el('span.lp-cond' + (cond < 75 ? '.low' : ''), cond + '%'), el('span.chip.lp-st.' + st, stl)]));
    })), reserve.size ? el('p.note', `Не в заявці основи (молодіжна команда або відпочивають): ${[...reserve].map((id) => W.player(id)).filter(Boolean).map(nameOf).join(', ')}.`) : null]);
    return el('div.lineup-editor', [field, picker, list]);
  }

  function segmented(group, value, onPick) {
    return el('div.tabs', { role: 'group' }, Object.keys(TUK[group]).map((k) => el('button', {
      type: 'button', 'aria-pressed': String(k === value), onclick: () => onPick(k),
    }, TUK[group][k][0].toUpperCase() + TUK[group][k].slice(1))));
  }

  const TACTIC_HELP = {
    fluid: 'Жорстка — кожен тримає своє місце, менше ривків і ризику; плинна — захисники підключаються, атакувальні міняються місцями, більше імпровізації.',
    mentality: 'Наскільки команда йде вперед: сміливіше — більше моментів у вас, але й у суперника.',
    pressing: 'Високий пресинг частіше відбирає м’яч, але втомлює, дає більше карток і лишає простір за спиною.',
    passing: 'Короткі передачі бережуть м’яч і дають кращі моменти; довгі — більше спроб, але гіршої якості. Дощ і сніг заважають коротким, вітер — довгим.',
  };
  const ROLES_ALL = ['CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

  function screenTactics() {
    const t = myTactics();
    const side = mySide();
    const save = () => { saveGame(); render(); };
    const avail = side.players;
    const outBanned = W.club(state.clubId).players.filter((id) => banned(id) || W.player(id).injury > 0).map((id) => nameOf(W.player(id)));
    const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    const resetSlots = () => { t.roles = {}; t.variants = {}; t.instr = {}; };

    const rows = side.lineup.xi.map((x, i) => {
      const roleSel = i === 0 ? el('span.pos.line-gk', 'ВР') : el('select.tiny', { id: 'role-' + i, 'aria-label': 'Роль на позиції', onchange: (e) => {
        t.roles[i] = e.target.value; delete t.variants[i]; save();
      } }, ROLES_ALL.map((r) => el('option', { value: r, selected: r === x.slot.role || null }, FM.roleLabel(r, x.slot.side))));
      const variants = FM.VARIANTS[x.slot.role] || {};
      const varSel = el('select.tiny', { id: 'var-' + i, 'aria-label': 'Варіант ролі', onchange: (e) => { if (e.target.value === 'std') delete t.variants[i]; else t.variants[i] = e.target.value; save(); } },
        Object.entries(variants).map(([k, v]) => el('option', { value: k, selected: (x.slot.variant || 'std') === k || null }, v.label)));
      const insSel = i === 0 ? null : el('select.tiny', { id: 'ins-' + i, 'aria-label': 'Індивідуальна інструкція', onchange: (e) => { if (e.target.value === 'none') delete t.instr[i]; else t.instr[i] = e.target.value; save(); } },
        Object.entries(FM.INSTR).map(([k, v]) => el('option', { value: k, selected: (x.slot.instr || 'none') === k || null }, v.label)));
      const fv = FM.fit(x.player, x.slot);
      return el('li.slot-row', [
        el('div.slot-main', [roleSel, el('button.btn.link.slot-name', { type: 'button', title: 'Змінити гравця', onclick: () => { lineupSel = { slot: i, pid: null }; render(); setTimeout(() => { const el2 = document.getElementById('lineup-picker'); if (el2) el2.scrollIntoView({ block: 'nearest' }); }, 30); } }, nameOf(x.player)), el('span.fitdot.' + fitClass(fv), { title: fv >= 0.97 ? 'Рідна позиція' : fv >= 0.85 ? 'Може зіграти' : 'Не його позиція' })]),
        el('div.slot-extra', [varSel, insSel, i === 0 ? null : el('select.tiny', { 'aria-label': 'Обов’язок', title: 'Обов’язок: оборона — більше допомагає позаду, атака — частіше йде вперед і б’є', onchange: (e) => { t.duty = t.duty || {}; if (e.target.value === 'auto') delete t.duty[i]; else t.duty[i] = e.target.value; save(); } },
          [['auto', `Обов’язок: ${FM.DUTY_UK[FM.dutyOf({ role: x.slot.role })]} (звично)`], ['D', 'Обов’язок: оборона'], ['S', 'Обов’язок: підтримка'], ['A', 'Обов’язок: атака']].map(([v, l]) => el('option', { value: v, selected: ((t.duty || {})[i] || 'auto') === v || null }, l)))]),
        i === 0 ? null : piDetails(t, i, save),
      ]);
    });

    const xiPlayers = side.lineup.xi.map((x) => x.player);
    const takerSel = (key, label, pool) => el('div.field', [el('label', { for: 'tk-' + key }, label), el('select', { id: 'tk-' + key, onchange: (e) => { if (e.target.value) t.takers[key] = e.target.value; else delete t.takers[key]; save(); } },
      [el('option', { value: '' }, 'На розсуд помічника'), ...pool.map((p) => el('option', { value: p.id, selected: t.takers[key] === p.id || null }, nameOf(p)))])]);

    return [
      el('header', [el('h1', 'Тактика'), el('span.muted', 'Зміни зберігаються одразу й діють у наступному матчі')]),
      el('div.panel', [
        el('h3', 'Набір тактик'),
        el('div.tabs', TSETS.map((k) => el('button', { type: 'button', 'aria-pressed': String((state.tacticKey || 'A') === k), onclick: () => { switchTacticSet(k); save(); } },
          `Тактика ${TSET_UK[k]}${(state.tacticSets || {})[k] || k === (state.tacticKey || 'A') ? ` · ${((state.tacticSets || {})[k] || t).formation}` : ' (нова)'}`))),
        el('p.note', 'Три тактики можна перемикати посеред матчу. Активна — та, з якою команда виходить на поле.'),
      ]),
      el('div.panel', [
        el('h3', 'Схема'),
        el('div.tabs', Object.keys(FM.FORMATIONS).map((f) => el('button', {
          type: 'button', 'aria-pressed': String(f === t.formation),
          onclick: () => { t.formation = f; resetSlots(); t.ids = FM.pickLineup(avail, f).xi.map((x) => x.player.id); save(); },
        }, [f, el('small.fam', ` ${Math.round(familiarity()[f] || 0)}%`)]))),
        el('p.note', `Знайомство зі схемою ${t.formation}: ${Math.round(familiarity()[t.formation] || 0)}%. Незнайома схема працює до 5% гірше; команда звикає в матчах і на тренуваннях «Підготовка до матчу».`),
        Object.keys(t.roles).length ? el('p.note', 'Власна розстановка: ролі окремих позицій змінено.') : null,
      ]),
      el('div.panel', [el('h3', `Склад на матч · ${t.formation}`), lineupEditor(t, side, save)]),
      el('div.tactics-grid', [
        el('div.panel', [pitch(side.lineup, t.takers.captain),
          el('div.legend', [el('span', [el('i.fit-ok'), 'рідна позиція']), el('span', [el('i.fit-mid'), 'може зіграти']), el('span', [el('i.fit-bad'), 'не його позиція'])])]),
        el('div.panel', [
          el('h3', 'Ролі й інструкції позицій'),
          el('ol.slots', rows),
          outBanned.length ? el('p.note', 'Не можуть грати (травма чи дискваліфікація): ' + outBanned.join(', ') + '.') : null,
          el('div.actions', [
            el('button.btn', { type: 'button', onclick: () => { t.ids = FM.lineupFromIds(avail, t.formation, null, t).xi.map((x) => x.player.id); save(); } }, 'Автопідбір складу'),
            el('button.btn', { type: 'button', onclick: () => { resetSlots(); save(); } }, 'Скинути ролі'),
          ]),
          el('h3', { style: { marginTop: '1rem' } }, 'Запасні'),
          el('p.muted', side.lineup.bench.map(nameOf).join(', ')),
        ]),
      ]),
      el('div.panel', [el('h3', 'Стандарти й капітан'), el('div.filters', [
        takerSel('captain', 'Капітан', xiPlayers), takerSel('pen', 'Пенальті', xiPlayers),
        takerSel('fk', 'Штрафні', xiPlayers), takerSel('corner', 'Кутові', xiPlayers),
      ]), (() => {
        t.setp = t.setp || {};
        const opt = (key, label, opts, def, help) => el('div.field', [el('label', { for: 'sp-' + key }, label), el('select', { id: 'sp-' + key, onchange: (e) => { t.setp[key] = e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value; save(); } },
          opts.map(([v, l]) => el('option', { value: String(v), selected: String(t.setp[key] ?? def) === String(v) || null }, l))), el('small.muted', help)]);
        return el('div.filters', [
          opt('corner', 'Кутові', [['far', 'На дальню штангу'], ['near', 'На ближню штангу'], ['short', 'Розіграш коротко']], 'far', 'Ближня — частіше удар, дальня — до найкращого в повітрі, коротко — рідше, але без контратак.'),
          opt('cbUp', 'Центральні захисники', [[true, 'Ідуть у штрафний'], [false, 'Лишаються позаду']], true, 'У штрафному вони небезпечні головою, але суперник може втекти в контратаку.'),
          opt('fk', 'Штрафні', [['shoot', 'Бити по воротах'], ['cross', 'Навіс у штрафний']], 'shoot', 'Удар — для майстра стандартів, навіс — коли є високі гравці.'),
        ]);
      })(), el('p.note', 'Якщо призначеного немає на полі, б’є найкращий за атрибутами. Ролі й інструкції змінюють, хто частіше б’є, віддає й наскільки гравець допомагає в атаці чи обороні.')]),
      benchPanel(t, side, save),
      oppInstrPanel(t, save),
      el('div.panel', [
        el('h3', 'Стиль гри'),
        el('div.instr', ['mentality', 'fluid', 'pressing', 'passing'].map((g) => el('div.field', [
          el('b', { mentality: 'Ментальність', fluid: 'Плинність', pressing: 'Пресинг', passing: 'Передачі' }[g]),
          segmented(g, t[g] || (g === 'fluid' ? 'balanced' : null), (v) => { t[g] = v; save(); }),
          el('small.muted', TACTIC_HELP[g]),
        ]))),
      ]),
      teamInstrPanel(t, save),
      tipsPanel(8),
      el('div.panel', [el('h3', 'Сила ліній'), compareBarsSingle([['Атака', side.units.att], ['Контроль м’яча', side.units.mid], ['Оборона', side.units.def], ['Воротар', side.units.gk]])]),
    ];
  }

  // ---------------- Командні інструкції й інструкції гравцям (як у жанрі) ----------------
  const TI_DEF = [
    ['З м’ячем', [
      ['possession', 'Тримати м’яч', 'Менше ризику й довгих передач — м’яч у вас довше.'],
      ['tempo', 'Темп', 'Вищий — швидші рішення й більше передач уперед; нижчий — терпляче.', [[-1, 'нижчий'], [0, 'звичайний'], [1, 'вищий']]],
      ['width', 'Ширина атаки', 'Ширше — розтягнути оборону, вужче — грати компактно.', [[-1, 'вужче'], [0, 'звичайна'], [1, 'ширше']]],
      ['focus', 'Атаки', 'Через фланги — більше навісів і передач на краї; через центр — комбінації посередині.', [[null, 'усюди'], ['flanks', 'через фланги'], ['middle', 'через центр']]],
      ['playOut', 'Гра від воротаря', 'Воротар розігрує коротко замість довгого вибивання.'],
      ['workBox', 'Вводити м’яч у штрафний', 'Рідше бити здалеку — шукати удар ближче.'],
      ['shootSight', 'Бити при нагоді', 'Частіше бити з-за меж штрафного.'],
      ['crossMore', 'Більше навісів', 'Флангові частіше подають у штрафний.'],
      ['counter', 'Контратаки', 'Щойно відібрали — швидко вперед.'],
    ]],
    ['Без м’яча', [
      ['line', 'Лінія оборони', 'Вища — тиснемо вище, але простір за спиною; нижча — надійніше, але суперник ближче до воріт.', [[-1, 'нижча'], [0, 'звичайна'], [1, 'вища']]],
      ['offside', 'Офсайдна пастка', 'Частіше ловимо в офсайд, але прорив за спину — небезпечніший.'],
      ['preventGK', 'Не давати воротарю розіграш', 'Нападники тиснуть на воротаря суперника.'],
    ]],
    ['Інше', [
      ['timeWaste', 'Затягувати час', 'Коли ведемо після 70-ї — повільно відновлюємо гру.'],
      ['discipline', 'Поведінка', 'Свобода — більше імпровізації й ризику; дисципліна — менше фолів і помилок.', [[-1, 'дисципліна'], [0, 'звичайна'], [1, 'свобода']]],
    ]],
  ];
  function teamInstrPanel(t, save) {
    t.ti = t.ti || {};
    const on = Object.entries(t.ti).filter(([, v]) => v != null && v !== 0 && v !== false).length;
    return el('div.panel', [el('h3', `Командні інструкції${on ? ` · обрано ${on}` : ''}`),
      ...TI_DEF.map(([group, items]) => el('div.ti-group', [el('b', group), el('div.ti-list', items.map(([k, label, help, opts]) => {
        if (opts) return el('div.ti-item', [el('span', { title: help }, label), el('div.tabs', opts.map(([v, l]) => el('button', { type: 'button', title: help, 'aria-pressed': String((t.ti[k] ?? (typeof v === 'number' ? 0 : null)) === v), onclick: () => { if (v == null || v === 0) delete t.ti[k]; else t.ti[k] = v; save(); } }, l)))]);
        return el('label.check.ti-item', { title: help }, [el('input', { type: 'checkbox', checked: t.ti[k] || null, onchange: (e) => { if (e.target.checked) t.ti[k] = true; else delete t.ti[k]; save(); } }), ' ', label, el('small.muted', ` — ${help}`)]);
      }))])),
      el('div.actions', [on ? el('button.btn.link', { type: 'button', onclick: () => { t.ti = {}; save(); } }, 'Скинути інструкції') : null])]);
  }
  const PI_DEF = [
    ['shoot', 'Удари', [[-1, 'рідше'], [0, 'звично'], [1, 'частіше']]], ['dribble', 'Дриблінг', [[-1, 'менше'], [0, 'звично'], [1, 'більше']]],
    ['cross', 'Навіси', [[-1, 'рідше'], [0, 'звично'], [1, 'частіше']]], ['wide', 'Ширина', [[-1, 'зміщуватися в центр'], [0, 'звично'], [1, 'триматися краю']]],
    ['press', 'Тиск', [[-1, 'не тиснути'], [0, 'звично'], [1, 'тиснути сильніше']]], ['tackle', 'Відбір', [[-1, 'обережно'], [0, 'звично'], [1, 'жорсткіше']]],
  ];
  /** Інструкції гравцю на позиції i (зберігаються в тактиці, діють у детальному рушії). */
  function piDetails(t, i, save) {
    t.pi = t.pi || {};
    const cur = t.pi[i] || {};
    const n = Object.values(cur).filter((v) => v).length;
    return el('details.pi', [el('summary', `Інструкції гравцю${n ? ` (${n})` : ''}`),
      el('div.pi-grid', PI_DEF.map(([k, label, opts]) => el('label', [el('small.muted', label), el('select.tiny', { onchange: (e) => {
        const v = Number(e.target.value); t.pi[i] = { ...(t.pi[i] || {}) }; if (v) t.pi[i][k] = v; else delete t.pi[i][k];
        if (!Object.keys(t.pi[i]).length) delete t.pi[i];
        save();
      } }, opts.map(([v, l]) => el('option', { value: String(v), selected: (cur[k] || 0) === v || null }, l)))])))]);
  }

  /** Поради асистента: що варто виправити перед наступним матчем. */
  /**
   * Поради асистента перед матчем. Кожна — [рівень, текст, дія?]; дію можна застосувати кнопкою.
   * Дії: swap (інший гравець на позицію), tactic (ментальність/пресинг/передачі), mark (персональна опіка), prepWeek (розклад: тактика).
   */
  function assistantTips() {
    const tips = [];
    const t = myTactics(), side = mySide(), S = state.season;
    const xiIds = new Set(side.lineup.xi.map((x) => x.player.id));
    const reserve = new Set([...FM.youth.set(state), ...FM.medical.rested(state)]);
    const pool = availablePlayers(state.clubId).filter((p) => !xiIds.has(p.id) && !reserve.has(p.id));
    const bestFor = (slot, minFit = 0.85, minFresh = 0) => pool.filter((p) => FM.fit(p, slot) >= minFit && (p.fitness ?? 100) >= minFresh).sort((a, b) => FM.slotValue(b, slot) - FM.slotValue(a, slot))[0];
    side.lineup.xi.forEach((x, i) => {
      const f = FM.fit(x.player, x.slot);
      if (f < 0.85) {
        const c = bestFor(x.slot);
        tips.push(['bad', `${nameOf(x.player)} грає не на своїй позиції (${ROLE_SHORT(x.slot)}).${c ? ` Краще підійде ${nameOf(c)}.` : ' Знайдіть когось кращого або змініть роль.'}`,
          c && FM.slotValue(c, x.slot) > FM.slotValue(x.player, x.slot) * 1.03 ? { kind: 'swap', i, pid: c.id, label: `Поставити ${nameOf(c)}` } : null]);
      }
      if ((x.player.fitness ?? 100) < 72) {
        const c = bestFor(x.slot, 0.85, 80);
        tips.push(['warn', `${nameOf(x.player)} втомлений (${Math.round(x.player.fitness)}%). Варто дати відпочити.`, c ? { kind: 'swap', i, pid: c.id, label: `Замість нього — ${nameOf(c)}` } : null]);
      }
      if (x.auto) tips.push(['warn', `На позиції ${ROLE_SHORT(x.slot)} обраний гравець недоступний — помічник поставив ${nameOf(x.player)}.`, { kind: 'swap', i, pid: x.player.id, label: `Закріпити ${nameOf(x.player)}` }]);
    });
    const fam = familiarity()[t.formation] || 0;
    if (fam < 60) tips.push(['warn', `Команда погано знає схему ${t.formation} (${Math.round(fam)}%). Більше тактичних занять цього тижня допоможуть.`, { kind: 'prepWeek', label: 'Розклад тижня: тактика' }]);
    // суперник найближчого матчу: сила, небезпечний гравець, погода
    const ev = curEvent();
    if (ev && ev.opp && W.club(ev.opp)) {
      const oppName = clubName(W.club(ev.opp));
      const oside = FM.season.sideFor(S, W, ev.opp, null, state.clubId, !ev.home);
      const ou = FM.lineupUnits(oside.lineup), mu = side.units;
      const avg = (u) => (u.att + u.mid + u.def) / 3;
      const ratio = (avg(mu) * (ev.home ? 1.06 : 1)) / (avg(ou) * (ev.home ? 1 : 1.06));
      if (ratio < 0.9 && !['cautious', 'defensive'].includes(t.mentality)) tips.push(['warn', `${oppName} помітно сильніший. Обережна гра й низький пресинг зменшать ризик розгрому.`, { kind: 'tactic', v: { mentality: 'cautious', pressing: 'low' }, label: 'Обережно, низький пресинг' }]);
      else if (ratio > 1.12 && !['positive', 'attacking'].includes(t.mentality)) tips.push(['info', `${oppName} слабший — можна сміливіше йти вперед.`, { kind: 'tactic', v: { mentality: 'positive' }, label: 'Сміливо в атаку' }]);
      const star = oside.lineup.xi.filter((x) => ['ST', 'AM', 'W'].includes(x.slot.role)).sort((a, b) => FM.slotValue(b.player, b.slot) - FM.slotValue(a.player, a.slot))[0];
      if (star && FM.slotValue(star.player, star.slot) >= 13 && !Object.values(t.instr || {}).includes('mark')) tips.push(['info', `У суперника небезпечний ${nameOf(star.player)} (${ROLE_SHORT(star.slot)}). Його можна взяти в персональну опіку.`, { kind: 'mark', label: `Опіка: ${nameOf(star.player)}` }]);
      if (ev.f && (ev.kind === 'league' || ev.kind === 'mid')) {
        const wx = FM.weatherFor(FM.season.dateOf(ev.f.w, S), W.club(ev.f.h).league, FM.rng(`wx-${S.seed}-${ev.f.id}`));
        if ((wx === 'rain' || wx === 'snow') && t.passing === 'short') tips.push(['info', `Прогноз на матч: ${FM.WEATHER[wx].label.toLowerCase()} — коротким передачам буде важко.`, { kind: 'tactic', v: { passing: 'mixed' }, label: 'Змішані передачі' }]);
        else if (wx === 'wind' && t.passing === 'direct') tips.push(['info', 'Прогноз на матч: сильний вітер — довгі передачі не долітатимуть.', { kind: 'tactic', v: { passing: 'mixed' }, label: 'Змішані передачі' }]);
        else if (wx === 'heat' && t.pressing === 'high') tips.push(['info', 'Прогноз на матч: спека — високий пресинг швидко виснажить команду.', { kind: 'tactic', v: { pressing: 'normal' }, label: 'Звичайний пресинг' }]);
      }
    }
    const sq = W.squad(state.clubId);
    const unhappy = sq.filter((p) => FM.morale.get(p) < 30);
    if (unhappy.length) tips.push(['warn', `Незадоволені: ${unhappy.slice(0, 3).map(nameOf).join(', ')}${unhappy.length > 3 ? ' та інші' : ''}. Причини — у картках гравців.`]);
    const expiring = sq.filter((p) => (p.contract || 9999) <= S.year + 1 && FM.morale.status(W, p) === 'key');
    if (expiring.length) tips.push(['warn', `Контракти лідерів закінчуються цього сезону: ${expiring.map(nameOf).join(', ')}.`]);
    const talents = sq.filter((p) => (W.age(p) ?? 30) <= 20 && p.pa - p.ca >= 30 && !(S.ps[p.id] && S.ps[p.id][0] >= 3) && S.week >= 10);
    if (talents.length) tips.push(['info', `Талановитій молоді бракує ігор: ${talents.slice(0, 3).map(nameOf).join(', ')}. Без ігрового часу ростуть повільніше — можна віддати в оренду.`]);
    const me = W.club(state.clubId);
    if (me.wageBudget && FM.market.wageBill(W, me.id) > me.wageBudget * 0.97) tips.push(['info', 'Фонд зарплат майже вичерпано: нові контракти правління не погодить.']);
    if (sq.filter((p) => p.roles[0] === 'GK' && !p.injury).length < 2) tips.push(['bad', 'У команди лише один здоровий воротар.']);
    return tips;
  }
  /** Застосувати пораду асистента перед матчем. */
  function applyPreTip(act) {
    const t = myTactics(), side = mySide();
    if (act.kind === 'tactic') Object.assign(t, act.v);
    else if (act.kind === 'swap') {
      const ids = side.lineup.xi.map((x) => x.player.id);
      const j = ids.indexOf(act.pid), old = ids[act.i];
      ids[act.i] = act.pid; if (j >= 0 && j !== act.i) ids[j] = old;
      t.ids = ids;
    } else if (act.kind === 'mark') {
      const xi = side.lineup.xi;
      const k = xi.map((x, i) => [x, i]).filter(([x]) => ['DM', 'CB', 'FB', 'CM'].includes(x.slot.role)).sort((a, b) => ((b[0].player.attrs.tac || 10) + (b[0].player.attrs.pos || 10)) - ((a[0].player.attrs.tac || 10) + (a[0].player.attrs.pos || 10)))[0];
      if (k) { t.instr = t.instr || {}; for (const key of Object.keys(t.instr)) if (t.instr[key] === 'mark') delete t.instr[key]; t.instr[k[1]] = 'mark'; }
    } else if (act.kind === 'prepWeek') {
      const tr = training(), S = state.season, key = `${S.year}-${S.week}`, md = new Set(weekMatchDays()), days = {};
      for (const d of FM.routine.DAYS) if (!md.has(d)) days[d] = md.has(d + 1) || (d === 5 && md.has(6)) ? 'prep' : 'tactics';
      tr.sched = { key, days };
    }
    saveGame(); render();
  }
  function tipsPanel(limit = 5) {
    const tips = assistantTips();
    return el('div.panel', [el('h3', 'Поради асистента'), tips.length ? el('ul.tips', tips.slice(0, limit).map(([k, txt, act]) => el('li.tip-' + k, [txt,
      act ? el('div', el('button.btn.tiny-btn', { type: 'button', onclick: () => applyPreTip(act) }, `Застосувати: ${act.label}`)) : null]))) : el('p.muted', 'Усе гаразд — можна грати.')]);
  }
  /** Запасні (до 9): тренер обирає сам або довіряє помічникові. */
  function benchPanel(t, side, save) {
    const xi = new Set(side.lineup.xi.map((x) => x.player.id));
    const pool = availablePlayers(state.clubId).filter((p) => !xi.has(p.id) && !FM.youth.set(state).has(p.id)).sort((a, b) => FM.ROLE_ORDER.indexOf(a.roles[0]) - FM.ROLE_ORDER.indexOf(b.roles[0]) || b.ca - a.ca);
    const chosen = Array.isArray(t.bench) ? t.bench.filter((id) => pool.some((p) => p.id === id)) : null;
    const on = new Set(chosen || side.lineup.bench.map((p) => p.id));
    return el('div.panel', [el('h3', `Запасні: ${on.size} з 9${chosen ? '' : ' · обирає помічник'}`),
      el('ul.plist.bench-pick', pool.map((p) => el('li', [el('label.check', [el('input', { type: 'checkbox', checked: on.has(p.id) || null, disabled: !on.has(p.id) && on.size >= 9 || null, onchange: (e) => {
        const cur = [...on]; t.bench = e.target.checked ? cur.concat([p.id]).slice(0, 9) : cur.filter((x) => x !== p.id); save();
      } }), ' ', el('span.pos.line-' + FM.ROLE_LINE[p.roles[0]], FM.roleLabel(p.roles[0], p.side)), ' ', nameOf(p)]), starsEl(p.ca, 'Рівень')]))),
      el('div.actions', [chosen ? el('button.btn.link', { type: 'button', onclick: () => { delete t.bench; save(); } }, 'Довірити вибір помічникові') : null]),
      el('p.note', 'На лаві має бути воротар — якщо його не обрали, помічник додасть сам. Заміни під час матчу — лише з цих гравців.')]);
  }
  const OPPI = {
    tackle: ['Відбір', [['normal', 'Звичайний'], ['hard', 'Жорсткий'], ['soft', 'Обережний']], 'Жорсткий заважає атаці суперника (−3%), але більше карток; обережний — навпаки.'],
    press: ['Тиск на гравця з м’ячем', [['normal', 'Звичайний'], ['tight', 'Щільний']], 'Щільний забирає в суперника контроль (−3%), але ваші швидше втомлюються.'],
    weakFoot: ['Змушувати бити незручною ногою', [[false, 'Ні'], [true, 'Так']], 'Удари суперника трохи гірші (−3%).'],
  };
  /** Інструкції проти суперника (як у FM). */
  function oppInstrPanel(t, save) {
    t.oppi = t.oppi || {};
    return el('div.panel', [el('h3', 'Інструкції проти суперника'), el('div.instr', Object.entries(OPPI).map(([k, [label, opts, help]]) => el('div.field', [el('b', label),
      el('div.tabs', opts.map(([v, l]) => el('button', { type: 'button', 'aria-pressed': String(String(t.oppi[k] ?? opts[0][0]) === String(v)), onclick: () => { t.oppi[k] = v; save(); } }, l))),
      el('small.muted', help)])))]);
  }

  /** Словесна дуель з тренером-суперником перед матчем. */
  function feudPanel(oppId) {
    const f = FM.rivals.feud(W, state);
    if (!f || f.club !== oppId) return null;
    const S = state.season, key = `${S.year}-${S.week}`;
    const done = state.mind && state.mind.key === key;
    return el('div.feud', [el('b', `🔥 Особиста ворожнеча: ${f.name} (${clubName(W.club(f.club))})`),
      el('small.muted', ` · градус ${'🔥'.repeat(f.heat)} · ваші матчі: ${f.w} В, ${f.d} Н, ${f.l} П`),
      done ? el('p', state.mind.text) : el('div', [el('p.small', 'Журналісти чекають вашого коментаря про суперника.'), el('div.talk-opts', Object.entries(FM.rivals.JABS).map(([k, d]) => el('button.btn', { type: 'button', title: d.hint, onclick: () => {
        const r = FM.rivals.duel(W, state, k, FM.rng(`duel-${S.seed}-${key}`)); state.mind = { key, boost: r.boost, text: r.text, club: oppId }; FM.market.news(state, `Словесна дуель з ${f.name}: ${r.text}`, 'match'); saveGame(); render();
      } }, d.label)))])]);
  }

  /** Тактика на матч — прямо на екрані матчу: набір А/Б/В, ментальність, пресинг, передачі. */
  function matchTacticPanel() {
    const t = myTactics(), save = () => { saveGame(); render(); };
    return el('div.match-tactic', [el('b', `Тактика на матч · ${t.formation}`),
      el('div.tabs', TSETS.filter((k) => (state.tacticSets || {})[k] || k === (state.tacticKey || 'A')).map((k) => el('button', { type: 'button', 'aria-pressed': String((state.tacticKey || 'A') === k), onclick: () => { switchTacticSet(k); save(); } },
        `${TSET_UK[k]} · ${((state.tacticSets || {})[k] || t).formation}`))),
      el('div.instr', ['mentality', 'pressing', 'passing'].map((g) => el('div.field', [el('small.muted', { mentality: 'Ментальність', pressing: 'Пресинг', passing: 'Передачі' }[g]), segmented(g, t[g], (v) => { t[g] = v; save(); })]))),
      el('details', [el('summary', 'Проти суперника'), el('div.instr', Object.entries(OPPI).map(([k, [label, opts]]) => { t.oppi = t.oppi || {}; return el('div.field', [el('small.muted', label),
        el('div.tabs', opts.map(([v, l]) => el('button', { type: 'button', 'aria-pressed': String(String(t.oppi[k] ?? opts[0][0]) === String(v)), onclick: () => { t.oppi[k] = v; save(); } }, l)))]); }))]),
      el('div.actions', [el('a.btn', { href: '#tactics' }, '👕 Змінити склад на матч'), el('a.btn.link', { href: '#tactics' }, 'Схема, ролі й запасні — у «Тактиці»')])]);
  }

  function compareBarsSingle(rows) {
    const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    return el('div.compare', rows.map(([label, v]) => el('div.crow.single', [el('div', [el('small', label), el('div.cbar', el('span.ch', { style: { width: (v / 20 * 100) + '%' } }))]), el('b', f1(v))])));
  }

  // ---------------- Матч ----------------
  let pre = null; // налаштування товариського матчу
  let liveTimer = null;
  // Швидкість трансляції: мілісекунд на ігрову хвилину (93 хвилини матчу). 'key' — тихі хвилини швидко, на моментах — пауза.
  // Рушій матчу: детальний (22 гравці на полі, js/sim.js) — для матчів вашого клубу; інші ліги — класичний, швидкий
  const ENGINE_KEY = 'golovnyi-trener:engine';
  let engineMode = (() => { try { return localStorage.getItem(ENGINE_KEY) === 'classic' ? 'classic' : 'sim'; } catch (_) { return 'sim'; } })();
  const setEngine = (v) => { engineMode = v; try { localStorage.setItem(ENGINE_KEY, v); } catch (_) { /* приватне вікно */ } };
  FM.match.simFor = (o) => engineMode === 'sim' && !!state && [o.home, o.away].some((sd) => sd && sd.club && (sd.club.id === state.clubId || (FM.duo && sd.club.id === FM.duo.otherClub(state))));
  // Налаштування трансляції (як прийнято в жанрі): швидкість під час моментів і між ними, які моменти показувати,
  // поділений екран, повтори, інформація про матч між моментами.
  const BC_KEY = 'golovnyi-trener:bcast';
  const BC_DURING = [[30000, 'У темпі гри'], [6400, 'Дуже повільно'], [3900, 'Повільно'], [1950, 'Звичайно'], [970, 'Швидко'], [320, 'Дуже швидко']];
  const BC_BETWEEN = [[1950, 'Звичайно'], [970, 'Швидко'], [320, 'Дуже швидко'], [0, 'Миттєво']];
  const BC_HL = [['key', 'Ключові'], ['ext', 'Розширені'], ['full', 'Повні'], ['all', 'Весь матч']];
  const BC_HL_HINT = { key: 'Голи, великі моменти, пенальті, вилучення.', ext: 'Ще всі удари, картки й травми.', full: 'Ще атаки й стандарти — майже вся гра.', all: 'Кожна хвилина в однаковому темпі.' };
  const BC_SIDE = [['table', 'Таблиця ліги'], ['stats', 'Статистика'], ['squad', 'Мої гравці'], ['others', 'Інші матчі'], ['events', 'Події']];
  let bc = (() => {
    const def = { during: 1950, between: 0, hl: 'ext', split: true, side: 'right', panel: 'table', replays: 'goals', info: true };
    try { const v = JSON.parse(localStorage.getItem(BC_KEY) || 'null'); if (v) return { ...def, ...v }; } catch (_) { /* приватне вікно */ }
    try { const old = localStorage.getItem('golovnyi-trener:speed'); if (old === 'key') return { ...def, hl: 'key' }; if (old && Number(old)) return { ...def, during: Number(old) }; } catch (_) { /* приватне вікно */ }
    return def;
  })();
  const saveBc = () => { try { localStorage.setItem(BC_KEY, JSON.stringify(bc)); } catch (_) { /* приватне вікно */ } };
  /** Чи є подія моментом для рівня показу. */
  function isHighlight(e, lvl) {
    if (lvl === 'all') return true;
    const big = e.type === 'goal' || e.type === 'red' || e.type === 'penalty' || (e.hl && (e.hl.out === 'goal' || e.hl.out === 'post' || e.hl.out === 'pen' || e.hl.xg >= 0.2));
    if (lvl === 'key') return big;
    const ext = big || !!e.hl || e.type === 'chance' || e.type === 'miss' || e.type === 'yellow' || e.type === 'injury';
    if (lvl === 'ext') return ext;
    return ext || e.type === 'play' || e.type === 'sub';
  }
  /** Відрізки хвилини (індекси кадрів), які показуються як моменти: передісторія атаки + удар. */
  function hlWindows(events, n, dt, lvl) {
    if (lvl === 'all') return [[0, n]];
    const pre = lvl === 'key' ? 10 : lvl === 'ext' ? 12 : 16, post = lvl === 'full' ? 5 : 4;
    const w = [];
    for (const e of events) {
      if (e.sec == null || !isHighlight(e, lvl)) continue;
      const a = Math.max(0, Math.floor((e.sec - pre) / dt)), b = Math.min(n, Math.ceil((e.sec + post) / dt));
      if (w.length && a <= w[w.length - 1][1]) w[w.length - 1][1] = Math.max(w[w.length - 1][1], b); else w.push([a, b]);
    }
    return w;
  }
  let activeLive = null; // поточна трансляція: якщо піти з неї — матч догравається й записується
  // Виділення моментів, як у FM: які удари показувати смугою над полем з паузою
  const HL_MODES = [['goals', 'Лише голи'], ['key', 'Небезпечні моменти'], ['all', 'Усі удари'], ['none', 'Без виділення']];
  let hlMode = (() => { try { const v = localStorage.getItem('golovnyi-trener:hl'); return HL_MODES.some(([k]) => k === v) ? v : 'key'; } catch (_) { return 'key'; } })();
  const setHl = (v) => { hlMode = v; try { localStorage.setItem('golovnyi-trener:hl', v); } catch (_) { /* приватне вікно */ } };
  const HL_OUT = { goal: 'ГОЛ!', saved: 'Сейв воротаря', wide: 'Повз ворота', blocked: 'Блок захисника', post: 'Штанга!', pen: 'Пенальті не забито' };
  /** Чи виділяти подію: голи — завжди (якщо не вимкнено), небезпечні — xG ≥ 0,12, штанги й пенальті. */
  const shouldHl = (e) => !!e.hl && hlMode !== 'none' && (e.hl.out === 'goal' || (hlMode === 'all') || (hlMode === 'key' && (e.hl.xg >= 0.12 || e.hl.out === 'post' || e.hl.out === 'pen')));

  function teamSide(clubId) {
    if (clubId === state.clubId) return mySide();
    const players = W.squad(clubId);
    const formation = FM.bestFormation(players);
    const lineup = FM.pickLineup(players, formation);
    return { club: W.club(clubId), players, formation, lineup, units: FM.lineupUnits(lineup) };
  }

  function lineupList(side) {
    return el('ol.xi', side.lineup.xi.map((x) => el('li', [
      el('span.pos.line-' + FM.ROLE_LINE[x.slot.role], ROLE_SHORT(x.slot)),
      el('a', { href: '#player-' + x.player.id }, nameOf(x.player)),
      el('span.muted', String(Math.round(FM.slotValue(x.player, x.slot) * 10) / 10).replace('.', ',')),
    ])));
  }

  function compareBars(rows) {
    return el('div.compare', rows.map(([label, a, b, fmtv]) => {
      const total = (a + b) || 1;
      const bar = el('div.cbar', [el('span.ch', { style: { width: (100 * a / total) + '%' } }), el('span.ca', { style: { width: (100 * b / total) + '%' } })]);
      return el('div.crow', [el('b', fmtv ? fmtv(a) : a), el('div', [el('small', label), bar]), el('b', fmtv ? fmtv(b) : b)]);
    }));
  }

  function screenMatch() {
    const my = W.club(state.clubId);
    if (!pre) {
      const others = W.clubsOf(my.league).filter((c) => c.id !== my.id);
      pre = { league: my.league, opp: others.sort((a, b) => W.clubLevel(b.id) - W.clubLevel(a.id))[0].id, home: true };
    }
    const leagueClubs = W.clubsOf(pre.league).filter((c) => c.id !== my.id);
    if (!leagueClubs.some((c) => c.id === pre.opp)) pre.opp = leagueClubs[0].id;
    const mine = teamSide(my.id), opp = teamSide(pre.opp);
    const [hs, as] = pre.home ? [mine, opp] : [opp, mine];
    const select = el('select', { id: 'opponent', onchange: (e) => { pre.opp = e.target.value; render(); } },
      leagueClubs.map((c) => el('option', { value: c.id, selected: c.id === pre.opp || null }, clubName(c))));
    const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    const history = (state.friendlies || []).slice(-6).reverse();

    return [
      el('header', [el('h1', 'Товариський матч'), el('span.muted', 'Не впливає на таблицю й статистику сезону')]),
      el('div.panel', [
        el('h3', 'Суперник'),
        el('div.tabs', W.db.leagues.map((l) => el('button', { type: 'button', 'aria-pressed': String(l.id === pre.league), onclick: () => { pre.league = l.id; pre.opp = W.clubsOf(l.id).find((c) => c.id !== my.id).id; render(); } }, l.name))),
        el('div.pre-row', [
          el('div.field', [el('label', { for: 'opponent' }, 'Клуб'), select]),
          el('div.field', [el('span', 'Де граємо'), el('div.tabs', [
            el('button', { type: 'button', 'aria-pressed': String(pre.home), onclick: () => { pre.home = true; render(); } }, 'Вдома'),
            el('button', { type: 'button', 'aria-pressed': String(!pre.home), onclick: () => { pre.home = false; render(); } }, 'На виїзді'),
          ])]),
          el('button.btn.primary.kick', { type: 'button', onclick: () => startFriendly() }, 'Почати матч'),
        ]),
      ]),
      el('div.panel', [
        el('div.vs', [
          el('div.vs-team', [badge(hs.club, true), el('b', clubName(hs.club)), el('small.muted', `${hs.formation} · господарі`)]),
          el('div.vs-mid', 'проти'),
          el('div.vs-team', [badge(as.club, true), el('b', clubName(as.club)), el('small.muted', `${as.formation} · гості`)]),
        ]),
        compareBars([
          ['Атака', hs.units.att, as.units.att, f1], ['Контроль м’яча', hs.units.mid, as.units.mid, f1],
          ['Оборона', hs.units.def, as.units.def, f1], ['Воротар', hs.units.gk, as.units.gk, f1],
        ]),
        el('p.note', ['Сила ліній — середня оцінка гравців на їхніх позиціях за шкалою 1–20. Ваш склад і схема — з ', el('a', { href: '#tactics' }, 'тактики'), '.']),
      ]),
      el('div.grid', [
        el('div.panel', [el('h3', `${clubName(hs.club)}: склад`), lineupList(hs)]),
        el('div.panel', [el('h3', `${clubName(as.club)}: склад`), lineupList(as)]),
      ]),
      history.length ? el('div.panel', [el('h3', 'Останні матчі'), el('ul.plist', history.map((h) => el('li', [
        el('span', `${h.home} — ${h.away}`), el('b', h.score)])))]) : null,
    ];
  }

  function engineSide(side, manual) {
    return { club: { ...side.club, name: clubName(side.club) }, players: side.players, formation: side.formation, lineup: side.lineup,
      mentality: side.mentality, pressing: side.pressing, passing: side.passing, takers: side.takers, setp: side.setp, oppi: side.oppi, familiarity: side.familiarity, fluid: side.fluid, ti: side.ti, manual };
  }

  function startFriendly() {
    const mine = teamSide(state.clubId), opp = teamSide(pre.opp);
    const [hs, as] = pre.home ? [mine, opp] : [opp, mine];
    const myK = pre.home ? 0 : 1;
    const R0 = FM.rng(Date.now());
    const M = FM.match.create({ home: engineSide(hs, myK === 0), away: engineSide(as, myK === 1), seed: `${hs.club.id}-${as.club.id}-${Date.now()}`, name: nameOf, gen: genOf,
      weather: FM.weatherFor(FM.season.dateOf(state.season.week, state.season), hs.club.league, R0) });
    showLive('match', hs, as, M, myK, (r) => {
      state.friendlies = (state.friendlies || []).concat([{ home: clubName(hs.club), away: clubName(as.club), score: r.score.join(':') }]).slice(-20);
      saveGame();
    }, [['Зіграти ще раз', () => startFriendly(), true], ['Інший суперник', () => render()]]);
  }

  function showLive(active, hs, as, M, myK, onFinish, actions, extra) {
    app.replaceChildren(shell(active, liveView(hs, as, M, myK, onFinish, actions, extra)));
    window.scrollTo(0, 0);
  }

  /** Карта ударів (розмір — xG, заповнені — голи) і графік накопиченого xG. */
  function matchSummary(m, hs, as) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); for (const c of kids) n.append(c); return n; };
    const col = (k) => (k === 0 ? 'var(--accent)' : 'var(--warn)');
    const map = svg('svg', { viewBox: '0 0 100 64', class: 'shotmap', role: 'img', 'aria-label': 'Карта ударів' }, [
      svg('rect', { x: 0.5, y: 0.5, width: 99, height: 63, rx: 1, class: 'sm-pitch' }),
      svg('line', { x1: 50, y1: 0.5, x2: 50, y2: 63.5, class: 'sm-line' }),
      svg('rect', { x: 0.5, y: 17, width: 14, height: 30, class: 'sm-line' }), svg('rect', { x: 85.5, y: 17, width: 14, height: 30, class: 'sm-line' }),
      ...m.shots.map((sh) => {
        const x = sh.t === 0 ? sh.x : 100 - sh.x, y = (sh.t === 0 ? sh.y : 100 - sh.y) * 0.64;
        const c = svg('circle', { cx: x, cy: y, r: 0.9 + sh.xg * 6, style: `fill:${sh.goal ? col(sh.t) : 'none'};stroke:${col(sh.t)}` });
        c.append(svg('title', {}, [document.createTextNode(`${sh.min}′ · xG ${String(sh.xg).replace('.', ',')}${sh.goal ? ' · гол' : ''}`)]));
        return c;
      }),
    ]);
    // xG за хвилинами
    const end = Math.max(93, ...m.shots.map((s) => s.min));
    const line = (k) => {
      let acc = 0; const pts = [[0, 0]];
      for (const sh of m.shots.filter((s) => s.t === k).sort((a, b) => a.min - b.min)) { pts.push([sh.min, acc]); acc += sh.xg; pts.push([sh.min, acc]); }
      pts.push([end, acc]);
      return { pts, acc };
    };
    const L0 = line(0), L1 = line(1);
    const maxY = Math.max(1, L0.acc, L1.acc);
    const toP = (pts) => pts.map(([x, y]) => `${(x / end) * 96 + 2},${38 - (y / maxY) * 34}`).join(' ');
    const chart = svg('svg', { viewBox: '0 0 100 42', class: 'xgchart', role: 'img', 'aria-label': 'Очікувані голи за хвилинами' }, [
      svg('line', { x1: 2, y1: 38, x2: 98, y2: 38, class: 'sm-axis' }),
      svg('line', { x1: 2 + 96 * 45 / end, y1: 4, x2: 2 + 96 * 45 / end, y2: 38, class: 'sm-grid' }),
      svg('polyline', { points: toP(L1.pts), style: `fill:none;stroke:${col(1)};stroke-width:1.2` }),
      svg('polyline', { points: toP(L0.pts), style: `fill:none;stroke:${col(0)};stroke-width:1.2` }),
    ]);
    const f2 = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    // середні позиції й активність: де стояв гравець (за схемою) і скільки дій зробив
    const posMap = svg('svg', { viewBox: '0 0 100 64', class: 'shotmap', role: 'img', 'aria-label': 'Середні позиції й активність гравців' }, [
      svg('rect', { x: 0.5, y: 0.5, width: 99, height: 63, rx: 1, class: 'sm-pitch' }),
      svg('line', { x1: 50, y1: 0.5, x2: 50, y2: 63.5, class: 'sm-line' }),
      svg('rect', { x: 0.5, y: 17, width: 14, height: 30, class: 'sm-line' }), svg('rect', { x: 85.5, y: 17, width: 14, height: 30, class: 'sm-line' }),
      ...[0, 1].flatMap((k) => {
        const rs = m.ratings.filter((r) => r.team === k && r.slot && !r.on && r.st);
        const xy = layoutXY(rs.map((r) => r.slot));
        const push = (k === 0 ? m.stats[0].poss - 50 : m.stats[1].poss - 50) * 0.12; // хто володів — вище на полі
        return rs.map((r, i) => {
          const depth = 100 - xy[i][1];
          let x = 6 + depth * 0.85 + push; if (k === 1) x = 100 - x;
          const y = (k === 0 ? xy[i][0] : 100 - xy[i][0]) * 0.64;
          const act = r.st.passes + r.st.tackles * 3 + r.st.dribbles * 2 + r.st.shots * 3;
          const c = svg('circle', { cx: Math.max(3, Math.min(97, x)), cy: y, r: 1.4 + Math.sqrt(act) * 0.28, style: `fill:${col(k)};fill-opacity:0.35;stroke:${col(k)}` });
          c.append(svg('title', {}, [document.createTextNode(`${nameOf(r.player)} · оцінка ${String(r.rating).replace('.', ',')} · передач ${r.st.passes}`)]));
          return c;
        });
      }),
    ]);
    // теплова карта: де команда діяла — позиції гравців за схемою, зсув за володінням, вага — дії гравця; удари — гарячіше
    const heat = (k) => {
      const GX = 12, GY = 8, g = Array.from({ length: GX * GY }, () => 0);
      const add = (x, y, w) => { for (let i = 0; i < GX; i++) for (let j = 0; j < GY; j++) { const dx = (i + 0.5) * (100 / GX) - x, dy = (j + 0.5) * (64 / GY) - y; g[j * GX + i] += w * Math.exp(-(dx * dx + dy * dy) / 140); } };
      const rs = m.ratings.filter((r) => r.team === k && r.slot && r.st && r.st.min > 0);
      const xy = layoutXY(rs.map((r) => r.slot));
      const push = (m.stats[k].poss - 50) * 0.25;
      rs.forEach((r, i) => {
        const depth = 100 - xy[i][1];
        let x = 6 + depth * 0.85 + push; if (k === 1) x = 100 - x;
        const y = (k === 0 ? xy[i][0] : 100 - xy[i][0]) * 0.64;
        const act = (r.st.passes + r.st.tackles * 3 + r.st.dribbles * 2 + r.st.interceptions * 2) * (r.st.min / 93);
        add(Math.max(3, Math.min(97, x)), y, act);
        add(Math.max(3, Math.min(97, x + (k === 0 ? 8 : -8))), y, act * 0.4); // рух уперед з м'ячем
      });
      for (const sh of m.shots.filter((x) => x.t === k)) add(k === 0 ? sh.x : 100 - sh.x, (k === 0 ? sh.y : 100 - sh.y) * 0.64, 10);
      const max = Math.max(...g) || 1;
      return svg('svg', { viewBox: '0 0 100 64', class: 'shotmap heat', role: 'img', 'aria-label': 'Теплова карта ' + clubName(k === 0 ? hs.club : as.club) }, [
        svg('rect', { x: 0.5, y: 0.5, width: 99, height: 63, rx: 1, class: 'sm-pitch' }),
        ...g.map((v, n) => svg('rect', { x: (n % GX) * (100 / GX), y: Math.floor(n / GX) * (64 / GY), width: 100 / GX, height: 64 / GY, style: `fill:${col(k)};fill-opacity:${(0.05 + (v / max) * 0.7).toFixed(2)}` })),
        svg('line', { x1: 50, y1: 0.5, x2: 50, y2: 63.5, class: 'sm-line' }),
        svg('rect', { x: 0.5, y: 17, width: 14, height: 30, class: 'sm-line' }), svg('rect', { x: 85.5, y: 17, width: 14, height: 30, class: 'sm-line' }),
      ]);
    };
    const heatBox = el('div');
    const heatTabs = el('div.tabs');
    const showHeat = (k) => { heatBox.replaceChildren(heat(k)); heatTabs.replaceChildren(...[0, 1].map((i) => el('button', { type: 'button', 'aria-pressed': String(i === k), onclick: () => showHeat(i) }, clubName(i === 0 ? hs.club : as.club)))); };
    showHeat(0);
    // володіння по 15 хвилин
    const segs = (m.possSeg || []).map((v, i) => [`${i * 15}–${i === 5 ? '90+' : (i + 1) * 15}′`, v]);
    const possBars = segs.length ? el('div.poss-segs', segs.map(([label, v]) => v == null ? null : el('div.ps', { title: `${label}: ${v}% — ${100 - v}%` }, [
      el('small.muted', label), el('div.ps-bar', [el('span', { style: { width: v + '%', background: col(0) } }), el('span', { style: { width: (100 - v) + '%', background: col(1) } })]), el('small', `${v}:${100 - v}`)]))) : null;
    const keyEv = m.events.filter((e) => ['goal', 'red', 'injury', 'miss'].includes(e.type));
    const statTable = (k, club) => dataTable('mstats', {
      rows: m.ratings.filter((r) => r.team === k && r.st), caption: clubName(club), flat: false,
      cols: [
        { k: 'name', label: 'Гравець', v: (r) => nameOf(r.player), cell: (r) => [el('a', { href: '#player-' + r.id }, nameOf(r.player)), el('small.muted', ` ${FM.roleLabel(r.role, r.slot && r.slot.side)}`)], asc: true },
        { k: 'rating', label: 'Оц.', full: 'Оцінка', v: (r) => r.rating, cell: (r) => String(r.rating).replace('.', ','), num: true },
        { k: 'h1', label: '1 т.', full: 'Оцінка за 1-й тайм', v: (r) => r.h1, cell: (r) => (r.h1 != null ? String(r.h1).replace('.', ',') : '—'), num: true },
        { k: 'h2', label: '2 т.', full: 'Оцінка за 2-й тайм', v: (r) => r.h2, cell: (r) => (r.h2 != null ? String(r.h2).replace('.', ',') : '—'), num: true },
        { k: 'min', label: 'Хв', full: 'Хвилини', v: (r) => r.st.min, num: true },
        { k: 'g', label: 'Г', full: 'Голи', v: (r) => r.goals, cell: (r) => r.goals || '', num: true },
        { k: 'a', label: 'П', full: 'Гольові передачі', v: (r) => r.assists, cell: (r) => r.assists || '', num: true },
        { k: 'sh', label: 'Уд', full: 'Удари', v: (r) => r.st.shots, cell: (r) => r.st.shots || '', num: true },
        { k: 'kp', label: 'Кл. п.', full: 'Ключові передачі', v: (r) => r.st.keyPasses, cell: (r) => r.st.keyPasses || '', num: true },
        { k: 'pas', label: 'Передачі', v: (r) => r.st.passes, cell: (r) => (r.st.passes ? `${r.st.passOk}/${r.st.passes}` : ''), num: true },
        { k: 'pct', label: '% пер.', full: 'Точність передач', v: (r) => (r.st.passes ? Math.round((r.st.passOk / r.st.passes) * 100) : null), cell: (r) => (r.st.passes ? Math.round((r.st.passOk / r.st.passes) * 100) + '%' : ''), num: true, hide: true },
        { k: 'tk', label: 'Відб.', full: 'Відбори', v: (r) => r.st.tackles, cell: (r) => r.st.tackles || '', num: true },
        { k: 'int', label: 'Перех.', full: 'Перехоплення', v: (r) => r.st.interceptions, cell: (r) => r.st.interceptions || '', num: true },
        { k: 'dr', label: 'Дриб.', full: 'Дриблінг', v: (r) => r.st.dribbles, cell: (r) => r.st.dribbles || '', num: true },
        { k: 'du', label: 'Єдиноб.', full: 'Єдиноборства', v: (r) => r.st.duels, cell: (r) => r.st.duels || '', num: true, hide: true },
        { k: 'bl', label: 'Блок/сейв', v: (r) => (r.role === 'GK' ? r.st.saves : r.st.blocks), cell: (r) => (r.role === 'GK' ? r.st.saves : r.st.blocks || ''), num: true },
      ],
    });
    return el('div', [el('div.grid', [
      el('div.panel', [el('h3', 'Карта ударів'), map, el('div.legend', [el('span', [el('i', { style: { background: 'var(--accent)' } }), clubName(hs.club)]), el('span', [el('i', { style: { background: 'var(--warn)' } }), clubName(as.club)]), el('span', 'коло більше — момент кращий; заповнене — гол')])]),
      el('div.panel', [el('h3', 'Очікувані голи (xG) за матч'), chart, el('p.muted', `${clubName(hs.club)} ${f2(L0.acc)} · ${clubName(as.club)} ${f2(L1.acc)} · вертикальна лінія — перерва${m.weather ? ' · погода: ' + FM.WEATHER[m.weather].label.toLowerCase() : ''}`)]),
      el('div.panel', [el('h3', 'Теплова карта'), heatTabs, heatBox, el('p.muted', 'Де команда діяла найбільше: позиції гравців, їхні дії й удари.')]),
      possBars ? el('div.panel', [el('h3', 'Володіння по 15 хвилин'), possBars, m.scoreHT ? el('p.muted', `Перший тайм — ${m.scoreHT.join(':')}.`) : null]) : null,
      el('div.panel', [el('h3', 'Середні позиції й активність'), posMap, el('p.muted', 'Більше коло — більше дій (передачі, відбори, дриблінг, удари). Наведіть на коло, щоб побачити гравця.')]),
      el('div.panel', [el('h3', 'Ключові моменти'), keyEv.length ? el('ol.feed.compact', keyEv.map((e) => el('li.ev-' + e.type, [el('b', e.min + '′ '), e.text]))) : el('p.muted', 'Без яскравих моментів.'),
        el('dl.facts', [el('dt', 'Передачі (точність)'), el('dd', `${m.stats[0].passes} (${m.stats[0].passPct}%) — ${m.stats[1].passes} (${m.stats[1].passPct}%)`),
          el('dt', 'Відбори'), el('dd', `${m.stats[0].tackles} — ${m.stats[1].tackles}`)])]),
    ]), el('div.panel', [el('h3', 'Статистика гравців'), statTable(0, hs.club), statTable(1, as.club),
      el('p.note', '1 т., 2 т. — оцінки за таймами. Г — голи, П — гольові передачі, Уд — удари, Кл. п. — ключові передачі (з яких був удар), Відб. — відбори, Перех. — перехоплення, Дриб. — успішний дриблінг.')])]);
  }

  /**
   * Трансляція з керуванням. M — покроковий матч (FM.match.create), myK — 0/1 (наша команда) або null.
   * onFinish(результат) викликається рівно один раз — і коли дограли, і коли пішли з екрана посеред матчу.
   */
  /** Розмова з командою після матчу: мораль кожного, хто грав. */
  function postTalkPanel(m, myK) {
    const box = el('div.panel.post-talk');
    const diff = m.score[myK] - m.score[1 - myK];
    const draw = (res) => box.replaceChildren(el('h3', 'Розмова з командою після матчу'),
      res ? el('ul.plist', res.map((x) => el('li', [el('span', nameOf(x.p)), el('span.chip.' + (x.d >= 1 ? 'ok' : x.d <= -1 ? 'bad' : 'info'), `${x.r}${x.d ? ` (${x.d > 0 ? '+' : ''}${String(x.d).replace('.', ',')})` : ''}`)])))
        : el('div', [el('p.muted', diff > 0 ? 'Перемога. Що скажете гравцям?' : diff < 0 ? 'Поразка. Що скажете гравцям?' : 'Нічия. Що скажете гравцям?'),
          el('div.talk-opts', Object.entries(FM.morale.POST_TALKS).map(([k, d]) => el('button.btn', { type: 'button', title: d.hint, onclick: () => {
            const res = FM.morale.postTalk(k, diff, m.ratings.filter((r) => r.team === myK && r.player.club === state.clubId), FM.rng(`post-${Date.now()}`));
            saveGame(); draw(res);
          } }, d.label)))]));
    draw(null);
    return box;
  }

  /** replaceChildren без «null»: порожні блоки (null/false) пропускаються. */
  const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((x) => x != null && x !== false));

  /**
   * Рахунки інших матчів туру по ходу вашого (вони вже зіграні — показуємо голи до поточної хвилини)
   * і таблиця наживо: яке ви зараз місце.
   */
  function liveTicker(f, M, myK) {
    const S = state.season, L = f.l, round = f.r;
    const others = S.fixtures.filter((x) => x.l === L && x.r === round && x.id !== f.id && x.s);
    const at = (x, min) => { const s = [0, 0]; for (const [k, m] of x.gm || []) if (m <= min) s[k]++; if (!x.gm && min >= 93) return x.s.slice(); return s; };
    const table = (min, myScore) => {
      const rows = new Map(W.clubsOf(L).map((c) => [c.id, { id: c.id, pts: 0, gd: 0, gf: 0 }]));
      const add = (h, a, sc) => { const H = rows.get(h), A = rows.get(a); if (!H || !A) return; H.gf += sc[0]; A.gf += sc[1]; H.gd += sc[0] - sc[1]; A.gd += sc[1] - sc[0];
        if (sc[0] > sc[1]) H.pts += 3; else if (sc[0] < sc[1]) A.pts += 3; else { H.pts++; A.pts++; } };
      for (const x of S.fixtures) if (x.l === L && x.s && x.r !== round) add(x.h, x.a, x.s);
      for (const x of others) add(x.h, x.a, at(x, min));
      add(f.h, f.a, myScore);
      const t = [...rows.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      return t.findIndex((r) => r.id === state.clubId) + 1;
    };
    const before = (() => { const t = FM.season.table({ ...S, fixtures: S.fixtures.filter((x) => x.r !== round || x.l !== L) }, W, L); return t.findIndex((r) => r.id === state.clubId) + 1; })();
    const box = el('div.live-ticker', { 'aria-live': 'off' });
    const draw = () => {
      const min = M.minuteNum || 0, sc = M.liveStats().map((x) => x.goals);
      const pos = table(min, sc);
      box.replaceChildren(
        el('span.lt-pos', [el('b', `Зараз ви ${pos}-і`), pos !== before ? el('span.' + (pos < before ? 'up' : 'down'), ` ${pos < before ? '▲' : '▼'}${Math.abs(pos - before)}`) : null]),
        el('span.lt-games', others.map((x) => { const s2 = at(x, min); const chg = (x.gm || []).some(([, m]) => m <= min && m > min - 3);
          return el('span.lt-g' + (chg ? '.flash' : ''), `${clubName(W.club(x.h))} ${s2[0]}:${s2[1]} ${clubName(W.club(x.a))}`); })),
      );
    };
    draw();
    return { box, draw };
  }

  /** Стаття про матч (і коротка новина в пошту, якщо грала ваша команда). */
  function matchArticle(m, hs, as, myK, extra) {
    if (!FM.report) return null;
    const f = extra && extra.fixture;
    let att = null;
    if (f && state && hs.club && W.club(hs.club.id)) {
      const S = state.season, lg = W.club(hs.club.id).league, t = FM.season.table(S, W, lg), pos = t.findIndex((r) => r.id === hs.club.id) + 1;
      const rel = t.length > 1 ? 1 - (pos - 1) / (t.length - 1) : 0.5;
      const a = FM.money.attendance(W, state, hs.club.id, as.club.id, rel, FM.rivals.derby(W, hs.club.id, as.club.id), m.weather);
      att = a.n;
      if (hs.club.id === state.clubId) state.matchAtt = { s: S.year, opp: as.club.id, n: a.n, fill: a.fill };
    }
    const r = FM.report.article(m, { home: clubName(hs.club), away: clubName(as.club), name: nameOf, stadium: f ? hs.club.stadium : null, att,
      comp: f && W.league(f.l) ? W.league(f.l).name : null, myK, manager: state ? state.manager : null });
    if (state && myK != null) { FM.market.news(state, `Преса: «${r.head}». ${r.paras[0] || ''}`, 'match'); saveGame(); }
    return r;
  }

  function liveView(hs, as, M, myK, onFinish, actions, extra) {
    const ticker = extra && extra.fixture && state ? liveTicker(extra.fixture, M, myK) : null;
    const scoreEl = el('div.sb-score', '0:0');
    const clock = el('div.sb-clock', '0′');
    const feed = el('ol.feed', { 'aria-live': 'polite' });
    const after = el('div.after');
    const statsBox = el('div');
    const control = el('div.panel.control');
    // ---- екран трансляції (як прийнято в жанрі): верхня панель із годинником і смугами команд, вкладки,
    // повний / поділений екран, бічна панель, кнопки відтворення, налаштування, шкала матчу, рядок коментаря ----
    const hasCtl = myK != null && !!state;
    const TABS = [['overview', 'Огляд'], ['pitch', 'Поле'], ['tactics', 'Тактика'], ['stats', 'Статистика'], ['analysis', 'Аналіз']].filter(([k]) => k !== 'tactics' || hasCtl);
    let tab = hasCtl ? 'tactics' : 'pitch', autoTab = hasCtl;
    const tabsEl = el('div.bc-tabs', { role: 'tablist', 'aria-label': 'Розділи трансляції' });
    const panes = {};
    function drawTabs() { tabsEl.replaceChildren(...TABS.map(([k, l]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k), onclick: () => { autoTab = false; setTab(k); } }, l))); }
    function setTab(t) {
      tab = t;
      for (const [k, pn] of Object.entries(panes)) pn.hidden = k !== t;
      drawTabs();
      if (t === 'analysis') drawAnalysis(true);
      if (t === 'stats') drawPlayers();
    }
    const splitEl = el('div.bc-split');
    function drawSplit() { splitEl.replaceChildren(...[[false, 'Повний'], [true, 'Поділений']].map(([v, l]) => el('button', { type: 'button', 'aria-pressed': String(!!bc.split === v), onclick: () => { bc.split = v; saveBc(); drawLayout(); drawSplit(); } }, l))); }
    const lum2 = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    const teamBar = (k) => { const c = k === 0 ? hs.club : as.club, b = el('div.bc-teambar' + (k ? '.away' : ''), [badge(c), el('b', clubName(c))]); b.style.setProperty('--tc', kit[k][0]); b.style.setProperty('--tt', lum2(kit[k][0]) > 0.6 ? '#111' : '#fff'); return b; };
    let curScore = [0, 0];
    // бічна панель (поділений екран)
    const bodyEl = el('div.bc-body'), sideEl = el('aside.bc-side'), sideStats = el('div'), statsBox2 = el('div'), playersBox = el('div.grid'), analysisBox = el('div.panel');
    function drawLayout() { bodyEl.classList.toggle('split', !!bc.split); bodyEl.classList.toggle('side-left', bc.side === 'left'); sideEl.hidden = !bc.split; drawSide(); }
    const sideOpts = () => BC_SIDE.filter(([k]) => (k !== 'table' || (extra && extra.fixture && extra.fixture.l && state)) && (k !== 'others' || ticker) && (k !== 'squad' || hasCtl));
    function drawSide() {
      if (!bc.split) return;
      const o = sideOpts();
      const cur = o.some(([k]) => k === bc.panel) ? bc.panel : o[0][0];
      const body = cur === 'table' ? liveTable() : cur === 'stats' ? sideStats : cur === 'squad' ? squadBox() : cur === 'others' ? ticker.box : sideFeed();
      sideEl.replaceChildren(el('div.bc-side-head', [el('select', { 'aria-label': 'Що показувати на бічній панелі', onchange: (e) => { bc.panel = e.target.value; saveBc(); drawSide(); } },
        o.map(([k, l]) => el('option', { value: k, selected: cur === k || null }, l)))]), el('div.bc-side-body', [body]));
    }
    /** Таблиця ліги наживо: з поточним рахунком матчу. */
    function liveTable() {
      const f = extra && extra.fixture;
      const rows = FM.season.table(state.season, W, f.l).map((r) => ({ ...r }));
      const upd = (id, gf, ga) => { const r = rows.find((x) => x.id === id); if (!r) return; r.p++; r.gf += gf; r.ga += ga; r.gd = r.gf - r.ga; r.pts += gf > ga ? 3 : gf === ga ? 1 : 0; r.live = true; };
      upd(hs.club.id, curScore[0], curScore[1]); upd(as.club.id, curScore[1], curScore[0]);
      rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      return el('table.bc-table', [el('thead', el('tr', [el('th', '#'), el('th', 'Команда'), el('th.num', 'І'), el('th.num', 'РМ'), el('th.num', 'О')])),
        el('tbody', rows.map((r, i) => el('tr' + (r.live ? '.live' : ''), [el('td', String(i + 1)), el('td', clubName(W.club(r.id))), el('td.num', String(r.p)), el('td.num', (r.gd > 0 ? '+' : '') + r.gd), el('td.num', el('b', String(r.pts)))])))]);
    }
    const condCell = (x) => el('span.bc-cond' + (x.cond < 65 ? '.lo' : x.cond < 80 ? '.mid' : ''), Math.round(x.cond) + '%');
    function squadBox() {
      const t = M.sides[myK];
      return el('table.bc-table', [el('thead', el('tr', [el('th', 'Поз.'), el('th', 'Гравець'), el('th.num', 'Свіжість')])),
        el('tbody', t.onPitch.filter((x) => !x.out).map((x) => el('tr', [el('td', ROLE_SHORT(x.slot)), el('td', [shortName(x.p), x.yellow ? el('span.bc-yc', { title: 'Жовта картка' }) : null]), el('td.num', condCell(x))])))]);
    }
    function sideFeed() { return el('ol.bc-sfeed', M.events.slice(0, shown).filter((e) => e.text && e.type !== 'info').slice(-14).reverse().map((e) => el('li', [el('b', e.min + '′ '), e.text]))); }
    function drawPlayers() {
      if (tab !== 'stats') return;
      playersBox.replaceChildren(...[0, 1].map((k) => el('div.panel', [el('h3', clubName(k === 0 ? hs.club : as.club)), el('table.bc-table', [el('thead', el('tr', [el('th', 'Поз.'), el('th', 'Гравець'), el('th.num', 'Свіжість')])),
        el('tbody', M.sides[k].onPitch.map((x) => el('tr' + (x.out ? '.out' : ''), [el('td', ROLE_SHORT(x.slot)), el('td', [nameOf(x.p), x.yellow ? el('span.bc-yc') : null, x.out ? el('small.muted', ' (не на полі)') : null]), el('td.num', condCell(x))])))])])));
    }
    /** Аналіз наживо: карта ударів (розмір — xG) і очікувані голи. */
    let anaN = -1;
    function drawAnalysis(force) {
      if (tab !== 'analysis') return;
      const shots = M.shots || [];
      if (!force && shots.length === anaN) return;
      anaN = shots.length;
      const NS = 'http://www.w3.org/2000/svg', sv = (tag, a = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); for (const c of kids) n.append(c); return n; };
      const map = sv('svg', { viewBox: '0 0 100 64', class: 'shotmap', role: 'img', 'aria-label': 'Карта ударів наживо' }, [
        sv('rect', { x: 0.5, y: 0.5, width: 99, height: 63, rx: 1, class: 'sm-pitch' }), sv('line', { x1: 50, y1: 0.5, x2: 50, y2: 63.5, class: 'sm-line' }),
        sv('rect', { x: 0.5, y: 17, width: 14, height: 30, class: 'sm-line' }), sv('rect', { x: 85.5, y: 17, width: 14, height: 30, class: 'sm-line' }),
        ...shots.map((sh) => { const x = sh.t === 0 ? sh.x : 100 - sh.x, y = (sh.t === 0 ? sh.y : 100 - sh.y) * 0.64; const c = sv('circle', { cx: x, cy: y, r: 0.9 + sh.xg * 6, style: `fill:${sh.goal ? kit[sh.t][0] : 'none'};stroke:${kit[sh.t][0]};stroke-width:0.5` }); c.append(sv('title', {}, [document.createTextNode(`${sh.min}′ · xG ${String(sh.xg).replace('.', ',')}${sh.goal ? ' · гол' : ''}`)])); return c; }),
      ]);
      const xg = [0, 1].map((k) => shots.filter((x) => x.t === k).reduce((a, x) => a + x.xg, 0));
      analysisBox.replaceChildren(el('h3', 'Аналіз: удари й очікувані голи'), map,
        el('p', `Очікувані голи: ${clubName(hs.club)} ${String(Math.round(xg[0] * 100) / 100).replace('.', ',')} — ${String(Math.round(xg[1] * 100) / 100).replace('.', ',')} ${clubName(as.club)}. Заповнене коло — гол, розмір — якість моменту.`));
    }
    // шкала матчу, володіння, рядок коментаря
    const tlEl = el('div.bc-tl'), possEl = el('div.bc-poss'), commEl = el('div.bc-comm', { 'aria-live': 'polite' });
    let tlKey = '';
    function drawTimeline() {
      const key = `${shown}-${M.minuteNum}`;
      if (key === tlKey) return;
      tlKey = key;
      const seen = M.events.slice(0, shown);
      const et = seen.some((e) => typeof e.min === 'number' && e.min > 95) || (M.minuteNum || 0) > 96;
      const span = et ? 120 : 93, now = Math.min(span, M.minuteNum || 0);
      tlEl.replaceChildren(
        el('i.bc-tl-fill', { style: { width: (now / span) * 100 + '%' } }),
        ...seen.filter((e) => (e.type === 'goal' || e.type === 'red' || e.type === 'yellow') && typeof e.min === 'number').map((e) => { const mk = el('i.bc-tl-mk.' + e.type, { title: `${e.min}′ ${e.text}` }); mk.style.left = Math.min(100, (e.min / span) * 100) + '%'; if (e.type === 'goal') mk.style.background = kit[e.team][0]; return mk; }),
        ...[el('span.bc-tl-l', { style: { left: '0%' } }, 'Поч.'), el('span.bc-tl-l', { style: { left: (45 / span) * 100 + '%' } }, 'Перерва'), et ? el('span.bc-tl-l', { style: { left: (90 / span) * 100 + '%' } }, 'Дод. час') : null, el('span.bc-tl-l.end', 'Кінець')].filter(Boolean));
      const st = M.liveStats();
      possEl.replaceChildren(el('span.muted', 'Володіння'), el('div.bc-poss-bar', [el('i', { style: { width: st[0].poss + '%', background: kit[0][0] } }), el('i', { style: { width: st[1].poss + '%', background: kit[1][0] } })]), el('b', `${st[0].poss}% : ${st[1].poss}%`));
      const last = [...seen].reverse().find((e) => e.text && e.type !== 'info');
      commEl.textContent = last ? `${last.min}′  ${last.text}` : 'Команди виходять на поле.';
      commEl.style.borderLeftColor = last && last.team != null ? kit[last.team][0] : 'transparent';
    }
    // між моментами: коротка інформація про матч поверх поля
    const infoEl = el('div.bc-info', { hidden: true });
    function drawInfo(on) {
      if (!on || !bc.info) { infoEl.hidden = true; return; }
      if (!infoEl.hidden && infoEl.dataset.m === String(M.minuteNum)) return;
      infoEl.dataset.m = String(M.minuteNum); infoEl.hidden = false;
      const st = M.liveStats();
      infoEl.replaceChildren(el('div.bc-info-head', [el('span', clubName(hs.club)), el('b', scoreEl.textContent), el('span', clubName(as.club))]), el('small', `${clock.textContent} · між моментами`),
        compareBars([['Володіння', st[0].poss, st[1].poss, (v) => v + '%'], ['Удари', st[0].shots, st[1].shots], ['У площину', st[0].onTarget, st[1].onTarget], ['xG', st[0].xg, st[1].xg, (v) => String(v).replace('.', ',')]]));
    }
    // міні-поле: м'яч біля воріт того, хто атакує (господарі атакують праворуч)
    const ball = el('i.ball');
    const SIMV = !!M.sim; // детальний рушій: на полі справжні позиції гравців
    const holderEl = el('div.mp-holder.muted');
    const hlBar = el('div.hl-bar', { 'aria-live': 'assertive', hidden: true });
    let hlTimers = [];
    /** Виділити момент: смуга «Небезпечна атака» → результат; м'яч летить до місця удару. */
    function highlight(e) {
      hlTimers.forEach(clearTimeout); hlTimers = [];
      hlActive = true; possK = e.team; carrier = null;
      const k = e.team, team = k === 0 ? hs.club : as.club, ours = myK == null || k === myK;
      const atk = k === 0 ? 1 : -1;
      const sx = k === 0 ? e.hl.x : 100 - e.hl.x, sy = (k === 0 ? e.hl.y : 100 - e.hl.y);
      hlBar.hidden = false; hlBar.className = 'hl-bar hl-attack';
      hlBar.style.borderLeftColor = team.colors[0];
      hlBar.replaceChildren(el('b', `⚡ ${e.hl.out === 'pen' || e.hl.kind === 'pen' ? 'Пенальті' : 'Небезпечна атака'} — ${clubName(team)}`), el('span.muted', ` ${e.min}′`));
      if (!SIMV) {
        moveBall(50 + atk * 18, 50 + (sy - 50) * 0.4);
        hlTimers.push(setTimeout(() => moveBall(Math.max(4, Math.min(96, sx)), Math.max(8, Math.min(92, sy))), 450));
      }
      hlTimers.push(setTimeout(() => {
        const out = e.hl.out;
        hlBar.className = 'hl-bar ' + (out === 'goal' ? (ours ? 'hl-goal' : 'hl-goal-against') : 'hl-' + out);
        hlBar.replaceChildren(el('b', e.hl.og ? 'Автогол!' : e.hl.special === 'gk' ? '🧤 ГОЛ ВОРОТАРЯ!' : e.hl.special ? '🚀 ГОЛ-ШЕДЕВР!' : HL_OUT[out] || 'Момент'), el('span.muted', ` ${clubName(team)} · ${e.min}′${e.hl.xg != null ? ` · xG ${String(e.hl.xg).replace('.', ',')}` : ''}`));
        if (out === 'goal') { if (!SIMV) { moveBall(k === 0 ? 98 : 2, 50); lastGoal = trail.slice(-6); } hlBar.append(' ', el('button.btn.tiny-btn', { type: 'button', onclick: () => replay() }, '▶ Повтор')); if (bc.replays !== 'off') setTimeout(() => replay(), 900); }
        else if (SIMV) { /* м'яч показує сам рушій */ }
        else if (out === 'wide') moveBall(k === 0 ? 99 : 1, sy < 50 ? 30 : 70);
        else if (out === 'post') moveBall(k === 0 ? 97 : 3, 44);
      }, 1000));
      hlTimers.push(setTimeout(() => { hlBar.hidden = true; hlActive = false; if (e.hl.out === 'goal' && !SIMV) { possK = 1 - k; carrier = null; moveBall(50, 50); drawDots(); } }, e.hl.out === 'goal' ? 4200 : 3000));
    }
    // ---- 2D-поле (як у FM): гравці бігають за м'ячем, м'яч ходить передачами, на голах — повтор ----
    const dots = el('div.mp-dots');
    const replayTag = el('span.mp-replay', { hidden: true }, 'ПОВТОР');
    const miniPitch = el('div.mini-pitch.pitch2d' + (SIMV ? '.sim' : ''), { 'aria-hidden': 'true' }, [el('span.mp-half'), el('span.mp-circle'), el('span.mp-box.l'), el('span.mp-box.r'),
      el('span.mp-six.l'), el('span.mp-six.r'), el('span.mp-goal.l'), el('span.mp-goal.r'), dots, ball, replayTag]);
    const dotEls = new Map();
    // форма команд на полі: якщо кольори схожі — гості в запасній (другий колір клубу або помаранчева)
    const kit = (() => {
      const rgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return Number.isNaN(n) ? null : [n >> 16, (n >> 8) & 255, n & 255]; };
      const far = (a, b) => { const x = rgb(a), y = rgb(b); return !x || !y || Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > 120; };
      const h = hs.club.colors || ['#ffffff', '#000000'], a = as.club.colors || ['#222222', '#ffffff'];
      const hb = h[1] || '#000', away = far(h[0], a[0]) ? [a[0], a[1] || '#000'] : far(h[0], a[1]) && a[1] ? [a[1], a[0]] : ['#f07a2a', '#222'];
      return [[h[0], hb], away];
    })();
    let possK = 0, carrier = null, hlActive = false, replaying = false;
    const trail = []; let lastGoal = null;
    const R2 = FM.rng(`2d-${Date.now()}`);
    /** Позиції гравців команди k: база — схема, блок зсувається за м'ячем, атака/оборона за володінням. */
    function teamPos(k) {
      const t = M.sides[k], live = t.onPitch.filter((x) => !x.out);
      const xy = layoutXY(live.map((x) => x.slot));
      const shift = (ballX - 50) * 0.38 + (possK === k ? (k === 0 ? 6 : -6) : (k === 0 ? -4 : 4));
      return live.map((x, i) => {
        const depth = 100 - xy[i][1];
        let px = 5 + depth * 0.86; if (k === 1) px = 100 - px;
        if (x.slot.role !== 'GK') px += shift; else px += shift * 0.12;
        let py = k === 0 ? xy[i][0] : 100 - xy[i][0];
        py += (ballY - 50) * (x.slot.role === 'GK' ? 0.1 : 0.22);
        return { x: Math.max(2, Math.min(98, px)), y: Math.max(5, Math.min(95, py)), p: x.p, gk: x.slot.role === 'GK' };
      });
    }
    function drawDots() {
      const seen = new Set();
      [0, 1].forEach((k) => {
        const pos = teamPos(k), c = k === 0 ? hs.club : as.club;
        // захисники без м'яча: двоє найближчих пресингують
        if (possK !== k) pos.filter((q) => !q.gk).sort((a, b) => Math.hypot(a.x - ballX, a.y - ballY) - Math.hypot(b.x - ballX, b.y - ballY)).slice(0, 2)
          .forEach((q) => { q.x += (ballX - q.x) * 0.55; q.y += (ballY - q.y) * 0.55; });
        for (const q of pos) {
          let d = dotEls.get(q.p.id);
          if (!d) { d = el('i.dot2', { title: nameOf(q.p) }); d.style.background = kit[k][0]; d.style.borderColor = kit[k][1]; void c; dotEls.set(q.p.id, d); dots.append(d); }
          d.classList.toggle('has-ball', q.p.id === carrier);
          d.style.left = q.x + '%'; d.style.top = q.y + '%';
          seen.add(q.p.id);
        }
      });
      for (const [id, d] of dotEls) if (!seen.has(id)) { d.remove(); dotEls.delete(id); }
    }
    let ballX = 50, ballY = 50, bt = 0;
    const moveBall = (x, y) => { ballX = x; ballY = y; ball.style.left = x + '%'; ball.style.top = y + '%'; if (!replaying) { trail.push([x, y]); if (trail.length > 10) trail.shift(); } };
    /** Хід 2D-гри: передача партнерові вперед або втрата м'яча (за володінням у матчі). */
    function play2d() {
      if (hlActive || replaying || finished) return;
      const sh = M.liveStats()[0].poss / 100;
      const keep = possK === 0 ? 0.74 + (sh - 0.5) * 0.5 : 0.74 + (0.5 - sh) * 0.5;
      if (!R2.chance(keep)) { possK = 1 - possK; carrier = null; }
      const dir = possK === 0 ? 1 : -1;
      const mates = teamPos(possK).filter((q) => !q.gk || Math.abs(ballX - (possK === 0 ? 5 : 95)) < 25);
      const cands = mates.filter((q) => q.p.id !== carrier && Math.hypot(q.x - ballX, q.y - ballY) < 42);
      if (!cands.length) return drawDots();
      const t = R2.weighted(cands, (q) => Math.max(0.2, 1 + ((q.x - ballX) * dir) / 15));
      carrier = t.p.id;
      // м'яч у зоні атаки довго не стоїть: відкат назад, якщо близько до воріт без моменту
      const tx = (possK === 0 && t.x > 86) || (possK === 1 && t.x < 14) ? t.x - dir * 12 : t.x;
      moveBall(tx, t.y);
      drawDots();
    }
    /** Кадр детального рушія: позиції всіх гравців і м'яча (у відсотках поля). */
    const shirt = new Map();
    // ---- 3D-вид (js/view3d.js): ті самі кадри в перспективі; перемикач 2D/3D і камери ----
    const VIEW_KEY = 'golovnyi-trener:view';
    const can3d = SIMV && FM.view3d && FM.view3d.supported();
    let mode3 = can3d && (() => { try { return localStorage.getItem(VIEW_KEY) !== '2d'; } catch (_) { return true; } })();
    let v3 = null, cam3 = (() => { try { const c = localStorage.getItem(VIEW_KEY + ':cam'); return FM.view3d && FM.view3d.CAMERAS.some(([k]) => k === c) ? c : 'director'; } catch (_) { return 'director'; } })();
    const v3wrap = el('div.v3d-wrap', { hidden: true });
    // накладки трансляції: табло, стрічка подій (голи, вилучення), рядок коментаря
    const ov3 = { score: el('div.v3o-score', { 'aria-hidden': 'true' }), line: el('div.v3o-line', { 'aria-hidden': 'true' }), tick: el('div.v3o-ticker', { 'aria-hidden': 'true' }) };
    v3wrap.append(ov3.score, ov3.line, ov3.tick);
    const teamTag = (k) => { const c = k === 0 ? hs.club : as.club, t = el('span.v3o-team', c.code || clubName(c).slice(0, 3).toUpperCase()); t.style.background = kit[k][0]; t.style.color = hexLum(kit[k][0]) > 0.6 ? '#111' : '#fff'; return t; };
    const hexLum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    function draw3dOverlay() {
      if (!mode3) return;
      ov3.score.replaceChildren(teamTag(0), el('b', scoreEl.textContent), teamTag(1), el('span.v3o-clock', clock.textContent));
      const seen = M.events.slice(0, shown);
      const last = [...seen].reverse().find((e) => e.text && e.type !== 'info');
      ov3.tick.textContent = last ? `${last.min}′  ${last.text}` : '';
      ov3.tick.hidden = !last;
      const span = seen.some((e) => typeof e.min === 'number' && e.min > 95) ? 122 : 95;
      const now = typeof M.minuteNum === 'number' ? M.minuteNum : 0;
      const bar = el('i.v3o-prog'); bar.style.width = Math.min(100, (now / span) * 100) + '%';
      ov3.line.replaceChildren(bar, ...seen.filter((e) => (e.type === 'goal' || e.type === 'red') && typeof e.min === 'number').map((e) => {
        const mk = el('i.v3o-mk.' + (e.type === 'goal' ? 'goal' : 'red')); mk.style.left = Math.min(100, (e.min / span) * 100) + '%'; mk.style.background = e.type === 'goal' ? kit[e.team][0] : ''; return mk;
      }));
    }
    const info3 = (id) => {
      for (const k of [0, 1]) {
        const x = M.sides[k].onPitch.find((y) => y.p.id === id);
        if (x) return { k, num: x.p.number ?? ROLE_SHORT(x.slot), gk: x.slot.role === 'GK' };
      }
      return { k: 0, num: '', gk: false };
    };
    const name3 = (id) => { for (const k of [0, 1]) { const x = M.sides[k].onPitch.find((y) => y.p.id === id); if (x) return shortName(x.p); } return ''; };
    /** Стадіон для 3D: місткість і заповненість (для ліги — як рахує каса), погода, лави запасних. */
    function stadium3() {
      const hc = hs.club && W.club(hs.club.id) ? W.club(hs.club.id) : hs.club || {};
      let fill = 0.7;
      const f = extra && extra.fixture;
      if (f && state) { try { const t = FM.season.table(state.season, W, hc.league), pos = t.findIndex((r) => r.id === hc.id) + 1; fill = FM.money.attendance(W, state, hc.id, as.club.id, t.length > 1 ? 1 - (pos - 1) / (t.length - 1) : 0.5, FM.rivals.derby(W, hc.id, as.club.id), M.weather).fill; } catch (_) { /* без розрахунку каси */ } }
      else if (!f && myK != null && state && !state.season.fixtures.some((x) => x.s)) fill = 0.35; // товариські перед сезоном
      return { capacity: hc.capacity || 15000, fill, weather: M.weather, seed: `${hc.id}-${as.club.id}-${state ? state.season.year : ''}`, bench: [0, 1].map((k) => (M.sides[k].bench || []).length) };
    }
    const Q3_KEY = 'golovnyi-trener:q3d', RC_KEY = 'golovnyi-trener:rcam';
    const q3d = () => { try { return localStorage.getItem(Q3_KEY) || 'auto'; } catch (_) { return 'auto'; } };
    const rcam3 = () => { try { return localStorage.getItem(RC_KEY) || 'director'; } catch (_) { return 'director'; } };
    function ensure3d() { if (!v3 && can3d) { try { v3 = FM.view3d.create(v3wrap, { kit, info: info3, name: name3, sponsor: state && state.sponsor && myK != null ? state.sponsor.name : null, ...stadium3(), camera: cam3, quality: q3d() }); v3.setReplayCamera(rcam3()); } catch (err) { console.warn('3D недоступне', err); mode3 = false; } } }
    const viewBar = el('div.view-bar');
    function drawViewBar() {
      if (!can3d) return viewBar.replaceChildren();
      miniPitch.hidden = mode3; v3wrap.hidden = !mode3;
      viewBar.replaceChildren(
        el('div.tabs.view-mode', [['2d', '2D'], ['3d', '3D']].map(([v, l]) => el('button', { type: 'button', 'aria-pressed': String((v === '3d') === mode3), onclick: () => {
          mode3 = v === '3d'; try { localStorage.setItem(VIEW_KEY, v); } catch (_) { /* приватне вікно */ }
          if (mode3) ensure3d();
          drawViewBar(); if (frames.length) drawFrame(frames[Math.min(frames.length - 1, fIdx)]);
        } }, l))),
        mode3 ? el('div.tabs.view-cam', FM.view3d.CAMERAS.map(([v, l]) => el('button', { type: 'button', 'aria-pressed': String(cam3 === v), onclick: () => {
          cam3 = v; try { localStorage.setItem(VIEW_KEY + ':cam', v); } catch (_) { /* приватне вікно */ } if (v3) v3.setCamera(v); drawViewBar();
        } }, l))) : null);
    }
    if (mode3) ensure3d();
    drawViewBar();
    function drawFrame(f) {
      if (!f) return;
      if (mode3 && v3) {
        v3.show(f);
        const hp = f.h && (shirt.get(f.h) || (() => { const x = info3(f.h); const pl = M.sides[x.k].onPitch.find((y) => y.p.id === f.h); if (pl) shirt.set(f.h, pl.p); return pl && pl.p; })());
        holderEl.textContent = hp ? `⚽ ${nameOf(hp)}` : ' ';
        return;
      }
      draw2d(f);
    }
    function draw2d(f) {
      if (!f) return;
      const seen = new Set();
      for (let i = 0; i < f.pos.length; i += 4) {
        const id = f.pos[i], k = f.pos[i + 3];
        let d = dotEls.get(id);
        if (!d) {
          const c = k === 0 ? hs.club : as.club, pl = (k === 0 ? hs : as).players.find((p) => p.id === id) || M.sides[k].onPitch.map((x) => x.p).find((p) => p.id === id);
          d = el('i.dot2', { title: pl ? nameOf(pl) : '' }); d.style.background = kit[k][0]; d.style.borderColor = kit[k][1]; void c;
          if (pl) shirt.set(id, pl);
          dotEls.set(id, d); dots.append(d);
        }
        d.style.left = f.pos[i + 1] + '%'; d.style.top = f.pos[i + 2] + '%';
        d.classList.toggle('has-ball', id === f.h);
        seen.add(id);
      }
      for (const [id, d] of dotEls) if (!seen.has(id)) { d.remove(); dotEls.delete(id); }
      ball.style.left = f.bx + '%'; ball.style.top = f.by + '%';
      const hp = f.h && shirt.get(f.h);
      holderEl.textContent = hp ? `⚽ ${nameOf(hp)}` : ' ';
    }
    /** Повтор голу: м'яч ще раз проходить шлях до воріт. */
    function replay() {
      if (SIMV) { // повтор — останні секунди перед голом
        const rp = M.sim.replays[M.sim.replays.length - 1];
        if (!rp || replaying) return;
        replaying = true; replayTag.hidden = false; miniPitch.classList.add('replaying'); v3wrap.classList.add('replaying');
        if (v3 && mode3) v3.replay(true);
        let i = 0;
        const stepR = () => {
          if (i >= rp.length) { setTimeout(() => { replaying = false; replayTag.hidden = true; miniPitch.classList.remove('replaying'); v3wrap.classList.remove('replaying'); if (v3) v3.replay(false); if (frames.length) drawFrame(frames[Math.min(frames.length - 1, fIdx)]); }, 700); return; }
          drawFrame(rp[i++]); setTimeout(stepR, 160);
        };
        stepR();
        return;
      }
      if (!lastGoal || replaying) return;
      replaying = true; replayTag.hidden = false; miniPitch.classList.add('replaying');
      const path = lastGoal.slice();
      let i = 0;
      const stepR = () => {
        if (i >= path.length) { setTimeout(() => { replaying = false; replayTag.hidden = true; miniPitch.classList.remove('replaying'); }, 700); return; }
        const [x, y] = path[i++]; ball.style.left = x + '%'; ball.style.top = y + '%';
        setTimeout(stepR, 380);
      };
      stepR();
    }
    let sideKey = '';
    let shown = 0, paused = false, finished = false, hold = 0, acc = 0, talkAsked = false, talkMsg = null, idle = 0;
    // промова перед матчем: трансляція чекає на тренера (як у FM)
    let preTalk = myK != null && state ? 'ask' : 'done', preRes = null, shoutMsg = null, instrOpen = false;
    const applied = new Set(); // поради асистента, які вже застосували
    if (preTalk === 'ask') paused = true;
    const motK = () => (state ? 0.7 + FM.career.attr(state, 'mot') * 0.03 : 1);
    const REACT_CLS = { inspired: 'ok', focused: 'ok', neutral: 'info', nervous: 'bad', complacent: 'warn' };
    const TICK = 100;
    const msPerMin = () => bc.during;
    const pct = (v) => v + '%';
    const f2 = (v) => String(v).replace('.', ',');

    // пауза — одна на всю трансляцію, кнопок кілька: угорі, біля стрічки подій і в панелі тренера
    const feedPause = el('span.feed-pause');
    const togglePause = () => { if (preTalk === 'ask') preTalk = 'done'; paused = !paused; drawSpeed(); drawControl(); };
    const pauseButton = (cls = '') => el('button.btn.tiny-btn.pause-btn' + cls, { type: 'button', disabled: finished || null, 'aria-pressed': String(paused),
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); togglePause(); } }, paused ? '▶ Продовжити' : '⏸ Пауза');
    const playBox = el('div.bc-play'), actBox = el('div.bc-acts'), setBox = el('div.bc-settings', { hidden: true });
    let skipping = false;
    const skipToHl = () => { skipping = true; if (paused) { paused = false; } drawSpeed(); };
    const drawSpeed = () => {
      feedPause.replaceChildren(...(finished ? [] : [pauseButton()]));
      const ib = (icon, label, fn, dis) => el('button.bc-ib', { type: 'button', title: label, 'aria-label': label, disabled: dis || finished || null, onclick: fn }, icon);
      playBox.replaceChildren(
        ib('⏪', 'Повтор останнього гола', () => replay(), !(SIMV && M.sim.replays && M.sim.replays.length)),
        ib(paused ? '▶' : '⏸', paused ? 'Продовжити' : 'Пауза', () => togglePause()),
        ib('⏩', 'До наступного моменту', () => skipToHl(), !SIMV || bc.hl === 'all'),
        ib('⏭', 'Одразу результат', () => { M.result(); flush(); finish(); }),
        el('button.bc-ib', { type: 'button', title: 'Налаштування трансляції', 'aria-label': 'Налаштування трансляції', 'aria-expanded': String(!setBox.hidden), onclick: () => { setBox.hidden = !setBox.hidden; drawSettings(); drawSpeed(); } }, '⚙'),
        el('button.bc-ib', { type: 'button', title: 'Звук', 'aria-label': 'Звук', 'aria-pressed': String(FM.sound.on), onclick: () => { FM.sound.set(!FM.sound.on); if (FM.sound.on) { FM.sound.whistle(1); FM.sound.ambient(!finished); } drawSpeed(); drawSettings(); } }, FM.sound.on ? '🔊' : '🔇'));
      if (hasCtl && !finished) {
        const t = M.sides[myK];
        actBox.replaceChildren(
          el('button.btn', { type: 'button', onclick: () => { autoTab = false; setTab('tactics'); } }, `⇄ Заміна (${t.subsLeft})`),
          el('button.btn', { type: 'button', onclick: () => { autoTab = false; instrOpen = true; setTab('tactics'); drawControl(); } }, 'Інструкції'),
          t.formation ? el('span.bc-chip', t.formation) : null,
          el('label.bc-ment', [el('span.muted', 'Ментальність'), el('select', { 'aria-label': 'Ментальність', onchange: (e) => { M.setTactics(myK, { mentality: e.target.value }); flush(); drawControl(); } },
            Object.entries(FM.match.TACTIC_UK.mentality).map(([k, l]) => el('option', { value: k, selected: (t.tactic || t).mentality === k || null }, l)))]));
      } else actBox.replaceChildren();
    };
    function drawSettings() {
      if (setBox.hidden) return;
      const range = (label, list, key) => { const i = Math.max(0, list.findIndex(([v]) => v === bc[key])); return el('label.bc-set-row', [el('span', label), el('input', { type: 'range', min: 0, max: list.length - 1, step: 1, value: i, 'aria-label': label, oninput: (e) => { bc[key] = list[Number(e.target.value)][0]; saveBc(); drawSettings(); } }), el('b', list[i][1])]); };
      const sel = (label, opts2, val, on) => el('label.bc-set-row', [el('span', label), el('select', { onchange: (e) => { on(e.target.value); drawSettings(); } }, opts2.map(([v, l]) => el('option', { value: v, selected: String(val) === String(v) || null }, l)))]);
      const chk = (label, val, on) => el('label.bc-set-chk', [el('input', { type: 'checkbox', checked: val || null, onchange: (e) => on(e.target.checked) }), ' ' + label]);
      setBox.replaceChildren(
        el('div.bc-set-head', [el('b', '⚙ Налаштування трансляції'), el('button.bc-ib', { type: 'button', 'aria-label': 'Закрити', onclick: () => { setBox.hidden = true; drawSpeed(); } }, '✕')]),
        el('div.bc-set-grid', [
          el('div', [el('h4', 'Швидкість матчу'), range('Під час моментів', BC_DURING, 'during'), range('Між моментами', BC_BETWEEN, 'between'),
            sel('Моменти', BC_HL, bc.hl, (v) => { bc.hl = v; saveBc(); if (SIMV && frames.length) wins = hlWindows(minEvents, frames.length, M.sim.DT, bc.hl); drawSpeed(); }), el('small.muted', BC_HL_HINT[bc.hl]),
            sel('Смуга над полем', HL_MODES, hlMode, (v) => setHl(v))]),
          el('div', [el('h4', 'Вигляд'),
            sel('Поділений екран', [['right', 'Матч ліворуч, панель праворуч'], ['left', 'Панель ліворуч, матч праворуч']], bc.side, (v) => { bc.side = v; saveBc(); drawLayout(); }),
            can3d ? sel('Камера', FM.view3d.CAMERAS, cam3, (v) => { cam3 = v; try { localStorage.setItem(VIEW_KEY + ':cam', v); } catch (_) { /* приватне вікно */ } if (v3) v3.setCamera(v); drawViewBar(); }) : null,
            sel('Повтори', [['goals', 'Голи'], ['off', 'Без повторів']], bc.replays, (v) => { bc.replays = v; saveBc(); }),
            can3d ? sel('Камера повтору', FM.view3d.CAMERAS, rcam3(), (v) => { try { localStorage.setItem(RC_KEY, v); } catch (_) { /* приватне вікно */ } if (v3) v3.setReplayCamera(v); }) : null,
            can3d ? sel('Якість графіки', [['auto', 'Автоматично'], ...Object.entries(FM.view3d.QUALITY).map(([k, q]) => [k, q.label])], q3d(), (v) => {
              try { localStorage.setItem(Q3_KEY, v); } catch (_) { /* приватне вікно */ }
              if (v3) { v3.dispose(); v3 = null; if (mode3) { ensure3d(); if (frames.length) drawFrame(frames[Math.min(frames.length - 1, fIdx)]); } }
            }) : null]),
        ]),
        chk('Звук', FM.sound.on, (v) => { FM.sound.set(v); if (v) FM.sound.ambient(!finished); drawSpeed(); }),
        chk('Показувати інформацію про матч між моментами', bc.info, (v) => { bc.info = v; saveBc(); if (!v) drawInfo(false); }),
      );
    }

    /** Показати нові події. gate — секунда хвилини, до якої дійшло 2D (детальний рушій): пізніші ще не сталися на екрані. */
    function flush(gate) {
      while (shown < M.events.length) {
        const e = M.events[shown];
        if (gate != null && (e.sec ?? 0) > gate) break;
        shown++;
        const team = e.team == null ? null : e.team === 0 ? hs.club : as.club;
        const big = e.hl && e.hl.xg >= 0.25 && e.type !== 'goal';
        feed.prepend(el('li.ev.ev-' + e.type + (myK != null && e.team === myK ? '.ours' : '') + (e.type === 'goal' ? '.flash' : '') + (big ? '.big' : ''), [el('span.min', e.min + '′'), team ? badge(team) : el('span.dot'), el('span', (big ? '⚡ ' : '') + e.text)]));
        if (shouldHl(e) && !finished) { highlight(e); hold = Math.max(hold, e.hl.out === 'goal' ? 3800 : 2600); moveBall.last = e; }
        else if (SIMV && e.type === 'goal' && !finished && bc.replays !== 'off') setTimeout(() => replay(), 900);
        scoreEl.textContent = e.score.join(':') + (e.so ? ` (пен. ${e.so.join(':')})` : '');
        if (e.type === 'goal' || String(e.score) !== String(curScore)) { curScore = e.score.slice(); if (bc.panel === 'table') drawSide(); }
        // звук і анімація
        if (v3 && mode3 && !finished) { if (e.type === 'goal') { v3.celebrate(e.team); v3.cue('goal', e.team); } else if (e.hl) v3.cue('shot', e.team); }
        if (e.type === 'goal') { hold = 2200; FM.sound.goal(myK == null || e.team === myK); if (!finished) vibe(myK == null || e.team === myK ? [90, 50, 90, 50, 160] : 250); scoreEl.classList.remove('pulse'); void scoreEl.offsetWidth; scoreEl.classList.add('pulse'); }
        else if (e.type === 'chance' || e.type === 'miss') FM.sound.chance();
        else if (e.type === 'kickoff') { FM.sound.whistle(1); FM.sound.ambient(true); }
        else if (e.type === 'half' && String(e.min).startsWith('45')) FM.sound.whistle(2);
        else if (e.type === 'full') { FM.sound.whistle(3); FM.sound.ambient(false); }
        if (e.type === 'half' && String(e.min).startsWith('45')) hold = 1200;
      }
      const s = M.liveStats();
      if (ticker) ticker.draw();
      draw3dOverlay();
      const lastEv = M.events[M.events.length - 1];
      if (!SIMV && lastEv && lastEv !== moveBall.last && !hlActive) {
        moveBall.last = lastEv;
        if (lastEv.team != null) possK = lastEv.team;
        const atk = lastEv.team === 0 ? 1 : -1;
        if (lastEv.type === 'goal') moveBall(50 + atk * 48, 50);
        else if (lastEv.type === 'chance' || lastEv.type === 'miss') moveBall(50 + atk * (36 + (bt++ % 3) * 3), 30 + ((bt * 37) % 40));
        else if (lastEv.type === 'half' || lastEv.type === 'kickoff' || lastEv.type === 'full') moveBall(50, 50);
        else play2d();
      }
      if (!SIMV) drawDots();
      const rowsS = [
        ['Володіння', s[0].poss, s[1].poss, pct], ['Удари', s[0].shots, s[1].shots], ['У площину', s[0].onTarget, s[1].onTarget], ['xG', s[0].xg, s[1].xg, f2],
        ...(SIMV ? [['Фоли', s[0].fouls || 0, s[1].fouls || 0], ['Кутові', s[0].corners || 0, s[1].corners || 0]] : []),
      ];
      statsBox.replaceChildren(compareBars(rowsS));
      if (tab === 'stats') statsBox2.replaceChildren(compareBars(rowsS));
      if (bc.split && bc.panel === 'stats') sideStats.replaceChildren(compareBars(rowsS));
      drawTimeline();
      drawAnalysis(false);
      if (bc.split && (bc.panel === 'events' || bc.panel === 'squad') && sideKey !== `${shown}-${M.minuteNum}`) { sideKey = `${shown}-${M.minuteNum}`; drawSide(); }
    }

    function drawControl() {
      if (myK == null || finished) { control.hidden = true; return; }
      control.hidden = false;
      const t = M.sides[myK];
      const needTalk = preTalk === 'ask' || (talkAsked && M.halftime && !t.talked);
      if (needTalk && tab !== 'tactics') { autoTab = true; setTab('tactics'); }
      else if (!needTalk && autoTab && tab === 'tactics') { autoTab = false; setTab('pitch'); }
      if (preTalk === 'ask') {
        control.replaceChildren(el('h3', 'Промова перед матчем'),
          el('p.muted', 'Кожен гравець відреагує по-своєму: за характером, вагою матчу й тим, хто фаворит.'),
          el('div.talk-opts', Object.entries(FM.match.TEAM_TALKS).map(([k, d]) => el('button.btn', { type: 'button', title: d.hint, onclick: () => {
            preRes = M.teamTalk(myK, k, motK()); preTalk = 'done'; paused = false; flush(); drawSpeed(); drawControl();
          } }, d.label))),
          el('small.muted', 'Наведіть на варіант, щоб побачити, коли він доречний.'),
          el('div.actions', [el('button.btn.link', { type: 'button', onclick: () => { preTalk = 'done'; paused = false; drawSpeed(); drawControl(); } }, 'Без промови')]));
        return;
      }
      const live = t.onPitch.filter((x) => !x.out);
      // з поля: спершу найвтомленіші польові, воротар — в кінці; на поле: найкращі для позиції того, хто йде
      const outOrder = [...live].sort((a, b) => (a.slot.role === 'GK') - (b.slot.role === 'GK') || (a.cond - a.yellow * 10) - (b.cond - b.yellow * 10));
      const outSel = el('select', { id: 'sub-out', 'aria-label': 'Хто йде з поля', onchange: () => fillIn() }, outOrder.map((x) =>
        el('option', { value: x.p.id }, `${ROLE_SHORT(x.slot)} · ${nameOf(x.p)} · ${Math.round(x.cond)}%${x.yellow ? ' · ЖК' : ''}`)));
      const inSel = el('select', { id: 'sub-in', 'aria-label': 'Хто виходить' });
      const fillIn = () => {
        const x = live.find((y) => y.p.id === outSel.value);
        const order = x ? [...t.bench].sort((a, b) => FM.slotValue(b, x.slot) - FM.slotValue(a, x.slot)) : t.bench;
        inSel.replaceChildren(...order.map((p) => el('option', { value: p.id }, `${FM.positions(p)} · ${nameOf(p)}${x ? ' · ' + String(Math.round(FM.slotValue(p, x.slot) * 10) / 10).replace('.', ',') : ''}`)));
      };
      fillIn();
      const tac = t.tactic;
      const talk = M.halftime && !t.talked ? el('div.talk', [
        el('b', 'Промова в перерві'),
        el('div.talk-opts', Object.entries(FM.morale.TALKS).map(([k, d]) => el('button.btn', { type: 'button', title: d.hint, onclick: () => {
          const e = M.halftimeTalk(myK, k, motK()); talkMsg = e ? e.text : null; flush(); paused = false; drawSpeed(); drawControl();
        } }, d.label))),
        el('small.muted', 'Наведіть на варіант, щоб побачити, коли він доречний.'),
      ]) : talkMsg ? el('p.msg-ok', talkMsg) : null;
      const sets = state && myK != null ? TSETS.filter((k) => (state.tacticSets || {})[k] || k === (state.tacticKey || 'A')) : [];
      const setBtns = sets.length > 1 ? el('div.field', [el('b', 'Тактика'), el('div.tabs', sets.map((k) => el('button', { type: 'button', 'aria-pressed': String(t.setKey === k || (!t.setKey && k === (state.tacticKey || 'A'))), onclick: () => {
        const ts = (state.tacticSets || {})[k] || state.tactics;
        M.setShape(myK, ts.formation, { ...ts, familiarity: Math.min(1, (familiarity()[ts.formation] || 0) / 100) });
        t.setKey = k; flush(); drawControl();
      } }, `${TSET_UK[k]} · ${((state.tacticSets || {})[k] || state.tactics).formation}`)))]) : null;
      const report = M.halftime && !t.talked ? el('div.half-report', [el('b', 'Звіт асистента за перший тайм'),
        el('ul.tips', M.halfReport(myK).map(([k, txt, act]) => el('li.tip-' + (k === 'ok' ? 'info' : k), [txt,
          applied.has(txt) ? el('div', el('span.chip.ok', '✓ застосовано'))
            : act ? el('div', el('button.btn.tiny-btn', { type: 'button', onclick: () => { if (M.applyTip(myK, act)) applied.add(txt); flush(); drawControl(); } }, `Застосувати: ${act.label}`)) : null]))),
        el('small.muted', 'Поради самі не застосовуються — натисніть «Застосувати» або змініть усе вручну нижче.')]) : null;
      // індивідуальні інструкції й персональна опіка — прямо під час матчу
      const opp = M.sides[1 - myK];
      const oppStars = opp.onPitch.filter((x) => !x.out && ['ST', 'AM', 'W', 'CM'].includes(x.slot.role)).sort((a, b) => FM.slotValue(b.p, b.slot) - FM.slotValue(a.p, a.slot)).slice(0, 6);
      const markedId = [...opp.marked][0] || '';
      const instrBox = el('details.instr-live', { open: instrOpen || null }, [
        el('summary', { onclick: (e) => { instrOpen = !e.currentTarget.parentElement.open; } }, `Інструкції гравцям і опіка${markedId ? ' · опіка: ' + nameOf(W.player(markedId) || { name: '' }) : ''}`),
        el('div.field', [el('label', { for: 'live-mark' }, 'Персональна опіка'), el('select', { id: 'live-mark', onchange: (e) => { instrOpen = true; M.mark(myK, e.target.value || null); flush(); drawControl(); } },
          [el('option', { value: '' }, 'Без опіки'), ...oppStars.map((x) => el('option', { value: x.p.id, selected: x.p.id === markedId || null }, `${nameOf(x.p)} (${ROLE_SHORT(x.slot)})`))])]),
        el('ul.plist.instr-list', live.filter((x) => x.slot.role !== 'GK').map((x) => el('li', [
          el('span', [el('span.pos.line-' + FM.ROLE_LINE[x.slot.role], ROLE_SHORT(x.slot)), ' ', nameOf(x.p)]),
          x.slot.instr === 'mark' ? el('small.muted', 'опікає') : el('select.tiny', { 'aria-label': 'Інструкція: ' + nameOf(x.p), onchange: (e) => { instrOpen = true; M.setInstr(myK, x.p.id, e.target.value); flush(); drawControl(); } },
            Object.entries(FM.INSTR).filter(([k]) => k !== 'mark').map(([k, d]) => el('option', { value: k, selected: (x.slot.instr || 'none') === k || null }, d.label))),
        ]))),
      ]);
      const reacts = preRes && M.minuteNum < 15 ? el('details.reacts', [el('summary', `Після промови: ${preRes.text}`),
        el('ul.plist', preRes.players.map((x) => el('li', [el('span', nameOf(x.p)), el('span.chip.' + REACT_CLS[x.r], FM.match.TALK_REACT_UK[x.r])])))]) : null;
      const act = t.shout && t.shout.kind !== 'none' ? t.shout : null;
      const shouts = el('div.field', [el('b', 'Вигуки з бровки'), el('div.tabs.shouts', Object.entries(FM.match.SHOUTS).filter(([k]) => k !== 'none').map(([k, d]) => el('button', {
        type: 'button', title: d.hint, 'aria-pressed': String(!!act && act.kind === k), disabled: M.minuteNum < 1 || null,
        onclick: () => { const r = M.shout(myK, k); shoutMsg = r ? r.text : null; flush(); drawControl(); },
      }, d.label))), el('small.muted', act ? `Діє «${FM.match.SHOUTS[act.kind].label}» — ще ${Math.max(0, act.until - M.minuteNum)} хв.` : shoutMsg || 'Вигук діє 10 хвилин. Наведіть, щоб побачити ефект.')]);
      put(control,
        el('div.control-head', [el('h3', paused ? 'Пауза — рішення тренера' : 'Рішення тренера'), pauseButton()]),
        reacts,
        report,
        talk,
        shouts,
        instrBox,
        setBtns,
        el('div.instr', ['mentality', 'pressing', 'passing'].map((g) => el('div.field', [
          el('b', { mentality: 'Ментальність', pressing: 'Пресинг', passing: 'Передачі' }[g]),
          segmented(g, tac[g], (v) => { M.setTactics(myK, { [g]: v }); flush(); drawControl(); }),
        ]))),
        el('div.subs', [
          el('b', `Заміни (лишилось ${t.subsLeft})`),
          el('small.muted', 'Оберіть, хто йде з поля (або натисніть на гравця в списку свіжості нижче), потім — хто виходить, і натисніть «Замінити».'),
          t.subsLeft > 0 && t.bench.length ? el('div.pre-row', [
            el('div.field', [el('label', { for: 'sub-out' }, 'З поля'), outSel]),
            el('div.field', [el('label', { for: 'sub-in' }, 'На поле'), inSel]),
            el('button.btn', { type: 'button', onclick: () => { if (M.sub(myK, outSel.value, inSel.value)) { flush(); drawControl(); } } }, 'Замінити'),
          ]) : el('p.muted', 'Замін більше немає.'),
          el('label.check', [el('input', { type: 'checkbox', checked: t.autoSubs || null, onchange: (e) => { t.autoSubs = e.target.checked; } }), ' Заміни на розсуд помічника']),
        ]),
        el('ul.fitness', live.map((x) => el('li', { title: 'Натисніть, щоб замінити', style: { cursor: t.subsLeft > 0 ? 'pointer' : null }, onclick: () => { const o = app.querySelector('#sub-out'); if (o) { o.value = x.p.id; o.dispatchEvent(new Event('change')); o.scrollIntoView({ block: 'nearest' }); } } }, [
          el('span.pos.line-' + FM.ROLE_LINE[x.slot.role], ROLE_SHORT(x.slot)),
          el('span.fn', nameOf(x.p) + (x.yellow ? ' ▮' : '')),
          el('span.cond', el('i', { style: { width: Math.round(x.cond) + '%' }, class: x.cond < 65 ? 'low' : '' })),
        ]))),
      );
    }

    let pc = 0;
    let frames = [], fIdx = 0, shownMin = null, wins = [], minEvents = [], betweenNow = false;
    /** Годинник трансляції: хвилини й секунди (у доданий час — «45+2′»). */
    function drawClock() {
      if (!frames.length) return;
      const m = String(shownMin);
      if (/^\d+$/.test(m)) clock.textContent = `${Number(m) - 1}:${String(Math.min(59, Math.floor(fIdx * M.sim.DT))).padStart(2, '0')}`;
      else clock.textContent = m.startsWith('Пен') ? 'Пенальті' : m + '′';
    }
    /**
     * Такт детального рушія: хвилина гри розгортається на полі кадр за кадром; події — коли стаються.
     * Моменти (за налаштуванням) ідуть зі швидкістю «під час моментів», решта — «між моментами» (або миттєво).
     */
    function tickSim() {
      if (!paused) {
        if (hold > 0) hold -= TICK;
        else if (!replaying) {
          const n0 = frames.length, fi0 = n0 ? Math.min(n0 - 1, Math.floor(acc * n0)) : 0;
          const inHl0 = !!n0 && (bc.hl === 'all' || wins.some(([a, b]) => fi0 >= a && fi0 < b));
          if (inHl0 && skipping) { skipping = false; drawSpeed(); }
          const btw = skipping ? 0 : bc.between;
          if (n0 && !inHl0 && btw === 0) { const nx = wins.find(([a]) => a > fi0); acc = nx ? nx[0] / n0 : 1; }
          else acc += TICK / (inHl0 || !n0 ? bc.during : btw);
          let guard = 0;
          while (acc >= 1 || !frames.length) {
            flush(); // решта подій показаної хвилини
            if (M.done) return finish();
            if (frames.length && myK != null && M.halftime && !M.sides[myK].talked && !talkAsked) {
              talkAsked = true; paused = true; skipping = false; acc = 0; frames = []; clock.textContent = 'Перерва'; drawInfo(false); drawSpeed(); drawControl();
              liveTimer = setTimeout(tick, TICK); return;
            }
            acc = frames.length ? Math.max(0, acc - 1) : 0;
            const ev0 = M.events.length;
            M.step();
            frames = M.sim.frames; shownMin = M.minute;
            minEvents = M.events.slice(ev0);
            wins = hlWindows(minEvents, frames.length, M.sim.DT, bc.hl);
            if (myK != null && M.minuteNum % 5 === 0) drawControl();
            if ((skipping || bc.between === 0) && bc.hl !== 'all') {
              if (wins.length) { acc = Math.max(acc, wins[0][0] / Math.max(1, frames.length)); break; }
              acc = 1; // хвилина без моментів — одразу далі
              if (++guard >= 4) break;
            } else break;
          }
          fIdx = Math.max(0, Math.min(frames.length - 1, Math.floor(acc * frames.length)));
          betweenNow = bc.hl !== 'all' && !wins.some(([a, b]) => fIdx >= a && fIdx < b);
          if (!replaying) drawFrame(frames[fIdx]);
          flush(fIdx * M.sim.DT);
          drawClock();
          drawInfo(betweenNow && !paused);
        }
      }
      liveTimer = setTimeout(tick, TICK);
    }
    function tick() {
      if (finished) return;
      if (SIMV) return tickSim();
      if (!paused && hold <= 0 && ++pc % 5 === 0) play2d(); // м'яч ходить передачами між хвилинами
      if (!paused) {
        if (hold > 0) hold -= TICK; // пауза після гола чи моменту — у реальному часі
        else {
          acc += TICK / msPerMin();
          let changed = false;
          while (acc >= 1 && !M.done) {
            acc -= 1; M.step(); changed = true;
            if (myK != null && M.halftime && !M.sides[myK].talked) { acc = 0; break; } // зупинитися рівно на перерві
          }
          if (changed) {
            flush();
            // перерва: пауза й промова для нашої команди
            if (myK != null && M.halftime && !M.sides[myK].talked && !talkAsked) { talkAsked = true; paused = true; drawSpeed(); drawControl(); }
            const m = M.minute;
            const ht = M.events.length && M.events[M.events.length - 1].type === 'half' && String(M.events[M.events.length - 1].min).startsWith('45');
            clock.textContent = ht ? 'Перерва' : String(m).startsWith('Пен') ? 'Пенальті' : m + '′';
            if (myK != null && M.minuteNum % 5 === 0) drawControl();
          }
          else if (++idle % 7 === 0) flush(); // повільна швидкість: між хвилинами м'яч і гравці трохи рухаються
          if (M.done) return finish();
        }
      }
      liveTimer = setTimeout(tick, TICK);
    }

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(liveTimer);
      keepAwake(false);
      FM.sound.ambient(false);
      activeLive = null;
      const m = M.result();
      flush();
      clock.textContent = 'Кінець';
      setBox.hidden = true; drawInfo(false);
      if (tab === 'tactics') setTab('pitch');
      onFinish(m);
      const art = matchArticle(m, hs, as, myK, extra);
      drawSpeed(); drawControl();
      const [sh, sa] = m.stats;
      const ratingTable = (k, club) => el('div.panel', [el('h3', clubName(club)), el('div.table-wrap', el('table', [
        el('thead', el('tr', [el('th', 'Гравець'), el('th', 'Поз.'), el('th.num', 'Оцінка'), el('th', '')])),
        el('tbody', m.ratings.filter((r) => r.team === k).map((r) => el('tr', [
          el('td.name', el('a', { href: '#player-' + r.id }, nameOf(r.player))),
          el('td.pos.line-' + FM.ROLE_LINE[r.role], FM.roleLabel(r.role)),
          el('td.num', el('b.rating' + (r.rating >= 7.5 ? '.hi' : r.rating < 6 ? '.lo' : ''), f2(r.rating))),
          el('td.muted', [r.goals ? `гол ×${r.goals} ` : '', r.assists ? `пас ×${r.assists} ` : '', r.yellow ? 'ЖК ' : '', r.red ? 'ЧК ' : '', r.on ? `вийшов на ${r.on}′ ` : '', r.off ? `замінений на ${r.off}′` : ''].join('')),
        ]))),
      ]))]);
      put(after,
        art ? el('article.panel.match-report', [el('h3', 'Звіт про матч'), el('h2.mr-head', art.head), el('p.mr-lead', art.lead), ...art.paras.map((t) => el('p', t)),
          el('dl.facts.mr-facts', art.facts.flatMap(([k, v]) => [el('dt', k), el('dd', v)]))]) : null,
        el('div.panel', [el('h3', 'Статистика'), compareBars([
          ['Володіння', sh.poss, sa.poss, pct], ['Удари', sh.shots, sa.shots], ['У площину воріт', sh.onTarget, sa.onTarget],
          ['Очікувані голи (xG)', sh.xg, sa.xg, f2], ['Голи зі стандартів', sh.spGoals || 0, sa.spGoals || 0], ['Кутові', sh.corners || 0, sa.corners || 0],
          ['Жовті картки', sh.yellow, sa.yellow], ['Червоні картки', sh.red, sa.red],
        ]), el('p', ['Найкращий гравець матчу: ', el('b', nameOf(m.motm.player)), ` (${clubName(m.motm.team === 0 ? hs.club : as.club)}, ${f2(m.motm.rating)})`])]),
        myK != null && state ? postTalkPanel(m, myK) : null,
        matchSummary(m, hs, as),
        el('div.grid', [ratingTable(0, hs.club), ratingTable(1, as.club)]),
        el('div.actions', actions.map(([label, fn, primary]) => el('button.btn' + (primary ? '.primary' : ''), { type: 'button', onclick: fn }, label))),
      );
    }

    // розкладка екрана трансляції
    panes.overview = el('div.bc-pane', [el('div.live-grid', [
      el('details.panel.feed-box', { open: true }, [el('summary', [el('span', 'Стрічка подій'), feedPause]), el('div.feed-wrap', feed)]),
      el('div.panel', [el('h3', 'Статистика наживо'), statsBox]),
    ])]);
    panes.pitch = el('div.bc-pane', [hlBar, el('div.pitch-panel.bc-pitch', [viewBar, miniPitch, v3wrap, infoEl, SIMV ? holderEl : null])]);
    if (hasCtl) panes.tactics = el('div.bc-pane', [control]);
    panes.stats = el('div.bc-pane', [el('div.panel', [el('h3', 'Статистика'), statsBox2]), playersBox]);
    panes.analysis = el('div.bc-pane', [analysisBox]);
    bodyEl.replaceChildren(el('div.bc-main', Object.values(panes)), sideEl);
    const layout = [
      el('div.bc', [
        el('div.bc-top', [el('div.bc-clock', clock), el('div.bc-score', [teamBar(0), scoreEl, teamBar(1)]), M.weather ? el('span.bc-weather', FM.WEATHER[M.weather].label) : null]),
        el('div.bc-nav', [tabsEl, splitEl]),
        el('div.bc-bar', [actBox, playBox]),
        setBox,
        bodyEl,
        el('div.bc-timeline', [tlEl, possEl]),
        commEl,
      ]),
      after,
    ];
    setTab(tab); drawSplit(); drawLayout();
    activeLive = { finish: () => { M.result(); finish(); } };
    keepAwake(true); // телефон не засинає, поки йде трансляція
    drawSpeed(); drawControl(); flush();
    liveTimer = setTimeout(tick, 300);
    return layout;
  }

  // ---------------- Сезон ----------------
  const RESULT = (f, clubId) => {
    if (!f.s) return null;
    const [g1, g2] = f.h === clubId ? f.s : [f.s[1], f.s[0]];
    return g1 > g2 ? 'W' : g1 < g2 ? 'L' : 'D';
  };
  const RESULT_UK = { W: 'В', D: 'Н', L: 'П' };
  const formEl = (form) => el('span.form', form.map((r) => el('span.fr.fr-' + r, { title: { W: 'Перемога', D: 'Нічия', L: 'Поразка' }[r] }, RESULT_UK[r])));
  const roundOf = (f) => (f.r != null ? f.r + 1 : f.w + 1);

  function myPosition() {
    const c = W.club(state.clubId);
    const t = FM.season.table(state.season, W, c.league);
    return { pos: t.findIndex((r) => r.id === c.id) + 1, row: t.find((r) => r.id === c.id), size: t.length };
  }

  function newsPanel() {
    const N = (state.news || []).slice(-8).reverse();
    const me = W.club(state.clubId);
    return el('div.grid', [
      el('div.panel', [el('h3', 'Фінанси'), el('dl.facts', [
        el('dt', 'Баланс'), el('dd', FM.market.fmtM(me.balance)),
        el('dt', 'Зарплати'), el('dd', `${FM.market.wageBill(W, me.id)} тис. € на тиждень`),
        el('dt', 'Трансферне вікно'), el('dd', FM.market.windowOpen(state.season) ? el('a', { href: '#transfers' }, 'відкрите') : 'закрите'),
        el('dt', 'Настрій команди'), el('dd', FM.morale.label({ morale: FM.morale.teamMorale(W, me.id) })),
      ])]),
      el('div.panel', [el('h3', 'Новини'), N.length ? el('ul.news', N.map((n) => el('li' + (n.id > (state.newsRead || 0) ? '.unread' : ''), [el('small.muted', `тиждень ${n.w + 1}`), ' ', n.text]))) : el('p.muted', 'Поки тихо.'),
        el('a', { href: '#inbox' }, 'Усі повідомлення →')]),
    ]);
  }

  function seasonPanel() {
    const S = state.season, c = W.club(state.clubId);
    const f = FM.season.nextFixture(S, c.id);
    const { pos, row, size } = myPosition();
    const facts = [
      el('dt', 'Місце'), el('dd', row.p ? `${pos}-е з ${size} · ${row.pts} ${FM.plural(row.pts, 'очко', 'очки', 'очок')}` : 'сезон ще не почався'),
      el('dt', 'Форма'), el('dd', row.form.length ? formEl(row.form) : '—'),
      el('dt', 'Ціль'), el('dd', el('a', { href: '#board' }, `${FM.board.TARGETS[state.board.target.kind].label} (довіра ${Math.round(state.board.conf)})`)),
    ];
    if (f) {
      const opp = W.club(f.h === c.id ? f.a : f.h);
      facts.push(el('dt', 'Наступний матч'), el('dd', [el('a', { href: '#fixtures' }, `${clubName(opp)} (${f.h === c.id ? 'вдома' : 'на виїзді'})`), `, ${roundOf(f)}-й тур, ${fmt.date(FM.season.dateOf(f.w, state.season))}`]));
    } else facts.push(el('dt', 'Наступний матч'), el('dd', 'сезон завершено'));
    return el('div.panel', [el('h3', `Сезон ${seasonLabel()}`), el('dl.facts', facts)]);
  }

  /** Кубкова пара людини цього тижня: наживо або одразу результат. */
  function playMyCup(live) {
    cupsWeek(); // спершу — решта кубкових матчів тижня
    const pend = FM.cups.pendingTie(state, state.clubId);
    if (!pend) return go('fixtures');
    const { hs, as, opts } = FM.season.prepare(state.season, W, pend.f, NAMES, USER());
    if (pend.neutral) opts.neutral = true;
      if (pend.ko) opts.ko = pend.ko; // вирішальний матч: додатковий час і пенальті
    const myK = pend.f.h === state.clubId ? 0 : 1;
    const finishCup = (r) => {
      cupNews(FM.cups.finishPending(W, state, pend, r));
      cupsWeek(); // оголошення переможців
      saveGame();
    };
    if (!live) { finishCup(FM.match.play(opts)); return go('fixtures'); }
    opts[myK === 0 ? 'home' : 'away'].manual = true;
    showLive('fixtures', hs, as, FM.match.create(opts), myK, finishCup, [['Далі', () => go('fixtures'), true], ['Кубки', () => go('cups')]]);
  }

  /** Прийняти пропозицію за свого гравця (лише у відкрите вікно). */
  function acceptOffer(o) {
    const S = state.season, p = W.player(o.pid), buyer = W.club(o.from);
    if (!p || !buyer || !FM.market.windowOpen(S)) return false;
    FM.market.complete(W, state, p, buyer.id, o.fee, FM.market.wageDemand(W, p, buyer.id) || p.wage, 3);
    state.board.fin.transfers = Math.round((state.board.fin.transfers + o.fee) * 100) / 100;
    FM.market.news(state, `Ви продали ${nameOf(p)} у ${clubName(buyer)} за ${M(o.fee)}.`, 'transfers');
    return true;
  }
  function rejectOffer(o) { state.offers = (state.offers || []).filter((x) => x.id !== o.id); }

  // ---------------- Ритм FM14: дні, «Продовжити», верхня панель ----------------
  const DAY_UK = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MON_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  /** День тижня: 0 — неділя … 6 — субота (день матчу ліги). Середа — кубки. */
  const curDay = () => (state.day == null ? (state.day = 0) : state.day);
  function todayDate() {
    const S = state.season, w = Math.min(S.week, FM.season.weeks(S) - 1);
    const d = new Date(FM.season.dateOf(w, S) + 'T12:00:00Z');
    if (S.week < FM.season.weeks(S)) d.setUTCDate(d.getUTCDate() - (6 - curDay()));
    return d;
  }
  const dateLabel = () => { const d = todayDate(); return `${DAY_UK[d.getUTCDay()]}, ${d.getUTCDate()} ${MON_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  /** Незіграний матч ліги цього тижня (спершу — тур посеред тижня). */
  const myFixture = () => FM.season.fixturesOfWeek(state.season, state.season.week).filter((f) => (f.h === state.clubId || f.a === state.clubId) && !f.s)
    .sort((a, b) => (b.mid ? 1 : 0) - (a.mid ? 1 : 0))[0];
  /**
   * Передсезонні товариські (як у FM): асистент домовляється про 4–6 матчів у суботи до старту ліги —
   * спершу слабші суперники, ближче до сезону — сильніші. Лише з реальним календарем.
   */
  function preFriendlies() {
    const S = state.season;
    if (!S.cal) return [];
    if (state.preF && state.preF.y === S.year && state.preF.club === state.clubId) return state.preF.list;
    const me = W.club(state.clubId), lvl = W.clubLevel(me.id), lg = S.cal.leagues[me.league];
    const first = lg ? lg.start : 6, from = Math.max(1, first - 6);
    const R = FM.rng(`pref-${S.seed}-${me.id}`);
    const pool = [...W.clubs.values()].filter((c) => c.id !== me.id && c.league !== me.league);
    const list = [];
    for (let w = Math.max(S.week, from); w < first; w++) {
      if (S.cal.intl.includes(w)) continue;
      const k = (w - from) / Math.max(1, first - 1 - from); // 0 — перший, 1 — останній перед сезоном
      const lo = lvl - 30 + k * 25, hi = lvl - 10 + k * 25;
      const cands = pool.filter((c) => { const v = W.clubLevel(c.id); return v >= lo && v <= hi && !list.some((x) => x.opp === c.id); });
      const opp = (cands.length ? R.pick(cands) : R.pick(pool)).id;
      list.push({ w, opp, home: list.length % 2 === 0, s: null });
    }
    state.preF = { y: S.year, club: state.clubId, list };
    return list;
  }
  const weekFriendly = () => preFriendlies().find((x) => x.w === state.season.week && !x.s) || null;
  /** Події вашого клубу цього тижня за днями: вт — тур посеред тижня, ср/чт — кубки, сб — ліга або товариський. */
  function myEvents() {
    const S = state.season, me = state.clubId, out = [];
    if (FM.season.isOver(S)) return out;
    for (const f of FM.season.fixturesOfWeek(S, S.week)) if ((f.h === me || f.a === me) && !f.s) out.push({ day: f.mid ? 2 : 6, kind: f.mid ? 'mid' : 'league', f, opp: f.h === me ? f.a : f.h, home: f.h === me });
    const pend = FM.cups.pendingTie(state, me);
    if (pend) out.push({ day: FM.cal.cupDay(pend.cup.id), kind: 'cup', pend, opp: pend.f.h === me ? pend.f.a : pend.f.h, home: pend.f.h === me });
    const fr = weekFriendly();
    if (fr && !out.some((e) => e.day === 6) && !FM.routine.delegated(state, 'friendlies')) out.push({ day: 6, kind: 'friendly', fr, opp: fr.opp, home: fr.home });
    return out.sort((a, b) => a.day - b.day);
  }
  const curEvent = () => myEvents()[0] || null;
  const EV_UK = { mid: 'тур посеред тижня', league: 'ліга', cup: '', friendly: 'товариський' };
  /** Що за тиждень у вашій лізі (для підписів): передсезоння, вікно збірних, зимова перерва. */
  function weekNote() {
    const S = state.season, kind = FM.cal.weekKind(S, W.club(state.clubId).league, S.week);
    if (!kind) return null;
    const lg = S.cal.leagues[W.club(state.clubId).league];
    const d = (w, day = 6) => fmt.date(FM.season.dayDate(S, w, day)).slice(0, 5);
    if (kind === 'preseason') return `Передсезоння: перший тур — ${d(lg.start)}`;
    if (kind === 'intl') return 'Перерва на матчі збірних';
    if (kind === 'break') return `Зимова перерва до ${d(lg.brk[1])}`;
    if (kind === 'after') return 'Чемпіонат вашої ліги завершено';
    return null;
  }
  /** Що потребує відповіді людини (як листи з дією у FM). */
  function needsAction() {
    const S = state.season, out = [];
    for (const o of state.offers || []) { const p = W.player(o.pid); if (p && p.club === state.clubId && !o.seen) out.push({ kind: 'offer', o, p }); }
    for (const p of W.squad(state.clubId)) if (p.wantsOut && p.wantsOutAck !== S.year) out.push({ kind: 'unhappy', p });
    if (!(state.sponsor && state.sponsor.year === S.year) && state.sponsorLater !== S.year && S.week <= 4) out.push({ kind: 'sponsor' });
    if (state.evPending) out.push({ kind: 'event' });
    return out;
  }
  /** Наступна подія для верхньої панелі. */
  function nextEventText() {
    const S = state.season;
    if (FM.season.isOver(S)) return 'Сезон завершено';
    const ev = curEvent();
    if (ev) return `${DAY_UK[ev.day]} — ${ev.kind === 'cup' ? ev.pend.cup.name + ': ' : ev.kind === 'league' ? '' : EV_UK[ev.kind] + ': '}${clubName(W.club(ev.opp))} (${ev.home ? 'вдома' : 'на виїзді'})`;
    return weekNote() || 'Цього тижня матчу немає';
  }
  let running = false, contNote = null, topbarEl = null;
  function contLabel() {
    if (running) return 'Іде час…';
    const n = needsAction().length;
    if (n) return `Потрібна відповідь (${n})`;
    if (FM.season.isOver(state.season)) return 'Підсумки сезону';
    const ev = curEvent();
    if (ev && curDay() >= ev.day) return 'До матчу';
    return 'Продовжити';
  }
  function topbar() {
    const unread = FM.market.unread(state);
    const box = el('div.topbar', [
      el('div.tb-date', [el('b', dateLabel()), el('small.muted', nextEventText())]),
      contNote ? el('small.tb-note', contNote) : null,
      el('div.tb-actions', [
        unread ? el('a.btn.tb-mail', { href: '#inbox', title: 'Непрочитані повідомлення' }, `✉ ${unread}`) : null,
        FM.duo.on(state) ? el('button.btn.tb-duo', { type: 'button', disabled: running || null, title: 'Передати хід другому тренерові', onclick: () => { duoHandoff(); go('duo'); } }, `⇄ ${state.duo.other.manager}`)
          : el('a.btn.tb-hol', { href: '#holiday', title: 'Доручити тижні асистентові' }, 'Відпустка'),
        el('button.btn.primary.tb-cont', { type: 'button', disabled: running || null, title: 'Пробіл', onclick: () => continueGame() }, contLabel()),
      ]),
    ]);
    topbarEl = box;
    return box;
  }
  const refreshTopbar = () => { if (topbarEl && topbarEl.isConnected) topbarEl.replaceWith(topbar()); };
  /** Кнопка «Продовжити»: дні йдуть самі, зупинка — на рішеннях і матчах. */
  function continueGame() {
    if (running || !state) return;
    contNote = null;
    if (state.sacked) return go('sacked');
    if (FM.season.isOver(state.season)) return go('fixtures');
    if (needsAction().length) { contNote = 'Спершу дайте відповідь на листи (або відкладіть їх).'; return location.hash === '#inbox' ? render() : go('inbox'); }
    const pl0 = FM.plan.current(W, state);
    if (pl0 && !pl0.nagged && state.season.week === 0 && !FM.plan.progress(W, state, pl0).all) {
      pl0.nagged = true; saveGame();
      contNote = 'Асистент радить спершу пройти перші кроки. Можна й пропустити — натисніть «Продовжити» ще раз.';
      return location.hash === '#plan' ? render() : go('plan');
    }
    const d = curDay(), ev0 = curEvent();
    if (ev0 && d >= ev0.day) return location.hash === '#fixtures' ? render() : go('fixtures');
    running = true; refreshTopbar();
    const stop = (route, note) => { running = false; contNote = note || null; saveGame(); if (location.hash === '#' + route) render(); else go(route); };
    const step = () => {
      if (!running) return;
      const S = state.season;
      if (FM.season.isOver(S)) return stop('fixtures', 'Сезон завершено — підсумки й наступний сезон.');
      const day = curDay();
      if (day === 6) {
        if (curEvent()) return stop('fixtures', 'День матчу.');
        if (duoPending()) { duoHandoff(); return stop('duo'); } // гра на двох: матч другого тренера — його хід
        quickWeek(); // ваша ліга цього тижня не грає — тиждень минає сам
        if (state.sacked) return stop('sacked');
      } else state.day = day + 1;
      const nd = curDay(), ev = curEvent();
      if (ev && nd >= ev.day) return stop('fixtures', ev.kind === 'cup' ? `День матчу: ${ev.pend.cup.name}.` : ev.kind === 'mid' ? 'Тур посеред тижня.' : ev.kind === 'friendly' ? 'Передсезонний товариський матч.' : 'День матчу.');
      if (nd === 6 && myFixture()) return stop('fixtures', 'День матчу.');
      const dl = FM.market.windows(S).find(([, b]) => b === S.week);
      if (nd === (S.cal ? 1 : 5) && dl && state.deadlineSeen !== `${S.year}-${S.week}`) { state.deadlineSeen = `${S.year}-${S.week}`; return stop('transfers', 'Останній день трансферного вікна!'); }
      if (needsAction().length) return stop('inbox', 'Нові листи потребують відповіді.');
      refreshTopbar();
      setTimeout(step, 140);
    };
    setTimeout(step, 140);
  }
  // клавіші: пробіл — «Продовжити», Esc — назад
  document.addEventListener('keydown', (e) => {
    if (!state || activeLive) return;
    const t = document.activeElement && document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(t)) return;
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); continueGame(); }
    else if (e.key === 'Escape' && history.length > 1) history.back();
  });

  // ---------------- Гра на двох на одному телефоні ----------------
  /** Чи має другий тренер ще не зіграний матч ліги цього тижня (крім skip; midOnly — лише посеред тижня). */
  function duoPending(skip, midOnly) {
    if (!FM.duo.on(state)) return false;
    const o = FM.duo.otherClub(state), S = state.season;
    return FM.season.fixturesOfWeek(S, S.week).some((f) => f !== skip && !f.s && (f.h === o || f.a === o) && (!midOnly || f.mid));
  }
  /** Передати хід: тренери міняються, коли відкриється екран «Хід тренера». */
  function duoHandoff() { if (FM.duo.on(state)) { state.duo.handoff = true; running = false; saveGame(); } }
  function screenDuo() {
    if (!FM.duo.on(state)) return [el('header', [el('h1', 'Гра на двох')]), el('p.muted', 'Цю кар’єру веде один тренер. Гру на двох вмикають на старті нової кар’єри.')];
    if (state.duo.handoff) {
      state.duo.handoff = false;
      FM.duo.swap(state);
      FM.career.init(W, state);
      quick = null; contNote = null; inboxBase = null;
      saveGame();
    }
    const me = W.club(state.clubId), o = state.duo.other, ev = curEvent(), unread = FM.market.unread(state);
    const played = FM.season.fixturesOfWeek(state.season, state.season.week).some((f) => f.s && (f.h === state.clubId || f.a === state.clubId));
    return [el('div.duo-gate', [
      el('p.muted', 'Передайте телефон'),
      el('div.duo-who', [badge(me, true), el('div', [el('h1', state.manager), el('b', clubName(me))])]),
      el('p', [dateLabel(), ' · ', ev ? nextEventText() : played ? 'свій матч цього тижня ви вже зіграли' : 'цього тижня матчу немає']),
      unread ? el('p', `Нових повідомлень: ${unread}.`) : null,
      state.sacked ? el('p.bad', 'Вас звільнили — оберіть нову роботу.') : null,
      el('div.actions', [el('button.btn.primary', { type: 'button', onclick: () => go(state.sacked ? 'sacked' : unread ? 'inbox' : 'fixtures') }, 'Почати хід')]),
      el('p.note', `Наступним ходитиме ${o.manager} (${clubName(W.club(o.clubId))}). Хто перший зіграв свій матч, передає хід; тиждень закриває той, хто грає останнім. Кнопка «⇄» угорі — передати хід будь-коли.`),
    ])];
  }
  /** Кінець сезону за другого тренера — поки таблиці сезону ще на місці. */
  function duoSeasonStart() {
    if (!FM.duo.on(state)) return;
    const S = state.season;
    FM.duo.as(state, () => {
      FM.duo.second = true;
      try {
        FM.career.init(W, state);
        const my = W.club(state.clubId), t = FM.season.table(S, W, my.league), pos = t.findIndex((r) => r.id === my.id) + 1;
        const trophies = Object.values(state.cups || {}).filter((c) => c.winner === state.clubId).map((c) => c.id);
        const champ = t[0] && t[0].id === state.clubId;
        state.history = (state.history || []).concat([{ year: S.year, champions: {}, club: state.clubId, pos, pts: (t[pos - 1] || {}).pts || 0, scorer: null, trophies: trophies.concat(champ ? ['league'] : []) }]);
        const verdict = FM.board.endSeason(W, state);
        const ffp = FM.finance.endSeason(W, state);
        FM.market.news(state, ffp.text, 'club');
        if (trophies.length) { state.board.rep = Math.min(100, state.board.rep + 5 * trophies.length); state.board.conf = Math.min(100, state.board.conf + 10); }
        if (champ) addTrophy(null, my.league);
        FM.career.addTrophies(state, state.history[state.history.length - 1].trophies);
        state.duoEnd = { verdict, ffp: ffp.text, league: my.league };
      } finally { FM.duo.second = false; }
    });
    FM.career.init(W, state);
  }
  /** Після переходу в новий сезон: звіт, звільнення або нові цілі для другого тренера. */
  function duoSeasonFinish() {
    if (!FM.duo.on(state)) return;
    const main = state.lastReport, mainHist = state.history[state.history.length - 1];
    FM.duo.as(state, () => {
      const e = state.duoEnd; delete state.duoEnd;
      if (!e) return;
      const h = state.history[state.history.length - 1];
      if (mainHist) { h.champions = mainHist.champions; h.cups = mainHist.cups; h.awards = mainHist.awards; }
      state.lastReport = { ...main, league: e.league, awards: mainHist && mainHist.awards ? mainHist.awards[e.league] : main.awards, myRetired: [], youth: [], expired: [], golden: false,
        verdict: e.verdict.verdict, prize: e.verdict.prize, ffp: e.ffp, vision: null, ach: [], challenge: null };
      for (const m of main.moves || []) if (m.club === state.clubId) FM.market.news(state, m.up ? `Вітаємо! ${clubName(W.club(m.club))} виходить до ліги «${W.league(m.to).name}».` : `${clubName(W.club(m.club))} вилітає до ліги «${W.league(m.to).name}».`);
      if (e.verdict.fired) state.sacked = { reason: e.verdict.verdict, offers: FM.board.jobOffers(W, state, 3, 'end') };
      else { FM.board.initSeason(W, state); state.jobOffers = []; }
      FM.missions.current(W, state);
    });
    FM.career.init(W, state);
  }

  // ---------------- Швидкий режим (розширення 19) ----------------
  /** Один тиждень без трансляції й без переходу між екранами. */
  function quickWeek() {
    const S = state.season;
    if (weekFriendly()) return playPreFriendly(false, () => quickWeek());
    cupsWeek();
    const pend = FM.cups.pendingTie(state, state.clubId);
    if (pend) {
      const { opts } = FM.season.prepare(S, W, pend.f, NAMES, USER());
      if (pend.neutral) opts.neutral = true;
      if (pend.ko) opts.ko = pend.ko; // вирішальний матч: додатковий час і пенальті
      cupNews(FM.cups.finishPending(W, state, pend, FM.match.play(opts)));
      cupsWeek();
    }
    FM.season.playWeek(S, W, { name: NAMES, user: USER(), dev: devOpts() });
    FM.market.weekly(W, state);
    boardWeek();
    state.day = 0;
  }
  let quick = null; // { weeks, w, d, l, stop, running }
  /** Грати тижні поспіль, доки не знадобиться рішення людини. */
  // ---------------- Відпустка: тижні веде асистент за вашими правилами ----------------
  let holi = { until: 'window', offers: 'reject' };
  function screenHoliday() {
    const S = state.season;
    const opts = [['match', 'До наступного матчу'], ['2', '2 тижні'], ['4', '4 тижні'], ['8', '8 тижнів'], ['window', 'До наступного трансферного вікна'], ['season', 'До кінця сезону']];
    return [
      el('header', [el('h1', 'Відпустка'), el('span.muted', dateLabel())]),
      el('div.panel', [el('p', 'Асистент сам зіграє тижні (матчі — без трансляції, з вашою тактикою) і відповідатиме на листи за правилами нижче. Зупинка — коли настане обрана дата, наприкінці сезону або якщо правління вас звільнить.'),
        el('div.field', [el('label', { for: 'h-until' }, 'Як довго'), el('select', { id: 'h-until', onchange: (e) => { holi.until = e.target.value; } }, opts.map(([v, t]) => el('option', { value: v, selected: holi.until === v || null }, t)))]),
        el('div.field', [el('label', { for: 'h-off' }, 'Пропозиції за ваших гравців'), el('select', { id: 'h-off', onchange: (e) => { holi.offers = e.target.value; } }, [
          ['reject', 'Відхиляти всі'], ['surplus', 'Продавати лише запасних (не з перших 16), якщо пропонують не менше ціни'], ['all', 'Приймати, якщо пропонують на 30% більше ціни (крім основи)']].map(([v, t]) => el('option', { value: v, selected: holi.offers === v || null }, t)))]),
        el('p.muted', 'Незадоволених гравців асистент вислухає й лишить у команді; спонсора, якщо ще не обрано, підпише стабільного.'),
        el('div.actions', [el('button.btn.primary', { type: 'button', onclick: () => { go('fixtures'); quickRun({ holiday: { ...holi } }); } }, 'Їхати у відпустку')])]),
    ];
  }
  /** Асистент відповідає на листи під час відпустки. */
  function holidayInbox(h) {
    const S = state.season, top16 = new Set(W.squad(state.clubId).sort((a, b) => b.ca - a.ca).slice(0, 16).map((p) => p.id)), top11 = new Set([...top16].slice(0, 11));
    for (const o of (state.offers || []).slice()) {
      const p = W.player(o.pid);
      if (!p) { rejectOffer(o); continue; }
      const ok = FM.market.windowOpen(S) && ((h.offers === 'surplus' && !top16.has(p.id) && o.fee >= p.value) || (h.offers === 'all' && !top11.has(p.id) && o.fee >= p.value * 1.3));
      if (ok) { acceptOffer(o); quick.sold.push(`${nameOf(p)} (${M(o.fee)})`); } else rejectOffer(o);
    }
    for (const p of W.squad(state.clubId)) if (p.wantsOut) p.wantsOutAck = S.year;
    if (!(state.sponsor && state.sponsor.year === S.year)) FM.finance.choose(W, state, 'fixed');
    if (state.evPending) { const r = FM.events.answer(W, state, 0, nameOf); if (r) FM.market.news(state, '🎲 Асистент вирішив за вас: ' + r, 'club'); }
  }

  function quickRun(opts = {}) {
    const S = state.season;
    if (FM.duo.on(state)) { contNote = 'У грі на двох відпустка й швидкий режим вимкнені: кожен тренер грає свої матчі сам.'; return go('fixtures'); }
    const h = opts.holiday || null;
    const untilWeek = !h ? null : h.until === 'season' ? 999 : h.until === 'window' ? (FM.market.windows(S).map(([a]) => a).find((a) => a > S.week) ?? 999) : h.until === 'match' ? S.week + 1 : S.week + Number(h.until);
    quick = { weeks: 0, w: 0, d: 0, l: 0, stop: null, running: true, start: S.week, holiday: !!h, sold: [] };
    const keyIds = new Set(W.squad(state.clubId).sort((a, b) => b.ca - a.ca).slice(0, 3).map((p) => p.id));
    const step = () => {
      if (!quick || !quick.running) return;
      if (FM.season.isOver(state.season)) { quick.stop = 'Сезон завершено — підбийте підсумки й почніть наступний.'; return done(); }
      if (h) { holidayInbox(h); if (state.season.week >= untilWeek) { quick.stop = 'Відпустка закінчилася.'; return done(); } }
      const offers0 = (state.offers || []).length, injured0 = new Set(W.squad(state.clubId).filter((p) => p.injury >= 3).map((p) => p.id));
      const wk = state.season.week;
      quickWeek();
      quick.weeks++;
      for (const f of FM.season.fixturesOfWeek(state.season, wk).filter((x) => x.s && (x.h === state.clubId || x.a === state.clubId))) { // тур посеред тижня теж
        const d = f.h === state.clubId ? f.s[0] - f.s[1] : f.s[1] - f.s[0]; if (d > 0) quick.w++; else if (d < 0) quick.l++; else quick.d++;
      }
      const now = state.season.week;
      if (state.sacked) { quick.stop = 'Правління звільнило вас.'; return done(); }
      if (h) { if (now >= untilWeek) { holidayInbox(h); quick.stop = 'Відпустка закінчилася.'; return done(); } }
      else {
        if ((state.offers || []).length > offers0) { quick.stop = 'Надійшла пропозиція за вашого гравця.'; return done(); }
        if (state.evPending) { quick.stop = 'Подія в клубі потребує вашого рішення (пошта).'; return done(); }
        if (FM.market.windows(state.season).some(([a]) => now === a) && quick.weeks > 0) { quick.stop = 'Відкрилося трансферне вікно.'; return done(); }
        const hurt = W.squad(state.clubId).find((p) => keyIds.has(p.id) && p.injury >= 3 && !injured0.has(p.id));
        if (hurt) { quick.stop = `Травма лідера: ${nameOf(hurt)} (${hurt.injury} тиж.).`; return done(); }
        if (state.board && state.board.conf < 25) { quick.stop = 'Довіра правління — на межі.'; return done(); }
      }
      if (quick.weeks >= 50) { quick.stop = 'Зупинка після 50 тижнів.'; return done(); }
      render();
      setTimeout(step, 30); // дати браузеру намалювати хід
    };
    const done = () => { quick.running = false; saveGame(); state.sacked ? go('sacked') : render(); };
    render();
    setTimeout(step, 30);
  }
  function quickPanel() {
    if (!quick) return null;
    const q = quick;
    const nm = q.holiday ? '🏖 Відпустка' : '⏩ Швидкий режим';
    return el('div.panel.quick', [el('b', q.running ? `${nm}: зіграно ${q.weeks} тиж. (${q.w} В, ${q.d} Н, ${q.l} П)…` : `${nm}: зіграно ${q.weeks} тиж. — ${q.w} В, ${q.d} Н, ${q.l} П.`),
      q.stop ? el('p', 'Зупинка: ' + q.stop) : null,
      q.sold && q.sold.length ? el('p.muted', 'Асистент продав: ' + q.sold.join(', ') + '.') : null,
      el('div.actions', [q.running ? el('button.btn', { type: 'button', onclick: () => { q.running = false; q.stop = 'Зупинено вручну.'; saveGame(); render(); } }, 'Зупинити')
        : el('button.btn', { type: 'button', onclick: () => { quick = null; render(); } }, 'Сховати')])]);
  }

  /** Передсезонний товариський: команда звикає до схеми, результат іде в історію товариських. */
  function playPreFriendly(live, then) {
    const fr = weekFriendly();
    if (!fr) return then ? then() : go('fixtures');
    const mine = teamSide(state.clubId), opp = teamSide(fr.opp);
    const [hs, as] = fr.home ? [mine, opp] : [opp, mine];
    const myK = fr.home ? 0 : 1;
    const opts = { home: engineSide(hs, live && myK === 0), away: engineSide(as, live && myK === 1), seed: `pref-${state.season.seed}-${fr.w}`, name: nameOf, gen: genOf,
      weather: FM.weatherFor(FM.season.dateOf(state.season.week, state.season), hs.club.league, FM.rng(`pref-wx-${fr.w}`)) };
    const done = (r) => {
      fr.s = r.score.slice();
      for (const rr of r.ratings) if (rr.player.club === state.clubId && FM.attrs) { FM.attrs.playSharp(rr.player, (rr.off || 93) - (rr.on || 0)); rr.player.lastPlayed = state.season.week; } // передсезоння повертає ігрову форму
      state.friendlies = (state.friendlies || []).concat([{ home: clubName(hs.club), away: clubName(as.club), score: r.score.join(':') }]).slice(-20);
      const fam = familiarity(), f0 = myTactics().formation;
      fam[f0] = Math.min(100, (fam[f0] || 0) + 5); // гра — найкраще тренування схеми
      const [g1, g2] = fr.home ? r.score : [r.score[1], r.score[0]];
      FM.market.news(state, `Товариський (передсезоння): ${clubName(hs.club)} ${r.score.join(':')} ${clubName(as.club)}. ${g1 > g2 ? 'Перемога.' : g1 === g2 ? 'Нічия.' : 'Поразка — але це лише підготовка.'} Команда краще засвоює схему ${f0}.`, 'match');
      if (then) then(); else { quickWeek(); saveGame(); }
    };
    if (!live) { done(FM.match.play(opts)); return then ? null : go(state.sacked ? 'sacked' : 'fixtures'); }
    showLive('fixtures', hs, as, FM.match.create(opts), myK, done, [['Далі', () => go('fixtures'), true], ['Тактика', () => go('tactics')]]);
  }

  /** Тур посеред тижня (вівторок): решта таких турів — одразу, ваш — наживо або результатом; тиждень триває. */
  function playMidweek(f, live) {
    const S = state.season;
    if (duoPending(f, true)) { // гра на двох: другий тренер теж грає посеред тижня — свій матч, потім його хід
      const after = (r) => { FM.season.record(S, f, r); FM.season.midRecover(W, [f]); state.day = Math.max(curDay(), 2); duoHandoff(); saveGame(); };
      if (!live) { after(FM.season.play(S, W, f, NAMES, USER()).m); return go('duo'); }
      const { hs, as, opts } = FM.season.prepare(S, W, f, NAMES, USER());
      const myK = f.h === state.clubId ? 0 : 1;
      opts[myK === 0 ? 'home' : 'away'].manual = true;
      return showLive('fixtures', hs, as, FM.match.create(opts), myK, after, [['Далі: хід другого тренера', () => go('duo'), true]], { fixture: f });
    }
    FM.season.playOthers(S, W, { skip: f.id, name: NAMES, user: USER(), midOnly: true });
    const after = (r) => { FM.season.record(S, f, r); FM.season.midRecover(W, [f]); state.day = Math.max(curDay(), 2); saveGame(); };
    if (!live) { after(FM.season.play(S, W, f, NAMES, USER()).m); return go('fixtures'); }
    const { hs, as, opts } = FM.season.prepare(S, W, f, NAMES, USER());
    const myK = f.h === state.clubId ? 0 : 1;
    opts[myK === 0 ? 'home' : 'away'].manual = true;
    showLive('fixtures', hs, as, FM.match.create(opts), myK, after, [['Далі', () => go('fixtures'), true], ['Таблиця', () => go('table')]], { fixture: f });
  }

  function playMyMatch(live) {
    const S = state.season;
    const f = myFixture();
    if (f && f.mid) return playMidweek(f, live);
    if (!f && weekFriendly()) return playPreFriendly(live);
    cupsWeek();
    // кубкову пару, яку не зіграли наживо, грає помічник
    const pend = FM.cups.pendingTie(state, state.clubId);
    if (pend) {
      const { opts } = FM.season.prepare(S, W, pend.f, NAMES, USER());
      if (pend.neutral) opts.neutral = true;
      if (pend.ko) opts.ko = pend.ko; // вирішальний матч: додатковий час і пенальті
      cupNews(FM.cups.finishPending(W, state, pend, FM.match.play(opts)));
      cupsWeek();
    }
    if (duoPending(f)) { // гра на двох: другий тренер ще не зіграв — лише свій матч, тиждень закриє він
      if (!f) { duoHandoff(); return go('duo'); }
      const after = (r) => { FM.season.record(S, f, r); duoHandoff(); saveGame(); };
      if (!live) { after(FM.season.play(S, W, f, NAMES, USER()).m); return go('duo'); }
      const { hs, as, opts } = FM.season.prepare(S, W, f, NAMES, USER());
      const myK = f.h === state.clubId ? 0 : 1;
      opts[myK === 0 ? 'home' : 'away'].manual = true;
      return showLive('fixtures', hs, as, FM.match.create(opts), myK, after, [['Далі: хід другого тренера', () => go('duo'), true]], { fixture: f });
    }
    if (!f || !live) {
      FM.season.playWeek(S, W, { name: NAMES, user: USER(), dev: devOpts() });
      FM.market.weekly(W, state);
      boardWeek();
      state.day = 0;
      saveGame();
      return go(state.sacked ? 'sacked' : 'fixtures');
    }
    // решта матчів туру — одразу; наш — наживо з керуванням
    FM.season.playOthers(S, W, { skip: f.id, name: NAMES, user: USER() });
    saveGame();
    const { hs, as, opts } = FM.season.prepare(S, W, f, NAMES, USER());
    const myK = f.h === state.clubId ? 0 : 1;
    opts[myK === 0 ? 'home' : 'away'].manual = true;
    const M = FM.match.create(opts);
    showLive('fixtures', hs, as, M, myK, (r) => {
      FM.season.record(S, f, r);
      const dv = devOpts();
      FM.season.advance(S, W, { recovery: dv.recovery, myClub: state.clubId, also: dv.also });
      FM.dev.weekly(W, S, dv);
      FM.market.weekly(W, state);
      boardWeek();
      state.day = 0;
      saveGame();
    }, [['Далі', () => go(state.sacked ? 'sacked' : 'fixtures'), true], ['Таблиця', () => go('table')]], { fixture: f });
  }

  /** Трофей у шафу: кубок (фінал — рахунок і суперник) або чемпіонство. */
  function addTrophy(cup, league) {
    const S = state.season;
    let final = null;
    if (cup) {
      const r = cup.rounds && cup.rounds[cup.rounds.length - 1], t = r && r.ties && r.ties[0];
      if (t) { const opp = t.a === state.clubId ? t.b : t.a, sc = t.legs.reduce((acc, l) => [acc[0] + l[0], acc[1] + l[1]], [0, 0]); final = { opp: clubName(W.club(opp)), score: t.a === state.clubId ? sc : [sc[1], sc[0]], pens: !!t.pens }; }
    }
    const kind = league ? 'league' : cup.super ? 'super' : ['ucl', 'uel', 'uecl'].includes(cup.id) ? 'euro' : 'cup';
    state.trophies = (state.trophies || []).concat([{ kind, id: league || cup.id, name: league ? `Чемпіонат: ${W.league(league).name}` : cup.name, s: S.year, club: state.clubId, final }]);
  }

  /** Глядачі домашнього матчу: новина, журнал, рекорд відвідуваності. */
  function attendanceNews(oppId, comp) {
    const S = state.season, t = FM.season.table(S, W, W.club(state.clubId).league), n0 = t.length;
    const pos = t.findIndex((r) => r.id === state.clubId) + 1, rel = n0 > 1 ? 1 - (pos - 1) / (n0 - 1) : 0.5;
    const ma = state.matchAtt && state.matchAtt.opp === oppId && state.matchAtt.s === S.year ? state.matchAtt : null; // уже пораховано для звіту про матч
    const a = ma || FM.money.attendance(W, state, state.clubId, oppId, rel, FM.rivals.derby(W, state.clubId, oppId), null);
    state.matchAtt = null;
    state.attLog = (state.attLog || []).concat([{ s: S.year, w: S.week - 1, opp: oppId, n: a.n, fill: Math.round(a.fill * 100), comp }]).slice(-60);
    const rec = FM.awards.attendance(state, a.n, clubName(W.club(oppId)));
    FM.market.news(state, `Глядачів на матчі з ${clubName(W.club(oppId))}: ${fmt.int(a.n)} (заповнено ${Math.round(a.fill * 100)}%).${rec.length ? ' ' + rec[0] + '!' : ''}`, 'club');
  }

  /** Новина про кубковий матч вашого клубу + запис у статистику тренера. */
  function cupNews(e) {
    const tail = e.winner ? (e.winner === state.clubId ? ' — ви йдете далі!' : ' — виліт.') : '';
    FM.market.news(state, `${e.cupName}, ${e.round.toLowerCase()}: ${clubName(W.club(e.h))} ${e.score.join(':')} ${clubName(W.club(e.a))}${e.et && !e.pens ? ' (після додаткового часу)' : ''}${e.pens ? (e.so ? ` (пенальті ${e.so.join(':')})` : ' (пенальті)') : ''}${tail}`);
    const home = e.h === state.clubId;
    for (const t of FM.career.match(W, state, home ? e.score : [e.score[1], e.score[0]], home ? e.a : e.h, e.cup)) FM.market.news(state, t);
    for (const t of FM.awards.match(W, state, home ? e.score[0] : e.score[1], home ? e.score[1] : e.score[0], home ? e.a : e.h, e.cup)) FM.market.news(state, t, 'club');
    if (home && !e.neutral) attendanceNews(e.a, e.cup);
  }

  /** Кубкові матчі тижня (посеред тижня, грає помічник за вашою тактикою). */
  function cupsWeek() {
    for (const r of FM.cups.playWeek(W, state, { name: NAMES, user: USER(), gen: genOf, skipClub: state.clubId })) {
      if (r.mine) cupNews(r);
    }
    for (const cup of Object.values(state.cups)) if (cup.winner && !cup.announced) {
      cup.announced = true;
      if (cup.winner === state.clubId) addTrophy(cup);
      else if (cup.winner === FM.duo.otherClub(state)) FM.duo.as(state, () => { addTrophy(cup); FM.market.news(state, `ТРОФЕЙ! Ви виграли ${cup.name}!`); });
      FM.market.news(state, cup.winner === state.clubId ? `ТРОФЕЙ! Ви виграли ${cup.name}!` : `${clubName(W.club(cup.winner))} — переможець турніру «${cup.name}».`);
    }
  }

  /** Аналіз суперника: схема, підхід, лідери, форма, слабке місце. */
  function opponentReport(oppId, oppHome) {
    const S = state.season;
    const side = FM.season.sideFor(S, W, oppId, null, state.clubId, oppHome);
    const u = FM.lineupUnits(side.lineup), mine = mySide().units;
    const t = FM.season.table(S, W, W.club(oppId).league).find((r) => r.id === oppId);
    const best = [...side.lineup.xi].sort((a, b) => FM.slotValue(b.player, b.slot) - FM.slotValue(a.player, a.slot)).slice(0, 3);
    const scorer = Object.entries(S.ps).map(([id, st]) => [W.player(id), st]).filter(([p]) => p && p.club === oppId).sort((a, b) => b[1][1] - a[1][1])[0];
    const lines = [['атака', 'att'], ['контроль м\u2019яча', 'mid'], ['оборона', 'def'], ['воротар', 'gk']];
    const weak = lines.map(([n, k]) => [n, u[k] - mine[k]]).sort((a, b) => a[1] - b[1])[0];
    const strong = lines.map(([n, k]) => [n, u[k] - mine[k]]).sort((a, b) => b[1] - a[1])[0];
    const out = W.club(oppId).players.filter((id) => W.player(id).injury > 0 || S.bans[id]).map((id) => nameOf(W.player(id)));
    return el('details.opp', [el('summary', 'Аналіз суперника'), el('dl.facts', [
      el('dt', 'Схема й підхід'), el('dd', `${side.formation}, ${FM.match.TACTIC_UK.mentality[side.mentality]}`),
      el('dt', 'Ключові гравці'), el('dd', best.map((x) => `${nameOf(x.player)} (${FM.roleLabel(x.slot.role, x.slot.side)})`).join(', ')),
      scorer && scorer[1][1] ? el('dt', 'Бомбардир') : null, scorer && scorer[1][1] ? el('dd', `${nameOf(scorer[0])}, ${scorer[1][1]} гол.`) : null,
      el('dt', 'Форма'), el('dd', t && t.form.length ? formEl(t.form) : '—'),
      el('dt', 'Порівняно з вами'), el('dd', `найсильніше — ${strong[0]}, найслабше — ${weak[0]}`),
      out.length ? el('dt', 'Не зіграють') : null, out.length ? el('dd', out.join(', ')) : null,
    ])]);
  }

  function cupNote() {
    const pend = FM.cups.pendingTie(state, state.clubId);
    if (!pend) return null;
    const opp = pend.f.h === state.clubId ? pend.f.a : pend.f.h;
    const leg = pend.round.weeks.length > 1 ? ` (${pend.leg + 1}-й матч${pend.leg === 1 ? `, перший — ${pend.tie.legs[0].join(':')}` : ''})` : '';
    return el('div.cup-note', [
      el('b', `${pend.cup.name}, ${pend.round.name.toLowerCase()}${leg}`),
      el('p', `${pend.neutral ? 'Фінал на нейтральному полі' : pend.f.h === state.clubId ? 'Вдома' : 'На виїзді'} проти ${clubName(W.club(opp))}. Спершу кубок, потім матч ліги.`),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', onclick: () => playMyCup(true) }, 'Кубок: грати з трансляцією'),
        el('button.btn', { type: 'button', onclick: () => playMyCup(false) }, 'Кубок: одразу результат'),
      ]),
    ]);
  }

  // ---------------- Прес-конференції за ситуацією (js/press.js) ----------------
  let pressMsg = null;
  const PRESS_INFO = () => ({ name: nameOf, gen: genOf, club: clubName });
  /** Останній матч ліги вашого клубу (для прес-конференції після матчу). */
  function lastLeagueMatch() {
    const S = state.season;
    const f = S.fixtures.filter((x) => x.s && (x.h === state.clubId || x.a === state.clubId) && x.w === S.week - 1).pop();
    if (!f) return null;
    const home = f.h === state.clubId, gf = home ? f.s[0] : f.s[1], ga = home ? f.s[1] : f.s[0];
    const lastGoal = (f.gm || []).slice().sort((a, b) => a[1] - b[1]).pop();
    return { opp: clubName(W.club(home ? f.a : f.h)), score: `${gf}:${ga}`, d: gf - ga, late: !!(lastGoal && lastGoal[1] >= 85 && lastGoal[0] === (home ? 0 : 1) && Math.abs(gf - ga) <= 1 && gf >= ga) };
  }
  /** Прес-конференція: 2–3 питання одне за одним. kind 'pre' — перед матчем (oppId), 'post' — після. */
  function pressBlock(kind, oppId) {
    const key = `${state.season.year}-${state.season.week}-${kind}`;
    if (!state.press || state.press.key !== key) {
      const items = FM.press.build(W, state, { ...PRESS_INFO(), opp: oppId, last: kind === 'post' ? lastLeagueMatch() : null }, kind);
      state.press = { key, items, i: 0, said: [] };
    }
    const P = state.press;
    if (!P.items.length) return null;
    if (P.i >= P.items.length) return P.said.length ? el('div.press.done', [el('b', kind === 'post' ? 'Після матчу: преса' : 'Прес-конференція'), ...P.said.map((x) => el('p.muted', x))]) : null;
    if (FM.routine.delegated(state, 'press')) {
      while (P.i < P.items.length) { const it = P.items[P.i++]; P.said.push(`Асистент: «${it.a[Math.min(1, it.a.length - 1)][0]}» — ${FM.press.answer(W, state, it, Math.min(1, it.a.length - 1), nameOf)}`); }
      saveGame();
      return el('div.press.done', [el('b', 'Прес-конференцію провів асистент'), ...P.said.map((x) => el('p.muted', x))]);
    }
    const it = P.items[P.i];
    return el('div.press', [el('b', `${kind === 'post' ? 'Після матчу: преса' : 'Прес-конференція'} · питання ${P.i + 1} з ${P.items.length}`),
      ...P.said.map((x) => el('p.muted.small', x)),
      el('p', it.q), el('div.press-opts', it.a.map(([text], i) => el('button.btn', { type: 'button', onclick: () => {
        const r = FM.press.answer(W, state, it, i, nameOf);
        P.said.push(`«${text}» — ${r}`); P.i++;
        saveGame(); render();
      } }, text))),
      el('div.actions', [el('button.btn.link', { type: 'button', onclick: () => { P.i = P.items.length; saveGame(); render(); } }, 'Пропустити решту питань')])]);
  }
  const pressPanel = (oppId) => pressBlock('pre', oppId);
  /** Після матчу — пресі цікаві яскраві моменти (розгром, пізній гол). */
  function postPressCard() {
    if (state.season.week < 1) return null;
    const b = pressBlock('post', null);
    return b ? el('div.panel', b) : null;
  }

  function boardWeek(second) {
    const S = state.season;
    // вболівальники, будівництво, лікар, тренери ШІ
    const res = {};
    if (!second) for (const f of FM.season.fixturesOfWeek(S, S.week - 1)) if (f.s) { res[f.h] = Math.sign(f.s[0] - f.s[1]); res[f.a] = Math.sign(f.s[1] - f.s[0]); }
    FM.club.fansWeek(W, state, res);
    const built = FM.club.buildWeek(W, state);
    if (built) FM.market.news(state, `Завершено: ${FM.club.UPGRADES[built].label.toLowerCase()}.`);
    const R = FM.rng(`physio-${S.seed}-${S.week}`);
    for (const p of W.squad(state.clubId)) if (p.injury > 0 && R.chance(FM.club.lvl(state, 'physio') / 40)) { p.injury--; if (p.injury <= 0) delete p.injury; }
    if (!second) for (const e of FM.club.managersWeek(W, state)) {
      if (e.ex || e.club.league === W.club(state.clubId).league || W.clubLevel(e.club.id) > 140) FM.market.news(state, `${clubName(e.club)} звільнив тренера ${e.old}. Новий тренер — ${e.now}${e.ex ? ' (колишній гравець, завершив кар’єру нещодавно)' : ''}.`, 'world');
    }
    // міжнародне вікно: збірні грають, гравці повертаються втомленими
    if (!second && FM.nations && FM.nations.windows(S).includes(S.week)) {
      for (const { fx, m } of FM.nations.weekly(W, state, { name: (p) => nameOf(p) })) {
        const sc = fx.home ? m.score : [m.score[1], m.score[0]];
        const mine = m.ratings.filter((r) => r.player.club === state.clubId && r.team === (fx.home ? 0 : 1)).map((r) => nameOf(r.player));
        FM.market.news(state, `Збірна України: ${fx.home ? 'вдома' : 'на виїзді'} з ${FM.countries.name(fx.opp)} — ${sc.join(':')}.${mine.length ? ' Від вашого клубу грали: ' + mine.join(', ') + '.' : ''}`);
      }
    }
    const myFs = FM.season.fixturesOfWeek(S, S.week - 1).filter((f) => f.s && (f.h === state.clubId || f.a === state.clubId)); // тур посеред тижня + субота
    let wonAny = false;
    for (const myF of myFs) {
      const home = myF.h === state.clubId, d = home ? myF.s[0] - myF.s[1] : myF.s[1] - myF.s[0];
      for (const t of FM.career.match(W, state, home ? myF.s : [myF.s[1], myF.s[0]], home ? myF.a : myF.h, 'league')) FM.market.news(state, t);
      const t = FM.rivals.after(W, state, home ? myF.a : myF.h, Math.sign(d)); if (t) FM.market.news(state, t, 'match');
      const fd = FM.rivals.feud(W, state); if (fd && fd.club === (home ? myF.a : myF.h)) { const q = FM.rivals.feudAfter(W, state, d); if (q) FM.market.news(state, q, 'match'); }
      if (d > 0) wonAny = true;
      for (const t2 of FM.awards.match(W, state, home ? myF.s[0] : myF.s[1], home ? myF.s[1] : myF.s[0], home ? myF.a : myF.h, 'league')) FM.market.news(state, t2, 'club');
    }
    for (const t of FM.awards.week(W, state, nameOf)) FM.market.news(state, t, 'match');
    const p0 = state.paper && state.paper.w; makePaper();
    if (state.paper && state.paper.w !== p0 && state.paper.s === S.year) FM.market.news(state, `📰 ${state.paper.name}: «${state.paper.head}». Газета туру — в «Медіа».`, 'club');
    // глядачі на домашніх матчах тижня й атрибутика
    for (const f of myFs.filter((x) => x.h === state.clubId)) attendanceNews(f.a, 'league');
    // історії клубу — наслідки того, що відбувається; новини ліги
    for (const st of FM.stories.week(W, state, nameOf, genOf)) FM.market.news(state, st.text, st.cat);
    if (!second) for (const t of FM.stories.world(W, state, nameOf)) FM.market.news(state, '🌍 ' + t, 'world');
    // гучна заява на прес-конференції: результат матчу вирішує, хто сміятиметься
    if (state.pressBold && state.pressBold.y === S.year && state.pressBold.w === S.week - 1) {
      const lr = lastLeagueMatch(); delete state.pressBold;
      if (lr && lr.d < 0) { for (const p of W.squad(state.clubId)) p.morale = Math.max(0, (p.morale ?? 60) - 1); if (state.board) state.board.conf = Math.max(0, state.board.conf - 1.5); FM.market.news(state, `Гучні слова на прес-конференції обернулися проти вас: після поразки ${lr.score} газети цитують вас із сарказмом.`, 'club'); }
      else if (lr && lr.d > 0) { if (state.board) state.board.rep = Math.min(100, state.board.rep + 1); FM.market.news(state, `Слова дотримано: ${lr.score}. Преса пише про «тренера, який відповідає за свої слова».`, 'club'); }
    }
    // випадкова подія тижня: новина або лист з вибором
    const ev = FM.events.week(W, state, nameOf, genOf);
    if (ev && ev.text) FM.market.news(state, '🎲 ' + ev.text, 'club');
    else if (ev && ev.ask) FM.market.news(state, '🎲 ' + ev.ask + ' Рішення — у листі з дією.', 'club');
    const mr = FM.money.merch(W, state);
    if (mr.star) FM.market.news(state, `Футболки з прізвищем ${nameOf(mr.star)} розлітаються: атрибутика принесла ${M(mr.money)} за тиждень.`, 'club');
    FM.finance.week(W, state, wonAny);
    for (const t of FM.career.weekly(W, state)) FM.market.news(state, t);
    // рутина: вихідні дні піднімають настрій, наставники, доручення асистентові
    if (lastPlan && lastPlan.morale) for (const p of W.squad(state.clubId)) p.morale = Math.min(100, FM.morale.get(p) + lastPlan.morale);
    for (const t of FM.routine.mentorWeek(W, state)) FM.market.news(state, t, 'players');
    for (const t of FM.routine.delegateWeek(W, state)) FM.market.news(state, t);
    for (const t of FM.boardroom.promisesWeek(W, state)) FM.market.news(state, t, 'club');
    for (const t of FM.deals.week(W, state)) FM.market.news(state, t, 'transfers');
    const ln = FM.budget.loanWeek(W, state); if (ln) FM.market.news(state, ln, 'club');
    FM.contracts.weekBonuses(W, state); // бонуси за матч, гол, суху гру з контрактів
    for (const t of FM.tcentre.weekGoals(W, state)) FM.market.news(state, t, 'transfers');
    for (const t of FM.tcentre.loanWeekly(W, state, nameOf)) FM.market.news(state, t, 'transfers');
    const fresh = FM.medical.restWeek(W, state, `${S.year}-${S.week - 1}`);
    if (fresh.length) FM.market.news(state, `Після тижня відпочинку повністю свіжі: ${fresh.map(nameOf).join(', ')}.`, 'players');
    // міжнародне вікно, що минуло: хто їздив у збірні
    if (S.cal && S.cal.intl.includes(S.week - 1)) {
      const cu = FM.boardroom.callups(W, state, S.week - 1);
      if (cu.length) FM.market.news(state, `Повернулися зі збірних: ${cu.map((x) => `${nameOf(x.p)} (${FM.countries.name(x.p.nat)})`).join(', ')}. Гравці втомлені після перельотів.${cu.some((x) => x.hurt) ? ' Травмувалися: ' + cu.filter((x) => x.hurt).map((x) => `${nameOf(x.p)} — ${x.hurt} тиж.`).join(', ') + '.' : ''}`, 'players');
    }
    // історія для графіків: баланс і рівень ваших гравців
    state.balHist = (state.balHist || []).concat([[S.year, S.week, Math.round(W.club(state.clubId).balance * 100) / 100]]).slice(-150);
    state.caLog = state.caLog || {};
    for (const p of W.squad(state.clubId)) { const l = (state.caLog[p.id] = state.caLog[p.id] || []); if (!l.length || l[l.length - 1][2] !== p.ca) l.push([S.year, S.week, p.ca]); if (l.length > 40) l.shift(); }
    for (const t of FM.worldScout.week(W, state)) FM.market.news(state, t, 'transfers');
    for (const r of FM.scouting.week(W, state)) FM.market.news(state, r.text, 'transfers', r.pid ? { pid: r.pid } : null);
    for (const t of FM.agents.week(W, state)) FM.market.news(state, t, 'players');
    for (const t of FM.media.week(W, state, { club: clubName, player: nameOf })) FM.market.news(state, t, 'club');
    const yr = FM.youth.week(W, state);
    if (yr && (yr.score[0] - yr.score[1] >= 3 || yr.score[1] - yr.score[0] >= 3)) FM.market.news(state, `U-21: ${yr.score[0] > yr.score[1] ? 'розгром' : 'важка поразка'} — ${yr.score.join(':')} проти U-21 ${clubName(W.club(yr.opp))}.`, 'club');
    familiarityWeek(FM.season.fixturesOfWeek(S, S.week - 1).some((f) => f.h === state.clubId || f.a === state.clubId));
    for (const e of FM.morale.weekly(W, state)) FM.market.news(state, e.text);
    const r = FM.board.weekly(W, state);
    if (r.fired) state.sacked = { reason: r.reason, offers: FM.board.jobOffers(W, state, 3, 'sack') };
    // місії тижня: підсумок минулого, нові на цей
    for (const t of FM.missions.check(W, state)) FM.market.news(state, t, 'club');
    FM.missions.current(W, state);
    // гра на двох: той самий тиждень — для другого тренера (лише його клуб і справи)
    if (!second && FM.duo.on(state)) {
      const lp = lastPlan;
      FM.duo.as(state, () => {
        FM.duo.second = true;
        try { FM.career.init(W, state); lastPlan = (lastPlan2 && lastPlan2.myClub === state.clubId && lastPlan2.plan) || curPlan(); FM.market.weekly(W, state); boardWeek(true); } finally { FM.duo.second = false; }
      });
      lastPlan = lp; FM.career.init(W, state);
    }
  }

  function training() {
    if (!state.training) state.training = { focus: 'balanced', intensity: 'normal', individual: {} };
    if (!state.training.plan) state.training.plan = 'balanced';
    return state.training;
  }
  // ---------------- Розклад тижня по днях (як у FM) ----------------
  /** Дні матчів вашого клубу цього тижня (запам’ятовуються на початку тижня, щоб зіграні теж рахувалися). */
  function weekMatchDays() {
    const S = state.season, tr = training(), key = `${S.year}-${S.week}`;
    if (tr.md && tr.md.key === key) return tr.md.days;
    const days = [...new Set(myEvents().map((e) => e.day))];
    tr.md = { key, days };
    return days;
  }
  /** Розклад пн–пт: доручено асистентові — під матчі тижня; інакше — шаблон тренера; правки цього тижня — поверх. */
  function weekSchedule() {
    const S = state.season, tr = training(), key = `${S.year}-${S.week}`;
    const md = weekMatchDays();
    const kind = FM.cal.weekKind(S, W.club(state.clubId).league, S.week);
    const base = FM.routine.auto(md, kind === 'preseason' ? 'preseason' : md.length ? null : 'free', FM.routine.delegated(state, 'training') ? null : tr.plan || 'balanced');
    const own = tr.sched && tr.sched.key === key ? tr.sched.days : {};
    for (const d of FM.routine.DAYS) if (own[d] && base[d] !== 'match') base[d] = own[d];
    return base;
  }
  let lastPlan = null;
  /** Тижневий підсумок розкладу (відновлення, розвиток, тактика, ризик травм). */
  const curPlan = () => FM.routine.aggregate(weekSchedule());
  const devOpts = (inner) => {
    const st = state, plan = curPlan();
    if (!inner) lastPlan = plan;
    return { training: training(), myClub: st.clubId, plan, rest: FM.medical.rested(st),
      recovery: plan.recovery + (FM.club.lvl(st, 'fitness') - 10) * 0.4,
      growthMult: (p) => FM.club.growthMult(st, W, p) * ((W.age(p) ?? 24) <= 21 ? 1 + (FM.career.attr(st, 'youth') - 10) * 0.015 : 1) * FM.youth.growth(st, p) * FM.routine.growthMult(st, p),
      injuryMult: 1.2 - FM.club.lvl(st, 'fitness') * 0.02,
      also: !inner && FM.duo.on(st) ? [(lastPlan2 = FM.duo.as(st, () => devOpts(true)))] : [] }; // гра на двох: тренування другого тренера
  };
  let lastPlan2 = null; // розклад тижня другого тренера (гра на двох)
  /** Після тижня: знайомство зі схемою росте від матчів і підготовки, без практики — забувається. */
  function familiarityWeek(played) {
    const fam = familiarity(), cur = myTactics().formation;
    const plan = lastPlan || curPlan(); // розклад тижня, що минув
    for (const f of Object.keys(fam)) {
      if (f === cur) fam[f] = Math.min(100, fam[f] + (played ? 8 : 0) + plan.fam + (FM.club.lvl(state, 'assistant') - 10) * 0.3 + (FM.career.attr(state, 'tac') - 10) * 0.3);
      else fam[f] = Math.max(20, fam[f] - 1);
    }
  }

  /** Завершити сезон і почати наступний: історія, завершення кар'єри, юнаки, новий календар. */
  function startNextSeason() {
    duoSeasonStart(); // гра на двох: підсумки другого тренера, поки таблиці сезону на місці
    const S = state.season;
    const champions = {};
    for (const l of W.db.leagues) champions[l.id] = FM.season.table(S, W, l.id)[0].id;
    const my = W.club(state.clubId);
    const t = FM.season.table(S, W, my.league);
    const scorer = FM.season.leaders(S, W, my.league, 1, 1)[0];
    state.history = (state.history || []).concat([{
      year: S.year, champions, club: state.clubId, pos: t.findIndex((r) => r.id === my.id) + 1,
      pts: t.find((r) => r.id === my.id).pts, scorer: scorer ? [scorer.id, scorer.st[1]] : null,
    }]);
    const hist = state.history[state.history.length - 1];
    const awards = {};
    for (const l of W.db.leagues) {
      const a = FM.dev.awards(W, S, l.id);
      awards[l.id] = a;
      const give = (id, label) => { const pl = id && W.player(id); if (pl) pl.awards = (pl.awards || []).concat([`${label}, ${l.name} ${S.year}/${String(S.year + 1).slice(2)}`]); };
      give(a.mvp, 'Найкращий гравець'); give(a.young, 'Найкращий молодий гравець'); give(a.boot && a.boot[0], 'Найкращий бомбардир');
      for (const id of a.xi) give(id, 'Символічна збірна');
    }
    const trophies = Object.values(state.cups || {}).filter((c) => c.winner === state.clubId).map((c) => c.id);
    const cupWinners = Object.fromEntries(Object.values(state.cups || {}).map((c) => [c.id, c.winner]));
    const tables = Object.fromEntries(W.db.leagues.map((l) => [l.id, FM.season.table(S, W, l.id).map((r) => r.id)]));
    const verdict = FM.board.endSeason(W, state);
    const ffp = FM.finance.endSeason(W, state); // фінансовий фейр-плей — за фінансами цього сезону
    FM.market.news(state, ffp.text, 'club');
    if (trophies.length) { state.board.rep = Math.min(100, state.board.rep + 5 * trophies.length); state.board.conf = Math.min(100, state.board.conf + 10); }
    state.youthBonus = (FM.club.lvl(state, 'youth') - 10) + (FM.club.facilities(W, state.clubId).youth - 10) * 0.8;
    const contracts = FM.market.endSeason(W, state);
    const rep = FM.dev.endSeason(W, state);
    FM.club.addExPlayers(W, state, rep.retired); // ветерани — у резерв тренерів
    state.lastReport = {
      year: S.year,
      myRetired: rep.retired.filter((p) => p.lastClub === state.clubId).map((p) => p.id),
      youth: rep.youth.filter((p) => p.club === state.clubId).map((p) => p.id),
      stars: [...rep.retired].sort((a, b) => b.ca - a.ca).slice(0, 8).map((p) => p.id),
      expired: contracts.expired.filter((p) => p.lastClub === state.clubId).map((p) => p.id),
      awards: awards[my.league], league: my.league, golden: (rep.golden || []).includes(state.clubId),
    };
    FM.youth.intake(W, state, state.lastReport.youth); // вихованці академії — у молодіжну команду
    // день академії: презентація нового покоління
    const kids = (state.lastReport.youth || []).map((id) => W.player(id)).filter(Boolean);
    if (kids.length) {
      const star = [...kids].sort((a, b) => b.pa - a.pa)[0];
      state.academy = { y: state.season.year, ids: kids.map((p) => p.id), star: star.id, open: true };
      FM.market.news(state, `🎓 День академії: ${kids.length} ${FM.plural(kids.length, 'вихованець', 'вихованці', 'вихованців')} підписали перші контракти. Зірка випуску — ${nameOf(star)} (${FM.positions(star)}).`, 'players');
    }
    state.u21Stats = {}; state.u21Results = [];
    hist.cups = cupWinners;
    hist.awards = awards;
    hist.trophies = trophies.concat(champions[my.league] === my.id ? ['league'] : []);
    // нагороди сезону вашої ліги, кар'єра гравців клубу, Зала слави (до підвищень і нового сезону)
    if (champions[my.league] === my.id) addTrophy(null, my.league);
    for (const t of FM.awards.season(W, state, champions[my.league], hist.trophies.length).news) FM.market.news(state, t, 'club');
    // підвищення й пониження між дивізіонами
    // плей-оф за путівку вгору й стикові матчі за виживання
    const po = FM.season.playoffs(W, S, (h, a, id) => {
      const { opts } = FM.season.prepare(S, W, { id, h, a, w: FM.season.weeks(S) - 1 }, NAMES, USER());
      if (id.endsWith('-f')) opts.neutral = true;
      return FM.match.play(opts).score;
    });
    const myLg = W.club(state.clubId).league;
    for (const [lid, r] of Object.entries(po)) {
      const mine = r.winner === state.clubId || (r.clubs || []).includes(state.clubId) || r.log.join(' ').includes(clubName(W.club(state.clubId)));
      if (mine || lid === myLg || W.league(lid).up === myLg) FM.market.news(state, `${r.name}. ${r.log.join(' ')}`, 'match');
    }
    state.lastReport.playoffs = Object.values(po).map((r) => `${r.name}: ${clubName(W.club(r.winner))}`);
    const moves = FM.season.promote(W, S, po);
    for (const m of moves) {
      const c = W.club(m.club);
      c.income0 = Math.round(c.income0 * (m.up ? 1.4 : 0.72) * 100) / 100;
      if (m.club === state.clubId) FM.market.news(state, m.up ? `Вітаємо! ${clubName(c)} виходить до ліги «${W.league(m.to).name}».` : `${clubName(c)} вилітає до ліги «${W.league(m.to).name}».`);
    }
    state.lastReport.moves = moves.filter((m) => m.from === state.lastReport.league || m.to === state.lastReport.league || m.club === state.clubId);
    for (const t of FM.contracts.seasonEnd(W, state, { promoted: moves.some((m) => m.club === state.clubId && m.up), relegated: moves.some((m) => m.club === state.clubId && !m.up) })) FM.market.news(state, t, 'club');
    for (const t of FM.tcentre.seasonPromo(W, state, moves.some((m) => m.club === state.clubId && m.up))) FM.market.news(state, t, 'transfers');
    // кар'єра тренера: бачення правління, трофеї, досягнення
    {
      const lg = W.league(state.lastReport.league) || {};
      const domestic = lg.up || lg.id;
      FM.career.addTrophies(state, hist.trophies);
      const ce = FM.career.endSeason(W, state, { league: lg.id, tier2: lg.tier === 2, pos: hist.pos, champion: champions[lg.id] === state.clubId,
        cupWon: trophies.includes(domestic), trophies, promoted: moves.some((m) => m.club === state.clubId && m.up), relegated: moves.some((m) => m.club === state.clubId && !m.up),
        targetKind: state.board.target && state.board.target.kind });
      state.lastReport.vision = ce.lines;
      for (const t of ce.ach) FM.market.news(state, t);
      state.lastReport.ach = ce.ach;
      const ch = FM.challenges.endSeason(W, state, { league: lg.id, tier2: lg.tier === 2, pos: hist.pos, champion: champions[lg.id] === state.clubId,
        cupWon: trophies.includes(domestic), relegated: moves.some((m) => m.club === state.clubId && !m.up) });
      if (ch) { FM.market.news(state, ch, 'club'); state.lastReport.challenge = ch; }
    }
    // турнір збірних улітку
    if (FM.nations) {
      const st = (state.intl = state.intl || {});
      if (st.tourney) finishTourney(); // минулий турнір не дограли — доіграє помічник
      const Q = st.qual && st.qual.year === S.year + 1 ? FM.nations.qualTable(state) : null;
      const ukr = Q ? (Q.slice(0, 2).some((r) => r.c === 'UKR') ? 'in' : 'out') : null;
      if (Q) FM.market.news(state, ukr === 'in' ? `Україна виходить на ${st.qual.name.replace('Відбір: ', '')}!` : `Україна не пройшла відбір (${Q.findIndex((r) => r.c === 'UKR') + 1}-е місце в групі).`, 'intl');
      const big = FM.nations.tournamentFor(S.year + 1);
      if (big && st.coach && ukr === 'in') { // турнір — на екрані «Збірна», матчі України наживо
        st.tourney = FM.nations.createTournament(W, S.year + 1, S.seed, 'in');
        if (st.tourney) state.lastReport.tour = { name: st.tourney.name, pending: true };
      } else if (big) {
        const tour = FM.nations.tournament(W, S.year + 1, S.seed, ukr);
        if (tour) { state.lastReport.tour = tour; st.tours = (st.tours || []).concat([{ name: tour.name, winner: tour.winner, ukr: tour.ukr }]); }
      } else {
        // літо без Євро/ЧС: підсумок Ліги націй, фінал чотирьох, континентальні турніри
        const nl = FM.nations.nlEnd(W, state);
        if (nl) FM.market.news(state, nl.text, 'intl');
        FM.nations.invalidate();
        const euRank = Object.keys(FM.nations.pools(W)).filter((c) => FM.nations.EUROPE.has(c)).map((c) => [c, FM.nations.strength(W, c)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        const Aeu = euRank.slice(0, 16).filter((c) => c !== 'UKR' && !(st.nl && st.nl.group.includes(c)));
        const four = (nl && nl.finals ? ['UKR', ...Aeu.slice(0, 3)] : Aeu.slice(0, 4)).sort((a, b) => FM.nations.strength(W, b) - FM.nations.strength(W, a));
        const finals = four.length === 4 ? FM.nations.createKO(W, { name: `Фінал чотирьох Ліги націй ${S.year + 1}`, year: S.year + 1, seed: S.seed, teams: four }) : null;
        if (finals && st.coach && four.includes('UKR')) { st.tourney = finals; state.lastReport.tour = { name: finals.name, pending: true }; }
        else if (finals) {
          FM.nations.playUntil(W, finals, null);
          const sm = FM.nations.summary(finals);
          st.tours = (st.tours || []).concat([{ name: sm.name, winner: sm.winner, ukr: four.includes('UKR') ? sm.ukr : 'не грала' }]);
          FM.market.news(state, `${sm.name}: переможець — ${FM.countries.name(sm.winner)}.`, 'intl');
        }
        const cont = FM.nations.continental(W, S.year + 1, S.seed);
        for (const c of cont) { st.tours = (st.tours || []).concat([{ name: c.name, winner: c.winner, ukr: '—' }]); FM.market.news(state, `${c.name}: переможець — ${FM.countries.name(c.winner)}.`, 'intl'); }
        state.lastReport.worldCups = cont.map((c) => `${c.name}: ${FM.countries.name(c.winner)}`);
      }
      st.tours = (st.tours || []).slice(-40);
    }
    FM.dev.newSeason(W, state);
    FM.nations.ensurePools(W, state); // замість тих, хто завершив кар'єру, — нові гравці збірних
    FM.market.init(W, state);
    FM.club.init(W, state);
    for (const c of W.clubs.values()) delete c.vacancy;
    state.cups = FM.cups.createAll(W, state.season, tables);
    // Суперкубки: чемпіон проти володаря кубка (або віце-чемпіона), Суперкубок УЄФА
    const runners = Object.fromEntries(Object.keys(champions).map((l) => [l, (tables && tables[l] && tables[l][1]) || null]));
    Object.assign(state.cups, FM.cups.superCups(W, state.season, champions, cupWinners, runners));
    for (const c of Object.values(state.cups)) if (c.super && c.teams.includes(state.clubId)) FM.market.news(state, `${c.name}: ви зіграєте з ${clubName(W.club(c.teams.find((x) => x !== state.clubId)))} перед стартом сезону!`, 'match');
    FM.cups.payParticipation(W, state);
    // відкладені переходи (домовилися «наприкінці сезону»): гравці приєднуються зараз
    for (const t of FM.tcentre.runFuture(W, state, (p, d) => {
      const me = W.club(state.clubId), now = FM.deals.upfront(d.fee, d.inst);
      if (me.balance < now) return `Перехід ${nameOf(p)} зірвався: на рахунку немає ${M(now)}.`;
      state.board.fin.transfers = Math.round((state.board.fin.transfers - now - (d.offer.agent || 0)) * 100) / 100;
      FM.market.complete(W, state, p, me.id, now, d.offer.wage, d.offer.years, { agent: d.offer.agent || 0, sellOn: (d.ex.sellOn || 0) / 100, clause: d.offer.clause.release || null, goalBonus: d.offer.bonus.goal || null, swap: d.swap && W.player(d.swap) && W.player(d.swap).club === me.id ? d.swap : null });
      FM.contracts.apply(W, state, p, d.offer, me.id);
      FM.deals.register(state, p, d.from, d.fee, { inst: d.inst, apps: d.apps, bonus: d.bonus });
      FM.tcentre.registerExtras(state, p, d.from, d.ex);
      if (d.fee - now > 0) FM.budget.spend(W, state, d.fee - now);
      state.known = state.known || {}; state.known[p.id] = true;
      return `${nameOf(p)} приєднався до команди: відкладений перехід за ${M(d.fee)} завершено.`;
    })) FM.market.news(state, t, 'transfers');
    coachMsg = null;
    state.lastReport.ffp = ffp.text;
    const spBonus = FM.finance.trophy(W, state, hist.trophies.length);
    if (spBonus) FM.market.news(state, `Спонсор ${state.sponsor.name} виплатив бонус за трофеї: ${FM.market.fmtM(spBonus)}.`, 'club');
    state.lastReport.verdict = verdict.verdict;
    state.lastReport.prize = verdict.prize;
    if (verdict.fired) state.sacked = { reason: verdict.verdict, offers: FM.board.jobOffers(W, state, 3, 'end') };
    else {
      FM.board.initSeason(W, state);
      // після вдалого сезону — пропозиції від сильніших клубів
      const lvl = W.clubLevel(state.clubId);
      state.jobOffers = state.board.last && state.board.last.pos <= state.board.last.target
        ? FM.board.jobOffers(W, state, 3, 'up').filter((id) => W.clubLevel(id) > lvl + 3) : [];
    }
    duoSeasonFinish();
    FM.missions.current(W, state);
    saveGame();
    go(state.sacked ? 'sacked' : 'report');
  }

  function screenReport() {
    const R = state.lastReport;
    if (!R) return [el('p', 'Звіту ще немає.')];
    const list = (ids, extra) => el('ul.plist', ids.map((id) => W.player(id)).filter(Boolean).map((p) => el('li', [
      el('span', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ' ' + extra(p))]), starsEl(p.pa, 'Потенціал')])));
    return [
      el('header', [el('h1', `Новий сезон ${seasonLabel()}`), el('span.muted', `Підсумки сезону ${R.year}/${String(R.year + 1).slice(2)}`)]),
      R.moves && R.moves.length ? el('div.panel', [el('h3', 'Підвищення й пониження'), el('ul.plist', R.moves.map((m) => el('li', [el('span', [el('b', clubName(W.club(m.club))), el('small.muted', ` ${m.up ? '↑' : '↓'} ${W.league(m.to).name}`)])])))]) : null,
      R.worldCups && R.worldCups.length ? el('div.panel', [el('h3', 'Турніри збірних світу'), el('ul.plain', R.worldCups.map((t) => el('li', t)))]) : null,
      R.tour && R.tour.pending ? el('div.panel', [el('h3', R.tour.name), el('p', ['Україна на турнірі, а ви — її тренер! Матчі збірної — на екрані ', el('a', { href: '#nations' }, '«Збірна»'), '.'])]) : R.tour ? el('div.panel', [el('h3', R.tour.name), el('p', `Переможець — ${FM.countries.name(R.tour.winner)}${R.tour.final ? ` (фінал ${FM.countries.name(R.tour.final.a)} — ${FM.countries.name(R.tour.final.b)} ${R.tour.final.score.join(':')})` : ''}.`),
        el('p.muted', `Україна: ${R.tour.ukr || 'не кваліфікувалася'}.`)]) : null,
      R.verdict ? el('div.panel', [el('h3', 'Оцінка правління'), el('p', R.verdict), R.prize ? el('p.muted', `Призові за місце й кубки: ${FM.market.fmtM(R.prize)}`) : null,
        (state.jobOffers || []).length ? el('p', ['Вами цікавляться інші клуби — див. ', el('a', { href: '#board' }, 'Правління'), '.']) : null]) : null,
      R.challenge ? el('div.panel', [el('h3', 'Виклик'), el('p', R.challenge)]) : null,
      R.ffp ? el('div.panel', [el('h3', 'Фінансовий фейр-плей'), el('p', R.ffp)]) : null,
      R.vision && R.vision.length ? el('div.panel', [el('h3', 'Бачення правління'), el('ul.plain', R.vision.map((t) => el('li', t)))]) : null,
      R.ach && R.ach.length ? el('div.panel', [el('h3', 'Нові досягнення'), el('ul.plain', R.ach.map((t) => el('li', t.replace(/^Досягнення: /, ''))))]) : null,
      R.awards ? el('div.panel', [el('h3', `Нагороди сезону: ${W.league(R.league).name}`), el('dl.facts', [
        el('dt', 'Найкращий гравець'), el('dd', R.awards.mvp && W.player(R.awards.mvp) ? el('a', { href: '#player-' + R.awards.mvp }, nameOf(W.player(R.awards.mvp))) : '—'),
        el('dt', 'Найкращий молодий'), el('dd', R.awards.young && W.player(R.awards.young) ? el('a', { href: '#player-' + R.awards.young }, nameOf(W.player(R.awards.young))) : '—'),
        el('dt', 'Бомбардир'), el('dd', R.awards.boot && W.player(R.awards.boot[0]) ? `${nameOf(W.player(R.awards.boot[0]))} (${R.awards.boot[1]})` : '—'),
        el('dt', 'Символічна збірна'), el('dd', R.awards.xi.map((id) => W.player(id)).filter(Boolean).map((p) => `${nameOf(p)} (${clubName(W.club(p.club || p.lastClub) || W.club(state.clubId))})`).join(', ') || '—'),
      ])]) : null,
      el('div.panel', [el('h3', 'Юнаки, що прийшли з академії'), R.golden ? el('p.msg-ok', 'Цього року академія видала «золоте покоління» — більше юнаків і з вищим потенціалом!') : null, R.youth.length ? list(R.youth, (p) => `${FM.positions(p)}, ${W.age(p)} р.`) : el('p.muted', 'Цього разу ніхто.'),
        el('p.note', 'Зірки показують потенціал. Щоб юнаки росли, давайте їм ігровий час і тренування.')]),
      R.expired && R.expired.length ? el('div.panel', [el('h3', 'Пішли після завершення контракту'), list(R.expired, (p) => `${ageTxt(p)}`)]) : null,
      R.myRetired.length ? el('div.panel', [el('h3', 'Завершили кар’єру у вашому клубі'), list(R.myRetired, (p) => `${ageTxt(p)}`)]) : null,
      el('div.panel', [el('h3', 'Найвідоміші, хто завершив кар’єру'), R.stars.length ? list(R.stars, (p) => `${ageTxt(p)}${p.lastClub ? ', ' + clubName(W.club(p.lastClub)) : ''}`) : el('p.muted', '—')]),
      el('div.actions', [el('a.btn.primary', { href: '#fixtures' }, 'До сезону'), el('a.btn', { href: '#history' }, 'Історія')]),
    ];
  }

  let cupTab = null;
  function screenCups() {
    const cups = state.cups;
    const mine = FM.cups.clubStatus(state, state.clubId);
    if (!cupTab || !cups[cupTab]) cupTab = (mine[0] && mine[0].cup.id) || W.club(state.clubId).league;
    const cup = cups[cupTab];
    const order = ['ucl', 'uel', 'uecl', ...Object.keys(cups).filter((k) => !['ucl', 'uel', 'uecl'].includes(k))].filter((k) => cups[k]);
    const tieRow = (t, r) => {
      const legs = t.legs.map((x) => x.join(':')).join(', ');
      const ga = t.legs.reduce((s, x) => s + x[0], 0), gb = t.legs.reduce((s, x) => s + x[1], 0);
      const cls = (t.a === state.clubId || t.b === state.clubId) ? '.mine' : '';
      const side = (id) => el('td' + (t.winner === id ? '.win' : ''), [badge(W.club(id)), ' ', clubName(W.club(id))]);
      return el('tr' + cls, [side(t.a), el('td.score', t.legs.length ? `${ga} : ${gb}` : '–'), side(t.b),
        el('td.muted', [r.weeks.length > 1 && t.legs.length ? `(${legs})` : '', t.pens ? ' пен.' : '', !t.legs.length ? fmt.date(FM.season.dayDate(state.season, r.weeks[0], FM.cal.cupDay(cup.id))).slice(0, 5) : ''].join(' '))]);
    };
    return [
      el('header', [el('h1', 'Кубки'), el('span.muted', mine.length ? mine.map((x) => `${x.cup.name}: ${x.won ? 'переможець!' : x.out ? `виліт (${x.out.toLowerCase()})` : x.round ? x.round.name.toLowerCase() : 'чекає жеребкування'}`).join(' · ') : 'Ваш клуб не грає в єврокубках цього сезону')]),
      el('div.tabs', order.map((id) => el('button', { type: 'button', 'aria-pressed': String(id === cupTab), onclick: () => { cupTab = id; render(); } }, cups[id].name))),
      cup.winner ? el('div.panel', el('p.big', ['Переможець: ', clubName(W.club(cup.winner))])) : null,
      cup.phase ? (() => {
        const t = FM.cups.phaseTable(cup);
        const mineF = cup.phase.fixtures.filter((f) => f.h === state.clubId || f.a === state.clubId).sort((a, b) => a.r - b.r);
        return el('div.panel', [el('h3', `Етап ліги${cup.phase.done ? ' (завершено)' : ''}`),
          el('div.table-wrap', el('table.standings', [
            el('thead', el('tr', ['#', 'Клуб', 'І', 'О', 'М'].map((h, i) => el('th' + (i >= 2 ? '.num' : ''), h)))),
            el('tbody', t.map((r, i) => el('tr' + (i < 8 ? '.z-ucl' : i < 24 ? '.z-playoff' : '') + (r.id === state.clubId ? '.mine' : ''), [
              el('td.num.zone', i + 1), el('td.name', el('span.club-cell', [badge(W.club(r.id)), clubName(W.club(r.id))])),
              el('td.num', r.p), el('td.num', el('b', r.pts)), el('td.num', `${r.gf}:${r.ga}`)]))),
          ])),
          el('p.note', '1–8 — одразу в 1/8 фіналу, 9–24 — стикові матчі, решта вибуває.'),
          mineF.length ? el('div.table-wrap.flat', el('table.fixtures', el('tbody', mineF.map((f) => el('tr', [
            el('td.num', `${f.r + 1}`), el('td', fmt.date(FM.season.dayDate(state.season, f.w, FM.cal.cupDay(cup.id))).slice(0, 5)),
            el('td.num.team-h', [clubName(W.club(f.h)), ' ', badge(W.club(f.h))]), el('td.score', f.s ? f.s.join(' : ') : '–'), el('td.team-a', [badge(W.club(f.a)), ' ', clubName(W.club(f.a))])]))))) : null]);
      })() : null,
      ...cup.rounds.filter((r) => !r.skipped).map((r) => el('div.panel', [el('h3', `${r.name} · ${r.weeks.map((w) => fmt.date(FM.season.dayDate(state.season, w, FM.cal.cupDay(cup.id))).slice(0, 5)).join(' і ')}`),
        r.ties ? el('div.table-wrap.flat', el('table.fixtures.cup', el('tbody', r.ties.map((t) => tieRow(t, r))))) : el('p.muted', 'Пари стануть відомі після попереднього раунду.'),
        r.byes && r.byes.length ? el('p.note', 'Без стикового раунду, одразу в наступний: ' + r.byes.map((id) => clubName(W.club(id))).join(', ') + '.') : null])),
      el('p.note', 'Єврокубки — за новим форматом: етап ліги (8 турів, кожен клуб грає з вісьмома різними суперниками), 1–8 місця — одразу в 1/8 фіналу, 9–24 — стикові. Грають лише клуби ліг гри. Кубки країн — разом із другим дивізіоном. Пари з двох матчів (у кубках країн — один), фінал — на нейтральному полі; за нічиєї — пенальті.'),
    ];
  }

  function screenHelp() {
    const sec = (title, items) => el('div.panel', [el('h3', title), el('ul.help', items.map((t) => el('li', t)))]);
    return [
      el('header', [el('h1', 'Довідка'), el('span.muted', 'Як усе влаштовано')]),
      el('div.help-grid', [
        sec('Нагороди, гроші, події', [
          'Нагороди: команда туру щотижня, гравець і тренер місяця, нагороди сезону, рекорди клубу й Зала слави — меню «Нагороди».',
          'Гроші: абонементи продають у передсезоння («Клуб»), глядачі кожного домашнього матчу й рекорд стадіону, атрибутика (підпис зірки — сплеск продажів).',
          'Події: щотижня може статися щось у житті клубу — новина 🎲 або лист з вибором. У матчах бувають автоголи, хет-трики, голи-шедеври й навіть гол воротаря.',
          'Телефон: вібрація на голах і екран, що не гасне під час трансляції («Налаштування»). Резервну копію можна надіслати в Telegram чи на Диск кнопкою «Поділитися».',
        ]),
        sec('Календар, матч і щоденна робота (як у FM)', [
          'Сезон — з липня до кінця травня: передсезоння з товариськими, свій старт кожної ліги, вікна збірних (ліги не грають), зимові перерви, тури посеред тижня у вівторок. Ліга чемпіонів — у середу, Ліга Європи й конференцій — у четвер.',
          'Перед матчем — промова (кожен гравець реагує по-своєму), під час — вигуки з бровки (10 хвилин), у перерві — звіт асистента, після — розмова з командою. Стандарти — у тактиці.',
          'Тренування — розклад на кожен день; наставники для молоді; доручення асистентові — на екрані «Клуб». Медцентр показує ризик травми й дає відпочинок.',
          'Правління: прохання (фонд зарплат, гроші, контракт, фарм-клуб), співбесіда перед новою роботою. Трансфери: розстрочка, бонус за матчі, опція викупу, звіт скаута з оцінкою A–D.',
        ]),
        sec('Перші кроки в клубі', [
          'На початку кар’єри (і в новому клубі) асистент складає план: правління, звіт про склад, тактика, тренування, скаути, слабкі позиції, зайві гравці, контракти, штаб, товариський матч. Кроки позначаються самі, будь-який можна пропустити.',
          'Щоліта — коротша «Передсезонна підготовка». План — у меню й у пошті; перше «Продовжити» нагадає про нього один раз.',
        ]),
        sec('Як іде час (як у FM)', [
          'Кнопка «Продовжити» вгорі (на телефоні — внизу) або пробіл: дні йдуть самі. Середа — кубки й єврокубки, субота — матч ліги.',
          'Час зупиняється, коли потрібне ваше рішення: день матчу, пропозиція за гравця, незадоволений гравець, вибір спонсора, останній день трансферного вікна.',
          'Листи з дією — нагорі «Повідомлень»: прийняти чи відхилити пропозицію, поговорити з гравцем. Будь-який можна відкласти («Пізніше»).',
          'Трансляція: шість швидкостей — від «Дуже повільно» (≈10 хв на матч) до «Дуже швидко» (≈30 с), а також «Лише ключові моменти». Вибір запам’ятовується.',
          'Небезпечні моменти виділяються, як у FM: смуга «⚡ Небезпечна атака», м’яч летить на полі, потім результат — гол, сейв, штанга, блок чи удар повз (з xG), і трансляція на мить пригальмовує. Режим «Моменти»: лише голи, небезпечні моменти (xG від 0,12, штанги, пенальті), усі удари або без виділення.',
          '«Відпустка» — асистент сам веде тижні до обраної дати й відповідає на листи за вашими правилами. «Швидкий режим» — те саме, але зупиняється на кожному важливому рішенні.',
          'Клавіші: пробіл — «Продовжити», Esc — назад.',
        ]),
        sec('Дані', [
          'Ліги, клуби, гравці, дати народження, позиції, матчі за збірні — реальні (Wikipedia, Wikidata). Чого там немає — згенеровано й позначено «орієнтовно».',
          'Атрибути 1–20, рівень, потенціал, ціни, контракти й зарплати — власна формула: таких відкритих даних немає.',
          'Неточності можна виправити в редакторі (кнопка «Редагувати» в картці гравця чи клубу).',
        ]),
        sec('Матч', [
          'Сила ліній (атака, контроль, оборона, воротар) — з атрибутів гравців на їхніх позиціях, з урахуванням втоми й настрою.',
          'Щохвилини: хто володіє м\u2019ячем, чи буде момент, чи стане він голом. Хто програє наприкінці — тисне.',
          'У трансляції: пауза, заміни (до 5), зміна підходу, промова в перерві.',
        ]),
        sec('Тактика', [
          'Сміливіша ментальність — більше моментів у вас і в суперника.',
          'Високий пресинг — більше м\u2019яча, але втома, картки й простір за спиною.',
          'Короткі передачі — менше, але кращих моментів; довгі — навпаки.',
          'Гравець не на своїй позиції грає помітно гірше (червоне кільце на полі).',
        ]),
        sec('Сезон і кубки', [
          'Календар реального формату, порядок турів — випадковий. Тур щосуботи.',
          'Кубок країни й єврокубки (лише клуби шести ліг гри) — кубкові матчі грає помічник за вашою тактикою.',
          'Червона картка й кожні 5 жовтих — пропуск матчу. Травми — від 1 до 20 тижнів.',
        ]),
        sec('Гравці', [
          'Молодь росте до потенціалу — швидше, якщо грає й правильно тренується; після 30 гравці згасають.',
          'Настрій залежить від результатів, ігрового часу (лідер чекає ~70% матчів), оцінок і контракту; він впливає на гру.',
          'Наприкінці сезону ветерани завершують кар\u2019єру, а з академій приходять юнаки.',
        ]),
        sec('Гроші й правління', [
          'Трансферні вікна: перші 4 тижні сезону й тижні 21–24. Вільних агентів можна брати будь-коли.',
          'Купівля: спершу торг із клубом, потім контракт із гравцем; правління стежить за фондом зарплат.',
          'Правління ставить ціль за силою складу. Довіра падає від поразок і боргів — можуть звільнити.',
          'Репутація росте від виконаних цілей і трофеїв і відкриває пропозиції від сильніших клубів.',
        ]),
      ]),
    ];
  }

  // ---------------- Профіль тренера (крок 40) і досягнення (крок 43) ----------------
  let coachMsg = null;
  function screenCoach() {
    const c = FM.career.init(W, state), s = c.stats, C = FM.career;
    const next = C.nextLicence(state);
    const pct = s.p ? Math.round((s.w / s.p) * 100) : 0;
    const ach = state.ach || {};
    return [
      el('header', [el('h1', state.manager), el('span.muted', `Репутація ${state.board ? state.board.rep : '—'} з 100 · ${C.LIC[c.licence].label}`)]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Навички'), el('ul.attrs', Object.entries(C.CATTRS).map(([k, d]) => el('li', { title: d.hint }, [d.label, el('b.' + attrClass(c.attrs[k]), String(c.attrs[k]))]))),
          el('p.note', 'Навички ростуть з досвідом (кожні 12 матчів) і після курсів ліцензій.')]),
        el('div.panel', [el('h3', 'Ліцензія'), el('p', `${C.LIC[c.licence].label}: ${C.LIC[c.licence].maxLvl > 500 ? 'можна очолити будь-який клуб' : 'клуби з рівнем складу до ' + C.LIC[c.licence].maxLvl}.`),
          c.course ? el('p', `Триває курс на ліцензію ${c.course.lic}: ще ${c.course.left} тиж.`)
            : next ? el('button.btn', { type: 'button', onclick: () => { const r = C.startCourse(W, state); coachMsg = r.ok ? `Курс почався: ${r.weeks} тижнів. Клуб заплатив ${FM.market.fmtM(r.cost)}` : r.reason; saveGame(); render(); } },
              `Курс на ліцензію ${next} (${C.LIC[next].weeks} тиж., ${FM.market.fmtM(C.LIC[next].cost)})`) : el('p.muted', 'Найвища ліцензія.'),
          coachMsg ? el('p.muted', coachMsg) : null]),
        el('div.panel', [el('h3', 'Кар’єра'), el('dl.facts', [
          el('dt', 'Матчі'), el('dd', String(s.p)), el('dt', 'Перемоги / нічиї / поразки'), el('dd', `${s.w} / ${s.d} / ${s.l} (${pct}% перемог)`),
          el('dt', 'Голи'), el('dd', `${s.gf}:${s.ga}`), el('dt', 'Без поразок поспіль'), el('dd', String(c.streak)),
          el('dt', 'Сезонів'), el('dd', String((state.history || []).length)),
        ])]),
      ]),
      el('div.table-wrap', el('table', [
        el('thead', el('tr', [el('th', 'Клуб'), el('th', 'Сезони'), el('th.num', 'М'), el('th.num', 'В'), el('th.num', 'Н'), el('th.num', 'П'), el('th', 'Трофеї')])),
        el('tbody', [...c.clubs].reverse().map((x) => el('tr', [el('td', clubName(W.club(x.id))), el('td', `${x.from}/${String(x.from + 1).slice(2)} — ${x.to == null ? 'досі' : `${x.to}/${String(x.to + 1).slice(2)}`}`),
          el('td.num', x.p), el('td.num', x.w), el('td.num', x.d), el('td.num', x.l),
          el('td', x.trophies.length ? x.trophies.map((t) => (t === 'league' ? 'Чемпіонат' : FM.cups.NAMES[t] || t)).join(', ') : '—')]))),
      ])),
      state.challenge ? el('div.panel', [el('h3', 'Виклик: ' + FM.challenges.DEFS[state.challenge.id].label), el('p', FM.challenges.DEFS[state.challenge.id].desc),
        el('p.' + (state.challenge.status === 'done' ? 'msg-ok' : state.challenge.status === 'failed' ? 'msg-bad' : 'muted'), state.challenge.status === 'done' ? `Виконано в сезоні ${state.challenge.done}/${String(state.challenge.done + 1).slice(2)}!` : state.challenge.status === 'failed' ? 'Провалено.' : `Триває: до кінця сезону ${state.challenge.until}/${String(state.challenge.until + 1).slice(2)}.`)]) : null,
      el('div.panel', [el('h3', `Досягнення: ${Object.keys(ach).length} з ${C.ACH.length}`), el('ul.ach', C.ACH.map(([id, label, hint]) => el('li' + (ach[id] ? '.got' : ''), [
        el('b', label), el('small', ach[id] ? `${hint} · ${ach[id]}` : hint)])))]),
    ];
  }

  // ---------------- Порівняння гравців (крок 46) ----------------
  function toggleCompare(id) {
    const c = (state.compare = state.compare || []);
    const i = c.indexOf(id);
    if (i >= 0) c.splice(i, 1); else { c.push(id); if (c.length > 3) c.shift(); }
    saveGame();
  }
  function screenCompare() {
    const ps = (state.compare || []).map((id) => W.player(id)).filter(Boolean);
    if (ps.length < 2) return [el('header', [el('h1', 'Порівняння')]), el('p', 'Додайте щонайменше двох гравців кнопкою «Порівняти» на їхніх картках (до трьох).'),
      ps.length ? el('p', ['Зараз у порівнянні: ', el('a', { href: '#player-' + ps[0].id }, nameOf(ps[0])), '.']) : null];
    const S = state.season;
    const gk = ps.every((p) => p.roles[0] === 'GK');
    const groups = FM.ATTR_GROUPS[gk ? 'gk' : 'outfield'];
    // значення атрибута, яке бачить тренер: точно — для своїх і розвіданих, інакше — орієнтовно
    const seen = (p, k) => (known(p) ? p.attrs[k] : p.attrs[k] + fuzz(p, k + 'm', 1));
    const st = (p) => S.ps[p.id] || [0, 0, 0, 0, 0, 0];
    const rowsNum = [
      ['Вік', (p) => W.age(p), -1], ['Рівень (зірки)', (p) => (known(p) ? p.ca : null), 1, (p) => starsEl(known(p) ? p.ca : p.ca + fuzz(p, 'ca', 8), 'Рівень')],
      ['Потенціал', (p) => (known(p) ? p.pa : null), 1, (p) => starsEl(known(p) ? p.pa : p.pa + fuzz(p, 'pa', 12), 'Потенціал')],
      ['Ціна', (p) => p.value, 0, (p) => FM.market.fmtM(p.value)], ['Зарплата, тис. €/тиж.', (p) => p.wage, -1],
      ['Контракт до', (p) => p.contract, 0], ['Форма', (p) => FM.career.formAvg(p), 1, (p) => (FM.career.formAvg(p) != null ? FM.career.formAvg(p).toFixed(1).replace('.', ',') : '—')],
      ['Матчі сезону', (p) => st(p)[0], 1], ['Голи', (p) => st(p)[1], 1], ['Передачі', (p) => st(p)[2], 1],
      ['Середня оцінка', (p) => (st(p)[0] ? st(p)[3] / st(p)[0] / 10 : null), 1, (p) => (st(p)[0] ? (st(p)[3] / st(p)[0] / 10).toFixed(2).replace('.', ',') : '—')],
    ];
    const best = (vals, dir) => { if (!dir) return null; const v = vals.filter((x) => x != null); if (v.length < 2) return null; const b = dir > 0 ? Math.max(...v) : Math.min(...v); return v.filter((x) => x === b).length === v.length ? null : b; };
    const tr = (label, vals, cells, dir) => { const b = best(vals, dir); return el('tr', [el('th', { scope: 'row' }, label), ...cells.map((c, i) => el('td' + (b != null && vals[i] === b ? '.best' : ''), c))]); };
    const body = [];
    for (const [label, f, dir, show] of rowsNum) { const vals = ps.map(f); body.push(tr(label, vals, ps.map((p, i) => (show ? show(p) : vals[i] == null ? '—' : String(vals[i]))), dir)); }
    for (const [g, keys] of groups) {
      body.push(el('tr.group', el('th', { colspan: ps.length + 1 }, g)));
      for (const k of keys) { const vals = ps.map((p) => seen(p, k)); body.push(tr(FM.ATTRS[k], vals, ps.map((p, i) => (known(p) ? String(vals[i]) : `≈${vals[i]}`)), 1)); }
    }
    return [
      el('header', [el('h1', 'Порівняння'), el('button.btn', { type: 'button', onclick: () => { state.compare = []; saveGame(); go('squad'); } }, 'Очистити')]),
      el('div.table-wrap', el('table.compare', [
        el('thead', el('tr', [el('th', ''), ...ps.map((p) => el('th', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${p.club ? clubName(W.club(p.club)) : 'без клубу'}`)]))])),
        el('tbody', body),
      ])),
      el('p.note', 'Найкраще значення в рядку виділено. «≈» — гравця не розвідано, значення приблизне.'),
    ];
  }

  // ---------------- Календар сезону (крок 45) ----------------
  const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
  function screenCalendar() {
    const S = state.season, me = state.clubId, nW = FM.season.weeks(S);
    const ev = Array.from({ length: nW }, () => []);
    const vs = (h, a) => (h === me ? `${clubName(W.club(a))} (вдома)` : `${clubName(W.club(h))} (виїзд)`);
    const res = (sc, h) => (sc ? ` — ${(h === me ? sc : [sc[1], sc[0]]).join(':')}` : '');
    const dn2 = (day) => DAY_UK[day] + ' ';
    for (const f of FM.season.clubFixtures(S, me)) { const dn = FM.rivals.derby(W, f.h, f.a); ev[f.w].push({ d: f.mid ? 2 : 6, k: dn ? 'derby' : 'league', t: `${dn2(f.mid ? 2 : 6)}${dn ? dn + ' · ' : ''}Ліга, ${roundOf(f)}-й тур${f.mid ? ' (посеред тижня)' : ''}: ${vs(f.h, f.a)}${res(f.s, f.h)}` }); }
    for (const fr of preFriendlies()) if (ev[fr.w]) ev[fr.w].push({ d: 6, k: 'friendly', t: `${dn2(6)}Товариський: ${vs(fr.home ? me : fr.opp, fr.home ? fr.opp : me)}${res(fr.s, fr.home ? me : fr.opp)}` });
    for (const cup of Object.values(state.cups || {})) {
      const cd = dn2(FM.cal.cupDay(cup.id));
      if (cup.phase) for (const f of cup.phase.fixtures) if ((f.h === me || f.a === me) && ev[f.w]) ev[f.w].push({ d: 3, k: 'cup', t: `${cd}${cup.name}, етап ліги: ${vs(f.h, f.a)}${res(f.s, f.h)}` });
      if (!cup.teams.includes(me)) continue;
      for (const [ri, r] of cup.rounds.entries()) {
        if (r.skipped) continue;
        const tie = r.ties && r.ties.find((t) => t.a === me || t.b === me);
        const out = r.ties && !tie && cup.rounds.slice(0, ri).some((x) => x.ties && x.ties.some((t) => (t.a === me || t.b === me) && t.winner && t.winner !== me));
        if (out) continue;
        r.weeks.forEach((w, leg) => {
          if (!ev[w]) return;
          if (tie) { const [h, a] = leg === 1 ? [tie.b, tie.a] : [tie.a, tie.b]; const L = tie.legs[leg]; ev[w].push({ d: 3, k: 'cup', t: `${cd}${cup.name}, ${r.name.toLowerCase()}: ${vs(h, a)}${L ? ' — ' + (tie.a === me ? L : [L[1], L[0]]).join(':') : ''}` }); }
          else if (!r.ties) ev[w].push({ d: 3, k: 'cup', t: `${cd}${cup.name}, ${r.name.toLowerCase()} (якщо пройдете)`, maybe: true });
        });
      }
    }
    for (const w of (S.cal ? S.cal.intl : FM.nations.windows(S))) if (ev[w]) ev[w].push({ k: 'intl', t: 'Міжнародне вікно: ліги не грають, гравці їдуть у збірні' });
    for (const [a, b] of FM.market.windows(S)) { if (ev[a]) ev[a].push({ k: 'window', t: 'Відкривається трансферне вікно' }); if (ev[b]) ev[b].push({ k: 'window', t: 'Останній тиждень трансферного вікна' }); }
    if (ev[nW - 1]) ev[nW - 1].push({ k: 'end', t: 'Кінець сезону. Далі — підсумки, підвищення й виліт' });
    // передсезоння й зимова перерва вашої ліги
    const lg = S.cal && S.cal.leagues[W.club(me).league];
    if (lg) {
      for (let w = 0; w < lg.start; w++) if (!ev[w].some((e) => e.k === 'friendly')) ev[w].push({ k: 'pre', t: 'Передсезоння: тренувальний збір' });
      if (lg.brk) for (let w = lg.brk[0]; w <= lg.brk[1]; w++) if (ev[w] && !ev[w].length) ev[w].push({ k: 'pre', t: 'Зимова перерва в лізі' });
    }
    for (const e of ev) e.sort((a, b) => (a.d ?? 9) - (b.d ?? 9));
    let month = -1;
    const rows = [];
    for (let w = 0; w < nW; w++) {
      const d = FM.season.dateOf(w, S), m = Number(d.slice(5, 7)) - 1;
      if (m !== month) { month = m; rows.push(el('li.day', `${MONTHS[m]} ${d.slice(0, 4)}`)); }
      rows.push(el('li.cal' + (w === S.week ? '.now' : w < S.week ? '.past' : ''), [el('span.cal-d', [el('b', `Тиждень ${w + 1}`), el('small.muted', fmt.date(d))]),
        el('span.cal-e', ev[w].length ? ev[w].map((e) => el('span.ev.ev-' + e.k + (e.maybe ? '.maybe' : ''), e.t)) : el('span.muted', '—'))]));
    }
    return [
      el('header', [el('h1', 'Календар'), el('span.muted', `Сезон ${seasonLabel()} · зараз тиждень ${Math.min(S.week + 1, nW)} з ${nW}`)]),
      el('div.legend', [['league', 'Ліга'], ['derby', 'Дербі'], ['cup', 'Кубки'], ['friendly', 'Товариські'], ['intl', 'Збірні'], ['window', 'Трансфери'], ['pre', 'Збір / перерва']].map(([k, l]) => el('span.ev.ev-' + k, l))),
      el('div.panel', el('ul.news.inbox.calendar', rows)),
    ];
  }

  /** Листи, що потребують відповіді (як у FM: дія прямо в листі). */
  function actionCards() {
    const acts = needsAction();
    if (!acts.length) return null;
    const S = state.season, open = FM.market.windowOpen(S);
    const done = () => { saveGame(); render(); };
    return el('div.panel.actions-box', [el('h3', `Потребує вашої відповіді: ${acts.length}`), el('ul.plist', acts.map((a) => {
      if (a.kind === 'offer') {
        const buyer = W.club(a.o.from), p = a.p, key = FM.market.rankInClub(W, p) < 11;
        return el('li.act', [el('span', [el('b', `${clubName(buyer)} пропонує ${M(a.o.fee)} за `), el('a', { href: '#player-' + p.id }, nameOf(p)),
          el('small.muted', ` · ціна ${M(p.value)}${key ? ' · гравець основи' : ''}${open ? '' : ' · вікно закрите — прийняти можна, коли відкриється'}`)]),
          el('span.offer-btns', [
            el('button.btn.primary', { type: 'button', disabled: open ? null : true, onclick: () => { acceptOffer(a.o); done(); } }, 'Прийняти'),
            el('button.btn', { type: 'button', onclick: () => { rejectOffer(a.o); done(); } }, 'Відхилити'),
            el('button.btn.link', { type: 'button', onclick: () => { a.o.seen = true; done(); } }, 'Пізніше'),
          ])]);
      }
      if (a.kind === 'event') {
        const pe = state.evPending;
        return el('li.act', [el('span', ['🎲 ', pe.ask]), el('span.offer-btns', pe.opts.map(([label, hint], i) => el('button.btn' + (i === 0 ? '.primary' : ''), { type: 'button', title: hint, onclick: () => {
          const r = FM.events.answer(W, state, i, nameOf); if (r) FM.market.news(state, '🎲 ' + r, 'club'); done();
        } }, label)))]);
      }
      if (a.kind === 'unhappy') return el('li.act', [el('span', [el('a', { href: '#player-' + a.p.id }, nameOf(a.p)), ` незадоволений (${a.p.mr || 'настрій'}) і просить поговорити або продати його.`]),
        el('span.offer-btns', [el('a.btn.primary', { href: '#player-' + a.p.id }, 'Поговорити'), el('button.btn', { type: 'button', onclick: () => { a.p.listed = true; a.p.wantsOutAck = S.year; FM.market.news(state, `${nameOf(a.p)} виставлений на трансфер на його прохання.`, 'players'); done(); } }, 'Виставити на продаж'),
          el('button.btn.link', { type: 'button', onclick: () => { a.p.wantsOutAck = S.year; done(); } }, 'Пізніше')])]);
      return el('li.act', [el('span', 'Правління просить обрати спонсора на сезон.'), el('span.offer-btns', [el('a.btn.primary', { href: '#board' }, 'Обрати'),
        el('button.btn.link', { type: 'button', onclick: () => { state.sponsorLater = S.year; done(); } }, 'Пізніше')])]);
    })), contNote ? el('p.msg-bad', contNote) : null]);
  }


  // ---------------- Перші кроки в клубі (як у FM перед сезоном) ----------------
  /** Позначити відвідування екрана для плану; створити план, якщо його ще немає. */
  function planTouch(name) {
    const had = state.plan;
    const pl = FM.plan.current(W, state);
    const visited = pl ? FM.plan.visit(state, name) : false;
    if (visited || state.plan !== had) saveGame();
  }
  /** Підпис пункту меню (поки план не закритий). */
  function planNav() {
    const pl = state.plan && !state.plan.none && state.plan.year === state.season.year ? state.plan : null;
    if (!pl) return null;
    const pr = FM.plan.progress(W, state, pl);
    return pr.all ? null : [pl.first ? 'Перші кроки ' : 'Передсезоння ', el('span.count', { 'aria-label': `виконано ${pr.done} з ${pr.total}` }, `${pr.done}/${pr.total}`)];
  }
  function planCard() {
    const pl = FM.plan.current(W, state);
    if (!pl || pl.hidden) return null;
    const pr = FM.plan.progress(W, state, pl);
    if (pr.all) return null;
    return el('div.panel.plan-card', [
      el('div.plan-card-head', [el('h3', pl.first ? '📋 Перші кроки в клубі' : '📋 Передсезонна підготовка'), el('b', `${pr.done} з ${pr.total}`)]),
      el('div.plan-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(pr.total), 'aria-valuenow': String(pr.done) }, el('span', { style: { width: (pr.done / pr.total * 100) + '%' } })),
      pr.next ? el('p', [el('span.muted', 'Наступний крок: '), el('b', pr.next.title)]) : null,
      el('div.actions', [el('a.btn.primary', { href: '#plan' }, 'Відкрити план'), el('button.btn.link', { type: 'button', onclick: () => { pl.hidden = true; saveGame(); render(); } }, 'Сховати з пошти')]),
    ]);
  }
  let planMsg = null;
  function screenPlan() {
    const pl = FM.plan.current(W, state);
    if (!pl) return [el('header', el('h1', 'Перші кроки')), el('div.panel', el('p.muted', 'Плану на цей сезон немає: він з’являється на початку кар’єри, у новому клубі й перед кожним сезоном.'))];
    const S = state.season, me = W.club(state.clubId);
    const t = myTactics();
    const r = FM.plan.report(W, state.clubId, S.year, t.formation);
    const best = r.best;
    const st = FM.plan.steps(W, state, pl);
    const pr = FM.plan.progress(W, state, pl);
    const save = (msg) => { planMsg = msg || null; saveGame(); render(); };
    const link = (href, label) => el('a.btn', { href }, label);
    const playersList = (ids, extra) => el('ul.plist.plan-list', ids.map((id) => W.player(id)).filter((p) => p && p.club === state.clubId).map((p) => el('li', [
      el('span', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${W.age(p) ?? '—'} р.${extra ? ' · ' + extra(p) : ''}`)]), starsEl(p.ca, 'Рівень')])));

    const details = {
      board: () => [link('#board', 'До правління')],
      squad: () => [el('button.btn.primary', { type: 'button', onclick: () => { pl.done.squad = true; save(); } }, 'Прочитав звіт'), link('#squad', 'До складу')],
      tactics: () => {
        const cur = t.formation;
        return [el('p.small', best === cur ? `Асистент згоден зі схемою ${cur}: найкращі гравці грають на своїх позиціях.` : `Асистент радить ${best} замість ${cur}: так найкращі гравці стануть на свої позиції.`),
          best !== cur ? el('button.btn.primary', { type: 'button', onclick: () => {
            const avail = availablePlayers(state.clubId);
            Object.assign(t, { formation: best, ids: FM.pickLineup(avail, best).xi.map((x) => x.player.id), roles: {}, variants: {}, instr: {} });
            pl.done.tactics = true; save(`Схема ${best}: склад розставив асистент.`);
          } }, `Поставити ${best}`) : null, link('#tactics', 'До тактики')];
      },
      training: () => {
        const adv = FM.plan.trainingAdvice(W, state, familiarity()), tr = training();
        const lbl = FM.dev.PLANS[adv.plan].label;
        return [el('p.small', `Порада: «${lbl}» — ${adv.why}. Зараз: «${FM.dev.PLANS[tr.plan || 'balanced'].label}».`),
          tr.plan !== adv.plan ? el('button.btn.primary', { type: 'button', onclick: () => { tr.plan = adv.plan; pl.done.training = true; save(`Тренування: «${lbl}».`); } }, `Застосувати «${lbl}»`) : null, link('#training', 'До тренувань')];
      },
      scouts: () => {
        const idle = FM.market.scouts(state).filter((sc) => !sc.region);
        const lg = FM.plan.scoutLeague(W, state);
        return [el('p.small', idle.length ? `Без завдання: ${idle.length} ${idle.length === 1 ? 'скаут' : 'скаути'}. Асистент радить${lg ? ` розвідати ${W.league(lg).name} (схожа за силою)` : ''}${idle.length > 1 || !lg ? ' і шукати таланти в Південній Америці' : ''}.` : 'Усі скаути мають завдання.'),
          idle.length ? el('button.btn.primary', { type: 'button', onclick: () => {
            idle.forEach((sc, i) => { sc.region = i === 0 && lg ? lg : 'w-sa'; sc.prog = 0; });
            save('Скаути отримали завдання.');
          } }, 'Дати завдання за порадою') : null, link('#transfers', 'Скаутська мережа')];
      },
      needs: () => {
        if (!pl.needRoles.length) return [el('p.small', 'На всіх позиціях вистачає гравців потрібного рівня. Можна шукати підсилення, але це не обов’язково.')];
        const budget = FM.budget ? FM.budget.available(W, state) : Math.max(0, me.balance || 0);
        const cap = [60, 25, 10, 3, 1].find((v) => v <= budget * 0.6) || 1, poor = budget * 0.6 < 1;
        return [el('ul.plist.plan-list', pl.needRoles.map((role) => {
          const n = r.needs.find((x) => x.role === role);
          const ok = FM.plan.isDone(W, state, { ...pl, done: {}, needRoles: [role] }, 'needs');
          return el('li', [el('span', [ok ? '✓ ' : '', el('b', FM.ROLE_NAME[role]), el('small.muted', n ? ` · ${n.thin ? `є ${n.have} з потрібних ${n.need}` : ''}${n.thin && n.weak ? '; ' : ''}${n.weak ? 'основа слабша за решту команди' : ''}` : ' · закрито')]),
            el('button.btn', { type: 'button', onclick: () => { Object.assign(tf, { role, league: 'all', maxAge: 31, maxPrice: cap, sort: 'ca' }); go('transfers'); } }, 'Шукати')]);
        })), el('p.small.muted', `Пошук відкриється з фільтром за позицією й ціною до ${M(cap)} (трансферний бюджет ${M(budget)}).${poor ? ' Грошей мало — шукайте дешевих або беріть в оренду (кнопка в картці гравця).' : ''} Крок виконано, коли на кожну позицію є гравець у шортлисті або купівля.`)];
      },
      surplus: () => {
        const left = pl.surplusIds.map((id) => W.player(id)).filter((p) => p && p.club === state.clubId && !p.listed && !p.loan);
        if (!pl.surplusIds.length) return [el('p.small', 'Зайвих гравців немає.')];
        return [playersList(pl.surplusIds, (p) => (p.listed ? 'на продажі' : p.loan ? 'в оренді' : `${p.wage ?? '—'} тис. €/тиж.`)),
          left.length ? el('button.btn.primary', { type: 'button', onclick: () => {
            for (const p of left) p.listed = true;
            FM.market.news(state, `На трансфер виставлено: ${left.map(nameOf).join(', ')}.`, 'transfers');
            save(`На продаж виставлено ${left.length}.`);
          } }, `Виставити на продаж (${left.length})`) : null];
      },
      contracts: () => pl.expIds.length ? [playersList(pl.expIds, (p) => ((p.contract || 9999) > S.year + 1 ? 'продовжено' : `контракт до літа ${p.contract}`)), el('p.small.muted', 'Продовжити контракт — у картці гравця, розділ «Контракт».')] : [el('p.small', 'Контракти лідерів не спливають цього сезону.')],
      staff: () => [link('#office', 'До штабу')],
      friendly: () => [link('#match', 'Товариський матч')],
    };

    return [
      el('header', [el('h1', pl.first ? 'Перші кроки в клубі' : 'Передсезонна підготовка'), el('span.muted', `Виконано ${pr.done} з ${pr.total}${pr.closed > pr.done ? `, пропущено ${pr.closed - pr.done}` : ''}`)]),
      el('div.plan-bar.big', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(pr.total), 'aria-valuenow': String(pr.done) }, el('span', { style: { width: (pr.done / pr.total * 100) + '%' } })),
      planMsg ? el('p.msg-ok', planMsg) : null,
      pr.all ? el('div.panel', [el('h3', 'Готово!'), el('p', 'Клуб підготовлений. Тисніть «Продовжити» — і до першого матчу.')]) : null,
      el('ol.plan-steps', st.map((x, i) => el('li' + (x.done ? '.done' : x.skipped ? '.skipped' : ''), [
        el('span.plan-mark', { 'aria-hidden': 'true' }, x.done ? '✓' : x.skipped ? '–' : String(i + 1)),
        el('div.plan-body', [
          el('b', x.title), x.done ? el('span.chip', 'виконано') : x.skipped ? el('span.chip', 'пропущено') : null,
          el('p.muted.small', x.hint),
          x.done ? null : el('div.plan-act', [...(details[x.id] ? details[x.id]() : []).filter(Boolean),
            el('button.btn.link', { type: 'button', onclick: () => { pl.skip[x.id] = !pl.skip[x.id]; save(); } }, x.skipped ? 'Повернути' : 'Пропустити')]),
        ]),
      ]))),
      el('div.panel', [el('h3', 'Звіт асистента про склад'),
        el('dl.facts', [
          el('dt', 'Найкраща схема'), el('dd', best),
          el('dt', 'Рівень основи'), el('dd', starsEl(r.xiAvg, 'Рівень основи')),
          el('dt', 'Гравців'), el('dd', `${r.size}${r.size > 26 ? ' — забагато, зайві беруть зарплату' : r.size < 20 ? ' — замало на сезон' : ''}`),
        ]),
        r.needs.length ? el('ul.tips', r.needs.map((n) => el('li.tip-' + (n.sev >= 2 ? 'bad' : 'warn'),
          `${FM.ROLE_NAME[n.role]}: ${n.thin ? `лише ${n.have} (треба ${n.need})` : `є ${n.have}`}${n.weak ? '; гравці основи слабші за решту команди' : ''}.`))) : el('p.muted', 'Слабких позицій немає.'),
      ]),
      el('p.note', pl.first ? 'План з’являється на початку кар’єри й у новому клубі; щосезону — коротша передсезонна підготовка. Кроки позначаються самі, щойно ви їх зробите.' : 'Передсезонна підготовка з’являється щоліта. Кроки позначаються самі.'),
    ];
  }

  // ---------------- Центр повідомлень (крок 44) ----------------
  let inboxBase = null;
  let inboxCat = (() => { try { return localStorage.getItem('golovnyi-trener:inbox') || 'all'; } catch (_) { return 'all'; } })();
  function screenInbox() {
    const all = (state.news || []).slice().reverse();
    if (inboxBase == null) inboxBase = state.newsRead || 0; // що було новим, коли відкрили пошту
    const lastRead = inboxBase;
    const counts = {};
    for (const n of all) { const c = n.c || FM.market.newsCat(n.text); counts[c] = (counts[c] || 0) + 1; }
    const iq = (tblState.inbox = tblState.inbox || { q: '', unread: false, old: false });
    let list = all.filter((n) => inboxCat === 'all' || (n.c || FM.market.newsCat(n.text)) === inboxCat);
    if (iq.q) { const qq = iq.q.toLowerCase(); list = list.filter((n) => n.text.toLowerCase().includes(qq)); }
    if (iq.unread) list = list.filter((n) => n.id > lastRead);
    if (iq.old) list = list.slice().reverse();
    // прочитано — усе, що зараз показано (позначка оновиться після виходу з екрана)
    const maxId = all.reduce((m, n) => Math.max(m, n.id || 0), 0);
    if (maxId > lastRead) { state.newsRead = maxId; saveGame(); }
    let prevKey = null;
    const rows = [];
    for (const n of list) {
      const key = `${n.s}-${n.w}`;
      if (key !== prevKey) { rows.push(el('li.day', `${n.s}/${String(n.s + 1).slice(2)}, тиждень ${n.w + 1} · ${fmt.date(FM.season.dateOf(n.w, n.s === state.season.year ? state.season : { start: FM.season.firstSaturday(n.s) }))}`)); prevKey = key; }
      const np = n.pid && W.player(n.pid);
      rows.push(el('li' + (n.id > lastRead ? '.unread' : ''), [el('span.tag', FM.market.NEWS_CATS[n.c || FM.market.newsCat(n.text)]), ' ', n.text,
        np && np.club !== state.clubId && !np.retired ? el('span.news-acts', [el('button.btn', { type: 'button', onclick: () => go('player-' + np.id) }, 'Картка'), shortlistBtn(np)]) : null]));
    }
    return [
      el('header', [el('h1', 'Повідомлення'), el('span.muted', `Усього ${all.length}${maxId > lastRead ? ` · нових ${all.filter((n) => n.id > lastRead).length}` : ''}`)]),
      actionCards(),
      postPressCard(),
      expectCard(),
      backroomCard(),
      planCard(),
      missionsCard(),
      backupCard(),
      academyCard(),
      el('div.tabs', [['all', `Усі (${all.length})`], ...Object.entries(FM.market.NEWS_CATS).filter(([k]) => counts[k]).map(([k, l]) => [k, `${l} (${counts[k]})`])].map(([k, l]) =>
        el('button', { type: 'button', 'aria-pressed': String(inboxCat === k), onclick: () => { inboxCat = k; try { localStorage.setItem('golovnyi-trener:inbox', k); } catch (_) { /* приватне вікно */ } render(); } }, l))),
      el('div.dt-bar', [
        el('input.dt-q', { type: 'search', placeholder: 'Пошук у повідомленнях', 'aria-label': 'Пошук у повідомленнях', value: iq.q, onchange: (e) => { iq.q = e.target.value; saveTbl(); render(); } }),
        el('label.check', [el('input', { type: 'checkbox', checked: iq.unread || null, onchange: (e) => { iq.unread = e.target.checked; saveTbl(); render(); } }), ' Лише нові']),
        el('label.dt-sel', [el('span.muted', 'Порядок '), el('select', { onchange: (e) => { iq.old = e.target.value === 'old'; saveTbl(); render(); } }, [el('option', { value: 'new', selected: !iq.old || null }, 'спершу новіші'), el('option', { value: 'old', selected: iq.old || null }, 'спершу старіші')])]),
        iq.q || iq.unread || iq.old ? el('button.btn.link', { type: 'button', onclick: () => { Object.assign(iq, { q: '', unread: false, old: false }); saveTbl(); render(); } }, 'Скинути') : null,
      ]),
      el('div.panel', list.length ? el('ul.news.inbox', rows) : el('p.muted', iq.q || iq.unread ? 'Нічого не знайдено.' : 'Повідомлень немає.')),
      el('p.note', 'Зберігаються останні 200 повідомлень. Нові позначено кольором, доки ви не відкриєте цей екран.'),
    ];
  }

  /** Турнір збірних, який тренує людина: дограти автоматично й записати підсумок. */
  function finishTourney() {
    const st = state.intl, T = st && st.tourney;
    if (!T) return;
    FM.nations.playUntil(W, T, null);
    const sm = FM.nations.summary(T);
    st.tours = (st.tours || []).concat([{ name: sm.name, winner: sm.winner, ukr: sm.ukr }]);
    FM.market.news(state, `${sm.name}: переможець — ${FM.countries.name(sm.winner)}. Україна: ${sm.ukr}.`, 'intl');
    if (sm.winner === 'UKR') { state.ach = state.ach || {}; state.ach.euro_ukr = seasonLabel(); if (state.board) state.board.rep = Math.min(100, state.board.rep + 15); }
    st.lastTour = sm; delete st.tourney;
  }
  /** Зіграти наступний матч України на турнірі (live — з трансляцією). */
  function playTourMatch(live) {
    const st = state.intl, T = st.tourney;
    const nm = FM.nations.playUntil(W, T, 'UKR', { name: NAMES.player });
    if (!nm) { finishTourney(); saveGame(); return go('nations'); }
    const picks = st.picks && st.picks.length >= 16 ? st.picks : null;
    const A = FM.nations.side(W, nm.m.a, nm.m.a === 'UKR' ? picks : null), B = FM.nations.side(W, nm.m.b, nm.m.b === 'UKR' ? picks : null);
    const opts = { home: A, away: B, seed: `tour-${T.seed}-${T.year}-${nm.kind}-${nm.m.a}-${nm.m.b}`, neutral: true, name: NAMES.player, gen: genOf, big: true };
    const myK = nm.m.a === 'UKR' ? 0 : 1;
    const done = (r) => {
      FM.nations.recordTour(T, nm, r, FM.rng(`tourpens-${T.seed}-${T.year}`));
      const sc = myK === 0 ? r.score : [r.score[1], r.score[0]], d = sc[0] - sc[1];
      if (state.board) state.board.rep = Math.max(0, Math.min(100, state.board.rep + (d > 0 ? 2 : d < 0 ? -1 : 0)));
      FM.market.news(state, `${T.name}, ${nm.label}: Україна — ${FM.countries.name(myK === 0 ? nm.m.b : nm.m.a)} ${sc.join(':')}${nm.m.pens ? ' (пенальті)' : ''}.`, 'intl');
      if (T.winner || (T.stage.UKR && T.stage.UKR !== 'переможець')) finishTourney(); // турнір скінчився або Україна вибула — решту дограє помічник
      saveGame();
    };
    if (!live) { done(FM.match.play(opts)); return go('nations'); }
    opts[myK === 0 ? 'home' : 'away'].manual = true;
    showLive('nations', A, B, FM.match.create(opts), myK, done, [['До збірної', () => go('nations'), true]]);
  }
  function tourneyPanel() {
    const T = state.intl && state.intl.tourney;
    if (!T) return null;
    const gi = T.groups.findIndex((g) => g.includes('UKR'));
    const tab = gi >= 0 ? FM.nations.groupTable(T, gi) : [];
    const out = T.stage.UKR && T.stage.UKR !== 'переможець';
    return el('div.panel', [el('h3', T.name),
      tab.length ? el('table.mini', [el('thead', el('tr', ['Група ' + 'ABCDEFGH'[gi], 'І', 'РМ', 'О'].map((h, i) => el(i ? 'th.num' : 'th', h)))),
        el('tbody', tab.map((r) => el('tr' + (r.c === 'UKR' ? '.me' : ''), [el('td', FM.countries.name(r.c)), el('td.num', r.p), el('td.num', r.gd), el('td.num', r.pts)])))]) : null,
      T.ko.length ? el('p.muted', 'Плей-оф: ' + T.ko.map((round) => round.map((m) => `${FM.countries.name(m.a)} — ${FM.countries.name(m.b)}${m.s ? ' ' + m.s.join(':') + (m.pens ? ' (пен.)' : '') : ''}`).join('; ')).join(' → ')) : null,
      out ? el('p.msg-bad', `Україна вибула (${T.stage.UKR}).`) : el('div.actions', [
        el('button.btn.primary', { type: 'button', onclick: () => playTourMatch(true) }, 'Наступний матч України: з трансляцією'),
        el('button.btn', { type: 'button', onclick: () => playTourMatch(false) }, 'Одразу результат')]),
      out ? el('button.btn', { type: 'button', onclick: () => { finishTourney(); saveGame(); render(); } }, 'Дограти турнір') : null]);
  }
  /** Тренери збірних групи (суперників). */
  const coachesLine = (group) => el('p.muted', 'Тренери суперників: ' + group.filter((c) => c !== 'UKR').map((c) => { const k = FM.nations.coachOf(W, c); return `${FM.countries.name(c)} — ${k.name} (${k.label})`; }).join('; ') + '.');
  function nlPanel() {
    const NL = state.intl && state.intl.nl;
    if (!NL || NL.year !== state.season.year) return null;
    const tab = FM.nations.groupTableOf(NL, state.intl.played || [], 'nl');
    return el('div.panel', [el('h3', NL.name), el('table.mini', [el('thead', el('tr', ['Група', 'І', 'РМ', 'О'].map((h, i) => el(i ? 'th.num' : 'th', h)))),
      el('tbody', tab.map((r, i) => el('tr' + (r.c === 'UKR' ? '.me' : ''), [el('td', `${i + 1}. ${FM.countries.name(r.c)}`), el('td.num', r.p), el('td.num', r.gd), el('td.num', r.pts)])))]),
      el('small.muted', `Перше місце — підвищення${NL.tier === 'A' ? ' й фінал чотирьох улітку' : ''}, останнє — пониження. Матчі — у міжнародні вікна (6, 13 і 27-й тижні).`),
      coachesLine(NL.group)]);
  }
  function qualPanel() {
    const Q = state.intl && state.intl.qual;
    if (!Q || Q.year !== state.season.year + 1) return null;
    const tab = FM.nations.qualTable(state);
    return el('div.panel', [el('h3', Q.name), el('table.mini', [el('thead', el('tr', ['Група', 'І', 'РМ', 'О'].map((h, i) => el(i ? 'th.num' : 'th', h)))),
      el('tbody', tab.map((r, i) => el('tr' + (r.c === 'UKR' ? '.me' : ''), [el('td', `${i + 1}. ${FM.countries.name(r.c)}`), el('td.num', r.p), el('td.num', r.gd), el('td.num', r.pts)])))]),
      el('small.muted', 'Двоє перших виходять на турнір. Матчі — у міжнародні вікна (6, 13 і 27-й тижні).'), coachesLine(Q.group)]);
  }

  function screenNations() {
    const N = FM.nations, st = (state.intl = state.intl || {});
    const pool = N.pools(W).UKR || [];
    const coach = !!st.coach;
    const picks = new Set(coach && st.picks ? st.picks : N.squad(W, 'UKR').map((p) => p.id));
    const S = state.season;
    const next = N.windows(S).find((w) => w >= S.week);
    const played = (st.played || []).slice().reverse().slice(0, 10);
    const toggle = (id) => {
      const cur = new Set(st.picks && st.picks.length ? st.picks : N.squad(W, 'UKR').map((p) => p.id));
      if (cur.has(id)) cur.delete(id); else if (cur.size < 26) cur.add(id);
      st.picks = [...cur]; saveGame(); render();
    };
    return [
      el('header', [el('h1', 'Збірна України'), el('span.muted', `Рівень ${Math.round(N.strength(W, 'UKR'))} · ${next ? `наступне вікно — ${next}-й тиждень` : 'цього сезону вікон більше немає'}`)]),
      tourneyPanel(), qualPanel(), nlPanel(),
      el('p.muted', st.coach ? 'Головний тренер — ви.' : (() => { const c = FM.nations.coachOf(W, 'UKR'); return `Головний тренер: ${c.name} (${c.label}).`; })()),
      st.lastTour && !st.tourney ? el('p.muted', `Останній турнір: ${st.lastTour.name}, переможець — ${FM.countries.name(st.lastTour.winner)}; Україна — ${st.lastTour.ukr}.`) : null,
      el('div.panel', [
        el('p', coach ? 'Ви тренуєте збірну паралельно з клубом: склад обираєте самі (16–26 гравців), результати впливають на вашу репутацію.'
          : 'Збірну тренує федерація; виклик ваших гравців означає втому й ризик травм після міжнародних вікон.'),
        coach ? el('button.btn', { type: 'button', onclick: () => { st.coach = false; delete st.picks; saveGame(); render(); } }, 'Залишити посаду')
          : N.canCoach(state) ? el('button.btn.primary', { type: 'button', onclick: () => { st.coach = true; st.picks = N.squad(W, 'UKR').map((p) => p.id); FM.market.news(state, 'Ви очолили збірну України паралельно з клубом.'); saveGame(); render(); } }, 'Очолити збірну')
          : el('small.muted', 'Федерація запросить вас, коли репутація тренера сягне 55 (зараз ' + Math.round(state.board ? state.board.rep : 0) + ').'),
      ]),
      el('div.grid', [
        el('div.panel', [el('h3', coach ? `Кандидати (обрано ${picks.size})` : 'Склад на найближчі матчі'), dataTable(coach ? 'nat-pool' : 'nat-squad', {
          rows: coach ? pool : pool.filter((p) => picks.has(p.id)), flat: true, search: (p) => nameOf(p), sort: { k: 'ca', dir: -1 }, limit: 50,
          filters: [LINE_TABS, coach ? { k: 'picked', label: 'Лише обрані', type: 'check', test: (p) => picks.has(p.id) } : null, AGE_SEL].filter(Boolean),
          cols: [
            coach ? { k: 'pick', label: '✓', v: (p) => (picks.has(p.id) ? 1 : 0), cell: (p) => el('input', { type: 'checkbox', checked: picks.has(p.id) || null, 'aria-label': 'У складі', onchange: () => toggle(p.id) }) } : null,
            { k: 'name', label: 'Гравець', v: nameOf, cell: (p) => [el('a', { href: '#player-' + p.id }, nameOf(p)), p.injury ? el('span.chip.bad', ' травма') : ''], asc: true },
            { k: 'pos', label: 'Поз.', v: (p) => FM.ROLE_ORDER.indexOf(p.roles[0]), cell: (p) => FM.positions(p), asc: true },
            { k: 'age', label: 'Вік', v: (p) => W.age(p), num: true, asc: true },
            { k: 'club', label: 'Клуб', v: (p) => (p.club ? clubName(W.club(p.club)) : 'поза грою'), asc: true },
            { k: 'ca', label: 'Рівень', v: (p) => p.ca, num: true },
            { k: 'caps', label: 'Матчі', full: 'Матчі за збірну', v: (p) => p.caps || 0, num: true },
          ].filter(Boolean),
        })]),
        el('div.panel', [el('h3', 'Останні матчі'), played.length ? el('ul.plist', played.map((x) => el('li', [el('span', `${x.s}/${String(x.s + 1).slice(2)} · ${x.home ? 'вдома' : 'виїзд'} — ${FM.countries.name(x.opp)}`), el('b', x.score.join(':'))])))
          : el('p.muted', 'Ще не грали.'),
        el('h3', 'Турніри'), (st.tours || []).length ? el('ul.plist', st.tours.slice().reverse().map((t) => el('li', [el('span', `${t.name}: переможець — ${FM.countries.name(t.winner)}`), t.ukr && t.ukr !== '—' ? el('small.muted', 'Україна: ' + t.ukr) : null])))
          : el('p.muted', 'Найближчий — Чемпіонат Європи 2028 (після сезону 2027/28).')]),
      ]),
    ];
  }

  function screenHistory() {
    const H = state.history || [];
    return [
      el('header', [el('h1', 'Історія'), el('span.muted', `${state.manager} · сезонів: ${H.length}`)]),
      H.length ? el('div.table-wrap', el('table', [
        el('thead', el('tr', [el('th', 'Сезон'), el('th', 'Клуб'), el('th.num', 'Місце'), el('th.num', 'Очки'), el('th', 'Трофеї'), el('th', 'Бомбардир'), el('th', 'Ліга чемпіонів'), el('th', 'Ліга Європи'), el('th', 'Ліга конференцій'), ...W.db.leagues.filter((l) => l.tier !== 2).map((l) => el('th', 'Чемпіон: ' + l.name))])),
        el('tbody', [...H].reverse().map((h) => el('tr', [
          el('td', `${h.year}/${String(h.year + 1).slice(2)}`), el('td', clubName(W.club(h.club))), el('td.num', h.pos), el('td.num', h.pts),
          el('td', (h.trophies || []).length ? h.trophies.map((x) => (x === 'league' ? 'Чемпіонат' : FM.cups.NAMES[x])).join(', ') : '—'),
          el('td', h.scorer && W.player(h.scorer[0]) ? `${nameOf(W.player(h.scorer[0]))} (${h.scorer[1]})` : '—'),
          el('td', h.cups && h.cups.ucl ? clubName(W.club(h.cups.ucl)) : '—'), el('td', h.cups && h.cups.uel ? clubName(W.club(h.cups.uel)) : '—'), el('td', h.cups && h.cups.uecl ? clubName(W.club(h.cups.uecl)) : '—'),
          ...W.db.leagues.filter((l) => l.tier !== 2).map((l) => el('td', h.champions[l.id] ? clubName(W.club(h.champions[l.id])) : '—')),
        ]))),
      ])) : el('p.muted', 'Історія з’явиться після першого сезону.'),
    ];
  }

  /** Розклад тижня: неділя — вихідний, пн–пт — заняття, дні матчів — позначені. */
  function schedulePanel() {
    const S = state.season, tr = training(), key = `${S.year}-${S.week}`;
    const days = weekSchedule(), agg = FM.routine.aggregate(days), ev = myEvents();
    const setDay = (d, v) => { tr.sched = tr.sched && tr.sched.key === key ? tr.sched : { key, days: {} }; tr.sched.days[d] = v; saveGame(); render(); };
    const cell = (d) => {
      const date = fmt.date(FM.season.dayDate(S, S.week, d)).slice(0, 5);
      const e = ev.find((x) => x.day === d);
      const head = el('div.sd-head', [el('b', FM.routine.DAY_UK[d]), el('small.muted', date)]);
      if (d === 0) return el('div.sd.rest', [head, el('span', 'Вихідний')]);
      if (days[d] === 'match' || (d === 6 && weekMatchDays().includes(6))) return el('div.sd.match', [head, el('b', 'Матч'), e ? el('small', clubName(W.club(e.opp))) : null]);
      if (d === 6) return el('div.sd.rest', [head, el('span', 'Вихідний')]);
      const cur = FM.routine.SESSIONS[days[d]];
      return el('div.sd', [head, el('select.tiny', { 'aria-label': `Заняття: ${FM.routine.DAY_UK[d]}`, onchange: (x) => setDay(d, x.target.value) },
        Object.entries(FM.routine.SESSIONS).map(([k, v]) => el('option', { value: k, selected: days[d] === k || null }, v.label))), el('small.muted', cur ? cur.hint : '')]);
    };
    const own = tr.sched && tr.sched.key === key && Object.keys(tr.sched.days).length;
    const bar = (label, v, max, bad) => el('div.crow.single', [el('div', [el('small', label), el('div.cbar', el('span.ch' + (bad ? '.bad' : ''), { style: { width: Math.min(100, (v / max) * 100) + '%' } }))]), el('b', String(v).replace('.', ','))]);
    return el('div.panel', [el('h3', `Розклад тижня · ${fmt.date(FM.season.dayDate(S, S.week, 1)).slice(0, 5)}–${fmt.date(FM.season.dayDate(S, S.week, 6)).slice(0, 5)}`),
      el('div.schedule', [0, 1, 2, 3, 4, 5, 6].map(cell)),
      el('div.compare.sched-sum', [bar('Відновлення свіжості', agg.recovery, 40), bar('Розвиток', agg.growth, 1.6), bar('Засвоєння схеми', agg.fam, 4), bar('Ризик травм', agg.injury, 1.6, agg.injury > 1.1)]),
      el('p.note', [own ? 'Ви змінили розклад цього тижня. ' : FM.routine.delegated(state, 'training') ? 'Розклад склав асистент під матчі тижня. ' : 'Розклад — за вашим шаблоном (нижче), з урахуванням матчів. ',
        'Напередодні матчу «Підготовка» додає +1% до гри; після матчу — «Відновлення». ', own ? el('button.btn.link', { type: 'button', onclick: () => { tr.sched = null; saveGame(); render(); } }, 'Скинути правки') : null]),
    ]);
  }

  // ---------------- Нагороди, рекорди, Зала слави ----------------
  const seasonOf = (y) => `${y}/${String(y + 1).slice(2)}`;
  /** Нагороди гравця в картці. */
  function awardsLine(p) {
    const x = ((state.aw || {}).pa || {})[p.id];
    if (!x) return null;
    const parts = [x.mvp.length ? `найкращий гравець сезону (${x.mvp.map(seasonOf).join(', ')})` : '', x.boot.length ? `найкращий бомбардир (${x.boot.map(seasonOf).join(', ')})` : '',
      x.young.length ? `найкращий молодий (${x.young.map(seasonOf).join(', ')})` : '', x.tos.length ? `символічна збірна сезону ×${x.tos.length}` : '',
      x.potm ? `гравець місяця ×${x.potm}` : '', x.totw ? `команда туру ×${x.totw}` : ''].filter(Boolean);
    const hof = ((state.aw || {}).hof || []).find((h) => h.pid === p.id);
    if (!parts.length && !hof) return null;
    return el('div.panel.awards-line', [el('h3', '🏅 Нагороди'), hof ? el('p', el('b', `Зала слави ${clubName(W.club(hof.club))}: ${hof.why}`)) : null, parts.length ? el('p', parts.join(' · ')) : null]);
  }
  let awTab = 'awards';
  function screenAwards() {
    const a = FM.awards.aw(state), me = state.clubId, S = state.season;
    const pl = (id) => (W.player(id) ? el('a', { href: '#player-' + id }, nameOf(W.player(id))) : '—');
    const clubOf = (id) => (W.player(id) && W.player(id).club ? clubName(W.club(W.player(id).club)) : '');
    const tabs = el('div.tabs', [['awards', 'Нагороди'], ['cabinet', 'Шафа трофеїв'], ['records', 'Рекорди клубу'], ['hof', 'Зала слави'], ['best', 'Найкращі за весь час']].map(([k, l]) =>
      el('button', { type: 'button', 'aria-pressed': String(awTab === k), onclick: () => { awTab = k; render(); } }, l)));
    let body;
    if (awTab === 'awards') {
      const tw = a.totw;
      const month = a.list.slice().reverse().filter((x) => x.t === 'potm' || x.t === 'cotm').slice(0, 16);
      const seasons = Object.entries(a.seasons).sort((x, y) => y[0] - x[0]);
      body = [
        el('div.panel', [el('h3', tw ? `Команда туру · ${fmt.date(FM.season.dateOf(tw.w, S.year === tw.s ? S : { start: FM.cal.seasonStart(tw.s) })).slice(0, 5)}` : 'Команда туру'),
          tw ? el('ol.plist.totw', tw.ids.map((id, i) => el('li' + (W.player(id) && W.player(id).club === me ? '.mine' : ''), [el('span', [el('small.muted', FM.positions(W.player(id) || { roles: ['CM'] }) + ' '), pl(id), el('small.muted', ' ' + clubOf(id))]), el('b', String(tw.r[i]).replace('.', ','))]))) : el('p.muted', 'З’явиться після першого туру вашої ліги.')]),
        el('div.panel', [el('h3', 'Нагороди місяця'), month.length ? el('ul.plist', month.map((x) => el('li' + (x.me || (x.club === me) ? '.mine' : ''), [
          el('span', [el('b', `${FM.awards.MONTH_NOM[Number(x.m.slice(5, 7)) - 1]} ${x.m.slice(0, 4)}: `), x.t === 'potm' ? ['гравець місяця — ', pl(x.pid), el('small.muted', ` (${clubOf(x.pid)})`)] : `тренер місяця — ${clubName(W.club(x.club))}`]),
          el('small.muted', x.txt)]))) : el('p.muted', 'Перші нагороди — наприкінці першого місяця сезону.')]),
        el('div.panel', [el('h3', 'Нагороди сезону'), seasons.length ? el('ul.plist', seasons.map(([y, r]) => el('li', [el('span', [el('b', seasonOf(Number(y)) + ' · '), W.league(r.league).name, ': чемпіон — ', clubName(W.club(r.champion)),
          r.mvp ? ['; найкращий — ', pl(r.mvp)] : '', r.boot ? ['; бомбардир — ', pl(r.boot[0]), ` (${r.boot[1]})`] : '', r.young ? ['; молодий — ', pl(r.young)] : ''])]))) : el('p.muted', 'Нагороди сезону вручають після останнього туру.')]),
      ];
    } else if (awTab === 'cabinet') {
      const T = (state.trophies || []).slice().reverse();
      const ICON = { league: '🏆', cup: '🥇', euro: '⭐', super: '🛡️' };
      const count = (k) => T.filter((x) => x.kind === k).length;
      body = [el('div.panel', [el('h3', `Шафа трофеїв · ${state.manager}`),
        el('div.cabinet-sum', [['league', 'Чемпіонства'], ['cup', 'Кубки'], ['euro', 'Єврокубки'], ['super', 'Суперкубки']].map(([k, l]) => el('div.cab-tile', [el('span.cab-icon', ICON[k]), el('b', String(count(k))), el('small.muted', l)]))),
        T.length ? el('ul.plist.cabinet', T.map((x) => el('li', [el('span', [el('span.cab-icon', ICON[x.kind]), ' ', el('b', x.name), el('small.muted', ` · ${seasonOf(x.s)} · ${clubName(W.club(x.club))}`)]),
          x.final ? el('small', `фінал: ${x.final.score.join(':')} з ${x.final.opp}${x.final.pens ? ' (пен.)' : ''}`) : el('small.muted', 'за підсумками сезону')]))) : el('p.muted', 'Поки порожньо. Перший трофей — найсолодший!')])];
    } else if (awTab === 'records') {
      const R = a.rec[me] || {};
      const row = (k, label) => el('li', [el('span', label), el('b', R[k] ? `${FM.awards.fmtRec(k, R[k])}${R[k].s ? ` · ${seasonOf(R[k].s)}` : ''}` : '—')]);
      body = [el('div.panel', [el('h3', `Рекорди ${clubName(W.club(me))} (з початку вашої роботи)`), el('ul.plist', [
        row('bigWin', 'Найбільша перемога'), row('bigLoss', 'Найбільша поразка'), row('goals', 'Найрезультативніший матч'),
        row('winRun', 'Перемог поспіль'), row('unbeaten', 'Матчів без поразок'), row('scorer', 'Бомбардир сезону'), row('attendance', 'Відвідуваність'),
      ]), R.cur ? el('p.muted', `Зараз: ${R.cur.win} ${FM.plural(R.cur.win, 'перемога', 'перемоги', 'перемог')} поспіль, ${R.cur.unb} ${FM.plural(R.cur.unb, 'матч', 'матчі', 'матчів')} без поразок.`) : null])];
    } else if (awTab === 'hof') {
      const list = a.hof.filter((h) => h.club === me);
      body = [el('div.panel', [el('h3', `Зала слави ${clubName(W.club(me))}`), list.length ? el('ul.plist', list.map((h) => el('li', [el('span', [W.player(h.pid) ? pl(h.pid) : h.name, el('small.muted', ` · ${seasonOf(h.y)}`)]), el('span', h.why)])))
        : el('p.muted', 'Порожньо. Сюди потрапляють гравці вашого клубу: 150 матчів, 60 голів, найкращий гравець сезону або 2 трофеї за 5 сезонів.')])];
    } else {
      body = [el('div.panel', [el('h3', `Найкращі гравці ${clubName(W.club(me))} за вашої роботи`), dataTable('alltime', {
        rows: FM.awards.allTime(W, state), flat: true, rowClick: (x) => go('player-' + x.id), sort: { k: 'apps', dir: -1 }, search: (x) => nameOf(x.p),
        cols: [
          { k: 'name', label: 'Гравець', v: (x) => nameOf(x.p), asc: true, cls: () => 'name' },
          { k: 'now', label: 'Зараз', v: (x) => (x.p.club === me ? 'у клубі' : x.p.retired ? 'завершив' : x.p.club ? clubName(W.club(x.p.club)) : 'вільний'), asc: true },
          { k: 'apps', label: 'Матчі', v: (x) => x.apps, num: true }, { k: 'goals', label: 'Голи', v: (x) => x.goals, num: true },
          { k: 'ast', label: 'Пас.', full: 'Гольові передачі', v: (x) => x.ast, num: true }, { k: 'seasons', label: 'Сезони', v: (x) => x.seasons, num: true },
        ],
      })])];
    }
    return [el('header', [el('h1', 'Нагороди й рекорди'), el('span.muted', `Тренер місяця: ${a.cotm || 0} раз${(a.cotm || 0) === 1 ? '' : (a.cotm || 0) >= 2 && (a.cotm || 0) <= 4 ? 'и' : 'ів'}`)]), tabs, ...body];
  }

  // ---------------- Планувальник складу на 3 сезони ----------------
  /** Очікуваний рівень через k сезонів: молодь росте до потенціалу, ветерани згасають. */
  function projectCa(p, k) {
    let ca = p.ca, age = W.age(p) ?? 25;
    for (let i = 0; i < k; i++, age++) {
      const g = age <= 20 ? 8 : age <= 23 ? 5 : age <= 27 ? 2 : age <= 30 ? 0 : age <= 32 ? -3 : -6;
      ca = Math.min(p.pa, ca + g);
    }
    return Math.max(1, Math.round(ca));
  }
  function screenPlanner() {
    const S = state.season, sq = W.squad(state.clubId).filter((p) => !(p.loan && p.loan.to === state.clubId));
    const NEED = { gk: 2, def: 6, mid: 6, att: 4 }, LBL = { gk: 'Воротарі', def: 'Захист', mid: 'Півзахист', att: 'Атака' };
    const line = (p) => (p.roles[0] === 'GK' ? 'gk' : FM.ROLE_LINE[p.roles[0]]);
    const col = (k) => {
      const y = S.year + k;
      const here = sq.filter((p) => (p.contract || 9999) >= y + 1 && !((W.age(p) ?? 25) + k >= 36));
      return el('div.panel.plan-col', [el('h3', `Сезон ${y}/${String(y + 1).slice(2)}`),
        ...Object.keys(NEED).map((ln) => {
          const list = here.filter((p) => line(p) === ln).sort((a, b) => projectCa(b, k) - projectCa(a, k));
          const hole = NEED[ln] - list.length;
          return el('div.plan-line', [el('div.plan-line-head', [el('b', LBL[ln]), hole > 0 ? el('span.chip.bad', `дірка: ще ${hole}`) : el('small.muted', `${list.length}`)]),
            el('ul.plain', list.map((p) => {
              const age = (W.age(p) ?? 25) + k, last = (p.contract || 9999) === y + 1, old = age >= 33;
              return el('li', [el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${age} р.`), ' ', starsEl(projectCa(p, k), 'Очікуваний рівень'),
                last ? el('span.chip.warn', 'останній рік контракту') : null, old ? el('span.chip', 'може завершити') : null, k && p.pa - p.ca >= 20 && age <= 23 ? el('span.chip.ok', 'росте') : null]);
            }))]);
        })]);
    };
    return [el('header', [el('h1', 'План складу'), el('span.muted', 'Хто лишиться, у кого спливає контракт, де будуть дірки')]),
      el('div.planner', [0, 1, 2].map(col)),
      el('p.note', 'Рівень наступних сезонів — прогноз: молодь росте до потенціалу, після 30 гравці згасають. Гравці з контрактом, що закінчується, у наступному сезоні не показані — продовжте контракт у їхній картці. Після 36 років гравця не враховано.')];
  }

  // ---------------- Медичний центр ----------------
  function screenMedical() {
    const S = state.season, sq = W.squad(state.clubId);
    const plan = curPlan(), rest = FM.medical.rested(state);
    const side = mySide(), starters = new Set(side.lineup.xi.map((x) => x.player.id));
    const ctx = { k: FM.cal.weekK(S), planInjury: plan.injury, injuryMult: 1.2 - FM.club.lvl(state, 'fitness') * 0.02, matches: Math.max(1, weekMatchDays().length), rested: rest, starter: starters };
    const rows = sq.map((p) => ({ p, rk: FM.medical.risk(W, p, ctx) })).sort((a, b) => b.rk.r - a.rk.r);
    const hurt = rows.filter((x) => x.rk.level === 'out');
    const pct = (r) => (r >= 1 ? '—' : `${(r * 100).toFixed(1).replace('.', ',')}%`);
    const back = (p) => fmt.date(FM.season.dayDate(S, Math.min(FM.season.weeks(S) - 1, S.week + p.injury), 1)).slice(0, 5);
    return [
      el('header', [el('h1', 'Медичний центр'), el('span.muted', `Фізіо: рівень ${FM.club.lvl(state, 'physio')} · фітнес-тренер: рівень ${FM.club.lvl(state, 'fitness')}`)]),
      el('div.grid', [
        el('div.panel', [el('h3', `Травмовані: ${hurt.length}`), hurt.length ? el('ul.plist', hurt.map(({ p }) => el('li', [el('a', { href: '#player-' + p.id }, nameOf(p)),
          el('span.muted', `${p.injury} тиж. · орієнтовно до ${back(p)}`)]))) : el('p.muted', 'Травмованих немає.')]),
        el('div.panel', [el('h3', 'Цей тиждень'), el('dl.facts', [
          el('dt', 'Матчів'), el('dd', String(weekMatchDays().length)),
          el('dt', 'Навантаження тренувань'), el('dd', plan.injury > 1.1 ? 'високе' : plan.injury < 0.9 ? 'легке' : 'звичайне'),
          el('dt', 'Високий ризик'), el('dd', String(rows.filter((x) => x.rk.level === 'high').length)),
          el('dt', 'Відпочивають'), el('dd', String(rest.size)),
        ]), el('p.note', ['Ризик залежить від схильності до травм, втоми, віку, кількості матчів і ', el('a', { href: '#training' }, 'розкладу тренувань'), '. Хороший фізіо й фітнес-тренер знижують його.'])]),
      ]),
      el('div.panel', [el('h3', 'Ризик травми на тиждень'), dataTable('medical', {
        rows: rows.filter((x) => x.rk.level !== 'out'), flat: true, search: (x) => nameOf(x.p), sort: { k: 'risk', dir: -1 },
        filters: [LINE_TABS, { k: 'lvl', label: 'Ризик', type: 'select', options: [['all', 'будь-який'], ['high', 'високий'], ['mid', 'помірний'], ['low', 'низький']], test: (x, v) => x.rk.level === v },
          { k: 'rest', label: 'Відпочивають', type: 'check', test: (x) => rest.has(x.p.id) }],
        cols: [
          { k: 'name', label: 'Гравець', v: (x) => nameOf(x.p), cell: (x) => el('a', { href: '#player-' + x.p.id }, nameOf(x.p)), asc: true, cls: () => 'name' },
          { k: 'pos', label: 'Поз.', v: (x) => FM.ROLE_ORDER.indexOf(x.p.roles[0]), cell: (x) => FM.roleLabel(x.p.roles[0], x.p.side), asc: true, cls: (x) => 'pos.line-' + FM.ROLE_LINE[x.p.roles[0]] },
          { k: 'age', label: 'Вік', v: (x) => W.age(x.p), num: true, asc: true, hide: true },
          { k: 'fit', label: 'Свіжість', v: (x) => Math.round(x.p.fitness ?? 100), cell: (x) => `${Math.round(x.p.fitness ?? 100)}%`, num: true, asc: true },
          { k: 'risk', label: 'Ризик', v: (x) => x.rk.r, cell: (x) => el('b', pct(x.rk.r)), num: true },
          { k: 'lvl', label: 'Рівень', v: (x) => x.rk.r, cell: (x) => el('span.chip.' + (x.rk.level === 'high' ? 'bad' : x.rk.level === 'mid' ? 'warn' : 'info'), FM.medical.LEVEL_UK[x.rk.level]) },
          { k: 'why', label: 'Чинники', cell: (x) => [x.rk.why.join(', ') || '—', FM.medical.advice(x.p, x.rk) ? el('div', el('b', FM.medical.advice(x.p, x.rk))) : null] },
          { k: 'act', label: '', cell: (x) => el('button.btn' + (rest.has(x.p.id) ? '.primary' : ''), { type: 'button', 'aria-pressed': String(rest.has(x.p.id)), onclick: () => { FM.medical.rest(state, x.p.id); saveGame(); render(); } }, rest.has(x.p.id) ? 'Відпочиває' : 'Відпочинок') },
        ],
      })]),
      el('p.note', 'Відпочинок — на цей тиждень: гравець не грає за основу, тренується легко (ризик травми втричі менший) і наприкінці тижня повністю свіжий.'),
    ];
  }

  /** Наставництво: досвідчений гравець бере молодого (до 21) — той росте швидше й переймає характер. */
  function mentorPanel() {
    const pairs = FM.routine.pairs(W, state), sq = W.squad(state.clubId);
    const young = sq.filter((p) => FM.routine.canLearn(W, p) && !state.mentor[p.id]);
    const mentors = sq.filter((p) => FM.routine.canMentor(W, p));
    const sug = FM.routine.suggest(W, state);
    let msg = null;
    const ys = el('select', { id: 'mt-y', 'aria-label': 'Учень' }, young.map((p) => el('option', { value: p.id }, `${nameOf(p)} (${W.age(p)})`)));
    const ms = el('select', { id: 'mt-m', 'aria-label': 'Наставник' }, mentors.map((p) => el('option', { value: p.id }, `${nameOf(p)} (${W.age(p)})`)));
    const trait = (p) => { const h = p.h || {}; return `проф. ${Math.round(h.pro || 11)}, стаб. ${Math.round(h.con || 11)}, лідер. ${p.attrs.lea || 10}`; };
    return el('div.panel', [el('h3', 'Наставництво'),
      el('p.muted', `Наставник (від 26 років, професіонал або лідер) бере до ${FM.routine.MAX_PER_MENTOR} учнів до 21 року. Учень росте на 8% швидше й поступово переймає професіоналізм, стабільність і характер у великих матчах.`),
      pairs.length ? el('ul.plist', pairs.map(({ young: y, mentor: o }) => el('li', [
        el('span', [el('a', { href: '#player-' + y.id }, nameOf(y)), ' ← ', el('a', { href: '#player-' + o.id }, nameOf(o)), el('small.muted', ` · наставник: ${trait(o)}`)]),
        el('button.btn.link', { type: 'button', onclick: () => { delete state.mentor[y.id]; saveGame(); render(); } }, 'Завершити')]))) : el('p.muted', 'Пар ще немає.'),
      young.length && mentors.length ? el('div.pre-row', [el('div.field', [el('label', { for: 'mt-y' }, 'Учень'), ys]), el('div.field', [el('label', { for: 'mt-m' }, 'Наставник'), ms]),
        el('button.btn', { type: 'button', onclick: () => { const r = FM.routine.assign(W, state, ys.value, ms.value); if (!r.ok) alert(r.reason); saveGame(); render(); } }, 'Призначити')]) : null,
      sug.length ? el('div.actions', [el('button.btn', { type: 'button', onclick: () => { for (const x of sug) FM.routine.assign(W, state, x.young.id, x.mentor.id); saveGame(); render(); } }, `Пари за порадою асистента (${sug.length})`)]) : null,
    ]);
  }

  function screenTraining() {
    const t = training();
    const save = () => { saveGame(); render(); };
    const sq = W.squad(state.clubId);
    const seg = (obj, key, defs) => el('div.tabs', Object.entries(defs).map(([k, d]) => el('button', { type: 'button', 'aria-pressed': String(t[key] === k), onclick: () => { t[key] = k; save(); } }, d.label)));
    const attrOptions = (p) => [['', 'Як у всієї команди'], ...FM.ATTR_GROUPS[p.roles[0] === 'GK' ? 'gk' : 'outfield'].flatMap(([, ks]) => ks.map((k) => [k, FM.ATTRS[k]]))];
    return [
      el('header', [el('h1', 'Тренування'), el('span.muted', 'Розклад на кожен день тижня; діє на всіх гравців клубу')]),
      schedulePanel(),
      el('div.panel', [el('div.instr', [
        el('div.field', [el('b', 'Шаблон тижня'), seg(t, 'plan', FM.dev.PLANS), el('small.muted', FM.routine.delegated(state, 'training') ? 'Розклад складає асистент — шаблон не діє. Змінити — у «Клуб» → «Доручення асистентові».' : FM.dev.PLANS[t.plan || 'balanced'].hint)]),
        el('div.field', [el('b', 'Наголос'), seg(t, 'focus', FM.dev.FOCUS), el('small.muted', 'Які атрибути ростуть першими.')]),
        el('div.field', [el('b', 'Інтенсивність'), seg(t, 'intensity', FM.dev.INTENSITY), el('small.muted', 'Інтенсивне — швидший ріст, але більше травм; легке — навпаки.')]),
      ])]),
      mentorPanel(),
      el('div.panel', [el('h3', 'Гравці'), dataTable('training', {
        rows: sq, flat: true, search: (p) => nameOf(p), sort: { k: 'pos', dir: 1 },
        filters: [LINE_TABS, AGE_SEL, { k: 'ind', label: 'З індивідуальним тренуванням', type: 'check', test: (p) => !!t.individual[p.id] }],
        cols: [
          { k: 'name', label: 'Гравець', v: nameOf, cell: (p) => el('a', { href: '#player-' + p.id }, nameOf(p)), asc: true, cls: () => 'name' },
          { k: 'pos', label: 'Поз.', v: (p) => FM.ROLE_ORDER.indexOf(p.roles[0]), cell: (p) => FM.roleLabel(p.roles[0], p.side), asc: true, cls: (p) => 'pos.line-' + FM.ROLE_LINE[p.roles[0]] },
          { k: 'age', label: 'Вік', v: (p) => W.age(p), num: true, asc: true },
          { k: 'ca', label: 'Рівень', v: (p) => p.ca, cell: (p) => starsEl(p.ca, 'Рівень') },
          { k: 'pa', label: 'Потенціал', v: (p) => p.pa, cell: (p) => starsEl(p.pa, 'Потенціал') },
          { k: 'room', label: 'Запас росту', full: 'Запас росту (потенціал − рівень)', v: (p) => p.pa - p.ca, num: true, hide: true },
          { k: 'delta', label: 'За сезон', v: (p) => p.ca - (p.ca0 ?? W.base(p.id)?.ca ?? p.ca), cell: (p) => { const d = p.ca - (p.ca0 ?? W.base(p.id)?.ca ?? p.ca); return el('b' + (d > 0 ? '.up' : d < 0 ? '.down' : ''), d > 0 ? '+' + d : String(d)); }, num: true },
          { k: 'fit', label: 'Свіж.', full: 'Свіжість', v: (p) => Math.round(p.fitness ?? 100), num: true },
          { k: 'ind', label: 'Індивідуально', cell: (p) => el('select.tiny', { 'aria-label': 'Індивідуальне тренування ' + nameOf(p), onclick: (e) => e.stopPropagation(), onchange: (e) => { if (e.target.value) t.individual[p.id] = e.target.value; else delete t.individual[p.id]; saveGame(); } },
            attrOptions(p).map(([k, n]) => el('option', { value: k, selected: (t.individual[p.id] || '') === k || null }, n))) },
          { k: 'state', label: 'Стан', v: (p) => (p.injury ? 0 : banned(p.id) ? 1 : 2), cell: (p) => (p.injury ? el('span.chip.bad', `травма, ${p.injury} тиж.`) : banned(p.id) ? el('span.chip.bad', 'дискв.') : (p.fitness ?? 100) < 85 ? el('span.chip', `свіжість ${Math.round(p.fitness)}%`) : 'готовий'), asc: true },
        ],
      })]),
    ];
  }

  function fixtureRow(f, clubId, opts = {}) {
    const home = W.club(f.h), away = W.club(f.a);
    const r = clubId ? RESULT(f, clubId) : null;
    // у календарі власного клубу підсвічувати нічого — там усі матчі «наші»
    return el('tr' + (!clubId && (f.h === state.clubId || f.a === state.clubId) ? '.mine' : ''), [
      opts.round ? el('td.num', roundOf(f)) : null,
      opts.date ? el('td', fmt.date(FM.season.fixtureDate(state.season, f)).slice(0, 5)) : null,
      el('td.num.team-h', [clubName(home), ' ', badge(home)]),
      el('td.score', f.s ? f.s.join(' : ') : '–'),
      el('td.team-a', [badge(away), ' ', clubName(away)]),
      clubId ? el('td', r ? el('span.fr.fr-' + r, RESULT_UK[r]) : '') : null,
    ]);
  }

  function screenSeason() {
    const S = state.season, c = W.club(state.clubId);
    const total = FM.season.weeks(S);
    const over = FM.season.isOver(S);
    const thisWeek = over ? null : myFixture();
    const mine = FM.season.clubFixtures(S, c.id);
    const last = [...mine].reverse().find((f) => f.s);
    const { pos, size } = myPosition();
    const blocks = [el('header', [el('h1', `Сезон ${seasonLabel()}`), el('span.muted', over ? 'Сезон завершено' : `Тиждень ${S.week + 1} з ${total} · ${fmt.date(FM.season.dateOf(S.week, state.season))}`)])];

    blocks.push(quickPanel());
    if (over) {
      blocks.push(el('div.panel', [el('h3', 'Підсумки сезону'),
        el('p', `${clubName(c)} — ${pos}-е місце з ${size}.`),
        el('ul.plist', W.db.leagues.map((l) => {
          const champ = W.club(FM.season.table(S, W, l.id)[0].id);
          return el('li', [el('span', l.name), el('b', ['Чемпіон: ', clubName(champ)])]);
        })),
        el('div.actions', [el('button.btn.primary', { type: 'button', onclick: startNextSeason }, `Почати сезон ${S.year + 1}/${String(S.year + 2).slice(2)}`)]),
        el('p.note', 'Наприкінці сезону ветерани завершують кар\u2019єру, а з академій приходять юнаки. Гравці стануть на рік старшими.')]));
    } else if (thisWeek) {
      const opp = W.club(thisWeek.h === c.id ? thisWeek.a : thisWeek.h);
      const t = FM.season.table(S, W, c.league);
      const oppPos = t.findIndex((r) => r.id === opp.id) + 1;
      const out = W.club(c.id).players.filter((id) => banned(id) || W.player(id).injury > 0).map((id) => nameOf(W.player(id)) + (W.player(id).injury ? ` (травма, ${W.player(id).injury} тиж.)` : ' (дискв.)'));
      blocks.push(el('div.panel.next', [
        el('h3', `${roundOf(thisWeek)}-й тур · ${DAY_UK[thisWeek.mid ? 2 : 6]}, ${fmt.date(FM.season.fixtureDate(S, thisWeek))}${thisWeek.mid ? ' · посеред тижня' : ''}`),
        el('div.vs', [
          el('div.vs-team', [badge(W.club(thisWeek.h), true), el('b', clubName(W.club(thisWeek.h))), el('small.muted', 'господарі')]),
          el('div.vs-mid', 'проти'),
          el('div.vs-team', [badge(W.club(thisWeek.a), true), el('b', clubName(W.club(thisWeek.a))), el('small.muted', 'гості')]),
        ]),
        FM.rivals.derby(W, state.clubId, opp.id) ? el('p.msg-bad', `🔥 ${FM.rivals.derby(W, state.clubId, opp.id)}! Ставки вищі: більше карток, результат удвічі сильніше вплине на вболівальників, правління й команду.`) : null,
        el('p.muted', `Суперник: ${clubName(opp)}, ${oppPos ? oppPos + '-е місце' : ''}${t[oppPos - 1] && t[oppPos - 1].p ? `, ${t[oppPos - 1].pts} ${FM.plural(t[oppPos - 1].pts, 'очко', 'очки', 'очок')}` : ''}.` + (out.length ? ` Не зіграють: ${out.join(', ')}.` : '')),
        cupNote(),
        opponentReport(opp.id, thisWeek.h === opp.id),
        feudPanel(opp.id),
        matchTacticPanel(),
        tipsPanel(6),
        pressPanel(opp.id),
        el('div.actions', [
          el('button.btn.primary', { type: 'button', onclick: () => playMyMatch(true) }, 'Грати з трансляцією'),
          el('button.btn', { type: 'button', onclick: () => playMyMatch(false) }, 'Одразу результат'),
          el('button.btn', { type: 'button', title: 'Тижні граються самі; зупинка, коли потрібне ваше рішення', onclick: () => quickRun() }, '⏩ Швидкий режим'),
          el('a.btn', { href: '#holiday' }, '🏖 Відпустка'),
        ]),
        el('p.note', ['Решта матчів туру в усіх лігах зіграються одночасно. Склад, схема й інструкції — з ', el('a', { href: '#tactics' }, 'тактики'), '; у трансляції можна робити заміни й міняти підхід.']),
      ]));
    } else {
      const fr = weekFriendly(), note = weekNote();
      blocks.push(el('div.panel', [el('h3', fr ? 'Передсезонний товариський матч' : note || 'Цього тижня ваша ліга не грає'),
        fr ? el('div.vs', [
          el('div.vs-team', [badge(W.club(fr.home ? c.id : fr.opp), true), el('b', clubName(W.club(fr.home ? c.id : fr.opp))), el('small.muted', 'господарі')]),
          el('div.vs-mid', 'проти'),
          el('div.vs-team', [badge(W.club(fr.home ? fr.opp : c.id), true), el('b', clubName(W.club(fr.home ? fr.opp : c.id))), el('small.muted', 'гості')]),
        ]) : null,
        el('p', fr ? `${DAY_UK[6]}, ${fmt.date(FM.season.dayDate(S, S.week, 6))}. Товариські не впливають на таблицю, але команда засвоює схему. ${note || ''}`
          : note ? (FM.cal.weekKind(S, c.league, S.week) === 'intl' ? 'Ліги стоять: гравці роз’їхалися по збірних. Час для тренувань.' : 'Матчів ліги цього тижня немає.')
            : 'Чемпіонат вашої ліги вже завершився, а інші ліги ще грають.'),
        cupNote(),
        FM.cups.pendingTie(state, state.clubId) ? [matchTacticPanel(), tipsPanel(6)] : null,
        el('div.actions', fr ? [
          el('button.btn.primary', { type: 'button', onclick: () => playPreFriendly(true) }, 'Грати з трансляцією'),
          el('button.btn', { type: 'button', onclick: () => playPreFriendly(false) }, 'Одразу результат'),
        ] : [el('button.btn.primary', { type: 'button', onclick: () => playMyMatch(false) }, 'Наступний тиждень')])]));
    }

    if (last) {
      const lastRound = S.fixtures.filter((f) => f.l === c.league && f.r === last.r);
      blocks.push(el('div.panel', [el('h3', `Результати ${roundOf(last)}-го туру`),
        el('div.table-wrap.flat', el('table.fixtures', el('tbody', lastRound.map((f) => fixtureRow(f, null)))))]));
    }
    blocks.push(el('div.panel', [el('h3', 'Календар клубу'), el('div.table-wrap.flat', el('table.fixtures', [
      el('thead', el('tr', [el('th.num', 'Тур'), el('th', 'Дата'), el('th.num', 'Господарі'), el('th', 'Рахунок'), el('th', 'Гості'), el('th', '')])),
      el('tbody', mine.map((f) => fixtureRow(f, c.id, { round: true, date: true }))),
    ]))]));
    return blocks;
  }

  let tableLeague = null, tableRound = null;
  function screenTable() {
    const S = state.season;
    tableLeague = tableLeague || W.club(state.clubId).league;
    const L = W.league(tableLeague);
    // вигляд (як у FM): загальна, вдома, на виїзді, останні 5 матчів; сортування — клік по заголовку
    const stView = tblState.standView || 'all', stSort = tblState.stand || { k: 'pts', dir: -1 };
    const STK = { І: 'p', В: 'w', Н: 'd', П: 'l', М: 'gf', Р: 'gd', О: 'pts' };
    let t = FM.season.table(S, W, tableLeague);
    if (stView !== 'all') {
      const rows = new Map(t.map((r) => [r.id, { id: r.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
      const played = S.fixtures.filter((f) => f.l === L.id && f.s).sort((a, b) => a.r - b.r);
      const add = (id, gf, ga) => { const x = rows.get(id); x.p++; x.gf += gf; x.ga += ga; const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D'; x[res === 'W' ? 'w' : res === 'L' ? 'l' : 'd']++; x.pts += res === 'W' ? 3 : res === 'D' ? 1 : 0; x.form.push(res); };
      if (stView === 'form') {
        for (const id of rows.keys()) for (const f of played.filter((x) => x.h === id || x.a === id).slice(-5)) f.h === id ? add(id, f.s[0], f.s[1]) : add(id, f.s[1], f.s[0]);
      } else for (const f of played) { if (stView === 'home') add(f.h, f.s[0], f.s[1]); else add(f.a, f.s[1], f.s[0]); }
      t = [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    }
    const plain = stView === 'all' && stSort.k === 'pts' && stSort.dir === -1; // зони єврокубків і вильоту — лише в звичайній таблиці
    if (!plain) t = [...t].sort((a, b) => (a[stSort.k] - b[stSort.k]) * stSort.dir || b.pts - a.pts || b.gd - a.gd);
    const rounds = 2 * (L.size - 1);
    const played = Math.max(0, ...S.fixtures.filter((f) => f.l === L.id && f.s).map((f) => f.r + 1));
    if (tableRound == null || tableRound > rounds) tableRound = Math.max(1, played);
    const ZONE_UK = { ucl: 'Ліга чемпіонів', uel: 'Ліга Європи', uecl: 'Ліга конференцій', playoff: 'Стикові матчі', rel: 'Виліт' };
    const leaderList = (key, title) => {
      const list = FM.season.leaders(S, W, L.id, key, 10);
      return el('div.panel', [el('h3', title), list.length ? el('ol.plist.leaders', list.map((x) => el('li', [
        el('span', [el('a', { href: '#player-' + x.id }, nameOf(x.p)), el('small.muted', ' ' + clubName(W.club(x.p.club)))]), el('b', x.st[key])]))) : el('p.muted', 'Ще немає.')]);
    };
    const roundFx = S.fixtures.filter((f) => f.l === L.id && f.r === tableRound - 1);
    return [
      el('header', [el('h1', 'Таблиця'), el('span.muted', `${L.name} · зіграно турів: ${played} з ${rounds}`)]),
      el('div.tabs', W.db.leagues.map((l) => el('button', { type: 'button', 'aria-pressed': String(l.id === tableLeague), onclick: () => { tableLeague = l.id; tableRound = null; render(); } }, l.name))),
      el('div.tabs', { role: 'group', 'aria-label': 'Вигляд таблиці' }, [['all', 'Загальна'], ['home', 'Вдома'], ['away', 'На виїзді'], ['form', 'Останні 5']].map(([k, l]) =>
        el('button', { type: 'button', 'aria-pressed': String(stView === k), onclick: () => { tblState.standView = k; saveTbl(); render(); } }, l))),
      el('div.table-wrap', el('table.standings', [
        el('thead', el('tr', ['#', 'Клуб', 'І', 'В', 'Н', 'П', 'М', 'Р', 'О', 'Форма'].map((h, i) => el('th' + (i >= 2 && i <= 8 ? '.num' : ''), { ...(STK[h] ? { 'data-sort': STK[h], 'aria-sort': stSort.k === STK[h] ? (stSort.dir > 0 ? 'ascending' : 'descending') : null, onclick: () => { tblState.stand = { k: STK[h], dir: stSort.k === STK[h] ? -stSort.dir : (STK[h] === 'l' || STK[h] === 'ga' ? 1 : -1) }; saveTbl(); render(); } } : {}), title: { І: 'Ігри', В: 'Виграші', Н: 'Нічиї', П: 'Поразки', М: 'М’ячі', Р: 'Різниця', О: 'Очки' }[h] || null }, h)))),
        el('tbody', t.map((r, i) => {
          const z = plain ? FM.season.zone(L.id, i + 1, t.length) : null;
          const c = W.club(r.id);
          return el('tr.row-link' + (z ? '.z-' + z : '') + (r.id === state.clubId ? '.mine' : ''), { title: z ? ZONE_UK[z] : null, onclick: () => go(r.id === state.clubId ? 'squad' : 'club-' + r.id) }, [
            el('td.num.zone', i + 1),
            el('td.name', el('span.club-cell', [badge(c), clubName(c)])),
            el('td.num', r.p), el('td.num', r.w), el('td.num', r.d), el('td.num', r.l),
            el('td.num', `${r.gf}:${r.ga}`), el('td.num', (r.gd > 0 ? '+' : '') + r.gd), el('td.num', el('b', r.pts)),
            el('td', formEl(r.form)),
          ]);
        })),
      ])),
      el('div.legend', Object.entries(ZONE_UK).filter(([z]) => z !== 'playoff' || ['ger', 'fra', 'ukr'].includes(L.id)).map(([z, label]) => el('span', [el('i.z-' + z), label]))),
      el('div.grid', [leaderList(1, 'Бомбардири'), leaderList(2, 'Асистенти')]),
      el('div.panel', [
        el('div.round-nav', [
          el('button.btn', { type: 'button', disabled: tableRound <= 1 || null, onclick: () => { tableRound--; render(); }, 'aria-label': 'Попередній тур' }, '←'),
          el('h3', `${tableRound}-й тур${roundFx[0] ? ' · ' + fmt.date(FM.season.fixtureDate(S, roundFx[0])) : ''}`),
          el('button.btn', { type: 'button', disabled: tableRound >= rounds || null, onclick: () => { tableRound++; render(); }, 'aria-label': 'Наступний тур' }, '→'),
        ]),
        el('div.table-wrap.flat', el('table.fixtures', el('tbody', roundFx.map((f) => fixtureRow(f, null))))),
      ]),
    ];
  }

  // ---------------- Редактор ----------------
  const ROLES = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
  let editDraft = null;

  function numInput(id, value, min, max, onInput) {
    return el('input', { id, type: 'number', inputmode: 'numeric', min, max, step: 1, value, oninput: (e) => onInput(Number(e.target.value)) });
  }
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

  function screenEditPlayer(id) {
    const p = W.player(id);
    if (!p) return [el('p', 'Гравця не знайдено.')];
    if (!editDraft || editDraft.id !== id) {
      editDraft = { id, name: p.name, nameEn: p.nameEn, number: p.number ?? '', born: p.born || '', nat: p.nat, height: p.height || '',
        roles: p.roles.slice(), side: p.side || '', attrs: { ...p.attrs }, pa: p.pa };
    }
    const d = editDraft;
    const isGK = d.roles[0] === 'GK';
    const keys = FM.ATTR_GROUPS[isGK ? 'gk' : 'outfield'];
    const preview = el('div.edit-preview');
    const age = () => (d.born ? W.age({ born: d.born }) : W.age(p)) ?? 24;
    const ca = () => FM.caFromAttrs({ roles: d.roles, attrs: d.attrs });
    const drawPreview = () => {
      const c = ca(), pa = Math.max(c, clampInt(d.pa, 1, 200));
      preview.replaceChildren(el('dl.facts', [
        el('dt', 'Рівень'), el('dd', [starsEl(c, 'Рівень'), ` ${c}`]),
        el('dt', 'Потенціал'), el('dd', [starsEl(pa, 'Потенціал'), ` ${pa}`]),
        el('dt', 'Ціна'), el('dd', fmt.money(FM.marketValue(c, age(), W.club(p.club || state.clubId).league, pa))),
      ]));
    };
    // GK має інший набір атрибутів: при зміні позиції на/з воротаря доповнюємо відсутні
    const ensureAttrs = () => {
      for (const [, ks] of FM.ATTR_GROUPS[d.roles[0] === 'GK' ? 'gk' : 'outfield']) for (const k of ks) if (d.attrs[k] == null) d.attrs[k] = 8;
    };
    const save = () => {
      ensureAttrs();
      // поле, яке людина змінила, — вже не згенероване
      const gen0 = p.gen || [];
      const gen = gen0.filter((k) => !((k === 'born' && d.born && d.born !== p.born) || (k === 'height' && d.height !== '' && Number(d.height) !== p.height) || (k === 'nat' && d.nat !== p.nat)));
      const keep = new Set(FM.ATTR_GROUPS[d.roles[0] === 'GK' ? 'gk' : 'outfield'].flatMap(([, ks]) => ks));
      const attrs = {};
      for (const k of keep) attrs[k] = clampInt(d.attrs[k], 1, 20);
      Object.assign(p, {
        name: d.name.trim() || p.name, nameEn: d.nameEn.trim() || p.nameEn, number: d.number === '' ? null : clampInt(d.number, 1, 99),
        born: d.born || p.born, nat: d.nat, height: d.height === '' ? null : clampInt(d.height, 150, 210),
        roles: [...new Set(d.roles)], side: d.side || null, attrs, edited: true, gen: gen.length ? gen : undefined,
      });
      p.ca = FM.caFromAttrs(p);
      p.pa = Math.max(p.ca, clampInt(d.pa, 1, 200));
      p.value = FM.marketValue(p.ca, W.age(p) ?? 24, W.club(p.club || state.clubId).league, p.pa);
      editDraft = null; saveGame(); go('player-' + id);
    };
    const resetReal = () => { W.resetPlayer(id); delete p.edited; editDraft = null; saveGame(); go('player-' + id); };

    const text = (label, key, attrs = {}) => {
      const inp = el('input', { id: 'f-' + key, type: 'text', value: d[key] ?? '', ...attrs, oninput: (e) => { d[key] = e.target.value; } });
      return el('div.field', [el('label', { for: 'f-' + key }, label), inp]);
    };
    const roleSel = el('select', { id: 'f-role', onchange: (e) => { d.roles = [e.target.value, ...d.roles.filter((r) => r !== e.target.value)]; ensureAttrs(); render(); } },
      ROLES.map((r) => el('option', { value: r, selected: r === d.roles[0] || null }, FM.ROLE_NAME[r])));
    const extra = el('div.checks', ROLES.filter((r) => r !== d.roles[0]).map((r) => el('label.check', [
      el('input', { type: 'checkbox', checked: d.roles.includes(r) || null, onchange: (e) => { d.roles = e.target.checked ? [...d.roles, r] : d.roles.filter((x) => x !== r); drawPreview(); } }),
      ' ' + FM.roleLabel(r)])));
    const natSel = el('select', { id: 'f-nat', onchange: (e) => { d.nat = e.target.value; } },
      [...FM.countries.all(), ...(FM.countries.name(d.nat) === d.nat ? [[d.nat, d.nat]] : [])].map(([code, n]) => el('option', { value: code, selected: code === d.nat || null }, n)));
    const sideSel = el('select', { id: 'f-side', onchange: (e) => { d.side = e.target.value; } },
      [['', 'Обидві'], ['L', 'Ліва'], ['R', 'Права']].map(([v, n]) => el('option', { value: v, selected: v === (d.side || '') || null }, n)));
    drawPreview();

    return [
      el('header', [el('h1', 'Редагування гравця'), el('span.muted', nameOf(p))]),
      el('div.edit-grid', [
        el('div.panel', [el('h3', 'Особисте'), el('div.form', [
          text('Ім’я українською', 'name'), text('Ім’я в оригіналі', 'nameEn'),
          el('div.field', [el('label', { for: 'f-number' }, 'Номер'), numInput('f-number', d.number, 1, 99, (v) => { d.number = v; })]),
          el('div.field', [el('label', { for: 'f-born' }, 'Дата народження'), el('input', { id: 'f-born', type: 'date', value: d.born, oninput: (e) => { d.born = e.target.value; drawPreview(); } })]),
          el('div.field', [el('label', { for: 'f-nat' }, 'Країна'), natSel]),
          el('div.field', [el('label', { for: 'f-height' }, 'Зріст, см'), numInput('f-height', d.height, 150, 210, (v) => { d.height = v; })]),
          el('div.field', [el('label', { for: 'f-role' }, 'Основна позиція'), roleSel]),
          el('div.field', [el('label', { for: 'f-side' }, 'Сторона'), sideSel]),
          el('div.field.wide', [el('span', 'Може грати також'), extra]),
        ])]),
        el('div.panel', [el('h3', 'Оцінка'), preview,
          el('div.field', [el('label', { for: 'f-pa' }, 'Потенціал (1–200)'), numInput('f-pa', d.pa, 1, 200, (v) => { d.pa = v; drawPreview(); })]),
          el('p.note', 'Рівень рахується з атрибутів на основній позиції. Потенціал не може бути нижчим за рівень.')]),
      ]),
      el('div.panel', [el('div.attrs', keys.map(([title, ks]) => el('div', [
        el('h3', title),
        el('ul.attr-edit', ks.map((k) => el('li', [el('label', { for: 'a-' + k }, FM.ATTRS[k]),
          numInput('a-' + k, d.attrs[k] ?? 8, 1, 20, (v) => { d.attrs[k] = v; drawPreview(); })]))),
      ])))]),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', onclick: save }, 'Зберегти'),
        el('button.btn', { type: 'button', onclick: () => { editDraft = null; go('player-' + id); } }, 'Скасувати'),
        W.base(id) ? el('button.btn', { type: 'button', onclick: resetReal }, 'Повернути реальні дані') : null,
      ]),
      el('p.note', 'Зміни діють лише в цій кар’єрі. Ім’я, вік і позиції можна виправити, якщо в Wikipedia були неточності.'),
    ];
  }

  function screenEditClub(id) {
    const c = W.club(id);
    if (!c) return [el('p', 'Клуб не знайдено.')];
    const d = { name: c.name, nameEn: c.nameEn, code: c.code, stadium: c.stadium || '', capacity: c.capacity || '', founded: c.founded || '', c1: c.colors[0] || '#cccccc', c2: c.colors[1] || '#333333' };
    const field = (label, key, type = 'text', extra = {}) => el('div.field', [el('label', { for: 'c-' + key }, label),
      el('input', { id: 'c-' + key, type, value: d[key], ...extra, oninput: (e) => { d[key] = e.target.value; if (key === 'c1' || key === 'c2' || key === 'code') drawBadge(); } })]);
    const badgeBox = el('div');
    const drawBadge = () => badgeBox.replaceChildren(badge({ ...c, code: d.code.toUpperCase().slice(0, 4), colors: [d.c1, d.c2] }, true));
    drawBadge();
    const save = () => {
      Object.assign(c, {
        name: d.name.trim() || c.name, nameEn: d.nameEn.trim() || c.nameEn, code: (d.code.trim() || c.code).toUpperCase().slice(0, 4),
        stadium: d.stadium.trim() || null, capacity: d.capacity === '' ? null : clampInt(d.capacity, 100, 150000),
        founded: d.founded === '' ? null : clampInt(d.founded, 1850, 2026), colors: [d.c1, d.c2], edited: true,
      });
      saveGame(); go(id === state.clubId ? 'overview' : 'club-' + id);
    };
    return [
      el('header', [el('h1', 'Редагування клубу'), badgeBox]),
      el('div.panel', el('div.form', [
        field('Назва українською', 'name'), field('Назва в оригіналі', 'nameEn'), field('Код (до 4 літер)', 'code', 'text', { maxlength: 4 }),
        field('Стадіон', 'stadium'), field('Місткість', 'capacity', 'number', { min: 100, max: 150000 }), field('Рік заснування', 'founded', 'number', { min: 1850, max: 2026 }),
        field('Колір 1', 'c1', 'color'), field('Колір 2', 'c2', 'color'),
      ])),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', onclick: save }, 'Зберегти'),
        el('button.btn', { type: 'button', onclick: () => go(id === state.clubId ? 'overview' : 'club-' + id) }, 'Скасувати'),
        el('button.btn', { type: 'button', onclick: () => { W.resetClub(id, ['name', 'nameEn', 'code', 'stadium', 'capacity', 'founded', 'colors']); delete c.edited; saveGame(); render(); } }, 'Повернути реальні дані'),
      ]),
    ];
  }

  // ---------------- Збереження у файл ----------------
  let ioMsg = null;
  async function exportSave() {
    saveGame();
    return FM.saveio.encode({ app: 'golovnyi-trener', v: 1, saved: new Date().toISOString(), state });
  }
  async function importSave(text) {
    try {
      const data = await FM.saveio.decode(text);
      const st = upgradeIds(data && data.app === 'golovnyi-trener' ? data.state : null);
      if (!st || !st.clubId || !st.season) throw new Error('У файлі немає кар’єри цієї гри.');
      const w = FM.createWorld(window.FM_DB, st.world);
      if (!w.club(st.clubId)) throw new Error('Клуб із цього збереження не знайдено в базі.');
      state = st; W = w; pre = null; tableLeague = null; browseLeague = null;
      FM.market.init(W, state); FM.club.init(W, state); FM.career.init(W, state);
      saveGame();
      ioMsg = ['ok', `Завантажено: ${state.manager}, ${clubName(W.club(state.clubId))}, сезон ${seasonLabel()}.`];
    } catch (e) {
      ioMsg = ['bad', 'Не вдалося завантажити: ' + e.message];
    }
    render();
  }

  /** Чому зараз не можна купувати (ФФП або виклик «Лише свої»), або null. */
  function buyBlocked() {
    if (FM.finance.embargoed(state)) return 'Заборона трансферів (фінансовий фейр-плей): у це вікно купувати гравців не можна.';
    if (FM.challenges.noBuy(state)) return 'Виклик «Лише свої»: купувати й брати в оренду гравців не можна.';
    return null;
  }

  // ---------------- Синхронізація через GitHub Gist (розширення 16) ----------------
  let syncMsg = null, syncBusy = false;
  function syncPanel() {
    const has = !!FM.sync.token();
    const tokenIn = el('input', { id: 'gist-token', type: 'password', autocomplete: 'off', placeholder: has ? 'Токен збережено в цьому браузері' : 'ghp_… або github_pat_…' });
    const run = async (fn) => { syncBusy = true; syncMsg = ['ok', 'Зачекайте…']; render(); try { syncMsg = ['ok', await fn()]; } catch (e) { syncMsg = ['bad', e.message || String(e)]; } syncBusy = false; render(); };
    return el('div.panel', [el('h3', 'Синхронізація між пристроями'),
      el('p.muted', 'Кар’єра зберігається в приватному GitHub Gist вашого акаунта: збережіть на одному пристрої — завантажте на іншому. Потрібен токен GitHub лише з правом «gist» (Settings → Developer settings → Personal access tokens). Токен зберігається тільки в цьому браузері. Працює на сайті гри (GitHub Pages); у вбудованому перегляді мережа може бути закрита.'),
      el('div.field', [el('label', { for: 'gist-token' }, 'Токен GitHub'), el('div.row', [tokenIn,
        el('button.btn', { type: 'button', onclick: () => { FM.sync.setToken(tokenIn.value); syncMsg = ['ok', tokenIn.value.trim() ? 'Токен збережено.' : 'Токен видалено.']; render(); } }, 'Зберегти токен'),
        has ? el('button.btn', { type: 'button', onclick: () => { FM.sync.setToken(null); syncMsg = ['ok', 'Токен видалено з цього браузера.']; render(); } }, 'Забути') : null])]),
      el('div.actions', [
        el('button.btn.primary', { type: 'button', disabled: !has || syncBusy || null, onclick: () => run(async () => {
          const code = await exportSave();
          await FM.sync.upload(code, `${state.manager}, ${clubName(W.club(state.clubId))}, сезон ${seasonLabel()}, тиждень ${state.season.week + 1}`);
          return `Збережено в хмару: ${clubName(W.club(state.clubId))}, тиждень ${state.season.week + 1}.`;
        }) }, 'Зберегти в хмару'),
        el('button.btn', { type: 'button', disabled: !has || syncBusy || null, onclick: () => run(async () => {
          const { code, updated } = await FM.sync.download();
          await importSave(code);
          return `Завантажено з хмари (збережено ${new Date(updated).toLocaleString('uk-UA')}).`;
        }) }, 'Завантажити з хмари'),
      ]),
      syncMsg ? el('p.note.msg-' + syncMsg[0], syncMsg[1]) : null]);
  }

  function savePanel() {
    const codeBox = el('textarea', { id: 'save-code', rows: 3, placeholder: 'Вставте сюди код збереження', spellcheck: 'false' });
    const fileInput = el('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (f) importSave(await f.text());
    } });
    const status = el('p.note', ioMsg ? { class: 'note msg-' + ioMsg[0] } : {}, ioMsg ? ioMsg[1] : 'Гра зберігається в цьому браузері автоматично. Щоб перенести кар’єру на інший пристрій, збережіть її у файл або скопіюйте код.');
    ioMsg = null;
    return el('div.panel', [el('h3', 'Збереження'), status,
      el('div.actions', [
        canShareFiles() ? el('button.btn.primary', { type: 'button', onclick: () => shareSave() }, 'Поділитися (Telegram, Диск…)') : null,
        el('button.btn', { type: 'button', onclick: () => downloadSave() }, 'Зберегти у файл'),
        el('button.btn', { type: 'button', onclick: async () => {
          const code = await exportSave();
          try { await navigator.clipboard.writeText(code); ioMsg = ['ok', `Код скопійовано (${Math.round(code.length / 1024)} КБ). Вставте його на іншому пристрої.`]; render(); }
          catch (_) { codeBox.value = code; codeBox.select(); status.textContent = 'Скопіюйте код із поля нижче (Ctrl+C).'; }
        } }, 'Скопіювати код'),
        el('button.btn', { type: 'button', onclick: () => fileInput.click() }, 'Завантажити з файлу'),
      ]),
      fileInput,
      el('div.field', { style: { marginTop: '0.75rem' } }, [el('label', { for: 'save-code' }, 'Код збереження'), codeBox]),
      el('div.actions', [el('button.btn', { type: 'button', onclick: () => { if (codeBox.value.trim()) importSave(codeBox.value); } }, 'Завантажити з коду')]),
      el('p.note', 'Завантаження замінить поточну кар’єру в цьому браузері.'),
    ]);
  }

  // ---------------- Резервні копії: поділитися файлом, нагадування ----------------
  const saveName = () => `golovnyi-trener-${state.season.year}-tyzhden-${state.season.week + 1}.txt`;
  const markBackup = () => { state.lastBackup = { s: state.season.year, w: state.season.week, at: Date.now() }; saveGame(); };
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })); } catch (_) { return false; }
  }
  async function downloadSave() {
    const code = await exportSave();
    const a = el('a', { href: URL.createObjectURL(new Blob([code], { type: 'text/plain' })), download: saveName() });
    document.body.append(a); a.click(); a.remove();
    markBackup();
  }
  /** Поділитися файлом збереження через меню телефона (Telegram, Google Диск, пошта…). */
  async function shareSave() {
    const code = await exportSave();
    try {
      await navigator.share({ files: [new File([code], saveName(), { type: 'text/plain' })], title: 'Головний тренер — збереження', text: `${state.manager}, ${clubName(W.club(state.clubId))}, сезон ${seasonLabel()}` });
      markBackup(); ioMsg = ['ok', 'Збереження надіслано. Відновити: «Завантажити з файлу».']; render();
    } catch (e) { if (e && e.name !== 'AbortError') downloadSave(); }
  }
  /** Скільки ігрових тижнів минуло від останньої резервної копії (null — ще не було). */
  function weeksSinceBackup() {
    const b = state.lastBackup, S = state.season;
    if (!b) return null;
    return (S.year - b.s) * 48 + S.week - b.w;
  }
  /** Картка «День академії»: нове покоління вихованців, зірка випуску. */
  /** Місії тижня (js/missions.js): 1–2 цілі на матчі ліги з нагородами. */
  function missionsCard() {
    const M = FM.missions.current(W, state);
    if (!M.list.length) return null;
    const ico = { open: '◻', done: '✅', failed: '✖' };
    return el('div.panel.missions', [el('h3', ['🎯 Місії тижня', el('small.muted', ` · виконано за кар’єру: ${state.missionsDone || 0}`)]),
      el('ul.plain', M.list.map((m) => el('li.m-' + m.state, [ico[m.state] + ' ', el('b', m.text), el('span.muted', ` — нагорода: ${m.reward}`)])))]);
  }
  function academyCard() {
    const A = state.academy;
    if (!A || !A.open || A.y !== state.season.year) return null;
    const kids = A.ids.map((id) => W.player(id)).filter((p) => p && p.club === state.clubId);
    if (!kids.length) return null;
    const golden = kids.filter((p) => p.pa >= 150).length >= 2;
    return el('div.panel.academy-card', [el('div.plan-card-head', [el('h3', '🎓 День академії'), golden ? el('span.chip.ok', 'золоте покоління!') : null]),
      el('ul.plist', kids.sort((a, b) => b.pa - a.pa).map((p) => el('li' + (p.id === A.star ? '.mine' : ''), [
        el('span', [p.id === A.star ? '⭐ ' : '', el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${W.age(p)} р.`)]),
        el('span', [starsEl(p.pa, 'Потенціал'), ' ', (state.u21 || []).includes(p.id) ? el('button.btn.tiny-btn', { type: 'button', onclick: () => { FM.youth.promote(state, p.id); saveGame(); render(); } }, 'До основи') : el('small.muted', 'в основі')])]))),
      el('div.actions', [el('a.btn', { href: '#u21' }, 'Молодіжна команда'), el('button.btn.link', { type: 'button', onclick: () => { A.open = false; saveGame(); render(); } }, 'Зрозуміло')])]);
  }

  /** Картка в пошті: пора зробити резервну копію (кожні 8 ігрових тижнів). */
  function backupCard() {
    const S = state.season, ws = weeksSinceBackup(), key = S.year * 100 + S.week;
    if (state.backupLater && key < state.backupLater) return null;
    const started = (state.started && S.week >= 4) || S.year > Number(String(state.started || '2026').slice(0, 4));
    if (ws == null ? !started : ws < 8) return null;
    return el('div.panel.backup-card', [el('div.plan-card-head', [el('h3', '💾 Резервна копія'), el('small.muted', ws == null ? 'ще не було' : `остання — ${ws} тиж. тому`)]),
      el('p.small', 'Гра зберігається в браузері сама, але якщо очистити дані браузера чи змінити телефон — кар’єра зникне. Збережіть копію в Telegram чи на Диск.'),
      el('div.actions', [canShareFiles() ? el('button.btn.primary', { type: 'button', onclick: () => shareSave() }, 'Поділитися') : null,
        el('button.btn', { type: 'button', onclick: () => downloadSave().then(() => render()) }, 'Зберегти у файл'),
        el('button.btn.link', { type: 'button', onclick: () => { state.backupLater = key + 8; saveGame(); render(); } }, 'Пізніше')])]);
  }

  // ---------------- Телефон: вібрація на голах, екран не гасне під час трансляції ----------------
  const PHONE_KEY = 'golovnyi-trener:phone';
  const phone = (() => { try { return { vibe: true, wake: true, ...JSON.parse(localStorage.getItem(PHONE_KEY) || '{}') }; } catch (_) { return { vibe: true, wake: true }; } })();
  const savePhone = () => { try { localStorage.setItem(PHONE_KEY, JSON.stringify(phone)); } catch (_) { /* приватне вікно */ } };
  const vibe = (pattern) => { try { if (phone.vibe && navigator.vibrate) navigator.vibrate(pattern); } catch (_) { /* не підтримується */ } };
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && phone.wake && navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (_) { wakeLock = null; /* браузер не дозволив */ }
  }
  function phonePanel() {
    const can = { vibe: !!navigator.vibrate, wake: !!navigator.wakeLock };
    return el('div.panel', [el('h3', 'Телефон'),
      el('label.check', [el('input', { type: 'checkbox', checked: phone.vibe || null, disabled: !can.vibe || null, onchange: (e) => { phone.vibe = e.target.checked; savePhone(); if (phone.vibe) vibe(60); } }), ' Вібрація на голах', can.vibe ? '' : el('small.muted', ' (цей пристрій не підтримує)')]),
      el('label.check', [el('input', { type: 'checkbox', checked: phone.wake || null, disabled: !can.wake || null, onchange: (e) => { phone.wake = e.target.checked; savePhone(); } }), ' Екран не гасне під час трансляції', can.wake ? '' : el('small.muted', ' (цей браузер не підтримує)')]),
    ]);
  }

  // ---------------- Налаштування ----------------
  let confirmReset = false;
  // ---------------- Слоти збереження й відкат (крок 47) ----------------
  let slotConfirm = null;
  function slotsPanel() {
    if (!slotMeta) {
      Promise.all(store.SLOTS.map((n) => store.meta(n))).then((list) => { slotMeta = list; if (location.hash === '#options') render(); });
      return el('div.panel', [el('h3', 'Слоти збереження'), el('p.muted', 'Завантаження…')]);
    }
    const act = store.active();
    const desc = (m) => (!m ? 'порожній' : m.legacy ? 'збереження попередньої версії гри' : `${m.manager}, ${m.club}, сезон ${m.year}/${String(m.year + 1).slice(2)}, тиждень ${m.week + 1} · ${new Date(m.saved).toLocaleString('uk-UA')}`);
    const backs = ((slotMeta[act - 1] || {}).backs || []).slice().reverse();
    const cur = `${state.season.year}-${String(state.season.week).padStart(2, '0')}`;
    return el('div.panel', [el('h3', 'Слоти збереження'),
      el('ul.plist', store.SLOTS.map((n, i) => el('li', [el('span', [el('b', `Слот ${n}${n === act ? ' (зараз)' : ''}`), el('small.muted', ' ' + desc(slotMeta[i]))]),
        n === act ? null : el('span.actions', [
          el('button.btn', { type: 'button', onclick: () => { store.setActive(n); location.hash = ''; location.reload(); } }, slotMeta[i] ? 'Відкрити' : 'Нова кар’єра тут'),
          slotMeta[i] ? (slotConfirm === n
            ? el('button.btn', { type: 'button', onclick: () => { slotConfirm = null; store.clear(n).then(() => { slotMeta = null; render(); }); } }, 'Точно видалити')
            : el('button.btn', { type: 'button', onclick: () => { slotConfirm = n; render(); } }, 'Видалити')) : null,
        ])]))),
      el('h3', 'Відкат'),
      backs.filter((t) => t !== cur).length ? el('div.actions', backs.filter((t) => t !== cur).map((t) => { const [y, w] = t.split('-').map(Number); return el('button.btn', { type: 'button', onclick: () => {
        store.rollback(act, t).then((ok) => { if (ok) { location.hash = ''; location.reload(); } });
      } }, `До початку тижня ${w + 1} (${y}/${String(y + 1).slice(2)})`); }))
        : el('p.muted', 'Контрольні точки з’являться з наступного тижня: гра запам’ятовує початок кожного з останніх чотирьох тижнів.'),
      el('p.note', 'Кожен слот — окрема кар’єра. Відкат повертає поточний слот до початку вибраного тижня; пізніші зміни зникнуть.'),
    ]);
  }

  /** «Версія від 20.11.2026, 15:40 (коміт abc1234)» — з js/version.js, який пише процес публікації. */
  function versionText(short) {
    const v = window.FM_VERSION;
    if (!v || !v.built) return short ? 'розробницька копія' : 'Розробницька копія (дата збірки невідома)';
    const d = new Date(v.built);
    const opt = { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    let txt;
    try { txt = d.toLocaleString('uk-UA', opt).replace(',', ''); } catch (_) { txt = d.toISOString().slice(0, 16).replace('T', ' '); }
    if (short) return `версія від ${txt.slice(0, 5)}, ${txt.slice(-5)}`;
    return `Версія від ${txt.replace(' ', ', ')}${v.commit ? ` (коміт ${v.commit})` : ''}${v.source ? ` · ${v.source}` : ''}`;
  }

  function screenSettings() {
    const setNames = (v) => { state.names = v; saveGame(); render(); };
    return [
      el('header', [el('h1', 'Налаштування')]),
      el('div.panel.version', [el('h3', 'Версія гри'), el('p', el('b', versionText())),
        el('div.actions', [el('button.btn', { type: 'button', onclick: () => {
          const done = () => location.reload();
          try { navigator.serviceWorker.getRegistration().then((r) => (r ? r.update() : null)).catch(() => {}).finally(done); } catch (_) { done(); }
        } }, 'Перезавантажити гру')]),
        el('p.note', 'Після злиття PR процес «Публікація» за 2–3 хвилини викладає нову версію. Натисніть «Перезавантажити гру» — тут з’явиться її дата. Кар’єра збережена й нікуди не зникне.')]),
      phonePanel(),
      el('div.panel', [el('h3', 'Оформлення'), el('div.tabs', { style: { marginTop: '0.5rem' } }, [
        el('button', { type: 'button', 'aria-pressed': String(skin === 'classic'), onclick: () => { setSkin('classic'); render(); } }, 'Класичний менеджер'),
        el('button', { type: 'button', 'aria-pressed': String(skin === 'light'), onclick: () => { setSkin('light'); render(); } }, 'Світле'),
      ]), el('p.note', 'Класичний менеджер: темні панелі, щільні таблиці, кольори вашого клубу в меню й заголовках.')]),
      el('div.panel', [el('h3', 'Рушій матчу'), el('div.tabs', { style: { marginTop: '0.5rem' } }, [
        el('button', { type: 'button', 'aria-pressed': String(engineMode === 'sim'), onclick: () => { setEngine('sim'); render(); } }, 'Детальний: 22 гравці на полі'),
        el('button', { type: 'button', 'aria-pressed': String(engineMode === 'classic'), onclick: () => { setEngine('classic'); render(); } }, 'Класичний: швидкий'),
      ]), el('p.note', engineMode === 'sim'
        ? 'Матчі вашого клубу грає детальний рушій: кожен гравець рухається полем і сам вирішує, що робити з м’ячем, — передача (її можна перехопити), ведення, навіс, удар. Голи, удари й передачі виникають із самої гри, а 2D-поле показує, що відбувається насправді. Інші матчі ліг — класичним рушієм, щоб сезон рахувався швидко.'
        : 'Класичний рушій: команди порівнюються «лінія проти лінії», моменти й голи — за ймовірностями. Найшвидший варіант.')]),
      el('div.panel', [el('h3', 'Імена'), el('div.tabs', { style: { marginTop: '0.5rem' } }, [
        el('button', { type: 'button', 'aria-pressed': String(state.names !== 'en'), onclick: () => setNames('uk') }, 'Українською'),
        el('button', { type: 'button', 'aria-pressed': String(state.names === 'en'), onclick: () => setNames('en') }, 'Мовою оригіналу'),
      ]), el('p.note', 'Українські назви — з Wikidata; де їх немає, лишається оригінал.')]),
      el('div.panel', [el('h3', 'Кар’єра'), el('p', `Тренер ${state.manager}, ${clubName(W.club(state.clubId))}.`),
        confirmReset
          ? el('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } }, [
            el('span', 'Видалити збереження й почати заново?'),
            el('button.btn.primary', { type: 'button', onclick: () => { resetCareer(); confirmReset = false; location.hash = ''; render(); } }, 'Так, почати заново'),
            el('button.btn', { type: 'button', onclick: () => { confirmReset = false; render(); } }, 'Скасувати')])
          : el('button.btn', { type: 'button', onclick: () => { confirmReset = true; render(); } }, 'Почати нову кар’єру')]),
      el('div.panel', [el('h3', 'Підказки для новачка'), state.tutorial ? el('p', `Увімкнено: підказка ${state.tutorial.step + 1} з ${TUTORIAL.length}.`) : null,
        el('button.btn', { type: 'button', onclick: () => { state.tutorial = state.tutorial ? null : { step: 0 }; saveGame(); state.tutorial ? go('overview') : render(); } }, state.tutorial ? 'Вимкнути' : 'Пройти навчання знову')]),
      slotsPanel(),
      savePanel(),
      syncPanel(),
      el('div.panel', [el('h3', 'Про базу'), el('dl.facts', [
        el('dt', 'Знімок'), el('dd', fmt.date(W.db.snapshot)),
        el('dt', 'Клубів'), el('dd', W.db.clubs.length),
        el('dt', 'Гравців'), el('dd', W.db.players.length),
        el('dt', 'Джерела'), el('dd', W.db.source),
      ])]),
    ];
  }

  render();

  // офлайн-режим: працює, коли гра відкрита з сайту (https), а не з файлу
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.FM_BUNDLED) {
    try { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}); } catch (_) { /* у пісочниці може бути заборонено */ }
  }
})();
