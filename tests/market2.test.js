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
for (const m of ['rng', 'match', 'season', 'market']) require(`../js/${m}.js`);
const club = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh() {
  const W = FM.createWorld(db);
  const state = { clubId: club(W, 'Shakhtar Donetsk').id, season: FM.season.create(W, 'mk2') };
  FM.market.init(W, state);
  return { W, state };
}

test('оренда: гравець грає в іншому клубі, зарплату ділять, наприкінці сезону повертається', () => {
  const { W, state } = fresh();
  const owner = club(W, 'Dynamo Kyiv');
  const p = W.squad(owner.id).filter((x) => FM.market.loanable(W, x))[0];
  const bill0 = FM.market.wageBill(W, state.clubId), billO = FM.market.wageBill(W, owner.id);
  FM.market.loanIn(W, state, p, state.clubId, 0.5);
  assert.strictEqual(p.club, state.clubId);
  assert.strictEqual(FM.market.wageBill(W, state.clubId), Math.round(bill0 + p.wage * 0.5));
  assert.ok(Math.abs(FM.market.wageBill(W, owner.id) - (billO - p.wage * 0.5)) <= 1);
  assert.ok(!FM.market.clubResponse(W, p, 999, owner.id, state.season).ok, 'орендованого не продати');
  FM.market.endSeason(W, state);
  assert.strictEqual(p.club, owner.id);
  assert.ok(!p.loan);
});

test('відступні: клуб не може відмовити; відсоток з наступного продажу; обмін', () => {
  const { W, state } = fresh();
  const S = state.season;
  const star = W.squad(club(W, 'Dynamo Kyiv').id).sort((a, b) => b.ca - a.ca)[0];
  star.clause = 1;
  assert.ok(FM.market.clubResponse(W, star, 1, state.clubId, S).ok);
  // відсоток з продажу
  const seller = club(W, 'Polissya Zhytomyr');
  const q = W.squad(seller.id)[6];
  FM.market.complete(W, state, q, state.clubId, 1, 20, 3, { sellOn: 0.2 });
  assert.deepStrictEqual(q.sellOn, { club: seller.id, pct: 0.2 });
  const b0 = seller.balance;
  q.boughtSeason = null;
  FM.market.complete(W, state, q, club(W, 'Arsenal').id, 10, 50, 3);
  assert.strictEqual(Math.round((seller.balance - b0) * 100) / 100, 2);
  // обмін
  const mine = W.squad(state.clubId)[10], target = W.squad(club(W, 'Zorya Luhansk').id)[5];
  FM.market.complete(W, state, target, state.clubId, 0.5, 10, 2, { swap: mine.id });
  assert.strictEqual(mine.club, club(W, 'Zorya Luhansk').id);
  assert.strictEqual(target.club, state.clubId);
});

test('конкуренція: гравець обирає кращу пропозицію з поправкою на силу клубу; агент', () => {
  const { W, state } = fresh();
  const p = W.squad(club(W, 'Dynamo Kyiv').id)[3];
  const d = FM.market.wageDemand(W, p, state.clubId);
  const rv = { club: club(W, 'Real Madrid').id, wage: d };
  assert.ok(!FM.market.playerResponse(W, p, state.clubId, d, 3, { rival: rv }).ok, 'та сама зарплата в Реалі — привабливіша');
  assert.ok(FM.market.playerResponse(W, p, state.clubId, d * 3, 3, { rival: rv }).ok);
  assert.ok(FM.market.agentFee(10, 50) === 0.5);
  assert.ok(FM.market.playerResponse(W, p, state.clubId, Math.ceil(d * 0.91), 3, { clauses: { clause: 5 } }).ok, 'з відступними гравець погоджується на меншу зарплату');
});

test('скаути: ліга розвідується за кілька тижнів; дедлайн', () => {
  const { W, state } = fresh();
  const sc = FM.market.scouts(state)[0];
  sc.region = 'eng';
  for (let w = 0; w < 25 && !(state.knownLeagues || {}).eng; w++) { state.season.week = 10 + w; FM.market.weekly(W, state); }
  assert.ok(state.knownLeagues.eng, 'АПЛ розвідана');
  assert.ok(FM.market.scoutAccuracy(state) < 1.2);
  state.season.week = 3;
  FM.market.weekly(W, state);
  assert.ok(state.news.some((n) => /закриття трансферного вікна/.test(n.text)));
});
