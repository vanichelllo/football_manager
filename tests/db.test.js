'use strict';
// Перевірка зібраної бази data/db.js: повнота складів і правдоподібність рівнів.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'data', 'db.js');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
const W = FM.createWorld(db);
const byName = (en) => db.clubs.find((c) => c.nameEn === en);

test('шістнадцять ліг і правильна кількість клубів; другі дивізіони прив’язані до вищих', () => {
  const sizes = Object.fromEntries(db.leagues.map((l) => [l.id, db.clubs.filter((c) => c.league === l.id).length]));
  assert.deepStrictEqual(sizes, { eng: 20, esp: 20, ita: 20, ger: 18, fra: 18, ukr: 16, eng2: 24, esp2: 22, ita2: 20, ger2: 18, fra2: 18, ukr2: 14, por: 18, ned: 18, tur: 18, pol: 18 });
  for (const l of db.leagues) assert.strictEqual(l.size, sizes[l.id]);
  for (const l of db.leagues.filter((x) => x.tier === 2)) assert.ok(db.leagues.some((x) => x.id === l.up && x.tier === 1), l.id);
});

test('у кожного клубу повний склад: 18+ гравців, 2+ воротарі, усі лінії', () => {
  for (const c of db.clubs) {
    const sq = W.squad(c.id);
    assert.ok(sq.length >= 18, `${c.nameEn}: ${sq.length} гравців`);
    const lines = new Set(sq.map((p) => FM.ROLE_LINE[p.roles[0]]));
    assert.strictEqual(lines.size, 4, `${c.nameEn}: лінії ${[...lines]}`);
    assert.ok(sq.filter((p) => p.roles[0] === 'GK').length >= 2, `${c.nameEn}: воротарі`);
  }
});

test('атрибути в межах 1–20, CA ≤ PA ≤ 200', () => {
  for (const p of db.players) {
    for (const v of Object.values(p.attrs)) assert.ok(v >= 1 && v <= 20, p.nameEn);
    assert.ok(p.ca <= p.pa && p.pa <= 200, p.nameEn);
  }
});

test('гранди сильніші за середняків своєї ліги, а лідери УПЛ — слабші за грандів', () => {
  const lvl = (en) => W.clubLevel(byName(en).id);
  const leagueAvg = (id) => {
    const cs = db.clubs.filter((c) => c.league === id);
    return cs.reduce((s, c) => s + W.clubLevel(c.id), 0) / cs.length;
  };
  for (const [club, league] of [['Real Madrid', 'esp'], ['Bayern Munich', 'ger'], ['Paris Saint-Germain', 'fra'], ['Arsenal', 'eng'], ['Inter Milan', 'ita']]) {
    assert.ok(lvl(club) > leagueAvg(league) + 8, `${club}: ${lvl(club).toFixed(1)} проти ${leagueAvg(league).toFixed(1)}`);
  }
  assert.ok(lvl('Shakhtar Donetsk') < lvl('Real Madrid') - 20);
  assert.ok(leagueAvg('ukr') < leagueAvg('fra'));
});

test('дата народження: у вищих лігах — у 90%+ гравців, загалом — у 80%+ (решта без статті в Wikipedia, переважно нижчі ліги й молодь)', () => {
  const withBirth = db.players.filter((p) => p.born).length;
  assert.ok(withBirth / db.players.length > 0.8, `${withBirth} з ${db.players.length}`);
  const top = new Set(db.clubs.filter((c) => ['eng', 'esp', 'ita', 'ger', 'fra'].includes(c.league)).map((c) => c.id));
  const tp = db.players.filter((p) => top.has(p.club));
  assert.ok(tp.filter((p) => p.born).length / tp.length > 0.9);
});
