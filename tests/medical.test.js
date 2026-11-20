'use strict';
// Група 5: медичний центр і аналітика матчу (оцінки за таймами, володіння по відрізках).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'medical']) require(`../js/${m}.js`);
const W = FM.createWorld(db);
const club = (en) => [...W.clubs.values()].find((c) => c.nameEn === en);

test('ризик травми: втома, схильність, вік і два матчі підвищують; відпочинок знижує', () => {
  const p = W.squad(club('Dynamo Kyiv').id).find((x) => x.roles[0] !== 'GK' && (W.age(x) ?? 30) < 28);
  p.h.inj = 8; delete p.fitness;
  const base = FM.medical.risk(W, p, { matches: 1 });
  p.fitness = 65;
  const tired = FM.medical.risk(W, p, { matches: 1 });
  p.h.inj = 18;
  const prone = FM.medical.risk(W, p, { matches: 2 });
  assert.ok(base.r < tired.r && tired.r < prone.r, `${base.r} < ${tired.r} < ${prone.r}`);
  assert.strictEqual(prone.level, 'high');
  assert.ok(prone.why.includes('схильний до травм') && prone.why.some((w) => /втома/.test(w)));
  const state = { season: { year: 2026, week: 5 } };
  assert.ok(FM.medical.rest(state, p.id));
  const r = FM.medical.risk(W, p, { matches: 2, rested: FM.medical.rested(state) });
  assert.ok(r.r < base.r, 'відпочинок');
  FM.medical.restWeek(W, { ...state, rest: state.rest }, '2026-5');
  p.injury = 3;
  assert.strictEqual(FM.medical.risk(W, p).level, 'out');
  delete p.injury;
});

test('аналітика: оцінки за таймами й володіння по 15 хвилин', () => {
  const r = FM.match.play({ home: { club: club('Dynamo Kyiv'), players: W.squad(club('Dynamo Kyiv').id) }, away: { club: club('Shakhtar Donetsk'), players: W.squad(club('Shakhtar Donetsk').id) }, seed: 'an' });
  assert.strictEqual(r.possSeg.length, 6);
  assert.ok(r.possSeg.every((v) => v >= 20 && v <= 80));
  const starters = r.ratings.filter((x) => !x.on && !x.off);
  assert.ok(starters.every((x) => x.h1 >= 3 && x.h2 >= 3 && x.h1 <= 10));
  const subs = r.ratings.filter((x) => x.on && x.on > 46);
  assert.ok(subs.every((x) => x.h1 == null && x.h2 != null));
  assert.ok(Array.isArray(r.scoreHT));
});
