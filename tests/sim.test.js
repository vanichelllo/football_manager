'use strict';
// Детальний рушій матчу (js/sim.js): гравці на полі, справжні передачі, реалістична статистика, сила команди має значення.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'sim', 'data/names', 'morale']) require(`../js/${m}.js`);
const W = FM.createWorld(db);
const by = (en) => [...W.clubs.values()].find((c) => c.nameEn === en);
const side = (c) => { const players = W.squad(c.id); const formation = FM.bestFormation(players); return { club: c, players, formation, lineup: FM.pickLineup(players, formation) }; };
const play = (h, a, seed) => FM.match.play({ home: side(by(h)), away: side(by(a)), seed, name: (p) => p.name, engine: 'sim' });

test('детальний рушій: матч зіграно, усі звичні поля результату на місці', () => {
  const r = play('Dynamo Kyiv', 'Shakhtar Donetsk', 's1');
  assert.strictEqual(r.score.length, 2);
  assert.ok(r.ratings.length >= 22);
  assert.ok(r.events.some((e) => e.type === 'full'));
  for (const st of r.stats) { assert.ok(st.passes > 200, `передач ${st.passes}`); assert.ok(st.passPct > 55 && st.passPct < 95); assert.ok(st.poss > 20 && st.poss < 80); }
  const p = r.ratings.find((x) => x.st.passes > 0);
  assert.ok(p.st.passOk <= p.st.passes);
  // події мають секунду всередині хвилини
  assert.ok(r.events.filter((e) => e.sec != null).every((e) => e.sec >= 0 && e.sec < 60));
});

test('детальний рушій: однакове зерно — однаковий матч; 22 гравці на полі', () => {
  const a = play('Dynamo Kyiv', 'Shakhtar Donetsk', 's2'), b = play('Dynamo Kyiv', 'Shakhtar Donetsk', 's2');
  assert.deepStrictEqual(a.score, b.score);
  const M = FM.match.create({ home: side(by('Dynamo Kyiv')), away: side(by('Shakhtar Donetsk')), seed: 's3', name: (p) => p.name, engine: 'sim' });
  M.step();
  assert.ok(M.sim, 'рушій увімкнено');
  const f = M.sim.frames;
  assert.strictEqual(f.length, 120, 'кадр кожні півсекунди');
  assert.strictEqual(f[0].pos.length / 4, 22);
  for (const fr of f) { assert.ok(fr.bx >= 0 && fr.bx <= 100 && fr.by >= 0 && fr.by <= 100, 'м’яч на полі'); }
});

test('детальний рушій: реалістична статистика і перевага сильнішого', () => {
  const N = 20;
  let goals = 0, shots = 0, strongW = 0, strongG = 0, weakG = 0;
  for (let i = 0; i < N; i++) {
    const r = play('Coventry City', 'Hull City', 'eq' + i);
    goals += r.score[0] + r.score[1]; shots += r.stats[0].shots + r.stats[1].shots;
    const s = play('Arsenal', 'Hull City', 'st' + i);
    strongG += s.score[0]; weakG += s.score[1]; if (s.score[0] > s.score[1]) strongW++;
  }
  assert.ok(goals / N > 1.4 && goals / N < 4.6, `голів за матч ${goals / N}`);
  assert.ok(shots / N > 15 && shots / N < 45, `ударів за матч ${shots / N}`);
  assert.ok(strongW / N >= 0.6, `сильніший виграв ${strongW} з ${N}`);
  assert.ok(strongG > weakG * 1.8, `${strongG} проти ${weakG}`);
});

test('класичний рушій лишився для решти ліг', () => {
  const r = FM.match.play({ home: side(by('Dynamo Kyiv')), away: side(by('Shakhtar Donetsk')), seed: 'c1', name: (p) => p.name });
  assert.ok(!r.events.some((e) => e.sec != null));
});

test('детальний рушій: моменти видно — замахи, стрибки воротаря, дуга м’яча, розстановка на кутовому', () => {
  const M = FM.match.create({ home: side(by('Arsenal')), away: side(by('Burnley')), seed: 'vis1', name: (p) => p.name, engine: 'sim' });
  const acts = {};
  let arcs = 0, cornerSetup = 0;
  while (!M.done) {
    M.step();
    for (const f of M.sim.frames) {
      for (const a of f.a || []) acts[a[1]] = (acts[a[1]] || 0) + 1;
      if (f.bs) arcs++;
      // м'яч біля кутового прапорця: у штрафному мають стояти гравці
      const atCorner = (f.bx < 1 || f.bx > 99) && (f.by < 2 || f.by > 98);
      if (atCorner) {
        const goalX = f.bx < 50 ? 0 : 100;
        let inBox = 0;
        for (let i = 0; i < f.pos.length; i += 4) if (Math.abs(f.pos[i + 1] - goalX) < 16 && Math.abs(f.pos[i + 2] - 50) < 30) inBox++;
        if (inBox >= 8) cornerSetup++;
      }
    }
  }
  const r = M.result();
  assert.ok(acts.kick > 300, `замахів ${acts.kick}`);
  assert.ok((acts.dive || 0) + (acts.catch || 0) > 0, 'воротар реагує на удари');
  assert.ok(arcs > 10, `кадрів із дугою ${arcs}`);
  if (r.stats[0].corners + r.stats[1].corners > 0) assert.ok(cornerSetup > 0, 'на кутовому гравці в штрафному');
});
