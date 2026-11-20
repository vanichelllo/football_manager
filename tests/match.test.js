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
    assert.strictEqual(scorers + m.ownGoals[0] + m.ownGoals[1], m.score[0] + m.score[1], 'голи гравців + автоголи = рахунок');
    assert.strictEqual(m.stats[0].poss + m.stats[1].poss, 100);
  }
});

test('покроковий матч: заміни, ліміт 5, зміна тактики', () => {
  const M = FM.match.create({ home: { ...team(club('Arsenal')), manual: true }, away: team(club('Chelsea')), seed: 'live' });
  for (let i = 0; i < 60; i++) M.step();
  const me = M.sides[0];
  const left = me.subsLeft; // якщо була травма — одну заміну вже використано
  const out = me.onPitch.find((x) => !x.out && x.slot.role !== 'GK' && !x.subbedOn);
  const sub = me.bench.find((p) => p.roles[0] !== 'GK');
  assert.ok(M.sub(0, out.p.id, sub.id));
  assert.ok(!M.sub(0, out.p.id, me.bench[0].id), 'двічі одного не замінити');
  let made = 1;
  for (const b of me.bench.slice()) {
    const x = me.onPitch.find((y) => !y.out && y.slot.role !== 'GK' && !y.subbedOn);
    if (b.roles[0] !== 'GK' && x && M.sub(0, x.p.id, b.id)) made++;
  }
  assert.strictEqual(made, left, 'не більше п’яти замін');
  assert.strictEqual(me.subsLeft, 0);
  assert.ok(M.setTactics(0, { mentality: 'attacking', pressing: 'high' }));
  const r = M.result();
  assert.ok(M.done);
  const subbed = r.ratings.filter((x) => x.team === 0 && x.on);
  assert.strictEqual(subbed.length, 5);
  assert.ok(r.events.some((e) => e.type === 'sub' && e.team === 0));
  // ручна команда без замін від помічника: лише 5 наших замін
  assert.strictEqual(r.events.filter((e) => e.type === 'sub' && e.team === 0).length, 5);
});

test('тактика має ефект: атака — більше голів, високий пресинг — більше втома й картки', () => {
  const run = (tac, n = 400) => {
    let goals = 0, cards = 0, cond = 0;
    for (let i = 0; i < n; i++) {
      const M = FM.match.create({ home: { ...team(club('Napoli')), ...tac }, away: { ...team(club('Lazio')), ...tac }, seed: 't' + i });
      const r = M.result();
      goals += r.score[0] + r.score[1];
      cards += r.stats[0].yellow + r.stats[1].yellow;
      cond += M.sides[0].onPitch.filter((x) => !x.out && !x.subbedOn).reduce((s, x) => s + x.cond, 0) / 11;
    }
    return { goals: goals / n, cards: cards / n, cond: cond / n };
  };
  const def = run({ mentality: 'defensive' }), att = run({ mentality: 'attacking' });
  assert.ok(att.goals > def.goals * 1.15, `атака ${att.goals.toFixed(2)} проти оборони ${def.goals.toFixed(2)}`);
  const low = run({ pressing: 'low' }), high = run({ pressing: 'high' });
  assert.ok(high.cards > low.cards, 'високий пресинг — більше карток');
  assert.ok(high.cond < low.cond - 3, `свіжість наприкінці: ${high.cond.toFixed(1)} проти ${low.cond.toFixed(1)}`);
});

test('склад із тактики: недоступних замінює помічник', () => {
  const sq = W.squad(club('Arsenal').id);
  const lu = FM.pickLineup(sq, '4-3-3');
  const ids = lu.xi.map((x) => x.player.id);
  const without = sq.filter((p) => p.id !== ids[9]); // нападник дискваліфікований
  const res = FM.lineupFromIds(without, '4-3-3', ids);
  assert.strictEqual(new Set(res.xi.map((x) => x.player.id)).size, 11);
  assert.ok(!res.xi.some((x) => x.player.id === ids[9]));
  assert.ok(res.xi[9].auto);
  assert.deepStrictEqual(res.xi.filter((x, i) => i !== 9).map((x) => x.player.id), ids.filter((x, i) => i !== 9));
});

test('порядок подій: другий тайм починається після перерви, хвилини не йдуть назад', () => {
  for (let i = 0; i < 30; i++) {
    const m = FM.match.play({ home: team(club('Arsenal')), away: team(club('Chelsea')), seed: 'ord' + i });
    const half = m.events.findIndex((e) => e.type === 'half' && String(e.min).startsWith('45'));
    const second = m.events.findIndex((e) => e.type === 'half' && e.min === 46);
    assert.ok(half >= 0 && second === half + 1, `перерва ${half}, другий тайм ${second}`);
    const val = (x) => (typeof x === 'number' ? x : Number(String(x).split('+')[0]) + Number(String(x).split('+')[1] || 0) / 10);
    for (let k = 1; k < m.events.length; k++) assert.ok(val(m.events[k].min) >= val(m.events[k - 1].min) || (m.events[k - 1].min + '').startsWith('45+'), `${m.events[k - 1].min} → ${m.events[k].min}`);
  }
});
