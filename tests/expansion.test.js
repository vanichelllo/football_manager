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
