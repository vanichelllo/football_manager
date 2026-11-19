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

const club = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh() {
  const W = FM.createWorld(db);
  const state = { clubId: club(W, 'Shakhtar Donetsk').id, season: FM.season.create(W, 'mk') };
  FM.market.init(W, state);
  return { W, state };
}

test('контракти, зарплати й гроші клубів', () => {
  const { W } = fresh();
  for (const p of W.players.values()) if (p.club) { assert.ok(p.contract >= 2027 && p.contract <= 2031); assert.ok(p.wage >= 1); }
  assert.ok(club(W, 'Arsenal').balance > club(W, 'Shakhtar Donetsk').balance * 5);
  const ars = W.squad(club(W, 'Arsenal').id).sort((a, b) => b.ca - a.ca);
  assert.ok(ars[0].wage > ars[ars.length - 1].wage);
  assert.ok(FM.market.wageBill(W, club(W, 'Arsenal').id) > FM.market.wageBill(W, club(W, 'Shakhtar Donetsk').id) * 3);
});

test('торг із клубом: ціна, зустрічна пропозиція, відмова', () => {
  const { W, state } = fresh();
  const S = state.season;
  const star = W.squad(club(W, 'Dynamo Kyiv').id).sort((a, b) => b.ca - a.ca)[0];
  const ask = FM.market.askingPrice(W, star, S);
  assert.ok(ask > star.value * 0.9, `ціна ${ask} проти вартості ${star.value}`);
  assert.ok(FM.market.clubResponse(W, star, ask, state.clubId, S).ok);
  const r = FM.market.clubResponse(W, star, ask * 0.85, state.clubId, S);
  assert.ok(!r.ok && r.counter === ask);
  assert.ok(!FM.market.clubResponse(W, star, ask * 0.4, state.clubId, S).ok);
  star.listed = true;
  assert.ok(FM.market.askingPrice(W, star, S) < ask, 'у трансфер-листі дешевше');
});

test('гравець: зарплата, відмова йти в значно слабший клуб', () => {
  const { W, state } = fresh();
  const mbappe = [...W.players.values()].find((p) => p.nameEn === 'Kylian Mbappé');
  const weak = [...W.clubs.values()].filter((c) => c.league === 'ukr').sort((a, b) => W.clubLevel(a.id) - W.clubLevel(b.id))[0];
  assert.strictEqual(FM.market.wageDemand(W, mbappe, weak.id), null);
  const p = W.squad(club(W, 'Dynamo Kyiv').id)[5];
  const d = FM.market.wageDemand(W, p, state.clubId);
  assert.ok(d > 0);
  assert.ok(FM.market.playerResponse(W, p, state.clubId, d, 3).ok);
  assert.ok(!FM.market.playerResponse(W, p, state.clubId, Math.floor(d * 0.7), 3).ok);
});

test('трансфер: гроші, склад, контракт', () => {
  const { W, state } = fresh();
  const seller = club(W, 'Dynamo Kyiv'), me = W.club(state.clubId);
  const p = W.squad(seller.id)[8];
  const b0 = me.balance, s0 = seller.balance;
  FM.market.complete(W, state, p, me.id, 2, 30, 3);
  assert.strictEqual(p.club, me.id);
  assert.ok(me.players.includes(p.id) && !seller.players.includes(p.id));
  assert.strictEqual(Math.round((b0 - me.balance) * 100) / 100, 2);
  assert.strictEqual(Math.round((seller.balance - s0) * 100) / 100, 2);
  assert.strictEqual(p.contract, 2029);
  assert.ok(!FM.market.clubResponse(W, p, 999, seller.id, state.season).ok, 'щойно купленого не продають');
});

test('трансферне вікно: клуби ШІ купують, за виставленого гравця надходять пропозиції', () => {
  const { W, state } = fresh();
  const S = state.season;
  const listed = W.squad(state.clubId).sort((a, b) => b.ca - a.ca).slice(4, 7);
  for (const p of listed) p.listed = true;
  let offers = 0;
  for (let w = 0; w < 4; w++) { S.week = w; FM.market.weekly(W, state); offers += state.offers.filter((o) => listed.some((p) => p.id === o.pid)).length; }
  const deals = (state.transfers || []).filter((t) => t.fee > 0).length;
  assert.ok(deals >= 5 && deals < 120, `трансферів ШІ: ${deals}`);
  assert.ok(offers > 0, 'є пропозиції за гравця в трансфер-листі');
  S.week = 10;
  const before = (state.transfers || []).filter((t) => t.fee > 0).length;
  FM.market.weekly(W, state);
  assert.strictEqual((state.transfers || []).filter((t) => t.fee > 0).length, before, 'поза вікном не купують');
  for (const c of W.clubs.values()) assert.ok(c.players.length >= 18 && c.players.length <= 45, `${c.nameEn}: ${c.players.length}`);
});

test('кінець контрактів: ШІ продовжує потрібних, ваші без продовження йдуть', () => {
  const { W, state } = fresh();
  const mine = W.squad(state.clubId)[3];
  mine.contract = 2027;
  const renewMe = W.squad(state.clubId)[4];
  renewMe.contract = 2027;
  const d = FM.market.renewDemand(W, renewMe);
  assert.ok(FM.market.renew(W, state, renewMe, d, 2).ok);
  const res = FM.market.endSeason(W, state);
  assert.ok(!mine.club && mine.free);
  assert.strictEqual(renewMe.club, state.clubId);
  assert.ok(res.renewed > 50 && res.expired.length > 20);
});
