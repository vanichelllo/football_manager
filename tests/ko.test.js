'use strict';
// Кубкові пари: нічия у вирішальному матчі — додатковий час, далі серія пенальті; переможця визначає серія.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.js'), 'utf8'), ctx);
const FM = require('../js/world.js');
for (const m of ['rng', 'match', 'sim', 'data/names', 'morale']) require(`../js/${m}.js`);
const W = FM.createWorld(ctx.window.FM_DB);
const by = (en) => [...W.clubs.values()].find((c) => c.nameEn === en);
const side = (c) => { const players = W.squad(c.id); const formation = FM.bestFormation(players); return { club: c, players, formation, lineup: FM.pickLineup(players, formation) }; };

for (const engine of ['classic', 'sim']) {
  test(`${engine}: нічия → додатковий час → пенальті; без ko — звичайні 90 хвилин`, () => {
    let et = 0, so = 0, seen = 0;
    for (let i = 0; i < 40 && so < 2; i++) {
      const r = FM.match.play({ home: side(by('Coventry City')), away: side(by('Hull City')), seed: `ko-${engine}-${i}`, name: (p) => p.name, engine, ko: { base: [0, 0] } });
      seen++;
      if (r.et) {
        et++;
        assert.ok(r.events.some((e) => /додатковий час/i.test(e.text)));
        if (r.shootout) {
          so++;
          assert.strictEqual(r.score[0], r.score[1], 'пенальті — лише за нічиєї');
          const [a, b] = r.shootout.score;
          assert.notStrictEqual(a, b);
          assert.strictEqual(r.shootout.winner, a > b ? 0 : 1);
          assert.ok(r.events.filter((e) => e.type === 'pengoal' || e.type === 'penmiss').length >= 6);
        } else assert.notStrictEqual(r.score[0], r.score[1]);
      } else assert.notStrictEqual(r.score[0], r.score[1], 'без додаткового часу — є переможець');
    }
    assert.ok(et >= 1 && so >= 1, `додатковий час ${et}, пенальті ${so} з ${seen}`);
    // перший матч пари (ko не передано) — нічия можлива, без додаткового часу
    const r = FM.match.play({ home: side(by('Coventry City')), away: side(by('Hull City')), seed: 'ko-none', name: (p) => p.name, engine });
    assert.ok(!r.et && !r.shootout);
  });
}

test('другий матч пари: рахується сума двох матчів', () => {
  // господарі програли перший матч 0:1 — у другому 1:0 означає нічию за сумою й додатковий час
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const r = FM.match.play({ home: side(by('Coventry City')), away: side(by('Hull City')), seed: `agg-${i}`, name: (p) => p.name, ko: { base: [0, 1], two: true } });
    if (r.et) { found = true; assert.ok(r.events.some((e) => /За сумою двох матчів/.test(e.text))); }
  }
  assert.ok(found);
});
