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
require('../js/board.js');

const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function career(en) {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'bd') };
  FM.market.init(W, state);
  FM.board.initSeason(W, state);
  return { W, state };
}

test('цілі правління: найсильніший — титул, найслабший — виживання', () => {
  const { W } = career('Arsenal');
  for (const l of db.leagues) {
    const ranked = W.clubsOf(l.id).map((c) => [c.id, W.clubLevel(c.id)]).sort((a, b) => b[1] - a[1]);
    assert.strictEqual(FM.board.target(W, ranked[0][0]).kind, 'title', l.id);
    assert.strictEqual(FM.board.target(W, ranked[ranked.length - 1][0]).kind, 'survive', l.id);
  }
});

test('фінанси за сезон: клуби без трансферів не банкрутують і не багатіють безмежно', () => {
  const { W, state } = career('Shakhtar Donetsk');
  const start = new Map([...W.clubs.values()].map((c) => [c.id, c.balance]));
  while (!FM.season.isOver(state.season)) {
    FM.season.playWeek(state.season, W, {});
    FM.board.weekly(W, state);
  }
  FM.board.endSeason(W, state);
  for (const c of W.clubs.values()) {
    const d = c.balance - start.get(c.id);
    const yearIncome = c.income0 * 52;
    assert.ok(d > -0.12 * yearIncome, `${c.nameEn}: ${d.toFixed(1)}`);
    assert.ok(d < 0.4 * yearIncome, `${c.nameEn}: +${d.toFixed(1)} при доході ${yearIncome.toFixed(1)}`);
  }
  const f = state.board.fin;
  assert.ok(f.tv > 0 && f.tickets > 0 && f.wages > 0 && f.prize > 0);
});

test('серія поразок — звільнення; репутація й пропозиції роботи', () => {
  const { W, state } = career('Arsenal');
  const S = state.season;
  let fired = false;
  for (let w = 0; w < 14 && !fired; w++) {
    for (const f of FM.season.fixturesOfWeek(S, S.week)) f.s = f.h === state.clubId ? [0, 3] : f.a === state.clubId ? [3, 0] : [1, 1];
    S.week++;
    fired = FM.board.weekly(W, state).fired;
  }
  assert.ok(fired, `довіра ${state.board.conf}`);
  const offers = FM.board.jobOffers(W, state, 3);
  assert.ok(offers.length === 3 && !offers.includes(state.clubId));
  const lvl = W.clubLevel(state.clubId);
  assert.ok(offers.every((id) => W.clubLevel(id) <= lvl + 5), 'після провалу — не кращі клуби');
  FM.board.takeJob(W, state, offers[0]);
  assert.strictEqual(state.clubId, offers[0]);
  assert.ok(state.board.target && state.board.conf > 40);
});

test('вдалий сезон підвищує репутацію', () => {
  const { W, state } = career('Bournemouth');
  const S = state.season;
  for (const f of S.fixtures) f.s = f.h === state.clubId ? [3, 0] : f.a === state.clubId ? [0, 3] : [1, 1];
  S.week = FM.season.weeks(S);
  const rep0 = state.board.rep;
  const r = FM.board.endSeason(W, state);
  assert.strictEqual(r.pos, 1);
  assert.ok(!r.fired && state.board.rep > rep0 + 8);
});
