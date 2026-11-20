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
for (const m of ['rng', 'match', 'season', 'market', 'board', 'club']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en = 'Shakhtar Donetsk') {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'club') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  return { W, state };
}

test('персонал і база: кращі тренери — швидший розвиток', () => {
  const { W, state } = fresh();
  const p = W.squad(state.clubId).find((x) => x.roles[0] === 'ST');
  state.staff.coachAtt.level = 5; const lo = FM.club.growthMult(state, W, p);
  state.staff.coachAtt.level = 20; const hi = FM.club.growthMult(state, W, p);
  assert.ok(hi > lo * 1.15);
  assert.ok(FM.club.staffBill(state) > 0);
});

test('інфраструктура: правління погоджує лише з грошима, будівництво завершується', () => {
  const { W, state } = fresh('Arsenal');
  const c = W.club(state.clubId), f = FM.club.facilities(W, c.id);
  const t0 = f.training;
  const r = FM.club.requestUpgrade(W, state, 'training');
  assert.ok(r.ok, r.reason);
  assert.ok(!FM.club.requestUpgrade(W, state, 'youth').ok, 'два будівництва одночасно — ні');
  for (let i = 0; i < 12; i++) FM.club.buildWeek(W, state);
  assert.strictEqual(f.training, Math.min(20, t0 + 1));
  c.balance = 0.1;
  assert.ok(!FM.club.requestUpgrade(W, state, 'stadium').ok);
});

test('вболівальники: настрій і ціни впливають на квитки', () => {
  const { W, state } = fresh();
  const f = FM.club.fans(W, state.clubId);
  f.mood = 90; const happy = FM.club.ticketFactor(W, state.clubId, 0.5);
  f.mood = 20; const sad = FM.club.ticketFactor(W, state.clubId, 0.5);
  assert.ok(happy > sad);
  f.price = 'high'; const high = FM.club.attendance(W, state.clubId, 0.5);
  f.price = 'low'; const low = FM.club.attendance(W, state.clubId, 0.5);
  assert.ok(low > high);
  FM.club.fansWeek(W, state, { [state.clubId]: 1 });
  assert.ok(f.mood > 20);
});

test('тренери ШІ: стиль змінює тактику; невдахи звільняються', () => {
  const { W, state } = fresh();
  const c = byName(W, 'Arsenal');
  c.manager.style = 'counter';
  const st = FM.club.aiStyle(c, 'balanced');
  assert.deepStrictEqual([st.mentality, st.pressing, st.passing], ['cautious', 'low', 'direct']);
  // Арсенал програє все — після 12 туру його тренера звільнять
  const S = state.season;
  let sacked = false;
  for (let w = 0; w < 30 && !sacked; w++) {
    for (const f of FM.season.fixturesOfWeek(S, S.week)) f.s = f.h === c.id ? [0, 3] : f.a === c.id ? [3, 0] : [1, 0];
    S.week++;
    sacked = FM.club.managersWeek(W, state).some((e) => e.club === c);
  }
  assert.ok(sacked, 'тренера Арсенала звільнили');
  assert.ok(c.vacancy);
});
