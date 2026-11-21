'use strict';
// Історії клубу як наслідки й прес-конференції за ситуацією.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'club', 'finance', 'rivals', 'morale', 'medical', 'events', 'stories', 'press']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en) {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, season: FM.season.create(W, 'story') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state);
  return { W, state };
}
const first = (S, id) => S.fixtures.filter((f) => f.h === id || f.a === id).sort((a, b) => a.w - b.w);

test('посуха нападника — лист із вибором; відповідь змінює настрій', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const st = W.squad(state.clubId).filter((p) => p.roles[0] === 'ST').sort((a, b) => b.ca - a.ca)[0];
  st.fg = [0, 0, 0, 0, 0];
  state.season.week = 10;
  const news = FM.stories.week(W, state);
  assert.ok(state.evPending && state.evPending.id === 'st_drought', JSON.stringify(news));
  const m0 = st.morale ?? 60;
  const txt = FM.events.answer(W, state, 0);
  assert.ok(txt && txt.length > 5);
  assert.ok(st.morale > m0 - 3, 'публічна підтримка піднімає настрій');
  // удруге одразу — не повторюється
  state.season.week = 11;
  FM.stories.week(W, state);
  assert.ok(!state.evPending || state.evPending.id !== 'st_drought');
});

test('серія голів і хвиля перемог — новини; криза — лист', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const S = state.season;
  const p = W.squad(state.clubId).sort((a, b) => b.ca - a.ca)[0];
  p.fg = [1, 2, 1];
  const mine = first(S, state.clubId).slice(0, 4);
  for (const f of mine) f.s = f.h === state.clubId ? [2, 0] : [0, 2];
  S.week = mine[3].w + 1;
  const news = FM.stories.week(W, state).map((x) => x.text).join(' | ');
  assert.ok(/поспіль/.test(news), news);
  const { W: W2, state: s2 } = fresh('Dynamo Kyiv');
  const m2 = first(s2.season, s2.clubId).slice(0, 3);
  for (const f of m2) f.s = f.h === s2.clubId ? [0, 1] : [1, 0];
  s2.season.week = m2[2].w + 1;
  for (const q of W2.squad(s2.clubId)) q.attrs.lea = 5; // без лідера — рішення за тренером
  FM.stories.week(W2, s2);
  assert.ok(s2.evPending && s2.evPending.id === 'st_crisis');
});

test('обіцянка ігрового часу: виконана — задоволений, порушена — просить продажу', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const [a, b] = W.squad(state.clubId).slice(0, 2);
  state.season.week = 20;
  a.minPromise = { y: state.season.year, w: 20, apps: 2 }; state.season.ps[a.id] = [3, 0, 0, 0, 0, 0];
  b.minPromise = { y: state.season.year, w: 20, apps: 5 }; state.season.ps[b.id] = [1, 0, 0, 0, 0, 0];
  FM.stories.week(W, state);
  assert.ok(!a.wantsOut && !a.minPromise);
  assert.ok(b.wantsOut, 'порушена обіцянка');
});

test('прес-конференція: питання за ситуацією, відповіді мають наслідки', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const opp = byName(W, 'Shakhtar Donetsk').id;
  const st = W.squad(state.clubId).filter((p) => p.roles[0] === 'ST').sort((a, b) => b.ca - a.ca)[0];
  st.fg = [0, 0, 0];
  state.season.week = 8;
  const items = FM.press.build(W, state, { opp, club: (c) => c.name }, 'pre');
  assert.ok(items.length >= 2 && items.length <= 3);
  assert.ok(items.every((q) => q.q && q.a.length >= 2));
  const derby = items.find((q) => q.id === 'derby');
  const dry = items.find((q) => q.id === 'dry');
  assert.ok(derby || dry, items.map((q) => q.id).join(','));
  if (dry) { const m0 = st.morale ?? 60; FM.press.answer(W, state, dry, 0); assert.ok(st.morale > m0); }
  // після відповіді питання не повторюється наступного тижня
  state.season.week = 9;
  const again = FM.press.build(W, state, { opp, club: (c) => c.name }, 'pre').map((q) => q.id);
  for (const id of state.pressRecent) assert.ok(!again.includes(id));
});
