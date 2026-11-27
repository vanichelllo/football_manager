'use strict';
// Звіт про матч: заголовок, перебіг рахунку, статистика, найкращий гравець, слова тренера.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const db = ctx.window.FM_DB;
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'report']) require(`../js/${m}.js`);
const W = FM.createWorld(db);
const team = (c) => ({ club: c, players: W.squad(c.id) });
const club = (en) => db.clubs.find((c) => c.nameEn === en);

test('стаття відповідає рахунку й статистиці матчу', () => {
  for (let i = 0; i < 8; i++) {
    const h = club('Napoli'), a = club('Lazio');
    const m = FM.match.play({ home: team(h), away: team(a), seed: 'rep' + i, weather: 'rain' });
    const r = FM.report.article(m, { home: h.name, away: a.name, stadium: 'Арена', att: 41234, comp: 'Серія A', myK: 0, manager: 'Тренер' });
    assert.ok(r.head && r.head.length > 5);
    assert.ok(r.head.includes(`${m.score[0]}:${m.score[1]}`) || r.head.includes(`${m.score[1]}:${m.score[0]}`) || /забиває|Нульова|Без голів|не забивають|пенальті/.test(r.head), r.head);
    assert.ok(r.lead.includes('41 234 глядачі') || r.lead.includes('41 234 глядач'), r.lead);
    assert.ok(r.lead.includes('дощ'));
    assert.ok(r.paras.some((p) => p.includes(`${m.stats[0].shots}:${m.stats[1].shots}`)));
    assert.ok(r.paras.some((p) => p.startsWith('Тренер: «')));
    if (m.motm) assert.ok(r.paras.some((p) => p.includes('Найкращий гравець матчу')));
    const goalsFact = r.facts.find((f) => f[0] === 'Голи')[1];
    if (m.score[0] + m.score[1] === 0) assert.strictEqual(goalsFact, '—');
  }
});

test('числівники й порожні дані', () => {
  const m = FM.match.play({ home: team(club('Arsenal')), away: team(club('Chelsea')), seed: 'z' });
  const one = FM.report.article(m, { home: 'А', away: 'Б', att: 21 });
  assert.ok(one.lead.includes('21 глядач.'), one.lead);
  const few = FM.report.article(m, { home: 'А', away: 'Б', att: 1003 });
  assert.ok(few.lead.includes('1 003 глядачі.'), few.lead);
  const none = FM.report.article(m, { home: 'А', away: 'Б', myK: null });
  assert.ok(!none.lead.includes('глядач'));
  assert.ok(!none.paras.some((p) => p.includes('«')));
});
