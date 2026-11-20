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
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'cups', 'club', 'career']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en = 'Shakhtar Donetsk') {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'career') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state);
  return { W, state };
}

test('профіль тренера: навички, ліцензія за рівнем клубу, статистика й досвід', () => {
  const { W, state } = fresh('Real Madrid');
  assert.strictEqual(state.coach.licence, 'Pro');
  assert.strictEqual(fresh('Poltava').state.coach.licence, 'C');
  const opp = byName(W, 'Getafe').id;
  for (let i = 0; i < 12; i++) FM.career.match(W, state, [2, 0], opp, 'league');
  const c = state.coach;
  assert.deepStrictEqual([c.stats.p, c.stats.w, c.stats.gf], [12, 12, 24]);
  assert.strictEqual(c.clubs[0].w, 12);
  const sum = (a) => Object.values(a).reduce((x, y) => x + y, 0);
  assert.strictEqual(sum(c.attrs), sum(fresh('Real Madrid').state.coach.attrs) + 1, 'досвід: +1 після 12 матчів');
  assert.ok(state.ach.first_win && state.ach.unbeaten_10);
});

test('ліцензія обмежує пропозиції роботи; курс підвищує ліцензію й навички', () => {
  const { W, state } = fresh('Poltava');
  state.board.rep = 95;
  for (const id of FM.board.jobOffers(W, state, 6, 'x')) assert.ok(W.clubLevel(id) <= FM.career.LIC.C.maxLvl);
  W.club(state.clubId).balance = 5;
  state.board.conf = 70;
  const r = FM.career.startCourse(W, state);
  assert.ok(r.ok, r.reason);
  const tac0 = state.coach.attrs.tac;
  for (let w = 0; w < r.weeks; w++) FM.career.weekly(W, state);
  assert.strictEqual(state.coach.licence, 'B');
  assert.strictEqual(state.coach.attrs.tac, tac0 + 1);
});

test('переговори: кращий переговорник платить менше', () => {
  const { W, state } = fresh('Arsenal');
  const p = W.squad(byName(W, 'Brighton & Hove Albion').id).sort((a, b) => b.ca - a.ca)[3];
  state.coach.attrs.neg = 10;
  const a = FM.market.clubResponse(W, p, 0, state.clubId, state.season).ask;
  state.coach.attrs.neg = 20;
  const b = FM.market.clubResponse(W, p, 0, state.clubId, state.season).ask;
  assert.ok(b < a, `${b} < ${a}`);
});

test('бачення правління: цілі за статусом клубу, підсумок сезону змінює довіру', () => {
  const { W, state } = fresh('Shakhtar Donetsk');
  const v = FM.career.makeVision(W, state);
  assert.ok(v.goals.length >= 3 && v.goals.some((g) => g.kind === 'youth') && v.goals.some((g) => g.kind === 'finance'));
  const tier2 = fresh('Portsmouth');
  assert.strictEqual(FM.career.makeVision(tier2.W, tier2.state).goals[0].kind, 'promotion');
  const conf0 = state.board.conf;
  const out = FM.career.endSeason(W, state, { league: 'ukr', pos: 1, champion: true, trophies: ['league'], promoted: false });
  assert.ok(out.lines.some((t) => t.includes('виконано')));
  assert.notStrictEqual(state.board.conf, conf0);
  assert.ok(state.ach.title);
});

test('розмови й обіцянки: виконана — настрій вгору, порушена — гравець хоче піти', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const S = state.season;
  const sq = W.squad(state.clubId).sort((a, b) => b.ca - a.ca);
  const bench = sq[18];
  const opts = FM.career.talkOptions(W, state, bench).map((o) => o.kind);
  assert.ok(opts.includes('time') && !opts.includes('sign'));
  const m0 = FM.morale.get(bench);
  FM.career.talk(W, state, bench, 'time');
  assert.ok(FM.morale.get(bench) > m0);
  assert.ok(FM.career.talkOptions(W, state, bench).every((o) => o.off), 'повторно — не одразу');
  // не дали зіграти — порушено
  S.week = state.promises[0].due;
  const news = FM.career.weekly(W, state);
  assert.ok(news.some((t) => t.includes('не дотримали')));
  assert.ok(bench.wantsOut);
  // інший гравець — дали зіграти 3 матчі
  const other = sq[17];
  S.week = 0;
  FM.career.talk(W, state, other, 'time');
  S.ps[other.id] = [(S.ps[other.id] || [0])[0] + 3, 0, 0, 0, 0, 0];
  const news2 = FM.career.weekly(W, state);
  assert.ok(news2.some((t) => t.includes('обіцянку виконано')));
  assert.strictEqual(other.trust, 1);
});
