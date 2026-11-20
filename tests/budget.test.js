'use strict';
// Бюджети: трансферний окремо від балансу, перекидання, продажі, кредит, прогноз, назва стадіону.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'club', 'finance', 'budget']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en) {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'bud') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  return { W, state };
}

test('трансферний бюджет: частина балансу; купівля витрачає, продаж повертає 75%', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const c = W.club(state.clubId), b = FM.budget.get(W, state);
  assert.ok(b.transfer > 0 && b.transfer <= c.balance, `${b.transfer} з ${c.balance}`);
  const seller = byName(W, 'Obolon Kyiv');
  const p = W.squad(seller.id)[3];
  const t0 = b.transfer;
  FM.market.complete(W, state, p, c.id, 1, 20, 3, { agent: 0.1 });
  assert.ok(Math.abs(FM.budget.get(W, state).transfer - (t0 - 1.1)) < 0.01);
  const mine = W.squad(c.id)[5];
  const t1 = FM.budget.get(W, state).transfer;
  FM.market.complete(W, state, mine, seller.id, 2, 20, 3);
  assert.ok(Math.abs(FM.budget.get(W, state).transfer - (t1 + 1.5)) < 0.01, 'продаж: +75%');
});

test('перекидання між бюджетами в обидва боки, з обмеженнями', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const c = W.club(state.clubId), b = FM.budget.get(W, state);
  const wb = c.wageBudget, tb = b.transfer;
  const r = FM.budget.move(W, state, 1);
  assert.ok(r.ok, r.text);
  assert.strictEqual(c.wageBudget, wb + 19);
  assert.ok(Math.abs(b.transfer - (tb - 1)) < 0.01);
  const r2 = FM.budget.move(W, state, -0.5);
  assert.ok(r2.ok && c.wageBudget === wb + 19 - 10, r2.text);
  assert.strictEqual(FM.budget.move(W, state, b.transfer + 5).ok, false, 'більше, ніж є');
  assert.strictEqual(FM.budget.move(W, state, -100).ok, false, 'зарплатний не менший за нинішні зарплати');
});

test('кредит, прогноз, назва стадіону', () => {
  const { W, state } = fresh('Obolon Kyiv');
  const c = W.club(state.clubId), bal = c.balance;
  state.board.conf = 60;
  const r = FM.budget.takeLoan(W, state, 100);
  assert.ok(r.ok && state.loan.amount === FM.budget.loanMax(W, state), r.text);
  assert.ok(c.balance > bal);
  assert.strictEqual(FM.budget.takeLoan(W, state, 1).ok, false, 'другий — ні');
  for (let w = 0; w < FM.budget.LOAN_WEEKS; w++) FM.budget.loanWeek(W, state);
  assert.ok(Math.abs(state.loan.paid - state.loan.total) < 0.01 && state.loan.left === 0);
  assert.ok(Number.isFinite(FM.budget.forecast(W, state).end));
  const n = FM.budget.sellNaming(W, state);
  assert.ok(n.ok && c.namingSold, n.text);
  assert.strictEqual(FM.budget.sellNaming(W, state).ok, false);
});
