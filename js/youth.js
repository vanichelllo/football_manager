// Розширення 5: молодіжна команда (U-21). Гравці до 21 року грають щотижня в молодіжній лізі — ростуть швидше,
// ніж сидячи на лаві основи; в основі (і в заявці на матч) їх немає, доки не підвищите.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const MAX_AGE = 21;
  const set = (state) => new Set(state.u21 || []);
  const eligible = (W, p) => (W.age(p) ?? 30) <= MAX_AGE;

  /** Склад U-21: лише свої гравці до 21 року (вибулі й старші — повертаються в основу). */
  function squad(W, state) {
    state.u21 = (state.u21 || []).filter((id) => { const p = W.player(id); return p && p.club === state.clubId && eligible(W, p); });
    return state.u21.map((id) => W.player(id));
  }
  function toU21(W, state, id) {
    const p = W.player(id);
    if (!p || p.club !== state.clubId || !eligible(W, p)) return false;
    if (!(state.u21 || []).includes(id)) state.u21 = (state.u21 || []).concat([id]);
    // з тактики основи — геть
    for (const t of [state.tactics, ...Object.values(state.tacticSets || {})]) if (t && t.ids) t.ids = t.ids.map((x) => (x === id ? null : x));
    return true;
  }
  const promote = (state, id) => { state.u21 = (state.u21 || []).filter((x) => x !== id); };

  /** Тиждень молодіжної ліги: матч проти «U-21» клубу ліги, голи, статистика гравців. */
  function week(W, state) {
    const S = state.season, sq = squad(W, state).filter((p) => !p.injury);
    if (sq.length < 7 || S.week >= 38) return null;
    const R = FM.rng(`u21-${S.seed}-${S.year}-${S.week}`);
    const league = W.clubsOf(W.club(state.clubId).league).filter((c) => c.id !== state.clubId);
    const opp = league[(S.week * 7 + S.year) % league.length];
    const my = sq.slice().sort((a, b) => b.ca - a.ca).slice(0, 11);
    const str = my.reduce((s, p) => s + p.ca, 0) / my.length + (11 - my.length) * -4;
    const oppStr = W.clubLevel(opp.id) * 0.62 + R.range(-8, 8); // молодіжні склади — ~60% рівня основи
    const lam = (a, b) => Math.max(0.3, 1.35 * Math.pow(a / b, 2.2));
    const pois = (l) => { let k = 0, p = Math.exp(-l), s = p; const u = R.next(); while (u > s && k < 9) { k++; p *= l / k; s += p; } return k; };
    const gf = pois(lam(str, oppStr)), ga = pois(lam(oppStr, str));
    const st = (state.u21Stats = state.u21Stats || {});
    const scorers = [];
    for (let g = 0; g < gf; g++) {
      const p = R.weighted(my, (x) => ({ ST: 4, W: 2.5, AM: 2.5, CM: 1.2, DM: 0.5, FB: 0.5, CB: 0.4, GK: 0 }[x.roles[0]] || 0.5) * (x.attrs.fin || 8));
      scorers.push(p);
    }
    for (const p of my) {
      const s = (st[p.id] = st[p.id] || [0, 0, 0]); // ігри, голи, сума оцінок ×10
      s[0]++; s[1] += scorers.filter((x) => x === p).length;
      s[2] += Math.round((6.4 + Math.sign(gf - ga) * 0.3 + scorers.filter((x) => x === p).length * 0.8 + (p.ca - str) * 0.03 + R.range(-0.5, 0.5)) * 10);
      p.u21Week = S.year * 100 + S.week; // грав цього тижня — розвиток швидший
    }
    const r = { w: S.week, opp: opp.id, score: [gf, ga], scorers: scorers.map((p) => p.id) };
    state.u21Results = (state.u21Results || []).concat([r]).slice(-40);
    return r;
  }
  /** Множник розвитку: зіграв за U-21 цього тижня — ніби мав ігровий час. */
  const growth = (state, p) => (p.u21Week === state.season.year * 100 + state.season.week || p.u21Week === state.season.year * 100 + state.season.week - 1 ? 1.8 : 1);
  /** Нові юнаки академії — одразу в U-21. */
  function intake(W, state, ids) { for (const id of ids) toU21(W, state, id); }

  FM.youth = { MAX_AGE, set, eligible, squad, toU21, promote, week, growth, intake };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
