'use strict';
// Калібрування двигуна матчу на реальній базі: результати мають бути схожими на справжній футбол.
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
const W = FM.createWorld(db);
const team = (c) => ({ club: c, players: W.squad(c.id) });
const club = (en) => db.clubs.find((c) => c.nameEn === en);

test('однакове зерно — однаковий матч', () => {
  const a = FM.match.play({ home: team(club('Arsenal')), away: team(club('Chelsea')), seed: 'x' });
  const b = FM.match.play({ home: team(club('Arsenal')), away: team(club('Chelsea')), seed: 'x' });
  assert.deepStrictEqual(a.score, b.score);
  assert.deepStrictEqual(a.events.map((e) => e.text), b.events.map((e) => e.text));
});

test('калібрування: голи, перемоги господарів, нічиї, картки', () => {
  const R = FM.rng('calibration');
  let n = 0, goals = 0, home = 0, draw = 0, reds = 0, yellows = 0;
  for (const l of db.leagues) {
    const cs = W.clubsOf(l.id);
    for (let i = 0; i < 250; i++) {
      const h = R.pick(cs), a = R.pick(cs);
      if (h === a) continue;
      const m = FM.match.play({ home: team(h), away: team(a), seed: 'cal' + n });
      n++;
      goals += m.score[0] + m.score[1];
      if (m.score[0] > m.score[1]) home++; else if (m.score[0] === m.score[1]) draw++;
      reds += m.stats[0].red + m.stats[1].red;
      yellows += m.stats[0].yellow + m.stats[1].yellow;
    }
  }
  const g = goals / n, hw = home / n, d = draw / n;
  assert.ok(g > 2.4 && g < 3.0, `голів за матч ${g.toFixed(2)}`);
  assert.ok(hw > 0.38 && hw < 0.5, `перемог господарів ${(hw * 100).toFixed(1)}%`);
  assert.ok(d > 0.2 && d < 0.32, `нічиїх ${(d * 100).toFixed(1)}%`);
  assert.ok(reds / n < 0.2, `червоних ${(reds / n).toFixed(2)}`);
  assert.ok(yellows / n > 2.5 && yellows / n < 5, `жовтих ${(yellows / n).toFixed(2)}`);
});

test('сильніший перемагає частіше, але не завжди', () => {
  let w = 0, l = 0;
  for (let i = 0; i < 300; i++) {
    const m = FM.match.play({ home: team(club('Real Madrid')), away: team(club('Racing Santander')), seed: 'rm' + i });
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] < m.score[1]) l++;
  }
  assert.ok(w / 300 > 0.7 && w / 300 < 0.95, `Реал виграв ${w} з 300`);
  assert.ok(l > 0, 'аутсайдер іноді перемагає');
});

test('склад: 11 різних гравців, воротар на воротах, лава з запасним воротарем', () => {
  for (const c of db.clubs) {
    const sq = W.squad(c.id);
    const lu = FM.pickLineup(sq, FM.bestFormation(sq));
    assert.strictEqual(new Set(lu.xi.map((x) => x.player.id)).size, 11, c.nameEn);
    assert.strictEqual(lu.xi[0].player.roles[0], 'GK', `${c.nameEn}: у воротах ${lu.xi[0].player.nameEn}`);
    assert.ok(lu.bench.length >= 7, c.nameEn);
  }
});

test('у протоколі матчу все узгоджено: голи в подіях = рахунок, оцінки 3–10', () => {
  for (let i = 0; i < 50; i++) {
    const m = FM.match.play({ home: team(club('Dynamo Kyiv')), away: team(club('Shakhtar Donetsk')), seed: 'p' + i });
    const goals = [0, 1].map((k) => m.events.filter((e) => e.type === 'goal' && e.team === k).length);
    assert.deepStrictEqual(goals, m.score);
    for (const r of m.ratings) assert.ok(r.rating >= 3 && r.rating <= 10);
    const scorers = m.ratings.reduce((s, r) => s + r.goals, 0);
    assert.strictEqual(scorers, m.score[0] + m.score[1]);
    assert.strictEqual(m.stats[0].poss + m.stats[1].poss, 100);
  }
});
