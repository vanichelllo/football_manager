'use strict';
// Крок 49: оновлення бази — стабільні id, переведення давніх збережень, українські імена.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season']) require(`../js/${m}.js`);
const { toUk } = require('../tools/lib/translit.js');

test('id клубів і гравців стабільні (не порядкові) й унікальні', () => {
  assert.ok(db.clubs.every((c) => !/^c\d+$/.test(c.id)));
  assert.ok(db.players.every((p) => !/^p\d+$/.test(p.id)));
  assert.strictEqual(new Set(db.players.map((p) => p.id)).size, db.players.length);
  assert.strictEqual(new Set(db.clubs.map((c) => c.id)).size, db.clubs.length);
});

test('давнє збереження з порядковими id переводиться на нові', () => {
  const map = db.legacyIds;
  assert.ok(map && Object.keys(map).length > 8000);
  const inv = {};
  for (const [o, n] of Object.entries(map)) inv[n] = o;
  // «давнє» збереження: свіжа кар'єра, у якій нові id замінено на старі
  const W = FM.createWorld(db);
  const club = [...W.clubs.values()].find((c) => c.nameEn === 'Shakhtar Donetsk');
  const star = W.squad(club.id).sort((a, b) => b.ca - a.ca)[0];
  star.morale = 91;
  const S = FM.season.create(W, 'old');
  const fresh = { clubId: club.id, season: S, known: { [star.id]: true }, world: W.export() };
  const toOld = (x) => JSON.parse(JSON.stringify(x), (k, v) => (typeof v === 'string' && inv[v] ? inv[v] : v));
  const old = toOld(fresh);
  old.known = { [inv[star.id]]: true };
  assert.ok(/^c\d+$/.test(old.clubId));
  const back = FM.remapIds(old, map);
  assert.strictEqual(back.clubId, club.id);
  assert.ok(back.known[star.id]);
  assert.deepStrictEqual(back.season.fixtures.slice(0, 5), S.fixtures.slice(0, 5));
  const W2 = FM.createWorld(db, back.world);
  assert.strictEqual(W2.player(star.id).morale, 91);
});

test('транслітерація українських імен з латиниці', () => {
  assert.strictEqual(toUk('Mykyta Melnyk'), 'Микита Мельник');
  assert.strictEqual(toUk('Andriy Yarmolenko'), 'Андрій Ярмоленко');
  assert.strictEqual(toUk('Yevhen Konoplyanka'), 'Євген Коноплянка');
  assert.strictEqual(toUk('Oleksandr Kovalchuk'), 'Олександр Ковальчук');
  assert.strictEqual(toUk('Yaroslav Rakitskyi'), 'Ярослав Ракіцький');
  assert.ok(db.players.filter((p) => p.nat === 'UKR').every((p) => /[а-яієїґ]/i.test(p.name)), 'усі українці — кирилицею');
});
