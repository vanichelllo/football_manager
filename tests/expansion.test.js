'use strict';
// Розширення гри (19 пунктів після дорожньої карти): ринок, скаути світу, роздягальня, молодь, агенти…
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'cups', 'club', 'nations', 'career']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en = 'Shakhtar Donetsk') {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'exp') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state);
  return { W, state };
}

test('2. ринок: ціна росте від форми й падає від травми; чутки', () => {
  const { W, state } = fresh();
  const sq = W.squad(state.clubId).sort((a, b) => b.ca - a.ca);
  const hot = sq[2], hurt = sq[3];
  const v0 = hot.value, v1 = hurt.value;
  hot.form = [8.2, 8.5, 7.9, 8.1, 8.4];
  hurt.injury = 10; hurt.form = [6.6];
  for (let w = 0; w < 10; w++) { state.season.week = w + 4; FM.market.valuesWeek(W, state); }
  assert.ok(hot.value > v0 * 1.15, `${v0} → ${hot.value}`);
  assert.ok(hurt.value < v1 * 0.95, `${v1} → ${hurt.value}`);
  // чутки про гравця у формі
  let rumour = false;
  for (let w = 0; w < 60 && !rumour; w++) { state.season.week = w % 38; FM.market.rumoursWeek(W, state, FM.rng('r' + w)); rumour = !!hot.interest; }
  assert.ok(rumour);
});

test('3. скаути по світу: знаходять таланти, їх можна підписати, непідписаних забирають', () => {
  require('../js/world-scout.js');
  const { W, state } = fresh();
  W.club(state.clubId).balance = 50;
  const sc = FM.market.scouts(state)[0];
  sc.region = 'w-sa'; sc.level = 18;
  for (let w = 0; w < 12; w++) { state.season.week = w; FM.worldScout.week(W, state); }
  const found = (state.talents || []).map((id) => W.player(id));
  assert.ok(found.length >= 1, 'хоч один талант');
  const t = found[0];
  assert.ok(['BRA', 'ARG', 'URU', 'COL', 'ECU', 'PAR', 'CHI'].includes(t.nat));
  assert.ok(t.pa > t.ca + 20 && W.age(t) >= 16 && W.age(t) <= 21);
  const r = FM.worldScout.sign(W, state, t.id);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(t.club, state.clubId);
  // решта з часом зникає з переліку
  for (let w = 12; w < 37; w++) { state.season.week = w; sc.region = null; FM.worldScout.week(W, state); }
  assert.strictEqual((state.talents || []).length, 0);
});

test('4. роздягальня: групи й лідери, збори впливають на настрій і силу, продаж лідера засмучує', () => {
  require('../js/dressing.js');
  const { W, state } = fresh('Shakhtar Donetsk');
  const gs = FM.dressing.groups(W, state.clubId);
  assert.ok(gs.length >= 2 && gs.every((g) => g.leader && g.players.length >= 3));
  assert.ok(FM.dressing.canMeet(state));
  const r = FM.dressing.meet(W, state, 'motivate', true);
  assert.ok(typeof r.text === 'string');
  assert.ok(!FM.dressing.canMeet(state), 'повторно — не одразу');
  assert.strictEqual(FM.dressing.matchBoost(state), state.meeting.boost);
  const leader = FM.dressing.leaders(W, state.clubId)[0];
  const mate = W.squad(state.clubId).find((p) => p !== leader);
  const m0 = FM.morale.get(mate);
  const buyer = [...W.clubs.values()].find((c) => c.id !== state.clubId);
  FM.market.complete(W, state, leader, buyer.id, 10, 50, 3);
  if (FM.dressing.influence(W, leader) >= 55) assert.ok(FM.morale.get(mate) < m0);
});

test('5. U-21: переведення, матчі молодіжної ліги, швидший розвиток, не в заявці основи', () => {
  require('../js/youth.js');
  const { W, state } = fresh('Dynamo Kyiv');
  const kids = W.squad(state.clubId).filter((p) => FM.youth.eligible(W, p)).slice(0, 9);
  assert.ok(kids.length >= 7, 'у Динамо вистачає молоді');
  for (const p of kids) assert.ok(FM.youth.toU21(W, state, p.id));
  for (let w = 1; w <= 5; w++) { state.season.week = w; FM.youth.week(W, state); }
  assert.strictEqual(state.u21Results.length, 5);
  assert.ok(Object.values(state.u21Stats).some((s) => s[0] === 5));
  assert.ok(FM.youth.growth(state, kids[0]) > 1);
  const side = FM.season.sideFor(state.season, W, state.clubId, { clubId: state.clubId, reserve: FM.youth.set(state) }, null, true);
  assert.ok(!side.players.some((p) => kids.includes(p)), 'гравців U-21 немає в заявці основи');
  FM.youth.promote(state, kids[0].id);
  assert.ok(!FM.youth.set(state).has(kids[0].id));
});

test('6. агенти: жадібний — дорожчі зарплата й комісія; напористий пропонує клієнта', () => {
  require('../js/agents.js');
  const { W, state } = fresh('Arsenal');
  const p = W.squad(byName(W, 'Brighton & Hove Albion').id)[5];
  p.agent = FM.agents.AGENTS.findIndex((a) => a.greed <= 0.95);
  const cheap = FM.market.wageDemand(W, p, state.clubId), cheapFee = FM.market.agentFee(10, cheap, p);
  p.agent = 0; // суперагент
  assert.ok(FM.market.wageDemand(W, p, state.clubId) > cheap);
  assert.ok(FM.market.agentFee(10, cheap, p) > cheapFee);
  // напористий агент вашого гравця з коротким контрактом і в формі (клуб середній — є кому пропонувати)
  state.clubId = byName(W, 'Brentford').id;
  const mine = W.squad(state.clubId)[4];
  mine.agent = 0; mine.contract = state.season.year + 1; mine.form = [7.5, 7.6, 7.4];
  let news = [];
  for (let w = 0; w < 200 && !news.length; w++) { state.season.week = w % 38; state.season.year = 2026 + Math.floor(w / 38); mine.contract = state.season.year + 1; news = FM.agents.week(W, state); }
  assert.ok(news.length && mine.interest);
});

test('7. спонсори й ФФП: виплати, бонус за перемогу й трофей; порушення — штраф і заборона', () => {
  require('../js/finance.js');
  const { W, state } = fresh('Shakhtar Donetsk');
  const offers = FM.finance.offers(W, state);
  assert.strictEqual(offers.length, 3);
  const sp = FM.finance.choose(W, state, 'bonus');
  const b0 = W.club(state.clubId).balance;
  FM.finance.week(W, state, true); FM.finance.week(W, state, false);
  assert.ok(Math.abs(W.club(state.clubId).balance - b0 - (2 * sp.perWeek + sp.win)) < 1e-6);
  assert.ok(FM.finance.trophy(W, state, 1) > 0);
  // звичайний сезон без трансферів — у межах
  state.board.fin = { tv: 10, tickets: 4, prize: 1, wages: 12, transfers: 0 };
  assert.ok(FM.finance.endSeason(W, state).ok);
  // великі витрати — порушення
  state.board.fin = { tv: 10, tickets: 4, prize: 1, wages: 15, transfers: -12 };
  const r = FM.finance.endSeason(W, state);
  assert.ok(!r.ok && r.fine > 0);
  state.season.year++; state.season.week = 2;
  assert.ok(FM.finance.embargoed(state));
  state.season.week = 20;
  assert.ok(!FM.finance.embargoed(state), 'зимове вікно вже відкрите');
});

test('8. медіа: заголовки після матчу, пости, тиск після серії поразок', () => {
  require('../js/media.js');
  const { W, state } = fresh('Shakhtar Donetsk');
  const S = state.season;
  for (let w = 0; w < 4; w++) { // чотири поразки поспіль
    S.week = w;
    for (const f of FM.season.fixturesOfWeek(S, w)) f.s = f.h === state.clubId ? [0, 3] : f.a === state.clubId ? [3, 0] : [1, 1];
    S.week = w + 1;
    FM.media.week(W, state);
  }
  assert.ok(state.media.press.length >= 4);
  assert.ok(state.media.press.some((h) => /поразок поспіль|криза|штопорі/i.test(h.text)));
  assert.ok(state.media.posts.some((p) => p.kind === 'angry'));
  assert.ok(FM.media.pressure(W, state) > 50);
});

test('9. дербі: справжні протистояння знаходяться в базі, більше карток, подвійна реакція', () => {
  require('../js/rivals.js');
  const { W, state } = fresh('Dynamo Kyiv');
  const shak = byName(W, 'Shakhtar Donetsk').id;
  assert.strictEqual(FM.rivals.derby(W, state.clubId, shak), 'Класичне дербі України');
  assert.ok(FM.rivals.isDerby(W, byName(W, 'Real Madrid').id, byName(W, 'Barcelona').id));
  assert.ok(FM.rivals.of(W, byName(W, 'Liverpool').id).length >= 2);
  const found = FM.rivals.LIST.filter(([a, b]) => FM.rivals.isDerby(W, (byName(W, a) || {}).id, (byName(W, b) || {}).id)).length;
  assert.ok(found >= 25, `знайдено дербі: ${found}`);
  // більше карток у дербі
  const team = (c) => ({ club: c, players: W.squad(c.id) });
  let y0 = 0, y1 = 0;
  for (let i = 0; i < 120; i++) {
    const a = FM.match.play({ home: team(W.club(state.clubId)), away: team(W.club(shak)), seed: 'd' + i });
    const b = FM.match.play({ home: team(W.club(state.clubId)), away: team(W.club(shak)), seed: 'd' + i, derby: 'x' });
    y0 += a.stats[0].yellow + a.stats[1].yellow; y1 += b.stats[0].yellow + b.stats[1].yellow;
  }
  assert.ok(y1 > y0 * 1.15, `${y0} → ${y1}`);
  const fans0 = FM.club.fans(W, state.clubId).mood;
  assert.ok(FM.rivals.after(W, state, shak, 1));
  assert.strictEqual(FM.club.fans(W, state.clubId).mood, fans0 + 6);
});

test('10–11. 23 ліги; три єврокубки по 36 клубів; Ліга конференцій доходить до фіналу', () => {
  assert.strictEqual(db.leagues.length, 23);
  for (const id of ['bel', 'sco', 'gre', 'cze', 'den', 'aut', 'sui']) assert.ok(db.leagues.some((l) => l.id === id), id);
  const { W, state } = fresh();
  state.cups = FM.cups.createAll(W, state.season, null);
  for (const id of ['ucl', 'uel', 'uecl']) assert.strictEqual(state.cups[id].teams.length, 36, id);
  const all = [...state.cups.ucl.teams, ...state.cups.uel.teams, ...state.cups.uecl.teams];
  assert.strictEqual(new Set(all).size, all.length, 'клуб — лише в одному єврокубку');
  assert.strictEqual(state.cups.uecl.name, 'Ліга конференцій');
  for (let w = 0; w < 38; w++) { state.season.week = w; FM.cups.playWeek(W, state, {}); }
  assert.ok(state.cups.uecl.winner);
  assert.ok(FM.season.zone('sco', 1, 12) === 'ucl' && FM.season.zone('sco', 3, 12) === 'uel' && FM.season.zone('sco', 5, 12) === 'uecl');
});

test('12. ветерани стають тренерами: резерв, кандидати в штаб, нові тренери клубів ШІ', () => {
  const { W, state } = fresh();
  const stars = [...W.players.values()].filter((p) => p.ca >= 140).slice(0, 12);
  for (const p of stars) { p.lastClub = p.club; p.attrs.lea = 17; }
  FM.club.addExPlayers(W, state, stars);
  assert.strictEqual(state.exPlayers.length, 12);
  let seen = false;
  for (let w = 0; w < 30 && !seen; w++) { state.season.week = w; seen = FM.club.candidates(state, 'assistant').some((c) => c.ex); }
  assert.ok(seen, 'ветеран серед кандидатів у штаб');
  // найсильніший клуб АПЛ програє все — тренера звільняють, а на його місце часто беруть ветерана
  FM.club.managers(W, state);
  const S = state.season;
  const top = W.clubsOf('eng').sort((x, y) => W.clubLevel(y.id) - W.clubLevel(x.id))[0];
  const sacked = [];
  for (let w = 0; w < 38; w++) {
    for (const f of FM.season.fixturesOfWeek(S, w)) if (f.l === 'eng') f.s = f.h === top.id ? [0, 2] : f.a === top.id ? [2, 0] : [1, 1];
    S.week = w + 1;
    sacked.push(...FM.club.managersWeek(W, state).filter((e) => e.club.id === top.id));
  }
  assert.ok(sacked.length >= 1, 'тренера аутсайдера-фаворита звільнили');
  // з 12 ветеранами в резерві й багатьма звільненнями хоч один клуб узяв ветерана
  assert.ok(state.exPlayers.some((x) => x.taken), 'ветерана найняли');
});

test('17. виклики: кандидати, заборона купівлі, виконання й провал', () => {
  require('../js/challenges.js');
  const { W, state } = fresh();
  const rescue = FM.challenges.DEFS.rescue.clubs(W);
  assert.strictEqual(rescue.length, 5);
  assert.ok(FM.challenges.DEFS.rise.clubs(W).every((c) => W.league(c.league).tier === 2));
  FM.challenges.start(state, 'academy');
  assert.ok(FM.challenges.noBuy(state));
  assert.match(FM.challenges.endSeason(W, state, { cupWon: false }), /триває/);
  assert.match(FM.challenges.endSeason(W, state, { cupWon: true }), /ВИКОНАНО/);
  assert.ok(!FM.challenges.noBuy(state), 'після виконання обмеження знято');
  FM.challenges.start(state, 'rescue');
  assert.match(FM.challenges.endSeason(W, state, { relegated: true }), /провалено/);
});
