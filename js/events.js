// Випадкові події тижня: життя клубу поза полем — смішне, зворушливе, скандальне. Частина — просто новина,
// частина — з вибором (лист у пошті, як у FM). Наслідки: настрій гравців і фанатів, гроші, довіра правління.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;
  const clamp = (x) => Math.max(0, Math.min(100, x));
  const mor = (p, d) => { if (p) p.morale = clamp((p.morale ?? 60) + d); };
  const fans = (W, state, d) => { const f = FM.club.fans(W, state.clubId); f.mood = clamp(f.mood + d); };
  const money = (W, state, d) => { const c = W.club(state.clubId); c.balance = r2(c.balance + d); if (state.board && state.board.fin) state.board.fin.other = r2((state.board.fin.other || 0) + d); };
  const conf = (state, d) => { if (state.board) state.board.conf = clamp(state.board.conf + d); };
  const k = (W, state) => Math.max(0.02, W.club(state.clubId).income0 || 0.05); // гроші — у масштабі клубу
  const ownerGift = (c) => r2(Math.min(120, k(c.W, c.state) * 60)); // ≈1,5 сезонного доходу клубу

  // ctx: { W, state, R, p — випадковий гравець, star — найкращий, kid — молодий, vet — ветеран, n(p) — ім’я }
  const EVENTS = [
    { id: 'tiktok', w: 3, need: 'kid', text: (c) => `Відео ${c.n(c.kid)} з тренування набрало 3 мільйони переглядів у TikTok. Фанати в захваті, продажі футболок зросли.`,
      fx: (c) => { mor(c.kid, 6); fans(c.W, c.state, 3); money(c.W, c.state, k(c.W, c.state) * 0.4); } },
    { id: 'capybara', w: 2, need: 'p', text: (c) => `${c.n(c.p)} завів капібару й назвав її на честь клубу. Фото облетіли всі соцмережі.`, fx: (c) => { mor(c.p, 5); fans(c.W, c.state, 2); } },
    { id: 'baby', w: 2, need: 'p', text: (c) => `${c.n(c.p)} став батьком! Команда привітала його тортом на тренуванні.`, fx: (c) => { mor(c.p, 10); for (const q of c.sq) mor(q, 1); } },
    { id: 'mascot', w: 2, text: (c) => `Талісман клубу затанцював на трибуні суперника й став мемом тижня. Уболівальники вимагають підвищити йому зарплату.`, fx: (c) => fans(c.W, c.state, 3) },
    { id: 'legend', w: 2, need: 'kid', text: (c) => `Легенда клубу завітала на тренування й годину показувала молоді, як бити штрафні. ${c.n(c.kid)} не відходив від неї ні на крок.`,
      fx: (c) => { for (const q of c.sq.filter((x) => (c.W.age(x) ?? 30) <= 21)) mor(q, 3); if (c.kid.attrs.set) c.kid.attrs.set = Math.min(20, c.kid.attrs.set + 1); } },
    { id: 'mural', w: 2, need: 'star', text: (c) => `Фанати намалювали величезний мурал з ${c.g(c.star)} біля стадіону.`, fx: (c) => { mor(c.star, 7); fans(c.W, c.state, 2); } },
    { id: 'nickname', w: 2, need: 'kid', text: (c) => `Уболівальники прозвали ${c.g(c.kid)} «Малим генієм». Тепер це прізвисько скандує весь стадіон.`, fx: (c) => mor(c.kid, 7) },
    { id: 'boots', w: 2, need: 'star', text: (c) => `${c.n(c.star)} загубив «щасливі» бутси й тиждень ходить похмурий. Пошуки тривають.`, fx: (c) => mor(c.star, -4) },
    { id: 'storm', w: 1, text: (c) => `Буря зірвала частину даху над трибуною. Ремонт коштуватиме ${FM.market.fmtM(r2(k(c.W, c.state) * 0.8))}.`, fx: (c) => money(c.W, c.state, -k(c.W, c.state) * 0.8) },
    { id: 'kit', w: 2, text: () => 'У мережу «злили» дизайн нової форми — фанати в захваті. Магазин не встигає приймати передзамовлення.', fx: (c) => { fans(c.W, c.state, 3); money(c.W, c.state, k(c.W, c.state) * 0.6); } },
    { id: 'rumour', w: 1, text: () => 'Таблоїди пишуть, що вами цікавиться клуб з топ-ліги. Правління нервує, а ваша репутація росте.', fx: (c) => { conf(c.state, -2); if (c.state.board) c.state.board.rep = Math.min(100, c.state.board.rep + 1); } },
    { id: 'pizza', w: 2, need: 'vet', text: (c) => `${c.n(c.vet)} пригостив усю команду піцою після тренування. Атмосфера в роздягальні — чудова.`, fx: (c) => { for (const q of c.sq) mor(q, 1.5); } },
    { id: 'lottery', w: 1, text: () => 'Фанат виграв у лотерею й купив 1000 квитків для дітей з інтернатів. Стадіон у сльозах.', fx: (c) => { fans(c.W, c.state, 4); money(c.W, c.state, k(c.W, c.state) * 0.2); } },
    { id: 'owner_new', w: 0.35, text: (c) => `Сенсація: клуб купив новий багатий власник! Він виділяє ${FM.market.fmtM(ownerGift(c))} на підсилення й чекає більшого.`,
      fx: (c) => { money(c.W, c.state, ownerGift(c)); const club = c.W.club(c.state.clubId); club.wageBudget = Math.round(club.wageBudget * 1.15); conf(c.state, -5); if (c.state.board && FM.boardroom) c.state.board.target = FM.boardroom.shiftTarget(c.W, c.state.clubId, c.state.board.target, 1); } },
    { id: 'owner_crisis', w: 0.35, text: () => 'У власника клубу проблеми з бізнесом: бюджет урізано на 10%. Правління просить економити.',
      fx: (c) => { const club = c.W.club(c.state.clubId); club.balance = r2(club.balance * 0.9); club.wageBudget = Math.round(club.wageBudget * 0.92); } },
    // ---- з вибором ----
    { id: 'wedding', w: 2, need: 'p', ask: (c) => `${c.n(c.p)} просить відпустку на тиждень: у нього весілля!`,
      opts: [['Відпустити', 'Він не гратиме цього тижня, але буде щасливий.', (c) => { mor(c.p, 12); if (FM.medical) FM.medical.rest(c.state, c.p.id); return `${c.n(c.p)} поїхав на весілля. Команда передала подарунок.`; }],
        ['Відмовити', 'Матчі важливіші. Гравець образиться.', (c) => { mor(c.p, -12); return `${c.n(c.p)} засмучений: весілля довелося перенести.`; }]] },
    { id: 'fight', w: 2, need: 'pair', ask: (c) => `На тренуванні побилися ${c.n(c.p)} і ${c.n(c.q)}. Що робити?`,
      opts: [['Оштрафувати обох', 'Дисципліна понад усе.', (c) => { mor(c.p, -5); mor(c.q, -5); for (const x of c.sq) mor(x, 0.5); return 'Обох оштрафовано. Роздягальня оцінила вашу твердість.'; }],
        ['Помирити', 'Розмова втрьох.', (c) => { if (c.R.chance(0.7)) { mor(c.p, 3); mor(c.q, 3); return `${c.n(c.p)} і ${c.n(c.q)} потиснули руки.`; } mor(c.p, -3); mor(c.q, -3); return 'Розмова не допомогла: гравці досі не розмовляють.'; }],
        ['Не втручатися', 'Хай самі розберуться.', (c) => { for (const x of c.sq) mor(x, -1.5); return 'Конфлікт тліє, атмосфера в команді погіршилась.'; }]] },
    { id: 'charity', w: 2, ask: () => 'Фонд просить зіграти благодійний матч проти зірок шоу-бізнесу.',
      opts: [['Погодитись', 'Фанати й репутація зростуть, гравці трохи втомляться.', (c) => { fans(c.W, c.state, 5); if (c.state.board) c.state.board.rep = Math.min(100, c.state.board.rep + 1); for (const x of c.sq.slice(0, 6)) x.fitness = Math.max(70, (x.fitness ?? 100) - 8); return 'Благодійний матч зібрав повний стадіон. Ваш воротар відбив пенальті від відомого співака.'; }],
        ['Відмовити', 'Без ризику втоми.', (c) => { fans(c.W, c.state, -2); return 'Фонд розчарований відмовою.'; }]] },
    { id: 'documentary', w: 1.5, ask: () => 'Стрімінговий сервіс хоче зняти документальний серіал про клуб: камери будуть усюди, навіть у роздягальні.',
      opts: [['Так', 'Гроші й слава, але не всім гравцям подобаються камери.', (c) => { money(c.W, c.state, k(c.W, c.state) * 3); fans(c.W, c.state, 3); for (const x of c.sq.filter((x) => ((x.h && x.h.pro) || 11) >= 14)) mor(x, -3); return `Зйомки почалися. Клуб отримав ${FM.market.fmtM(r2(k(c.W, c.state) * 3))}.`; }],
        ['Ні', 'Роздягальня — святе.', () => 'Ви відмовили. Гравці вдячні.']] },
    { id: 'trial', w: 1.5, ask: () => 'Невідомий 17-річний хлопець з аматорської ліги проситься на перегляд. Каже, що забиває по п’ять за матч.',
      opts: [['Дати шанс', 'Може, це новий талант. А може, й ні.', (c) => {
        if (!c.R.chance(0.35) || !FM.dev || !FM.dev.makeYouth) return 'Хлопець старався, але до рівня команди йому далеко. Порадили йому не здаватися.';
        const y = FM.dev.makeYouth(c.W, c.state.clubId, c.R, c.state.season.year, null, true); // «золотий» юнак — високий потенціал
        if (y) { y.contract = c.state.season.year + 3; y.wage = y.wage || Math.max(1, FM.market.fairWage(y.value, c.W.club(c.state.clubId).league)); }
        if (!y) return 'Перегляд не вдався.';
        if (FM.youth) FM.youth.toU21(c.W, c.state, y.id);
        return `Сенсація! ${y.name} вразив тренерів і підписав контракт. Він у молодіжній команді.`; }],
        ['Відмовити', 'Немає часу.', () => 'Хлопець пішов на перегляд до суперника…']] },
    { id: 'party', w: 1.5, need: 'star', ask: (c) => `${c.n(c.star)} виклав фото з вечірки о третій ночі — за день до тренування.`,
      opts: [['Оштрафувати', 'Правила одні для всіх.', (c) => { mor(c.star, -6); fans(c.W, c.state, 1); return `${c.n(c.star)} сплатив штраф і вибачився перед командою.`; }],
        ['Пробачити', 'Зірці можна.', (c) => { mor(c.star, 3); conf(c.state, -1); for (const x of c.sq.filter((x) => x !== c.star)) mor(x, -0.8); return 'Ви закрили очі на вечірку. Дехто в роздягальні невдоволений.'; }]] },
    { id: 'kid_fan', w: 1.5, ask: () => 'Хворий маленький фанат мріє зустрітися з командою.',
      opts: [['Запросити на тренування', 'Усі гравці підписали йому м’яч.', (c) => { for (const x of c.sq) mor(x, 2); fans(c.W, c.state, 4); return 'Хлопчик провів день з командою й забив пенальті воротареві. Зворушливо до сліз.'; }],
        ['Надіслати футболку', 'Швидше.', (c) => { fans(c.W, c.state, 1); return 'Клуб надіслав футболку з автографами.'; }]] },
  ];

  /** Вибрати подію тижня (або нічого). Повертає { id, text } — новина, або { id, ask, opts } — потрібне рішення. */
  function week(W, state, name = (p) => p.name, gen = null) {
    const S = state.season;
    const R = FM.rng(`ev-${S.seed}-${S.year}-${S.week}-${state.clubId}`);
    if (state.evPending || !R.chance(0.24)) return null;
    const sq = W.squad(state.clubId).filter((p) => !p.loan);
    if (sq.length < 12) return null;
    const pick = (list) => (list.length ? R.pick(list) : null);
    const ctx = { W, state, R, sq, n: name, g: (p) => (gen && gen(p)) || name(p),
      p: pick(sq), star: [...sq].sort((a, b) => b.ca - a.ca)[0], kid: pick(sq.filter((p) => (W.age(p) ?? 30) <= 20)), vet: pick(sq.filter((p) => (W.age(p) ?? 0) >= 30)) };
    const pair = sq.filter((p) => p !== ctx.p);
    ctx.q = pick(pair);
    const recent = state.evRecent || [];
    const ok = EVENTS.filter((e) => !recent.includes(e.id) && (!e.need || (e.need === 'pair' ? ctx.p && ctx.q : ctx[e.need])));
    const ev = R.weighted(ok, (e) => e.w);
    if (!ev) return null;
    state.evRecent = recent.concat([ev.id]).slice(-8); // не повторювати свіжі
    if (ev.opts) {
      state.evPending = { id: ev.id, ask: ev.ask(ctx), ids: { p: ctx.p && ctx.p.id, q: ctx.q && ctx.q.id, star: ctx.star && ctx.star.id, kid: ctx.kid && ctx.kid.id, vet: ctx.vet && ctx.vet.id }, opts: ev.opts.map(([l, h]) => [l, h]) };
      return { id: ev.id, ask: state.evPending.ask };
    }
    ev.fx(ctx);
    return { id: ev.id, text: ev.text(ctx) };
  }
  /** Відповідь на подію з вибором (i — номер варіанта). Повертає текст-наслідок. */
  function answer(W, state, i, name = (p) => p.name) {
    const pe = state.evPending;
    if (!pe) return null;
    const ev = EVENTS.find((e) => e.id === pe.id);
    state.evPending = null;
    if (!ev || !ev.opts[i]) return null;
    const P = (id) => (id ? W.player(id) : null);
    const ctx = { W, state, R: FM.rng(`eva-${state.season.seed}-${state.season.week}-${i}`), sq: W.squad(state.clubId).filter((p) => !p.loan), n: name, g: name,
      p: P(pe.ids.p), q: P(pe.ids.q), star: P(pe.ids.star), kid: P(pe.ids.kid), vet: P(pe.ids.vet) };
    return ev.opts[i][2](ctx);
  }

  FM.events = { EVENTS, week, answer };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
