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
require('../js/data/countries.js');
for (const m of ['rng', 'match', 'season', 'nations']) require(`../js/${m}.js`);

test('збірні: пули з реальних гравців, Україна є, склад 23 з 3 воротарями', () => {
  const W = FM.createWorld(db);
  const P = FM.nations.pools(W);
  assert.ok(Object.keys(P).length >= 15, 'кількість збірних');
  for (const c of ['UKR', 'ENG', 'ESP', 'FRA']) assert.ok(P[c], c);
  const s = FM.nations.squad(W, 'UKR');
  assert.ok(s.length >= 18 && s.length <= 23);
  assert.ok(s.filter((p) => p.roles[0] === 'GK').length >= 2);
  assert.ok(FM.nations.strength(W, 'ESP') > FM.nations.strength(W, 'UKR'));
});

test('міжнародне вікно: два матчі України, записи й ігри за збірну', () => {
  const W = FM.createWorld(db);
  const state = { season: FM.season.create(W, 'intl') };
  state.season.week = FM.nations.windows(state.season)[0];
  const res = FM.nations.weekly(W, state, {});
  assert.strictEqual(res.length, 2);
  assert.strictEqual(state.intl.played.length, 2);
  assert.strictEqual(FM.nations.weekly(W, state, {}).length, 0, 'повторно не грає');
  assert.ok(FM.nations.squad(W, 'UKR').some((p) => p.caps > 0 || p.injury));
});

test('турніри: Євро 2028 і ЧС 2030, у непарні роки — нічого', () => {
  const W = FM.createWorld(db);
  assert.strictEqual(FM.nations.tournament(W, 2027, 's'), null);
  const e = FM.nations.tournament(W, 2028, 's');
  assert.ok(e && e.name.includes('Європи') && e.winner && FM.nations.EUROPE.has(e.winner));
  assert.ok(e.final && e.final.winner === e.winner);
  const wc = FM.nations.tournament(W, 2030, 's');
  assert.ok(wc && wc.name.includes('світу') && wc.winner);
});
