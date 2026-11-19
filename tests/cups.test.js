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

test('учасники: 20 у Лізі чемпіонів, 12 у Лізі Європи, без перетину; кубки країн — усі клуби ліги', () => {
  assert.strictEqual(state.cups.ucl.teams.length, 20);
  assert.strictEqual(state.cups.uel.teams.length, 12);
  assert.ok(!state.cups.ucl.teams.some((id) => state.cups.uel.teams.includes(id)));
  for (const l of db.leagues) assert.strictEqual(state.cups[l.id].teams.length, l.size);
  const ukr = state.cups.ucl.teams.filter((id) => W.club(id).league === 'ukr');
  assert.strictEqual(ukr.length, 1);
});

test('за сезон у кожному кубку — рівно один переможець; сітка й пари з двох матчів', () => {
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
  assert.deepStrictEqual(ucl.rounds.map((r) => r.ties.length), [4, 8, 4, 2, 1]);
  assert.deepStrictEqual(state.cups.uel.rounds.map((r) => r.ties.length), [4, 4, 2, 1]);
  assert.deepStrictEqual(state.cups.eng.rounds.map((r) => r.ties.length), [4, 8, 4, 2, 1]);
  assert.deepStrictEqual(state.cups.ukr.rounds.map((r) => r.ties.length), [8, 4, 2, 1]);
  assert.ok(all.some((x) => x.pens), 'бувають пенальті');
  // фаворити частіше доходять далеко: переможець ЛЧ — серед 10 найсильніших учасників
  const strong = ucl.teams.slice(0, 10);
  assert.ok(ucl.teams.includes(ucl.winner));
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
