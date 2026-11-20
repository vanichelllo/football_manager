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
const W = FM.createWorld(db);

test('календар: кожен з кожним двічі (раз удома, раз у гостях), по одному матчу за тур', () => {
  const S = FM.season.create(W, 'cal');
  for (const l of db.leagues) {
    const fx = S.fixtures.filter((f) => f.l === l.id);
    const n = l.size;
    assert.strictEqual(fx.length, n * (n - 1), l.id);
    assert.strictEqual(new Set(fx.map((f) => f.r)).size, 2 * (n - 1), `${l.id}: турів`);
    assert.ok(Math.max(...fx.map((f) => f.w)) < FM.season.weeks(S), `${l.id}: вміщається в сезон`);
    assert.ok(Math.min(...fx.map((f) => f.w)) >= 2, `${l.id}: спершу передсезоння`);
    assert.ok(!fx.some((f) => S.cal.intl.includes(f.w)), `${l.id}: у вікна збірних ліга не грає`);
    // за тиждень клуб грає не більше двох турів, і другий — посеред тижня
    const per = {};
    for (const f of fx) for (const c of [f.h, f.a]) { const k = c + '|' + f.w; per[k] = (per[k] || []).concat([f.mid ? 1 : 0]); }
    for (const [k, v] of Object.entries(per)) assert.ok(v.length === 1 || (v.length === 2 && v.includes(1) && v.includes(0)), `${l.id} ${k}: ${v}`);
    const pairs = new Set(fx.map((f) => f.h + '>' + f.a));
    assert.strictEqual(pairs.size, fx.length, `${l.id}: повторів немає`);
    for (let r = 0; r < 2 * (n - 1); r++) {
      const clubs = fx.filter((f) => f.r === r).flatMap((f) => [f.h, f.a]);
      assert.strictEqual(new Set(clubs).size, n, `${l.id}, тур ${r + 1}`);
    }
    // домашніх матчів поспіль не більше трьох
    for (const c of db.clubs.filter((x) => x.league === l.id)) {
      const seq = fx.filter((f) => f.h === c.id || f.a === c.id).sort((a, b) => a.r - b.r).map((f) => (f.h === c.id ? 'H' : 'A')).join('');
      assert.ok(!/HHHH|AAAA/.test(seq), `${c.nameEn}: ${seq}`);
    }
  }
  const n = FM.season.weeks(S);
  assert.ok(n >= 44 && n <= 50, `тижнів у сезоні: ${n}`);
  // реалізм: старт сезону — початок липня; УПЛ на зимовій перерві в січні; АПЛ грає на Різдво; фінал ЛЧ — травень
  assert.strictEqual(S.start.slice(5, 7), '07');
  const month = (w) => FM.season.dateOf(w, S).slice(5, 7);
  assert.ok(!S.fixtures.some((f) => f.l === 'ukr' && month(f.w) === '01'), 'УПЛ у січні не грає');
  assert.ok(S.fixtures.some((f) => f.l === 'eng' && FM.season.dateOf(f.w, S).slice(5) >= '12-24' && FM.season.dateOf(f.w, S).slice(5) <= '12-31'), 'АПЛ грає на свята');
  assert.ok(S.fixtures.some((f) => f.l === 'eng2' && f.mid), 'Чемпіоншип грає посеред тижня');
  assert.strictEqual(month(S.cal.euroKO[4][0]), '05');
});

test('цілий сезон: таблиця, очки, бомбардири узгоджені; дискваліфікації минають', () => {
  const S = FM.season.create(W, 'full');
  while (!FM.season.isOver(S)) FM.season.playWeek(S, W);
  assert.ok(S.fixtures.every((f) => f.s));
  const champRanks = [];
  for (const l of db.leagues) {
    const t = FM.season.table(S, W, l.id);
    const fx = S.fixtures.filter((f) => f.l === l.id);
    const draws = fx.filter((f) => f.s[0] === f.s[1]).length;
    assert.strictEqual(t.reduce((s, r) => s + r.pts, 0), 3 * (fx.length - draws) + 2 * draws, l.id);
    assert.ok(t.every((r) => r.p === 2 * (l.size - 1)));
    const goals = fx.reduce((s, f) => s + f.s[0] + f.s[1], 0);
    const scored = Object.entries(S.ps).filter(([id]) => W.club(W.player(id).club).league === l.id).reduce((s, [, st]) => s + st[1], 0);
    assert.strictEqual(scored, goals, `${l.id}: голи гравців = голи в матчах`);
    // чемпіон — серед найсильніших за складом (топ-5 ліг — суворо, решта — у середньому, нижче)
    const order = W.clubsOf(l.id).map((c) => [c.id, W.clubLevel(c.id)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const rank = order.indexOf(t[0].id) + 1;
    if (['eng', 'esp', 'ita', 'ger', 'fra'].includes(l.id)) assert.ok(rank <= 6, `${l.id}: чемпіон ${W.club(t[0].id).nameEn} (${rank}-й за силою)`);
    else champRanks.push(rank);
  }
  if (champRanks.length) {
    const avg = champRanks.reduce((a, b) => a + b, 0) / champRanks.length;
    assert.ok(avg <= 6, `середнє місце чемпіона за силою: ${avg.toFixed(1)} (${champRanks.join(', ')})`);
  }
  // після сезону лишаються лише дискваліфікації, отримані в останньому турі ліги (їх нема де відбути)
  for (const [id, [, week]] of Object.entries(S.bans)) {
    const l = W.league(W.club(W.player(id).club).league);
    const lastWeek = Math.max(...S.fixtures.filter((f) => f.l === l.id).map((f) => f.w));
    assert.strictEqual(week, lastWeek, `${W.player(id).nameEn}: дискваліфікація з ${week + 1}-го тижня не відбута`);
  }
});

test('дискваліфікований гравець не потрапляє в склад', () => {
  const S = FM.season.create(W, 'ban');
  S.week = Math.min(...S.fixtures.map((x) => x.w));
  const f = FM.season.fixturesOfWeek(S, S.week)[0];
  const star = W.squad(f.h).sort((a, b) => b.ca - a.ca)[0];
  S.bans[star.id] = [1, -1];
  const side = FM.season.sideFor(S, W, f.h);
  assert.ok(!side.lineup.xi.some((x) => x.player.id === star.id));
  FM.season.playWeek(S, W);
  assert.ok(!S.bans[star.id], 'відбув дискваліфікацію');
});
