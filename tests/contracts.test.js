'use strict';
// Переговори про контракт: статус, бонуси й пункти, раунди, виплати.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const FM = require('../js/world.js');
for (const m of ['rng', 'attrs', 'match', 'season', 'data/names', 'develop', 'market', 'board', 'club', 'finance', 'budget', 'agents', 'morale', 'contracts']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh() {
  const W = FM.createWorld(ctx.window.FM_DB);
  const state = { clubId: byName(W, 'Dynamo Kyiv').id, season: FM.season.create(W, 'ctr') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  return { W, state };
}

test('продовження: мала пропозиція — відмова; умови агента — згода; бонуси добирають зарплату', () => {
  const { W, state } = fresh();
  const p = W.squad(state.clubId).sort((a, b) => b.ca - a.ca)[2];
  const neg = { rounds: 0, max: 5 };
  const low = FM.contracts.draft(W, state, p, state.clubId, 'renew');
  low.wage = Math.round(low.wage * 0.5);
  const r1 = FM.contracts.evaluate(W, state, p, state.clubId, low, 'renew', neg);
  assert.ok(!r1.ok && r1.req > low.wage);
  const sug = FM.contracts.suggest(W, state, p, state.clubId, low, 'renew');
  const r2 = FM.contracts.evaluate(W, state, p, state.clubId, sug, 'renew', neg);
  assert.ok(r2.ok, r2.text);
  // та сама вартість через бонуси й підйомні: зарплата нижча за вимогу
  const req = r2.req;
  const mix = { ...sug, wage: Math.round(req * 0.85), signOn: 1, bonus: { app: Math.round(req * 0.12), goal: 0, clean: 0, unused: 0 } };
  assert.ok(FM.contracts.worth(W, p, mix) > mix.wage, 'бонуси й підйомні додають вартості');
});

test('статус: нижчий за очікуваний — дорожче або відмова; вищий — дешевше', () => {
  const { W, state } = fresh();
  const star = W.squad(state.clubId).sort((a, b) => b.ca - a.ca)[0];
  assert.strictEqual(FM.contracts.expected(W, star, state.clubId), 'key');
  const o = FM.contracts.draft(W, state, star, state.clubId, 'renew');
  const base = FM.contracts.required(W, state, star, state.clubId, o, 'renew');
  const r = FM.contracts.evaluate(W, state, star, state.clubId, { ...o, status: 'backup' }, 'renew', { rounds: 0, max: 5 });
  assert.ok(!r.ok && /не погодиться/.test(r.text));
  const mid = W.squad(state.clubId).sort((a, b) => b.ca - a.ca)[7];
  const o2 = FM.contracts.draft(W, state, mid, state.clubId, 'renew');
  const exp = FM.contracts.expected(W, mid, state.clubId);
  const reqExp = FM.contracts.required(W, state, mid, state.clubId, { ...o2, status: exp }, 'renew');
  const reqKey = FM.contracts.required(W, state, mid, state.clubId, { ...o2, status: 'key' }, 'renew');
  const reqLow = FM.contracts.required(W, state, mid, state.clubId, { ...o2, status: 'backup' }, 'renew');
  assert.ok(reqKey <= reqExp, 'обіцяний вищий статус — гравець просить не більше');
  assert.ok(reqLow > reqExp, 'нижчий статус — просить більше');
  assert.ok(base > 0);
});

test('раунди: агент утомлюється; підписання ставить статус, бонуси, пункти; виплати', () => {
  const { W, state } = fresh();
  const p = W.squad(state.clubId).sort((a, b) => b.ca - a.ca)[5];
  const neg = { rounds: 0, max: 2 };
  const o = FM.contracts.draft(W, state, p, state.clubId, 'renew'); o.wage = 1;
  FM.contracts.evaluate(W, state, p, state.clubId, o, 'renew', neg);
  const last = FM.contracts.evaluate(W, state, p, state.clubId, o, 'renew', neg);
  assert.ok(last.walked);
  const ok = FM.contracts.suggest(W, state, p, state.clubId, o, 'renew');
  ok.bonus.app = 10; ok.loyalty = 100; ok.clause.rise = 10; ok.clause.ext = true; ok.signOn = 0.5;
  const bal0 = W.club(state.clubId).balance;
  FM.contracts.apply(W, state, p, ok, state.clubId);
  assert.strictEqual(p.squadStatus, ok.status);
  assert.ok(W.club(state.clubId).balance < bal0, 'підйомні сплачено');
  assert.strictEqual(FM.morale.status(W, p), ok.status, 'настрій рахує обіцяний статус');
  const w0 = p.wage, c0 = p.contract;
  FM.contracts.seasonEnd(W, state, {});
  assert.strictEqual(p.wage, Math.round(w0 * 1.1), 'щорічне підвищення');
  assert.ok(FM.contracts.exerciseExt(W, state, p).ok && p.contract === c0 + 1, 'опція продовження');
  // бонус за матч
  const S = state.season;
  const f = S.fixtures.filter((x) => x.h === state.clubId || x.a === state.clubId).sort((a, b) => a.w - b.w)[0];
  S.week = f.w; FM.season.playWeek(S, W);
  p.lastPlayed = f.w;
  const paid = FM.contracts.weekBonuses(W, state);
  assert.ok(paid > 0);
});
