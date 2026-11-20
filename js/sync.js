// Розширення 16: синхронізація кар'єри між пристроями через приватний GitHub Gist.
// Токен (лише з правом «gist») зберігається тільки в цьому браузері. Збереження — той самий стиснений код, що й у файлі.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const TOKEN_KEY = 'golovnyi-trener:gist-token', DESC = 'golovnyi-trener-save', FILE = 'golovnyi-trener-save.txt';
  const API = 'https://api.github.com';
  const ls = {
    get(k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { if (v) root.localStorage.setItem(k, v); else root.localStorage.removeItem(k); } catch (_) { /* приватне вікно */ } },
  };
  const token = () => ls.get(TOKEN_KEY);
  const setToken = (t) => ls.set(TOKEN_KEY, (t || '').trim() || null);
  async function gh(path, opts = {}) {
    const res = await fetch(API + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (res.status === 401) throw new Error('GitHub не прийняв токен. Перевірте, що він дійсний і має право «gist».');
    if (!res.ok) throw new Error(`GitHub відповів ${res.status}.`);
    return res.status === 204 ? null : res.json();
  }
  /** Наш gist зі збереженням або null. */
  async function find() {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const g = list.find((x) => x.description === DESC && x.files && x.files[FILE]);
      if (g) return g;
      if (list.length < 100) break;
    }
    return null;
  }
  /** Завантажити код збереження в хмару (створює приватний gist або оновлює наявний). */
  async function upload(code, meta) {
    if (!token()) throw new Error('Спершу вставте токен GitHub.');
    const g = await find();
    const body = { description: DESC, files: { [FILE]: { content: code }, 'about.txt': { content: meta || 'Збереження гри «Головний тренер».' } } };
    if (g) await gh(`/gists/${g.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    else await gh('/gists', { method: 'POST', body: JSON.stringify({ ...body, public: false }) });
    return true;
  }
  /** Отримати код збереження з хмари. */
  async function download() {
    if (!token()) throw new Error('Спершу вставте токен GitHub.');
    const g0 = await find();
    if (!g0) throw new Error('У хмарі ще немає збереження — збережіть його з іншого пристрою.');
    const g = await gh(`/gists/${g0.id}`), f = g.files[FILE];
    if (!f) throw new Error('Файл збереження не знайдено.');
    if (!f.truncated) return { code: f.content, updated: g.updated_at };
    const raw = await fetch(f.raw_url); // великий файл — повністю за посиланням
    if (!raw.ok) throw new Error('Не вдалося завантажити повний файл збереження.');
    return { code: await raw.text(), updated: g.updated_at };
  }
  FM.sync = { token, setToken, upload, download };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
