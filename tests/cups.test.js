'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
require('../js/rng.js');
require('../js/match.js');
require('../js/season.js');
require('../js/cups.js');

const W = FM.createWorld(db);
const state = { clubId: db.clubs[0].id, season: FM.season.create(W, 'cups') };
state.cups = FM.cups.createAll(W, state.season, null);

const tier1 = db.leagues.filter((l) => (l.tier || 1) === 1);
const spots = (k) => tier1.reduce((s, l) => s + FM.cups.EURO_SPOTS[l.id][k], 0);

test('учасники єврокубків за квотами ліг, без перетину; кубки країн — вища ліга й другий дивізіон', () => {
  assert.strictEqual(state.cups.ucl.teams.length, spots(0));
  assert.strictEqual(state.cups.uel.teams.length, spots(1));
  assert.ok(!state.cups.ucl.teams.some((id) => state.cups.uel.teams.includes(id)));
  for (const l of tier1) {
    const lower = db.leagues.filter((x) => x.up === l.id).reduce((s, x) => s + x.size, 0);
    assert.strictEqual(state.cups[l.id].teams.length, l.size + lower, l.id);
  }
  for (const l of db.leagues.filter((x) => x.tier === 2)) assert.ok(!state.cups[l.id], 'окремого кубка для другого дивізіону немає');
  const ukr = state.cups.ucl.teams.filter((id) => W.club(id).league === 'ukr');
  assert.strictEqual(ukr.length, FM.cups.EURO_SPOTS.ukr[0]);
});

test('етап ліги: 8 турів, 4 вдома й 4 на виїзді, без суперників зі своєї країни', () => {
  for (const id of ['ucl', 'uel']) {
    const cup = state.cups[id];
    for (const t of cup.teams) {
      const mine = cup.phase.fixtures.filter((f) => f.h === t || f.a === t);
      assert.strictEqual(mine.length, 8, `${id} ${t}`);
      assert.strictEqual(mine.filter((f) => f.h === t).length, 4);
      const opp = mine.map((f) => (f.h === t ? f.a : f.h));
      assert.strictEqual(new Set(opp).size, 8);
      assert.ok(!opp.some((o) => W.club(o).league === W.club(t).league), 'суперник з тієї ж ліги');
    }
  }
});

test('за сезон у кожному кубку — рівно один переможець; пари з двох матчів', () => {
  const all = [];
  for (let w = 0; w < 38; w++) { state.season.week = w; all.push(...FM.cups.playWeek(W, state, {})); }
  for (const cup of Object.values(state.cups)) {
    assert.ok(cup.winner && cup.teams.includes(cup.winner), `${cup.name}: переможця немає`);
    const last = cup.rounds[cup.rounds.length - 1];
    assert.strictEqual(last.ties.length, 1);
    assert.strictEqual(last.ties[0].winner, cup.winner);
    for (const r of cup.rounds) for (const t of r.ties) assert.strictEqual(t.legs.length, r.weeks.length, `${cup.name}, ${r.name}`);
  }
  const ucl = state.cups.ucl;
  assert.ok(ucl.phase.done);
  assert.deepStrictEqual(ucl.rounds.slice(1).map((r) => r.ties.length), [8, 4, 2, 1]);
  if (ucl.teams.length >= 24) assert.strictEqual(ucl.rounds[0].ties.length, 8);
  assert.ok(all.some((x) => x.pens), 'бувають пенальті');
});

test('єврокубки за таблицями минулого сезону', () => {
  const tables = {};
  for (const l of db.leagues) tables[l.id] = W.clubsOf(l.id).map((c) => c.id).reverse();
  const q = FM.cups.euroQualifiers(W, tables);
  for (const l of db.leagues) {
    const [a] = FM.cups.EURO_SPOTS[l.id];
    for (const id of tables[l.id].slice(0, a)) assert.ok(q.ucl.includes(id));
  }
});
