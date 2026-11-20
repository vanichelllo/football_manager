// Місії тижня: 1–3 невеликі цілі перед матчами тижня з нагородами (довіра правління, фанати, гроші, настрій).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const r2 = (x) => Math.round(x * 100) / 100;

  // check(ctx) — після тижня: ctx = { res: [{ gf, ga, opp, derby, scorers: [ids] }], W, state }
  const KINDS = {
    win: { text: 'Виграти матч ліги цього тижня', reward: 'довіра +3', ok: (c) => c.res.some((r) => r.gf > r.ga), give: (c) => conf(c, 3) },
    clean: { text: 'Не пропустити жодного м’яча', reward: 'фанати +4', ok: (c) => c.res.length && c.res.every((r) => r.ga === 0), give: (c) => fans(c, 4) },
    three: { text: 'Забити щонайменше 3 голи', reward: 'гроші', ok: (c) => c.res.some((r) => r.gf >= 3), give: (c) => money(c, 0.5) },
    derby: { text: 'Виграти дербі', reward: 'довіра +6, фанати +8', ok: (c) => c.res.some((r) => r.derby && r.gf > r.ga), give: (c) => { conf(c, 6); fans(c, 8); } },
    youth: { text: 'Гравець до 21 року забиває', reward: 'настрій молоді +5', ok: (c) => c.res.some((r) => r.scorers.some((id) => (c.W.age(c.W.player(id)) ?? 30) <= 21)),
      give: (c) => { for (const p of c.W.squad(c.state.clubId)) if ((c.W.age(p) ?? 30) <= 21) p.morale = Math.min(100, (p.morale ?? 60) + 5); } },
    underdog: { text: 'Не програти сильнішому суперникові', reward: 'репутація +2', ok: (c) => c.res.some((r) => r.strong && r.gf >= r.ga), give: (c) => { if (c.state.board) c.state.board.rep = Math.min(100, c.state.board.rep + 2); } },
  };
  function conf(c, d) { if (c.state.board) c.state.board.conf = Math.min(100, c.state.board.conf + d); }
  function fans(c, d) { const f = FM.club.fans(c.W, c.state.clubId); f.mood = Math.min(100, f.mood + d); }
  function money(c, k) { const cl = c.W.club(c.state.clubId), add = r2(Math.max(0.05, (cl.income0 || 0.02) * k * 4)); cl.balance = r2(cl.balance + add); if (FM.budget) FM.budget.get(c.W, c.state).transfer = r2(FM.budget.get(c.W, c.state).transfer + add); c.money = add; }

  /** Місії на поточний тиждень (якщо у вашої команди є матч ліги). Створюються раз на тиждень. */
  function current(W, state) {
    const S = state.season, key = `${S.year}-${S.week}`;
    if (state.missions && state.missions.key === key) return state.missions;
    const mine = S.fixtures.filter((f) => f.w === S.week && (f.h === state.clubId || f.a === state.clubId));
    if (!mine.length) { state.missions = { key, list: [] }; return state.missions; }
    const R = FM.rng(`mis-${S.seed}-${key}-${state.clubId}`);
    const opp = (f) => (f.h === state.clubId ? f.a : f.h);
    const derby = mine.some((f) => FM.rivals && FM.rivals.isDerby(W, state.clubId, opp(f)));
    const strong = mine.some((f) => W.clubLevel(opp(f)) > W.clubLevel(state.clubId) + 4);
    const pool = ['win', 'clean', 'three', 'youth'].concat(strong ? ['underdog'] : []);
    const list = derby ? ['derby'] : [];
    while (list.length < 2 && pool.length) list.push(pool.splice(R.int(pool.length), 1)[0]);
    state.missions = { key, list: list.map((k) => ({ k, text: KINDS[k].text, reward: KINDS[k].reward, state: 'open' })) };
    return state.missions;
  }
  /** Після тижня: перевірити місії минулого тижня. Повертає новини. */
  function check(W, state) {
    const S = state.season, M = state.missions;
    if (!M || M.key !== `${S.year}-${S.week - 1}` || !M.list.length) return [];
    const res = S.fixtures.filter((f) => f.w === S.week - 1 && f.s && (f.h === state.clubId || f.a === state.clubId)).map((f) => {
      const home = f.h === state.clubId, opp = home ? f.a : f.h;
      return { gf: home ? f.s[0] : f.s[1], ga: home ? f.s[1] : f.s[0], opp, derby: !!(FM.rivals && FM.rivals.isDerby(W, state.clubId, opp)), strong: W.clubLevel(opp) > W.clubLevel(state.clubId) + 4,
        scorers: (f.sc || []).filter(([t]) => t === (home ? 0 : 1)).map(([, id]) => id) };
    });
    const c = { W, state, res }, news = [];
    for (const m of M.list) {
      if (m.state !== 'open') continue;
      if (KINDS[m.k].ok(c)) { m.state = 'done'; KINDS[m.k].give(c); news.push(`🎯 Місію виконано: «${m.text}». Нагорода: ${m.reward}${c.money ? ` (${FM.market.fmtM(c.money)})` : ''}.`); state.missionsDone = (state.missionsDone || 0) + 1; }
      else m.state = 'failed';
    }
    return news;
  }

  FM.missions = { KINDS, current, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
