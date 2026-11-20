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
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);

test('свіжість: після матчу падає, за тиждень відновлюється; ШІ дає відпочити втомленим', () => {
  const W = FM.createWorld(db);
  const S = FM.season.create(W, 'fit');
  const f = FM.season.fixturesOfWeek(S, 0)[0];
  const { m } = FM.season.play(S, W, f);
  FM.season.record(S, f, m);
  const played = m.ratings.filter((r) => !r.on && !r.off && r.role !== 'GK').map((r) => r.player);
  assert.ok(played.every((p) => p.fitness < 95), 'після 90 хвилин гравці втомлені');
  const avg = played.reduce((s, p) => s + p.fitness, 0) / played.length;
  assert.ok(avg > 45 && avg < 90, `середня свіжість ${avg.toFixed(0)}`);
  // ШІ: втомлених (60%) не ставить, якщо є заміна
  const club = W.club(f.h);
  const tired = W.squad(club.id).sort((a, b) => b.ca - a.ca).slice(0, 4);
  for (const p of tired) p.fitness = 60;
  const side = FM.season.sideFor(S, W, club.id, null, f.a, true);
  assert.ok(!side.lineup.xi.some((x) => tired.includes(x.player)), 'втомлені відпочивають');
  FM.season.advance(S, W);
  assert.ok(played.every((p) => p.fitness == null || p.fitness > avg), 'за тиждень відновилися');
});

test('знайомство з тактикою: незнайома схема слабша; зміна схеми посеред матчу', () => {
  const W = FM.createWorld(db);
  const h = byName(W, 'Arsenal'), a = byName(W, 'Chelsea');
  const mk = (fam) => FM.match.create({ home: { club: h, players: W.squad(h.id), familiarity: fam }, away: { club: a, players: W.squad(a.id) }, seed: 'fam' });
  const known = mk(1), unknown = mk(0);
  known.step(); unknown.step();
  assert.ok(unknown.sides[0].units.att < known.sides[0].units.att * 0.97);
  const M = mk(1);
  for (let i = 0; i < 30; i++) M.step();
  assert.ok(M.setShape(0, '5-3-2', { familiarity: 0.5 }));
  assert.strictEqual(M.sides[0].formation, '5-3-2');
  const roles = M.sides[0].onPitch.filter((x) => !x.out).map((x) => x.slot.role);
  assert.strictEqual(roles.filter((r) => r === 'CB').length, 3);
  assert.ok(M.events.some((e) => /перебудовується/.test(e.text)));
  const r = M.result();
  assert.ok(r.score.length === 2);
});
