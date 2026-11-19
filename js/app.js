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
  // давніші збереження (до етапу 3) — створюємо сезон
  if (state && !state.season) { state.season = FM.season.create(W, String(Date.now())); store.save(state); }

  const nameOf = (p) => (state && state.names === 'en' ? p.nameEn : p.name);
  const clubName = (c) => (state && state.names === 'en' ? c.nameEn : c.name);
  const NAMES = { club: (c) => clubName(c), player: (p) => nameOf(p) };
  const pstat = (id) => (state && state.season.ps[id]) || null; // [ігри, голи, паси, сума оцінок ×10, ЖК, ЧК]
  const banned = (id) => !!(state && state.season.bans[id]);

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
    clearTimeout(liveTimer); // пішли з трансляції — зупиняємо її
    if (!state) return renderStart();
    const view = location.hash.slice(1) || 'overview';
    const [name, arg] = view.split(/-(.+)/);
    const screens = { overview: screenOverview, squad: screenSquad, player: screenPlayer, leagues: screenLeagues, club: screenClub, match: screenMatch, fixtures: screenSeason, table: screenTable, options: screenSettings };
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
          item('fixtures', 'Сезон'), item('table', 'Таблиця'), item('match', 'Товариський'),
          item('tactics', 'Тактика', true), item('transfers', 'Трансфери', true),
          item('options', 'Налаштування'),
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
      state = { version: 1, manager: nameInput.value.trim() || 'Новий тренер', clubId, names: 'uk', started: W.today,
        season: FM.season.create(W, String(Date.now())) };
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
      seasonPanel(),
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
    ];
    const keyFn = {
      number: (p) => p.number ?? 999, name: nameOf, age: (p) => W.age(p) ?? 99, nat: (p) => FM.countries.name(p.nat),
      ca: (p) => -p.ca, pa: (p) => -p.pa, caps: (p) => -(p.caps || 0), value: (p) => -p.value, pos: null,
      season: (p) => { const st = pstat(p.id); return st ? -(st[0] * 100 + st[1]) : 0; },
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
          ...(banned(p.id) ? [' ', el('span.chip.bad', { title: 'Пропускає наступний матч' }, 'дискв.')] : []));
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

  // ---------------- Матч ----------------
  const ROLE_SHORT = (slot) => FM.roleLabel(slot.role, slot.side);
  let pre = null; // налаштування товариського матчу
  let liveTimer = null;
  let liveSpeed = 1;
  const SPEEDS = [[1, 'Звичайно'], [4, 'Швидко'], [0, 'Одразу результат']];

  function minuteValue(min) {
    if (typeof min === 'number') return min;
    const [a, b] = String(min).split('+').map(Number);
    return a + (b || 0) / 10;
  }

  function teamSide(clubId) {
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
    const mine = teamSide(my.id), opp = teamSide(pre.opp);
    const [hs, as] = pre.home ? [mine, opp] : [opp, mine];
    const leagueClubs = W.clubsOf(pre.league).filter((c) => c.id !== my.id);
    const select = el('select', { id: 'opponent', onchange: (e) => { pre.opp = e.target.value; render(); } },
      leagueClubs.map((c) => el('option', { value: c.id, selected: c.id === pre.opp || null }, clubName(c))));
    if (!leagueClubs.some((c) => c.id === pre.opp)) { pre.opp = leagueClubs[0].id; return screenMatch(); }
    const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    const history = (state.friendlies || []).slice(-6).reverse();

    return [
      el('header', [el('h1', 'Товариський матч'), el('span.muted', 'Сезон і турнірна таблиця — на наступному етапі')]),
      el('div.panel', [
        el('h3', 'Суперник'),
        el('div.tabs', W.db.leagues.map((l) => el('button', { type: 'button', 'aria-pressed': String(l.id === pre.league), onclick: () => { pre.league = l.id; pre.opp = W.clubsOf(l.id).find((c) => c.id !== my.id).id; render(); } }, l.name))),
        el('div.pre-row', [
          el('div.field', [el('label', { for: 'opponent' }, 'Клуб'), select]),
          el('div.field', [el('span', 'Де граємо'), el('div.tabs', [
            el('button', { type: 'button', 'aria-pressed': String(pre.home), onclick: () => { pre.home = true; render(); } }, 'Вдома'),
            el('button', { type: 'button', 'aria-pressed': String(!pre.home), onclick: () => { pre.home = false; render(); } }, 'На виїзді'),
          ])]),
          el('button.btn.primary.kick', { type: 'button', onclick: () => startMatch(hs, as) }, 'Почати матч'),
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
        el('p.note', 'Сила ліній — середня оцінка гравців на їхніх позиціях за шкалою 1–20.'),
      ]),
      el('div.grid', [
        el('div.panel', [el('h3', `${clubName(hs.club)}: склад`), lineupList(hs)]),
        el('div.panel', [el('h3', `${clubName(as.club)}: склад`), lineupList(as)]),
      ]),
      history.length ? el('div.panel', [el('h3', 'Останні матчі'), el('ul.plist', history.map((h) => el('li', [
        el('span', `${h.home} — ${h.away}`), el('b', h.score)])))]) : null,
    ];
  }

  function startMatch(hs, as) {
    const seed = `${hs.club.id}-${as.club.id}-${Date.now()}`;
    const result = FM.match.play({
      home: { club: { ...hs.club, name: clubName(hs.club) }, players: hs.players, formation: hs.formation, lineup: hs.lineup },
      away: { club: { ...as.club, name: clubName(as.club) }, players: as.players, formation: as.formation, lineup: as.lineup },
      seed, name: nameOf,
    });
    state.friendlies = (state.friendlies || []).concat([{ home: clubName(hs.club), away: clubName(as.club), score: result.score.join(':') }]).slice(-20);
    store.save(state);
    app.replaceChildren(shell('match', liveView(hs, as, result, [['Зіграти ще раз', () => startMatch(hs, as), true], ['Інший суперник', () => render()]])));
    window.scrollTo(0, 0);
  }

  function liveView(hs, as, m, actions) {
    const scoreEl = el('div.sb-score', '0:0');
    const clock = el('div.sb-clock', '0′');
    const feed = el('ol.feed', { 'aria-live': 'polite' });
    const after = el('div.after');
    const speedBtns = el('div.tabs');
    let i = 0, done = false;

    const drawSpeed = () => speedBtns.replaceChildren(...SPEEDS.map(([v, label]) => el('button', {
      type: 'button', 'aria-pressed': String(liveSpeed === v), disabled: done || null,
      onclick: () => { liveSpeed = v; drawSpeed(); if (v === 0) { clearTimeout(liveTimer); step(); } },
    }, label)));

    const show = (e) => {
      const team = e.team == null ? null : e.team === 0 ? hs.club : as.club;
      const li = el('li.ev.ev-' + e.type, [el('span.min', e.min + '′'), team ? badge(team) : el('span.dot'), el('span', e.text)]);
      feed.prepend(li);
      scoreEl.textContent = e.score.join(':');
      clock.textContent = e.type === 'full' ? 'Кінець' : e.type === 'half' && String(e.min).startsWith('45') ? 'Перерва' : e.min + '′';
    };
    // Годинник іде рівно: хвилина ≈ 0,26 с на звичайній швидкості; після голу — пауза.
    let t = 0, hold = 0;
    const MS_PER_MIN = 260, TICK = 100;
    function step() {
      if (liveSpeed === 0) { while (i < m.events.length) show(m.events[i++]); return finish(); }
      if (hold > 0) hold -= TICK * liveSpeed;
      else t += (TICK / MS_PER_MIN) * liveSpeed;
      while (i < m.events.length && minuteValue(m.events[i].min) <= t) {
        const e = m.events[i++];
        show(e);
        if (e.type === 'goal') hold = 1800;
        else if (e.type === 'half' && String(e.min).startsWith('45')) hold = 1200;
      }
      if (i >= m.events.length) return finish();
      const last = m.events[i - 1];
      if (!(last && (last.type === 'half' && String(last.min).startsWith('45') && t < 46))) {
        const shown = Math.floor(t);
        clock.textContent = shown > 90 ? `90+${shown - 90}′` : shown > 45 && t < 46 ? `45+′` : `${shown}′`;
      }
      liveTimer = setTimeout(step, TICK);
    }
    function finish() {
      done = true; drawSpeed();
      const [sh, sa] = m.stats;
      const pct = (v) => v + '%';
      const f2 = (v) => String(v).replace('.', ',');
      const ratingTable = (k, club) => el('div.panel', [el('h3', clubName(club)), el('div.table-wrap', el('table', [
        el('thead', el('tr', [el('th', 'Гравець'), el('th', 'Поз.'), el('th.num', 'Оцінка'), el('th', '')])),
        el('tbody', m.ratings.filter((r) => r.team === k).map((r) => el('tr', [
          el('td.name', el('a', { href: '#player-' + r.id }, nameOf(r.player))),
          el('td.pos.line-' + FM.ROLE_LINE[r.role], FM.roleLabel(r.role)),
          el('td.num', el('b.rating' + (r.rating >= 7.5 ? '.hi' : r.rating < 6 ? '.lo' : ''), f2(r.rating))),
          el('td.muted', [r.goals ? `гол ×${r.goals} ` : '', r.assists ? `пас ×${r.assists} ` : '', r.yellow ? 'ЖК ' : '', r.red ? 'ЧК ' : '', r.on ? `вийшов на ${r.on}′` : '', r.off ? `замінений на ${r.off}′` : ''].join('')),
        ]))),
      ]))]);
      after.replaceChildren(
        el('div.panel', [el('h3', 'Статистика'), compareBars([
          ['Володіння', sh.poss, sa.poss, pct], ['Удари', sh.shots, sa.shots], ['У площину воріт', sh.onTarget, sa.onTarget],
          ['Очікувані голи (xG)', sh.xg, sa.xg, f2], ['Жовті картки', sh.yellow, sa.yellow], ['Червоні картки', sh.red, sa.red],
        ]), el('p', ['Найкращий гравець матчу: ', el('b', nameOf(m.motm.player)), ` (${clubName(m.motm.team === 0 ? hs.club : as.club)}, ${f2(m.motm.rating)})`])]),
        el('div.grid', [ratingTable(0, hs.club), ratingTable(1, as.club)]),
        el('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } }, actions.map(([label, fn, primary]) =>
          el('button.btn' + (primary ? '.primary' : ''), { type: 'button', onclick: fn }, label))),
      );
    }
    drawSpeed();
    liveTimer = setTimeout(step, 200);
    return [
      el('div.scoreboard', [
        el('div.sb-team', [badge(hs.club, true), el('b', clubName(hs.club))]),
        el('div.sb-mid', [scoreEl, clock]),
        el('div.sb-team.away', [badge(as.club, true), el('b', clubName(as.club))]),
      ]),
      el('div.live-controls', [el('span.muted', 'Швидкість'), speedBtns]),
      el('div.panel.feed-wrap', feed),
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

  function seasonPanel() {
    const S = state.season, c = W.club(state.clubId);
    const f = FM.season.nextFixture(S, c.id);
    const { pos, row, size } = myPosition();
    const facts = [
      el('dt', 'Місце'), el('dd', row.p ? `${pos}-е з ${size} · ${row.pts} очок` : 'сезон ще не почався'),
      el('dt', 'Форма'), el('dd', row.form.length ? formEl(row.form) : '—'),
    ];
    if (f) {
      const opp = W.club(f.h === c.id ? f.a : f.h);
      facts.push(el('dt', 'Наступний матч'), el('dd', [el('a', { href: '#fixtures' }, `${clubName(opp)} (${f.h === c.id ? 'вдома' : 'на виїзді'})`), `, ${roundOf(f)}-й тур, ${fmt.date(FM.season.dateOf(f.w))}`]));
    } else facts.push(el('dt', 'Наступний матч'), el('dd', 'сезон завершено'));
    return el('div.panel', [el('h3', `Сезон ${W.db.season}`), el('dl.facts', facts)]);
  }

  function playMyMatch(live) {
    const S = state.season;
    const f = FM.season.fixturesOfWeek(S, S.week).find((x) => x.h === state.clubId || x.a === state.clubId);
    let shown = null;
    if (f) {
      const { m, hs, as } = FM.season.play(S, W, f, NAMES);
      FM.season.record(S, f, m); // результат фіксуємо одразу, ще до трансляції
      shown = { m, hs, as, f };
    }
    FM.season.playWeek(S, W, { name: NAMES });
    store.save(state);
    if (shown && live) {
      app.replaceChildren(shell('fixtures', liveView(shown.hs, shown.as, shown.m, [
        ['Далі', () => go('fixtures'), true], ['Таблиця', () => go('table')],
      ])));
      window.scrollTo(0, 0);
    } else go('fixtures');
  }

  function fixtureRow(f, clubId, opts = {}) {
    const home = W.club(f.h), away = W.club(f.a);
    const r = clubId ? RESULT(f, clubId) : null;
    // у календарі власного клубу підсвічувати нічого — там усі матчі «наші»
    return el('tr' + (!clubId && (f.h === state.clubId || f.a === state.clubId) ? '.mine' : ''), [
      opts.round ? el('td.num', roundOf(f)) : null,
      opts.date ? el('td', fmt.date(FM.season.dateOf(f.w)).slice(0, 5)) : null,
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
    const blocks = [el('header', [el('h1', `Сезон ${W.db.season}`), el('span.muted', over ? 'Сезон завершено' : `Тиждень ${S.week + 1} з ${total} · ${fmt.date(FM.season.dateOf(S.week))}`)])];

    if (over) {
      blocks.push(el('div.panel', [el('h3', 'Підсумки сезону'),
        el('p', `${clubName(c)} — ${pos}-е місце з ${size}.`),
        el('ul.plist', W.db.leagues.map((l) => {
          const champ = W.club(FM.season.table(S, W, l.id)[0].id);
          return el('li', [el('span', l.name), el('b', ['Чемпіон: ', clubName(champ)])]);
        })),
        el('p.note', 'Новий сезон із розвитком гравців і трансферами з’явиться на наступних етапах. Почати ще раз можна в «Налаштуваннях».')]));
    } else if (thisWeek) {
      const opp = W.club(thisWeek.h === c.id ? thisWeek.a : thisWeek.h);
      const t = FM.season.table(S, W, c.league);
      const oppPos = t.findIndex((r) => r.id === opp.id) + 1;
      const out = W.club(c.id).players.filter((id) => banned(id)).map((id) => nameOf(W.player(id)));
      blocks.push(el('div.panel.next', [
        el('h3', `${roundOf(thisWeek)}-й тур · ${fmt.date(FM.season.dateOf(thisWeek.w))}`),
        el('div.vs', [
          el('div.vs-team', [badge(W.club(thisWeek.h), true), el('b', clubName(W.club(thisWeek.h))), el('small.muted', 'господарі')]),
          el('div.vs-mid', 'проти'),
          el('div.vs-team', [badge(W.club(thisWeek.a), true), el('b', clubName(W.club(thisWeek.a))), el('small.muted', 'гості')]),
        ]),
        el('p.muted', `Суперник: ${clubName(opp)}, ${oppPos ? oppPos + '-е місце' : ''}${t[oppPos - 1] && t[oppPos - 1].p ? `, ${t[oppPos - 1].pts} очок` : ''}.` + (out.length ? ` Пропускають через дискваліфікацію: ${out.join(', ')}.` : '')),
        el('div.actions', [
          el('button.btn.primary', { type: 'button', onclick: () => playMyMatch(true) }, 'Грати з трансляцією'),
          el('button.btn', { type: 'button', onclick: () => playMyMatch(false) }, 'Одразу результат'),
        ]),
        el('p.note', 'Решта матчів туру в усіх лігах зіграються одночасно. Склад і схему поки обирає помічник — керування з’явиться в «Тактиці».'),
      ]));
    } else {
      blocks.push(el('div.panel', [el('h3', 'Цього тижня ваша ліга не грає'),
        el('p', 'Чемпіонат вашої ліги вже завершився, а інші ліги ще грають.'),
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
          el('h3', `${tableRound}-й тур · ${fmt.date(FM.season.dateOf(tableRound - 1))}`),
          el('button.btn', { type: 'button', disabled: tableRound >= rounds || null, onclick: () => { tableRound++; render(); }, 'aria-label': 'Наступний тур' }, '→'),
        ]),
        el('div.table-wrap.flat', el('table.fixtures', el('tbody', roundFx.map((f) => fixtureRow(f, null))))),
      ]),
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
