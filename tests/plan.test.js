'use strict';
// План «Перші кроки в клубі»: звіт асистента й кроки, що позначаються самі.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'cups', 'club', 'nations', 'career', 'plan']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en) {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'plan') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state);
  return { W, state };
}

test('звіт асистента: слабкі позиції, зайві, контракти', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const r = FM.plan.report(W, state.clubId, state.season.year);
  assert.ok(FM.FORMATIONS[r.best] && r.xiAvg > 0);
  assert.ok(r.size > 26 && r.surplus.length >= 3, `${r.size} → ${r.surplus.length}`);
  for (const p of r.surplus) assert.ok(!((W.age(p) ?? 25) <= 21 && p.pa - p.ca >= 15), 'таланти не продаємо');
  const xi = new Set(FM.pickLineup(W.squad(state.clubId), r.formation).xi.map((x) => x.player.id));
  for (const p of r.surplus) assert.ok(!xi.has(p.id), 'основу не продаємо');
  for (const p of r.expiring) assert.ok(p.contract <= state.season.year + 1);
  // прибрати всіх воротарів, крім одного — асистент кричить про воротаря першим
  for (const p of W.squad(state.clubId).filter((x) => x.roles[0] === 'GK').slice(1)) W.move(p.id, null);
  const r2 = FM.plan.report(W, state.clubId, state.season.year);
  assert.strictEqual(r2.needs[0].role, 'GK');
});

test('кроки позначаються самі за станом гри', () => {
  const { W, state } = fresh('Obolon Kyiv');
  const pl = FM.plan.current(W, state);
  assert.ok(pl.first && pl.steps.length === 10);
  assert.strictEqual(FM.plan.progress(W, state, pl).done, 0);
  FM.plan.visit(state, 'board'); FM.plan.visit(state, 'tactics');
  FM.market.scouts(state)[0].region = FM.plan.scoutLeague(W, state);
  for (const id of pl.surplusIds) W.player(id).listed = true;
  for (const id of pl.expIds) W.player(id).contract = state.season.year + 3;
  // шортлист: по гравцю на кожну слабку позицію
  for (const role of pl.needRoles) {
    const p = [...W.players.values()].find((x) => x.club && x.club !== state.clubId && x.roles[0] === role);
    state.shortlist = (state.shortlist || []).concat([p.id]);
  }
  const done = FM.plan.steps(W, state, pl).filter((s) => s.done).map((s) => s.id).sort();
  assert.deepStrictEqual(done, ['board', 'contracts', 'needs', 'scouts', 'surplus', 'tactics']);
  pl.skip.staff = true;
  const pr = FM.plan.progress(W, state, pl);
  assert.strictEqual(pr.closed, 7);
  assert.strictEqual(pr.next.id, 'squad');
});

test('новий сезон — передсезонний план; новий клуб — план з нуля; давнє збереження — без плану', () => {
  const { W, state } = fresh('Obolon Kyiv');
  FM.plan.current(W, state);
  state.season.year++; state.season.week = 0;
  const pre = FM.plan.current(W, state);
  assert.ok(!pre.first && pre.steps.length === FM.plan.PRESEASON.length);
  state.clubId = byName(W, 'Dynamo Kyiv').id; state.season.week = 20;
  assert.ok(FM.plan.current(W, state).first);
  const old = fresh('Obolon Kyiv'); old.state.season.week = 15;
  assert.strictEqual(FM.plan.current(old.W, old.state), null);
});
