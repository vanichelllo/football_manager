'use strict';
// Два сезони поспіль з усіма системами — світ має лишатися стабільним.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'develop', 'market', 'board', 'morale', 'cups']) require(`../js/${m}.js`);

test('два сезони: кількість гравців, рівень ліг, склади, гроші, кубки', { timeout: 600000 }, () => {
  const W = FM.createWorld(db);
  const state = { clubId: [...W.clubs.values()].find((c) => c.nameEn === 'Dynamo Kyiv').id, season: FM.season.create(W, 'long') };
  FM.market.init(W, state);
  FM.board.initSeason(W, state);
  state.cups = FM.cups.createAll(W, state.season, null);
  FM.cups.payParticipation(W, state);
  const active = () => [...W.players.values()].filter((p) => p.club).length;
  const leagueCA = () => Object.fromEntries(db.leagues.map((l) => {
    const ps = [...W.players.values()].filter((p) => p.club && W.club(p.club).league === l.id).sort((a, b) => b.ca - a.ca);
    const top = ps.slice(0, l.size * 16);
    return [l.id, top.reduce((s, p) => s + p.ca, 0) / top.length];
  }));
  const n0 = active(), ca0 = leagueCA();
  const user = () => ({ clubId: state.clubId, tactics: null });
  const winners = [];
  for (let season = 0; season < 2; season++) {
    while (!FM.season.isOver(state.season)) {
      FM.cups.playWeek(W, state, { user: user() });
      FM.season.playWeek(state.season, W, { user: user(), dev: { myClub: state.clubId } });
      FM.market.weekly(W, state);
      FM.morale.weekly(W, state);
      if (FM.board.weekly(W, state).fired) FM.board.takeJob(W, state, FM.board.jobOffers(W, state, 1)[0]);
    }
    winners.push(Object.values(state.cups).map((c) => c.winner));
    const tables = Object.fromEntries(db.leagues.map((l) => [l.id, FM.season.table(state.season, W, l.id).map((r) => r.id)]));
    FM.board.endSeason(W, state);
    FM.market.endSeason(W, state);
    FM.dev.endSeason(W, state);
    FM.dev.newSeason(W, state);
    FM.market.init(W, state);
    FM.board.initSeason(W, state);
    state.cups = FM.cups.createAll(W, state.season, tables);
    FM.cups.payParticipation(W, state);
  }
  assert.strictEqual(state.season.year, 2028);
  for (const ws of winners) assert.ok(ws.every(Boolean), 'у кожному кубку є переможець');
  const n1 = active();
  assert.ok(Math.abs(n1 - n0) / n0 < 0.15, `гравців у клубах: ${n0} → ${n1}`);
  const ca1 = leagueCA();
  for (const l of db.leagues) assert.ok(Math.abs(ca1[l.id] - ca0[l.id]) < 8, `${l.id}: рівень ${ca0[l.id].toFixed(1)} → ${ca1[l.id].toFixed(1)}`);
  for (const c of W.clubs.values()) {
    assert.ok(c.players.length >= 18 && c.players.length <= 45, `${c.nameEn}: ${c.players.length} гравців`);
    if (c.id !== state.clubId) assert.ok(W.squad(c.id).filter((p) => p.roles[0] === 'GK').length >= 2, `${c.nameEn}: воротарі`);
  }
  const broke = [...W.clubs.values()].filter((c) => c.balance < -0.2 * c.income0 * 52);
  assert.ok(broke.length <= 12, `у боргах: ${broke.map((c) => `${c.nameEn} ${c.balance}`).join(', ')}`);
  for (const p of W.players.values()) {
    assert.ok(Number.isFinite(p.ca) && Number.isFinite(p.pa), p.nameEn);
    for (const v of Object.values(p.attrs)) assert.ok(Number.isFinite(v) && v >= 1 && v <= 20, p.nameEn);
  }
  console.log(`  гравців ${n0} → ${n1}; рівень ліг`, Object.fromEntries(db.leagues.map((l) => [l.id, `${ca0[l.id].toFixed(0)}→${ca1[l.id].toFixed(0)}`])));
});
