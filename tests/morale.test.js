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
require('../js/rng.js');
require('../js/match.js');
require('../js/season.js');
require('../js/market.js');
require('../js/morale.js');

const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);

test('мораль впливає на гру: щаслива команда забиває більше', () => {
  const W = FM.createWorld(db);
  const run = (m) => {
    for (const p of W.players.values()) p.morale = m;
    let gd = 0;
    for (let i = 0; i < 400; i++) {
      const h = byName(W, 'Napoli'), a = byName(W, 'Lazio');
      const r = FM.match.play({ home: { club: h, players: W.squad(h.id) }, away: { club: a, players: W.squad(a.id) }, seed: 'm' + i });
      gd += r.score[0] - r.score[1];
    }
    return gd / 400;
  };
  // мораль лише господарів: міняємо після кожного прогону
  const W2 = W;
  for (const p of W2.players.values()) p.morale = 62;
  const base = run(62);
  for (const p of W2.squad(byName(W2, 'Lazio').id)) p.morale = 62;
  const hi = (() => { for (const p of W2.players.values()) p.morale = 62; for (const p of W2.squad(byName(W2, 'Napoli').id)) p.morale = 95; let gd = 0; for (let i = 0; i < 400; i++) { const h = byName(W2, 'Napoli'), a = byName(W2, 'Lazio'); const r = FM.match.play({ home: { club: h, players: W2.squad(h.id) }, away: { club: a, players: W2.squad(a.id) }, seed: 'm' + i }); gd += r.score[0] - r.score[1]; } return gd / 400; })();
  const lo = (() => { for (const p of W2.players.values()) p.morale = 62; for (const p of W2.squad(byName(W2, 'Napoli').id)) p.morale = 10; let gd = 0; for (let i = 0; i < 400; i++) { const h = byName(W2, 'Napoli'), a = byName(W2, 'Lazio'); const r = FM.match.play({ home: { club: h, players: W2.squad(h.id) }, away: { club: a, players: W2.squad(a.id) }, seed: 'm' + i }); gd += r.score[0] - r.score[1]; } return gd / 400; })();
  assert.ok(hi > base && base > lo, `різниця м’ячів: висока ${hi.toFixed(2)}, звичайна ${base.toFixed(2)}, низька ${lo.toFixed(2)}`);
});

test('тиждень моралі: перемога піднімає, лідер без ігор сумує й зрештою просить продажу', () => {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, 'Arsenal').id, season: FM.season.create(W, 'mo') };
  FM.market.init(W, state);
  const star = W.squad(state.clubId).sort((a, b) => b.ca - a.ca)[0];
  let asked = false;
  for (let w = 0; w < 14; w++) {
    for (const f of FM.season.fixturesOfWeek(state.season, state.season.week)) {
      f.s = f.h === state.clubId ? [2, 0] : f.a === state.clubId ? [0, 2] : [1, 1];
      if (f.h === state.clubId || f.a === state.clubId) {
        // зірка не грає — решта лідерів грає
        for (const p of W.squad(state.clubId)) if (p.id !== star.id) { const st = (state.season.ps[p.id] = state.season.ps[p.id] || [0, 0, 0, 0, 0, 0]); st[0]++; }
      }
    }
    state.season.week++;
    const ev = FM.morale.weekly(W, state);
    if (ev.some((e) => e.p === star)) asked = true;
  }
  const others = W.squad(state.clubId).filter((p) => p.id !== star.id && FM.morale.status(W, p) === 'key');
  assert.ok(others.every((p) => p.morale > 70), 'перемоги й ігровий час — гарний настрій');
  assert.ok(star.morale < 40, `зірка без ігор: ${star.morale}`);
  assert.strictEqual(star.mr, 'мало грає');
  assert.ok(asked || star.morale >= 25, 'якщо настрій упав нижче 25 — попросив продажу');
});

test('промова в перерві: «вимагати» при поразці допомагає, при перевазі — шкодить', () => {
  const R = FM.rng(1);
  assert.ok(FM.morale.talkEffect('demand', -1, R).boost > 1.02);
  assert.ok(FM.morale.talkEffect('demand', 2, R).boost < 1);
  assert.ok(FM.morale.talkEffect('praise', 1, R).boost > 1.02);
  const W = FM.createWorld(db);
  const h = byName(W, 'Arsenal'), a = byName(W, 'Chelsea');
  const M = FM.match.create({ home: { club: h, players: W.squad(h.id), manual: true }, away: { club: a, players: W.squad(a.id) }, seed: 'ht' });
  while (!M.halftime) M.step();
  const e = M.halftimeTalk(0, 'calm');
  assert.ok(e && M.sides[0].boost > 1);
  assert.strictEqual(M.halftimeTalk(0, 'calm'), null, 'одна промова за матч');
  assert.ok(M.events.some((x) => /роздягальня/.test(x.text)));
});
