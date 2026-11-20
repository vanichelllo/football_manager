'use strict';
// Розширення гри (19 пунктів після дорожньої карти): ринок, скаути світу, роздягальня, молодь, агенти…
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'cups', 'club', 'nations', 'career']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en = 'Shakhtar Donetsk') {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'exp') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state);
  return { W, state };
}

test('2. ринок: ціна росте від форми й падає від травми; чутки', () => {
  const { W, state } = fresh();
  const sq = W.squad(state.clubId).sort((a, b) => b.ca - a.ca);
  const hot = sq[2], hurt = sq[3];
  const v0 = hot.value, v1 = hurt.value;
  hot.form = [8.2, 8.5, 7.9, 8.1, 8.4];
  hurt.injury = 10; hurt.form = [6.6];
  for (let w = 0; w < 10; w++) { state.season.week = w + 4; FM.market.valuesWeek(W, state); }
  assert.ok(hot.value > v0 * 1.15, `${v0} → ${hot.value}`);
  assert.ok(hurt.value < v1 * 0.95, `${v1} → ${hurt.value}`);
  // чутки про гравця у формі
  let rumour = false;
  for (let w = 0; w < 60 && !rumour; w++) { state.season.week = w % 38; FM.market.rumoursWeek(W, state, FM.rng('r' + w)); rumour = !!hot.interest; }
  assert.ok(rumour);
});
