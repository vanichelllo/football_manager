'use strict';
// Група 4: розстрочка, бонус продавцю за матчі, опція викупу, звіти скаутів A–D.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'deals']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en) {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'dl') };
  FM.market.init(W, state); FM.board.initSeason(W, state);
  return { W, state };
}

test('розстрочка: одразу — частина, решта щотижня продавцю; бонус за матчі — після порогу', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const seller = byName(W, 'Shakhtar Donetsk');
  const p = W.squad(seller.id).sort((a, b) => b.ca - a.ca)[3];
  assert.ok(FM.deals.offerValue(10, { inst: 0.5 }) < 10 && FM.deals.offerValue(10, { apps: 25, bonus: 1.5 }) > 10);
  const me = W.club(state.clubId);
  me.balance = 100;
  const b0 = me.balance, s0 = seller.balance;
  FM.market.complete(W, state, p, me.id, FM.deals.upfront(10, 0.5), 50, 3);
  FM.deals.register(state, p, seller.id, 10, { inst: 0.5, apps: 2, bonus: 1 });
  assert.ok(Math.abs(me.balance - (b0 - 5)) < 0.01);
  for (let w = 0; w < 48; w++) FM.deals.week(W, state);
  assert.ok(Math.abs(me.balance - (b0 - 10)) < 0.05, `баланс ${me.balance}`);
  assert.ok(Math.abs(seller.balance - (s0 + 10)) < 0.05);
  assert.strictEqual(FM.deals.debt(state), 0);
  state.season.ps[p.id] = [2, 0, 0, 0, 0, 0];
  const news = FM.deals.week(W, state);
  assert.ok(news.some((t) => /бонус/.test(t)) && Math.abs(me.balance - (b0 - 11)) < 0.05);
});

test('опція викупу й звіт скаута', () => {
  const { W, state } = fresh('Obolon Kyiv');
  const owner = byName(W, 'Dynamo Kyiv');
  const p = W.squad(owner.id).sort((a, b) => a.ca - b.ca)[5];
  FM.market.loanIn(W, state, p, state.clubId, 1);
  p.loan.option = FM.deals.optionPrice(W, p, state.season);
  W.club(state.clubId).balance = 50;
  const r = FM.deals.exercise(W, state, p);
  assert.ok(r.ok, r.text);
  assert.ok(!p.loan && p.club === state.clubId && p.contract > state.season.year);
  // звіт: зірка топ-клубу для Оболоні — A; слабкий запасний для Реала — D
  const star = W.squad(byName(W, 'Real Madrid').id).sort((a, b) => b.ca - a.ca)[0];
  const rep = FM.deals.report(W, state, star, { ca: star.ca, pa: star.pa, known: true });
  assert.strictEqual(rep.grade, 'A');
  assert.ok(rep.pros.length >= 1 && rep.text);
  const { W: W2, state: s2 } = fresh('Real Madrid');
  const weak = W2.squad(byName(W2, 'Obolon Kyiv').id).filter((x) => (W2.age(x) ?? 0) >= 25).sort((a, b) => a.ca - b.ca)[0];
  assert.strictEqual(FM.deals.report(W2, s2, weak, { ca: weak.ca, pa: weak.pa, known: true }).grade, 'D');
});
