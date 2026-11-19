// Інтерфейс: початок кар'єри, огляд клубу, склад, картка гравця, ліги, налаштування.
(function () {
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

  const W = FM.createWorld(window.FM_DB);
  let state = store.load();
  if (state && !W.club(state.clubId)) state = null; // база змінилась — клубу вже немає

  const nameOf = (p) => (state && state.names === 'en' ? p.nameEn : p.name);
  const clubName = (c) => (state && state.names === 'en' ? c.nameEn : c.name);

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
    if (!state) return renderStart();
    const view = location.hash.slice(1) || 'overview';
    const [name, arg] = view.split(/-(.+)/);
    const screens = { overview: screenOverview, squad: screenSquad, player: screenPlayer, leagues: screenLeagues, club: screenClub, settings: screenSettings };
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
          item('overview', 'Огляд'), item('squad', 'Склад'), item('leagues', 'Ліги й клуби'),
          item('tactics', 'Тактика', true), item('fixtures', 'Матчі', true), item('transfers', 'Трансфери', true),
          item('settings', 'Налаштування'),
        ]),
        el('div.foot', [`Тренер: ${state.manager}`, el('br'), `Сезон ${W.db.season}`]),
      ]),
      el('main.main', body),
    ]);
  }

  // ---------------- Початок кар'єри ----------------
  function renderStart() {
    let leagueId = 'ukr', clubId = null;
    const grid = el('div.club-grid');
    const tabs = el('div.tabs', { role: 'group', 'aria-label': 'Ліга' });
    const nameInput = el('input', { id: 'manager-name', type: 'text', value: 'Новий тренер', maxlength: 40, autocomplete: 'off' });
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
      state = { version: 1, manager: nameInput.value.trim() || 'Новий тренер', clubId, names: 'uk', started: W.today };
      store.save(state);
      go('overview');
    }
    drawTabs(); drawClubs();
    app.replaceChildren(el('div.start', [
      el('div.hero', [
        el('h1', 'Головний тренер'),
        el('p', `Реальні клуби й гравці шести ліг, сезон ${W.db.season}. Оберіть команду, яку очолите.`),
      ]),
      el('div.field', [el('label', { for: 'manager-name' }, 'Ваше ім’я'), nameInput]),
      tabs,
      grid,
      el('div.panel.confirm', [picked, startBtn]),
      el('p.note', `Дані: ${W.db.source}. Знімок від ${fmt.date(W.db.snapshot)}. Атрибути вирахувані з реальних фактів і можуть не збігатися з вашим уявленням про гравця.`),
    ]));
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
        starsEl(W.clubLevel(c.id), 'Рівень клубу'),
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
      ['caps', 'Збірна', (p) => (p.caps ? `${p.caps} (${p.intlGoals || 0})` : '—'), 'num'],
      ['value', 'Ціна', (p) => fmt.money(p.value), 'num'],
    ];
    const keyFn = {
      number: (p) => p.number ?? 999, name: nameOf, age: (p) => W.age(p) ?? 99, nat: (p) => FM.countries.name(p.nat),
      ca: (p) => -p.ca, pa: (p) => -p.pa, caps: (p) => -(p.caps || 0), value: (p) => -p.value, pos: null,
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
        if (k === 'name') td.append(...(p.captain ? [' ', el('span.muted', { title: 'Капітан' }, '(К)')] : []), ...(p.onLoanFrom ? [' ', el('span.soon', { title: 'В оренді з ' + p.onLoanFrom }, 'оренда')] : []));
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
    const c = W.club(p.club);
    const groups = FM.ATTR_GROUPS[p.roles[0] === 'GK' ? 'gk' : 'outfield'];
    const shirt = el('div.shirt', p.number ?? '—');
    shirt.style.background = c.colors[0]; shirt.style.color = readableOn(c.colors[0]);
    return [
      el('div.player-top', [
        shirt,
        el('div', { style: { minWidth: 0 } }, [
          el('h1', nameOf(p)),
          el('div.muted', [el('a', { href: c.id === state.clubId ? '#squad' : '#club-' + c.id }, clubName(c)), ` · ${FM.ROLE_NAME[p.roles[0]]} (${FM.positions(p)})`]),
        ]),
      ]),
      el('div.grid', [
        el('div.panel', [el('h3', 'Особисте'), el('dl.facts', [
          el('dt', 'Дата народження'), el('dd', p.born ? `${fmt.date(p.born)} (${W.age(p)} р.)` : '—'),
          el('dt', 'Країна'), el('dd', FM.countries.name(p.nat)),
          el('dt', 'Зріст'), el('dd', p.height ? `${p.height} см` : '—'),
          el('dt', 'Збірна'), el('dd', p.caps ? `${p.caps} матчів, ${p.intlGoals || 0} голів` : 'не грав'),
          el('dt', 'Кар’єра в лігах'), el('dd', p.leagueApps != null ? `${p.leagueApps} матчів, ${p.leagueGoals || 0} голів` : '—'),
          ...(p.onLoanFrom ? [el('dt', 'Оренда'), el('dd', 'з клубу ' + p.onLoanFrom)] : []),
        ])]),
        el('div.panel', [el('h3', 'Оцінка'), el('dl.facts', [
          el('dt', 'Рівень'), el('dd', starsEl(p.ca, 'Рівень')),
          el('dt', 'Потенціал'), el('dd', starsEl(p.pa, 'Потенціал')),
          el('dt', 'Ціна'), el('dd', fmt.money(p.value)),
        ]), p.wiki ? el('p.note', ['Факти: ', el('a', { href: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.wiki.replace(/ /g, '_')), target: '_blank', rel: 'noopener' }, 'Wikipedia')]) : null]),
      ]),
      el('div.panel', [el('div.attrs', groups.map(([title, keys]) => el('div', [
        el('h3', title),
        el('ul', keys.map((k) => el('li', [FM.ATTRS[k], el('b.' + attrClass(p.attrs[k]), p.attrs[k])]))),
      ])))]),
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
        el('thead', el('tr', [el('th', '#'), el('th', 'Клуб'), el('th', 'Стадіон'), el('th.num', 'Місткість'), el('th', 'Рівень'), el('th.num', 'Гравців')])),
        el('tbody', list.map(({ c, lvl, n }, i) => el('tr.row-link', { onclick: () => go(c.id === state.clubId ? 'squad' : 'club-' + c.id) }, [
          el('td.num', i + 1),
          el('td.name', el('span', { style: { display: 'inline-flex', gap: '0.5rem', alignItems: 'center' } }, [badge(c), clubName(c)])),
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
        starsEl(W.clubLevel(c.id), 'Рівень клубу'),
      ]),
      squadTable(c.id),
    ];
  }

  // ---------------- Налаштування ----------------
  let confirmReset = false;
  function screenSettings() {
    const setNames = (v) => { state.names = v; store.save(state); render(); };
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
            el('button.btn.primary', { type: 'button', onclick: () => { store.clear(); state = null; confirmReset = false; location.hash = ''; render(); } }, 'Так, почати заново'),
            el('button.btn', { type: 'button', onclick: () => { confirmReset = false; render(); } }, 'Скасувати')])
          : el('button.btn', { type: 'button', onclick: () => { confirmReset = true; render(); } }, 'Почати нову кар’єру')]),
      el('div.panel', [el('h3', 'Про базу'), el('dl.facts', [
        el('dt', 'Знімок'), el('dd', fmt.date(W.db.snapshot)),
        el('dt', 'Клубів'), el('dd', W.db.clubs.length),
        el('dt', 'Гравців'), el('dd', W.db.players.length),
        el('dt', 'Джерела'), el('dd', W.db.source),
      ])]),
    ];
  }

  render();
})();
