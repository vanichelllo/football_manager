'use strict';
// Група 3: прохання до правління, співбесіда, фарм-клуби, виклики до збірних.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'morale', 'cups', 'club', 'nations', 'career', 'finance', 'boardroom']) require(`../js/${m}.js`);
function fresh(en) {
  const W = FM.createWorld(db);
  const state = { clubId: [...W.clubs.values()].find((c) => c.nameEn === en).id, season: FM.season.create(W, 'br') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state);
  return { W, state };
}

test('прохання: фонд зарплат при довірі, повтор — ні; знизити очікування — лише на старті', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  state.board.conf = 70;
  const wb = W.club(state.clubId).wageBudget;
  const r = FM.boardroom.request(W, state, 'wages');
  assert.ok(r.ok, r.text);
  assert.ok(W.club(state.clubId).wageBudget > wb);
  assert.strictEqual(FM.boardroom.request(W, state, 'wages').ok, false, 'повторно — ні');
  const t0 = state.board.target.kind;
  const p = FM.boardroom.request(W, state, 'patience');
  assert.ok(p.ok && state.board.target.kind !== t0, p.text);
  state.board.conf = 30;
  const { W: W2, state: s2 } = fresh('Obolon Kyiv');
  s2.board.conf = 30;
  assert.strictEqual(FM.boardroom.request(W2, s2, 'wages').ok, false);
  s2.season.week = 30;
  assert.strictEqual(FM.boardroom.request(W2, s2, 'patience').ok, false, 'посеред сезону — ні');
});

test('співбесіда: амбітна ціль — вища, обіцянки перевіряються', () => {
  const { W, state } = fresh('Obolon Kyiv');
  const t0 = state.board.target;
  FM.boardroom.applyInterview(W, state, { goal: 'ambitious', youth: 'youth', style: 'attacking' });
  assert.ok(state.board.target.pos < t0.pos, `${t0.pos} → ${state.board.target.pos}`);
  assert.ok(state.board.promises.youth && state.board.promises.attack);
  // 8 матчів без молоді й голів — правління нагадує
  const S = state.season;
  const mine = FM.season.clubFixtures(S, state.clubId).slice(0, 8);
  for (const f of mine) f.s = [0, 0];
  for (const p of W.squad(state.clubId)) if ((W.age(p) ?? 30) > 21) S.ps[p.id] = [8, 0, 0, 0, 0, 0];
  S.week = 32;
  const c0 = state.board.conf;
  const news = FM.boardroom.promisesWeek(W, state);
  assert.strictEqual(news.length, 2);
  assert.ok(state.board.conf < c0);
});

test('фарм-клуб: кандидати слабші, оренда молоді з гарантованою практикою; виклики до збірних', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  state.board.conf = 60;
  const r = FM.boardroom.request(W, state, 'affiliate');
  assert.ok(r.ok && r.cands.length >= 2);
  assert.ok(r.cands.every((c) => W.clubLevel(c.id) < W.clubLevel(state.clubId)));
  const aff = r.cands[0].id;
  assert.ok(FM.boardroom.request(W, state, 'affiliate', aff).ok);
  assert.ok(state.knownLeagues[W.club(aff).league]);
  const kid = W.squad(state.clubId).find((p) => (W.age(p) ?? 30) <= 21);
  state.season.week = 0; // вікно відкрите
  const s = FM.boardroom.sendToAffiliate(W, state, kid.id, aff);
  assert.ok(s.ok, s.text);
  assert.ok(kid.club === aff && kid.loan.aff);
  // виклики: збірна України кличе гравців Динамо
  const cu = FM.boardroom.callups(W, state, 9);
  assert.ok(cu.length >= 3, `викликано ${cu.length}`);
  assert.ok(cu.every((x) => x.p.fitness < 100));
});
