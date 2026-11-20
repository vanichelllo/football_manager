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

  if (state) { FM.market.init(W, state); if (!state.board) FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state); }

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
  const NAMES = { club: (c) => clubName(c), player: (p) => nameOf(p), gen: genOf };
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

  function render() {
    clearTimeout(liveTimer); // пішли з трансляції — матч догравається миттєво й записується
    if (activeLive) activeLive.finish();
    if (!state) return renderStart();
    if (!state.cups) { ensureCups(); saveGame(); } // старе збереження без кубків
    let view = location.hash.slice(1) || 'overview';
    if (state.sacked && !['sacked', 'options'].includes(view.split('-')[0])) view = 'sacked';
    const [name, arg] = view.split(/-(.+)/);
    const screens = { overview: screenOverview, squad: screenSquad, player: screenPlayer, leagues: screenLeagues, club: screenClub, match: screenMatch, tactics: screenTactics, transfers: screenTransfers, office: screenOffice, cups: screenCups, help: screenHelp, board: screenBoard, sacked: screenSacked, training: screenTraining, report: screenReport, history: screenHistory, coach: screenCoach, inbox: screenInbox, dressing: screenDressing, u21: screenU21, calendar: screenCalendar, compare: screenCompare, nations: screenNations, edit: screenEditPlayer, editclub: screenEditClub, fixtures: screenSeason, table: screenTable, options: screenSettings };
    const body = (screens[name] || screenOverview)(arg);
    app.replaceChildren(shell(name, body));
    window.scrollTo(0, 0);
  }

  function shell(active, body) {
    const my = W.club(state.clubId);
    const item = (id, label, disabled) => el('button', {
      type: 'button', 'aria-current': active === id ? 'page' : null, disabled: disabled || null, onclick: () => go(id),
    }, disabled ? [label, el('span.soon', 'скоро')] : label);
    return el('div.shell', [
      el('aside.side', [
        el('div.club-head', [badge(my), el('b', clubName(my))]),
        el('nav.nav', { 'aria-label': 'Меню' }, [
          item('overview', 'Огляд'), item('inbox', (() => { const n = FM.market.unread(state); return n ? ['Повідомлення ', el('span.count', { 'aria-label': `${n} непрочитаних` }, String(n))] : 'Повідомлення'; })()), item('squad', 'Склад'), item('dressing', 'Роздягальня'), item('u21', 'Молодь U-21'), item('leagues', 'Ліги й клуби'),
          item('fixtures', 'Сезон'), item('calendar', 'Календар'), item('table', 'Таблиця'), item('cups', 'Кубки'), item('match', 'Товариський'),
          item('tactics', 'Тактика'), item('training', 'Тренування'), item('transfers', 'Трансфери'), item('office', 'Клуб'), item('board', 'Правління'), item('coach', 'Тренер'), item('nations', 'Збірна'), item('history', 'Історія'), item('help', 'Довідка'),
          item('options', 'Налаштування'),
        ]),
        el('div.foot', [`Тренер: ${state.manager}`, el('br'), `Сезон ${seasonLabel()}`]),
      ]),
      el('main.main', [tutorialBox(active), ...[].concat(body)]),
    ]);
  }

  // ---------------- Початок кар'єри ----------------
  function renderStart() {
    let leagueId = 'ukr', clubId = null;
    const grid = el('div.club-grid');
    const tabs = el('div.tabs', { role: 'group', 'aria-label': 'Ліга' });
    const nameInput = el('input', { id: 'manager-name', type: 'text', value: 'Новий тренер', maxlength: 40, autocomplete: 'off' });
    const tutInput = el('input', { id: 'tutorial', type: 'checkbox', checked: true });
    const startBtn = el('button.btn.primary', { type: 'button', disabled: true, onclick: begin }, 'Почати кар’єру');
    const picked = el('span.muted', 'Оберіть клуб');

    function drawTabs() {
      tabs.replaceChildren(...W.db.leagues.map((l) => el('button', {
        type: 'button', 'aria-pressed': String(l.id === leagueId),
        onclick: () => { leagueId = l.id; drawTabs(); drawClubs(); },
      }, l.name)));
    }
    function drawClubs() {
      const list = W.clubsOf(leagueId).map((c) => ({ c, lvl: W.clubLevel(c.id) })).sort((a, b) => b.lvl - a.lvl);
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
      ensureCups();
      saveGame();
      go('overview');
    }
    drawTabs(); drawClubs();
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
      tabs,
      grid,
      el('div.panel.confirm', [picked, startBtn]),
      el('p.note', `Дані: ${W.db.source}. Знімок від ${fmt.date(W.db.snapshot)}. Атрибути вирахувані з реальних фактів і можуть не збігатися з вашим уявленням про гравця.`),
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
      tipsPanel(4),
      newsPanel(),
      el('div.grid', [mini(best, 'Найкращі гравці'), mini(young, 'Найперспективніша молодь (до 21)')]),
    ];
  }

  // ---------------- Склад ----------------
  let squadSort = { key: 'pos', dir: 1 };
  function squadTable(clubId) {
    const rows = W.squad(clubId);
    const cols = [
      ['number', '№', (p) => p.number ?? '', 'num'],
      ['name', 'Гравець', (p) => nameOf(p), 'name'],
      ['pos', 'Позиція', (p) => FM.positions(p)],
      ['age', 'Вік', (p) => W.age(p) ?? '—', 'num'],
      ['nat', 'Країна', (p) => FM.countries.name(p.nat)],
      ['ca', 'Рівень', (p) => starsEl(p.ca, 'Рівень')],
      ['pa', 'Потенціал', (p) => starsEl(p.pa, 'Потенціал')],
      ['season', 'Ігри / голи', (p) => { const st = pstat(p.id); return st ? `${st[0]} / ${st[1]}` : '—'; }, 'num'],
      ['caps', 'Збірна', (p) => (p.caps ? `${p.caps} (${p.intlGoals || 0})` : '—'), 'num'],
      ['value', 'Ціна', (p) => fmt.money(p.value), 'num'],
      ['contract', 'Контракт', (p) => p.contract ?? '—', 'num'],
      ['form', 'Форма', (p) => (p.form && p.form.length ? (p.form.reduce((a, b) => a + b, 0) / p.form.length).toFixed(1).replace('.', ',') : '—'), 'num'],
      ['morale', 'Настрій', (p) => el('span.mood.m' + Math.min(4, Math.floor(FM.morale.get(p) / 20.01)), { title: p.mr ? 'Причина: ' + p.mr : null }, FM.morale.label(p))],
    ];
    const keyFn = {
      number: (p) => p.number ?? 999, name: nameOf, age: (p) => W.age(p) ?? 99, nat: (p) => FM.countries.name(p.nat),
      ca: (p) => -p.ca, pa: (p) => -p.pa, caps: (p) => -(p.caps || 0), value: (p) => -p.value, pos: null,
      season: (p) => { const st = pstat(p.id); return st ? -(st[0] * 100 + st[1]) : 0; },
      contract: (p) => p.contract || 0,
      morale: (p) => -FM.morale.get(p),
      form: (p) => -(p.form && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 0),
    };
    const sorted = [...rows];
    if (keyFn[squadSort.key]) sorted.sort((a, b) => {
      const x = keyFn[squadSort.key](a), y = keyFn[squadSort.key](b);
      return (typeof x === 'string' ? x.localeCompare(y, 'uk') : x - y) * squadSort.dir;
    });
    else if (squadSort.dir < 0) sorted.reverse();

    const wrap = el('div.table-wrap');
    const draw = () => wrap.replaceChildren(el('table', [
      el('thead', el('tr', cols.map(([k, label, , cls]) => el('th' + (cls === 'num' ? '.num' : ''), {
        'data-sort': k, scope: 'col', 'aria-sort': squadSort.key === k ? (squadSort.dir > 0 ? 'ascending' : 'descending') : null,
        onclick: () => { squadSort = { key: k, dir: squadSort.key === k ? -squadSort.dir : 1 }; render(); },
      }, label)))),
      el('tbody', sorted.map((p) => el('tr.row-link', { onclick: () => go('player-' + p.id) }, cols.map(([k, , f, cls]) => {
        const td = el('td' + (cls ? '.' + cls : ''), [f(p)]);
        if (k === 'pos') td.className = 'pos line-' + FM.ROLE_LINE[p.roles[0]];
        if (k === 'name') td.append(...(p.captain ? [' ', el('span.muted', { title: 'Капітан' }, '(К)')] : []), ...(p.onLoanFrom ? [' ', el('span.soon', { title: 'В оренді з ' + p.onLoanFrom }, 'оренда')] : []),
          ...(banned(p.id) ? [' ', el('span.chip.bad', { title: 'Пропускає наступний матч' }, 'дискв.')] : []),
          ...(p.edited ? [' ', el('span.chip', { title: 'Дані змінено в редакторі' }, '✎')] : []),
          ...(state && (state.u21 || []).includes(p.id) ? [' ', el('span.chip', { title: 'У молодіжній команді — не в заявці основи' }, 'U-21')] : []),
          ...(p.injury ? [' ', el('span.chip.bad', { title: `Травма, ще ${p.injury} тиж.` }, '+' + p.injury)] : []),
          ...(p.youth ? [' ', el('span.chip', { title: 'Вихованець академії' }, 'юнак')] : []),
          ...(p.listed ? [' ', el('span.chip', { title: 'Виставлений на трансфер' }, 'продаж')] : []),
          ...(p.loan ? [' ', el('span.chip', { title: `В оренді з ${clubName(W.club(p.loan.from))}` }, 'оренда')] : []),
          ...(p.wantsOut ? [' ', el('span.chip.bad', { title: 'Просить продати його' }, 'хоче піти')] : []));
        return td;
      })))),
    ]));
    draw();
    return wrap;
  }

  function screenSquad() {
    const c = W.club(state.clubId);
    return [
      el('header', [el('h1', 'Склад'), el('span.muted', `${W.club(c.id).players.length} гравців · натисніть заголовок, щоб сортувати`)]),
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
    return [
      el('div.player-top', [
        shirt,
        el('div', { style: { minWidth: 0 } }, [
          el('h1', nameOf(p)),
          el('div.muted', [c.id ? el('a', { href: c.id === state.clubId ? '#squad' : '#club-' + c.id }, clubName(c)) : (p.retired ? 'завершив кар’єру' : 'вільний агент'), ` · ${FM.ROLE_NAME[p.roles[0]]} (${FM.positions(p)})`]),
        ]),
        el('div.actions', [
          el('button.btn', { type: 'button', 'aria-pressed': String((state.compare || []).includes(p.id)), onclick: () => { toggleCompare(p.id); render(); } }, (state.compare || []).includes(p.id) ? '✓ У порівнянні' : 'Порівняти'),
          (state.compare || []).length >= 2 && (state.compare || []).includes(p.id) ? el('a.btn', { href: '#compare' }, `Порівняння (${state.compare.length})`) : null,
          el('a.btn.edit-btn', { href: '#edit-' + p.id }, p.edited ? 'Редагувати (змінено)' : 'Редагувати'),
        ]),
      ]),
      el('div.grid', [
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
          ...(!p.club && !p.retired ? [el('dt', 'Клуб'), el('dd', 'вільний агент')] : []),
          ...((p.hist && p.hist.length) ? [el('dt', 'Рівень за сезонами'), el('dd', p.hist.map(([y, v]) => `${y}/${String(y + 1).slice(2)}: ${v}`).concat([`зараз: ${p.ca}`]).join(' · '))] : []),
          ...(() => {
            const st = pstat(p.id);
            if (!st) return [el('dt', 'Сезон'), el('dd', 'ще не грав')];
            return [el('dt', 'Сезон'), el('dd', `${st[0]} матчів, ${st[1]} голів, ${st[2]} передач`),
              el('dt', 'Середня оцінка'), el('dd', (st[3] / st[0] / 10).toFixed(2).replace('.', ',')),
              el('dt', 'Картки'), el('dd', `${st[4]} жовтих, ${st[5]} червоних` + (banned(p.id) ? ' · пропускає наступний матч' : ''))];
          })(),
        ]), p.wiki ? el('p.note', ['Факти: ', el('a', { href: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.wiki.replace(/ /g, '_')), target: '_blank', rel: 'noopener' }, 'Wikipedia')]) : null]),
      ]),
      el('div.panel', [el('div.attrs', groups.map(([title, keys]) => el('div', [
        el('h3', title),
        el('ul', keys.map((k) => {
          if (known(p)) return el('li', [FM.ATTRS[k], el('b.' + attrClass(p.attrs[k]), p.attrs[k])]);
          const d = 1 + Math.abs(fuzz(p, k, 2)), mid = p.attrs[k] + fuzz(p, k + 'm', 1);
          const lo = Math.max(1, mid - d), hi = Math.min(20, mid + d);
          return el('li', [FM.ATTRS[k], el('b.' + attrClass(mid), `${lo}–${hi}`)]);
        })),
      ]))), known(p) ? null : el('p.note', 'Гравця не розвідано: атрибути приблизні. Відправте скаута, щоб дізнатися точно.')]),
      playerExtras(p),
      p.retired ? null : p.club === state.clubId ? myPlayerPanel(p) : transferPanel(p),
      !p.retired && p.club === state.clubId && !(p.loan && p.loan.to === state.clubId) ? talkPanel(p) : null,
    ];
  }

  // ---------------- Розмови з гравцем (крок 42) ----------------
  let talkMsg2 = null;
  function talkPanel(p) {
    const opts = FM.career.talkOptions(W, state, p);
    const mine = (state.promises || []).filter((x) => x.pid === p.id);
    const S = state.season;
    return el('div.panel', [el('h3', 'Розмова з гравцем'),
      el('p.muted', `Настрій: ${FM.morale.label(p).toLowerCase()} (${Math.round(FM.morale.get(p))}). Статус: ${FM.morale.STATUS[FM.morale.status(W, p)].toLowerCase()}.${p.wantsOut ? ' Просить продажу.' : ''}${p.trust ? ` Довіра до вас: ${p.trust > 0 ? '+' : ''}${p.trust}.` : ''}`),
      mine.length ? el('ul.plain', mine.map((x) => el('li', `Обіцянка: ${FM.career.TALK[x.kind].label.toLowerCase()} — термін до ${Math.min(x.due, 37) + 1}-го тижня${x.kind === 'time' ? ` (зіграно ${((S.ps[p.id] && S.ps[p.id][0]) || 0) - x.apps0} з ${x.need})` : ''}.`))) : null,
      el('div.actions', opts.map((o) => el('button.btn', { type: 'button', title: o.off || o.hint, disabled: o.off ? true : null, onclick: () => {
        const r = FM.career.talk(W, state, p, o.kind); talkMsg2 = { id: p.id, text: r.text, good: r.good }; saveGame(); render();
      } }, o.label))),
      talkMsg2 && talkMsg2.id === p.id ? el(talkMsg2.good ? 'p.msg-ok' : 'p.msg-bad', talkMsg2.text) : el('small.muted', 'Наведіть на варіант, щоб побачити, коли він доречний. З одним гравцем — не частіше ніж раз на 4 тижні.'),
    ]);
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

  // ---------------- Трансфери: панелі в картці гравця ----------------
  let deal = null; // поточні перемовини: { pid, stage: 'club' | 'player', fee, msg, ok }
  let renewMsg = null, confirmRelease = null, loanShow = null;
  const M = (v) => FM.market.fmtM(v);
  const numField = (id, label, value, step, min, max) => el('div.field', [el('label', { for: id }, label),
    el('input', { id, type: 'number', value, step, min, max, inputmode: 'decimal' })]);

  function shortlistBtn(p) {
    const on = (state.shortlist || []).includes(p.id);
    return el('button.btn', { type: 'button', 'aria-pressed': String(on), onclick: () => {
      state.shortlist = on ? state.shortlist.filter((x) => x !== p.id) : (state.shortlist || []).concat([p.id]);
      saveGame(); render();
    } }, on ? '★ У шортлисті' : '☆ До шортлиста');
  }

  function transferPanel(p) {
    const S = state.season, me = W.club(state.clubId);
    if (!deal || deal.pid !== p.id) deal = { pid: p.id, stage: p.club ? 'club' : 'player', fee: p.club ? FM.market.askingPrice(W, p, S) : 0, msg: null };
    const open = FM.market.windowOpen(S) || !p.club;
    const scouting = (state.scouting || []).includes(p.id);
    const cap = 2 + FM.market.scouts(state).length;
    const blocks = [el('div.panel-head', [el('h3', p.club ? 'Трансфер' : 'Підписати вільного агента'), shortlistBtn(p)])];
    blocks.push(el('p.muted', `Ваш баланс: ${M(me.balance)}. ` + (p.club ? `Клуб орієнтовно хоче ${M(FM.market.askingPrice(W, p, S))}.` : 'Вільного агента можна підписати будь-коли, без відступних.')
      + (p.clause ? ` У контракті — відступні ${M(p.clause)}: за таку суму клуб не може відмовити.` : '') + (p.loan ? ' Гравець зараз в оренді.' : '')));
    if (!known(p)) blocks.push(el('div.actions', [el('button.btn', { type: 'button', disabled: scouting || (state.scouting || []).length >= cap || null, onclick: () => {
      state.scouting = (state.scouting || []).concat([p.id]); saveGame(); render();
    } }, scouting ? 'Скаут уже працює — звіт за тиждень' : (state.scouting || []).length >= cap ? `Скаути зайняті (${cap} на тиждень)` : 'Відправити скаута')]));
    if (!open) {
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
      blocks.push(el('div.pre-row', [numField('bid-fee', 'Гроші, млн €', deal.fee, 0.05, 0, 400),
        el('div.field', [el('label', { for: 'bid-swap' }, 'Гравець в обмін'), el('select', { id: 'bid-swap' }, [el('option', { value: '' }, 'Без обміну'),
          ...mine.sort((a, b) => b.value - a.value).map((x) => el('option', { value: x.id, selected: deal.swap === x.id || null }, `${nameOf(x)} · ${M(x.value)}`))])]),
        el('label.check', [el('input', { id: 'bid-sellon', type: 'checkbox', checked: deal.sellOn || null }), ' 15% з наступного продажу клубу (ціна −10%)']),
        el('button.btn.primary', { type: 'button', onclick: () => {
          const fee = Math.max(0, Number(document.getElementById('bid-fee').value) || 0);
          const swap = document.getElementById('bid-swap').value || null;
          const sellOn = document.getElementById('bid-sellon').checked;
          if (fee > me.balance) { deal.msg = `Не вистачає грошей: баланс ${M(me.balance)}.`; deal.ok = false; return render(); }
          const swapVal = swap ? W.player(swap).value * 0.85 : 0; // гравець в обмін рахується як 85% його ціни
          const r = FM.market.clubResponse(W, p, fee + swapVal, me.id, S, { sellOn });
          deal.swap = swap; deal.sellOn = sellOn;
          if (r.ok) { deal.stage = 'player'; deal.fee = fee; deal.msg = `${clubName(W.club(p.club))} погоджується${r.clause ? ' (відступні)' : ''}: ${M(fee)}${swap ? ` + ${nameOf(W.player(swap))}` : ''}${sellOn ? ', 15% з наступного продажу' : ''}. Тепер — контракт із гравцем.`; deal.ok = true; }
          else { deal.fee = r.counter ? Math.max(0, Math.round((r.counter - swapVal) * 20) / 20) : fee; deal.msg = r.reason; deal.ok = false; }
          render();
        } }, 'Запропонувати')]));
      if (FM.market.loanable(W, p)) blocks.push(el('div.loan-box', [el('b', 'Або взяти в оренду до кінця сезону'),
        el('p.muted', `Клуб хоче ${M(FM.market.loanFee(p))} за оренду. Ви платите частину зарплати (${p.wage} тис. €/тиж.).`),
        el('div.pre-row', [el('div.field', [el('label', { for: 'loan-share' }, 'Ваша частка зарплати'), el('select', { id: 'loan-share' }, [0.5, 0.75, 1].map((x) => el('option', { value: x, selected: x === 0.75 || null }, Math.round(x * 100) + '%')))]),
          el('button.btn', { type: 'button', onclick: () => {
            const share = Number(document.getElementById('loan-share').value);
            const gap = W.clubLevel(p.club) - W.clubLevel(me.id);
            if (gap > 15 + 10 * share) { deal.msg = 'Клуб не хоче віддавати гравця в настільки слабкий клуб.'; deal.ok = false; return render(); }
            if (FM.market.loanFee(p) > me.balance) { deal.msg = 'Не вистачає грошей на оренду.'; deal.ok = false; return render(); }
            if (share < 0.75 && W.clubLevel(p.club) > W.clubLevel(me.id)) { deal.msg = 'Сильніший клуб хоче, щоб ви платили щонайменше 75% зарплати.'; deal.ok = false; return render(); }
            FM.market.loanIn(W, state, p, me.id, share);
            FM.market.news(state, `${nameOf(p)} — в оренді у вас до кінця сезону.`);
            state.known = state.known || {}; state.known[p.id] = true;
            deal = null; saveGame(); render();
          } }, 'Взяти в оренду')])]));
    } else {
      const raw = FM.market.wageDemand(W, p, me.id);
      if (raw == null) { blocks.push(el('p.msg-bad', 'Гравець не хоче переходити в значно слабший клуб.')); return el('div.panel', blocks); }
      const agent = FM.market.agentFee(deal.fee, raw, p);
      blocks.push(el('p.muted', `Гравець зараз отримує ${p.wage || '—'} тис. € на тиждень${known(p) ? `, розраховує приблизно на ${raw}` : ''}. Комісія агента — ${M(agent)}.${rv ? ` ${clubName(W.club(rv.club))} пропонує йому ${rv.wage} тис.` : ''}`));
      blocks.push(el('div.pre-row', [
        numField('bid-wage', 'Зарплата, тис. € на тиждень', deal.wage || (rv ? Math.max(raw, rv.wage) : raw), 1, 1, 2000),
        el('div.field', [el('label', { for: 'bid-years' }, 'Років'), el('select', { id: 'bid-years' }, [1, 2, 3, 4, 5].map((y) => el('option', { value: y, selected: y === (deal.years || 3) || null }, y)))]),
        numField('bid-clause', 'Відступні, млн € (необов’язково)', deal.clause || '', 0.5, 0, 500),
        numField('bid-bonus', 'Бонус за гол, тис. €', deal.goalBonus || '', 1, 0, 500),
        el('button.btn.primary', { type: 'button', onclick: () => {
          const wage = Math.round(Number(document.getElementById('bid-wage').value) || 0);
          const years = Number(document.getElementById('bid-years').value);
          const clause = Number(document.getElementById('bid-clause').value) || 0;
          const goalBonus = Math.round(Number(document.getElementById('bid-bonus').value) || 0);
          Object.assign(deal, { wage, years, clause, goalBonus });
          const r = FM.market.playerResponse(W, p, me.id, wage, years, { rival: rv, clauses: { clause, goalBonus } });
          if (!r.ok) { deal.msg = r.reason; deal.ok = false; return render(); }
          const ag = FM.market.agentFee(deal.fee, wage, p);
          if (deal.fee + ag > me.balance) { deal.msg = `Не вистачає грошей: баланс ${M(me.balance)}, з агентом — ${M(deal.fee + ag)}.`; deal.ok = false; return render(); }
          const bill = FM.market.wageBill(W, me.id) - (deal.swap ? W.player(deal.swap).wage || 0 : 0);
          if (bill + wage > me.wageBudget) { deal.msg = `Правління не погоджує: фонд зарплат ${me.wageBudget} тис. €/тиж., уже витрачено ${bill}. Продайте когось або запропонуйте менше.`; deal.ok = false; return render(); }
          const from = p.club ? clubName(W.club(p.club)) : null;
          state.board.fin.transfers = Math.round((state.board.fin.transfers - deal.fee - ag) * 100) / 100;
          FM.market.complete(W, state, p, me.id, deal.fee, wage, years, { agent: ag, sellOn: deal.sellOn ? 0.15 : 0, clause: clause || null, goalBonus: goalBonus || null, swap: deal.swap });
          state.known = state.known || {}; state.known[p.id] = true;
          FM.market.news(state, `Ви підписали ${nameOf(p)}${from ? ` (${from}, ${M(deal.fee)}${deal.swap ? ' + обмін' : ''})` : ' (вільний агент)'}.`);
          deal = null; saveGame(); render();
        } }, 'Запропонувати контракт'),
      ]));
      blocks.push(el('p.note', 'Відступні знижують вимоги гравця на 10%, але за цю суму будь-який клуб зможе його забрати. Бонус за голи теж трохи знижує вимоги.'));
    }
    return el('div.panel', blocks);
  }

  function myPlayerPanel(p) {
    const S = state.season;
    const yearsLeft = (p.contract || S.year + 2) - S.year - 1;
    if (p.loan && p.loan.to === state.clubId) {
      return el('div.panel', [el('h3', 'Оренда'), el('p', `В оренді з клубу ${clubName(W.club(p.loan.from))} до кінця сезону. Ви платите ${Math.round(p.loan.share * 100)}% зарплати (${Math.round(p.wage * p.loan.share)} тис. €/тиж.).`)]);
    }
    const blocks = [el('h3', 'Контракт і трансфер'),
      el('p', `Контракт до літа ${p.contract} (${yearsLeft <= 0 ? 'закінчується цього сезону' : `ще ${yearsLeft} р. після цього сезону`}), ${p.wage} тис. € на тиждень.`
        + (p.clause ? ` Відступні: ${M(p.clause)}.` : '') + (p.goalBonus ? ` Бонус за гол: ${p.goalBonus} тис. €.` : '') + (p.sellOn ? ` ${Math.round(p.sellOn.pct * 100)}% з наступного продажу отримає ${clubName(W.club(p.sellOn.club))}.` : ''))];
    if (renewMsg && renewMsg.pid === p.id) blocks.push(el('p.' + (renewMsg.ok ? 'msg-ok' : 'msg-bad'), renewMsg.text));
    const demand = FM.market.renewDemand(W, p);
    blocks.push(el('div.pre-row', [
      numField('renew-wage', 'Нова зарплата, тис. € на тиждень', demand, 1, 1, 2000),
      el('div.field', [el('label', { for: 'renew-years' }, 'Ще років'), el('select', { id: 'renew-years' }, [1, 2, 3, 4, 5].map((y) => el('option', { value: y, selected: y === 3 || null }, y)))]),
      el('button.btn', { type: 'button', onclick: () => {
        const nw = Math.round(Number(document.getElementById('renew-wage').value) || 0);
        const me = W.club(state.clubId), bill = FM.market.wageBill(W, me.id);
        if (bill - (p.wage || 0) + nw > me.wageBudget) { renewMsg = { pid: p.id, ok: false, text: `Правління не погоджує: перевищено фонд зарплат (${me.wageBudget} тис. €/тиж.).` }; return render(); }
        const r = FM.market.renew(W, state, p, nw, Number(document.getElementById('renew-years').value));
        renewMsg = { pid: p.id, ok: r.ok, text: r.ok ? `Контракт продовжено до літа ${p.contract}.` : r.reason };
        if (r.ok) saveGame(); render();
      } }, 'Продовжити контракт'),
    ]));
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
  function offerList(ids, onTake) {
    return el('ul.plist', ids.map((id) => {
      const c = W.club(id);
      return el('li', [el('span.club-cell', [badge(c), el('span', [clubName(c), el('small.muted', ` ${W.league(c.league).name}`)])]),
        el('span', [starsEl(W.clubLevel(id), 'Рівень клубу'), ' ', el('button.btn', { type: 'button', onclick: () => onTake(id) }, 'Очолити')])]);
    }));
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
          el('dt', 'Зарплати'), el('dd', '−' + FM.market.fmtM(f.wages)),
          el('dt', 'Трансфери'), el('dd', f.transfers ? (f.transfers > 0 ? '+' : '−') + FM.market.fmtM(Math.abs(f.transfers)) : '—'),
          el('dt', 'Фонд зарплат'), el('dd', `${FM.market.wageBill(W, me.id)} з ${me.wageBudget} тис. € на тиждень`),
        ]), el('p.note', 'Дохід клубу розрахований так, щоб за стартових зарплат сезон був трохи в плюсі. Дорогі контракти з’їдають прибуток; від’ємний баланс знижує довіру.')]),
      ]),
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
    return el('div.panel', [el('h3', 'Шортлист'), ids.length ? el('div.table-wrap.flat', el('table', [
      el('thead', el('tr', [el('th', 'Гравець'), el('th', 'Клуб'), el('th.num', 'Вік'), el('th', 'Рівень'), el('th.num', 'Ціна'), el('th', 'Статус')])),
      el('tbody', ids.map((id) => { const p = W.player(id); return el('tr.row-link', { onclick: () => go('player-' + id) }, [
        el('td.name', nameOf(p)), el('td', p.club ? clubName(W.club(p.club)) : p.retired ? 'завершив' : 'вільний'), el('td.num', W.age(p) ?? '—'),
        el('td', starsEl(seenCA(p), 'Рівень')), el('td.num', p.club ? M(FM.market.askingPrice(W, p, S)) : '—'),
        el('td', [p.listed ? el('span.chip', 'продаж') : null, p.injury ? el('span.chip.bad', 'травма') : null, p.loan ? el('span.chip', 'в оренді') : null, p.clause ? el('span.chip', `відступні ${M(p.clause)}`) : null])]); })),
    ])) : el('p.muted', 'Порожньо. Додавайте гравців кнопкою «☆ До шортлиста» в їхніх картках — про зміни (трансфер, продаж, травма) повідомлять новини.')]);
  }

  function scoutsPanel() {
    const list = FM.market.scouts(state);
    const R = FM.rng(Date.now());
    return el('div.panel', [el('h3', 'Скаутська мережа'),
      el('p.muted', `Точність оцінок залежить від найкращого скаута. Скаут, закріплений за лігою, за кілька тижнів розвідує всіх її гравців. Індивідуальних звітів на тиждень: ${2 + list.length}.`),
      el('ul.plist', list.map((sc, i) => el('li', [
        el('span', [el('b', sc.name), el('small.muted', ` рівень ${sc.level}${i ? `, ${FM.market.scoutWage(sc)} тис. €/тиж.` : ', головний'}`)]),
        el('span.offer-btns', [
          el('select.tiny', { 'aria-label': 'Регіон скаута', onchange: (e) => { sc.region = e.target.value || null; sc.prog = 0; saveGame(); render(); } }, [el('option', { value: '' }, 'Без завдання'),
            el('optgroup', { label: 'Ліги гри' }, W.db.leagues.filter((l) => !(state.knownLeagues || {})[l.id] && l.id !== W.club(state.clubId).league).map((l) => el('option', { value: l.id, selected: sc.region === l.id || null }, l.name))),
            el('optgroup', { label: 'Світ: пошук талантів' }, Object.entries(FM.worldScout.REGIONS).map(([k, r]) => el('option', { value: k, selected: sc.region === k || null }, r.label)))]),
          sc.region && W.league(sc.region) ? el('small.muted', `${Math.min(99, Math.round(sc.prog / 1.5))}%`) : sc.region ? el('small.muted', 'шукає таланти') : null,
          i ? el('button.btn', { type: 'button', onclick: () => { state.scoutStaff = list.filter((x) => x !== sc); saveGame(); render(); } }, 'Звільнити') : null,
        ]),
      ]))),
      list.length < 5 ? el('div.actions', [el('button.btn', { type: 'button', onclick: () => { const sc = FM.market.hireScout(state, R); FM.market.news(state, `Найнято скаута: ${sc.name}, рівень ${sc.level}.`); saveGame(); render(); } }, 'Найняти скаута')]) : null,
      Object.keys(state.knownLeagues || {}).length ? el('p.note', 'Розвідано ліги: ' + Object.keys(state.knownLeagues).map((l) => W.league(l).name).join(', ') + '.') : null,
    ]);
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
    const f = FM.season.fixturesOfWeek(S, S.week).find((x) => x.h === state.clubId || x.a === state.clubId);
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
          const r = FM.worldScout.sign(W, state, p.id); talentMsg = r.ok ? `${p.name} — ваш гравець! Зарплата ${r.wage} тис. €/тиж., контракт на 5 років.` : r.reason; saveGame(); render();
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
        el('div', [el('b', d.label), el('div.muted', `${x.name} · рівень ${x.level} · ${FM.club.staffWage(role, x.level)} тис. €/тиж.`), el('small.muted', d.hint)]),
        el('button.btn', { type: 'button', onclick: () => { staffPick = staffPick === role ? null : role; render(); } }, staffPick === role ? 'Сховати' : 'Шукати заміну'),
        list ? el('ul.plist.cands', list.map((c) => el('li', [el('span', `${c.name} · рівень ${c.level} · ${c.wage} тис. €/тиж.`),
          el('button.btn', { type: 'button', onclick: () => { staff[role] = { name: c.name, level: c.level }; staffPick = null; officeMsg = `${d.label}: тепер ${c.name}.`; saveGame(); render(); } }, 'Найняти')]))) : null,
      ]);
    });
    const att = Math.round(FM.club.attendance(W, me.id, 0.5) * 100);
    return [
      el('header', [el('h1', 'Клуб'), el('span.muted', `Персонал коштує ${FM.club.staffBill(state)} тис. € на тиждень`)]),
      officeMsg ? el('p.msg-ok', officeMsg) : null,
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
          el('p.note', 'Високі ціни — більше грошей з квитка, але менше людей і гірший настрій. Перемоги вдома радують уболівальників; якщо вони дуже незадоволені, правління нервує.')]),
      ]),
    ];
  }

  // ---------------- Екран «Трансфери» ----------------
  let tf = { role: '', maxAge: 35, maxPrice: 0, league: 'all', sort: 'ca' };
  function screenTransfers() {
    const S = state.season, me = W.club(state.clubId);
    const open = FM.market.windowOpen(S);
    const nw = FM.market.nextWindow(S);
    const offers = (state.offers || []).filter((o) => W.player(o.pid) && W.player(o.pid).club === state.clubId);
    const accept = (o) => {
      const p = W.player(o.pid), buyer = W.club(o.from);
      if (!FM.market.windowOpen(S)) return;
      FM.market.complete(W, state, p, buyer.id, o.fee, FM.market.wageDemand(W, p, buyer.id) || p.wage, 3);
      state.board.fin.transfers = Math.round((state.board.fin.transfers + o.fee) * 100) / 100;
      FM.market.news(state, `Ви продали ${nameOf(p)} у ${clubName(buyer)} за ${M(o.fee)}.`);
      saveGame(); render();
    };
    const reject = (o) => { state.offers = state.offers.filter((x) => x.id !== o.id); saveGame(); render(); };

    let list = [...W.players.values()].filter((p) => !p.retired && p.club !== state.clubId);
    if (tf.league === 'free') list = list.filter((p) => !p.club && p.free);
    else { list = list.filter((p) => p.club); if (tf.league !== 'all') list = list.filter((p) => W.club(p.club).league === tf.league); }
    if (tf.role) list = list.filter((p) => p.roles.includes(tf.role));
    list = list.filter((p) => (W.age(p) ?? 24) <= tf.maxAge);
    if (tf.maxPrice > 0) list = list.filter((p) => (p.club ? FM.market.askingPrice(W, p, S) : 0) <= tf.maxPrice);
    const key = { ca: (p) => -seenCA(p), pa: (p) => -seenPA(p), price: (p) => (p.club ? FM.market.askingPrice(W, p, S) : 0), age: (p) => W.age(p) ?? 99 }[tf.sort];
    list.sort((a, b) => key(a) - key(b));
    const total = list.length;
    list = list.slice(0, 60);

    const sel = (id, label, value, opts, onch) => el('div.field', [el('label', { for: id }, label), el('select', { id, onchange: (e) => { onch(e.target.value); render(); } },
      opts.map(([v, n]) => el('option', { value: v, selected: String(v) === String(value) || null }, n)))]);
    const myDeals = (state.transfers || []).filter((t) => t.to === state.clubId || t.from === state.clubId).slice(-10).reverse();

    return [
      el('header', [el('h1', 'Трансфери'), el('span.muted', open ? 'Трансферне вікно відкрите' : `Вікно закрите · ${nw != null ? `відкриється на ${nw + 1}-му тижні` : 'наступне — влітку'}`)]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Фінанси'), el('dl.facts', [
          el('dt', 'Баланс'), el('dd', M(me.balance)),
          el('dt', 'Зарплати'), el('dd', `${FM.market.wageBill(W, me.id)} тис. € на тиждень`),
          el('dt', 'Гравців'), el('dd', me.players.length),
        ])]),
        el('div.panel', [el('h3', 'Пропозиції за ваших гравців'), offers.length ? el('ul.plist', offers.map((o) => el('li', [
          el('span', [el('a', { href: '#player-' + o.pid }, nameOf(W.player(o.pid))), el('small.muted', ` ← ${clubName(W.club(o.from))}, ${M(o.fee)}`)]),
          el('span.offer-btns', [el('button.btn', { type: 'button', disabled: !open || null, onclick: () => accept(o) }, 'Продати'), el('button.btn', { type: 'button', onclick: () => reject(o) }, 'Ні')]),
        ]))) : el('p.muted', 'Немає. Виставте гравців на трансфер у їхніх картках, щоб привернути покупців.')]),
      ]),
      el('div.panel', [el('h3', 'Пошук гравців'),
        el('div.filters', [
          sel('f-league', 'Ліга', tf.league, [['all', 'Усі ліги'], ...W.db.leagues.map((l) => [l.id, l.name]), ['free', 'Вільні агенти']], (v) => { tf.league = v; }),
          sel('f-role', 'Позиція', tf.role, [['', 'Будь-яка'], ...['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'].map((r) => [r, FM.ROLE_NAME[r]])], (v) => { tf.role = v; }),
          sel('f-age', 'Вік до', tf.maxAge, [[21, 21], [23, 23], [25, 25], [28, 28], [31, 31], [35, 'будь-який']], (v) => { tf.maxAge = Number(v); }),
          sel('f-price', 'Ціна до', tf.maxPrice, [[0, 'будь-яка'], [1, '€1 млн'], [3, '€3 млн'], [10, '€10 млн'], [25, '€25 млн'], [60, '€60 млн']], (v) => { tf.maxPrice = Number(v); }),
          sel('f-sort', 'Сортувати', tf.sort, [['ca', 'за рівнем'], ['pa', 'за потенціалом'], ['price', 'за ціною'], ['age', 'за віком']], (v) => { tf.sort = v; }),
        ]),
        el('p.muted', `Знайдено ${total}${total > 60 ? ', показано 60' : ''}. Рівень гравців з інших ліг — оцінка скаутів.`),
        el('div.table-wrap.flat', el('table', [
          el('thead', el('tr', [el('th', 'Гравець'), el('th', 'Клуб'), el('th', 'Поз.'), el('th.num', 'Вік'), el('th', 'Рівень'), el('th', 'Потенціал'), el('th.num', 'Ціна'), el('th.num', 'Контракт')])),
          el('tbody', list.map((p) => el('tr.row-link', { onclick: () => go('player-' + p.id) }, [
            el('td.name', [nameOf(p), known(p) ? '' : el('small.muted', ' ≈')]),
            el('td', p.club ? clubName(W.club(p.club)) : 'вільний'),
            el('td.pos.line-' + FM.ROLE_LINE[p.roles[0]], FM.roleLabel(p.roles[0], p.side)),
            el('td.num', W.age(p) ?? '—'), el('td', starsEl(seenCA(p), 'Рівень')), el('td', starsEl(seenPA(p), 'Потенціал')),
            el('td.num', p.club ? M(FM.market.askingPrice(W, p, S)) : '—'), el('td.num', p.contract && p.club ? p.contract : '—'),
          ]))),
        ])),
      ]),
      shortlistPanel(),
      scoutsPanel(),
      talentsPanel(),
      (() => { const out = [...W.players.values()].filter((x) => x.loan && x.loan.from === state.clubId);
        return out.length ? el('div.panel', [el('h3', 'Ваші гравці в оренді'), el('ul.plist', out.map((x) => el('li', [el('a', { href: '#player-' + x.id }, nameOf(x)),
          el('span.muted', `${clubName(W.club(x.club))} · ${(S.ps[x.id] || [0])[0]} ігор`)])))]) : null; })(),
      el('div.panel', [el('h3', 'Ваші угоди'), myDeals.length ? el('ul.plist', myDeals.map((t) => el('li', [
        el('span', [el('a', { href: '#player-' + t.p }, nameOf(W.player(t.p))), el('small.muted', ` ${t.to === state.clubId ? '← ' + (t.from ? clubName(W.club(t.from)) : 'вільний агент') : '→ ' + clubName(W.club(t.to))}`)]),
        el('b', t.fee ? M(t.fee) : 'безкоштовно')]))) : el('p.muted', 'Поки що жодної.')]),
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
      el('div.table-wrap', el('table', [
        el('thead', el('tr', [el('th', '#'), el('th', 'Клуб'), el('th', 'Тренер'), el('th', 'Стадіон'), el('th.num', 'Місткість'), el('th', 'Рівень'), el('th.num', 'Гравців')])),
        el('tbody', list.map(({ c, lvl, n }, i) => el('tr.row-link', { onclick: () => go(c.id === state.clubId ? 'squad' : 'club-' + c.id) }, [
          el('td.num', i + 1),
          el('td.name', el('span', { style: { display: 'inline-flex', gap: '0.5rem', alignItems: 'center' } }, [badge(c), clubName(c)])),
          el('td', c.id === state.clubId ? state.manager : c.manager ? `${c.manager.name} (${FM.club.STYLES[c.manager.style].label})` : '—'),
          el('td', c.stadium || '—'), el('td.num', fmt.int(c.capacity)), el('td', starsEl(lvl, 'Рівень клубу')), el('td.num', n),
        ]))),
      ])),
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
  const TUK = FM.match.TACTIC_UK;
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
  const USER = () => ({ clubId: state.clubId, tactics: myTactics(), familiarity: familiarity(), boost: FM.dressing.matchBoost(state), reserve: FM.youth.set(state) });

  function mySide() {
    const t = myTactics();
    const players = availablePlayers(state.clubId);
    const lineup = FM.lineupFromIds(players, t.formation, t.ids, t);
    return { club: W.club(state.clubId), players, formation: t.formation, lineup, units: FM.lineupUnits(lineup),
      mentality: t.mentality, pressing: t.pressing, passing: t.passing, takers: t.takers, familiarity: Math.min(1, (familiarity()[t.formation] || 0) / 100) };
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

  function segmented(group, value, onPick) {
    return el('div.tabs', { role: 'group' }, Object.keys(TUK[group]).map((k) => el('button', {
      type: 'button', 'aria-pressed': String(k === value), onclick: () => onPick(k),
    }, TUK[group][k][0].toUpperCase() + TUK[group][k].slice(1))));
  }

  const TACTIC_HELP = {
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
      const options = [...avail].sort((a, b) => FM.slotValue(b, x.slot) - FM.slotValue(a, x.slot));
      const sel = el('select', {
        id: 'slot-' + i, 'aria-label': `Гравець на позиції ${ROLE_SHORT(x.slot)}`,
        onchange: (e) => {
          const id = e.target.value;
          const ids = side.lineup.xi.map((y) => y.player.id);
          const j = ids.indexOf(id);
          if (j >= 0) ids[j] = ids[i]; // гравець уже в складі — міняємо місцями
          ids[i] = id;
          t.ids = ids; save();
        },
      }, options.map((p) => el('option', { value: p.id, selected: p.id === x.player.id || null },
        `${nameOf(p)} · ${f1(FM.slotValue(p, x.slot))}${(p.fitness ?? 100) < 85 ? ` · ${Math.round(p.fitness)}%` : ''}${side.lineup.xi.some((y) => y.player.id === p.id) && p.id !== x.player.id ? ' (у складі)' : ''}`)));
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
        el('div.slot-main', [roleSel, sel, el('span.fitdot.' + fitClass(fv), { title: fv >= 0.97 ? 'Рідна позиція' : fv >= 0.85 ? 'Може зіграти' : 'Не його позиція' })]),
        el('div.slot-extra', [varSel, insSel]),
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
      el('div.tactics-grid', [
        el('div.panel', [pitch(side.lineup, t.takers.captain),
          el('div.legend', [el('span', [el('i.fit-ok'), 'рідна позиція']), el('span', [el('i.fit-mid'), 'може зіграти']), el('span', [el('i.fit-bad'), 'не його позиція'])])]),
        el('div.panel', [
          el('h3', 'Склад, ролі й інструкції'),
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
      ]), el('p.note', 'Якщо призначеного немає на полі, б’є найкращий за атрибутами. Ролі й інструкції змінюють, хто частіше б’є, віддає й наскільки гравець допомагає в атаці чи обороні.')]),
      el('div.panel', [
        el('h3', 'Командні інструкції'),
        el('div.instr', ['mentality', 'pressing', 'passing'].map((g) => el('div.field', [
          el('b', { mentality: 'Ментальність', pressing: 'Пресинг', passing: 'Передачі' }[g]),
          segmented(g, t[g], (v) => { t[g] = v; save(); }),
          el('small.muted', TACTIC_HELP[g]),
        ]))),
      ]),
      tipsPanel(8),
      el('div.panel', [el('h3', 'Сила ліній'), compareBarsSingle([['Атака', side.units.att], ['Контроль м’яча', side.units.mid], ['Оборона', side.units.def], ['Воротар', side.units.gk]])]),
    ];
  }

  /** Поради асистента: що варто виправити перед наступним матчем. */
  function assistantTips() {
    const tips = [];
    const t = myTactics(), side = mySide();
    for (const x of side.lineup.xi) {
      const f = FM.fit(x.player, x.slot);
      if (f < 0.85) tips.push(['bad', `${nameOf(x.player)} грає не на своїй позиції (${ROLE_SHORT(x.slot)}). Знайдіть когось кращого або змініть роль.`]);
      if ((x.player.fitness ?? 100) < 72) tips.push(['warn', `${nameOf(x.player)} втомлений (${Math.round(x.player.fitness)}%). Варто дати відпочити.`]);
      if (x.auto) tips.push(['warn', `На позиції ${ROLE_SHORT(x.slot)} обраний гравець недоступний — помічник поставив ${nameOf(x.player)}.`]);
    }
    const fam = familiarity()[t.formation] || 0;
    if (fam < 60) tips.push(['warn', `Команда погано знає схему ${t.formation} (${Math.round(fam)}%). Тренування «Підготовка до матчу» допоможе.`]);
    const sq = W.squad(state.clubId);
    const unhappy = sq.filter((p) => FM.morale.get(p) < 30);
    if (unhappy.length) tips.push(['warn', `Незадоволені: ${unhappy.slice(0, 3).map(nameOf).join(', ')}${unhappy.length > 3 ? ' та інші' : ''}. Причини — у картках гравців.`]);
    const S = state.season;
    const expiring = sq.filter((p) => (p.contract || 9999) <= S.year + 1 && FM.morale.status(W, p) === 'key');
    if (expiring.length) tips.push(['warn', `Контракти лідерів закінчуються цього сезону: ${expiring.map(nameOf).join(', ')}.`]);
    const talents = sq.filter((p) => (W.age(p) ?? 30) <= 20 && p.pa - p.ca >= 30 && !(S.ps[p.id] && S.ps[p.id][0] >= 3) && S.week >= 10);
    if (talents.length) tips.push(['info', `Талановитій молоді бракує ігор: ${talents.slice(0, 3).map(nameOf).join(', ')}. Без ігрового часу ростуть повільніше — можна віддати в оренду.`]);
    const me = W.club(state.clubId);
    if (me.wageBudget && FM.market.wageBill(W, me.id) > me.wageBudget * 0.97) tips.push(['info', 'Фонд зарплат майже вичерпано: нові контракти правління не погодить.']);
    if (sq.filter((p) => p.roles[0] === 'GK' && !p.injury).length < 2) tips.push(['bad', 'У команди лише один здоровий воротар.']);
    return tips;
  }
  function tipsPanel(limit = 5) {
    const tips = assistantTips();
    return el('div.panel', [el('h3', 'Поради асистента'), tips.length ? el('ul.tips', tips.slice(0, limit).map(([k, txt]) => el('li.tip-' + k, txt))) : el('p.muted', 'Усе гаразд — можна грати.')]);
  }

  function compareBarsSingle(rows) {
    const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    return el('div.compare', rows.map(([label, v]) => el('div.crow.single', [el('div', [el('small', label), el('div.cbar', el('span.ch', { style: { width: (v / 20 * 100) + '%' } }))]), el('b', f1(v))])));
  }

  // ---------------- Матч ----------------
  let pre = null; // налаштування товариського матчу
  let liveTimer = null;
  let liveSpeed = 1;
  let activeLive = null; // поточна трансляція: якщо піти з неї — матч догравається й записується
  const SPEEDS = [[1, 'Звичайно'], [4, 'Швидко']];

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
      mentality: side.mentality, pressing: side.pressing, passing: side.passing, takers: side.takers, familiarity: side.familiarity, manual };
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

  function showLive(active, hs, as, M, myK, onFinish, actions) {
    app.replaceChildren(shell(active, liveView(hs, as, M, myK, onFinish, actions)));
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
    const keyEv = m.events.filter((e) => ['goal', 'red', 'injury', 'miss'].includes(e.type));
    const statRow = (r) => el('tr', [el('td', [el('a', { href: '#player-' + r.id }, nameOf(r.player)), el('small.muted', ` ${FM.roleLabel(r.role, r.slot && r.slot.side)}`)]),
      el('td.num', String(r.rating).replace('.', ',')), el('td.num', r.st.min), el('td.num', r.goals || ''), el('td.num', r.assists || ''), el('td.num', r.st.shots || ''),
      el('td.num', r.st.keyPasses || ''), el('td.num', r.st.passes ? `${r.st.passOk}/${r.st.passes}` : ''), el('td.num', r.st.tackles || ''), el('td.num', r.st.interceptions || ''),
      el('td.num', r.st.dribbles || ''), el('td.num', r.role === 'GK' ? r.st.saves : r.st.blocks || '')]);
    const statTable = (k, club) => el('div.table-wrap', el('table.mstats', [
      el('caption', clubName(club)),
      el('thead', el('tr', ['Гравець', 'Оц.', 'Хв', 'Г', 'П', 'Уд', 'Кл. п.', 'Передачі', 'Відб.', 'Перех.', 'Дриб.', 'Блок/сейв'].map((h, i) => el(i ? 'th.num' : 'th', h)))),
      el('tbody', m.ratings.filter((r) => r.team === k && r.st).map(statRow)),
    ]));
    return el('div', [el('div.grid', [
      el('div.panel', [el('h3', 'Карта ударів'), map, el('div.legend', [el('span', [el('i', { style: { background: 'var(--accent)' } }), clubName(hs.club)]), el('span', [el('i', { style: { background: 'var(--warn)' } }), clubName(as.club)]), el('span', 'коло більше — момент кращий; заповнене — гол')])]),
      el('div.panel', [el('h3', 'Очікувані голи (xG) за матч'), chart, el('p.muted', `${clubName(hs.club)} ${f2(L0.acc)} · ${clubName(as.club)} ${f2(L1.acc)} · вертикальна лінія — перерва${m.weather ? ' · погода: ' + FM.WEATHER[m.weather].label.toLowerCase() : ''}`)]),
      el('div.panel', [el('h3', 'Середні позиції й активність'), posMap, el('p.muted', 'Більше коло — більше дій (передачі, відбори, дриблінг, удари). Наведіть на коло, щоб побачити гравця.')]),
      el('div.panel', [el('h3', 'Ключові моменти'), keyEv.length ? el('ol.feed.compact', keyEv.map((e) => el('li.ev-' + e.type, [el('b', e.min + '′ '), e.text]))) : el('p.muted', 'Без яскравих моментів.'),
        el('dl.facts', [el('dt', 'Передачі (точність)'), el('dd', `${m.stats[0].passes} (${m.stats[0].passPct}%) — ${m.stats[1].passes} (${m.stats[1].passPct}%)`),
          el('dt', 'Відбори'), el('dd', `${m.stats[0].tackles} — ${m.stats[1].tackles}`)])]),
    ]), el('div.panel', [el('h3', 'Статистика гравців'), statTable(0, hs.club), statTable(1, as.club),
      el('p.note', 'Г — голи, П — гольові передачі, Уд — удари, Кл. п. — ключові передачі (з яких був удар), Відб. — відбори, Перех. — перехоплення, Дриб. — успішний дриблінг.')])]);
  }

  /**
   * Трансляція з керуванням. M — покроковий матч (FM.match.create), myK — 0/1 (наша команда) або null.
   * onFinish(результат) викликається рівно один раз — і коли дограли, і коли пішли з екрана посеред матчу.
   */
  function liveView(hs, as, M, myK, onFinish, actions) {
    const scoreEl = el('div.sb-score', '0:0');
    const clock = el('div.sb-clock', '0′');
    const feed = el('ol.feed', { 'aria-live': 'polite' });
    const after = el('div.after');
    const speedBtns = el('div.tabs');
    const statsBox = el('div');
    const control = el('div.panel.control');
    // міні-поле: м'яч біля воріт того, хто атакує (господарі атакують праворуч)
    const ball = el('i.ball');
    const dots = el('div.mp-dots');
    const miniPitch = el('div.mini-pitch', { 'aria-hidden': 'true' }, [el('span.mp-half'), el('span.mp-box.l'), el('span.mp-box.r'), dots, ball]);
    // гравці: позиції зі схеми, обидві команди зсуваються за м'ячем
    const drawDots = () => {
      const shift = (ballX - 50) * 0.35;
      const list = [];
      M.sides.forEach((t, k) => {
        const live = t.onPitch.filter((x) => !x.out);
        const xy = layoutXY(live.map((x) => x.slot));
        const c = k === 0 ? hs.club : as.club;
        live.forEach((x, i) => {
          const depth = 100 - xy[i][1]; // 0 — свої ворота, 100 — чужі
          let hx = 6 + depth * 0.88; if (k === 1) hx = 100 - hx;
          const d = el('i.dot2', { title: nameOf(x.p) });
          d.style.left = Math.max(2, Math.min(98, hx + shift)) + '%'; d.style.top = (k === 0 ? xy[i][0] : 100 - xy[i][0]) + '%';
          d.style.background = c.colors[0]; d.style.borderColor = c.colors[1] || '#000';
          list.push(d);
        });
      });
      dots.replaceChildren(...list);
    };
    let ballX = 50, ballY = 50, bt = 0;
    const moveBall = (x, y) => { ballX = x; ballY = y; ball.style.left = x + '%'; ball.style.top = y + '%'; };
    let shown = 0, paused = false, finished = false, hold = 0, acc = 0, talkAsked = false, talkMsg = null;
    const MS_PER_MIN = 260, TICK = 100;
    const pct = (v) => v + '%';
    const f2 = (v) => String(v).replace('.', ',');

    const drawSpeed = () => speedBtns.replaceChildren(
      el('button', { type: 'button', disabled: finished || null, 'aria-pressed': String(paused), onclick: () => { paused = !paused; drawSpeed(); drawControl(); } }, paused ? 'Продовжити' : 'Пауза'),
      ...SPEEDS.map(([v, label]) => el('button', { type: 'button', 'aria-pressed': String(!paused && liveSpeed === v), disabled: finished || null,
        onclick: () => { liveSpeed = v; paused = false; drawSpeed(); } }, label)),
      el('button', { type: 'button', disabled: finished || null, onclick: () => { M.result(); flush(); finish(); } }, 'Одразу результат'),
    );

    function flush() {
      while (shown < M.events.length) {
        const e = M.events[shown++];
        const team = e.team == null ? null : e.team === 0 ? hs.club : as.club;
        feed.prepend(el('li.ev.ev-' + e.type + (myK != null && e.team === myK ? '.ours' : ''), [el('span.min', e.min + '′'), team ? badge(team) : el('span.dot'), el('span', e.text)]));
        scoreEl.textContent = e.score.join(':');
        if (e.type === 'goal') hold = 1800;
        if (e.type === 'half' && String(e.min).startsWith('45')) hold = 1200;
      }
      const s = M.liveStats();
      const lastEv = M.events[M.events.length - 1];
      if (lastEv && lastEv !== moveBall.last) {
        moveBall.last = lastEv;
        const atk = lastEv.team === 0 ? 1 : -1;
        if (lastEv.type === 'goal') moveBall(50 + atk * 48, 50);
        else if (lastEv.type === 'chance' || lastEv.type === 'miss') moveBall(50 + atk * (36 + (bt++ % 3) * 3), 30 + ((bt * 37) % 40));
        else if (lastEv.type === 'half' || lastEv.type === 'kickoff' || lastEv.type === 'full') moveBall(50, 50);
        else moveBall(50 + (s[0].poss - 50) * 0.7 + ((bt++ * 17) % 21) - 10, 25 + ((bt * 29) % 50));
      } else if (!finished) moveBall(Math.max(8, Math.min(92, ballX + ((bt++ * 13) % 15) - 7 + (s[0].poss - 50) * 0.05)), Math.max(12, Math.min(88, ballY + ((bt * 11) % 13) - 6)));
      drawDots();
      statsBox.replaceChildren(compareBars([
        ['Володіння', s[0].poss, s[1].poss, pct], ['Удари', s[0].shots, s[1].shots], ['У площину', s[0].onTarget, s[1].onTarget], ['xG', s[0].xg, s[1].xg, f2],
      ]));
    }

    function drawControl() {
      if (myK == null || finished) { control.hidden = true; return; }
      control.hidden = false;
      const t = M.sides[myK];
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
          const e = M.halftimeTalk(myK, k, state ? 0.7 + FM.career.attr(state, 'mot') * 0.03 : 1); talkMsg = e ? e.text : null; flush(); paused = false; drawSpeed(); drawControl();
        } }, d.label))),
        el('small.muted', 'Наведіть на варіант, щоб побачити, коли він доречний.'),
      ]) : talkMsg ? el('p.msg-ok', talkMsg) : null;
      const sets = state && myK != null ? TSETS.filter((k) => (state.tacticSets || {})[k] || k === (state.tacticKey || 'A')) : [];
      const setBtns = sets.length > 1 ? el('div.field', [el('b', 'Тактика'), el('div.tabs', sets.map((k) => el('button', { type: 'button', 'aria-pressed': String(t.setKey === k || (!t.setKey && k === (state.tacticKey || 'A'))), onclick: () => {
        const ts = (state.tacticSets || {})[k] || state.tactics;
        M.setShape(myK, ts.formation, { ...ts, familiarity: Math.min(1, (familiarity()[ts.formation] || 0) / 100) });
        t.setKey = k; flush(); drawControl();
      } }, `${TSET_UK[k]} · ${((state.tacticSets || {})[k] || state.tactics).formation}`)))]) : null;
      control.replaceChildren(
        el('h3', paused ? 'Пауза — рішення тренера' : 'Рішення тренера'),
        talk,
        setBtns,
        el('div.instr', ['mentality', 'pressing', 'passing'].map((g) => el('div.field', [
          el('b', { mentality: 'Ментальність', pressing: 'Пресинг', passing: 'Передачі' }[g]),
          segmented(g, tac[g], (v) => { M.setTactics(myK, { [g]: v }); flush(); drawControl(); }),
        ]))),
        el('div.subs', [
          el('b', `Заміни (лишилось ${t.subsLeft} з 5)`),
          t.subsLeft > 0 && t.bench.length ? el('div.pre-row', [
            el('div.field', [el('label', { for: 'sub-out' }, 'З поля'), outSel]),
            el('div.field', [el('label', { for: 'sub-in' }, 'На поле'), inSel]),
            el('button.btn', { type: 'button', onclick: () => { if (M.sub(myK, outSel.value, inSel.value)) { flush(); drawControl(); } } }, 'Замінити'),
          ]) : el('p.muted', 'Замін більше немає.'),
          el('label.check', [el('input', { type: 'checkbox', checked: t.autoSubs || null, onchange: (e) => { t.autoSubs = e.target.checked; } }), ' Заміни на розсуд помічника']),
        ]),
        el('ul.fitness', live.map((x) => el('li', [
          el('span.pos.line-' + FM.ROLE_LINE[x.slot.role], ROLE_SHORT(x.slot)),
          el('span.fn', nameOf(x.p) + (x.yellow ? ' ▮' : '')),
          el('span.cond', el('i', { style: { width: Math.round(x.cond) + '%' }, class: x.cond < 65 ? 'low' : '' })),
        ]))),
      );
    }

    function tick() {
      if (finished) return;
      if (!paused) {
        if (hold > 0) hold -= TICK * liveSpeed;
        else {
          acc += (TICK / MS_PER_MIN) * liveSpeed;
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
            clock.textContent = ht ? 'Перерва' : m + '′';
            if (myK != null && M.minuteNum % 5 === 0) drawControl();
          }
          if (M.done) return finish();
        }
      }
      liveTimer = setTimeout(tick, TICK);
    }

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(liveTimer);
      activeLive = null;
      const m = M.result();
      flush();
      clock.textContent = 'Кінець';
      onFinish(m);
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
      after.replaceChildren(
        el('div.panel', [el('h3', 'Статистика'), compareBars([
          ['Володіння', sh.poss, sa.poss, pct], ['Удари', sh.shots, sa.shots], ['У площину воріт', sh.onTarget, sa.onTarget],
          ['Очікувані голи (xG)', sh.xg, sa.xg, f2], ['Жовті картки', sh.yellow, sa.yellow], ['Червоні картки', sh.red, sa.red],
        ]), el('p', ['Найкращий гравець матчу: ', el('b', nameOf(m.motm.player)), ` (${clubName(m.motm.team === 0 ? hs.club : as.club)}, ${f2(m.motm.rating)})`])]),
        matchSummary(m, hs, as),
        el('div.grid', [ratingTable(0, hs.club), ratingTable(1, as.club)]),
        el('div.actions', actions.map(([label, fn, primary]) => el('button.btn' + (primary ? '.primary' : ''), { type: 'button', onclick: fn }, label))),
      );
    }

    activeLive = { finish: () => { M.result(); finish(); } };
    drawSpeed(); drawControl(); flush();
    liveTimer = setTimeout(tick, 300);
    return [
      el('div.scoreboard', [
        el('div.sb-team', [badge(hs.club, true), el('b', clubName(hs.club))]),
        el('div.sb-mid', [scoreEl, clock, M.weather ? el('div.sb-weather', FM.WEATHER[M.weather].label) : null]),
        el('div.sb-team.away', [badge(as.club, true), el('b', clubName(as.club))]),
      ]),
      el('div.live-controls', speedBtns),
      el('div.live-grid', [
        el('div.panel.feed-wrap', feed),
        el('div.live-side', [el('div.panel', [el('h3', 'Статистика наживо'), miniPitch, statsBox]), control]),
      ]),
      after,
    ];
  }

  // ---------------- Сезон ----------------
  const RESULT = (f, clubId) => {
    if (!f.s) return null;
    const [g1, g2] = f.h === clubId ? f.s : [f.s[1], f.s[0]];
    return g1 > g2 ? 'W' : g1 < g2 ? 'L' : 'D';
  };
  const RESULT_UK = { W: 'В', D: 'Н', L: 'П' };
  const formEl = (form) => el('span.form', form.map((r) => el('span.fr.fr-' + r, { title: { W: 'Перемога', D: 'Нічия', L: 'Поразка' }[r] }, RESULT_UK[r])));
  const roundOf = (f) => f.w + 1;

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

  function playMyMatch(live) {
    const S = state.season;
    const f = FM.season.fixturesOfWeek(S, S.week).find((x) => x.h === state.clubId || x.a === state.clubId);
    cupsWeek();
    // кубкову пару, яку не зіграли наживо, грає помічник
    const pend = FM.cups.pendingTie(state, state.clubId);
    if (pend) {
      const { opts } = FM.season.prepare(S, W, pend.f, NAMES, USER());
      if (pend.neutral) opts.neutral = true;
      cupNews(FM.cups.finishPending(W, state, pend, FM.match.play(opts)));
      cupsWeek();
    }
    if (!f || !live) {
      FM.season.playWeek(S, W, { name: NAMES, user: USER(), dev: devOpts() });
      FM.market.weekly(W, state);
      boardWeek();
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
      FM.season.advance(S, W);
      FM.dev.weekly(W, S, devOpts());
      FM.market.weekly(W, state);
      boardWeek();
      saveGame();
    }, [['Далі', () => go(state.sacked ? 'sacked' : 'fixtures'), true], ['Таблиця', () => go('table')]]);
  }

  /** Новина про кубковий матч вашого клубу + запис у статистику тренера. */
  function cupNews(e) {
    const tail = e.winner ? (e.winner === state.clubId ? ' — ви йдете далі!' : ' — виліт.') : '';
    FM.market.news(state, `${e.cupName}, ${e.round.toLowerCase()}: ${clubName(W.club(e.h))} ${e.score.join(':')} ${clubName(W.club(e.a))}${e.pens ? ' (пенальті)' : ''}${tail}`);
    const home = e.h === state.clubId;
    for (const t of FM.career.match(W, state, home ? e.score : [e.score[1], e.score[0]], home ? e.a : e.h, e.cup)) FM.market.news(state, t);
  }

  /** Кубкові матчі тижня (посеред тижня, грає помічник за вашою тактикою). */
  function cupsWeek() {
    for (const r of FM.cups.playWeek(W, state, { name: NAMES, user: USER(), gen: genOf, skipClub: state.clubId })) {
      if (r.mine) cupNews(r);
    }
    for (const cup of Object.values(state.cups)) if (cup.winner && !cup.announced) {
      cup.announced = true;
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

  let pressMsg = null;
  function pressPanel() {
    const key = `${state.season.year}-${state.season.week}`;
    if (state.pressDone === key) return pressMsg ? el('p.msg-ok', pressMsg) : null;
    const q = FM.morale.pressQuestion(state.season);
    return el('div.press', [el('b', 'Прес-конференція'), el('p', q.q), el('div.press-opts', q.a.map(([text], i) => el('button.btn', { type: 'button', onclick: () => {
      const e = FM.morale.answerPress(W, state, i);
      pressMsg = e.morale > 0.9 ? 'Гравцям сподобалися ваші слова.' : e.morale < 0 ? 'Дехто в роздягальні сприйняв ваші слова болісно.' : 'Відповідь сприйняли спокійно.';
      if (e.conf > 0) pressMsg += ' Правління оцінило вашу вимогливість.'; else if (e.conf < 0) pressMsg += ' Правлінню відповідь не сподобалася.';
      saveGame(); render();
    } }, text))), el('small.muted', 'Можна не відповідати — тоді все лишиться як є.')]);
  }

  function boardWeek() {
    const S = state.season;
    // вболівальники, будівництво, лікар, тренери ШІ
    const res = {};
    for (const f of FM.season.fixturesOfWeek(S, S.week - 1)) if (f.s) { res[f.h] = Math.sign(f.s[0] - f.s[1]); res[f.a] = Math.sign(f.s[1] - f.s[0]); }
    FM.club.fansWeek(W, state, res);
    const built = FM.club.buildWeek(W, state);
    if (built) FM.market.news(state, `Завершено: ${FM.club.UPGRADES[built].label.toLowerCase()}.`);
    const R = FM.rng(`physio-${S.seed}-${S.week}`);
    for (const p of W.squad(state.clubId)) if (p.injury > 0 && R.chance(FM.club.lvl(state, 'physio') / 40)) { p.injury--; if (p.injury <= 0) delete p.injury; }
    for (const e of FM.club.managersWeek(W, state)) {
      if (e.club.league === W.club(state.clubId).league || W.clubLevel(e.club.id) > 140) FM.market.news(state, `${clubName(e.club)} звільнив тренера ${e.old}. Новий тренер — ${e.now}.`);
    }
    // міжнародне вікно: збірні грають, гравці повертаються втомленими
    if (FM.nations && FM.nations.WINDOWS.includes(S.week)) {
      for (const { fx, m } of FM.nations.weekly(W, state, { name: (p) => nameOf(p) })) {
        const sc = fx.home ? m.score : [m.score[1], m.score[0]];
        const mine = m.ratings.filter((r) => r.player.club === state.clubId && r.team === (fx.home ? 0 : 1)).map((r) => nameOf(r.player));
        FM.market.news(state, `Збірна України: ${fx.home ? 'вдома' : 'на виїзді'} з ${FM.countries.name(fx.opp)} — ${sc.join(':')}.${mine.length ? ' Від вашого клубу грали: ' + mine.join(', ') + '.' : ''}`);
      }
    }
    const myF = FM.season.fixturesOfWeek(S, S.week - 1).find((f) => f.s && (f.h === state.clubId || f.a === state.clubId));
    if (myF) { const home = myF.h === state.clubId; for (const t of FM.career.match(W, state, home ? myF.s : [myF.s[1], myF.s[0]], home ? myF.a : myF.h, 'league')) FM.market.news(state, t); }
    for (const t of FM.career.weekly(W, state)) FM.market.news(state, t);
    for (const t of FM.worldScout.week(W, state)) FM.market.news(state, t, 'transfers');
    for (const t of FM.agents.week(W, state)) FM.market.news(state, t, 'players');
    const yr = FM.youth.week(W, state);
    if (yr && (yr.score[0] - yr.score[1] >= 3 || yr.score[1] - yr.score[0] >= 3)) FM.market.news(state, `U-21: ${yr.score[0] > yr.score[1] ? 'розгром' : 'важка поразка'} — ${yr.score.join(':')} проти U-21 ${clubName(W.club(yr.opp))}.`, 'club');
    familiarityWeek(FM.season.fixturesOfWeek(S, S.week - 1).some((f) => f.h === state.clubId || f.a === state.clubId));
    for (const e of FM.morale.weekly(W, state)) FM.market.news(state, e.text);
    const r = FM.board.weekly(W, state);
    if (r.fired) state.sacked = { reason: r.reason, offers: FM.board.jobOffers(W, state, 3, 'sack') };
  }

  function training() {
    if (!state.training) state.training = { focus: 'balanced', intensity: 'normal', individual: {} };
    if (!state.training.plan) state.training.plan = 'balanced';
    return state.training;
  }
  const devOpts = () => ({ training: training(), myClub: state.clubId,
    recovery: FM.dev.PLANS[training().plan || 'balanced'].recovery + (FM.club.lvl(state, 'fitness') - 10) * 0.4,
    growthMult: (p) => FM.club.growthMult(state, W, p) * ((W.age(p) ?? 24) <= 21 ? 1 + (FM.career.attr(state, 'youth') - 10) * 0.015 : 1) * FM.youth.growth(state, p), injuryMult: 1.2 - FM.club.lvl(state, 'fitness') * 0.02 });
  /** Після тижня: знайомство зі схемою росте від матчів і підготовки, без практики — забувається. */
  function familiarityWeek(played) {
    const fam = familiarity(), cur = myTactics().formation;
    const plan = FM.dev.PLANS[training().plan || 'balanced'];
    for (const f of Object.keys(fam)) {
      if (f === cur) fam[f] = Math.min(100, fam[f] + (played ? 8 : 0) + plan.fam + (FM.club.lvl(state, 'assistant') - 10) * 0.3 + (FM.career.attr(state, 'tac') - 10) * 0.3);
      else fam[f] = Math.max(20, fam[f] - 1);
    }
  }

  /** Завершити сезон і почати наступний: історія, завершення кар'єри, юнаки, новий календар. */
  function startNextSeason() {
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
    if (trophies.length) { state.board.rep = Math.min(100, state.board.rep + 5 * trophies.length); state.board.conf = Math.min(100, state.board.conf + 10); }
    state.youthBonus = (FM.club.lvl(state, 'youth') - 10) + (FM.club.facilities(W, state.clubId).youth - 10) * 0.8;
    const contracts = FM.market.endSeason(W, state);
    const rep = FM.dev.endSeason(W, state);
    state.lastReport = {
      year: S.year,
      myRetired: rep.retired.filter((p) => p.lastClub === state.clubId).map((p) => p.id),
      youth: rep.youth.filter((p) => p.club === state.clubId).map((p) => p.id),
      stars: [...rep.retired].sort((a, b) => b.ca - a.ca).slice(0, 8).map((p) => p.id),
      expired: contracts.expired.filter((p) => p.lastClub === state.clubId).map((p) => p.id),
      awards: awards[my.league], league: my.league, golden: (rep.golden || []).includes(state.clubId),
    };
    FM.youth.intake(W, state, state.lastReport.youth); // вихованці академії — у молодіжну команду
    state.u21Stats = {}; state.u21Results = [];
    hist.cups = cupWinners;
    hist.awards = awards;
    hist.trophies = trophies.concat(champions[my.league] === my.id ? ['league'] : []);
    // підвищення й пониження між дивізіонами
    const moves = FM.season.promote(W, S);
    for (const m of moves) {
      const c = W.club(m.club);
      c.income0 = Math.round(c.income0 * (m.up ? 1.4 : 0.72) * 100) / 100;
      if (m.club === state.clubId) FM.market.news(state, m.up ? `Вітаємо! ${clubName(c)} виходить до ліги «${W.league(m.to).name}».` : `${clubName(c)} вилітає до ліги «${W.league(m.to).name}».`);
    }
    state.lastReport.moves = moves.filter((m) => m.from === state.lastReport.league || m.to === state.lastReport.league || m.club === state.clubId);
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
    }
    // турнір збірних улітку
    if (FM.nations) {
      const tour = FM.nations.tournament(W, S.year + 1, S.seed);
      if (tour) { state.lastReport.tour = tour; (state.intl = state.intl || {}).tours = ((state.intl && state.intl.tours) || []).concat([{ name: tour.name, winner: tour.winner, ukr: tour.ukr }]); }
    }
    FM.dev.newSeason(W, state);
    FM.market.init(W, state);
    FM.club.init(W, state);
    for (const c of W.clubs.values()) delete c.vacancy;
    state.cups = FM.cups.createAll(W, state.season, tables);
    FM.cups.payParticipation(W, state);
    coachMsg = null;
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
      R.tour ? el('div.panel', [el('h3', R.tour.name), el('p', `Переможець — ${FM.countries.name(R.tour.winner)}${R.tour.final ? ` (фінал ${FM.countries.name(R.tour.final.a)} — ${FM.countries.name(R.tour.final.b)} ${R.tour.final.score.join(':')})` : ''}.`),
        el('p.muted', `Україна: ${R.tour.ukr || 'не кваліфікувалася'}.`)]) : null,
      R.verdict ? el('div.panel', [el('h3', 'Оцінка правління'), el('p', R.verdict), R.prize ? el('p.muted', `Призові за місце й кубки: ${FM.market.fmtM(R.prize)}`) : null,
        (state.jobOffers || []).length ? el('p', ['Вами цікавляться інші клуби — див. ', el('a', { href: '#board' }, 'Правління'), '.']) : null]) : null,
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
    const order = ['ucl', 'uel', ...Object.keys(cups).filter((k) => k !== 'ucl' && k !== 'uel')];
    const tieRow = (t, r) => {
      const legs = t.legs.map((x) => x.join(':')).join(', ');
      const ga = t.legs.reduce((s, x) => s + x[0], 0), gb = t.legs.reduce((s, x) => s + x[1], 0);
      const cls = (t.a === state.clubId || t.b === state.clubId) ? '.mine' : '';
      const side = (id) => el('td' + (t.winner === id ? '.win' : ''), [badge(W.club(id)), ' ', clubName(W.club(id))]);
      return el('tr' + cls, [side(t.a), el('td.score', t.legs.length ? `${ga} : ${gb}` : '–'), side(t.b),
        el('td.muted', [r.weeks.length > 1 && t.legs.length ? `(${legs})` : '', t.pens ? ' пен.' : '', !t.legs.length ? fmt.date(FM.season.dateOf(r.weeks[0], state.season)).slice(0, 5) : ''].join(' '))]);
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
            el('td.num', `${f.r + 1}`), el('td', fmt.date(FM.season.dateOf(f.w, state.season)).slice(0, 5)),
            el('td.num.team-h', [clubName(W.club(f.h)), ' ', badge(W.club(f.h))]), el('td.score', f.s ? f.s.join(' : ') : '–'), el('td.team-a', [badge(W.club(f.a)), ' ', clubName(W.club(f.a))])]))))) : null]);
      })() : null,
      ...cup.rounds.filter((r) => !r.skipped).map((r) => el('div.panel', [el('h3', `${r.name} · ${r.weeks.map((w) => fmt.date(FM.season.dateOf(w, state.season)).slice(0, 5)).join(' і ')}`),
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
        sec('Дані', [
          'Ліги, клуби, гравці, дати народження, позиції, матчі за збірні — реальні (Wikipedia, Wikidata, знімок 18.11.2026).',
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
    for (const f of FM.season.clubFixtures(S, me)) ev[f.w].push({ k: 'league', t: `Ліга, ${f.w + 1}-й тур: ${vs(f.h, f.a)}${res(f.s, f.h)}` });
    for (const cup of Object.values(state.cups || {})) {
      if (cup.phase) for (const f of cup.phase.fixtures) if ((f.h === me || f.a === me) && ev[f.w]) ev[f.w].push({ k: 'cup', t: `${cup.name}, етап ліги: ${vs(f.h, f.a)}${res(f.s, f.h)}` });
      if (!cup.teams.includes(me)) continue;
      for (const [ri, r] of cup.rounds.entries()) {
        if (r.skipped) continue;
        const tie = r.ties && r.ties.find((t) => t.a === me || t.b === me);
        const out = r.ties && !tie && cup.rounds.slice(0, ri).some((x) => x.ties && x.ties.some((t) => (t.a === me || t.b === me) && t.winner && t.winner !== me));
        if (out) continue;
        r.weeks.forEach((w, leg) => {
          if (!ev[w]) return;
          if (tie) { const [h, a] = leg === 1 ? [tie.b, tie.a] : [tie.a, tie.b]; const L = tie.legs[leg]; ev[w].push({ k: 'cup', t: `${cup.name}, ${r.name.toLowerCase()}: ${vs(h, a)}${L ? ' — ' + (tie.a === me ? L : [L[1], L[0]]).join(':') : ''}` }); }
          else if (!r.ties) ev[w].push({ k: 'cup', t: `${cup.name}, ${r.name.toLowerCase()} (якщо пройдете)`, maybe: true });
        });
      }
    }
    for (const w of FM.nations.WINDOWS) if (ev[w]) ev[w].push({ k: 'intl', t: 'Міжнародне вікно: гравці їдуть у збірні' });
    for (const [a, b] of FM.market.WINDOWS) { if (ev[a]) ev[a].push({ k: 'window', t: 'Відкривається трансферне вікно' }); if (ev[b]) ev[b].push({ k: 'window', t: 'Останній тиждень трансферного вікна' }); }
    if (ev[nW - 1]) ev[nW - 1].push({ k: 'end', t: 'Останній тур. Далі — підсумки сезону, підвищення й виліт' });
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
      el('div.legend', [['league', 'Ліга'], ['cup', 'Кубки'], ['intl', 'Збірні'], ['window', 'Трансфери']].map(([k, l]) => el('span.ev.ev-' + k, l))),
      el('div.panel', el('ul.news.inbox.calendar', rows)),
    ];
  }

  // ---------------- Центр повідомлень (крок 44) ----------------
  let inboxCat = 'all';
  function screenInbox() {
    const all = (state.news || []).slice().reverse();
    const lastRead = state.newsRead || 0;
    const counts = {};
    for (const n of all) { const c = n.c || FM.market.newsCat(n.text); counts[c] = (counts[c] || 0) + 1; }
    const list = all.filter((n) => inboxCat === 'all' || (n.c || FM.market.newsCat(n.text)) === inboxCat);
    // прочитано — усе, що зараз показано (позначка оновиться після виходу з екрана)
    const maxId = all.reduce((m, n) => Math.max(m, n.id || 0), 0);
    if (maxId > lastRead) { state.newsRead = maxId; saveGame(); }
    let prevKey = null;
    const rows = [];
    for (const n of list) {
      const key = `${n.s}-${n.w}`;
      if (key !== prevKey) { rows.push(el('li.day', `${n.s}/${String(n.s + 1).slice(2)}, тиждень ${n.w + 1} · ${fmt.date(FM.season.dateOf(n.w, n.s === state.season.year ? state.season : { start: FM.season.firstSaturday(n.s) }))}`)); prevKey = key; }
      rows.push(el('li' + (n.id > lastRead ? '.unread' : ''), [el('span.tag', FM.market.NEWS_CATS[n.c || FM.market.newsCat(n.text)]), ' ', n.text]));
    }
    return [
      el('header', [el('h1', 'Повідомлення'), el('span.muted', `Усього ${all.length}${maxId > lastRead ? ` · нових ${all.filter((n) => n.id > lastRead).length}` : ''}`)]),
      el('div.tabs', [['all', `Усі (${all.length})`], ...Object.entries(FM.market.NEWS_CATS).filter(([k]) => counts[k]).map(([k, l]) => [k, `${l} (${counts[k]})`])].map(([k, l]) =>
        el('button', { type: 'button', 'aria-pressed': String(inboxCat === k), onclick: () => { inboxCat = k; render(); } }, l))),
      el('div.panel', list.length ? el('ul.news.inbox', rows) : el('p.muted', 'Повідомлень немає.')),
      el('p.note', 'Зберігаються останні 200 повідомлень. Нові позначено кольором, доки ви не відкриєте цей екран.'),
    ];
  }

  function screenNations() {
    const N = FM.nations, st = (state.intl = state.intl || {});
    const pool = N.pools(W).UKR || [];
    const coach = !!st.coach;
    const picks = new Set(coach && st.picks ? st.picks : N.squad(W, 'UKR').map((p) => p.id));
    const S = state.season;
    const next = N.WINDOWS.find((w) => w >= S.week);
    const played = (st.played || []).slice().reverse().slice(0, 10);
    const toggle = (id) => {
      const cur = new Set(st.picks && st.picks.length ? st.picks : N.squad(W, 'UKR').map((p) => p.id));
      if (cur.has(id)) cur.delete(id); else if (cur.size < 26) cur.add(id);
      st.picks = [...cur]; saveGame(); render();
    };
    return [
      el('header', [el('h1', 'Збірна України'), el('span.muted', `Рівень ${Math.round(N.strength(W, 'UKR'))} · ${next ? `наступне вікно — ${next}-й тиждень` : 'цього сезону вікон більше немає'}`)]),
      el('div.panel', [
        el('p', coach ? 'Ви тренуєте збірну паралельно з клубом: склад обираєте самі (16–26 гравців), результати впливають на вашу репутацію.'
          : 'Збірну тренує федерація; виклик ваших гравців означає втому й ризик травм після міжнародних вікон.'),
        coach ? el('button.btn', { type: 'button', onclick: () => { st.coach = false; delete st.picks; saveGame(); render(); } }, 'Залишити посаду')
          : N.canCoach(state) ? el('button.btn.primary', { type: 'button', onclick: () => { st.coach = true; st.picks = N.squad(W, 'UKR').map((p) => p.id); FM.market.news(state, 'Ви очолили збірну України паралельно з клубом.'); saveGame(); render(); } }, 'Очолити збірну')
          : el('small.muted', 'Федерація запросить вас, коли репутація тренера сягне 55 (зараз ' + Math.round(state.board ? state.board.rep : 0) + ').'),
      ]),
      el('div.grid', [
        el('div.panel', [el('h3', coach ? `Кандидати (обрано ${picks.size})` : 'Склад на найближчі матчі'), el('ul.plist', (coach ? pool.slice(0, 45) : pool.filter((p) => picks.has(p.id))).map((p) => el('li', [
          el('span', [coach ? el('input', { type: 'checkbox', checked: picks.has(p.id) || null, 'aria-label': 'У складі', onchange: () => toggle(p.id) }) : null, ' ',
            el('a', { href: '#player-' + p.id }, nameOf(p)), el('small.muted', ` ${FM.positions(p)}, ${clubName(W.club(p.club))}${p.injury ? ', травма' : ''}`)]),
          el('span.num', String(p.ca))])))]),
        el('div.panel', [el('h3', 'Останні матчі'), played.length ? el('ul.plist', played.map((x) => el('li', [el('span', `${x.s}/${String(x.s + 1).slice(2)} · ${x.home ? 'вдома' : 'виїзд'} — ${FM.countries.name(x.opp)}`), el('b', x.score.join(':'))])))
          : el('p.muted', 'Ще не грали.'),
        el('h3', 'Турніри'), (st.tours || []).length ? el('ul.plist', st.tours.slice().reverse().map((t) => el('li', [el('span', `${t.name}: переможець — ${FM.countries.name(t.winner)}`), el('small.muted', 'Україна: ' + (t.ukr || '—'))])))
          : el('p.muted', 'Найближчий — Чемпіонат Європи 2028 (після сезону 2027/28).')]),
      ]),
    ];
  }

  function screenHistory() {
    const H = state.history || [];
    return [
      el('header', [el('h1', 'Історія'), el('span.muted', `${state.manager} · сезонів: ${H.length}`)]),
      H.length ? el('div.table-wrap', el('table', [
        el('thead', el('tr', [el('th', 'Сезон'), el('th', 'Клуб'), el('th.num', 'Місце'), el('th.num', 'Очки'), el('th', 'Трофеї'), el('th', 'Бомбардир'), el('th', 'Ліга чемпіонів'), el('th', 'Ліга Європи'), ...W.db.leagues.filter((l) => l.tier !== 2).map((l) => el('th', 'Чемпіон: ' + l.name))])),
        el('tbody', [...H].reverse().map((h) => el('tr', [
          el('td', `${h.year}/${String(h.year + 1).slice(2)}`), el('td', clubName(W.club(h.club))), el('td.num', h.pos), el('td.num', h.pts),
          el('td', (h.trophies || []).length ? h.trophies.map((x) => (x === 'league' ? 'Чемпіонат' : FM.cups.NAMES[x])).join(', ') : '—'),
          el('td', h.scorer && W.player(h.scorer[0]) ? `${nameOf(W.player(h.scorer[0]))} (${h.scorer[1]})` : '—'),
          el('td', h.cups && h.cups.ucl ? clubName(W.club(h.cups.ucl)) : '—'), el('td', h.cups && h.cups.uel ? clubName(W.club(h.cups.uel)) : '—'),
          ...W.db.leagues.filter((l) => l.tier !== 2).map((l) => el('td', h.champions[l.id] ? clubName(W.club(h.champions[l.id])) : '—')),
        ]))),
      ])) : el('p.muted', 'Історія з’явиться після першого сезону.'),
    ];
  }

  function screenTraining() {
    const t = training();
    const save = () => { saveGame(); render(); };
    const sq = W.squad(state.clubId);
    const seg = (obj, key, defs) => el('div.tabs', Object.entries(defs).map(([k, d]) => el('button', { type: 'button', 'aria-pressed': String(t[key] === k), onclick: () => { t[key] = k; save(); } }, d.label)));
    const attrOptions = (p) => [['', 'Як у всієї команди'], ...FM.ATTR_GROUPS[p.roles[0] === 'GK' ? 'gk' : 'outfield'].flatMap(([, ks]) => ks.map((k) => [k, FM.ATTRS[k]]))];
    return [
      el('header', [el('h1', 'Тренування'), el('span.muted', 'Діє щотижня на всіх гравців клубу')]),
      el('div.panel', [el('div.instr', [
        el('div.field', [el('b', 'План тижня'), seg(t, 'plan', FM.dev.PLANS), el('small.muted', FM.dev.PLANS[t.plan || 'balanced'].hint)]),
        el('div.field', [el('b', 'Наголос'), seg(t, 'focus', FM.dev.FOCUS), el('small.muted', 'Які атрибути ростуть першими.')]),
        el('div.field', [el('b', 'Інтенсивність'), seg(t, 'intensity', FM.dev.INTENSITY), el('small.muted', 'Інтенсивне — швидший ріст, але більше травм; легке — навпаки.')]),
      ])]),
      el('div.panel', [el('h3', 'Гравці'), el('div.table-wrap.flat', el('table', [
        el('thead', el('tr', [el('th', 'Гравець'), el('th', 'Поз.'), el('th.num', 'Вік'), el('th', 'Рівень'), el('th', 'Потенціал'), el('th.num', 'За сезон'), el('th', 'Індивідуально'), el('th', 'Стан')])),
        el('tbody', sq.map((p) => {
          const d = p.ca - (p.ca0 ?? W.base(p.id)?.ca ?? p.ca);
          return el('tr', [
            el('td.name', el('a', { href: '#player-' + p.id }, nameOf(p))),
            el('td.pos.line-' + FM.ROLE_LINE[p.roles[0]], FM.roleLabel(p.roles[0], p.side)),
            el('td.num', W.age(p) ?? '—'), el('td', starsEl(p.ca, 'Рівень')), el('td', starsEl(p.pa, 'Потенціал')),
            el('td.num', el('b' + (d > 0 ? '.up' : d < 0 ? '.down' : ''), d > 0 ? '+' + d : d)),
            el('td', el('select.tiny', { 'aria-label': 'Індивідуальне тренування ' + nameOf(p), onchange: (e) => { if (e.target.value) t.individual[p.id] = e.target.value; else delete t.individual[p.id]; saveGame(); } },
              attrOptions(p).map(([k, n]) => el('option', { value: k, selected: (t.individual[p.id] || '') === k || null }, n)))),
            el('td', p.injury ? el('span.chip.bad', `травма, ${p.injury} тиж.`) : banned(p.id) ? el('span.chip.bad', 'дискв.') : (p.fitness ?? 100) < 85 ? el('span.chip', `свіжість ${Math.round(p.fitness)}%`) : 'готовий'),
          ]);
        })),
      ]))]),
    ];
  }

  function fixtureRow(f, clubId, opts = {}) {
    const home = W.club(f.h), away = W.club(f.a);
    const r = clubId ? RESULT(f, clubId) : null;
    // у календарі власного клубу підсвічувати нічого — там усі матчі «наші»
    return el('tr' + (!clubId && (f.h === state.clubId || f.a === state.clubId) ? '.mine' : ''), [
      opts.round ? el('td.num', roundOf(f)) : null,
      opts.date ? el('td', fmt.date(FM.season.dateOf(f.w, state.season)).slice(0, 5)) : null,
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
    const thisWeek = over ? null : FM.season.fixturesOfWeek(S, S.week).find((x) => x.h === c.id || x.a === c.id);
    const mine = FM.season.clubFixtures(S, c.id);
    const last = [...mine].reverse().find((f) => f.s);
    const { pos, size } = myPosition();
    const blocks = [el('header', [el('h1', `Сезон ${seasonLabel()}`), el('span.muted', over ? 'Сезон завершено' : `Тиждень ${S.week + 1} з ${total} · ${fmt.date(FM.season.dateOf(S.week, state.season))}`)])];

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
        el('h3', `${roundOf(thisWeek)}-й тур · ${fmt.date(FM.season.dateOf(thisWeek.w, state.season))}`),
        el('div.vs', [
          el('div.vs-team', [badge(W.club(thisWeek.h), true), el('b', clubName(W.club(thisWeek.h))), el('small.muted', 'господарі')]),
          el('div.vs-mid', 'проти'),
          el('div.vs-team', [badge(W.club(thisWeek.a), true), el('b', clubName(W.club(thisWeek.a))), el('small.muted', 'гості')]),
        ]),
        el('p.muted', `Суперник: ${clubName(opp)}, ${oppPos ? oppPos + '-е місце' : ''}${t[oppPos - 1] && t[oppPos - 1].p ? `, ${t[oppPos - 1].pts} ${FM.plural(t[oppPos - 1].pts, 'очко', 'очки', 'очок')}` : ''}.` + (out.length ? ` Не зіграють: ${out.join(', ')}.` : '')),
        cupNote(),
        opponentReport(opp.id, thisWeek.h === opp.id),
        pressPanel(),
        el('div.actions', [
          el('button.btn.primary', { type: 'button', onclick: () => playMyMatch(true) }, 'Грати з трансляцією'),
          el('button.btn', { type: 'button', onclick: () => playMyMatch(false) }, 'Одразу результат'),
        ]),
        el('p.note', ['Решта матчів туру в усіх лігах зіграються одночасно. Склад, схема й інструкції — з ', el('a', { href: '#tactics' }, 'тактики'), '; у трансляції можна робити заміни й міняти підхід.']),
      ]));
    } else {
      blocks.push(el('div.panel', [el('h3', 'Цього тижня ваша ліга не грає'),
        el('p', 'Чемпіонат вашої ліги вже завершився, а інші ліги ще грають.'),
        cupNote(),
        el('div.actions', [el('button.btn.primary', { type: 'button', onclick: () => playMyMatch(false) }, 'Наступний тиждень')])]));
    }

    if (last) {
      const lastRound = FM.season.fixturesOfWeek(S, last.w).filter((f) => f.l === c.league);
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
    const t = FM.season.table(S, W, tableLeague);
    const rounds = 2 * (L.size - 1);
    const played = Math.max(0, ...S.fixtures.filter((f) => f.l === L.id && f.s).map((f) => f.w + 1));
    if (tableRound == null || tableRound > rounds) tableRound = Math.max(1, played);
    const ZONE_UK = { ucl: 'Ліга чемпіонів', uel: 'Ліга Європи', uecl: 'Ліга конференцій', playoff: 'Стикові матчі', rel: 'Виліт' };
    const leaderList = (key, title) => {
      const list = FM.season.leaders(S, W, L.id, key, 10);
      return el('div.panel', [el('h3', title), list.length ? el('ol.plist.leaders', list.map((x) => el('li', [
        el('span', [el('a', { href: '#player-' + x.id }, nameOf(x.p)), el('small.muted', ' ' + clubName(W.club(x.p.club)))]), el('b', x.st[key])]))) : el('p.muted', 'Ще немає.')]);
    };
    const roundFx = S.fixtures.filter((f) => f.l === L.id && f.w === tableRound - 1);
    return [
      el('header', [el('h1', 'Таблиця'), el('span.muted', `${L.name} · зіграно турів: ${played} з ${rounds}`)]),
      el('div.tabs', W.db.leagues.map((l) => el('button', { type: 'button', 'aria-pressed': String(l.id === tableLeague), onclick: () => { tableLeague = l.id; tableRound = null; render(); } }, l.name))),
      el('div.table-wrap', el('table.standings', [
        el('thead', el('tr', ['#', 'Клуб', 'І', 'В', 'Н', 'П', 'М', 'Р', 'О', 'Форма'].map((h, i) => el('th' + (i >= 2 && i <= 8 ? '.num' : ''), { title: { І: 'Ігри', В: 'Виграші', Н: 'Нічиї', П: 'Поразки', М: 'М’ячі', Р: 'Різниця', О: 'Очки' }[h] || null }, h)))),
        el('tbody', t.map((r, i) => {
          const z = FM.season.zone(L.id, i + 1, t.length);
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
          el('h3', `${tableRound}-й тур · ${fmt.date(FM.season.dateOf(tableRound - 1, state.season))}`),
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

  function savePanel() {
    const codeBox = el('textarea', { id: 'save-code', rows: 3, placeholder: 'Вставте сюди код збереження', spellcheck: 'false' });
    const fileInput = el('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (f) importSave(await f.text());
    } });
    const status = el('p.note', ioMsg ? { class: 'note msg-' + ioMsg[0] } : {}, ioMsg ? ioMsg[1] : 'Гра зберігається в цьому браузері автоматично. Щоб перенести кар’єру на інший пристрій, збережіть її у файл або скопіюйте код.');
    ioMsg = null;
    return el('div.panel', [el('h3', 'Збереження'), status,
      el('div.actions', [
        el('button.btn', { type: 'button', onclick: async () => {
          const code = await exportSave();
          const a = el('a', { href: URL.createObjectURL(new Blob([code], { type: 'text/plain' })), download: `golovnyi-trener-${state.season.year}-tyzhden-${state.season.week + 1}.txt` });
          document.body.append(a); a.click(); a.remove();
        } }, 'Зберегти у файл'),
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

  function screenSettings() {
    const setNames = (v) => { state.names = v; saveGame(); render(); };
    return [
      el('header', [el('h1', 'Налаштування')]),
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
    try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (_) { /* у пісочниці може бути заборонено */ }
  }
})();
