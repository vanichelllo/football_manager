#!/usr/bin/env node
// Збирає реальну базу: ліги, клуби, гравці (Wikipedia + Wikidata) і рахує атрибути.
// Запуск:  NODE_USE_ENV_PROXY=1 node tools/build-db.js      (проксі — лише в хмарному контейнері)
// Результат: data/db.js (для гри) і data/db-report.txt (що не вдалося розпізнати).
// Повторний запуск бере відповіді з кешу .cache/ (тиждень), тож перебудова майже миттєва.
'use strict';

const fs = require('fs');
const path = require('path');
const wiki = require('./lib/wiki');
const P = require('./lib/parse');
const R = require('./lib/ratings');
const COUNTRIES = require('../js/data/countries');

const SEASON = '2026–27';
const PREV = ['2025–26', '2024–25'];
const SEASON_START = '2026-08-01'; // від цієї дати рахуємо вік у грі

const LEAGUES = [
  { id: 'eng', en: 'Premier League', name: 'Прем’єр-ліга', country: 'ENG' },
  { id: 'esp', en: 'La Liga', name: 'Ла Ліга', country: 'ESP' },
  { id: 'ita', en: 'Serie A', name: 'Серія A', country: 'ITA' },
  { id: 'ger', en: 'Bundesliga', name: 'Бундесліга', country: 'GER' },
  { id: 'fra', en: 'Ligue 1', name: 'Ліга 1', country: 'FRA' },
  { id: 'ukr', en: 'Ukrainian Premier League', name: 'Українська Прем’єр-ліга', country: 'UKR' },
  // другі дивізіони (підвищення й виліт з вищими)
  { id: 'eng2', en: 'EFL Championship', name: 'Чемпіоншип', country: 'ENG', tier: 2, up: 'eng' },
  { id: 'esp2', en: 'Segunda División', name: 'Сегунда', country: 'ESP', tier: 2, up: 'esp' },
  { id: 'ita2', en: 'Serie B', name: 'Серія B', country: 'ITA', tier: 2, up: 'ita' },
  { id: 'ger2', en: '2. Bundesliga', name: '2. Бундесліга', country: 'GER', tier: 2, up: 'ger' },
  { id: 'fra2', en: 'Ligue 2', name: 'Ліга 2', country: 'FRA', tier: 2, up: 'fra' },
  { id: 'ukr2', en: 'Ukrainian First League', name: 'Перша ліга України', country: 'UKR', tier: 2, up: 'ukr' },
  // ще чотири країни
  { id: 'por', en: 'Primeira Liga', name: 'Прімейра-ліга', country: 'POR' },
  { id: 'ned', en: 'Eredivisie', name: 'Ередивізі', country: 'NED' },
  { id: 'tur', en: 'Süper Lig', name: 'Суперліга Туреччини', country: 'TUR' },
  { id: 'pol', en: 'Ekstraklasa', name: 'Екстракляса', country: 'POL' },
];

const report = [];
const log = (...a) => console.error(...a);

async function leagueTable(season, league, articles) {
  const art = articles[`${season} ${league.en}`];
  let table = art && P.sportsTable(art.text);
  if (!table || !table.teams.length) {
    const tpl = await wiki.pagesContent([`Template:${season} ${league.en} table`]);
    const t = Object.values(tpl)[0];
    table = t && P.sportsTable(t.text);
  }
  return table;
}

async function main() {
  // 1. Ліги: склад сезону 2026–27 і місця у двох минулих сезонах
  log('1/5 Ліги й таблиці…');
  const seasonTitles = [];
  for (const l of LEAGUES) for (const s of [SEASON, ...PREV]) seasonTitles.push(`${s} ${l.en}`);
  const seasonArticles = await wiki.pagesContent(seasonTitles, { batch: 9 });

  const clubs = []; // { leagueId, title, name, code }
  const prevRank = {}; // назва статті клубу -> [strength за кожен минулий сезон]
  for (const l of LEAGUES) {
    const cur = await leagueTable(SEASON, l, seasonArticles);
    if (!cur) throw new Error(`Не знайшов таблицю ${SEASON} ${l.en}`);
    l.size = cur.teams.length;
    for (const t of cur.teams) clubs.push({ leagueId: l.id, title: t.title, name: t.name, code: t.code });
    for (const [k, s] of PREV.entries()) {
      const prev = await leagueTable(s, l, seasonArticles);
      if (!prev || !prev.standings) { report.push(`Немає підсумкової таблиці ${s} ${l.en}`); continue; }
      const n = prev.standings.length;
      prev.standings.forEach((code, i) => {
        const team = prev.teams.find((t) => t.code === code);
        (prevRank[team.title] = prevRank[team.title] || [])[k] = { r: 1 - i / (n - 1), league: l.id };
      });
    }
    log(`  ${l.name}: ${cur.teams.length} клубів`);
  }

  // 2. Статті клубів: інфобокс, кольори, склад
  log('2/5 Статті клубів…');
  const clubArticles = await wiki.pagesContent(clubs.map((c) => c.title), { batch: 12 });
  // назви статей могли змінитися через перенаправлення — зводимо минулі місця до кінцевих назв
  const rankByFinal = {};
  const prevTitles = Object.keys(prevRank);
  const prevFinal = await wiki.qidsForTitles(prevTitles);
  for (const t of prevTitles) rankByFinal[prevFinal[t] || t] = prevRank[t];

  // резервні команди («Колос-2») часто ведуть на статтю основного клубу — їх у грі немає
  const seenArt = new Map();
  for (const c of clubs.slice()) {
    const art = clubArticles[c.title];
    if (!art) continue;
    if (seenArt.has(art.title)) {
      report.push(`${c.name}: стаття веде на ${art.title} (той самий клуб, що й ${seenArt.get(art.title)}) — пропущено`);
      clubs.splice(clubs.indexOf(c), 1);
      const l = LEAGUES.find((x) => x.id === c.leagueId); l.size--;
    } else seenArt.set(art.title, c.name);
  }
  const playerRefs = [];
  for (const c of clubs) {
    const art = clubArticles[c.title];
    if (!art) { report.push(`Немає статті клубу ${c.title}`); c.players = []; continue; }
    c.qid = art.qid;
    const ib = P.infobox(art.text) || {};
    c.fullName = P.firstLine(ib.fullname) || null;
    c.ground = P.firstLine(ib.ground || ib.stadium).replace(/\s*\(.*$/, '') || null;
    c.capacity = P.parseNum(ib.capacity);
    if (c.capacity && c.capacity < 1000) c.capacity = null;
    const fy = /\b(18[5-9]\d|19\d\d|20[0-2]\d)\b/.exec(ib.founded || '');
    c.founded = fy ? Number(fy[1]) : null;
    c.colors = [P.kitColor(ib.body1), P.kitColor(ib.shorts1), P.kitColor(ib.socks1)].filter(Boolean);
    // місце в таблиці тієї ліги, де клуб грав тоді → сила в нинішній лізі (через абсолютний рівень ліги)
    const LG = R.LEAGUE, cur = LG[c.leagueId], tierOf = (id) => (LEAGUES.find((x) => x.id === id) || {}).tier || 1;
    const ranks = (rankByFinal[art.qid] || rankByFinal[c.title] || []).map((x) => {
      if (!x) return x;
      if (x.league === c.leagueId) return x.r;
      const src = LG[x.league];
      let s = 0.5 + (src.base + (x.r - 0.5) * 2 * src.spread - cur.base) / (2 * cur.spread);
      if (tierOf(x.league) > tierOf(c.leagueId)) s = Math.min(s, 0); // новачок вищої ліги — у нижній частині
      if (tierOf(x.league) < tierOf(c.leagueId)) s = Math.max(s, 0.6); // хто вилетів — серед сильніших
      return Math.max(-0.15, Math.min(1.1, s));
    });
    // сила: 65% минулий сезон, 35% позаминулий; новачок ліги — нижче за останнього
    const r0 = ranks[0] != null ? ranks[0] : -0.12;
    const r1 = ranks[1] != null ? ranks[1] : r0 - 0.05;
    c.strength = Math.max(-0.15, 0.65 * r0 + 0.35 * r1);
    c.squad = P.squad(art.text);
    if (c.squad.length < 18) report.push(`${c.name}: у складі лише ${c.squad.length} гравців`);
    for (const p of c.squad) if (p.title) playerRefs.push(p.title);
  }
  log(`  клубів: ${clubs.length}, гравців у складах: ${clubs.reduce((s, c) => s + c.squad.length, 0)}`);

  // 3. Статті гравців
  // SKIP_PLAYERS=1 — швидка чорнова база лише зі складів (для перевірки інтерфейсу)
  const quick = !!process.env.SKIP_PLAYERS;
  log('3/5 Статті гравців…' + (quick ? ' пропущено' : ''));
  const playerArticles = quick ? {} : await wiki.pagesContent([...new Set(playerRefs)], { batch: 50, section: 0 });

  // 4. Українські назви з Wikidata
  log('4/5 Українські назви…' + (quick ? ' пропущено' : ''));
  const qids = [...clubs.map((c) => c.qid), ...Object.values(playerArticles).map((a) => a.qid)].filter(Boolean);
  const ukLabel = quick ? {} : await ukrainianLabels([...new Set(qids)]);

  // 5. Збираємо базу й рахуємо атрибути
  log('5/5 Атрибути…');
  const db = build(clubs, playerArticles, ukLabel);
  writeOut(db);
}

async function ukrainianLabels(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 120) {
    const values = qids.slice(i, i + 120).map((q) => 'wd:' + q).join(' ');
    const rows = await wiki.sparql(`SELECT ?item ?uk WHERE { VALUES ?item { ${values} } ?item rdfs:label ?uk . FILTER(LANG(?uk) = "uk") }`);
    for (const r of rows) out[r.item.split('/').pop()] = r.uk;
  }
  return out;
}

function ageAt(born, date) {
  const b = new Date(born), d = new Date(date);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
}

const GROUP_DEFAULT_ROLE = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' };
const ROLE_GROUP = { GK: 'GK', CB: 'DF', FB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', W: 'FW', ST: 'FW' };

function cleanUk(label) {
  // «Арсенал (футбольний клуб)» → «Арсенал»; «Динамо (Київ)» → «Динамо Київ»; «Мудрик (футболіст)» → «Мудрик»
  if (!label) return null;
  let s = label.replace(/\s*\(([^)]*)\)\s*$/, (m, inner) =>
    /футбол|клуб|спорт|команда|значення|\d/.test(inner) ? '' : ' ' + inner.split(',')[0].trim()).trim();
  // «Забарний Ілля Борисович» → «Ілля Забарний» (так подають імена в українській Wikipedia)
  const w = s.split(/\s+/);
  if (w.length === 3 && /(ович|евич|євич|йович|івна|ївна|овна)$/.test(w[2])) s = `${w[1]} ${w[0]}`;
  else if (w.length === 4 && /^(огли|огли́|кизи)$/.test(w[3])) s = `${w[1]} ${w[0]}`; // «Дадашов Руфат Олег огли»
  return s;
}

const CITY_UK = { 'Borussia Dortmund': 'Дортмунд', 'Borussia Mönchengladbach': 'Менхенгладбах', 'Eintracht Frankfurt': 'Франкфурт',
  'Eintracht Braunschweig': 'Брауншвейг', 'Dynamo Dresden': 'Дрезден', 'Wisła Kraków': 'Краків', 'Wisła Płock': 'Плоцьк' };

function build(clubs, playerArticles, ukLabel) {
  const leagues = LEAGUES.map((l) => ({ id: l.id, name: l.name, country: l.country, size: l.size, tier: l.tier || 1, up: l.up || null }));
  const outClubs = [];
  const players = [];
  let pid = 0;
  const unknownNat = new Set();

  // гравець — лише в одному клубі: орендований — там, де грає («on loan from»), інакше — у першому за списком
  const home = new Map();
  for (const [ci, c] of clubs.entries()) for (const sq of c.squad) {
    const k = (sq.title && (playerArticles[sq.title] || {}).title) || sq.title;
    if (!k) continue;
    const prev = home.get(k);
    if (!prev || (sq.onLoanFrom && !prev.loan)) home.set(k, { ci, loan: !!sq.onLoanFrom });
  }
  for (const [ci, c] of clubs.entries()) {
    const before = c.squad.length;
    c.squad = c.squad.filter((sq) => { const k = (sq.title && (playerArticles[sq.title] || {}).title) || sq.title; return !k || home.get(k).ci === ci; });
    if (c.squad.length < before) report.push(`${c.name}: ${before - c.squad.length} гравців указано й в іншому клубі — лишено там`);
  }
  for (const [ci, c] of clubs.entries()) {
    const clubId = 'c' + ci;
    const club = {
      id: clubId, league: c.leagueId, code: c.code,
      name: cleanUk(ukLabel[c.qid]) || c.name, nameEn: c.name, fullName: c.fullName,
      stadium: c.ground, capacity: c.capacity, founded: c.founded,
      colors: c.colors.length ? c.colors : ['#cccccc', '#333333'],
      strength: Math.round(c.strength * 1000) / 1000,
      wiki: c.title, players: [],
    };
    for (const s of c.squad) {
      const art = s.title && playerArticles[s.title];
      const ib = art ? P.infobox(art.text) || {} : {};
      const born = P.birthDate(ib.birth_date) || null;
      const age = born ? ageAt(born, SEASON_START) : 24;
      const rr = P.roles(ib.position);
      let roles = rr.roles.filter((r) => ROLE_GROUP[r] === s.group || !s.group);
      if (!roles.length) roles = s.group ? [GROUP_DEFAULT_ROLE[s.group]] : rr.roles.length ? rr.roles : ['CM'];
      // крайні: у складі «FW», а в інфобоксі «Winger» — W; «DF» з «Full-back» — FB
      const main = roles[0];
      const nat = COUNTRIES.code(s.nat);
      if (!nat && s.nat) unknownNat.add(s.nat);
      const car = art ? P.career(ib) : { leagueApps: null, leagueGoals: null, caps: 0, intlGoals: 0 };
      const key = (art && art.title) || `${c.title}/${s.name}`;
      const facts = { key, age, caps: car.caps, intlGoals: car.intlGoals, nat: nat || '', leagueApps: car.leagueApps, leagueGoals: car.leagueGoals,
        pos: main, posGroup: s.group || ROLE_GROUP[main], height: P.height(ib.height) };
      const { ca, pa } = R.abilities(facts, { league: c.leagueId, strength: Math.max(0, c.strength) });
      const attrs = R.attributes(facts, ca);
      const id = 'p' + pid++;
      players.push({
        id, club: clubId,
        name: (art && cleanUk(ukLabel[art.qid])) || s.name, nameEn: s.name,
        born, nat: nat || s.nat || '', number: s.number, roles, side: rr.side,
        height: facts.height, caps: car.caps, intlGoals: car.intlGoals,
        leagueApps: car.leagueApps, leagueGoals: car.leagueGoals,
        onLoanFrom: s.onLoanFrom, captain: s.captain || undefined,
        ca, pa, attrs, value: R.marketValue(ca, age, c.leagueId, pa),
        wiki: art ? art.title : null,
      });
      club.players.push(id);
      if (!art) report.push(`${club.nameEn}: без статті — ${s.name}`);
      else if (!born) report.push(`${club.nameEn}: без дати народження — ${s.name}`);
    }
    outClubs.push(club);
  }
  if (unknownNat.size) report.push('Невідомі країни: ' + [...unknownNat].join(', '));
  // однакові короткі назви різних клубів («Боруссія», «Вісла») — додаємо місто
  const byName = {};
  for (const c of outClubs) (byName[c.name] = byName[c.name] || []).push(c);
  for (const list of Object.values(byName)) {
    if (list.length < 2) continue;
    for (const c of list) {
      if (c.nameEn === 'Dynamo Kyiv') continue; // «Динамо» без уточнення — київське
      c.name = CITY_UK[c.nameEn] ? `${c.name} ${CITY_UK[c.nameEn]}` : `${c.name} (${c.nameEn})`;
    }
  }
  return { version: 1, season: '2026/27', seasonStart: SEASON_START, snapshot: new Date().toISOString().slice(0, 10),
    source: 'Wikipedia (CC BY-SA 4.0), Wikidata (CC0); атрибути — власна формула (tools/lib/ratings.js)',
    leagues, clubs: outClubs, players };
}

function writeOut(db) {
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const js = '// Згенеровано tools/build-db.js — не редагуйте вручну.\n' +
    `// Джерела: ${db.source}. Знімок: ${db.snapshot}.\n` +
    'window.FM_DB = ' + JSON.stringify(db) + ';\n';
  fs.writeFileSync(path.join(dir, 'db.js'), js);
  fs.writeFileSync(path.join(dir, 'db-report.txt'), report.join('\n') + '\n');
  log(`Готово: ${db.clubs.length} клубів, ${db.players.length} гравців, ${(js.length / 1024).toFixed(0)} КБ. Зауважень: ${report.length}`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { build, LEAGUES };
