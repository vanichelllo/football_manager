// Мораль: настрій гравців (0–100), статус у складі, ігровий час, результати, промови в перерві,
// прес-конференції, вимоги гравців.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const DEFAULT = 62;
  const get = (p) => (p.morale == null ? DEFAULT : p.morale);
  /** Як мораль впливає на гру: 0 → ×0,94, 60 → ×1,0, 100 → ×1,05. */
  const factor = (p) => 1 + (get(p) - 60) / 100 * (get(p) >= 60 ? 0.12 : 0.1);

  const LEVELS = [[85, 'Чудовий'], [68, 'Добрий'], [45, 'Нормальний'], [25, 'Поганий'], [0, 'Жахливий']];
  const label = (p) => LEVELS.find(([lo]) => get(p) >= lo)[1];

  /** Статус у складі за рівнем: лідер (топ-11), ротація (12–16), запасний, молодь. */
  function status(W, p) {
    const sq = W.squad(p.club).sort((a, b) => b.ca - a.ca);
    const r = sq.findIndex((x) => x.id === p.id);
    if (r < 11) return 'key';
    if (r < 16) return 'rotation';
    return (W.age(p) ?? 24) <= 20 ? 'youth' : 'backup';
  }
  const STATUS = { key: 'Лідер', rotation: 'Ротація', backup: 'Запасний', youth: 'Молодий гравець' };
  const EXPECT = { key: 0.7, rotation: 0.35, backup: 0.1, youth: 0.05 }; // частка зіграних матчів, якої гравець чекає

  /**
   * Тиждень: мораль гравців усіх клубів (для людини — детально, з причинами).
   * Повертає список подій для новин: [{ p, text }].
   */
  function weekly(W, state) {
    const S = state.season;
    const w = S.week - 1;
    const fx = FM.season.fixturesOfWeek(S, w);
    const res = {};
    for (const f of fx) if (f.s) {
      res[f.h] = Math.sign(f.s[0] - f.s[1]);
      res[f.a] = Math.sign(f.s[1] - f.s[0]);
    }
    const games = {};
    for (const f of S.fixtures) if (f.s) { games[f.h] = (games[f.h] || 0) + 1; games[f.a] = (games[f.a] || 0) + 1; }
    const events = [];
    for (const c of W.clubs.values()) {
      const mine = c.id === state.clubId;
      for (const id of c.players) {
        const p = W.player(id);
        let m = get(p);
        const why = [];
        let teamK = 1; // наскільки результати команди радують гравця
        if (mine) {
          const st = status(W, p);
          const g = games[c.id] || 0;
          const apps = (S.ps[id] && S.ps[id][0]) || 0;
          if (g >= 4 && !p.injury) {
            const share = apps / g;
            if (share < EXPECT[st] - 0.15) { m -= st === 'key' ? 5 : 2; teamK = 0.4; why.push('мало грає'); }
            else if (share >= EXPECT[st]) m += 0.6;
          }
          const yearsLeft = (p.contract || S.year + 2) - S.year - 1;
          if (yearsLeft <= 0 && S.week >= 20 && st === 'key') { m -= 1; why.push('контракт закінчується'); }
          if (p.listed && st !== 'backup') { m -= 0.8; why.push('у трансфер-листі'); }
          if (p.lastRating != null) { if (p.lastRating >= 7.5) m += 2; else if (p.lastRating < 6) m -= 1.5; }
        }
        if (res[c.id] != null) { m += res[c.id] * 3 * teamK; if (res[c.id]) why.push(res[c.id] > 0 ? 'перемога' : 'поразка'); }
        m += (DEFAULT - m) * 0.06; // з часом настрій вирівнюється
        p.morale = Math.round(Math.max(0, Math.min(100, m)) * 10) / 10;
        if (mine) {
          p.mr = why.filter(Boolean)[0] || p.mr || null;
          // довго незадоволений лідер просить продати його
          p.lowWeeks = p.morale < 25 ? (p.lowWeeks || 0) + 1 : 0;
          if (p.lowWeeks >= 3 && !p.wantsOut && status(W, p) !== 'youth') {
            p.wantsOut = true;
            events.push({ p, text: `${p.name} незадоволений (${p.mr || 'настрій'}) і просить виставити його на трансфер.` });
          }
          if (p.wantsOut && p.morale > 50) { delete p.wantsOut; events.push({ p, text: `${p.name} більше не просить продажу.` }); }
        }
      }
    }
    return events;
  }

  /** Записати оцінки за матч (для моралі наступного тижня). */
  function recordRatings(m) {
    for (const r of m.ratings) r.player.lastRating = r.rating;
  }

  // ---------------- Промова в перерві ----------------
  const TALKS = {
    praise: { label: 'Похвалити', hint: 'Добре, коли ведете або грає рівно; якщо програєте — розслабить.' },
    calm: { label: 'Спокійно підбадьорити', hint: 'Безпечний варіант: невеликий плюс за будь-якого рахунку.' },
    demand: { label: 'Вимагати більшого', hint: 'Мобілізує, коли програєте; якщо ведете — роздратує.' },
  };
  /** Ефект промови: множник сили на другий тайм і зміна моралі. diff — різниця голів для команди (+ веде). */
  function talkEffect(kind, diff, R) {
    const luck = R ? R.range(-0.01, 0.01) : 0;
    let boost = 1, mor = 0, text;
    if (kind === 'praise') {
      if (diff >= 0) { boost = 1.03; mor = 3; text = 'Гравці надихнулися похвалою.'; } else { boost = 0.98; mor = -1; text = 'Похвала при поразці розслабила команду.'; }
    } else if (kind === 'demand') {
      if (diff < 0) { boost = 1.045; mor = 1; text = 'Гравці вийшли злими й зібраними.'; } else if (diff === 0) { boost = 1.015; mor = -1; text = 'Команда сприйняла вимоги стримано.'; } else { boost = 0.98; mor = -3; text = 'Гравці роздратовані: вони ж ведуть у рахунку.'; }
    } else { boost = 1.015; mor = 1; text = 'Гравці спокійно сприйняли слова тренера.'; }
    return { boost: boost + luck, morale: mor, text };
  }

  // ---------------- Прес-конференція ----------------
  const PRESS = [
    { q: 'Журналісти питають: чи вважаєте ви свою команду фаворитом цього матчу?', a: [
      ['Так, ми сильніші й граємо на перемогу.', { morale: 2, conf: 0.5, risky: true }],
      ['Поважаємо суперника, усе вирішить поле.', { morale: 0.5, conf: 0 }],
      ['Фаворит — суперник, тиск на ньому.', { morale: -1, conf: -0.5 }]] },
    { q: 'Як ви оцінюєте форму команди останніми тижнями?', a: [
      ['Задоволений: хлопці працюють чудово.', { morale: 2, conf: 0 }],
      ['Є над чим працювати, але рухаємося правильно.', { morale: 0.5, conf: 0.5 }],
      ['Дехто грає нижче свого рівня — будуть зміни.', { morale: -1.5, conf: 1 }]] },
    { q: 'Чи плануєте ви підсилення в найближче трансферне вікно?', a: [
      ['Я довіряю цьому складу.', { morale: 2, conf: -0.5 }],
      ['Якщо з’явиться можливість — так.', { morale: 0, conf: 0.5 }],
      ['Без підсилення цілі не досягти.', { morale: -2, conf: 1 }]] },
    { q: 'Уболівальники критикують стиль гри. Що відповісте?', a: [
      ['Результат важливіший за красу.', { morale: 0.5, conf: 0.5 }],
      ['Ми працюємо над атакою, буде краще.', { morale: 1, conf: 0 }],
      ['Критика несправедлива.', { morale: 1, conf: -1 }]] },
  ];
  function pressQuestion(S) { return PRESS[(S.week * 7 + S.year) % PRESS.length]; }
  /** Відповідь на прес-конференції: мораль усієї команди й довіра правління. */
  function answerPress(W, state, i) {
    const q = pressQuestion(state.season);
    const eff = q.a[i][1];
    for (const id of W.club(state.clubId).players) { const p = W.player(id); p.morale = Math.max(0, Math.min(100, get(p) + eff.morale)); }
    if (state.board) state.board.conf = Math.max(0, Math.min(100, state.board.conf + eff.conf));
    state.pressDone = `${state.season.year}-${state.season.week}`;
    return eff;
  }

  const teamMorale = (W, clubId) => {
    const ids = W.club(clubId).players;
    return ids.reduce((s, id) => s + get(W.player(id)), 0) / Math.max(1, ids.length);
  };

  FM.morale = { get, factor, label, status, STATUS, weekly, recordRatings, TALKS, talkEffect, PRESS, pressQuestion, answerPress, teamMorale };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
