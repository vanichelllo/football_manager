'use strict';
// Трансферний центр: додаткові умови, що шукає клуб, оренди ваших гравців, відкладені переходи, бонуси за голи.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'develop', 'market', 'board', 'club', 'finance', 'budget', 'deals', 'tcentre']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh() {
  const W = FM.createWorld(ctx.window.FM_DB);
  const state = { clubId: byName(W, 'Dynamo Kyiv').id, season: FM.season.create(W, 'tc') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  return { W, state };
}

test('додаткові умови підвищують цінність пропозиції; потенційна сума', () => {
  assert.strictEqual(FM.tcentre.extrasValue(10, {}), 0);
  const v = FM.tcentre.extrasValue(10, { sellOn: 20, goals: 10, goalsFee: 2, promoFee: 1.5, loanBack: true, later: true });
  assert.ok(v > 2 && v < 6, String(v));
  assert.strictEqual(FM.tcentre.potential(10, { goalsFee: 2, promoFee: 1.5 }), 13.5);
});

test('статус і потреби клубу-продавця', () => {
  const { W } = fresh();
  const c = byName(W, 'Shakhtar Donetsk').id;
  const best = W.squad(c).sort((a, b) => b.ca - a.ca)[0];
  assert.strictEqual(FM.tcentre.statusAt(W, best), 'Незамінний для клубу');
  const n = FM.tcentre.needs(W, c);
  assert.strictEqual(n.length, 2);
  assert.ok(n.every((r) => FM.ROLE_NAME[r]));
});

test('оренди ваших гравців у вікно; прийняти — гравець іде з обіцянкою', () => {
  const { W, state } = fresh();
  const S = state.season;
  S.week = FM.market.windows(S)[0][0];
  let offers = [];
  for (let i = 0; i < 6 && !offers.length; i++) { S.week = FM.market.windows(S)[0][0] + i; FM.tcentre.loanWeekly(W, state); offers = state.loanOffers; for (const p of W.squad(state.clubId)) if ((W.age(p) ?? 30) <= 23) p.listed = true; }
  assert.ok(offers.length > 0, 'є пропозиції оренди');
  const o = offers[0];
  const txt = FM.tcentre.acceptLoan(W, state, o.id);
  const p = W.player(o.pid);
  assert.ok(txt && p.loan && p.loan.to === o.club && p.loan.promise === o.role);
});

test('відкладений перехід і бонус за голи', () => {
  const { W, state } = fresh();
  const p = W.squad(byName(W, 'Shakhtar Donetsk').id)[5];
  FM.tcentre.addFuture(state, { pid: p.id, from: p.club, fee: 3 });
  const done = FM.tcentre.runFuture(W, state, (pl) => { W.move(pl.id, state.clubId); return 'ok'; });
  assert.deepStrictEqual(done, ['ok']);
  assert.strictEqual(p.club, state.clubId);
  assert.deepStrictEqual(state.future, []);
  FM.tcentre.registerExtras(state, p, byName(W, 'Shakhtar Donetsk').id, { goals: 2, goalsFee: 1 });
  state.season.ps[p.id] = [5, 2, 0, 0, 0, 0];
  const bal0 = W.club(state.clubId).balance;
  const news = FM.tcentre.weekGoals(W, state);
  assert.strictEqual(news.length, 1);
  assert.ok(W.club(state.clubId).balance < bal0);
});
