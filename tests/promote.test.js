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
for (const m of ['rng', 'match', 'season']) require(`../js/${m}.js`);
const tier2 = db.leagues.filter((l) => l.tier === 2);

test('підвищення й пониження: обмін N клубами, розміри ліг не змінюються', { skip: !tier2.length && 'у базі немає других дивізіонів' }, () => {
  const W = FM.createWorld(db);
  const S = FM.season.create(W, 'promo');
  // штучно «зіграний» сезон: таблиця за алфавітом (усі матчі нічиї не потрібні — table сортує за очками/назвою)
  const sizes = Object.fromEntries(db.leagues.map((l) => [l.id, W.clubsOf(l.id).length]));
  const t2 = tier2[0], up = t2.up;
  const lastUp = FM.season.table(S, W, up).slice(-FM.season.ZONES[t2.id].promo).map((r) => r.id);
  const topDown = FM.season.table(S, W, t2.id).slice(0, FM.season.ZONES[t2.id].promo).map((r) => r.id);
  const moves = FM.season.promote(W, S);
  for (const l of db.leagues) assert.strictEqual(W.clubsOf(l.id).length, sizes[l.id], l.id);
  for (const id of lastUp) assert.strictEqual(W.club(id).league, t2.id);
  for (const id of topDown) assert.strictEqual(W.club(id).league, up);
  assert.strictEqual(moves.length, tier2.reduce((s, l) => s + 2 * FM.season.ZONES[l.id].promo, 0));
  // новий календар будується з новим складом ліг
  const S2 = FM.season.create(W, 'promo-2');
  assert.ok(S2.fixtures.some((f) => topDown.includes(f.h) && W.club(f.h).league === up));
});
