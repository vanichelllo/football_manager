// Кабінет правління (як у FM): прохання до правління, співбесіда при новій роботі й обіцянки,
// фарм-клуби (партнери для оренди молоді), виклики гравців до збірних у міжнародні вікна.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---------------- Прохання до правління ----------------
  const REQUESTS = {
    wages: { label: 'Збільшити фонд зарплат на 10%', hint: 'Правління погодиться, якщо довіряє вам і фінанси в порядку.' },
    budget: { label: 'Виділити гроші на трансфери', hint: 'Власник додає гроші з власної кишені — якщо задоволений вами й клуб великий.' },
    patience: { label: 'Знизити очікування на сезон', hint: 'Лише на початку сезону; довіра трохи впаде.' },
    contract: { label: 'Новий контракт для мене', hint: 'Коли правління дуже задоволене: довгий контракт захищає від звільнення.' },
    affiliate: { label: 'Знайти фарм-клуб', hint: 'Партнерський клуб, куди можна віддавати молодь в оренду з гарантованою практикою.' },
  };
  const asked = (state, kind) => ((state.board.asked || {})[kind] === state.season.year);
  /** Відповідь правління: { ok, text } (одне прохання кожного виду на сезон). */
  function request(W, state, kind, extra) {
    const b = state.board, S = state.season, c = W.club(state.clubId);
    if (!REQUESTS[kind]) return { ok: false, text: 'Невідоме прохання.' };
    if (asked(state, kind) && kind !== 'affiliate') return { ok: false, text: 'Цього сезону ви вже про це просили. Правління не любить повторів.' };
    b.asked = { ...(b.asked || {}), [kind]: S.year };
    const ratio = FM.finance ? FM.finance.ratio(state) : 0.8;
    const lvl = W.clubLevel(c.id);
    if (kind === 'wages') {
      if (b.conf < 55) return { ok: false, text: 'Правління відмовляє: спершу покажіть результати.' };
      if (ratio > 0.95 || c.balance < 0) return { ok: false, text: 'Правління відмовляє: клуб і так витрачає майже все, що заробляє.' };
      c.wageBudget = Math.round(c.wageBudget * 1.1);
      return { ok: true, text: `Погоджено: фонд зарплат — ${c.wageBudget} тис. € на тиждень.` };
    }
    if (kind === 'budget') {
      if (b.conf < 65 || b.rep < 45) return { ok: false, text: 'Власник не готовий вкладати: довіра чи ваша репутація ще замалі.' };
      if (lvl < 115) return { ok: false, text: 'Власник відповідає, що клуб живе за свої: вільних грошей немає.' };
      const add = r2(Math.max(1, (c.income0 || 0.1) * 38 * 0.12));
      c.balance = r2(c.balance + add);
      if (b.fin) b.fin.transfers = r2((b.fin.transfers || 0) + add);
      b.conf = Math.max(0, b.conf - 4);
      return { ok: true, text: `Власник виділив ${FM.market.fmtM(add)}. Від вас чекають підсилення — довіра трохи знизилась.` };
    }
    if (kind === 'patience') {
      if (S.week > FM.cal.at(S, 4)) return { ok: false, text: 'Сезон уже йде — правління не змінюватиме цілі.' };
      if (b.target.lowered === S.year) return { ok: false, text: 'Очікування вже знижено.' };
      const t = shiftTarget(W, state.clubId, b.target, -1);
      if (t.kind === b.target.kind) return { ok: false, text: 'Нижче вже нікуди.' };
      b.target = { ...t, lowered: S.year };
      b.conf = Math.max(0, b.conf - 6);
      return { ok: true, text: `Правління погодилось: ${FM.board.TARGETS[t.kind].label.toLowerCase()}. Довіра трохи знизилась.` };
    }
    if (kind === 'contract') {
      if (b.conf < 72 || (b.seasons || 0) < 1) return { ok: false, text: 'Правління відповідає: поговоримо після вдалого сезону.' };
      b.contract = S.year + 3;
      b.rep = Math.min(100, b.rep + 2);
      return { ok: true, text: `Новий контракт до літа ${b.contract}. З довгим контрактом правління терплячіше до невдач.` };
    }
    if (kind === 'affiliate') {
      if ((state.affiliates || []).length >= 2) return { ok: false, text: 'У клубу вже два фарм-клуби.' };
      if (b.conf < 45) return { ok: false, text: 'Правління відкладає питання: спершу результати.' };
      const cands = affiliateCandidates(W, state);
      if (!extra) return { ok: true, text: 'Правління згодне. Оберіть партнера.', cands };
      if (!cands.some((x) => x.id === extra)) return { ok: false, text: 'Цей клуб не погодився.' };
      state.affiliates = (state.affiliates || []).concat([extra]);
      const L = W.club(extra).league;
      state.knownLeagues = { ...(state.knownLeagues || {}), [L]: true }; // скаути партнера знають свою лігу
      return { ok: true, text: `${W.club(extra).name} — ваш фарм-клуб. Тепер його ліга розвідана, а молодь можна віддавати туди з гарантованою практикою.` };
    }
    return { ok: false, text: '' };
  }

  /** Ціль на сезон на щабель вище (dir = 1) або нижче (−1). */
  function shiftTarget(W, clubId, t, dir) {
    const c = W.club(clubId), n = W.clubsOf(c.league).length, Z = FM.season.ZONES[c.league] || {};
    const ladder = Z.promo
      ? [['promotion', Z.promo], ['tophalf', Math.ceil(n / 2)], ['midtable', n - 3]]
      : [['title', 1], ['ucl', Z.ucl || 1], ['europe', Z.uel || 3], ['tophalf', Math.ceil(n / 2)], ['survive', n - (Z.rel || 3)]];
    const i = Math.max(0, ladder.findIndex(([k]) => k === t.kind));
    const j = Math.max(0, Math.min(ladder.length - 1, i - dir));
    return { kind: ladder[j][0], pos: ladder[j][1], rank: t.rank };
  }

  // ---------------- Співбесіда ----------------
  const INTERVIEW = [
    { k: 'goal', q: 'Які ваші цілі на першому сезоні?', a: [
      ['ambitious', 'Боротимемося за більше, ніж від нас чекають.', 'Ціль на щабель вища; правління в захваті, але й вимоги вищі.'],
      ['realistic', 'Виконаємо те, чого чекає правління.', 'Ціль як запропонувало правління.'],
      ['modest', 'Спершу треба перебудувати команду.', 'Ціль на щабель нижча; довіра на старті трохи менша.']] },
    { k: 'youth', q: 'Як ви ставитеся до молоді з академії?', a: [
      ['youth', 'Даватиму шанс молодим.', 'Обіцянка: гравці до 21 року — щонайменше 10% ігрового часу в лізі.'],
      ['results', 'Грає той, хто сильніший.', 'Без обіцянок.']] },
    { k: 'style', q: 'Який футбол побачать уболівальники?', a: [
      ['attacking', 'Атакувальний, видовищний.', 'Обіцянка: щонайменше 1,4 гола за матч у лізі; фанати раді.'],
      ['pragmatic', 'Прагматичний: результат понад усе.', 'Без обіцянок.']] },
  ];
  /** Застосувати відповіді співбесіди одразу після призначення. answers — { goal, youth, style }. */
  function applyInterview(W, state, answers) {
    const b = state.board, notes = [];
    if (answers.goal === 'ambitious') { b.target = shiftTarget(W, state.clubId, b.target, 1); b.conf = Math.min(100, b.conf + 8); }
    if (answers.goal === 'modest') { b.target = shiftTarget(W, state.clubId, b.target, -1); b.conf = Math.max(0, b.conf - 5); }
    notes.push(`Ціль: ${FM.board.TARGETS[b.target.kind].label.toLowerCase()}.`);
    b.promises = {};
    if (answers.youth === 'youth') { b.promises.youth = true; notes.push('Ви пообіцяли давати шанс молоді.'); }
    if (answers.style === 'attacking') { b.promises.attack = true; notes.push('Ви пообіцяли атакувальний футбол.'); if (FM.club && FM.club.fans) { const f = FM.club.fans(W, state.clubId); if (f && f.mood != null) f.mood = Math.min(100, f.mood + 5); } }
    b.interviewed = state.season.year;
    return notes;
  }
  /** Перевірка обіцянок кожні 8 тижнів сезону: невиконані — довіра падає. Повертає новини. */
  function promisesWeek(W, state) {
    const b = state.board, S = state.season, pr = b.promises || {};
    const fx = S.fixtures.filter((f) => f.s && (f.h === state.clubId || f.a === state.clubId) && f.l);
    if (fx.length < 8 || S.week % 8 !== 0) return [];
    const out = [];
    if (pr.youth) {
      let all = 0, young = 0;
      for (const p of W.squad(state.clubId)) { const a = (S.ps[p.id] && S.ps[p.id][0]) || 0; all += a; if ((W.age(p) ?? 25) <= 21) young += a; }
      if (all && young / all < 0.1) { b.conf = Math.max(0, b.conf - 3); out.push('Правління нагадує: ви обіцяли давати шанс молоді, але молоді гравці майже не грають.'); }
    }
    if (pr.attack) {
      const goals = fx.reduce((s, f) => s + (f.h === state.clubId ? f.s[0] : f.s[1]), 0);
      if (goals / fx.length < 1.4) { b.conf = Math.max(0, b.conf - 2); out.push(`Уболівальники й правління чекали атакувального футболу: лише ${String(Math.round((goals / fx.length) * 100) / 100).replace('.', ',')} гола за матч.`); }
    }
    return out;
  }

  // ---------------- Фарм-клуби ----------------
  /** Кандидати в партнери: слабші клуби вашої країни (друга ліга) і менших ліг Європи. */
  function affiliateCandidates(W, state) {
    const me = W.club(state.clubId), lvl = W.clubLevel(me.id), home = me.league.replace(/2$/, '');
    const taken = new Set([...(state.affiliates || []), me.id]);
    const all = [...W.clubs.values()].filter((c) => !taken.has(c.id) && W.clubLevel(c.id) <= lvl - 15 && W.clubLevel(c.id) >= lvl - 55);
    const score = (c) => (c.league.replace(/2$/, '') === home ? 30 : 0) + (W.db.leagues.find((l) => l.id === c.league).tier === 2 ? 10 : 0) - Math.abs(W.clubLevel(c.id) - (lvl - 30)) / 3;
    return all.sort((a, b) => score(b) - score(a)).slice(0, 4);
  }
  /** Віддати молодого гравця у фарм-клуб: оренда до кінця сезону, гарантована практика, партнер платить половину зарплати. */
  function sendToAffiliate(W, state, pid, affId) {
    const p = W.player(pid);
    if (!p || p.club !== state.clubId || !(state.affiliates || []).includes(affId)) return { ok: false, text: 'Не вийшло.' };
    if ((W.age(p) ?? 25) > 23) return { ok: false, text: 'У фарм-клуб — лише гравці до 23 років.' };
    if (!FM.market.windowOpen(state.season)) return { ok: false, text: 'Оренда — лише у відкрите трансферне вікно.' };
    FM.market.loanIn(W, state, p, affId, 0.5);
    p.loan.aff = true; // у партнера гарантовано грає
    return { ok: true, text: `${p.name} іде у фарм-клуб ${W.club(affId).name} до кінця сезону.` };
  }

  // ---------------- Виклики до збірних ----------------
  /** Міжнародне вікно: ваші гравці, яких викликали до збірних, повертаються втомленими, зрідка — з травмою. */
  function callups(W, state, week) {
    const S = state.season;
    if (!FM.nations) return [];
    const R = FM.rng(`callup-${S.seed}-${week}-${state.clubId}`);
    const mine = W.squad(state.clubId).filter((p) => p.nat && !p.injury);
    const nats = [...new Set(mine.map((p) => p.nat))];
    const called = [];
    for (const nat of nats) {
      const sq = new Set(FM.nations.squad(W, nat).map((p) => p.id));
      for (const p of mine) if (p.nat === nat && sq.has(p.id)) called.push(p);
    }
    const out = [];
    for (const p of called) {
      p.fitness = Math.max(55, (p.fitness ?? 100) - R.range(8, 18));
      p.caps = (p.caps || 0) + (R.chance(0.7) ? 1 : 0) + (R.chance(0.5) ? 1 : 0);
      if (R.chance(0.04)) { p.injury = Math.max(p.injury || 0, 1 + R.int(3)); out.push({ p, hurt: p.injury }); } else out.push({ p });
    }
    return out;
  }

  FM.boardroom = { REQUESTS, asked, request, shiftTarget, INTERVIEW, applyInterview, promisesWeek, affiliateCandidates, sendToAffiliate, callups };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
