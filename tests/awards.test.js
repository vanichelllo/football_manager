'use strict';
// Нагороди, рекорди, Зала слави.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'season', 'develop', 'awards']) require(`../js/${m}.js`);

test('команда туру щотижня, гравець і тренер місяця, нагороди сезону й Зала слави', () => {
  const W = FM.createWorld(db);
  const club = [...W.clubs.values()].find((c) => c.nameEn === 'Dynamo Kyiv');
  const state = { clubId: club.id, season: FM.season.create(W, 'aw') };
  const S = state.season;
  const news = [];
  let weeks = 0;
  while (!FM.season.isOver(S)) { FM.season.playWeek(S, W); news.push(...FM.awards.week(W, state)); weeks++; }
  const a = state.aw;
  assert.ok(a.totw && a.totw.ids.length === 11, 'команда туру з 11 гравців');
  assert.ok(news.some((t) => /Команда туру/.test(t)));
  assert.ok(news.some((t) => /Гравець місяця/.test(t)) && news.some((t) => /тренер місяця|Тренер місяця/i.test(t)), news.filter((t) => /місяц/.test(t)).join(' | '));
  assert.ok(a.list.some((x) => x.t === 'potm'));
  // рекорди: велика перемога, серія
  const opp = [...W.clubs.values()].find((c) => c.nameEn === 'Obolon Kyiv').id;
  assert.ok(FM.awards.match(W, state, 1, 0, opp, 'league').length === 0, 'перший рекорд без новини');
  const n = FM.awards.match(W, state, 5, 0, opp, 'league');
  assert.ok(n.some((t) => /найбільша перемога — 5:0/.test(t)));
  for (let i = 0; i < 3; i++) FM.awards.match(W, state, 2, 1, opp, 'league');
  assert.ok(FM.awards.match(W, state, 2, 1, opp, 'league').some((t) => /6 перемог поспіль/.test(t)));
  // сезон: найкращий гравець потрапляє до Зали слави
  const r = FM.awards.season(W, state, club.id, 1);
  assert.ok(r.rec.mvp && r.rec.xi.length >= 9);
  const star = W.squad(club.id)[0];
  state.aw.career[star.id] = { apps: 149, goals: 10, ast: 0, seasons: 4, trophies: 0, club: club.id };
  S.ps[star.id] = [5, 0, 0, 60, 0, 0];
  const r2 = FM.awards.season(W, state, club.id, 0);
  assert.ok(r2.news.some((t) => t.includes(star.name) && /Зали слави/.test(t)), r2.news.join(' | '));
  assert.ok(FM.awards.allTime(W, state).some((x) => x.id === star.id && x.apps >= 154));
});
