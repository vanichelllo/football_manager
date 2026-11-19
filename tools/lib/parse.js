// Розбір вікітексту: таблиці ліг (модуль Sports table), інфобокси, склади команд.
'use strict';

/** Вміст шаблону {{name ...}} з урахуванням вкладених {{ }}; повертає масив сирих рядків шаблонів. */
function findTemplates(text, nameRe) {
  const out = [];
  const re = new RegExp('\\{\\{\\s*(?:' + nameRe + ')\\s*[|}\\n]', 'gi');
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    let i = m.index;
    for (; i < text.length - 1; i++) {
      if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; } else if (text[i] === '}' && text[i + 1] === '}') {
        depth--; i++;
        if (depth === 0) break;
      }
    }
    out.push(text.slice(m.index, i + 1));
    re.lastIndex = i + 1;
  }
  return out;
}

/** Параметри шаблону: { name: value } (лише іменовані, верхній рівень). */
function templateParams(tpl) {
  const body = tpl.replace(/^\{\{/, '').replace(/\}\}$/, '');
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return params;
}

const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

/** Перше посилання [[Стаття|Текст]] → { title, text }. */
function firstLink(s) {
  const m = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/.exec(s || '');
  if (!m) return null;
  return { title: m[1].trim().replace(/_/g, ' '), text: (m[2] || m[1]).trim() };
}

/** Простий текст: прибирає посилання, шаблони, теги. */
function plain(s) {
  if (!s) return '';
  let t = stripComments(s);
  t = t.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
  t = t.replace(/\{\{(?:nowrap|small|nobold|abbr)\|([^{}|]*)(?:\|[^{}]*)?\}\}/gi, '$1');
  for (let k = 0; k < 4; k++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  t = t.replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Таблиця ліги з модуля Sports table.
 * Повертає { teams: [{ code, title, name }], standings: [code…] | null } — standings за очками, якщо є результати.
 */
function sportsTable(text) {
  const tpls = findTemplates(stripComments(text), '#invoke:\\s*Sports table');
  if (!tpls.length) return null;
  const p = templateParams(tpls[0]);
  const teams = [];
  for (const [k, v] of Object.entries(p)) {
    const m = /^name_(.+)$/.exec(k);
    if (!m) continue;
    const link = firstLink(v);
    if (link) teams.push({ code: m[1].toUpperCase(), title: link.title, name: link.text });
  }
  const num = (k) => Number((p[k] || '0').replace(/[^\d-]/g, '')) || 0;
  let played = 0;
  const rows = teams.map((t) => {
    const c = t.code.toLowerCase();
    const w = num('win_' + c), d = num('draw_' + c), l = num('loss_' + c);
    played += w + d + l;
    const adj = num('adjust_points_' + c);
    return { code: t.code, pts: 3 * w + d + adj, gd: num('gf_' + c) - num('ga_' + c), gf: num('gf_' + c) };
  });
  const order = (p.team_order || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || order.indexOf(a.code) - order.indexOf(b.code));
  return { teams, standings: played > 0 ? rows.map((r) => r.code) : null, played };
}

/** Позиції секцій «== Заголовок ==». */
function sections(text) {
  const out = [];
  const re = /^(={2,5})\s*([^=\n]+?)\s*\1\s*$/gm;
  let m;
  while ((m = re.exec(text))) out.push({ level: m[1].length, title: plain(m[2]), start: m.index, end: re.lastIndex });
  return out;
}

const POS_GROUP = { GK: 'GK', DF: 'DF', MF: 'MF', FW: 'FW' };

/**
 * Перша команда клубу з {{Fs player}} / {{Football squad player}}.
 * Пропускає «Out on loan», резерв, академію, жіночу команду.
 */
function squad(text) {
  const t = stripComments(text);
  const secs = sections(t);
  const bad = /loan|reserve|academy|youth|under-|u-?\d\d|\bb team|women|retired|former|notable|development|second team|ii\b|staff|management|coach/i;
  const good = /^(first[- ]team )?(squad|current squad|players|first[- ]team( squad)?|first team players|current first[- ]team squad)$/i;
  // діапазон: секція «Players»/«Current squad», до наступної секції з поганою назвою або того ж/вищого рівня
  let ranges = [];
  for (let i = 0; i < secs.length; i++) {
    if (!good.test(secs[i].title)) continue;
    let end = t.length;
    for (let j = i + 1; j < secs.length; j++) {
      if (secs[j].level <= secs[i].level || bad.test(secs[j].title)) { end = secs[j].start; break; }
    }
    ranges.push([secs[i].end, end]);
  }
  if (!ranges.length) ranges = [[0, t.length]];
  const players = [];
  const seen = new Set();
  for (const [a, b] of ranges) {
    let chunk = t.slice(a, b);
    // усередині секції теж буває підзаголовок через {{Fs mid}} + жирний текст «Out on loan» — обрізаємо
    // рядок-підзаголовок («;Out on loan», «'''Reserves'''», «{{Fs break|Out on loan}}») — далі вже не перша команда
    const cut = chunk.search(/^(?!\{\{\s*fs player)[^\n]*\b(out on loan|on loan|loaned out|loans|reserves?|academy|youth|under-?\s?\d\d|U-?\d\d|b team|second team|development)\b[^\n]*$/im);
    if (cut > 0) chunk = chunk.slice(0, cut);
    for (const tpl of findTemplates(chunk, 'fs player|football squad player|fs2 player')) {
      const p = templateParams(tpl);
      const link = firstLink(p.name);
      const name = link ? link.text : plain(p.name);
      if (!name) continue;
      if (/loan/i.test(p.other || '') && /\bto\b/i.test(p.other || '')) continue; // віддали в оренду
      const key = (link && link.title) || name;
      if (seen.has(key)) continue;
      seen.add(key);
      players.push({
        title: link ? link.title : null,
        name: plain(name),
        number: Number(plain(p.no)) || null,
        nat: plain(p.nat),
        group: POS_GROUP[plain(p.pos).toUpperCase()] || null,
        captain: /captain/i.test(p.other || ''),
        onLoanFrom: /on loan from/i.test(p.other || '') ? plain((p.other || '').replace(/^.*?on loan from/i, '')) : null,
      });
    }
    if (players.length >= 18) break;
  }
  return players;
}

/** Інфобокс (перший {{Infobox …}}) → параметри. */
function infobox(text) {
  const tpls = findTemplates(stripComments(text), 'Infobox[^|}\\n]*');
  return tpls.length ? templateParams(tpls[0]) : null;
}

function parseNum(s) {
  const first = String(s || '').split(/<br\s*\/?>|\n/i)[0];
  const m = /\d{1,3}(?:[,\u00a0 ]\d{3})+|\d+(?:\.\d+)?/.exec(plain(first));
  return m ? Number(m[0].replace(/[,\u00a0 ]/g, '')) : null;
}

/** Перший рядок поля (до <br>) простим текстом. */
const firstLine = (s) => plain(String(s || '').split(/<br\s*\/?>/i)[0]);

/** Дата народження з {{birth date and age|1995|3|4}} тощо → 'YYYY-MM-DD'. */
function birthDate(s) {
  if (!s) return null;
  const m = /\{\{\s*birth[ _]date(?:[ _]and[ _]age)?2?\s*\|(?:[^|}]*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const y = /\b(19[6-9]\d|200\d|201\d)\b/.exec(plain(s));
  return y ? `${y[1]}-07-01` : null;
}

function height(s) {
  if (!s) return null;
  let m = /\{\{\s*(?:height|convert)\s*\|\s*m\s*=\s*([\d.]+)/i.exec(s) || /\{\{\s*convert\s*\|\s*([\d.]+)\s*\|\s*m\b/i.exec(s);
  if (m) return Math.round(Number(m[1]) * 100);
  m = /\{\{\s*(?:height|convert)\s*\|\s*cm\s*=\s*(\d+)/i.exec(s) || /\{\{\s*convert\s*\|\s*(\d{3})\s*\|\s*cm/i.exec(s);
  if (m) return Number(m[1]);
  m = /(1[.,]\d{2})\s*m/.exec(plain(s));
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 100);
  m = /(1\d{2})\s*cm/.exec(plain(s));
  return m ? Number(m[1]) : null;
}

/** Ролі з тексту позиції інфобоксу: ['CB'], ['W','ST'] тощо, і сторона L/R. */
function roles(s) {
  const t = plain(s).toLowerCase();
  const out = [];
  const add = (r) => { if (!out.includes(r)) out.push(r); };
  const rules = [
    [/goalkeeper/, 'GK'], [/centre[- ]back|center[- ]back|central defender|sweeper|libero/, 'CB'],
    [/full[- ]back|wing[- ]back|left[- ]back|right[- ]back/, 'FB'], [/defensive midfield|holding midfield/, 'DM'],
    [/attacking midfield|playmaker|second striker|number 10/, 'AM'], [/winger|wide midfield|left midfield|right midfield/, 'W'],
    [/central midfield|box-to-box|(?<!attacking |defensive |wide |left |right )midfielder/, 'CM'],
    [/striker|centre[- ]forward|center[- ]forward|forward/, 'ST'], [/^defender$|defender/, 'CB'],
  ];
  // порядок появи в тексті важливий: перша згадка — основна позиція
  const hits = [];
  for (const [re, r] of rules) {
    const m = re.exec(t);
    if (m) hits.push([m.index, r]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  for (const [, r] of hits) add(r);
  const side = /left/.test(t) && !/right/.test(t) ? 'L' : /right/.test(t) && !/left/.test(t) ? 'R' : null;
  return { roles: out, side };
}

/** Кар'єра: сума ігор/голів у клубах (без юнацьких) і збірна (лише основна). */
function career(ib) {
  let apps = 0, goals = 0, seen = 0;
  for (let i = 1; i <= 40; i++) {
    const club = ib['clubs' + i];
    if (club === undefined) continue;
    const c = parseNum(ib['caps' + i]);
    const g = parseNum(ib['goals' + i]);
    if (c != null) { apps += c; seen++; }
    if (g != null) goals += g;
  }
  let caps = 0, intlGoals = 0, team = null;
  // у статтях трапляються обидва написання: nationalteam1 і national_team1
  const field = (base, i) => {
    const sfx = i || '';
    return ib[base + sfx] ?? ib[base.replace('national', 'national_') + sfx];
  };
  for (let i = 0; i <= 12; i++) {
    const nt = field('nationalteam', i);
    if (nt === undefined) continue;
    const name = plain(nt);
    if (/\bU-?\s?\d\d|under[- ]\d\d|youth|olympic|\bB\b|amateur|futsal|beach/i.test(name)) continue;
    const c = parseNum(field('nationalcaps', i));
    if (c != null && c >= caps) { caps = c; intlGoals = parseNum(field('nationalgoals', i)) || 0; team = name; }
  }
  return { leagueApps: seen ? apps : null, leagueGoals: seen ? goals : null, caps, intlGoals, nationalTeam: team };
}

/** Колір з параметра кіту (body1=FF0000 / ff0000 / #ff0000). */
function kitColor(s) {
  const m = /#?([0-9a-f]{6})\b/i.exec(s || '');
  return m ? '#' + m[1].toLowerCase() : null;
}

module.exports = { firstLine, findTemplates, templateParams, sportsTable, squad, infobox, plain, firstLink, parseNum, birthDate, height, roles, career, kitColor, sections };
