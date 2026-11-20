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

test('світ — копія: зміни не псують реальну базу', () => {
  const W = FM.createWorld(db);
  const p = W.player(db.players[0].id);
  p.attrs.fin = 1; p.name = 'Тест';
  assert.notStrictEqual(db.players[0].name, 'Тест');
  assert.notStrictEqual(db.players[0].attrs.fin, 1);
});

test('збереження світу: правки, трансфери й нові гравці переживають export → createWorld', () => {
  const W = FM.createWorld(db);
  const [a, b] = db.clubs;
  const p = W.squad(a.id)[0];
  p.name = 'Змінене ім’я'; p.attrs.pas = 20; p.edited = true;
  W.move(p.id, b.id);
  const kid = W.addPlayer({ club: a.id, name: 'Юнак', nameEn: 'Kid', born: '2010-01-01', nat: 'UKR', roles: ['ST'], side: null, attrs: { ...p.attrs }, ca: 60, pa: 150, value: 0.1 });
  W.club(a.id).name = 'Новий клуб';
  W.today = '2027-08-01';
  const saved = JSON.parse(JSON.stringify(W.export()));
  // збереження маленьке: лише відмінності
  assert.ok(JSON.stringify(saved).length < 20000);
  const W2 = FM.createWorld(db, saved);
  assert.strictEqual(W2.player(p.id).name, 'Змінене ім’я');
  assert.strictEqual(W2.player(p.id).attrs.pas, 20);
  assert.ok(W2.club(b.id).players.includes(p.id));
  assert.ok(!W2.club(a.id).players.includes(p.id));
  assert.ok(W2.club(a.id).players.includes(kid.id));
  assert.strictEqual(W2.club(a.id).name, 'Новий клуб');
  assert.strictEqual(W2.today, '2027-08-01');
  // наступний новий гравець не перетирає старого
  const kid2 = W2.addPlayer({ club: a.id, name: 'Ще юнак', roles: ['GK'], attrs: {}, ca: 50, pa: 100 });
  assert.notStrictEqual(kid2.id, kid.id);
});

test('рівень з атрибутів близький до бази, а покращення атрибутів його підвищує', () => {
  const W = FM.createWorld(db);
  let err = 0;
  for (const p of db.players) err += Math.abs(FM.caFromAttrs(p) - p.ca);
  assert.ok(err / db.players.length < 8, `середня похибка ${(err / db.players.length).toFixed(1)}`);
  const p = W.player(db.players.find((x) => x.roles[0] === 'ST' && x.attrs.fin < 14 && x.attrs.otb < 14).id);
  const before = FM.caFromAttrs(p);
  p.attrs.fin = Math.min(20, p.attrs.fin + 4); p.attrs.otb = Math.min(20, p.attrs.otb + 4);
  assert.ok(FM.caFromAttrs(p) > before);
});

test('повернення реальних даних після редагування', () => {
  const W = FM.createWorld(db);
  const id = db.players[5].id;
  W.player(id).attrs.fin = 1; W.player(id).name = 'X';
  W.resetPlayer(id);
  assert.strictEqual(JSON.stringify(W.player(id).attrs), JSON.stringify(db.players[5].attrs));
  assert.strictEqual(W.player(id).name, db.players[5].name);
});
