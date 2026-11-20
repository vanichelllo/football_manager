// Розширення 6: агенти гравців з характером. Жадібний агент піднімає зарплату й комісію; напористий
// сам «пропонує» клієнта іншим клубам — гравець нервує, а пропозицій стає більше.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const FIRST = ['Хорхе', 'Міно', 'Педро', 'Джонатан', 'Фабіо', 'Рафаела', 'Ахмед', 'Ганс-Петер', 'Мартін', 'Лука', 'Ігор', 'Вадим', 'Карлос', 'Себастьян', 'Ніколас', 'Олександра',
    'Бруно', 'Казім', 'Андреа', 'Томас', 'Юліан', 'Даріо', 'Пол', 'Сергій'];
  const LAST = ['Мендеш', 'Барнетт', 'Ріола', 'Пімента', 'Зарате', 'Кастро', 'Стоун', 'Шмідт', 'Ковальов', 'Ферреро', 'Бакі', 'Джордан', 'Росетті', 'Дюпон', 'Ван Беркел',
    'Новак', 'Озтюрк', 'Савчук', 'Альварес', 'Мюллер', 'Ліндквіст', 'Ортега', 'Сміт', 'Гарсія'];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const r01 = (s) => hash(s) / 4294967296;

  // 40 агентів: жадібність 0.85–1.35 (множник вимог), напористість 0–1
  const AGENTS = Array.from({ length: 40 }, (_, i) => {
    const k = 'agent' + i;
    const greed = Math.round((0.85 + Math.pow(r01(k + 'g'), 1.5) * 0.5) * 100) / 100;
    const push = Math.round(r01(k + 'p') * 100) / 100;
    return { id: i, name: `${FIRST[hash(k + 'f') % FIRST.length]} ${LAST[hash(k + 'l') % LAST.length]}`, greed, push };
  });
  // у великих гравців — частіше «суперагенти» (перші 6: найжадібніші й найнапористіші)
  for (const a of AGENTS.slice(0, 6)) { a.greed = Math.max(a.greed, 1.25); a.push = Math.max(a.push, 0.75); a.super = true; }

  /** Агент гравця: зірки — частіше в суперагентів. */
  function of(p) {
    if (!p) return null;
    if (p.agent != null && AGENTS[p.agent]) return AGENTS[p.agent];
    const h = hash(p.id + ':agent');
    const i = p.ca >= 150 && h % 3 === 0 ? h % 6 : 6 + (h % (AGENTS.length - 6));
    return AGENTS[i];
  }
  const label = (a) => (a.greed >= 1.2 ? 'жадібний' : a.greed <= 0.95 ? 'поступливий' : 'звичайний') + (a.push >= 0.7 ? ', напористий' : '');
  /** Множник вимог гравця (зарплата, продовження). */
  const greed = (p) => { const a = of(p); return a ? 0.92 + (a.greed - 0.85) * 0.6 : 1; };
  /** Комісія агента: базова × жадібність. */
  const feeMult = (p) => { const a = of(p); return a ? a.greed : 1; };

  /** Тиждень: напористі агенти «пропонують» ваших гравців у формі з контрактом до 2 років. */
  function week(W, state) {
    const S = state.season, R = FM.rng(`agents-${S.seed}-${S.year}-${S.week}`), out = [];
    for (const p of W.squad(state.clubId)) {
      const a = of(p);
      if (!a || a.push < 0.6 || p.loan) continue;
      const years = (p.contract || S.year + 3) - S.year - 1;
      const f = p.form && p.form.length >= 3 ? p.form.reduce((x, y) => x + y, 0) / p.form.length : 6.5;
      if (years > 1 || f < 6.9 || !R.chance(0.04 * a.push)) continue;
      const lvl = W.clubLevel(state.clubId);
      const cands = [...W.clubs.values()].filter((c) => c.id !== state.clubId && W.clubLevel(c.id) > lvl && c.balance > p.value);
      if (!cands.length) continue;
      const c = R.pick(cands);
      p.interest = { club: c.id, until: S.year * 100 + S.week + 10 };
      p.morale = Math.max(0, FM.morale.get(p) - 4);
      out.push(`Агент ${a.name} пропонує ${p.name} клубу ${c.name}: контракт закінчується, гравець нервує. Продовжте контракт або чекайте пропозицій.`);
    }
    return out;
  }

  FM.agents = { AGENTS, of, label, greed, feeMult, week };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
