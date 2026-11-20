'use strict';
// Розвиток за цілий сезон і перехід у новий.
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
require('../js/data/names.js');
require('../js/develop.js');

const W = FM.createWorld(db);
const state = { clubId: db.clubs[0].id, season: FM.season.create(W, 'dev') };
const start = new Map([...W.players.values()].map((p) => [p.id, { ca: p.ca, age: W.age(p), pa: p.pa }]));
let injuredWeeks = 0, weeks = 0;
while (!FM.season.isOver(state.season)) {
  FM.season.playWeek(state.season, W, { dev: { myClub: state.clubId } });
  injuredWeeks += [...W.players.values()].filter((p) => p.injury > 0 && p.club).length;
  weeks++;
}

test('за сезон молодь росте, ветерани згасають, рівень не перевищує потенціал', () => {
  const delta = (pred) => {
    const xs = [...W.players.values()].filter((p) => start.has(p.id) && pred(start.get(p.id))).map((p) => p.ca - start.get(p.id).ca);
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  const young = delta((s) => s.age <= 20 && s.pa - s.ca >= 25);
  const prime = delta((s) => s.age >= 25 && s.age <= 28);
  const old = delta((s) => s.age >= 32);
  console.log(`  молодь +${young.toFixed(1)}, 25–28: ${prime.toFixed(1)}, 32+: ${old.toFixed(1)}`);
  assert.ok(young > 3 && young < 20, `молодь: ${young.toFixed(1)}`);
  assert.ok(Math.abs(prime) < 3, `25–28 років: ${prime.toFixed(1)}`);
  assert.ok(old < -1.5, `32+: ${old.toFixed(1)}`);
  for (const p of W.players.values()) {
    assert.ok(p.ca <= p.pa, `${p.nameEn}: ${p.ca} > ${p.pa}`);
    for (const v of Object.values(p.attrs)) assert.ok(v >= 1 && v <= 20);
  }
});

test('травми трапляються, але не масово', () => {
  const perClub = injuredWeeks / weeks / db.clubs.length;
  console.log(`  травмованих у клубі одночасно: ${perClub.toFixed(2)}`);
  assert.ok(perClub > 0.5 && perClub < 4, `травмованих у клубі одночасно: ${perClub.toFixed(2)}`);
});

test('кінець сезону: ветерани завершують кар’єру, приходять юнаки, склади ШІ не роздуті', () => {
  const report = FM.dev.endSeason(W, state);
  assert.ok(report.retired.length > 30 && report.retired.length < 500, `завершили: ${report.retired.length}`);
  assert.ok(report.retired.every((p) => !p.club && p.retired));
  assert.ok(report.youth.length >= db.clubs.length * 2 && report.youth.length <= db.clubs.length * 4);
  for (const y of report.youth) {
    const age = W.age({ born: y.born });
    assert.ok(y.pa > y.ca && y.club && y.name && y.roles.length);
    assert.ok(Object.values(y.attrs).every((v) => v >= 1 && v <= 20));
  }
  for (const c of W.clubs.values()) if (c.id !== state.clubId) assert.ok(c.players.length <= 30, `${c.nameEn}: ${c.players.length}`);
});

test('новий сезон: рік, дата старту, календар; світ із юнаками зберігається', () => {
  FM.dev.newSeason(W, state);
  assert.strictEqual(state.season.year, 2027);
  assert.strictEqual(W.today, '2027-08-01');
  assert.strictEqual(new Date(state.season.start + 'T12:00:00Z').getUTCDay(), 6);
  assert.strictEqual(FM.season.weeks(state.season), 38);
  FM.season.playWeek(state.season, W, { dev: { myClub: state.clubId } });
  assert.ok(state.season.fixtures.filter((f) => f.s).length > 50);
  const saved = JSON.parse(JSON.stringify(W.export()));
  const W2 = FM.createWorld(db, saved);
  assert.strictEqual(W2.players.size, W.players.size);
  assert.strictEqual(W2.today, '2027-08-01');
  for (const c of W.clubs.values()) assert.strictEqual(W2.club(c.id).players.length, c.players.length);
});
