'use strict';
// Гроші клубу: абонементи, відвідуваність, атрибутика.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'club', 'money']) require(`../js/${m}.js`);

test('абонементи: гроші одразу, раз на сезон, лише в передсезоння; виручка з матчу менша', () => {
  const W = FM.createWorld(db);
  const c = [...W.clubs.values()].find((x) => x.nameEn === 'Dynamo Kyiv');
  const state = { clubId: c.id, season: FM.season.create(W, 'mn') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  assert.ok(FM.money.seasonTicketShare(W, c.id, 'cheap') > FM.money.seasonTicketShare(W, c.id, 'dear'));
  const b0 = c.balance;
  const r = FM.money.sellSeasonTickets(W, state, 'normal');
  assert.ok(r.ok && r.money > 0 && c.balance > b0, r.text);
  assert.strictEqual(FM.money.sellSeasonTickets(W, state, 'cheap').ok, false, 'вдруге — ні');
  assert.ok(FM.money.stShare(state) > 0.1);
  const a = FM.money.attendance(W, state, c.id, [...W.clubs.values()].find((x) => x.nameEn === 'Shakhtar Donetsk').id, 0.9, 'Класичне дербі України', null);
  assert.ok(a.n > c.capacity * 0.6 && a.n <= c.capacity, `глядачів ${a.n} з ${c.capacity}`);
  // атрибутика: свіжий підпис зірки — сплеск
  const base = FM.money.merch(W, state).money;
  const star = W.squad(c.id).sort((x, y) => y.value - x.value)[0];
  star.value = 40; star.boughtSeason = state.season.year; star.boughtWeek = state.season.week;
  const m2 = FM.money.merch(W, state);
  assert.ok(m2.star === star && m2.money > base * 2, `${base} → ${m2.money}`);
  // посеред сезону абонементи не продають
  const s2 = { clubId: c.id, season: FM.season.create(W, 'mn2') };
  s2.season.week = 20;
  assert.strictEqual(FM.money.sellSeasonTickets(W, s2, 'normal').ok, false);
});
