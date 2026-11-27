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

test('поради штабу: індивідуальне тренування, слабка позиція, відхилити не повторюється', () => {
  for (const m of ['morale', 'tcentre', 'backroom']) require(`../js/${m}.js`);
  const { W, state } = fresh();
  FM.club.initStaff(W, state);
  state.training = { focus: 'balanced', intensity: 'normal', individual: {} };
  // забрати всіх воротарів, крім одного, — штаб помітить
  const gks = W.squad(state.clubId).filter((p) => p.roles[0] === 'GK');
  for (const p of gks.slice(1)) W.move(p.id, [...W.clubs.values()].find((c) => c.id !== state.clubId).id);
  const items = FM.backroom.advice(W, state);
  assert.ok(items.length >= 1);
  assert.ok(items.every((i) => i.who && i.text && i.act));
  const need = items.find((i) => i.act.kind === 'need');
  assert.ok(need && FM.ROLE_NAME[need.act.role], JSON.stringify(items.map((i) => i.id)));
  const r = FM.backroom.accept(W, state, need.id);
  assert.ok(/шукає/.test(r.text));
  assert.ok(FM.market.scouts(state).some((s) => s.region === 'task' && s.task.pos === need.act.role));
  const focus = items.find((i) => i.act.kind === 'focus');
  if (focus) { FM.backroom.accept(W, state, focus.id); assert.strictEqual(state.training.individual[focus.act.pid], focus.act.attr); }
  const left = FM.backroom.advice(W, state);
  if (left.length) {
    const id = left[0].id; FM.backroom.dismiss(state, id);
    state.backroom = null; state.season.week += 1;
    assert.ok(!FM.backroom.advice(W, state).some((i) => i.id === id), 'відхилена порада не повторюється');
  }
});
