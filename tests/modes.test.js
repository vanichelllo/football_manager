'use strict';
// Режими: місії тижня, гра на двох (обмін тренерів, фінанси не рахуються двічі), «Невідомий тренер».
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'data/names', 'data/countries', 'develop', 'market', 'board', 'club', 'finance', 'budget', 'rivals', 'career', 'challenges', 'missions', 'duo', 'morale']) require(`../js/${m}.js`);
const byName = (W, en) => [...W.clubs.values()].find((c) => c.nameEn === en);
function fresh(en) {
  const W = FM.createWorld(db);
  const state = { clubId: byName(W, en).id, manager: 'А', season: FM.season.create(W, 'modes') };
  FM.market.init(W, state); FM.board.initSeason(W, state); FM.club.init(W, state); FM.career.init(W, state);
  return { W, state };
}
const firstMatchWeek = (S, id) => S.fixtures.filter((f) => f.h === id || f.a === id).sort((a, b) => a.w - b.w)[0].w;

test('місії: створюються на тиждень з матчем, виконання дає нагороду', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const S = state.season;
  S.week = firstMatchWeek(S, state.clubId);
  const M = FM.missions.current(W, state);
  assert.ok(M.list.length >= 1 && M.list.length <= 2, 'одна-дві місії');
  assert.strictEqual(FM.missions.current(W, state), M, 'та сама на тиждень');
  // наш матч: розгромна перемога всуху
  const f = S.fixtures.find((x) => x.w === S.week && (x.h === state.clubId || x.a === state.clubId));
  const home = f.h === state.clubId;
  f.s = home ? [4, 0] : [0, 4];
  const mine = W.squad(state.clubId).sort((a, b) => (W.age(a) ?? 30) - (W.age(b) ?? 30))[0]; // наймолодший — автор усіх голів
  f.sc = [0, 1, 2, 3].map(() => [home ? 0 : 1, mine.id]);
  M.list = ['win', 'clean', 'three'].map((k) => ({ k, text: FM.missions.KINDS[k].text, reward: FM.missions.KINDS[k].reward, state: 'open' }));
  const conf0 = state.board.conf, bal0 = W.club(state.clubId).balance;
  S.week++;
  const news = FM.missions.check(W, state);
  assert.strictEqual(news.length, 3, news.join(' | '));
  assert.ok(M.list.every((m) => m.state === 'done'));
  assert.ok(state.board.conf > conf0 && W.club(state.clubId).balance > bal0);
  assert.strictEqual(state.missionsDone, 3);
  assert.deepStrictEqual(FM.missions.check(W, state), [], 'вдруге не рахується');
});

test('гра на двох: обмін тренерів міняє лише особисте, спільне лишається', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  state.tactics = { formation: '4-4-2', ids: [] };
  state.duo = { turn: 0, other: {} };
  FM.duo.swap(state);
  assert.strictEqual(state.clubId, undefined, 'після обміну — лише спільне');
  assert.ok(state.season, 'сезон спільний');
  Object.assign(state, { manager: 'Б', clubId: byName(W, 'Shakhtar Donetsk').id });
  FM.board.initSeason(W, state);
  FM.duo.swap(state);
  assert.strictEqual(state.manager, 'А');
  assert.strictEqual(state.tactics.formation, '4-4-2');
  assert.ok(FM.duo.on(state));
  assert.strictEqual(FM.duo.otherClub(state), byName(W, 'Shakhtar Donetsk').id);
  assert.ok(FM.duo.human(state, state.clubId) && FM.duo.human(state, FM.duo.otherClub(state)));
  const b = FM.duo.as(state, () => state.manager);
  assert.strictEqual(b, 'Б');
  assert.strictEqual(state.manager, 'А', 'as() повертає як було');
});

test('гра на двох: тижневі фінанси клубу другого тренера — рівно один раз', () => {
  const run = (duo) => {
    const { W, state } = fresh('Dynamo Kyiv');
    const other = byName(W, 'Shakhtar Donetsk').id;
    if (duo) {
      state.duo = { turn: 0, other: {} };
      FM.duo.swap(state); Object.assign(state, { manager: 'Б', clubId: other }); FM.board.initSeason(W, state); FM.club.init(W, state); FM.duo.swap(state);
    }
    const S = state.season;
    S.week = firstMatchWeek(S, state.clubId);
    FM.season.playWeek(S, W);
    FM.board.weekly(W, state);
    if (duo) FM.duo.as(state, () => { FM.duo.second = true; try { FM.board.weekly(W, state); } finally { FM.duo.second = false; } });
    return { W, state, other };
  };
  const solo = run(false), two = run(true);
  const bSolo = solo.W.club(solo.other).balance, bTwo = two.W.club(two.other).balance;
  // різниця — лише зарплати персоналу людини (у соло-грі клуб рахується як клуб ШІ)
  assert.ok(Math.abs(bSolo - bTwo) < 0.5, `${bSolo} проти ${bTwo}`);
  assert.ok(two.state.duo.other.board.fin.tv > 0, 'дохід записано у фінанси другого тренера');
  assert.strictEqual(two.W.club(two.state.clubId).balance, solo.W.club(solo.state.clubId).balance, 'перший клуб — так само, як у соло');
});

test('гра на двох: склад і тактика кожного тренера на матчі', () => {
  const { W, state } = fresh('Dynamo Kyiv');
  const S = state.season;
  const other = byName(W, 'Shakhtar Donetsk').id;
  const mk = (id, mentality) => ({ clubId: id, tactics: { formation: '4-4-2', ids: [], mentality, pressing: 'normal', passing: 'mixed' } });
  const users = [mk(state.clubId, 'attacking'), mk(other, 'defensive')];
  const a = FM.season.sideFor(S, W, state.clubId, users, other, true);
  const b = FM.season.sideFor(S, W, other, users, state.clubId, false);
  assert.strictEqual(a.mentality, 'attacking');
  assert.strictEqual(b.mentality, 'defensive');
  assert.strictEqual(a.formation, '4-4-2');
});

test('«Невідомий тренер»: найслабші клуби, ліцензія C, низька репутація, ціль — топ-5 ліга', () => {
  const W = FM.createWorld(db);
  const d = FM.challenges.DEFS.zero;
  const clubs = d.clubs(W);
  assert.ok(clubs.length >= 4);
  const weakest = Math.min(...[...W.clubs.values()].map((c) => W.clubLevel(c.id)));
  assert.strictEqual(W.clubLevel(clubs[0].id), weakest);
  const state = { clubId: clubs[0].id, season: FM.season.create(W, 'zero') };
  FM.board.initSeason(W, state); FM.career.init(W, state);
  FM.challenges.start(state, 'zero', W);
  assert.strictEqual(state.coach.licence, 'C');
  assert.ok(state.board.rep <= 10);
  assert.strictEqual(d.check(W, state, { champion: true, league: 'eng' }), 'done');
  assert.strictEqual(d.check(W, state, { champion: true, league: 'ukr' }), null);
});
