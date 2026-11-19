// Запити до Wikipedia й Wikidata: по одному, з паузою, повтором на 429 і кешем на диску.
// Кеш (.cache/) не комітиться; повторний запуск скрипта бере відповіді з нього.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'football-manager-db-builder/0.1 (personal hobby project; Node.js)';
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const MIN_GAP_MS = 3000; // Wikimedia суворо обмежує анонімні запити; краще повільно, але без 429
let lastRequest = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cachePath(url) {
  return path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
}

async function getJson(url, { maxAgeHours = 24 * 7 } = {}) {
  const file = cachePath(url);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < maxAgeHours * 3600e3) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) { /* немає в кеші */ }

  for (let attempt = 0; attempt < 12; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' } });
    } catch (e) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after')) || 0;
      const pause = Math.max(ra * 1000 + 1500, Math.min(5000 * 2 ** attempt, 120000));
      if (process.env.VERBOSE) console.error(`  ${res.status}, чекаю ${Math.round(pause / 1000)} с…`);
      await sleep(pause);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
    const data = await res.json();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  }
  throw new Error(`Не вдалося отримати ${url} після кількох спроб`);
}

function qs(params) {
  return new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
}

/** Вікітекст статті англійської (або іншої) Wikipedia, з переходом за перенаправленнями. */
async function wikitext(title, lang = 'en') {
  const url = `https://${lang}.wikipedia.org/w/api.php?` +
    qs({ action: 'query', prop: 'revisions|pageprops', rvprop: 'content', rvslots: 'main', redirects: '1', titles: title });
  const d = await getJson(url);
  const page = d.query && d.query.pages && d.query.pages[0];
  if (!page || page.missing) return null;
  return {
    title: page.title,
    qid: page.pageprops && page.pageprops.wikibase_item,
    text: page.revisions[0].slots.main.content,
  };
}

/** Wikidata-ідентифікатори (Q…) для списку назв статей. До 50 за запит. */
async function qidsForTitles(titles, lang = 'en') {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = `https://${lang}.wikipedia.org/w/api.php?` +
      qs({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: chunk.join('|') });
    const d = await getJson(url);
    const norm = {};
    for (const n of d.query.normalized || []) norm[n.from] = n.to;
    const redir = {};
    for (const r of d.query.redirects || []) redir[r.from] = r.to;
    const byTitle = {};
    for (const p of d.query.pages || []) if (p.pageprops) byTitle[p.title] = p.pageprops.wikibase_item;
    for (const t of chunk) {
      let k = norm[t] || t;
      k = redir[k] || k;
      if (byTitle[k]) out[t] = byTitle[k];
    }
  }
  return out;
}

/** Сутності Wikidata (claims, labels uk/en). До 50 за запит. */
async function entities(qids) {
  const out = {};
  const uniq = [...new Set(qids)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const url = 'https://www.wikidata.org/w/api.php?' +
      qs({ action: 'wbgetentities', ids: chunk.join('|'), props: 'claims|labels|sitelinks', languages: 'uk|en', sitefilter: 'ukwiki|enwiki' });
    const d = await getJson(url, { maxAgeHours: 24 * 30 });
    Object.assign(out, d.entities);
  }
  return out;
}

/**
 * Вікітекст багатьох статей пачками (з продовженням, якщо відповідь завелика).
 * Повертає { 'Назва з запиту': { title, qid, text } } — ключ той, що передали, навіть якщо було перенаправлення.
 */
// Кеш окремих статей: пачки змінюються, коли змінюється список назв, а стаття — та сама.
const pageFile = (lang, section, title) => cachePath(`page|${lang}|${section == null ? 'full' : section}|${title}`);
function readPage(lang, section, title, maxAgeHours = 24 * 7) {
  for (const sec of section == null ? [null] : [section, null]) { // для вступу згодиться й повна стаття
    try {
      const f = pageFile(lang, sec, title);
      if (Date.now() - fs.statSync(f).mtimeMs < maxAgeHours * 3600e3) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) { /* немає */ }
  }
  return undefined;
}
function writePage(lang, section, title, rec) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(pageFile(lang, section, title), JSON.stringify(rec || { missing: true }));
}

async function pagesContent(titles, { lang = 'en', batch = 20, section = null } = {}) {
  const out = {};
  const todo = [];
  for (const t of titles) {
    const rec = readPage(lang, section, t);
    if (rec === undefined) todo.push(t); else if (!rec.missing) out[t] = rec;
  }
  if (process.env.VERBOSE && titles.length !== todo.length) console.error(`  у кеші статей: ${titles.length - todo.length}, завантажити: ${todo.length}`);
  titles = todo;
  for (let i = 0; i < titles.length; i += batch) {
    const chunk = titles.slice(i, i + batch);
    const alias = {}; // кінцева назва -> назви з запиту
    let cont = null;
    do {
      const params = { action: 'query', prop: 'revisions|pageprops', rvprop: 'content', rvslots: 'main',
        ppprop: 'wikibase_item', redirects: '1', titles: chunk.join('|') };
      if (section != null) params.rvsection = String(section); // 0 — лише вступ з інфобоксом
      if (cont) Object.assign(params, cont);
      const d = await getJson(`https://${lang}.wikipedia.org/w/api.php?` + qs(params));
      if (!cont) {
        const map = {};
        for (const t of chunk) map[t] = t;
        for (const n of d.query.normalized || []) for (const k in map) if (map[k] === n.from) map[k] = n.to;
        for (const r of d.query.redirects || []) for (const k in map) if (map[k] === r.from) map[k] = r.to;
        for (const [k, v] of Object.entries(map)) (alias[v] = alias[v] || []).push(k);
      }
      for (const p of d.query.pages || []) {
        if (p.missing || !p.revisions) continue;
        const rec = { title: p.title, qid: p.pageprops && p.pageprops.wikibase_item, text: p.revisions[0].slots.main.content };
        for (const k of alias[p.title] || [p.title]) out[k] = rec;
      }
      cont = d.continue && d.continue.rvcontinue ? { rvcontinue: d.continue.rvcontinue, continue: d.continue.continue } : null;
    } while (cont);
    for (const t of chunk) writePage(lang, section, t, out[t] || null);
    if (process.env.VERBOSE) console.error(`  статті: ${Math.min(i + batch, titles.length)}/${titles.length}`);
  }
  return out;
}

/** SPARQL-запит до Wikidata; повертає масив рядків { змінна: значення }. */
async function sparql(query) {
  const d = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), { maxAgeHours: 24 * 7 });
  return d.results.bindings.map((b) => {
    const row = {};
    for (const [k, v] of Object.entries(b)) row[k] = v.value;
    return row;
  });
}

module.exports = { writePage, pageFile, getJson, wikitext, pagesContent, qidsForTitles, entities, sparql, sleep };
