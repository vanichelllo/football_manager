'use strict';
// Плей-оф після сезону, стикові матчі, Суперкубки.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'cups']) require(`../js/${m}.js`);

test('плей-оф: третя путівка Чемпіоншипу, стикові УПЛ; розміри ліг не змінюються; Суперкубки', () => {
  const W = FM.createWorld(db);
  const S = FM.season.create(W, 'po');
  for (const f of S.fixtures) f.s = W.clubLevel(f.h) + 3 >= W.clubLevel(f.a) ? [2, 1] : [0, 1]; // сильніші перемагають
  const sizes = Object.fromEntries(W.db.leagues.map((l) => [l.id, W.clubsOf(l.id).length]));
  const po = FM.season.playoffs(W, S, (h, a, id) => FM.match.play({ home: { club: W.club(h), players: W.squad(h) }, away: { club: W.club(a), players: W.squad(a) }, seed: id, neutral: id.endsWith('-f') }).score);
  assert.ok(po.eng2 && po.eng2.up.length === 1 && po.eng2.log.length === 2, 'плей-оф Чемпіоншипу');
  const t2 = FM.season.table(S, W, 'eng2').map((r) => r.id);
  assert.ok(t2.slice(2, 6).includes(po.eng2.winner), 'переможець — з 3–6 місць');
  assert.ok(po.ukr2 && po.ukr2.clubs.length === 2, 'стикові УПЛ');
  const champions = {}, runners = {};
  for (const l of W.db.leagues) { const t = FM.season.table(S, W, l.id); champions[l.id] = t[0].id; runners[l.id] = t[1].id; }
  const moves = FM.season.promote(W, S, po);
  for (const l of W.db.leagues) assert.strictEqual(W.clubsOf(l.id).length, sizes[l.id], `${l.id}: розмір ліги`);
  assert.ok(moves.some((m) => m.club === po.eng2.winner && m.up), 'переможець плей-оф піднявся');
  assert.strictEqual(FM.season.zone('eng2', 3, 24), 'playoff');
  assert.strictEqual(FM.season.zone('eng2', 2, 24), 'promo');
  // Суперкубки
  const S2 = FM.season.create(W, 'po2');
  const ucl = W.clubsOf('esp')[0].id, uel = W.clubsOf('eng')[0].id;
  const sc = FM.cups.superCups(W, S2, champions, { ukr: champions.ukr, ucl, uel }, runners);
  assert.ok(sc['sc-ukr'] && sc['sc-ukr'].teams.includes(runners.ukr), 'чемпіон = володар кубка → віце-чемпіон');
  assert.ok(sc.usc && sc.usc.teams.length === 2 && sc.usc.rounds.length === 1);
  assert.ok(sc['sc-eng'].rounds[0].weeks[0] < S2.cal.leagues.eng.start, 'до першого туру');
});
