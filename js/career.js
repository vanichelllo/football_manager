// Кар'єра тренера: профіль і ліцензії (40), довгострокове бачення правління (41),
// розмови з гравцями й обіцянки (42), досягнення (43).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const seasonTag = (y) => `${y}/${String(y + 1).slice(2)}`;

  // ---------------- 40. Профіль тренера ----------------
  const CATTRS = {
    tac: { label: 'Тактика', hint: 'Команда швидше засвоює схему.' },
    mot: { label: 'Мотивація', hint: 'Сильніші промови в перерві й розмови з гравцями.' },
    youth: { label: 'Робота з молоддю', hint: 'Гравці до 21 року ростуть швидше.' },
    neg: { label: 'Переговори', hint: 'Нижчі ціни й зарплати в угодах вашого клубу.' },
  };
  // Ліцензії: курс (тижні, вартість для клубу, млн €) і найсильніший клуб, який дасть роботу
  const LICENCES = ['C', 'B', 'A', 'Pro'];
  const LIC = {
    C: { label: 'Ліцензія C', maxLvl: 112 },
    B: { label: 'Ліцензія B', maxLvl: 132, weeks: 10, cost: 0.05 },
    A: { label: 'Ліцензія A', maxLvl: 150, weeks: 16, cost: 0.1 },
    Pro: { label: 'Ліцензія Pro', maxLvl: 999, weeks: 24, cost: 0.2 },
  };

  let current = null; // кар'єра, що зараз іде (для множника переговорів у ринку)
  function init(W, state) {
    current = state;
    if (state.coach) return state.coach;
    const lvl = W.clubLevel(state.clubId);
    const base = clamp(Math.round(7 + (lvl - 90) / 14), 6, 15);
    const lic = lvl > 145 ? 'Pro' : lvl > 125 ? 'A' : lvl > 100 ? 'B' : 'C'; // поточний клуб завжди в межах ліцензії
    state.coach = {
      attrs: { tac: base, mot: base + 1, youth: base, neg: base - 1 },
      licence: lic, course: null, xp: 0,
      stats: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, streak: 0,
      clubs: [{ id: state.clubId, from: state.season.year, to: null, p: 0, w: 0, d: 0, l: 0, trophies: [] }],
    };
    state.ach = state.ach || {};
    return state.coach;
  }
  const attr = (state, k) => (state.coach ? state.coach.attrs[k] : 10);
  /** Найсильніший клуб (рівень складу), що візьме тренера з такою ліцензією. */
  const maxLevel = (state) => LIC[(state.coach && state.coach.licence) || 'Pro'].maxLvl;
  const nextLicence = (state) => LICENCES[LICENCES.indexOf(state.coach.licence) + 1] || null;

  /** Записати матч тренера. sc — [свої, суперника]; oppLvl — рівень суперника. */
  function match(W, state, sc, oppId, comp) {
    const c = state.coach;
    if (!c) return [];
    const res = sc[0] > sc[1] ? 'w' : sc[0] < sc[1] ? 'l' : 'd';
    c.stats.p++; c.stats[res]++; c.stats.gf += sc[0]; c.stats.ga += sc[1];
    const cur = c.clubs[c.clubs.length - 1];
    if (cur) { cur.p++; cur[res]++; }
    c.streak = res === 'l' ? 0 : c.streak + 1;
    // досвід: кожні 12 матчів +1 до однієї з навичок (не вище 20)
    c.xp++;
    const got = [];
    if (c.xp % 12 === 0) {
      const R = FM.rng(`cxp-${state.season.seed}-${c.xp}`);
      const k = R.weighted(Object.keys(CATTRS), (a) => (c.attrs[a] >= 20 ? 0 : 21 - c.attrs[a]));
      if (c.attrs[k] < 20) { c.attrs[k]++; got.push(`Досвід: ${CATTRS[k].label.toLowerCase()} +1 (тепер ${c.attrs[k]}).`); }
    }
    const ctx = { match: { sc, res, comp, oppGap: oppId && W.club(oppId) ? W.clubLevel(oppId) - W.clubLevel(state.clubId) : 0 } };
    return got.concat(checkAch(W, state, ctx));
  }

  /** Почати курс ліцензії. Повертає { ok, reason }. */
  function startCourse(W, state) {
    const c = state.coach, next = nextLicence(state);
    if (!next) return { ok: false, reason: 'У вас уже найвища ліцензія.' };
    if (c.course) return { ok: false, reason: 'Курс уже триває.' };
    const L = LIC[next], club = W.club(state.clubId);
    if (state.board && state.board.conf < 40) return { ok: false, reason: 'Правління не оплатить курс, поки не довіряє вам.' };
    if (club.balance < L.cost * 3) return { ok: false, reason: 'У клубу немає грошей на курс.' };
    club.balance = Math.round((club.balance - L.cost) * 10000) / 10000;
    c.course = { lic: next, left: L.weeks };
    return { ok: true, weeks: L.weeks, cost: L.cost };
  }

  // ---------------- 41. Бачення правління ----------------
  const VISION = {
    title: { label: (g) => `Виграти чемпіонат до сезону ${seasonTag(g.until)}` },
    ucl: { label: (g) => `Вийти в Лігу чемпіонів до сезону ${seasonTag(g.until)}` },
    europe: { label: (g) => `Потрапити в єврокубки до сезону ${seasonTag(g.until)}` },
    top: { label: (g) => `Фінішувати не нижче ${g.pos}-го місця до сезону ${seasonTag(g.until)}` },
    promotion: { label: (g) => `Вийти до вищої ліги до сезону ${seasonTag(g.until)}` },
    youth: { label: () => 'Щосезону: щонайменше двоє гравців до 21 року зіграли 10+ матчів ліги' },
    finance: { label: () => 'Щосезону: не закінчувати сезон з мінусом на рахунку' },
    facilities: { label: (g) => `Підняти тренувальну базу до рівня ${g.lvl} до сезону ${seasonTag(g.until)}` },
  };

  /** Скласти бачення на кілька сезонів для поточного клубу. */
  function makeVision(W, state) {
    const y = state.season.year, c = W.club(state.clubId);
    const lg = W.league(c.league) || {};
    const t = FM.board.target(W, state.clubId);
    const goals = [];
    if (lg.tier === 2) goals.push({ kind: 'promotion', until: y + 1 });
    else if (t.kind === 'title') goals.push({ kind: 'title', until: y + 2 });
    else if (t.kind === 'ucl') goals.push({ kind: 'title', until: y + 3 });
    else if (t.kind === 'europe') goals.push({ kind: 'ucl', until: y + 2 });
    else if (t.kind === 'tophalf') goals.push({ kind: 'europe', until: y + 2 });
    else goals.push({ kind: 'top', pos: Math.max(1, Math.ceil(W.clubsOf(c.league).length / 2)), until: y + 2 });
    goals.push({ kind: 'youth' });
    goals.push({ kind: 'finance' });
    const fac = FM.club ? FM.club.facilities(W, c.id) : null;
    if (fac && fac.training < 16) goals.push({ kind: 'facilities', lvl: fac.training + 2, until: y + 3 });
    for (const g of goals) { g.status = 'ongoing'; g.label = VISION[g.kind].label(g); }
    state.vision = { since: y, club: c.id, goals };
    return state.vision;
  }

  /**
   * Підсумок сезону для бачення й досягнень. info: { pos, zone, champion, trophies, promoted, relegated, startBalance }.
   * Повертає { lines, conf } — що сталося і як змінилася довіра.
   */
  function endSeason(W, state, info) {
    const S = state.season, y = S.year, me = W.club(state.clubId);
    const out = { lines: [], conf: 0 };
    const v = state.vision && state.vision.club === state.clubId ? state.vision : makeVision(W, state);
    info.youth = me.players.map((id) => W.player(id)).filter((p) => (W.age(p) ?? 30) <= 21 && S.ps[p.id] && S.ps[p.id][0] >= 10).length;
    const Z = (FM.season.ZONES[info.league] || {});
    for (const g of v.goals) {
      if (g.status !== 'ongoing' && g.until) continue;
      let ok = null;
      if (g.kind === 'title') ok = info.champion;
      else if (g.kind === 'ucl') ok = !info.tier2 && info.pos <= (Z.ucl || 0);
      else if (g.kind === 'europe') ok = !info.tier2 && info.pos <= (Z.uel || 0);
      else if (g.kind === 'top') ok = !info.tier2 && info.pos <= g.pos;
      else if (g.kind === 'promotion') ok = info.promoted;
      else if (g.kind === 'facilities') ok = FM.club && FM.club.facilities(W, me.id).training >= g.lvl;
      else if (g.kind === 'youth') { ok = info.youth >= 2; g.last = info.youth; } else if (g.kind === 'finance') { ok = me.balance >= 0; g.last = me.balance; }
      if (!g.until) { // щосезонні
        g.status = ok ? 'kept' : 'missed';
        out.conf += ok ? 3 : -5;
        out.lines.push(`${g.label}: ${ok ? 'виконано' : 'не виконано'}.`);
      } else if (ok) { g.status = 'done'; g.done = y; out.conf += 10; out.lines.push(`${g.label}: виконано!`); }
      else if (y >= g.until) { g.status = 'failed'; out.conf -= 12; out.lines.push(`${g.label}: не вдалося.`); }
    }
    // усі цілі з терміном закрито — нове бачення наступного сезону
    if (v.goals.filter((g) => g.until).every((g) => g.status !== 'ongoing')) state.vision = null;
    if (state.board) state.board.conf = clamp(state.board.conf + out.conf, 0, 100);
    out.ach = checkAch(W, state, { season: info });
    return out;
  }

  // ---------------- 42. Розмови й обіцянки ----------------
  const TALK = {
    praise: { label: 'Похвалити', hint: 'Добре працює, коли гравець справді у формі.' },
    criticize: { label: 'Покритикувати', hint: 'Професіонала мобілізує, решту — образить. Якщо гравець у формі — несправедливо.' },
    time: { label: 'Пообіцяти ігровий час', hint: 'Настрій одразу вгору; за 6 тижнів має зіграти щонайменше 3 матчі ліги.' },
    sign: { label: 'Пообіцяти підсилення', hint: 'Для лідерів: до кінця трансферного вікна клуб має купити сильного гравця.' },
    contract: { label: 'Пообіцяти новий контракт', hint: 'Коли контракт закінчується: продовжте його за 8 тижнів.' },
    stay: { label: 'Переконати залишитися', hint: 'Для тих, хто просить продажу. Успіх залежить від мотивації тренера.' },
  };
  const formAvg = (p) => (p.form && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null);
  const talkKey = (S) => S.year * 100 + S.week;
  /** Які розмови доступні з гравцем: [{ kind, label, hint, off? }]. */
  function talkOptions(W, state, p) {
    const S = state.season, st = FM.morale.status(W, p);
    const recent = p.talked != null && talkKey(S) - p.talked < 4;
    const yearsLeft = (p.contract || S.year + 2) - S.year - 1;
    const has = (k) => (state.promises || []).some((x) => x.pid === p.id && x.kind === k);
    const opts = [];
    const add = (kind, off) => opts.push({ kind, label: TALK[kind].label, hint: TALK[kind].hint, off: recent ? 'Ви вже говорили з ним нещодавно.' : off || null });
    add('praise'); add('criticize');
    if (st !== 'key') add('time', has('time') ? 'Обіцянку вже дано.' : null);
    if (st === 'key') add('sign', has('sign') ? 'Обіцянку вже дано.' : null);
    if (yearsLeft <= 1) add('contract', has('contract') ? 'Обіцянку вже дано.' : null);
    if (p.wantsOut) add('stay');
    return opts;
  }
  function addMorale(p, d) { p.morale = clamp(FM.morale.get(p) + d, 0, 100); }

  /** Поговорити з гравцем. Повертає { text, good }. */
  function talk(W, state, p, kind) {
    const S = state.season, R = FM.rng(`talk-${S.seed}-${S.week}-${p.id}-${kind}`);
    const mot = attr(state, 'mot'), pro = (p.h && p.h.pro) || 10, fa = formAvg(p);
    p.talked = talkKey(S);
    const promise = (extra) => { state.promises = (state.promises || []).concat([Object.assign({ pid: p.id, kind, y: S.year, w: S.week }, extra)]); };
    let text, good = true;
    if (kind === 'praise') {
      if (fa != null && fa >= 6.8) { addMorale(p, 4 + mot * 0.2); text = 'Гравцеві приємно: він знає, що грає добре.'; }
      else { addMorale(p, 1); text = 'Гравець подякував, але сам розуміє, що міг краще.'; }
    } else if (kind === 'criticize') {
      if (fa != null && fa >= 6.9) { addMorale(p, -8); good = false; text = 'Гравець вважає критику несправедливою: він же у формі.'; }
      else if (R.chance(clamp(0.25 + pro * 0.03 + (mot - 10) * 0.02, 0.1, 0.9))) { addMorale(p, 2); p.spur = 3; text = 'Гравець сприйняв критику й пообіцяв виправитися.'; }
      else { addMorale(p, -6); good = false; text = 'Гравець образився.'; }
    } else if (kind === 'time') {
      addMorale(p, 8); promise({ due: S.week + 6, apps0: (S.ps[p.id] && S.ps[p.id][0]) || 0, need: 3 });
      text = 'Гравець чекатиме більше матчів: щонайменше 3 матчі ліги за 6 тижнів.';
    } else if (kind === 'sign') {
      const winterEnd = FM.cal.at(S, 22), lastW = FM.season.weeks(S) - 1;
      addMorale(p, 5); promise({ due: S.week < winterEnd ? winterEnd : lastW, ca: p.ca - 5 });
      text = `Гравець чекає підсилення до ${S.week < winterEnd ? 'кінця зимового вікна' : 'кінця сезону'}.`;
    } else if (kind === 'contract') {
      addMorale(p, 6); promise({ due: S.week + 8, contract0: p.contract });
      text = 'Гравець чекає нового контракту протягом 8 тижнів.';
    } else if (kind === 'stay') {
      if (R.chance(clamp(0.3 + (mot - 10) * 0.04 + (FM.morale.get(p) - 20) / 100, 0.1, 0.85))) {
        delete p.wantsOut; p.lowWeeks = 0; addMorale(p, 12); promise({ kind: 'time', due: S.week + 6, apps0: (S.ps[p.id] && S.ps[p.id][0]) || 0, need: 3 });
        text = 'Ви переконали гравця залишитися — натомість він чекає більше ігрового часу.';
      } else { addMorale(p, -3); good = false; text = 'Гравець не змінив думки: він хоче піти.'; }
    }
    return { text, good };
  }

  /** Тиждень: курс ліцензії, перевірка обіцянок. Повертає новини. */
  function weekly(W, state) {
    const S = state.season, c = state.coach, news = [];
    if (!c) return news;
    if (c.course && --c.course.left <= 0) {
      c.licence = c.course.lic; c.course = null;
      if (c.licence === 'Pro') c.proEarned = true;
      for (const k of ['tac', 'mot', 'youth']) c.attrs[k] = Math.min(20, c.attrs[k] + 1);
      if (state.board) state.board.rep = Math.min(100, state.board.rep + 3);
      news.push(`Ви отримали ліцензію ${c.licence}. Тактика, мотивація й робота з молоддю +1.`);
      news.push(...checkAch(W, state, {}));
    }
    for (const p of W.squad(state.clubId)) if (p.spur) p.spur--;
    const keep = [];
    for (const pr of state.promises || []) {
      const p = W.player(pr.pid);
      if (!p || p.club !== state.clubId) continue; // пішов — обіцянка знята
      if (pr.y !== S.year && pr.kind !== 'contract') continue; // новий сезон — минулі обіцянки знято
      let kept = null;
      if (pr.kind === 'time') { const apps = ((S.ps[p.id] && S.ps[p.id][0]) || 0) - pr.apps0; if (apps >= pr.need) kept = true; else if (S.week >= pr.due) kept = false; }
      else if (pr.kind === 'sign') {
        const got = (state.transfers || []).some((t) => t.to === state.clubId && !t.loan && t.s === S.year && t.w >= pr.w && W.player(t.p) && W.player(t.p).ca >= pr.ca);
        if (got) kept = true; else if (S.week >= pr.due) kept = false;
      } else if (pr.kind === 'contract') { if ((p.contract || 0) > (pr.contract0 || 0)) kept = true; else if (S.year * 100 + S.week >= pr.y * 100 + pr.due) kept = false; }
      if (kept == null) { keep.push(pr); continue; }
      const nm = p.name;
      if (kept) { addMorale(p, 6); p.trust = (p.trust || 0) + 1; news.push(`${nm}: обіцянку виконано (${TALK[pr.kind].label.toLowerCase()}). Гравець задоволений.`); }
      else {
        addMorale(p, -15); p.trust = (p.trust || 0) - 1;
        if (FM.morale.status(W, p) !== 'youth') p.wantsOut = true;
        if (state.board) state.board.conf = Math.max(0, state.board.conf - 1);
        news.push(`${nm}: ви не дотримали обіцянки (${TALK[pr.kind].label.toLowerCase()}). Гравець розчарований і хоче піти.`);
      }
    }
    state.promises = keep;
    news.push(...checkAch(W, state, {}));
    return news;
  }

  // ---------------- 43. Досягнення ----------------
  const ACH = [
    ['first_win', 'Перша перемога', 'Виграйте перший матч.'],
    ['matches_100', 'Сотня', 'Проведіть 100 матчів.'],
    ['wins_50', '50 перемог', 'Здобудьте 50 перемог.'],
    ['wins_100', '100 перемог', 'Здобудьте 100 перемог.'],
    ['unbeaten_10', 'Без поразок', '10 матчів поспіль без поразок.'],
    ['big_win', 'Розгром', 'Перемога з різницею 5+ м’ячів.'],
    ['giant', 'Повалити велетня', 'Перемога над суперником, сильнішим на 15+ за рівнем.'],
    ['title', 'Чемпіон', 'Виграйте чемпіонат.'],
    ['cup', 'Кубок', 'Виграйте кубок країни.'],
    ['double', 'Золотий дубль', 'Чемпіонат і кубок країни за один сезон.'],
    ['ucl', 'Ліга чемпіонів', 'Виграйте Лігу чемпіонів.'],
    ['uel', 'Ліга Європи', 'Виграйте Лігу Європи.'],
    ['promotion', 'Вгору!', 'Виведіть клуб до вищої ліги.'],
    ['survive', 'Порятунок', 'Збережіть місце, коли правління чекало лише виживання.'],
    ['youth', 'Вихованці', 'Двоє гравців до 21 року зіграли за сезон 10+ матчів ліги.'],
    ['big_buy', 'Гучна покупка', 'Купіть гравця за 50+ млн €.'],
    ['big_sale', 'Рекордний продаж', 'Продайте гравця за 50+ млн €.'],
    ['national', 'Тренер збірної', 'Очольте збірну України.'],
    ['pro', 'Ліцензія Pro', 'Отримайте найвищу тренерську ліцензію.'],
    ['seasons_5', 'Ветеран', 'Проведіть 5 сезонів.'],
    ['loyal', 'Вірність', '5 сезонів в одному клубі.'],
    ['clubs_3', 'Мандрівник', 'Попрацюйте в трьох клубах.'],
  ];
  const ACH_BY = Object.fromEntries(ACH.map(([id, label, hint]) => [id, { id, label, hint }]));

  /** Перевірити досягнення; ctx: { match?, season? }. Повертає новини про нові. */
  function checkAch(W, state, ctx) {
    const c = state.coach;
    if (!c) return [];
    const a = (state.ach = state.ach || {});
    const got = [];
    const give = (id) => { if (!a[id]) { a[id] = seasonTag(state.season.year); got.push(`Досягнення: «${ACH_BY[id].label}» — ${ACH_BY[id].hint.toLowerCase()}`); } };
    const s = c.stats;
    if (s.w >= 1) give('first_win');
    if (s.p >= 100) give('matches_100');
    if (s.w >= 50) give('wins_50');
    if (s.w >= 100) give('wins_100');
    if (c.streak >= 10) give('unbeaten_10');
    if (ctx.match) {
      const m = ctx.match;
      if (m.res === 'w' && m.sc[0] - m.sc[1] >= 5) give('big_win');
      if (m.res === 'w' && m.oppGap >= 15) give('giant');
    }
    if (ctx.season) {
      const i = ctx.season;
      if (i.champion) give('title');
      if (i.cupWon) give('cup');
      if (i.champion && i.cupWon) give('double');
      if ((i.trophies || []).includes('ucl')) give('ucl');
      if ((i.trophies || []).includes('uel')) give('uel');
      if (i.promoted) give('promotion');
      if (i.targetKind === 'survive' && !i.relegated) give('survive');
      if (i.youth >= 2) give('youth');
    }
    for (const t of state.transfers || []) {
      if (t.loan) continue;
      if (t.to === state.clubId && t.fee >= 50) give('big_buy');
      if (t.from === state.clubId && t.fee >= 50) give('big_sale');
    }
    if (state.intl && state.intl.coach) give('national');
    if (c.proEarned) give('pro');
    const seasons = (state.history || []).length;
    if (seasons >= 5) give('seasons_5');
    const cur = c.clubs[c.clubs.length - 1];
    if (cur && state.season.year - cur.from >= 5) give('loyal');
    if (new Set(c.clubs.map((x) => x.id)).size >= 3) give('clubs_3');
    return got;
  }

  /** Зміна клубу: закрити запис попереднього, відкрити новий, нове бачення. */
  function onJob(W, state, newId) {
    const c = state.coach;
    if (c) {
      const cur = c.clubs[c.clubs.length - 1];
      if (cur && cur.to == null) cur.to = state.season.year;
      c.clubs.push({ id: newId, from: state.season.year, to: null, p: 0, w: 0, d: 0, l: 0, trophies: [] });
    }
    state.vision = null;
    state.promises = [];
  }
  /** Трофеї сезону в запис поточного клубу. */
  function addTrophies(state, list) {
    const cur = state.coach && state.coach.clubs[state.coach.clubs.length - 1];
    if (cur) cur.trophies = cur.trophies.concat(list);
  }
  /** Множник ціни й зарплати в угодах клубу тренера (переговори). */
  const negK = (state, clubId) => (state && state.coach && clubId === state.clubId ? 1 - (state.coach.attrs.neg - 10) * 0.006 : 1);
  const negFor = (clubId) => negK(current, clubId);

  FM.career = { CATTRS, LIC, LICENCES, VISION, TALK, ACH, ACH_BY, init, attr, maxLevel, nextLicence, match, startCourse, makeVision, endSeason,
    talkOptions, talk, weekly, checkAch, onJob, addTrophies, negK, negFor, formAvg };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
