// Звіт про матч у вигляді газетної статті: заголовок, вступ (стадіон, глядачі, погода), перебіг рахунку,
// вилучення, оцінка за статистикою (володіння, удари, очікувані голи), найкращий гравець, слова тренера.
// Дієслова — у теперішньому часі, назви клубів — у називному відмінку, щоб текст був граматичним для будь-якої назви.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const f2 = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const fint = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  const ord = (min) => `${min}-й хвилині`;
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const WEATHER = { sun: 'Світило сонце.', cloud: 'Було хмарно.', rain: 'Йшов дощ, поле було мокре.', snow: 'Падав сніг.', wind: 'Дув сильний вітер.', heat: 'Стояла спека.' };

  /**
   * m — результат матчу (FM.match.create(...).result()).
   * ctx: { home, away — назви; name(p); stadium; att — глядачів; comp — турнір; myK — ваша команда (0/1) або null; manager }
   * Повертає { head, lead, paras: [], facts: [[назва, значення]], short }.
   */
  function article(m, ctx) {
    const N = [ctx.home, ctx.away], name = ctx.name || ((p) => p.name);
    const [g0, g1] = m.score, diff = g0 - g1;
    const pick = (arr, salt = '') => arr[hash(`${N.join('-')}-${g0}:${g1}-${salt}`) % arr.length];
    const goals = m.events.filter((e) => e.type === 'goal' && typeof e.min === 'number');
    const reds = m.events.filter((e) => e.type === 'red' && typeof e.min === 'number');
    const so = m.shootout;
    const W = diff > 0 ? 0 : diff < 0 ? 1 : so ? so.winner : null, L = W == null ? null : 1 - W;
    // хто вів у рахунку: чи був камбек
    let trailed = false, lead = [0, 0];
    for (const e of goals) { lead = e.score; if (W != null && lead[W] < lead[L]) trailed = true; }
    const last = goals[goals.length - 1];
    const late = W != null && !so && last && last.min >= 85 && last.team === W && Math.abs(diff) === 1;
    const score = `${g0}:${g1}`;

    let head;
    if (so) head = pick([`${N[W]} проходить далі в серії пенальті`, `Серія пенальті: ${N[W]} сильніший — ${so.score.join(':')}`, `Лотерея пенальті на користь команди ${N[W]}`]);
    else if (W == null) head = g0 === 0 ? pick([`Без голів: ${N[0]} — ${N[1]}`, `Нульова нічия: ${N[0]} і ${N[1]} не пробивають оборону`, `${N[0]} і ${N[1]} не забивають`])
      : pick([`${N[0]} і ${N[1]} ділять очки: ${score}`, `Нічия ${score}: ${N[0]} — ${N[1]}`, `${N[0]} — ${N[1]}: переможця немає (${score})`]);
    else if (trailed) head = pick([`${N[W]} відіграється й перемагає: ${score}`, `Камбек: ${N[W]} вириває перемогу (${score})`]);
    else if (late) head = pick([`${N[W]} вириває перемогу наприкінці: ${score}`, `Гол на останніх хвилинах: ${N[W]} перемагає ${score}`]);
    else if (Math.abs(diff) >= 3) head = pick([`Розгромна перемога: ${N[W]} — ${N[L]} ${W === 0 ? score : `${g1}:${g0}`}`, `${N[W]} без шансів для суперника: ${score}`, `${N[W]} забиває ${Math.max(g0, g1)} і впевнено перемагає`]);
    else head = pick([`${N[W]} перемагає: ${score}`, `${N[W]} бере три очки (${score})`, `${N[W]} дотискає суперника: ${score}`]);

    // вступ
    const intro = [`${N[0]} приймає команду ${N[1]}${ctx.comp ? ` у матчі турніру «${ctx.comp}»` : ''}${ctx.stadium ? ` на стадіоні «${ctx.stadium}»` : ''}.`];
    if (ctx.att) intro.push(`На трибунах — ${fint(ctx.att)} ${plural(ctx.att, 'глядач', 'глядачі', 'глядачів')}.`);
    if (m.weather && WEATHER[m.weather]) intro.push(WEATHER[m.weather]);

    // перебіг рахунку
    const flow = [];
    let prev = [0, 0];
    goals.slice(0, 6).forEach((e, i) => {
      const k = e.team, s = e.score, t = N[k];
      const was = prev[k] - prev[1 - k];
      if (i === 0) flow.push(pick([`Рахунок відкриває ${t} на ${ord(e.min)}.`, `На ${ord(e.min)} ${t} виходить уперед.`], 'f0'));
      else if (was === -1) flow.push(`На ${ord(e.min)} ${t} зрівнює рахунок — ${s.join(':')}.`);
      else if (was === 0) flow.push(`${t} знову попереду: ${s.join(':')} на ${ord(e.min)}.`);
      else if (was > 0) flow.push(`${e.min}′ — ${t} збільшує перевагу: ${s.join(':')}.`);
      else flow.push(`${e.min}′ — ${t} скорочує відставання: ${s.join(':')}.`);
      prev = s;
    });
    if (goals.length > 6) flow.push(`Далі голи сиплються й надалі — підсумок ${score}.`);
    if (!goals.length) flow.push(m.stats[0].onTarget + m.stats[1].onTarget >= 7 ? pick(['Моментів вистачає, але воротарі сьогодні на висоті.', 'Гостра гра без забитих м’ячів: воротарі й захисники відпрацьовують без помилок.'], 'nil')
      : 'Обидві команди грають обережно, і моментів небагато.');
    for (const e of reds.slice(0, 2)) flow.push(`На ${ord(e.min)} ${N[e.team]} лишається вдесятьох після вилучення.`);
    if (m.et && !so) flow.push('Долю матчу вирішує додатковий час.');
    if (so) flow.push(`Після ${m.et ? 'додаткового часу' : 'основного часу'} — серія пенальті, у якій ${N[so.winner]} сильніший: ${so.score.join(':')}.`);

    // оцінка за статистикою
    const [a, b] = m.stats, poss = a.poss != null ? a.poss : 50;
    const stats = [`Володіння — ${poss}:${100 - poss}, удари — ${a.shots}:${b.shots} (у площину ${a.onTarget}:${b.onTarget}), очікувані голи — ${f2(a.xg)}:${f2(b.xg)}.`];
    const xgW = W == null ? null : [a.xg, b.xg][W] - [a.xg, b.xg][L];
    if (W != null && !so && xgW < -0.6) stats.push(pick([`За моментами краще виглядає ${N[L]}, але ${N[W]} реалізує свої.`, `Перемога не надто заслужена: ${N[L]} створює більше.`], 'xg'));
    else if (W == null && Math.abs(a.xg - b.xg) > 0.8) stats.push(`${N[a.xg > b.xg ? 0 : 1]} створює більше, але не реалізує моменти.`);
    else if (W != null && xgW > 1.2) stats.push(`Перемога заслужена: ${N[W]} переважає за всіма показниками.`);

    // найкращий гравець
    const motm = m.motm;
    const scorers = (k) => m.ratings.filter((r) => r.team === k && r.goals).map((r) => `${name(r.player)}${r.goals > 1 ? ` (${r.goals})` : ''}`);
    const best = motm ? `Найкращий гравець матчу — ${name(motm.player)} (${N[motm.team]}): оцінка ${f2(motm.rating)}${motm.goals ? `, ${motm.goals} ${plural(motm.goals, 'гол', 'голи', 'голів')}` : ''}${motm.assists ? `, ${motm.assists} ${plural(motm.assists, 'гольова передача', 'гольові передачі', 'гольових передач')}` : ''}.` : null;

    // слова тренера вашої команди
    let quote = null;
    if (ctx.myK != null) {
      const mine = ctx.myK, res = W == null ? 'd' : W === mine ? 'w' : 'l';
      const Q = {
        w: ['Хлопці виконали план на гру. Задоволений характером команди.', 'Важлива перемога. Працюємо далі, наступний матч — уже завтра в головах.', 'Ми контролювали гру й заслужили ці очки.'],
        d: ['Очко — не те, на що ми розраховували, але й не трагедія.', 'Нам бракувало точності в завершенні. Будемо працювати.', 'Рівна гра, нічия — справедливий результат.'],
        l: ['Неприємна поразка. Розберемо помилки й відповімо в наступному матчі.', 'Сьогодні суперник був кращим — треба це визнати.', 'Ми самі віддали цей матч. Так грати не можна.'],
      };
      const xgMe = m.stats[mine].xg - m.stats[1 - mine].xg;
      if (res === 'd') Q.d = xgMe > 0.8 ? ['Нам бракувало точності в завершенні. Моментів було достатньо для перемоги.'] : xgMe < -0.8 ? ['Цінне очко в непростому матчі. Суперник створив більше.'] : Q.d;
      if (res === 'l' && xgMe > 0.8) Q.l = ['Ми створили достатньо, щоб виграти, але футбол карає за незабиті моменти.'];
      if (res === 'w' && xgMe < -0.8) Q.w = ['Сьогодні нам пощастило — треба це визнати. Але очки є очки.'];
      if (trailed && W === mine) Q.w = ['Ми не здалися після пропущеного — це головне. Характер!'];
      if (late && W === mine) Q.w = ['Віра до останньої хвилини — і вона окупилася.'];
      quote = `${ctx.manager || 'Головний тренер'}: «${pick(Q[res], 'q')}»`;
    }

    const paras = [flow.join(' '), stats.join(' '), best, quote].filter(Boolean);
    const facts = [
      ...(ctx.comp ? [['Турнір', ctx.comp]] : []),
      ...(ctx.stadium ? [['Стадіон', ctx.stadium]] : []),
      ...(ctx.att ? [['Глядачі', fint(ctx.att)]] : []),
      ...(m.weather && FM.WEATHER && FM.WEATHER[m.weather] ? [['Погода', FM.WEATHER[m.weather].label]] : []),
      ...(m.scoreHT ? [['Перший тайм', m.scoreHT.join(':')]] : []),
      ['Голи', [scorers(0).length ? `${N[0]}: ${scorers(0).join(', ')}` : null, scorers(1).length ? `${N[1]}: ${scorers(1).join(', ')}` : null].filter(Boolean).join('; ') || '—'],
    ];
    return { head, lead: intro.join(' '), paras, facts, short: `${head}. ${flow[0] || ''}${best ? ' ' + best : ''}` };
  }

  FM.report = { article };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
