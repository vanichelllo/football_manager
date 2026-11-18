'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../tools/lib/parse');

test('таблиця ліги: команди й підсумкові місця з результатів', () => {
  const text = `{{#invoke:Sports table|main|style=WDL
|team_order=AAA, BBB, CCC
|name_AAA=[[Alpha F.C.|Alpha]]
|name_BBB=[[Beta F.C.|Beta]]
|name_CCC=[[Gamma]]
|win_AAA=1|draw_AAA=0|loss_AAA=3|gf_AAA=3|ga_AAA=8
|win_BBB=3|draw_BBB=1|loss_BBB=0|gf_BBB=9|ga_BBB=2
|win_CCC=2|draw_CCC=1|loss_CCC=1|gf_CCC=5|ga_CCC=4
}}`;
  const t = P.sportsTable(text);
  assert.deepStrictEqual(t.teams.map((x) => x.title), ['Alpha F.C.', 'Beta F.C.', 'Gamma']);
  assert.deepStrictEqual(t.standings, ['BBB', 'CCC', 'AAA']);
});

test('склад: лише перша команда, без орендованих в інші клуби й академії', () => {
  const text = `==Players==
===Current squad===
{{Fs start}}
{{Fs player|no=1|nat=ESP|pos=GK|name=[[David Raya]]}}
{{Fs player|no=7|nat=ENG|pos=FW|name=[[Bukayo Saka]]|other=[[Captain (association football)|captain]]}}
{{Fs player|no=27|nat=UKR|pos=FW|name=[[Mykhailo Mudryk]]|other=on loan from [[Chelsea F.C.|Chelsea]]}}
{{Fs end}}
;Out on loan
{{Fs start}}
{{Fs player|no=—|nat=ENG|pos=MF|name=[[Loaned Out]]}}
{{Fs end}}
===Academy===
{{Fs player|no=60|nat=ENG|pos=MF|name=[[Kid Player]]}}`;
  const sq = P.squad(text);
  assert.deepStrictEqual(sq.map((p) => p.name), ['David Raya', 'Bukayo Saka', 'Mykhailo Mudryk']);
  assert.strictEqual(sq[1].captain, true);
  assert.strictEqual(sq[2].onLoanFrom, 'Chelsea');
  assert.strictEqual(sq[0].group, 'GK');
});

test('інфобокс гравця: дата, зріст, позиція, збірна без молодіжних', () => {
  const text = `{{Infobox football biography
| name = Test
| birth_date = {{birth date and age|df=yes|2001|9|5}}
| height = {{height|m=1.78}}
| position = [[Winger (association football)|Right winger]]
| clubs1 = [[Arsenal F.C.|Arsenal]] | caps1 = 200 | goals1 = 60
| clubs2 = → [[Other]] (loan) | caps2 = 10 | goals2 = 1
| nationalteam1 = [[England national under-21 football team|England U21]] | nationalcaps1 = 15 | nationalgoals1 = 5
| nationalteam2 = [[England national football team|England]] | nationalcaps2 = 45 | nationalgoals2 = 12
}}`;
  const ib = P.infobox(text);
  assert.strictEqual(P.birthDate(ib.birth_date), '2001-09-05');
  assert.strictEqual(P.height(ib.height), 178);
  assert.deepStrictEqual(P.roles(ib.position), { roles: ['W'], side: 'R' });
  const c = P.career(ib);
  assert.strictEqual(c.caps, 45);
  assert.strictEqual(c.intlGoals, 12);
  assert.strictEqual(c.leagueApps, 210);
});

test('числа з тисячами й кількома рядками', () => {
  assert.strictEqual(P.parseNum('70,050<br>16,873'), 70050);
  assert.strictEqual(P.parseNum('62,850<ref name="x">{{cite}}</ref>'), 62850);
  assert.strictEqual(P.parseNum('5 000'), 5000);
});
