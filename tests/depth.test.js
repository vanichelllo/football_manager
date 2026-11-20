'use strict';
// Глибина: запасні на вибір, інструкції проти суперника, дружба в роздягальні, суперник-тренер.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'morale', 'club', 'dressing', 'rivals']) require(`../js/${m}.js`);
const W = FM.createWorld(db);
const club = (en) => [...W.clubs.values()].find((c) => c.nameEn === en);

test('запасні: обрані тренером ідуть на лаву (і воротар завжди є)', () => {
  const ps = W.squad(club('Dynamo Kyiv').id);
  const lu = FM.pickLineup(ps, '4-3-3');
  const ids = lu.xi.map((x) => x.player.id);
  const rest = ps.filter((p) => !ids.includes(p.id) && p.roles[0] !== 'GK').sort((a, b) => a.ca - b.ca).slice(0, 3); // найслабші
  const l2 = FM.lineupFromIds(ps, '4-3-3', ids, { bench: rest.map((p) => p.id) });
  for (const p of rest) assert.ok(l2.bench.includes(p), 'обраний — на лаві');
  assert.ok(l2.bench.some((p) => p.roles[0] === 'GK') && l2.bench.length <= 9);
});

test('інструкції проти суперника: жорсткий відбір — більше карток; щільний тиск і незручна нога — менше xG суперника', () => {
  const side = (en, extra = {}) => ({ club: club(en), players: W.squad(club(en).id), ...extra });
  let cardsHard = 0, cardsSoft = 0, xgTight = 0, xgNorm = 0;
  for (let i = 0; i < 300; i++) {
    const a = FM.match.play({ home: side('Dynamo Kyiv', { oppi: { tackle: 'hard' } }), away: side('Shakhtar Donetsk'), seed: 'oi' + i });
    const b = FM.match.play({ home: side('Dynamo Kyiv', { oppi: { tackle: 'soft' } }), away: side('Shakhtar Donetsk'), seed: 'oi' + i });
    const c = FM.match.play({ home: side('Dynamo Kyiv', { oppi: { press: 'tight', weakFoot: true } }), away: side('Shakhtar Donetsk'), seed: 'oi' + i });
    const d = FM.match.play({ home: side('Dynamo Kyiv'), away: side('Shakhtar Donetsk'), seed: 'oi' + i });
    cardsHard += a.stats[0].yellow; cardsSoft += b.stats[0].yellow; xgTight += c.stats[1].xg; xgNorm += d.stats[1].xg;
  }
  assert.ok(cardsHard > cardsSoft * 1.3, `картки ${cardsHard} проти ${cardsSoft}`);
  assert.ok(xgTight < xgNorm * 0.97, `xG суперника ${xgTight.toFixed(1)} проти ${xgNorm.toFixed(1)}`);
});

test('дружба: пари, сум за проданим другом, адаптація новачка', () => {
  const c = club('Shakhtar Donetsk');
  const state = { clubId: c.id, season: FM.season.create(W, 'fr') };
  const pairs = FM.dressing.friends(W, c.id);
  assert.ok(pairs.length >= 3);
  const [a, b] = pairs[0];
  assert.strictEqual(FM.dressing.friendOf(W, c.id, a.id), b);
  b.morale = 60;
  const t = FM.dressing.onSale(W, state, a);
  assert.ok(b.morale <= 50 && /сумує/.test(t), t);
  const newbie = W.squad(club('Dynamo Kyiv').id).find((p) => p.nat === 'UKR');
  W.move(newbie.id, c.id); newbie.morale = 50;
  assert.ok(/освоюється/.test(FM.dressing.onArrive(W, state, newbie)) && newbie.morale > 50);
});

test('суперник-тренер: обирається дербі-суперник, дуель дає ефект, цитата після матчу', () => {
  const c = club('Dynamo Kyiv');
  const state = { clubId: c.id, season: FM.season.create(W, 'fd') };
  FM.club.managers(W, state);
  const f = FM.rivals.feud(W, state);
  assert.ok(f && f.club === club('Shakhtar Donetsk').id && f.name, JSON.stringify(f));
  const r = FM.rivals.duel(W, state, 'jab', FM.rng(1));
  assert.ok(r.boost !== 1 && f.heat === 2);
  assert.ok(/Шахтар|Shakhtar/.test(FM.rivals.feudAfter(W, state, 2)) && f.w === 1);
});
