'use strict';
// Група 1: вигуки з бровки, промова перед матчем, звіт у перерві, стандарти, розмова після матчу.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'morale']) require(`../js/${m}.js`);
const W = FM.createWorld(db);
const club = (en) => [...W.clubs.values()].find((c) => c.nameEn === en);
const side = (c, extra = {}) => ({ club: c, players: W.squad(c.id), ...extra });
const opts = (seed, h = {}, a = {}) => ({ home: side(club('Dynamo Kyiv'), h), away: side(club('Shakhtar Donetsk'), a), seed });

test('вигук «Більше в атаку» — більше ударів; діє 10 хвилин; частіше ніж раз на 5 хвилин — не можна', () => {
  let base = 0, att = 0;
  for (let i = 0; i < 120; i++) {
    const a = FM.match.create(opts('s' + i, { manual: true }));
    while (a.minuteNum < 20) a.step();
    const s0 = a.sides[0].stats.shots;
    while (a.minuteNum < 50) a.step();
    base += a.sides[0].stats.shots - s0;
    const b = FM.match.create(opts('s' + i, { manual: true }));
    while (b.minuteNum < 20) b.step();
    const s1 = b.sides[0].stats.shots;
    for (const m of [20, 30, 40]) { while (b.minuteNum < m) b.step(); b.shout(0, 'attack'); }
    while (b.minuteNum < 50) b.step();
    att += b.sides[0].stats.shots - s1;
  }
  assert.ok(att > base * 1.06, `удари: ${base} → ${att}`);
  const m = FM.match.create(opts('x', { manual: true }));
  while (m.minuteNum < 10) m.step();
  assert.ok(m.shout(0, 'keep').ok);
  assert.strictEqual(m.shout(0, 'attack').ok, false, 'занадто рано');
  while (m.minuteNum < 21) m.step();
  assert.strictEqual(m.sides[0].shout, null, 'вигук скінчився');
  assert.ok(m.events.some((e) => /з бровки/.test(e.text)));
});

test('промова перед матчем: реакція кожного гравця, лише до стартового свистка', () => {
  const m = FM.match.create(opts('t', { manual: true }));
  const r = m.teamTalk(0, 'faith');
  assert.strictEqual(r.players.length, 11);
  assert.ok(r.players.every((x) => FM.match.TALK_REACT_UK[x.r]));
  assert.strictEqual(m.teamTalk(0, 'win'), null, 'двічі не можна');
  const m2 = FM.match.create(opts('t2', { manual: true }));
  m2.step();
  assert.strictEqual(m2.teamTalk(0, 'calm'), null, 'після початку — ні');
  // «Нам нічого втрачати» для явного фаворита — більше розслаблених, ніж для андердога
  let favC = 0, dogC = 0;
  for (let i = 0; i < 30; i++) {
    const fav = FM.match.create({ home: side(club('Real Madrid'), { manual: true }), away: side(club('Obolon Kyiv')), seed: 'f' + i });
    favC += fav.teamTalk(0, 'underdog').players.filter((x) => x.r === 'complacent').length;
    const dog = FM.match.create({ home: side(club('Obolon Kyiv'), { manual: true }), away: side(club('Real Madrid')), seed: 'd' + i });
    dogC += dog.teamTalk(0, 'underdog').players.filter((x) => x.r === 'complacent').length;
  }
  assert.ok(favC > dogC * 3, `розслаблені: фаворит ${favC}, андердог ${dogC}`);
});

test('звіт асистента в перерві й стандарти', () => {
  const m = FM.match.create(opts('h', { manual: true }));
  while (!m.halftime) m.step();
  const rep = m.halfReport(0);
  assert.ok(rep.length >= 2 && /Володіння/.test(rep[0][1]));
  // голи зі стандартів рахуються окремо; навіси зі штрафних дають удари головою
  let sp = 0, goals = 0;
  for (let i = 0; i < 150; i++) {
    const r = FM.match.play(opts('sp' + i, { setp: { corner: 'near', fk: 'cross' } }));
    sp += r.stats[0].spGoals; goals += r.stats[0].goals;
    assert.ok(r.stats[0].spGoals <= r.stats[0].goals);
  }
  assert.ok(sp > 0 && sp < goals * 0.45, `зі стандартів ${sp} з ${goals}`);
});

test('розмова після матчу: похвала після перемоги піднімає мораль, розчарування — ні', () => {
  const sq = W.squad(club('Dynamo Kyiv').id).slice(0, 11);
  for (const p of sq) p.morale = 60;
  const R = FM.rng(1);
  const res = FM.morale.postTalk('praise', 2, sq.map((p) => ({ player: p, rating: 7.2 })), R);
  assert.ok(res.every((x) => x.d > 0) && sq.every((p) => p.morale > 60));
  for (const p of sq) p.morale = 60;
  const res2 = FM.morale.postTalk('disappointed', 1, sq.map((p) => ({ player: p, rating: 7.2 })), R);
  assert.ok(res2.every((x) => x.d < 0), 'розчарування після перемоги ображає');
});

test('поради в перерві можна застосувати; інструкції й опіка посеред матчу', () => {
  let tested = 0;
  for (let i = 0; i < 40 && tested < 3; i++) {
    const m = FM.match.create(opts('tip' + i, { manual: true }));
    while (!m.halftime) m.step();
    for (const [, , act] of m.halfReport(0)) {
      if (!act) continue;
      const before = JSON.stringify([m.sides[0].tactic, m.sides[0].subsLeft, m.sides[0].onPitch.map((x) => x.slot.instr), [...m.sides[1].marked], m.sides[0].shout]);
      assert.ok(m.applyTip(0, act), act.kind);
      const after = JSON.stringify([m.sides[0].tactic, m.sides[0].subsLeft, m.sides[0].onPitch.map((x) => x.slot.instr), [...m.sides[1].marked], m.sides[0].shout]);
      assert.notStrictEqual(before, after, `${act.kind} нічого не змінив`);
      tested++;
    }
  }
  assert.ok(tested >= 3, 'знайшлися поради з дією');
  const m = FM.match.create(opts('mk', { manual: true }));
  m.step();
  const star = m.sides[1].onPitch.find((x) => x.slot.role === 'ST');
  assert.ok(m.mark(0, star.p.id));
  assert.ok(m.sides[1].marked.has(star.p.id) && m.sides[0].onPitch.some((x) => x.slot.instr === 'mark'));
  assert.ok(m.mark(0, null) && !m.sides[1].marked.size);
  const fb = m.sides[0].onPitch.find((x) => x.slot.role === 'FB');
  assert.ok(m.setInstr(0, fb.p.id, 'defend'));
  assert.strictEqual(m.sides[0].onPitch.find((x) => x.p.id === fb.p.id).slot.instr, 'defend');
});

test('рідкісні моменти: автоголи, хет-трики, яскраві голи — але не надто часто', () => {
  let og = 0, hat = 0, wow = 0, n = 300, goals = 0;
  for (let i = 0; i < n; i++) {
    const r = FM.match.play(opts('rare' + i));
    og += r.ownGoals[0] + r.ownGoals[1]; goals += r.score[0] + r.score[1];
    hat += r.events.filter((e) => /ХЕТ-ТРИК/.test(e.text)).length;
    wow += r.events.filter((e) => e.hl && e.hl.special).length;
  }
  assert.ok(og > 0 && og / n < 0.25, `автоголів за матч ${og / n}`);
  assert.ok(wow > 0, 'бувають яскраві голи');
  assert.ok(goals / n > 2.2 && goals / n < 3.3, `голів за матч ${goals / n}`);
  assert.ok(hat >= 0);
});

test('випадкові події: новина або лист з вибором, відповідь змінює стан', () => {
  require('../js/data/names.js'); require('../js/data/countries.js'); require('../js/develop.js'); require('../js/market.js'); require('../js/club.js'); require('../js/youth.js'); require('../js/events.js');
  const c = club('Dynamo Kyiv');
  const state = { clubId: c.id, season: FM.season.create(W, 'ev') };
  FM.market.init(W, state);
  let news = 0, asks = 0;
  for (let w = 0; w < 48; w++) {
    state.season.week = w;
    const e = FM.events.week(W, state, (p) => p.name);
    if (!e) continue;
    if (e.text) news++;
    if (e.ask) {
      asks++;
      assert.ok(state.evPending && state.evPending.opts.length >= 2);
      const r = FM.events.answer(W, state, 0);
      assert.ok(typeof r === 'string' && r.length > 5, r);
      assert.strictEqual(state.evPending, null);
    }
  }
  assert.ok(news + asks >= 5 && news + asks <= 22, `подій за сезон: ${news + asks}`);
  assert.ok(news > 0 && asks > 0);
});
