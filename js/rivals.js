// Розширення 9: суперництва й дербі (справжні футбольні протистояння). У дербі — більше карток, вища ставка:
// результат сильніше впливає на вболівальників, правління й команду.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  // [клуб A (назва англійською, як у базі), клуб B, назва протистояння]
  const LIST = [
    ['Dynamo Kyiv', 'Shakhtar Donetsk', 'Класичне дербі України'],
    ['Arsenal', 'Tottenham Hotspur', 'Північнолондонське дербі'], ['Liverpool', 'Everton', 'Мерсісайдське дербі'],
    ['Manchester United', 'Manchester City', 'Манчестерське дербі'], ['Liverpool', 'Manchester United', 'Північно-західне дербі'],
    ['Chelsea', 'Tottenham Hotspur', 'Лондонське дербі'], ['Chelsea', 'Arsenal', 'Лондонське дербі'], ['Newcastle United', 'Sunderland', 'Дербі Тайну й Віру'],
    ['Real Madrid', 'Barcelona', 'Ель Класико'], ['Real Madrid', 'Atlético Madrid', 'Мадридське дербі'], ['Sevilla', 'Real Betis', 'Севільське дербі'],
    ['Athletic Bilbao', 'Real Sociedad', 'Баскське дербі'], ['Barcelona', 'Espanyol', 'Барселонське дербі'],
    ['Inter Milan', 'AC Milan', 'Міланське дербі'], ['Roma', 'Lazio', 'Римське дербі'], ['Juventus', 'Torino', 'Туринське дербі'], ['Juventus', 'Inter Milan', 'Дербі Італії'],
    ['Borussia Dortmund', 'Bayern Munich', 'Дер Класікер'], ['Borussia Dortmund', 'Schalke 04', 'Рурське дербі'], ['Hamburger SV', 'Werder Bremen', 'Північне дербі'],
    ['1. FC Köln', 'Borussia Mönchengladbach', 'Рейнське дербі'],
    ['Paris Saint-Germain', 'Marseille', 'Ле Класік'], ['Lyon', 'Saint-Étienne', 'Дербі Рони'], ['Nice', 'Monaco', 'Дербі Лазурового берега'], ['Lens', 'Lille', 'Дербі Півночі'],
    ['Benfica', 'Sporting CP', 'Лісабонське дербі'], ['Porto', 'Benfica', 'О Класіку'],
    ['Ajax', 'Feyenoord', 'Де Класікер'], ['Ajax', 'PSV Eindhoven', 'Дербі гігантів'],
    ['Galatasaray', 'Fenerbahçe', 'Міжконтинентальне дербі'], ['Beşiktaş', 'Fenerbahçe', 'Стамбульське дербі'], ['Galatasaray', 'Beşiktaş', 'Стамбульське дербі'],
    ['Legia Warsaw', 'Lech Poznań', 'Дербі Польщі'], ['Wisła Kraków', 'Cracovia', 'Святе дербі Кракова'],
    ['Celtic', 'Rangers', 'Old Firm'], ['Anderlecht', 'Club Brugge', 'Класік Бельгії'], ['Olympiacos', 'Panathinaikos', 'Дербі вічних суперників'],
    ['Sparta Prague', 'Slavia Prague', 'Празьке дербі'], ['Copenhagen', 'Brøndby', 'Нове дербі Данії'], ['Rapid Wien', 'Austria Wien', 'Віденське дербі'],
    ['Basel', 'Zürich', 'Класік Швейцарії'],
  ];
  // назви в базі бувають довшими («F.C. Copenhagen», «FC Basel»): шукаємо за входженням
  let index = null;
  function build(W) {
    index = new Map();
    const clubs = [...W.clubs.values()];
    const find = (n) => clubs.find((c) => c.nameEn === n) || clubs.find((c) => c.nameEn.replace(/^(F\.?C\.?|SK|AC|SL|SC|CF|R\.S\.C\.)\s+/i, '') === n) || clubs.find((c) => new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(c.nameEn));
    for (const [a, b, name] of LIST) {
      const A = find(a), B = find(b);
      if (!A || !B) continue;
      index.set(A.id + '|' + B.id, name); index.set(B.id + '|' + A.id, name);
    }
  }
  /** Назва дербі або null. */
  function derby(W, a, b) { if (!index || index.W !== W) { build(W); index.W = W; } return index.get(a + '|' + b) || null; }
  const isDerby = (W, a, b) => !!derby(W, a, b);
  /** Суперники клубу: [{ id, name }]. */
  function of(W, clubId) {
    if (!index || index.W !== W) { build(W); index.W = W; }
    const out = [];
    for (const [k, name] of index) { const [a, b] = k.split('|'); if (a === clubId) out.push({ id: b, name }); }
    return out;
  }
  /**
   * Наслідки дербі для клубу людини: подвійна реакція вболівальників, довіри й настрою.
   * res — +1 перемога / 0 / −1. Повертає текст для новин.
   */
  function after(W, state, opp, res) {
    const name = derby(W, state.clubId, opp);
    if (!name) return null;
    const fans = FM.club ? FM.club.fans(W, state.clubId) : null;
    if (fans) fans.mood = Math.max(0, Math.min(100, fans.mood + res * 6));
    if (state.board) state.board.conf = Math.max(0, Math.min(100, state.board.conf + res * 2.5));
    for (const id of W.club(state.clubId).players) { const p = W.player(id); p.morale = Math.max(0, Math.min(100, FM.morale.get(p) + res * 3)); }
    return res > 0 ? `${name}: перемога! Уболівальники святкують, правління задоволене.` : res < 0 ? `${name}: поразка болить подвійно — фанати й правління незадоволені.` : `${name}: нічия, жодна зі сторін не задоволена.`;
  }

  // ---------------- Суперник-тренер: особиста ворожнеча (як у FM) ----------------
  /** Головний суперник-тренер сезону: тренер дербі-суперника вашої ліги або найближчого за силою клубу. */
  function feud(W, state) {
    const S = state.season, me = W.club(state.clubId);
    let f = state.feud;
    if (f && f.me === state.clubId && f.y === S.year && W.club(f.club)) { f.name = (W.club(f.club).manager || {}).name || f.name; return f; }
    const league = W.clubsOf(me.league).filter((c) => c.id !== me.id);
    const derbies = of(W, me.id).map((x) => W.club(x.id)).filter((c) => c && c.league === me.league);
    const lvl = W.clubLevel(me.id);
    const pick = derbies[0] || league.sort((a, b) => Math.abs(W.clubLevel(a.id) - lvl) - Math.abs(W.clubLevel(b.id) - lvl))[0];
    if (!pick) return null;
    const heat = f && f.club === pick.id ? Math.max(1, f.heat) : 1;
    state.feud = { me: state.clubId, club: pick.id, name: (pick.manager || {}).name || 'тренер суперника', heat, y: S.year, w: 0, l: 0, d: 0 };
    return state.feud;
  }
  const JABS = {
    jab: { label: 'Підколоти в пресі', hint: 'Може завести вашу команду (+2,5%) — або обернутися проти вас.' },
    respect: { label: 'Висловити повагу', hint: 'Спокійно, без ризику. Ворожнеча вщухає.' },
    silent: { label: 'Відмовчатися', hint: 'Без наслідків.' },
  };
  /** Словесна дуель перед матчем з суперником-тренером. Повертає { boost, text }. */
  function duel(W, state, kind, R) {
    const f = feud(W, state);
    if (!f) return null;
    let boost = 1, text;
    if (kind === 'jab') {
      f.heat = Math.min(5, f.heat + 1);
      if (R.chance(0.6)) { boost = 1.025; text = `Ваші слова зачепили ${f.name}, а ваша команда рветься в бій.`; }
      else { boost = 0.985; text = `${f.name} відповів дотепно — ваші гравці нервують.`; }
    } else if (kind === 'respect') { f.heat = Math.max(1, f.heat - 1); boost = 1.005; text = `${f.name} подякував за теплі слова. Атмосфера спокійна.`; }
    else text = 'Ви не стали відповідати на провокації.';
    return { boost, text };
  }
  /** Після матчу з суперником-тренером: його цитата. d — різниця голів для вас. */
  function feudAfter(W, state, d) {
    const f = feud(W, state);
    if (!f) return null;
    if (d > 0) f.w++; else if (d < 0) f.l++; else f.d++;
    const hot = f.heat >= 3;
    const q = d > 0 ? (hot ? ['«Суддя вирішив цей матч, а не футбол».', '«Нехай радіють. Друге коло буде іншим».'] : ['«Сьогодні суперник був сильнішим».', '«Вітаю колегу з перемогою».'])
      : d < 0 ? (hot ? ['«Ось вам і відповідь на всі балачки в пресі».', '«Сьогодні була лекція з футболу».'] : ['«Важка, але заслужена перемога».', '«Поважаю суперника, але ми були кращими».'])
        : (hot ? ['«Нічия — і жоден із нас не задоволений».'] : ['«Чесна нічия».']);
    return `${f.name} (${W.club(f.club).name}): ${q[(f.w + f.l + f.d) % q.length]}${hot ? ' 🔥' : ''}`;
  }

  FM.rivals = { LIST, derby, isDerby, of, after, feud, JABS, duel, feudAfter };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
