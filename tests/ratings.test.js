'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../tools/lib/ratings');

const base = { key: 'X', age: 26, caps: 0, nat: 'ESP', leagueApps: 200, leagueGoals: 10, pos: 'CM', posGroup: 'MF', height: 180 };
const avg = (fn, n = 40) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += fn('k' + i);
  return s / n;
};

test('сильніший клуб і сильніша ліга дають вищий рівень', () => {
  const top = avg((k) => R.abilities({ ...base, key: k }, { league: 'eng', strength: 1 }).ca);
  const bottom = avg((k) => R.abilities({ ...base, key: k }, { league: 'eng', strength: 0 }).ca);
  const ukr = avg((k) => R.abilities({ ...base, key: k }, { league: 'ukr', strength: 1 }).ca);
  assert.ok(top > bottom + 25, `${top} > ${bottom}`);
  assert.ok(bottom > ukr - 10, 'аутсайдер АПЛ не набагато слабший за лідера УПЛ');
});

test('матчі за сильну збірну підвищують рівень', () => {
  const none = avg((k) => R.abilities({ ...base, key: k, caps: 0 }, { league: 'esp', strength: 0.5 }).ca);
  const many = avg((k) => R.abilities({ ...base, key: k, caps: 80 }, { league: 'esp', strength: 0.5 }).ca);
  assert.ok(many > none + 15);
});

test('молодий гравець має запас потенціалу, ветеран — ні', () => {
  const young = R.abilities({ ...base, age: 18 }, { league: 'ger', strength: 0.8 });
  const old = R.abilities({ ...base, age: 33 }, { league: 'ger', strength: 0.8 });
  assert.ok(young.pa > young.ca + 15);
  assert.strictEqual(old.pa, old.ca);
});

test('атрибути в межах 1–20 і відповідають позиції', () => {
  const st = R.attributes({ ...base, pos: 'ST' }, 150);
  const cb = R.attributes({ ...base, pos: 'CB' }, 150);
  for (const v of [...Object.values(st), ...Object.values(cb)]) assert.ok(v >= 1 && v <= 20);
  assert.ok(st.fin > cb.fin + 4, 'нападник б’є краще');
  assert.ok(cb.tac > st.tac + 4, 'захисник краще відбирає');
  const gk = R.attributes({ ...base, pos: 'GK', posGroup: 'GK' }, 150);
  assert.ok('ref' in gk && !('fin' in gk));
});

test('ціна зростає з рівнем', () => {
  assert.ok(R.marketValue(170, 25, 'eng') > R.marketValue(130, 25, 'eng') * 5);
  assert.ok(R.marketValue(150, 25, 'eng') > R.marketValue(150, 25, 'ukr'));
});
