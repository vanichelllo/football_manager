// Повний набір атрибутів (як прийнято в жанрі: технічні, ментальні, фізичні, воротарські — 1–20).
// База має ~20 «основних» атрибутів (p.attrs) — вони розвиваються й редагуються. Решта виводиться з них
// детерміновано (з невеликим власним зсувом кожного гравця), тому росте й падає разом з основними й не потребує
// міграції збережень. Тут же — характер, робоча нога, вага, опис у медіа, радар і ключові атрибути ролі.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const hashN = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const cl = (v) => Math.max(1, Math.min(20, Math.round(v)));
  const off = (p, k, amp) => (hashN(String(p.id) + ':' + k) - 0.5) * 2 * amp;
  const A = (p, k, d = 10) => (p.attrs[k] != null ? p.attrs[k] : d);
  const H = (p, k) => (p.h && p.h[k] != null ? p.h[k] : 10);
  const age = (p) => (p.born ? (FM.ageAt ? FM.ageAt(p) : 2026 - Number(String(p.born).slice(0, 4))) : 25);

  // ключ → [назва, як вивести]. Основні (є в p.attrs) — без формули.
  const X = {
    // технічні
    cor: ['Кутові', (p) => (A(p, 'set') * 0.6 + A(p, 'cro') * 0.4)],
    cro: ['Навіси'], dri: ['Дриблінг'], fin: ['Завершення'],
    fir: ['Перший дотик', (p) => (A(p, 'tec') * 0.7 + A(p, 'dri') * 0.3)],
    fre: ['Штрафні удари', (p) => (A(p, 'set') * 0.75 + A(p, 'lon', A(p, 'fin')) * 0.25)],
    hea: ['Гра головою'], lon: ['Дальні удари'],
    lth: ['Довгі вкидання', (p) => (A(p, 'str') * 0.6 + 4 + (p.roles[0] === 'FB' ? 2 : 0))],
    mar: ['Опіка', (p) => (A(p, 'tac') * 0.5 + A(p, 'pos') * 0.5)],
    pas: ['Пас'],
    pen: ['Пенальті', (p) => (A(p, 'fin') * 0.55 + A(p, 'set') * 0.25 + A(p, 'dec') * 0.2)],
    tac: ['Відбір'], tec: ['Техніка'],
    // ментальні
    agg: ['Агресивність', (p) => (A(p, 'tac') * 0.4 + A(p, 'str') * 0.3 + 3)],
    ant: ['Передбачення', (p) => (A(p, 'pos') * 0.5 + A(p, 'dec') * 0.5)],
    bra: ['Хоробрість'],
    cmp: ['Холоднокровність', (p) => (A(p, 'dec') * 0.6 + H(p, 'big') * 0.4)],
    cnt: ['Концентрація', (p) => (A(p, 'pos') * 0.5 + H(p, 'con') * 0.5)],
    dec: ['Рішення'],
    det: ['Рішучість', (p) => (H(p, 'pro') * 0.5 + A(p, 'lea') * 0.3 + A(p, 'wor') * 0.2)],
    fla: ['Імпровізація', (p) => (A(p, 'dri') * 0.5 + A(p, 'tec') * 0.5)],
    lea: ['Лідерство'], otb: ['Відкривання'], pos: ['Вибір позиції'],
    tea: ['Командна гра', (p) => (A(p, 'wor') * 0.5 + A(p, 'pas') * 0.3 + A(p, 'dec') * 0.2)],
    vis: ['Бачення поля', (p) => (A(p, 'pas') * 0.55 + A(p, 'dec') * 0.45)],
    wor: ['Працездатність'],
    // фізичні
    acc: ['Прискорення', (p) => (A(p, 'pac') * 0.85 + 1.5 - Math.max(0, age(p) - 29) * 0.3)],
    agi: ['Спритність', (p) => (A(p, 'dri') * 0.4 + A(p, 'pac') * 0.4 + 2)],
    bal: ['Рівновага', (p) => (A(p, 'str') * 0.4 + A(p, 'dri') * 0.4 + 2)],
    jum: ['Стрибок', (p) => (A(p, 'hea') * 0.5 + ((p.height || 182) - 170) * 0.2 + 3)],
    nat: ['Природна форма', (p) => (A(p, 'sta') * 0.6 + H(p, 'pro') * 0.3 + 1)],
    pac: ['Швидкість'], sta: ['Витривалість'], str: ['Сила'],
    // воротарські
    aer: ['Гра на виході'],
    cmd: ['Керування штрафним', (p) => (A(p, 'aer') * 0.6 + A(p, 'lea') * 0.4)],
    com: ['Комунікація', (p) => (A(p, 'lea') * 0.6 + A(p, 'dec') * 0.4)],
    ecc: ['Ексцентричність', (p) => (4 + hashN(String(p.id) + 'ecc') * 10)],
    han: ['Гра руками'], kic: ['Вибивання'], one: ['Один на один'], ref: ['Реакція'],
    rus: ['Вихід з воріт', (p) => (A(p, 'one') * 0.6 + A(p, 'pac') * 0.4)],
    pun: ['Схильність відбивати', (p) => (20 - A(p, 'han')) * 0.6 + 4],
    thr: ['Вкидання рукою', (p) => (A(p, 'kic') * 0.6 + A(p, 'dec') * 0.4)],
  };
  const GROUPS = {
    outfield: [['Технічні', ['cor', 'cro', 'dri', 'fin', 'fir', 'fre', 'hea', 'lon', 'lth', 'mar', 'pas', 'pen', 'tac', 'tec']],
      ['Ментальні', ['agg', 'ant', 'bra', 'cmp', 'cnt', 'dec', 'det', 'fla', 'lea', 'otb', 'pos', 'tea', 'vis', 'wor']],
      ['Фізичні', ['acc', 'agi', 'bal', 'jum', 'nat', 'pac', 'sta', 'str']]],
    gk: [['Воротарські', ['aer', 'cmd', 'com', 'ecc', 'han', 'kic', 'one', 'ref', 'rus', 'pun', 'thr']],
      ['Ментальні', ['agg', 'ant', 'bra', 'cmp', 'cnt', 'dec', 'det', 'fla', 'lea', 'otb', 'pos', 'tea', 'vis', 'wor']],
      ['Фізичні', ['acc', 'agi', 'bal', 'jum', 'nat', 'pac', 'sta', 'str']]],
  };
  // які основні атрибути «тягнуть» похідний (для оцінки скаутом: діапазон, а не точне значення)
  /** Значення атрибута 1–20 (основний — як є, похідний — з основних + зсув гравця). */
  function attr(p, k) {
    if (p.attrs[k] != null) return p.attrs[k];
    const d = X[k];
    if (!d || !d[1]) return 10;
    return cl(d[1](p) + off(p, k, 1.6));
  }
  const label = (k) => (X[k] ? X[k][0] : (FM.ATTRS && FM.ATTRS[k]) || k);
  const groups = (p) => GROUPS[p.roles[0] === 'GK' ? 'gk' : 'outfield'];

  // ---------------- Ключові атрибути ролі (підсвічування в профілі) ----------------
  const KEY = {
    GK: ['aer', 'cmd', 'com', 'han', 'kic', 'one', 'ref', 'cnt', 'pos', 'agi'],
    CB: ['hea', 'mar', 'tac', 'pos', 'str', 'jum', 'ant', 'bra', 'cnt'],
    FB: ['mar', 'tac', 'cro', 'pac', 'sta', 'wor', 'pos', 'ant', 'tea'],
    DM: ['tac', 'mar', 'pas', 'pos', 'ant', 'dec', 'tea', 'wor', 'cnt'],
    CM: ['pas', 'fir', 'tec', 'dec', 'vis', 'tea', 'wor', 'sta', 'otb'],
    AM: ['pas', 'fir', 'tec', 'dri', 'vis', 'fla', 'dec', 'otb', 'agi'],
    W: ['cro', 'dri', 'fir', 'tec', 'pac', 'acc', 'agi', 'otb', 'fla'],
    ST: ['fin', 'fir', 'hea', 'cmp', 'otb', 'ant', 'acc', 'pac', 'str'],
  };
  const keyAttrs = (role) => new Set(KEY[role] || []);

  // ---------------- Радар: вісім складових ----------------
  const RADAR = [
    ['Оборона', ['tac', 'mar', 'pos', 'ant']], ['Фізика', ['str', 'sta', 'bal', 'nat']], ['Швидкість', ['pac', 'acc', 'agi']],
    ['Креативність', ['vis', 'pas', 'fla', 'dec']], ['Атака', ['fin', 'otb', 'cmp', 'lon']], ['Техніка', ['tec', 'fir', 'dri', 'cro']],
    ['Повітря', ['hea', 'jum', 'bra']], ['Психологія', ['det', 'cnt', 'lea', 'tea', 'wor']],
  ];
  const RADAR_GK = [
    ['Рефлекси', ['ref', 'agi']], ['Гра руками', ['han', 'cmd']], ['Повітря', ['aer', 'jum', 'cmd']], ['Один на один', ['one', 'rus']],
    ['Розподіл', ['kic', 'thr', 'pas']], ['Психологія', ['cnt', 'cmp', 'det', 'lea']], ['Швидкість', ['acc', 'pac']], ['Фізика', ['str', 'bal', 'nat']],
  ];
  function radar(p) {
    const list = p.roles[0] === 'GK' ? RADAR_GK : RADAR;
    return list.map(([name, ks]) => [name, ks.reduce((s, k) => s + attr(p, k), 0) / ks.length]);
  }

  // ---------------- Особисте ----------------
  /** Робоча нога: ліві фланги частіше ліві; рідко — обидві. */
  function foot(p) {
    if (p.foot) return p.foot;
    const r = hashN(String(p.id) + 'foot');
    const leftSide = p.side === 'L';
    if (r < 0.05) return 'both';
    return r < (leftSide ? 0.72 : 0.2) ? 'left' : 'right';
  }
  const FOOT = { left: 'Ліва', right: 'Права', both: 'Обидві' };
  const weight = (p) => p.weight || Math.round(((p.height || 180) - 100) * 0.92 + (A(p, 'str') - 10) * 0.8 + off(p, 'kg', 3));

  /** Характер одним-двома словами (з прихованих рис і лідерства). */
  function personality(p) {
    const pro = H(p, 'pro'), big = H(p, 'big'), con = H(p, 'con'), lea = A(p, 'lea'), det = attr(p, 'det'), ada = H(p, 'ada');
    if (lea >= 16 && pro >= 15) return 'Взірцевий лідер';
    if (pro >= 17) return 'Справжній професіонал';
    if (lea >= 16) return 'Природжений лідер';
    if (det >= 16 && big >= 15) return 'Твердий у рішеннях';
    if (big >= 16) return 'Любить великі матчі';
    if (pro >= 14 && det >= 13) return 'Наполегливий';
    if (pro <= 6) return 'Легковажний';
    if (con <= 6) return 'Непостійний';
    if (big <= 6) return 'Губиться під тиском';
    if (ada <= 6) return 'Важко звикає до нового';
    if (attr(p, 'agg') >= 16) return 'Темпераментний';
    return 'Урівноважений';
  }
  /** Опис у медіа: як про гравця пишуть (рівень + роль + вік). */
  function media(p) {
    const ca = p.ca || 100, a = age(p), r = p.roles[0];
    const ROLE = { GK: 'воротар', CB: 'центральний захисник', FB: 'крайній захисник', DM: 'опорник', CM: 'центральний півзахисник', AM: 'атакувальний півзахисник', W: 'вінгер', ST: 'нападник' };
    const lvl = ca >= 170 ? 'Зірковий' : ca >= 150 ? 'Чудовий' : ca >= 130 ? 'Надійний' : ca >= 110 ? 'Корисний' : 'Скромний';
    if (a <= 20 && (p.pa || 0) >= ca + 25) return `Перспективний молодий ${ROLE[r] || 'гравець'}`;
    if (a >= 33) return `Досвідчений ${ROLE[r] || 'гравець'}`;
    return `${lvl} ${ROLE[r] || 'гравець'}`;
  }

  // ---------------- Ігрова форма (ритм) ----------------
  /** Ігрова форма 0–100: росте від матчів, падає без них (окремо від свіжості). Без даних — 90. */
  const sharp = (p) => (p.sharp != null ? p.sharp : 90);
  /** Після матчу: хвилини на полі піднімають форму. */
  function playSharp(p, minutes) { p.sharp = Math.min(100, sharp(p) + Math.max(0, minutes) / 90 * 14); }
  /** Тиждень без матчів: форма падає (травмовані — швидше). */
  function weekSharp(p, played) { if (!played) p.sharp = Math.max(p.injury ? 30 : 45, sharp(p) - (p.injury ? 9 : 4)); }
  /** Множник гри від ігрової форми: 100 → 1, 50 → 0,95. */
  const sharpK = (p) => 0.9 + 0.1 * sharp(p) / 100;

  FM.attrs = { X, GROUPS, attr, label, groups, keyAttrs, radar, foot, FOOT, weight, personality, media, sharp, playSharp, weekSharp, sharpK };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
