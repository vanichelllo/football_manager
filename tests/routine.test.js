'use strict';
// Група 2: розклад по днях, наставництво, доручення асистентові.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'routine']) require(`../js/${m}.js`);

test('розклад: звичайний тиждень = старий збалансований план; два матчі — без фізпідготовки', () => {
  const R = FM.routine;
  const std = R.aggregate(R.auto([6], null));
  const old = FM.dev.PLANS.balanced;
  assert.ok(Math.abs(std.recovery - old.recovery) <= 1 && Math.abs(std.growth - old.growth) < 0.05 && Math.abs(std.injury - old.injury) < 0.05, JSON.stringify(std));
  const two = R.auto([2, 6], null);
  assert.strictEqual(two[2], 'match'); assert.strictEqual(two[1], 'prep'); assert.strictEqual(two[5], 'prep'); assert.strictEqual(two[3], 'recovery');
  assert.ok(!Object.values(two).includes('fitness'));
  const pre = R.aggregate(R.auto([], 'preseason'));
  assert.ok(pre.growth > std.growth && pre.injury > std.injury, 'передсезоння — важче й корисніше');
  assert.ok(R.prepBoost(R.auto([6], null), 6) > 1 && R.prepBoost({ 5: 'fitness' }, 6) === 1);
  // шаблон тренера: розвиток
  const dev = R.aggregate(R.auto([6], null, 'development'));
  assert.ok(dev.growth > std.growth);
});

test('наставництво: учень переймає професіоналізм; ліміт учнів', () => {
  const W = FM.createWorld(db);
  const club = [...W.clubs.values()].find((c) => c.nameEn === 'Dynamo Kyiv');
  const state = { clubId: club.id, season: FM.season.create(W, 'm') };
  const sq = W.squad(club.id);
  const mentor = sq.filter((p) => (W.age(p) ?? 0) >= 26)[0];
  mentor.h.pro = 19; mentor.attrs.lea = 16;
  const kids = sq.filter((p) => (W.age(p) ?? 30) <= 21).slice(0, 3);
  for (const k of kids) k.h.pro = 8;
  assert.ok(FM.routine.assign(W, state, kids[0].id, mentor.id).ok);
  assert.ok(FM.routine.assign(W, state, kids[1].id, mentor.id).ok);
  assert.strictEqual(FM.routine.assign(W, state, kids[2].id, mentor.id).ok, false, 'не більше двох учнів');
  let news = [];
  for (let w = 0; w < 30; w++) news = news.concat(FM.routine.mentorWeek(W, state));
  assert.ok(kids[0].h.pro > 11, `професіоналізм учня ${kids[0].h.pro}`);
  assert.ok(news.some((t) => /переймає професіоналізм/.test(t)));
  assert.strictEqual(FM.routine.growthMult(state, kids[0]), 1.08);
  assert.ok(FM.routine.suggest(W, state).every((x) => FM.routine.canMentor(W, x.mentor) && FM.routine.canLearn(W, x.young)));
});

test('доручення: асистент продовжує контракти молоді й відхиляє дешеві пропозиції', () => {
  const W = FM.createWorld(db);
  const club = [...W.clubs.values()].find((c) => c.nameEn === 'Dynamo Kyiv');
  const state = { clubId: club.id, season: FM.season.create(W, 'd'), deleg: { youth: true, lowOffers: true } };
  FM.market.init(W, state);
  const kid = W.squad(club.id).find((p) => (W.age(p) ?? 30) <= 21);
  kid.contract = state.season.year + 1;
  const star = W.squad(club.id).sort((a, b) => b.value - a.value)[0];
  state.offers = [{ id: 'o1', pid: star.id, from: 'x', fee: star.value * 0.5, w: 0 }, { id: 'o2', pid: star.id, from: 'y', fee: star.value * 1.2, w: 0 }];
  const news = FM.routine.delegateWeek(W, state);
  assert.ok(kid.contract > state.season.year + 1, 'контракт продовжено');
  assert.deepStrictEqual(state.offers.map((o) => o.id), ['o2']);
  assert.ok(news.length >= 2);
  assert.strictEqual(FM.routine.delegated(state, 'training'), true, 'розклад типово складає асистент');
});
