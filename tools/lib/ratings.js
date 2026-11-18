// Атрибути 1–20 з реальних фактів. Таких чисел у справжньому футболі немає, тому рахуємо власною формулою:
// сила ліги + сила клубу (місце в минулому сезоні) + вік + збірна + регулярність ігор + зріст і голи.
// CA (поточний рівень) і PA (потенціал) — шкала 1–200, як прийнято в жанрі.
'use strict';

/** Детерміноване «випадкове» число 0..1 з рядка: той самий гравець завжди отримує ті самі числа. */
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const noise = (key, amp) => (hash01(key) * 2 - 1) * amp;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Сила ліги (база CA середнього клубу) і розкид між найкращим і найслабшим клубом.
const LEAGUE = {
  eng: { base: 127, spread: 21 },
  esp: { base: 123, spread: 23 },
  ita: { base: 121, spread: 20 },
  ger: { base: 121, spread: 21 },
  fra: { base: 115, spread: 22 },
  ukr: { base: 95, spread: 19 },
};

// Рівень збірних (приблизно за рейтингом ФІФА 2025–2026). Решта країн — рівень 4.
const NATION_TIER = {
  1: ['ARG', 'FRA', 'ESP', 'ENG', 'BRA', 'POR', 'NED', 'BEL', 'GER', 'ITA', 'CRO'],
  2: ['URU', 'COL', 'MAR', 'USA', 'MEX', 'SUI', 'DEN', 'JPN', 'SEN', 'AUT', 'NOR', 'TUR', 'UKR', 'SRB', 'SWE',
      'POL', 'KOR', 'ECU', 'WAL', 'HUN', 'SCO', 'CZE', 'NGA', 'CIV', 'EGY', 'ALG', 'IRN', 'AUS', 'CAN'],
  3: ['SVK', 'SVN', 'GRE', 'ROU', 'IRL', 'NIR', 'FIN', 'GEO', 'ALB', 'BIH', 'MKD', 'ISL', 'PAR', 'CHI', 'PER',
      'VEN', 'CMR', 'GHA', 'MLI', 'TUN', 'BFA', 'RSA', 'COD', 'GUI', 'GAB', 'CPV', 'JAM', 'CRC', 'PAN', 'KSA',
      'QAT', 'UZB', 'ISR', 'MNE', 'KOS', 'BUL', 'ARM', 'AZE', 'GEO', 'BLR', 'LUX', 'SUR'],
};
const TIER_OF = {};
for (const [t, list] of Object.entries(NATION_TIER)) for (const c of list) TIER_OF[c] = Number(t);
const CAPS_WEIGHT = { 1: 24, 2: 17, 3: 11, 4: 7 };

function ageEffect(age) {
  const table = { 16: -34, 17: -28, 18: -22, 19: -16, 20: -11, 21: -7, 22: -4, 23: -2 };
  if (age <= 16) return -34;
  if (table[age] !== undefined) return table[age];
  if (age <= 29) return 0;
  return -[1, 2, 4, 6, 9, 12, 16, 20][Math.min(age - 30, 7)];
}

/**
 * Поточний рівень (CA) і потенціал (PA).
 * p: { key, age, caps, nat, leagueApps, leagueGoals, pos, posGroup }
 * club: { league, strength }  — strength 0..1 (1 — чемпіон минулого сезону)
 */
function abilities(p, club) {
  const L = LEAGUE[club.league];
  let ca = L.base + (club.strength - 0.5) * 2 * L.spread;
  ca += ageEffect(p.age);

  const tier = TIER_OF[p.nat] || 4;
  const caps = p.caps || 0;
  ca += Math.sqrt(Math.min(caps, 100) / 100) * CAPS_WEIGHT[tier];
  if (caps === 0 && p.age >= 24) ca -= 4;
  // молодий гравець основи сильної збірної — окремий сигнал якості
  if (caps >= 5 && p.age <= 22) ca += tier <= 2 ? 6 : 3;

  if (p.age >= 20 && p.leagueApps != null) {
    const rate = p.leagueApps / Math.max(1, p.age - 17); // ігор у лігах за рік кар'єри
    ca += clamp((rate - 16) * 0.45, -9, 6);
  }
  ca += noise(p.key + ':ca', 6);
  ca = Math.round(clamp(ca, 35, 192));

  let pa = ca;
  if (p.age < 29) {
    const room = Math.max(0, 27 - p.age) * (4 + 5 * hash01(p.key + ':pa'));
    pa = ca + room * (0.7 + 0.6 * club.strength);
  }
  pa = Math.round(clamp(Math.max(pa, ca), ca, 200));
  return { ca, pa };
}

// Атрибути
const OUTFIELD = ['fin', 'pas', 'dri', 'cro', 'tac', 'hea', 'dec', 'pos', 'otb', 'wor', 'pac', 'sta', 'str'];
const GOALKEEPER = ['ref', 'han', 'one', 'aer', 'kic', 'dec', 'pos', 'pac', 'sta', 'str'];

// Профіль позиції: + ключові, 0 — звичайні, − неважливі (у балах 1–20 відносно CA/10).
const PROFILE = {
  GK: { ref: 3, han: 2.5, one: 2, aer: 2, kic: 0, dec: 1, pos: 2, pac: -3, sta: -2, str: 0 },
  CB: { fin: -5, pas: -1, dri: -3, cro: -4, tac: 3, hea: 3, dec: 1, pos: 3, otb: -4, wor: 0.5, pac: 0, sta: 0, str: 2.5 },
  FB: { fin: -4, pas: 0, dri: 0, cro: 2, tac: 2, hea: -1, dec: 0, pos: 1.5, otb: -1, wor: 2, pac: 2.5, sta: 2.5, str: -0.5 },
  DM: { fin: -3, pas: 1.5, dri: -1, cro: -2, tac: 3, hea: 0.5, dec: 2, pos: 2.5, otb: -2, wor: 2.5, pac: -0.5, sta: 2, str: 1.5 },
  CM: { fin: -1, pas: 3, dri: 1, cro: 0, tac: 0.5, hea: -1, dec: 2.5, pos: 0.5, otb: 1, wor: 2, pac: 0, sta: 2, str: 0 },
  AM: { fin: 1.5, pas: 3, dri: 3, cro: 0.5, tac: -3, hea: -2, dec: 2, pos: -2, otb: 2.5, wor: 0, pac: 1, sta: 0, str: -1 },
  W:  { fin: 1, pas: 0.5, dri: 3.5, cro: 2.5, tac: -3, hea: -2.5, dec: 0.5, pos: -2.5, otb: 2, wor: 0.5, pac: 3.5, sta: 1, str: -1.5 },
  ST: { fin: 3.5, pas: -0.5, dri: 1, cro: -2, tac: -4, hea: 1.5, dec: 1, pos: -3, otb: 3.5, wor: 0, pac: 1.5, sta: 0, str: 1.5 },
};

function attributes(p, ca) {
  const role = PROFILE[p.pos] ? p.pos : (p.posGroup === 'GK' ? 'GK' : 'CM');
  const names = role === 'GK' ? GOALKEEPER : OUTFIELD;
  const mid = ca / 10.5 + 0.8; // CA 150 → ~15, CA 100 → ~10
  const h = p.height || (role === 'GK' ? 189 : 181);
  const gpa = p.leagueApps > 20 ? (p.leagueGoals || 0) / p.leagueApps : null;
  const out = {};
  for (const a of names) {
    let v = mid + PROFILE[role][a] + noise(p.key + ':' + a, 1.8);
    if (a === 'hea' || a === 'aer') v += (h - 182) / 5;
    if (a === 'str') v += (h - 181) / 8;
    if (a === 'pac' || a === 'dri') v -= (h - 181) / 12;
    if (a === 'pac') v -= Math.max(0, p.age - 29) * 0.6 - Math.max(0, 22 - p.age) * 0.2;
    if (a === 'sta') v -= Math.max(0, p.age - 31) * 0.5;
    if (a === 'str') v -= Math.max(0, 21 - p.age) * 0.7;
    if ((a === 'dec' || a === 'pos') && p.age >= 29) v += 0.8;
    if (gpa !== null && (a === 'fin' || a === 'otb')) v += clamp((gpa - (role === 'ST' ? 0.33 : 0.15)) * 8, -2, 3);
    out[a] = Math.round(clamp(v, 1, 20));
  }
  return out;
}

/** Орієнтовна ринкова ціна, млн €. */
function marketValue(ca, age, league) {
  const leagueMult = { eng: 1.9, esp: 1.3, ita: 1.2, ger: 1.25, fra: 1.15, ukr: 0.5 }[league];
  const ageMult = age <= 23 ? 1.35 : age <= 27 ? 1.15 : age <= 29 ? 0.9 : age <= 31 ? 0.6 : age <= 33 ? 0.35 : 0.15;
  const v = 0.06 * Math.exp((ca - 80) / 14.5) * leagueMult * ageMult;
  return Math.round(clamp(v, 0.05, 250) * 20) / 20; // крок 50 тис.
}

module.exports = { abilities, attributes, marketValue, hash01, TIER_OF, OUTFIELD, GOALKEEPER, LEAGUE };
