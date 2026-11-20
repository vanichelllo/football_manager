// Розширення 8: медіа й уболівальники — заголовки газет, соцмережі клубу, тиск через погані результати.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const PAPERS = ['Спортивна газета', 'Футбольний вісник', 'Трибуна', 'Гол!', 'Арена Daily'];
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  // назви клубів — у називному відмінку, тож шаблони побудовано без відмінювання
  const H = {
    bigWin: ['Розгром! {club} — {opp} {score}', 'Голопад {score}: {club} не залишив шансів суперникові ({opp})', '{club} у чудовій формі: {score} проти команди {opp}'],
    win: ['{club} — {opp}: перемога {score}', 'Три очки в скарбничку: {club} — {opp} {score}', '{club} перемагає й піднімається на {pos}-те місце'],
    draw: ['{club} — {opp}: нічия {score}', 'Нічия {score}: {club} втрачає очки', 'Бойова нічия {score} у матчі {club} — {opp}'],
    loss: ['{club} — {opp}: поразка {score}', 'Невдача: {club} — {opp} {score}', 'Питання до тренера після поразки {score}'],
    bigLoss: ['Катастрофа! {club} — {opp} {score}', 'Ганьба {score}: уболівальники в шоці', '{coach}: тиск зростає після {score}'],
    streakW: ['{n} перемог поспіль: {club} неможливо зупинити', 'Серія триває: {club} виграє вже {n} матчів поспіль'],
    streakL: ['Криза: {club} програє {n}-й матч поспіль', '{club} у штопорі — {n} поразок поспіль. Чи довго ще протримається тренер?'],
    leader: ['{league}: на першому місці — {lead}', 'Новий лідер — {lead} ({league})'],
    star: ['Гравець тижня за версією «{paper}» — {player}', 'Гравець тижня: {player}, оцінка {rating}'],
  };
  const POSTS = {
    happy: ['Яка команда! 🔥 #{tag}', 'Цей сезон буде нашим 💪', 'Тренер знає, що робить 👏', 'Купив квиток на наступний матч! #{tag}', 'Горджуся нашою командою ❤️ #{tag}'],
    calm: ['Нормально, але можна краще', 'Чекаємо підсилення в центрі поля', 'Головне — результат, гра прийде', 'Хто на виїзд? 🚌'],
    angry: ['Скільки можна?! #{tag}Геть', 'Повертайте гроші за квитки 😡', 'Без змін нічого не буде', 'Ганьба. Просто ганьба.', 'Правління, ви це бачите? #{tag}Геть'],
  };
  const tag = (c) => (c.code || c.nameEn || 'FC').replace(/[^A-Za-z]/g, '').slice(0, 10) || 'FC';

  /** Тиск медіа 0–100: настрій фанатів, серія результатів, довіра правління. */
  function pressure(W, state) {
    const fans = FM.club ? FM.club.fans(W, state.clubId).mood : 60;
    const rec = FM.dressing ? FM.dressing.recent(state.season, state.clubId, 5) : [];
    const sum = rec.reduce((a, b) => a + b, 0);
    const conf = state.board ? state.board.conf : 60;
    return Math.round(Math.max(0, Math.min(100, 50 - (fans - 60) * 0.6 - sum * 6 - (conf - 60) * 0.4)));
  }

  /** Тиждень: заголовки й пости за подіями туру. name — функція назви клубу. */
  function week(W, state, opts = {}) {
    const S = state.season, R = FM.rng(`media-${S.seed}-${S.year}-${S.week}`);
    const cname = opts.club || ((c) => c.name), pname = opts.player || ((p) => p.name);
    const me = W.club(state.clubId);
    const m = (state.media = state.media || { press: [], posts: [], followers: Math.round(5000 + W.clubLevel(me.id) ** 2 * 3) });
    const heads = [];
    const paper = () => R.pick(PAPERS);
    const f = FM.season.fixturesOfWeek(S, S.week - 1).find((x) => x.s && (x.h === me.id || x.a === me.id));
    const t = FM.season.table(S, W, me.league), pos = t.findIndex((r) => r.id === me.id) + 1;
    const v = { club: cname(me), coach: state.manager, pos, league: W.league(me.league).name };
    if (f) {
      const home = f.h === me.id, sc = home ? f.s : [f.s[1], f.s[0]], d = sc[0] - sc[1];
      Object.assign(v, { opp: cname(W.club(home ? f.a : f.h)), score: sc.join(':') });
      const k = d >= 3 ? 'bigWin' : d > 0 ? 'win' : d === 0 ? 'draw' : d <= -3 ? 'bigLoss' : 'loss';
      heads.push({ paper: paper(), text: fill(R.pick(H[k]), v), tone: d > 0 ? 1 : d < 0 ? -1 : 0 });
      const rec = FM.dressing ? FM.dressing.recent(S, me.id, 8) : [];
      let n = 0; const first = rec[0];
      for (const r of rec) { if (r === first && r !== 0) n++; else break; }
      if (n >= 3) heads.push({ paper: paper(), text: fill(R.pick(first > 0 ? H.streakW : H.streakL), { ...v, n }), tone: first });
      // соцмережі: настрій фанатів
      const mood = FM.club ? FM.club.fans(W, me.id).mood : 60;
      const kind = mood >= 65 && d >= 0 ? 'happy' : mood < 40 || d <= -2 ? 'angry' : 'calm';
      for (let i = 0; i < 2 + R.int(2); i++) m.posts.push({ w: S.week, s: S.year, text: fill(R.pick(POSTS[kind]), { tag: tag(me), club: cname(me) }), kind, likes: Math.round(m.followers * R.range(0.001, 0.02)) });
      m.followers = Math.max(1000, Math.round(m.followers * (1 + (d > 0 ? 0.004 : d < 0 ? -0.002 : 0.001) + (pos <= 3 ? 0.002 : 0))));
    }
    if (t[0] && t[0].p && S.week % 5 === 0) heads.push({ paper: paper(), text: fill(R.pick(H.leader), { lead: cname(W.club(t[0].id)), league: v.league }), tone: 0 });
    // найкращий гравець тижня серед ваших (якщо оцінка висока)
    const best = W.squad(me.id).filter((p) => p.form && p.form.length).sort((a, b) => b.form[b.form.length - 1] - a.form[a.form.length - 1])[0];
    if (best && f && best.form[best.form.length - 1] >= 8.3) heads.push({ paper: paper(), text: fill(R.pick(H.star), { player: pname(best), rating: String(best.form[best.form.length - 1]).replace('.', ','), paper: paper() }), tone: 1 });
    for (const h of heads) m.press.push({ ...h, w: S.week, s: S.year });
    m.press = m.press.slice(-40); m.posts = m.posts.slice(-40);
    // тиск: фанати вимагають відставки
    const pr = pressure(W, state);
    m.pressure = pr;
    const out = [];
    if (pr >= 80 && R.chance(0.5)) {
      if (state.board) state.board.conf = Math.max(0, state.board.conf - 1.5);
      const h = { paper: paper(), text: `Фанати вимагають відставки головного тренера: ${v.club} у кризі`, tone: -1, w: S.week, s: S.year };
      m.press.push(h); out.push(h.text);
    }
    return out;
  }

  FM.media = { PAPERS, pressure, week };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
