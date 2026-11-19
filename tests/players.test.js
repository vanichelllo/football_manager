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
for (const m of ['rng', 'match', 'season', 'data/names', 'develop']) require(`../js/${m}.js`);

test('нові атрибути, приховані риси й прийоми — у всіх, детерміновано й у межах', () => {
  const W = FM.createWorld(db), W2 = FM.createWorld(db);
  for (const p of W.players.values()) {
    for (const k of ['tec', 'lea', 'bra']) assert.ok(p.attrs[k] >= 1 && p.attrs[k] <= 20, `${p.nameEn} ${k}`);
    if (p.roles[0] !== 'GK') assert.ok(p.attrs.lon >= 1 && p.attrs.set >= 1);
    for (const k of ['con', 'big', 'inj', 'pro', 'ada']) assert.ok(p.h[k] >= 1 && p.h[k] <= 20);
    assert.ok(Array.isArray(p.traits) && p.traits.length <= 2);
    assert.strictEqual(JSON.stringify(p.attrs), JSON.stringify(W2.player(p.id).attrs));
  }
  assert.ok(Object.keys(W.export().p).length === 0, 'доповнення не потрапляє в збереження');
});

test('сезон: форма, освоєння позиції, історія кар’єри, нагороди', () => {
  const W = FM.createWorld(db);
  const state = { clubId: db.clubs[0].id, season: FM.season.create(W, 'pl') };
  // гравець грає не на своїй позиції весь сезон
  const club = W.club(db.clubs[0].id);
  while (!FM.season.isOver(state.season)) FM.season.playWeek(state.season, W, {});
  const withForm = [...W.players.values()].filter((p) => p.form && p.form.length === 5);
  assert.ok(withForm.length > 1000);
  const learners = [...W.players.values()].filter((p) => p.posExp && Object.keys(p.posExp).length || p.learned);
  assert.ok(learners.length > 20, `освоюють позиції: ${learners.length}`);
  for (const l of db.leagues) {
    const a = FM.dev.awards(W, state.season, l.id);
    assert.ok(a.mvp && a.boot && a.boot[1] > 5, l.id);
    assert.ok(a.xi.length >= 9, `${l.id}: символічна збірна ${a.xi.length}`);
    assert.ok(!a.young || (W.age(W.player(a.young)) <= 21));
  }
  const rep = FM.dev.endSeason(W, state);
  const p = W.squad(club.id)[0];
  assert.ok(p.career && p.career.length === 1 && p.career[0][0] === 2026);
  assert.ok(rep.youth.every((y) => y.attrs.lea && y.h && y.traits));
});
