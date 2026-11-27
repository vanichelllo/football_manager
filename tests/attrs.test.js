'use strict';
// Повний набір атрибутів (похідні з основних), характер, радар, ігрова форма.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const FM = require('../js/world.js');
for (const m of ['rng', 'attrs', 'match', 'season', 'data/names', 'develop', 'morale']) require(`../js/${m}.js`);
const W = FM.createWorld(ctx.window.FM_DB);
const by = (en) => [...W.clubs.values()].find((c) => c.nameEn === en);

test('усі атрибути 1–20, основні — як у базі, похідні — стабільні й залежать від основних', () => {
  for (const p of W.squad(by('Dynamo Kyiv').id)) {
    for (const [, ks] of FM.attrs.groups(p)) for (const k of ks) { const v = FM.attrs.attr(p, k); assert.ok(v >= 1 && v <= 20, `${k}=${v}`); }
    if (p.attrs.pas != null) assert.strictEqual(FM.attrs.attr(p, 'pas'), p.attrs.pas);
  }
  const p = W.squad(by('Dynamo Kyiv').id).find((x) => x.roles[0] !== 'GK');
  const v0 = FM.attrs.attr(p, 'vis');
  assert.strictEqual(FM.attrs.attr(p, 'vis'), v0, 'детерміновано');
  p.attrs.pas = Math.min(20, p.attrs.pas + 6); p.attrs.dec = Math.min(20, p.attrs.dec + 6);
  assert.ok(FM.attrs.attr(p, 'vis') > v0, 'бачення росте разом з пасом і рішеннями');
});

test('радар, характер, нога, опис у медіа', () => {
  const sq = W.squad(by('Arsenal').id);
  const out = sq.find((p) => p.roles[0] !== 'GK'), gk = sq.find((p) => p.roles[0] === 'GK');
  assert.strictEqual(FM.attrs.radar(out).length, 8);
  assert.strictEqual(FM.attrs.radar(gk)[0][0], 'Рефлекси');
  for (const p of sq) { assert.ok(FM.attrs.personality(p).length > 3); assert.ok(['left', 'right', 'both'].includes(FM.attrs.foot(p))); assert.ok(FM.attrs.media(p).length > 5); }
  const lefts = sq.filter((p) => p.side === 'L');
  if (lefts.length >= 3) assert.ok(lefts.filter((p) => FM.attrs.foot(p) === 'left').length >= 1, 'на лівому фланзі є лівші');
});

test('ігрова форма: росте від матчів, падає без них і впливає на гру', () => {
  const p = W.squad(by('Dynamo Kyiv').id)[3];
  p.sharp = 60;
  FM.attrs.playSharp(p, 90);
  assert.ok(p.sharp > 70);
  for (let i = 0; i < 8; i++) FM.attrs.weekSharp(p, false);
  assert.ok(p.sharp <= 50);
  assert.ok(FM.attrs.sharpK(p) < FM.attrs.sharpK({ sharp: 100 }));
  // сезонний тиждень: хто грав — у ритмі, хто ні — втрачає
  const S = FM.season.create(W, 'sharp');
  const club = by('Dynamo Kyiv').id;
  const f = S.fixtures.filter((x) => x.h === club || x.a === club).sort((a, b) => a.w - b.w)[0];
  S.week = f.w;
  FM.season.playWeek(S, W);
  const played = W.squad(club).filter((x) => x.lastPlayed === f.w), idle = W.squad(club).filter((x) => x.lastPlayed !== f.w && !x.injury);
  assert.ok(played.length >= 11 && idle.length > 0);
  assert.ok(Math.min(...played.map(FM.attrs.sharp)) > Math.max(...idle.map(FM.attrs.sharp)) - 1);
});
