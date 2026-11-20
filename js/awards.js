// Нагороди, рекорди й легенди (як у FM): команда туру, гравець і тренер місяця вашої ліги, нагороди сезону,
// рекорди клубу (найбільша перемога, серії, бомбардир сезону, відвідуваність), Зала слави клубу.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const MONTH_NOM = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const LINES = [['GK', 1], ['def', 4], ['mid', 3], ['att', 3]];
  const lineOf = (p) => (p.roles[0] === 'GK' ? 'GK' : FM.ROLE_LINE[p.roles[0]]);

  function aw(state) {
    const a = (state.aw = state.aw || {});
    a.list = a.list || []; a.pa = a.pa || {}; a.rec = a.rec || {}; a.career = a.career || {}; a.hof = a.hof || []; a.seasons = a.seasons || {};
    return a;
  }
  const pa = (a, pid) => (a.pa[pid] = a.pa[pid] || { totw: 0, potm: 0, mvp: [], boot: [], young: [], tos: [] });
  const push = (a, x) => { a.list.push(x); if (a.list.length > 160) a.list.splice(0, a.list.length - 160); };

  /**
   * Тиждень (викликати після закриття туру, S.week уже +1): команда туру, нагороди місяця.
   * Повертає новини.
   */
  function week(W, state, name = (p) => p.name) {
    const S = state.season, a = aw(state), news = [];
    const league = W.club(state.clubId).league, w = S.week - 1;
    if (a.year !== S.year) { a.year = S.year; a.snap = {}; }
    const fx = S.fixtures.filter((f) => f.w === w && f.l === league && f.s);
    // що змінилося за тиждень у гравців вашої ліги
    const diff = [];
    for (const c of W.clubsOf(league)) for (const id of c.players) {
      const st = S.ps[id]; if (!st) continue;
      const o = a.snap[id] || [0, 0, 0, 0];
      const d = [st[0] - o[0], st[3] - o[1], st[1] - o[2], st[2] - o[3]];
      a.snap[id] = [st[0], st[3], st[1], st[2]];
      if (d[0] > 0) diff.push({ p: W.player(id), d });
    }
    // місяць (за датою суботи тижня)
    const date = FM.season.dateOf(w, S), mk = date.slice(0, 7);
    if (a.month && a.month.key !== mk) news.push(...closeMonth(W, state, name));
    if (!a.month || a.month.key !== mk) a.month = { key: mk, p: {}, pts: {}, gd: {} };
    for (const { p, d } of diff) { const m = (a.month.p[p.id] = a.month.p[p.id] || [0, 0, 0, 0]); for (let i = 0; i < 4; i++) m[i] += d[i]; }
    for (const f of fx) {
      const [hg, ag] = f.s;
      a.month.pts[f.h] = (a.month.pts[f.h] || 0) + (hg > ag ? 3 : hg === ag ? 1 : 0); a.month.pts[f.a] = (a.month.pts[f.a] || 0) + (ag > hg ? 3 : hg === ag ? 1 : 0);
      a.month.gd[f.h] = (a.month.gd[f.h] || 0) + hg - ag; a.month.gd[f.a] = (a.month.gd[f.a] || 0) + ag - hg;
    }
    // команда туру
    if (fx.length) {
      const score = (x) => x.d[1] / x.d[0] / 10 + x.d[2] * 0.25 + x.d[3] * 0.12;
      const xi = [];
      for (const [line, n] of LINES) xi.push(...diff.filter((x) => lineOf(x.p) === line).sort((p, q) => score(q) - score(p)).slice(0, n));
      if (xi.length >= 9) {
        const ids = xi.map((x) => x.p.id);
        for (const id of ids) pa(a, id).totw++;
        a.totw = { s: S.year, w, ids, r: xi.map((x) => Math.round((x.d[1] / x.d[0])) / 10) };
        const mine = xi.filter((x) => x.p.club === state.clubId);
        news.push(`Команда туру ${W.league(league).name}${mine.length ? `: від вашого клубу — ${mine.map((x) => name(x.p)).join(', ')}` : ` — без ваших гравців. Найкращий: ${name(xi.slice().sort((p, q) => score(q) - score(p))[0].p)}`}.`);
      }
    }
    return news;
  }

  /** Нагороди місяця: гравець місяця (оцінка, голи) і тренер місяця (очки) вашої ліги. */
  function closeMonth(W, state, name) {
    const a = aw(state), m = a.month, S = state.season, out = [];
    const league = W.club(state.clubId).league;
    const mi = Number(m.key.slice(5, 7)) - 1;
    const rows = Object.entries(m.p).map(([id, x]) => ({ p: W.player(id), x })).filter((r) => r.p && r.x[0] >= 2);
    const val = (r) => r.x[1] / r.x[0] / 10 + r.x[2] * 0.15 + r.x[3] * 0.08;
    const best = rows.sort((p, q) => val(q) - val(p))[0];
    const clubs = Object.keys(m.pts);
    const coach = clubs.sort((p, q) => m.pts[q] - m.pts[p] || m.gd[q] - m.gd[p])[0];
    if (!best && !coach) return out;
    if (best) {
      pa(a, best.p.id).potm++;
      push(a, { t: 'potm', s: S.year, m: m.key, league, pid: best.p.id, club: best.p.club, txt: `${best.x[0]} матч., ${best.x[2]} гол., оцінка ${(best.x[1] / best.x[0] / 10).toFixed(2).replace('.', ',')}` });
      out.push(`Гравець місяця (${MONTH_NOM[mi].toLowerCase()}), ${W.league(league).name}: ${name(best.p)} (${W.club(best.p.club).name}) — ${best.x[2]} гол., середня оцінка ${(best.x[1] / best.x[0] / 10).toFixed(1).replace('.', ',')}.${best.p.club === state.clubId ? ' Ваш гравець!' : ''}`);
    }
    if (coach) {
      push(a, { t: 'cotm', s: S.year, m: m.key, league, club: coach, me: coach === state.clubId, txt: `${m.pts[coach]} очок` });
      if (coach === state.clubId) { a.cotm = (a.cotm || 0) + 1; if (state.board) state.board.rep = Math.min(100, state.board.rep + 1); }
      out.push(coach === state.clubId ? `Ви — тренер місяця (${MONTH_NOM[mi].toLowerCase()})! ${m.pts[coach]} очок. Репутація зросла.` : `Тренер місяця: ${W.club(coach).name} (${m.pts[coach]} очок).`);
    }
    return out;
  }

  /** Нагороди сезону вашої ліги (на основі FM.dev.awards) + записати в історію гравців. */
  function season(W, state, champion, trophies) {
    const a = aw(state), S = state.season, league = W.club(state.clubId).league;
    const r = FM.dev.awards(W, S, league);
    const rec = { league, champion, mvp: r.mvp, young: r.young, boot: r.boot, xi: r.xi, me: state.clubId };
    a.seasons[S.year] = rec;
    if (r.mvp) pa(a, r.mvp).mvp.push(S.year);
    if (r.young) pa(a, r.young).young.push(S.year);
    if (r.boot) pa(a, r.boot[0]).boot.push(S.year);
    for (const id of r.xi) pa(a, id).tos.push(S.year);
    // кар'єра гравців вашого клубу й Зала слави
    const news = [];
    for (const p of W.squad(state.clubId)) {
      const st = S.ps[p.id];
      const c = (a.career[p.id] = a.career[p.id] || { apps: 0, goals: 0, ast: 0, seasons: 0, trophies: 0, club: state.clubId, from: S.year });
      if (st) { c.apps += st[0]; c.goals += st[1]; c.ast += st[2]; }
      c.seasons++; c.trophies += trophies || 0; c.to = S.year;
      const why = c.apps >= 150 ? `${c.apps} матчів` : c.goals >= 60 ? `${c.goals} голів` : c.seasons >= 5 && c.trophies >= 2 ? `${c.trophies} трофеї за ${c.seasons} сезонів` : r.mvp === p.id ? `найкращий гравець сезону ${S.year}/${String(S.year + 1).slice(2)}` : null;
      if (why && !a.hof.some((h) => h.pid === p.id)) {
        a.hof.push({ pid: p.id, name: p.name, club: state.clubId, why, y: S.year });
        news.push(`${p.name} увійшов до Зали слави клубу: ${why}.`);
      }
    }
    // рекорд бомбардира сезону
    const top = W.squad(state.clubId).map((p) => [p, (S.ps[p.id] || [0, 0])[1]]).sort((x, y) => y[1] - x[1])[0];
    if (top && top[1]) news.push(...record(state, 'scorer', top[1], { pid: top[0].id, name: top[0].name }, (v, o) => v > o.v, `Рекорд клубу: найкращий бомбардир за сезон — ${top[0].name}, ${top[1]} голів`));
    return { rec, news };
  }

  /** Оновити рекорд, якщо новий кращий. Повертає новини. */
  function record(state, key, v, extra, better, text) {
    const a = aw(state), R = (a.rec[state.clubId] = a.rec[state.clubId] || {});
    const o = R[key];
    if (!o || better(v, o)) { R[key] = { v, s: state.season.year, w: state.season.week, ...extra }; return o ? [text + ` (попередній — ${fmtRec(key, o)}).`] : []; }
    return [];
  }
  function fmtRec(key, o) {
    if (key === 'bigWin' || key === 'bigLoss' || key === 'goals') return `${o.score.join(':')} з ${o.opp}`;
    if (key === 'scorer') return `${o.name}, ${o.v}`;
    if (key === 'attendance') return `${o.v.toLocaleString('uk-UA')} глядачів`;
    return String(o.v);
  }
  /** Ваш матч (ліга, кубок): рекорди й серії. gf/ga — ваші голи. Повертає новини. */
  function match(W, state, gf, ga, oppId, comp) {
    const a = aw(state), R = (a.rec[state.clubId] = a.rec[state.clubId] || {}), news = [];
    const opp = W.club(oppId) ? W.club(oppId).name : '';
    const st = (R.cur = R.cur || { win: 0, unb: 0 });
    st.win = gf > ga ? st.win + 1 : 0; st.unb = gf >= ga ? st.unb + 1 : 0;
    if (gf > ga) news.push(...record(state, 'bigWin', gf - ga, { score: [gf, ga], opp, comp }, (v, o) => v > o.v || (v === o.v && gf > o.score[0]), `Рекорд клубу: найбільша перемога — ${gf}:${ga} з ${opp}`));
    if (ga > gf) record(state, 'bigLoss', ga - gf, { score: [gf, ga], opp, comp }, (v, o) => v > o.v, '');
    news.push(...record(state, 'goals', gf + ga, { score: [gf, ga], opp, comp }, (v, o) => v > o.v, `Рекорд клубу: найрезультативніший матч — ${gf}:${ga} з ${opp}`).filter(() => gf + ga >= 6));
    if (st.win >= 5) news.push(...record(state, 'winRun', st.win, {}, (v, o) => v > o.v, `Рекорд клубу: ${st.win} перемог поспіль`));
    if (st.unb >= 8) news.push(...record(state, 'unbeaten', st.unb, {}, (v, o) => v > o.v, `Рекорд клубу: ${st.unb} матчів без поразок`));
    return news;
  }
  /** Відвідуваність домашнього матчу (з js/club2 — гроші): рекорд стадіону. */
  const attendance = (state, n, opp) => record(state, 'attendance', n, { opp }, (v, o) => v > o.v, `Рекорд відвідуваності: ${n.toLocaleString('uk-UA')} глядачів на матчі з ${opp}`);

  /** Найкращі гравці клубу за всі сезони вашої кар'єри (разом із поточним). */
  function allTime(W, state) {
    const a = aw(state), S = state.season, out = new Map();
    for (const [id, c] of Object.entries(a.career)) if (c.club === state.clubId) out.set(id, { ...c });
    for (const p of W.squad(state.clubId)) {
      const st = S.ps[p.id]; if (!st) continue;
      const c = out.get(p.id) || { apps: 0, goals: 0, ast: 0, seasons: 0, trophies: 0 };
      out.set(p.id, { ...c, apps: c.apps + st[0], goals: c.goals + st[1], ast: c.ast + st[2], seasons: c.seasons + 1 });
    }
    return [...out.entries()].map(([id, c]) => ({ id, p: W.player(id), ...c })).filter((x) => x.p);
  }

  FM.awards = { MONTHS, MONTH_NOM, week, closeMonth, season, match, attendance, allTime, record, fmtRec, aw, pa: (state, pid) => pa(aw(state), pid) };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
