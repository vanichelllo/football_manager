'use strict';
// Скаутські завдання й очікування на сезон.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const FM = require('../js/world.js');
for (const m of ['rng', 'calendar', 'match', 'season', 'data/names', 'develop', 'market', 'board', 'club', 'finance', 'budget', 'deals', 'boardroom', 'scouting']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(club = 'Dynamo Kyiv') {
  const W = FM.createWorld(ctx.window.FM_DB);
  const state = { clubId: byName(W, club).id, season: FM.season.create(W, 'ex') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  return { W, state };
}

test('скаут за критеріями надсилає рекомендації, що відповідають завданню', () => {
  const { W, state } = fresh();
  const sc = FM.market.scouts(state)[0];
  sc.region = 'task'; sc.task = { pos: 'ST', age: 'u24', level: 'any' };
  const recs = [];
  for (let w = 0; w < 8; w++) { state.season.week = w; recs.push(...FM.scouting.week(W, state).filter((r) => r.pid)); }
  assert.ok(recs.length >= 2, `рекомендацій: ${recs.length}`);
  for (const r of recs) { const p = W.player(r.pid); assert.ok(p.roles.includes('ST') && W.age(p) <= 24 && p.club !== state.clubId); assert.ok(state.known[p.id]); }
  assert.strictEqual(new Set(recs.map((r) => r.pid)).size, recs.length, 'без повторів');
  const id = state.scoutRecs[0].id;
  FM.scouting.dismiss(state, id);
  assert.ok(!state.scoutRecs.some((r) => r.id === id));
});

test('очікування на сезон: три варіанти, амбітніший дає більший бюджет', () => {
  const { W, state } = fresh('Kolos Kovalivka');
  assert.ok(FM.boardroom.expectOpen(W, state));
  const opts = FM.boardroom.expectOptions(W, state);
  const up = opts.find((o) => o.k === 'up'), base = opts.find((o) => o.k === 'board'), down = opts.find((o) => o.k === 'down');
  assert.ok(up && base && down);
  assert.ok(up.transfer > base.transfer && down.transfer < base.transfer);
  assert.ok(up.wage > base.wage);
  const r = FM.boardroom.setExpect(W, state, 'up');
  assert.ok(r.ok);
  assert.strictEqual(state.board.target.kind, up.target.kind);
  assert.strictEqual(FM.budget.get(W, state).transfer, up.transfer);
  assert.ok(!FM.boardroom.expectOpen(W, state), 'раз на сезон');
  assert.strictEqual(FM.boardroom.setExpect(W, state, 'down').ok, false);
});
