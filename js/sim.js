// Детальний рушій матчу: 22 гравці й м'ячна полі 105×68 м, крок 0,5 с.
// Кожен гравець рухається за схемою й ситуацією; гравець з м'ячем оцінює варіанти (пас кожному партнерові,
// пас на хід, навіс, ведення, удар) і обирає один — з помилками, що залежать від «рішень».
// Пас можна перехопити (хто з суперників устигне до лінії передачі раніше за м'яч), удар оцінюється
// моделлю xG від відстані, кута й тиску. Голи, удари, володіння, передачі — наслідок гри, а не формули.
// Стандарти, картки, текст трансляції, оцінки — спільні з класичним рушієм (js/match.js), він і викликає цей модуль.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const L = 105, WD = 68, DT = 0.5, TPM = 60 / DT, G = 3.66;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const SENS = 0.24; // наскільки різниця в атрибутах впливає на кожну дію (решту робить кількість дій за матч)
  const dbg = (k, n = 1) => { if (FM.simStats) FM.simStats[k] = (FM.simStats[k] || 0) + n; }; // калібрування

  // Глибина ролі в блоці (0 — лінія захисту, 1 — нападники)
  const DEPTH = { CB: 0, FB: 0.04, DM: 0.27, CM: 0.45, AM: 0.66, W: 0.7, ST: 0.93 };
  const WIDE = { FB: 0.07, W: 0.1 };

  /** Цінність м'яча в точці (u — метри від своїх воріт, v — від лівої бровки): шанс, що атака закінчиться голом. */
  function threat(u, v) {
    const d = Math.hypot(L - u, (v - WD / 2) * 1.25);
    return 0.4 * Math.exp(-d / 8) + 0.012 * Math.exp(-d / 30) + 0.0008;
  }
  /** Модель xG: відстань і кут на ворота (без урахування тиску й майстерності). */
  function xg0(u, v) {
    const dx = Math.max(0.5, L - u), dy = v - WD / 2;
    const ang = Math.abs(Math.atan2(dy + G, dx) - Math.atan2(dy - G, dx));
    return sig(-1.2 + 1.7 * ang - 0.105 * Math.hypot(dx, dy));
  }

  /**
   * ctx: { sides, R, home: множник господарів, mul(x) — форма гравця (свіжість, настрій, тактика…), team(t) — тактичні множники,
   *   shoot(t, o, x, assist, kind, q, pos), corner(t, o), freekick(t, o), penalty(t, o, x), foul(t, x, o, y) → { red }, offside(t, x), note(t, text), setSec(s) }
   */
  function create(ctx) {
    const { sides, R } = ctx;
    // атрибут з урахуванням форми гравця (свіжість, настрій, позиція, тактика), стиснутий до середнього
    const at = (x, k, fb) => { const raw = x.p.attrs[k] ?? (x._xa && x._xa[k] != null ? x._xa[k] : fb != null ? fb : 10); return 10 + (raw * (x._m ?? 1) - 10) * SENS; };
    const XA = ['acc', 'ant', 'cmp', 'fir', 'jum', 'cnt', 'fla', 'vis']; // похідні атрибути (js/attrs.js), рахуються раз на хвилину
    const [H, A] = sides;
    // перетворення координат: команда k бачить поле зі своїх воріт (u вздовж, v поперек)
    const X = (k, u) => (k === 0 ? u : L - u), Y = (k, v) => (k === 0 ? v : WD - v);
    const live = (t) => t.onPitch.filter((x) => !x.out);
    const note = (t, key, who) => (ctx.note ? ctx.note(t, key, who) : false);
    const ball = { x: L / 2, y: WD / 2, hold: null, team: 0, fl: null, dead: 0, restart: null };
    // Видимий м'яч (для 2D/3D): висота й анімації ударів, навісів, сейвів — гра від цього не залежить
    const vis = { x: L / 2, y: WD / 2, z: 0, q: [], rest: false };
    function animBall(x1, y1, dur, h, z1 = 0) {
      const last = vis.q[vis.q.length - 1];
      const a = { x0: last ? last.x1 : vis.x, y0: last ? last.y1 : vis.y, z0: last ? last.z1 : vis.z, x1, y1, z1, t0: last ? last.t1 : clock, h };
      a.t1 = a.t0 + dur;
      vis.q.push(a);
    }
    function updVis() {
      while (vis.q.length && clock >= vis.q[0].t1) { const a = vis.q.shift(); vis.x = a.x1; vis.y = a.y1; vis.z = a.z1; vis.rest = ball.dead > 0; }
      if (vis.q.length) {
        const a = vis.q[0];
        if (clock < a.t0) return;
        const k = (clock - a.t0) / (a.t1 - a.t0);
        vis.x = a.x0 + (a.x1 - a.x0) * k; vis.y = a.y0 + (a.y1 - a.y0) * k; vis.z = a.z0 + (a.z1 - a.z0) * k + 4 * a.h * k * (1 - k);
        return;
      }
      if (vis.rest && ball.dead > 0) return; // м'яч лежить там, де зупинився (у сітці, у воротаря), доки гру не відновлять
      vis.rest = false;
      vis.x = ball.x; vis.y = ball.y;
      const f = ball.fl;
      if (f && (f.kind === 'long' || f.res === 'loose' && f.kind !== 'pass')) { const k = clamp((clock - f.t0) / (f.t1 - f.t0), 0, 1), d = Math.hypot(f.tx - f.x0, f.ty - f.y0); vis.z = 4 * Math.min(9, d * 0.16) * k * (1 - k); }
      else vis.z = 0;
    }
    let pendingReplay = null;
    let clock = 0; // секунд від початку матчу
    let frames = [], replay = [], recent = [];
    const replays = [];
    let lastPass = null; // { t: команда, from, to, at, kind }
    const possT = [0, 0];
    let kicked = false;

    // ---------- схема: «якірні» точки гравців ----------
    function anchors(t) {
      const L1 = live(t), back3 = String(t.formation || '').startsWith('3-');
      const bands = new Map();
      for (const x of L1) {
        if (x.slot.role === 'GK') { x.anc = { a: -1, b: 0.5 }; continue; }
        let d = DEPTH[x.slot.role] ?? 0.45;
        if (x.slot.role === 'FB' && back3) d = 0.32; // вінгбеки в схемі з трьома центральними
        const key = Math.round(d * 100);
        if (!bands.has(key)) bands.set(key, []);
        bands.get(key).push(x);
      }
      for (const [key, xs] of bands) {
        const left = xs.filter((x) => x.slot.side === 'L'), right = xs.filter((x) => x.slot.side === 'R'), mid = xs.filter((x) => !x.slot.side);
        for (const x of left) x.anc = { a: key / 100, b: WIDE[x.slot.role] ?? 0.12 };
        for (const x of right) x.anc = { a: key / 100, b: 1 - (WIDE[x.slot.role] ?? 0.12) };
        const lo = left.length || right.length ? 0.3 : 0.22, hi = 1 - lo;
        mid.forEach((x, i) => { x.anc = { a: key / 100, b: mid.length === 1 ? 0.5 : lo + (i * (hi - lo)) / (mid.length - 1) }; });
      }
      for (const x of L1) if (x.px == null) { const p = base(t, x, false, L / 2, WD / 2); x.px = p[0]; x.py = p[1]; }
    }
    const vmax = (x) => (7.1 + ((at(x, 'pac') * 0.65 + at(x, 'acc', x.p.attrs.pac) * 0.35) - 10) * 0.17) * (0.8 + 0.2 * (x.cond ?? 100) / 100);
    const U = (t, x) => (t.k === 0 ? x.px : L - x.px), V = (t, x) => (t.k === 0 ? x.py : WD - x.py);
    const ballU = (k) => (k === 0 ? ball.x : L - ball.x), ballV = (k) => (k === 0 ? ball.y : WD - ball.y);

    /** Лінія офсайду для атаки команди t (у її координатах): передостанній гравець суперника, не ближче за центр. */
    function offLine(t) {
      const o = sides[1 - t.k];
      const us = live(o).map((x) => L - U(o, x)).sort((a, b) => b - a); // у координатах t
      return Math.max(L / 2, us[1] ?? L / 2, ballU(t.k));
    }

    // роль, обов'язок, інструкції гравця — кешуються, доки слот той самий (рахуються в гарячих циклах)
    const slotC = (x) => {
      if (x._sc !== x.slot) { x._sc = x.slot; x._vmC = (FM.VARIANTS && FM.VARIANTS[x.slot.role] && FM.VARIANTS[x.slot.role][x.slot.variant]) || {}; x._dC = FM.dutyOf ? FM.dutyOf(x.slot) : 'S'; x._piC = x.slot.pi || {}; }
      return x;
    };
    const VAR = (x) => slotC(x)._vmC, DUTY = (x) => slotC(x)._dC, PI = (x) => slotC(x)._piC;
    const TI = (t) => t.ti || {};
    const FLUID = (t) => (t.fluid === 'fluid' ? 1 : t.fluid === 'rigid' ? -1 : 0);
    /** Де гравець має бути зараз (у метрах поля): схема + м'яч + фаза + роль. */
    function base(t, x, attack, bu, bv) {
      const ment = t.mentality, press = t.pressing;
      const r = x.slot.role, v8 = x.slot.variant, ins = x.slot.instr;
      if (r === 'GK') {
        const sweep = v8 === 'sweeper' ? 5 : 0;
        const u = attack ? clamp(bu * 0.22 + 2 + sweep, 4, 22 + sweep) : clamp(bu * 0.09 + 2 + sweep * 0.5, 2, 12 + sweep);
        return [X(t.k, u), Y(t.k, WD / 2 + (bv - WD / 2) * 0.22)];
      }
      let a = x.anc.a, b = x.anc.b;
      const vm = VAR(x), duty = DUTY(x), pi = PI(x), ti = TI(t), fl = FLUID(t);
      const dsh = (d) => (d === 'A' ? 0.06 : d === 'D' ? -0.06 : 0);
      const dutyShift = x.slot.duty && FM.dutyOf ? dsh(duty) - dsh(FM.dutyOf({ role: r })) : 0; // лише якщо тренер змінив обов'язок
      if (attack) {
        a += dutyShift + (vm.deep || 0) + (r === 'CB' || r === 'FB' ? fl * 0.03 : 0); // плинна структура — захисники частіше підключаються
        if (vm.cut || pi.wide < 0) b = b < 0.5 ? Math.max(b, 0.26) : Math.min(b, 0.74);
        if (vm.wideK || pi.wide > 0) b = b < 0.5 ? Math.min(b, 0.05) : Math.max(b, 0.95);
        if (vm.roam) b += Math.sin(clock / 11 + String(x.p.id).length) * 0.08;
        if (r === 'FB' && (v8 === 'wb' || ins === 'attack')) a += 0.2;
        if (r === 'FB' && v8 === 'inv') { a += 0.18; b = b < 0.5 ? 0.33 : 0.67; }
        if (r === 'W' && v8 === 'inside') b = b < 0.5 ? 0.24 : 0.76;
        if (r === 'CM' && v8 === 'b2b') a += 0.07;
        if (r === 'AM' && v8 === 'shadow') a += 0.12;
        if (r === 'ST' && v8 === 'false9') a -= 0.14;
        if (ins === 'attack' || ins === 'free') a += 0.08;
        if (ins === 'defend') a -= 0.07;
        const back = clamp(bu - 40 + 1.5 * ment + 3 * (ti.line || 0), 12, 58);
        const len = 47 + 1 * ment;
        let u = back + a * len;
        const w = 60 + 2 * t.passing + 6 * (ti.width || 0);
        let v = 4 + b * w + (bv - WD / 2) * 0.12;
        if (ins === 'free') v += Math.sin(clock / 9 + x.p.id.length) * 8;
        return [X(t.k, u), Y(t.k, clamp(v, 1.5, WD - 1.5))];
      }
      if (ins === 'defend') a -= 0.05;
      if (ins === 'attack') a += 0.04;
      a += dutyShift * 0.5 + (vm.deep || 0) * 0.5;
      const back = clamp(bu - 31 + 2.5 * press + 1 * ment + 4 * (ti.line || 0) + (ti.offside && bu > 35 ? 2 : 0), 9, 47);
      const len = 31 + 1 * ment;
      let u = back + a * len + (r === 'ST' ? 6 + 2 * Math.max(0, ment) : 0); // нападники лишаються вище — для контратаки
      const vc = WD / 2 + (bv - WD / 2) * 0.45;
      const v = vc + (b - 0.5) * (42 - 3 * press);
      return [X(t.k, u), Y(t.k, clamp(v, 1.5, WD - 1.5))];
    }

    // ---------- рух ----------
    function moveTo(x, tx, ty, sp) {
      const dx = tx - x.px, dy = ty - x.py, d = Math.hypot(dx, dy), s = sp * DT;
      if (d <= s) { x.px = tx; x.py = ty; } else { x.px += (dx / d) * s; x.py += (dy / d) * s; }
    }
    function moveAll() {
      const att = ball.team, bu = (k) => ballU(k), bv = (k) => ballV(k);
      for (const t of sides) {
        const attack = t.k === att && !ball.dead;
        const L1 = live(t);
        // пресинг: хто біжить на м'яч
        let pressers = [];
        if (!attack && !ball.dead) {
          const myU = bu(t.k); // м'яч у моїх координатах
          const n = t.pressing > 0 ? (myU < 78 ? 1 : 0) + (myU < 48 ? 1 : 0) : t.pressing < 0 ? (myU < 50 ? 1 : 0) : (myU < 70 ? 1 : 0) + (myU < 38 ? 1 : 0);
          const shoutP = ctx.team(t).press || 1;
          pressers = L1.filter((x) => x.slot.role !== 'GK').sort((p, q) => dist(p, ball) - dist(q, ball)).slice(0, Math.max(n, 1) + (shoutP > 1 ? 1 : 0));
          if (n === 0) pressers = pressers.filter((x) => dist(x, ball) < 9); // низький блок: лише якщо м'яч поруч
          // «Тиснути сильніше» / роль-пресингер — виходять назустріч з більшої відстані; «не тиснути» — ніколи
          for (const x of L1) { const pi = PI(x); if (pressers.length < 3 && !pressers.includes(x) && x.slot.role !== 'GK' && (pi.press > 0 || VAR(x).press) && dist(x, ball) < 14) pressers.push(x); }
          pressers = pressers.filter((x) => !(PI(x).press < 0) || dist(x, ball) < 3);
          // воротар суперника з м'ячем: «не давати розіграш» — нападники тиснуть на нього
          if (TI(t).preventGK && ball.hold && ball.hold.slot.role === 'GK') for (const x of L1) if (x.slot.role === 'ST' && !pressers.includes(x)) pressers.push(x);
          // хто поруч у своїй зоні — виходить назустріч (до трьох)
          for (const x of L1) if (pressers.length < 3 && x.slot.role !== 'GK' && !pressers.includes(x) && dist(x, ball) < 8 + (myU < 35 ? 4 : 0)) pressers.push(x); // (високий пресинг — ширше коло)
        }
        const cap = attack ? offLine(t) : null;
        // куди біжить м'яч (гравець веде — на крок уперед): туди й тиснуть
        const h = ball.hold, lead = h && h.carry ? Math.min(1, DT * 2 * vmax(h) * 0.78 / (Math.hypot(h.carry.tx - h.px, h.carry.ty - h.py) || 1)) : 0;
        const pbx = h && h.carry ? h.px + (h.carry.tx - h.px) * lead : ball.x, pby = h && h.carry ? h.py + (h.carry.ty - h.py) * lead : ball.y;
        // ті, хто між м'ячем і воротами поруч, стають на шляху (не бігають за спиною)
        const blockers = new Set();
        if (!attack && !ball.dead && h) {
          const gx = X(t.k, 0), gy = WD / 2;
          const cand = L1.filter((x) => x.slot.role !== 'GK' && !pressers.includes(x) && dist(x, ball) < 13 && Math.hypot(x.px - gx, x.py - gy) < Math.hypot(ball.x - gx, ball.y - gy));
          cand.sort((p, q) => dist(p, ball) - dist(q, ball)).slice(0, 2).forEach((x) => blockers.add(x));
        }
        // опіка: у своїй третині захисники й півзахисники тримаються ближче до суперників у своїй зоні (між ним і воротами)
        const marks = new Map();
        if (!attack && !ball.dead && bu(t.k) < 45) {
          const opp = live(sides[1 - t.k]).filter((y) => y.slot.role !== 'GK' && y !== ball.hold);
          const taken = new Set();
          for (const x of L1) {
            if (x.slot.role === 'GK' || pressers.includes(x)) continue;
            const [zx, zy] = base(t, x, false, bu(t.k), bv(t.k));
            let best = null, bd = 13;
            for (const y of opp) { if (taken.has(y)) continue; const d = Math.hypot(y.px - zx, y.py - zy); if (d < bd) { bd = d; best = y; } }
            if (best) { taken.add(best); marks.set(x, best); }
          }
        }
        for (const x of L1) {
          if (ball.hold === x) continue;
          if (ball.fl && ball.fl.to === x && !ball.dead) { moveTo(x, ball.fl.tx, ball.fl.ty, vmax(x)); continue; }
          if (ball.loose && !ball.dead && ball.loose.cands.includes(x)) { moveTo(x, ball.x, ball.y, vmax(x)); continue; }
          if (pressers.includes(x)) { moveTo(x, pbx, pby, vmax(x) * (0.85 + 0.015 * at(x, 'wor'))); continue; }
          if (blockers.has(x)) {
            if (dist(x, ball) < 3 && x.held == null) x.held = clock;
            if (x.held != null && clock - x.held < 4 && dist(x, ball) < 4.5) { moveTo(x, pbx, pby, vmax(x) * 0.5); continue; } // тримає позицію й іде у відбір
            if (dist(x, ball) >= 4.5) x.held = null;
            const gx = X(t.k, 0), gy = WD / 2, dd = Math.hypot(gx - pbx, gy - pby) || 1, k2 = Math.min(dd - 1, 2.2 + (blockers.size > 1 ? 1.5 : 0) * [...blockers].indexOf(x));
            moveTo(x, pbx + ((gx - pbx) / dd) * k2, pby + ((gy - pby) / dd) * k2, vmax(x) * 0.95); continue;
          }
          let [tx, ty] = base(t, x, attack, bu(t.k), bv(t.k));
          const mk = marks.get(x);
          if (mk) { // стати між суперником і своїми воротами
            const gx = X(t.k, 0), gy = WD / 2, dd = Math.hypot(gx - mk.px, gy - mk.py) || 1;
            const w = clamp(0.45 + at(x, 'pos') * 0.02, 0.5, 0.85);
            tx = tx * (1 - w) + (mk.px + ((gx - mk.px) / dd) * 1.6) * w; ty = ty * (1 - w) + (mk.py + ((gy - mk.py) / dd) * 1.6) * w;
          }
          // рух без м'яча: ривки за спину захисникам
          if (attack && x.run && x.run.until > clock) { tx = X(t.k, Math.min(L - 6, U(t, x) + 7)); ty = Y(t.k, V(t, x) + x.run.dv); }
          else if (attack && !x.run && x.slot.role !== 'GK' && R.chance(runP(t, x))) x.run = { until: clock + 3 + R.next() * 2, dv: (R.next() - 0.5) * 8 };
          else if (x.run && x.run.until <= clock) x.run = null;
          if (attack && x.slot.role !== 'GK') { // не стояти в офсайді (неуважні іноді забігають)
            const u = U(t, { px: tx, py: ty }), lim = cap - 0.8 + (at(x, 'otb') < 9 ? R.next() * 2.5 : R.next() * 0.8);
            if (u > lim) tx = X(t.k, lim);
          }
          const urgent = ball.dead ? 0.75 : attack ? 0.72 : 0.85;
          moveTo(x, clamp(tx, 0.5, L - 0.5), clamp(ty, 0.5, WD - 0.5), vmax(x) * urgent);
        }
      }
    }
    const dist = (x, b) => Math.hypot(x.px - b.x, x.py - b.y);
    /** Імовірність ривка за такт: нападники й атакувальний обов'язок — частіше; плинність, роль і інструкція «вперед» — теж. */
    function runP(t, x) {
      const duty = DUTY(x), vm = VAR(x), pi = PI(x);
      const base = ['ST', 'W', 'AM'].includes(x.slot.role) ? 0.03 : x.slot.duty === 'A' ? 0.018 : 0;
      if (!base && !(x.slot.instr === 'attack')) return 0;
      const dk = !x.slot.duty ? 1 : duty === 'A' ? 1.25 : duty === 'D' ? 0.4 : 0.85; // обов'язок, змінений тренером
      return (base || 0.012) * (at(x, 'otb') / 10) * (1 + 0.05 * t.mentality) * dk * (vm.runs || 1)
        * (1 + 0.25 * FLUID(t)) * (TI(t).discipline > 0 ? 1.15 : TI(t).discipline < 0 ? 0.85 : 1);
    }

    // ---------- рішення гравця з м'ячем ----------
    function nearestOpp(t, px, py) {
      let best = null, bd = 1e9;
      for (const y of live(sides[1 - t.k])) { const d = Math.hypot(y.px - px, y.py - py); if (d < bd) { bd = d; best = y; } }
      return { y: best, d: bd };
    }
    /** Імовірність перехоплення передачі з (fx,fy) у (tx,ty) зі швидкістю sp: хто встигне до лінії раніше за м'яч. */
    function interceptRisk(t, fx, fy, tx, ty, sp, aerial) {
      const dx = tx - fx, dy = ty - fy, len2 = dx * dx + dy * dy || 1, len = Math.sqrt(len2);
      let keep = 1; const cands = [];
      for (const y of live(sides[1 - t.k])) {
        let s = ((y.px - fx) * dx + (y.py - fy) * dy) / len2;
        if (s < 0.06) continue;
        const tail = s > 0.9;
        s = Math.min(1, s);
        const cx = fx + dx * s, cy = fy + dy * s, h = Math.hypot(y.px - cx, y.py - cy);
        if (aerial && !tail && y.slot.role !== 'GK') continue; // довгу перехоплюють лише там, де вона приземлиться
        const tb = (s * len) / sp;
        const react = 0.45 - (at(y, 'pos') + at(y, 'ant', y.p.attrs.dec) - 20) * 0.008; // передбачення
        const ty2 = Math.max(0, h - (y.slot.role === 'GK' ? 2.2 : 1.2)) / vmax(y) + react;
        let r = sig(2.0 * (tb - ty2) - 0.6) * (tail ? 0.5 : 0.75);
        if (y.slot.role === 'GK' && !(Math.abs(cy - WD / 2) < 20 && (t.k === 0 ? cx > L - 17 : cx < 17))) r = 0; // воротар — лише у своєму штрафному
        if (r > 0.02) { keep *= 1 - r; cands.push({ y, r, s, cx, cy }); }
      }
      return { p: 1 - keep, cands };
    }
    function decide(t, x) {
      const o = sides[1 - t.k], tm = ctx.team(t), k = t.k;
      const u0 = U(t, x), v0 = V(t, x);
      const pasE = at(x, 'pas') * (tm.ctrl || 1), decE = at(x, 'dec');
      const nr = nearestOpp(t, x.px, x.py);
      const opts = [];
      const ti = TI(t), pi = PI(x), vm = VAR(x);
      const lossCost = (u, v) => 0.7 * threat(L - u, WD - v) * (ti.possession ? 1.4 : 1) * (vm.safe ? 1.3 : 1);
      const counterOn = ti.counter && pst && pst.k === t.k && clock - pst.c < 7; // щойно відібрали — швидко вперед
      // передачі
      for (const y of live(t)) {
        if (y === x) continue;
        if (y.slot.role === 'GK' && !(u0 < 30 && nr.d < 6)) continue;
        const through = y.run && y.run.until > clock && U(t, y) > u0 - 5;
        let tu = U(t, y), tv = V(t, y);
        if (through) tu = Math.min(L - 4, tu + 5 + at(y, 'pac') * 0.25);
        const d = Math.hypot(tu - u0, tv - v0);
        if (d < 5 || d > 62) continue;
        const aerial = d > 34 || (t.passing > 0 && d > 26 && R.chance(0.5));
        const sp = aerial ? 21 : clamp(11 + d * 0.28 + pasE * 0.15, 12, 23);
        const tx = X(k, tu), ty = Y(k, tv);
        const ir = interceptRisk(t, x.px, x.py, tx, ty, sp, aerial);
        const pInt = Math.min(0.97, ir.p * (1.25 - 0.025 * pasE));
        const near = nearestOpp(t, tx, ty).d;
        let pCtl = 0.995 - d * 0.003 * (21 - pasE) / 10 - (near < 2 ? 0.12 : near < 4 ? 0.04 : 0) + (at(y, 'fir', y.p.attrs.tec) - 10) * 0.005; // перший дотик
        if (aerial) pCtl -= 0.12 * (near < 3 ? 1 : 0.3);
        if (ctx.rain && !aerial && d < 25) pCtl -= 0.02;
        pCtl = clamp(pCtl, 0.35, 0.99);
        const pS = (1 - pInt) * pCtl;
        let val = pS * threat(tu, tv) - (1 - pS) * lossCost((u0 + tu) / 2, (v0 + tv) / 2);
        if (t.passing > 0 && d > 24 && tu > u0 + 8) val *= 1.3;
        if (t.passing < 0 && d < 20) val *= 1.12;
        if (through) val *= 1.1 * (vm.assist || 1);
        if (ti.focus === 'flanks' && Math.abs(tv - WD / 2) > 18) val *= 1.15;
        if (ti.focus === 'middle' && Math.abs(tv - WD / 2) < 12) val *= 1.15;
        if (ti.possession && d > 30) val *= 0.8;
        if (counterOn && tu > u0 + 10) val *= 1.35;
        if (ti.tempo > 0 && tu > u0 + 6) val *= 1.08;
        if (x.slot.role === 'GK' && ti.playOut) val *= d < 32 ? 1.35 : 0.6; // гра від воротаря — короткий розіграш
        opts.push({ kind: through ? 'through' : aerial ? 'long' : 'pass', y, tx, ty, d, sp, pInt, ir, pCtl, val, pS });
      }
      // ведення м'яча
      {
        const goalDir = Math.atan2(WD / 2 - v0, L - u0);
        let best = null;
        for (const da of [0, -0.6, 0.6, -1.2, 1.2]) {
          const ang = goalDir + da, tu = clamp(u0 + Math.cos(ang) * 7, 1, L - 1), tv = clamp(v0 + Math.sin(ang) * 7, 1, WD - 1);
          const n2 = nearestOpp(t, X(k, tu), Y(k, tv));
          const contest = Math.min(nr.d, n2.d);
          const y = n2.d < nr.d ? n2.y : nr.y;
          // хто з суперників устигне перекрити шлях (повільний «пас самому собі»)
          const ir = interceptRisk(t, x.px, x.py, X(k, tu), Y(k, tv), vmax(x) * 0.78, false);
          const beatOf = (y) => sig(0.2 * (at(x, 'dri') + at(x, 'pac') * 0.3 - (at(y, 'tac') + at(y, 'pac') * 0.3)) + 0.2);
          let pS = 1 - ir.p * 0.5;
          for (const c of ir.cands) pS *= 1 - c.r * (1 - beatOf(c.y)) * 0.9;
          if (contest < 2.5 && y) pS *= 1 - 0.3 * (1 - beatOf(y));
          if (x.p.traits && x.p.traits.includes('dribbler')) pS = Math.min(0.98, pS + 0.05);
          pS = clamp(pS, 0.2, 0.98);
          const val2 = 0.85 * pS * threat(tu, tv) - (1 - pS) * lossCost(u0, v0);
          const dk = (pi.dribble > 0 ? 1.3 : pi.dribble < 0 ? 0.65 : 1) * (ti.discipline > 0 ? 1.1 : ti.discipline < 0 ? 0.9 : 1) * (vm.safe ? 0.7 : 1);
          if (!best || val2 * dk > best.val) best = { kind: 'carry', tx: X(k, tu), ty: Y(k, tv), pS, val: val2 * dk, contest };
        }
        opts.push(best);
      }
      // удар
      if (u0 > L - 34) {
        const lonE = at(x, 'lon', x.p.attrs.fin), dGoal = Math.hypot(L - u0, v0 - WD / 2);
        const q = shotQ(t, x, u0, v0, nr.d, false);
        let val = q * (1 + 0.03 * t.mentality) * (ctx.team(t).rate || 1) * (pi.shoot > 0 ? 1.4 : pi.shoot < 0 ? 0.55 : 1);
        if (dGoal > 18) val *= ti.shootSight ? 1.35 : ti.workBox ? 0.6 : 1; // «бити при нагоді» / «вводити м'яч у штрафний»
        if (dGoal > 22) val *= 0.55 + lonE / 30 * (x.p.traits && x.p.traits.includes('shootsLong') ? 1.4 : 1);
        const vm = (FM.VARIANTS[x.slot.role] && FM.VARIANTS[x.slot.role][x.slot.variant]) || null;
        if (vm && vm.shoot) val *= vm.shoot;
        const longShot = x.p.traits && x.p.traits.includes('shootsLong');
        if (q > 0.035 || (q > 0.018 && R.chance(longShot ? 0.6 : 0.3))) opts.push({ kind: 'shot', q, val: val * (dGoal > 16 ? 1.45 : 0.85) });
      }
      // навіс
      if (u0 > L - 33 && (v0 < 17 || v0 > WD - 17)) {
        const box = live(t).filter((y) => y !== x && U(t, y) > L - 20 && Math.abs(V(t, y) - WD / 2) < 12);
        if (box.length) {
          const croE = at(x, 'cro');
          const pS = clamp(0.25 + croE * 0.022 - (nr.d < 2 ? 0.1 : 0), 0.1, 0.7);
          const best = box.sort((a, b) => (at(b, 'hea') + at(b, 'otb') * 0.5) - (at(a, 'hea') + at(a, 'otb') * 0.5))[0];
          const vm = (FM.VARIANTS[x.slot.role] && FM.VARIANTS[x.slot.role][x.slot.variant]) || null;
          const ck = (pi.cross > 0 ? 1.5 : pi.cross < 0 ? 0.45 : 1) * (ti.crossMore ? 1.4 : 1) * (ti.focus === 'flanks' ? 1.15 : 1);
          opts.push({ kind: 'cross', y: best, val: pS * 0.13 * (at(best, 'hea') / 12) * (vm && vm.assist ? vm.assist : 1) * (1 + 0.08 * t.passing) * ck, pS });
        }
      }
      // винос під тиском біля своїх воріт
      if (u0 < 22 && nr.d < 2.5) opts.push({ kind: 'clear', val: threat(55, WD / 2) * 0.8 });
      // вибір: найкращий варіант найчастіше; погані рішення — більше випадковості
      let vmaxv = -1e9; for (const p of opts) if (p.val > vmaxv) vmaxv = p.val;
      const tau = (0.07 + 0.011 * (20 - clamp(decE, 1, 20))) * Math.max(Math.abs(vmaxv), 0.003);
      return R.weighted(opts, (p) => Math.exp((p.val - vmaxv) / tau));
    }
    /** xG удару з урахуванням тиску, майстерності нападника й воротаря. */
    function shotQ(t, x, u, v, press, header) {
      const o = sides[1 - t.k], gk = live(o).find((y) => y.slot.role === 'GK');
      const far = Math.hypot(L - u, v - WD / 2) > 20;
      const skill = (far ? at(x, 'lon', x.p.attrs.fin) * 0.6 + at(x, 'fin') * 0.4 : at(x, 'fin')) * 0.7 + at(x, 'cmp', x.p.attrs.dec) * 0.3; // холоднокровність
      const gq = gk ? at(gk, 'ref') * 0.4 + at(gk, 'one') * 0.3 + at(gk, 'pos') * 0.3 : 7;
      const ff = Math.pow(clamp(skill / gq, 0.55, 1.6), 0.85);
      const pm = 0.5 + 0.5 * clamp(press / 4, 0, 1);
      const hq = header ? 0.55 * clamp(at(x, 'hea') / 11, 0.7, 1.3) : 1;
      return clamp(xg0(u, v) * ff * pm * hq * ctx.qk, 0.004, 0.95);
    }

    // ---------- події з м'ячем ----------
    let pst = null;
    function give(x, t) {
      if (!pst || pst.k !== t.k) { pst = { k: t.k, c: clock, u: U(t, x) }; dbg('poss'); dbg(U(t, x) < 35 ? 'possOwn3' : U(t, x) < 70 ? 'possMid3' : 'possAtt3'); }
      ball.hold = x; ball.team = t.k; ball.fl = null; ball.loose = null;
      ball.x = x.px; ball.y = x.py;
      const tempo = TI(t).tempo || 0, ck = TI(t).counter && pst && pst.k === t.k && clock - pst.c < 6 ? 0.7 : 1;
      x.decAt = clock + Math.max(DT, (0.6 + (14 - at(x, 'tec', x.p.attrs.dri)) * 0.04 + R.next() * 0.9) * (tempo > 0 ? 0.72 : tempo < 0 ? 1.35 : 1) * ck);
    }
    function deadBall(kind, t, px, py, delay) {
      if (TI(t).timeWaste && clock > 70 * 60 && t.stats.goals > sides[1 - t.k].stats.goals) delay *= 1.6; // затягування часу
      ball.hold = null; ball.fl = null; ball.loose = null; ball.dead = delay; ball.team = t.k;
      ball.x = px; ball.y = py; ball.restart = { kind, t };
    }
    function restart() {
      const { kind, t } = ball.restart; ball.restart = null; ball.dead = 0;
      const L1 = live(t);
      let x;
      if (kind === 'gk') x = L1.find((y) => y.slot.role === 'GK');
      else if (kind === 'kick') x = L1.filter((y) => y.slot.role !== 'GK').sort((a, b) => Math.hypot(a.px - L / 2, a.py - WD / 2) - Math.hypot(b.px - L / 2, b.py - WD / 2))[0];
      else x = L1.filter((y) => y.slot.role !== 'GK').sort((a, b) => dist(a, ball) - dist(b, ball))[0];
      if (!x) x = L1[0];
      x.px = ball.x; x.py = ball.y;
      give(x, t);
    }
    const perf = (t, x) => t.perf.get(x.p.id);
    function startPass(t, x, op) {
      const pf = perf(t, x); pf.passes = (pf.passes || 0) + 1;
      // результат відомий одразу, м'яч летить потрібний час
      let res = 'ok', to = op.y, tx = op.tx, ty = op.ty, inter = null;
      if (R.chance(op.pInt)) {
        res = 'int';
        inter = R.weighted(op.ir.cands, (c) => c.r);
        tx = inter.cx; ty = inter.cy;
      } else if (!R.chance(op.pCtl)) {
        res = 'loose';
        const err = 1.5 + op.d * 0.07 * (21 - at(x, 'pas')) / 10;
        tx += (R.next() - 0.5) * 2 * err; ty += (R.next() - 0.5) * 2 * err;
      }
      const d = Math.hypot(tx - x.px, ty - x.py);
      ball.hold = null; ball.fl = { from: x, to, tx, ty, t0: clock, t1: clock + d / op.sp + 0.1, x0: x.px, y0: x.py, res, inter: inter && inter.y, team: t, kind: op.kind };
      lastPass = { team: t.k, from: x, to, at: clock, kind: op.kind };
    }
    function land() {
      const f = ball.fl; ball.fl = null;
      const t = f.team, o = sides[1 - t.k];
      ball.x = f.tx; ball.y = f.ty;
      if (ball.x < 0 || ball.x > L || ball.y < 0 || ball.y > WD) return out(t);
      if (f.res === 'ok') {
        // офсайд: одержувач був за лінією в момент передачі
        if (f.offside) { ctx.offside(t, f.to); return deadBall('fk', o, f.to.px, f.to.py, 6); }
        perf(t, f.from).passOk = (perf(t, f.from).passOk || 0) + 1;
        f.to.px = f.tx; f.to.py = f.ty;
        if (f.kind === 'through' && U(t, f.to) > L - 40) note(t, 'thr', { a: f.from, p: f.to });
        else if (Math.abs(f.ty - f.y0) > 30 && Math.hypot(f.tx - f.x0, f.ty - f.y0) > 35 && R.chance(0.5)) note(t, 'switchPlay', { a: f.from, p: f.to });
        return give(f.to, t);
      }
      dbg('land_' + f.res);
      if (f.res === 'int') {
        const y = f.inter; perf(o, y).interceptions = (perf(o, y).interceptions || 0) + 1;
        if (f.kind === 'through' && U(o, y) < 40) note(o, 'thrInt', { d: y });
        y.px = f.tx; y.py = f.ty;
        return give(y, o);
      }
      loose();
    }
    /** М'яч нічий: хто першим добіжить. */
    function loose() {
      if ((ball.y < 2.5 || ball.y > WD - 2.5) && R.chance(0.6)) { // біля бровки м'яч найчастіше виходить в аут
        const last = sides[ball.team]; ball.y = ball.y < WD / 2 ? 0.5 : WD - 0.5;
        return deadBall('throw', sides[1 - last.k], ball.x, ball.y, 4 + R.int(5));
      }
      const all = [...live(H), ...live(A)].map((x) => ({ x, tt: Math.hypot(x.px - ball.x, x.py - ball.y) / vmax(x) + R.next() * 0.6 }));
      all.sort((a, b) => a.tt - b.tt);
      const w = all[0];
      ball.hold = null; ball.loose = { cands: all.slice(0, 4).map((c) => c.x), win: w.x, at: clock + Math.max(DT, w.tt) };
    }
    function out(t) {
      dbg('out');
      const o = sides[1 - t.k];
      const bu = ballU(t.k);
      ball.x = clamp(ball.x, 0, L); ball.y = clamp(ball.y, 0, WD);
      if (bu >= L) return deadBall('gk', o, X(o.k, 5.5), WD / 2, 8 + R.int(6)); // за лінією воріт суперника — від воріт
      if (bu <= 0) return after(ctx.corner(o, t), o, t); // власна лінія воріт — кутовий суперника
      return deadBall('throw', o, ball.x, ball.y < 1 ? 0.5 : WD - 0.5, 4 + R.int(5)); // аут
    }
    function shoot(t, x, op, kind, assist) {
      const o = sides[1 - t.k];
      const u = U(t, x), v = V(t, x);
      const pos = { x: Math.round((u / L) * 100), y: Math.round((v / WD) * 100) };
      const g0 = ctx.shoot(t, o, x, assist, kind, op.q, pos);
      const res = g0 && typeof g0 === 'object' ? g0 : { goal: !!g0, out: g0 ? 'goal' : 'saved' };
      ball.hold = null;
      shotAnim(t, x, res.out, kind === 'header');
      if (res.goal) { recordReplay(); return deadBall('kick', o, L / 2, WD / 2, 25 + R.int(15)); }
      return deadBall('gk', o, X(o.k, 5.5), WD / 2, 7 + R.int(6));
    }
    /** Видимий політ удару: гол — у сітку, сейв — до воротаря, повз — за лінію, стійка — відскок, блок — у захисника. */
    function shotAnim(t, x, out, header) {
      const o = sides[1 - t.k], gx = X(t.k, L), dir = t.k === 0 ? 1 : -1;
      const dist = Math.hypot(gx - x.px, WD / 2 - x.py), dur = Math.max(0.35, dist / 26);
      const side = R.next() < 0.5 ? -1 : 1, aimY = WD / 2 + side * (1 + R.next() * 2.4);
      const gk = live(o).find((y) => y.slot.role === 'GK');
      const z0 = header ? 2.1 : 0.1, hArc = header ? 0.2 : dist > 18 ? 1.1 : 0.5;
      if (out === 'goal') { animBall(gx + dir * 1.2, aimY, dur, hArc, 0.4 + R.next() * 1.6); }
      else if (out === 'saved' && gk) { animBall(gk.px, gk.py + (aimY - WD / 2) * 0.4, dur * 0.9, hArc, 0.9); animBall(gk.px - dir * 0.5, gk.py, 0.3, 0.1, 0); }
      else if (out === 'post') { animBall(gx, WD / 2 + side * G, dur, hArc, 1.2); animBall(gx - dir * 6, WD / 2 + side * (G + 4), 0.5, 0.4, 0); }
      else if (out === 'blocked') { animBall(x.px + dir * 2.5, x.py + (R.next() - 0.5) * 2, 0.25, 0.2, 0.3); animBall(x.px + dir * 1, x.py + (R.next() - 0.5) * 6, 0.4, 0.5, 0); }
      else { animBall(gx + dir * 3, WD / 2 + side * (G + 1.5 + R.next() * 4), dur, hArc + 0.8, 1.5 + R.next() * 2); }
      vis.z = z0;
    }
    function assistOf(t, x) { return lastPass && lastPass.team === t.k && lastPass.to === x && clock - lastPass.at < 6 && lastPass.from !== x ? lastPass.from : null; }
    function act(t, x) {
      if (pst && pst.k === t.k) {
        const age = clock - pst.c, u = U(t, x);
        if (!pst.noted && age < 9 && pst.u < 50 && u > 68) { pst.noted = true; note(t, 'counter', {}); }
        else if (age > 14 && u > 70 && R.chance(0.3)) note(t, 'pressure', {});
      }
      // груба помилка під тиском біля своїх воріт: м'яч — суперникові
      const nr0 = U(t, x) < 30 ? nearestOpp(t, x.px, x.py) : null;
      if (nr0 && nr0.d < 2.5 && R.chance(0.012 * (1 + (12 - (at(x, 'dec') + at(x, 'cnt', x.p.attrs.dec)) / 2) / 5) * (clock > 75 * 60 ? 1.25 : 1))) { // концентрація, утома наприкінці
        const o2 = sides[1 - t.k];
        note(o2, 'howler', { p: x }, true);
        nr0.y.px = x.px; nr0.y.py = x.py; give(nr0.y, o2); return;
      }
      const op = decide(t, x);
      if (x.slot.role === 'GK' && op.kind === 'long' && R.chance(0.12)) note(t, 'keeperLong', { gk: x });
      dbg('opt_' + op.kind);
      if (op.kind === 'shot') {
        dbg('shotDist', Math.hypot(L - U(t, x), V(t, x) - WD / 2));
      }
      const o = sides[1 - t.k];
      if (op.kind === 'shot') {
        const as = assistOf(t, x);
        const kind = as && lastPass.kind === 'through' ? 'through' : as && U(t, x) > L - 16 ? 'through' : 'solo';
        return shoot(t, x, op, kind, kind === 'solo' ? null : as);
      }
      if (op.kind === 'carry') {
        x.carry = { tx: op.tx, ty: op.ty, pS: op.pS };
        x.decAt = clock + 1 + R.next();
        return;
      }
      if (op.kind === 'clear') {
        perf(t, x).passes = (perf(t, x).passes || 0) + 1;
        ball.hold = null;
        const tx = X(t.k, 50 + R.next() * 20), ty = clamp(x.py + (R.next() - 0.5) * 40, 2, WD - 2);
        ball.fl = { from: x, to: null, tx, ty, t0: clock, t1: clock + 2, x0: x.px, y0: x.py, res: 'loose', team: t, kind: 'long' };
        return;
      }
      if (op.kind === 'cross') {
        const pf = perf(t, x); pf.passes = (pf.passes || 0) + 1;
        const target = op.y, defs = live(o).filter((d) => d.slot.role !== 'GK' && Math.hypot(d.px - target.px, d.py - target.py) < 5);
        vis.x = x.px; vis.y = x.py; animBall(target.px, target.py, 0.9, 5.5, 2.1); // навіс по дузі
        const gk = live(o).find((d) => d.slot.role === 'GK');
        const claim = gk ? 0.12 + (at(gk, 'aer') - 10) * 0.012 : 0;
        const claimed = R.chance(claim);
        if (!R.chance(op.pS / 0.7) || claimed) { // воротар забрав або подача невдала
          if (claimed && gk) note(t, 'crossFail', { a: x, gk });
          if (R.chance(0.3)) return after(ctx.corner(t, o), t, o);
          ball.x = target.px; ball.y = target.py; return deadBall('gk', o, X(o.k, 6), WD / 2, 5);
        }
        // боротьба в повітрі
        const air = (q) => at(q, 'hea') * 0.65 + at(q, 'jum', q.p.attrs.hea) * 0.35 + at(q, 'str') * 0.3 + at(q, 'bra') * 0.2; // гра головою й стрибок
        const atk = air(target);
        const def = defs.reduce((m, d) => Math.max(m, air(d)), 0);
        const win = sig(0.22 * (atk - def) + (defs.length ? -0.2 - 0.25 * (defs.length - 1) : 1.4));
        if (R.chance(win)) {
          perf(t, x).passOk = (perf(t, x).passOk || 0) + 1;
          const q = shotQ(t, target, U(t, target), V(t, target), defs.length ? 1.5 : 4, true);
          return shoot(t, target, { q }, 'header', x);
        }
        if (defs[0]) note(t, 'crossClear', { a: x, d: defs[0] });
        if (R.chance(0.35)) return after(ctx.corner(t, o), t, o);
        ball.x = X(t.k, L - 22); ball.y = WD / 2 + (R.next() - 0.5) * 30; ball.hold = null; return loose();
      }
      // передача: офсайд перевіряємо в момент удару по м'ячу
      const trap = TI(sides[1 - t.k]).offside;
      const offside = U(t, op.y) > offLine(t) + (trap ? -0.6 : 0.3) && U(t, op.y) > L / 2;
      startPass(t, x, op);
      ball.fl.offside = offside && (op.kind !== 'pass' || R.chance(0.6));
    }

    // ---------- відбір і фоли ----------
    function duel(t, x) {
      const o = sides[1 - t.k];
      const L1 = live(o).filter((y) => y.slot.role !== 'GK' && Math.hypot(y.px - x.px, y.py - x.py) < 2.1);
      if (!L1.length) return false;
      const gxo = X(t.k, L); // ворота, які атакує t
      const ready = L1.filter((z) => !(z.cool > clock));
      // захисник між м'ячем і воротами — обов'язкова боротьба; той, хто наздоганяє, — іноді
      const y = ready.find((z) => Math.abs(z.px - gxo) < Math.abs(x.px - gxo)) || ready[0];
      if (!y) return false;
      const tm = ctx.team(o);
      const facing = Math.abs(y.px - gxo) < Math.abs(x.px - gxo);
      if (!facing && !R.chance(0.1)) return false;
      y.cool = clock + 3.5;
      dbg('duel');
      const tacE = (at(y, 'tac') + at(y, 'str') * 0.25 + at(y, 'pos') * 0.2) * (tm.def || 1);
      const driE = at(x, 'dri') + at(x, 'str') * 0.25 + at(x, 'tec', x.p.attrs.dri) * 0.2;
      const hard = o.oppi && o.oppi.tackle === 'hard' ? 1 : o.oppi && o.oppi.tackle === 'soft' ? -1 : 0;
      const cover = live(o).filter((z) => z !== y && z.slot.role !== 'GK' && Math.hypot(z.px - x.px, z.py - x.py) < 6).length; // підстраховка партнерів
      const piT = PI(y).tackle || 0;
      const pWin = clamp(0.5 + 0.028 * (tacE - driE) + 0.05 * hard + 0.07 * Math.min(3, cover) + 0.035 * piT, 0.15, 0.9);
      const won = R.chance(pWin);
      const pf = perf(o, y);
      const foulP = 0.018 * (piT > 0 ? 1.4 : piT < 0 ? 0.6 : 1) * (TI(o).discipline > 0 ? 1.15 : TI(o).discipline < 0 ? 0.85 : 1) * (hard > 0 ? 1.45 : hard < 0 ? 0.65 : 1) * (tm.cards || 1) * (ctx.derby ? 1.25 : 1)
        * (((FM.VARIANTS[y.slot.role] || {})[y.slot.variant] || {}).cards || 1) * (y.p.traits && y.p.traits.includes('tackler') ? 1.25 : 1) * (won ? 0.6 : 1.5) * (y.yellow ? 0.6 : 1);
      const uA = U(t, x), inBox = uA > L - 16.5 && Math.abs(V(t, x) - WD / 2) < 20.16;
      if (R.chance(foulP * (inBox ? 0.35 : uA > L - 30 ? 0.7 : 1))) { // біля своїх воріт захисники обережніші
        dbg('foul');
        ctx.foul(o, y, t, x);
        if (x.out) return true;
        const u = U(t, x), v = V(t, x);
        if (u > L - 16.5 && Math.abs(v - WD / 2) < 20.16) {
          if (!R.chance(Math.min(1, 0.55 + 0.4 * (ctx.refK ? ctx.refK() : 1)))) { give(x, t); return true; } // арбітр не побачив — гра триває
          return after(ctx.penalty(t, o, x), t, o);
        }
        if (Math.hypot(L - u, v - WD / 2) < 27 && R.chance(0.6)) return after(ctx.freekick(t, o), t, o); // штрафний у зоні удару
        deadBall('fk', t, x.px, x.py, 6 + R.int(5));
        return true;
      }
      pf.tackles = (pf.tackles || 0) + (won ? 1 : 0);
      pf.duels = (pf.duels || 0) + 1; perf(t, x).duels = (perf(t, x).duels || 0) + 1;
      if (won) {
        const r = R.next();
        if (r < 0.14) return deadBall('throw', t, x.px, x.py < WD / 2 ? 0.5 : WD - 0.5, 4 + R.int(5)), true; // вибив у аут
        if (r < 0.26) { ball.hold = null; ball.x = clamp(x.px + (R.next() - 0.5) * 10, 1, L - 1); ball.y = clamp(x.py + (R.next() - 0.5) * 10, 1, WD - 1); loose(); return true; }
        if (U(o, y) < 38) note(o, 'tackle', { d: y, p: x });
        give(y, o); return true;
      }
      perf(t, x).dribbles = (perf(t, x).dribbles || 0) + 1;
      if (U(t, x) > 62) note(t, 'beat', { p: x, d: y });
      y.cool = clock + 3; // обіграний захисник не одразу оговтається
      // обіграв: короткий ривок уперед
      const fwd = t.k === 0 ? 2.5 : -2.5; x.px = clamp(x.px + fwd, 0.5, L - 0.5);
      return false;
    }
    /** Після стандарту (його розігрує класичний рушій): g — хто забив (k) або null. Гол — розіграш з центру, інакше — від воріт. */
    function after(g, t, o) {
      if (g != null) { recordReplay(); const c = sides[1 - g]; deadBall('kick', c, L / 2, WD / 2, 25 + R.int(10)); }
      else deadBall('gk', o, X(o.k, 5.5), WD / 2, 8);
      return true;
    }

    // ---------- такт ----------
    function tick() {
      clock += DT;
      ctx.setSec(Math.floor(clock % 60));
      if (ball.dead > 0) {
        dbg('deadT', DT);
        ball.dead -= DT; moveAll();
        if (ball.dead <= 0) restart();
        return;
      }
      if (ball.fl) {
        const f = ball.fl, k = clamp((clock - f.t0) / (f.t1 - f.t0), 0, 1);
        ball.x = f.x0 + (f.tx - f.x0) * k; ball.y = f.y0 + (f.ty - f.y0) * k;
        possT[f.team.k]++;
        moveAll();
        if (clock >= f.t1) land();
        return;
      }
      if (ball.loose) {
        moveAll();
        if (clock >= ball.loose.at) { const w = ball.loose.win; const t = sides.find((s) => s.onPitch.includes(w)); if (w.out) return loose(); w.px = ball.x; w.py = ball.y; give(w, t); }
        return;
      }
      const x = ball.hold;
      if (!x || x.out) { loose(); return; }
      const t = sides[ball.team];
      possT[t.k]++;
      moveAll();
      // ведення
      if (x.carry) {
        const gx = X(sides[1 - t.k].k, 0); // ворота суперника
        const wall = live(sides[1 - t.k]).some((y) => y.slot.role !== 'GK' && Math.hypot(y.px - x.px, y.py - x.py) < 1.6 && Math.abs(y.px - gx) < Math.abs(x.px - gx));
        moveTo(x, x.carry.tx, x.carry.ty, vmax(x) * (wall ? 0.25 : 0.78));
        if (Math.hypot(x.px - x.carry.tx, x.py - x.carry.ty) < 0.5) x.carry = null;
      }
      ball.x = x.px; ball.y = x.py;
      if (duel(t, x)) return;
      if (x.decAt > clock + DT && nearestOpp(t, x.px, x.py).d < 3.5) x.decAt = clock + DT; // під тиском — рішення швидше
      if (clock >= x.decAt) { x.carry = null; act(t, x); }
    }

    function snap() {
      const pos = [];
      for (const t of sides) for (const x of live(t)) pos.push(x.p.id, Math.round(x.px / L * 1000) / 10, Math.round(x.py / WD * 1000) / 10, t.k);
      return { c: clock, bx: Math.round(vis.x / L * 1000) / 10, by: Math.round(vis.y / WD * 1000) / 10, bz: Math.round(vis.z * 10) / 10, h: ball.hold && !vis.q.length ? ball.hold.p.id : null, pos };
    }
    function recordReplay() { pendingReplay = clock + 2; }

    /** Одна хвилина гри. kickoff — хто розпочинає (на 1-й і 46-й хвилині). Повертає частку володіння господарів. */
    function minute(m) {
      for (const t of sides) { anchors(t); for (const x of live(t)) { x._m = ctx.mul(x); if (FM.attrs && !x._xa) { x._xa = {}; for (const k of XA) x._xa[k] = FM.attrs.attr(x.p, k); } } }
      if (m === 1 || m === 46 || m === 91 || m === 106) {
        const t = m === 1 || m === 91 ? H : A;
        for (const s of sides) for (const x of live(s)) { const p = base(s, x, false, L / 2, WD / 2); x.px = s.k === 0 ? Math.min(p[0], L / 2 - 1) : Math.max(p[0], L / 2 + 1); x.py = p[1]; x.run = null; x.carry = null; }
        ball.x = L / 2; ball.y = WD / 2; deadBall('kick', t, L / 2, WD / 2, 0.5);
        if (m > 1) clock = Math.max(clock, (m - 1) * 60);
        kicked = true;
      }
      frames = [];
      possT[0] = possT[1] = 0;
      for (let i = 0; i < TPM; i++) {
        tick();
        updVis();
        const f = snap();
        frames.push(f); recent.push(f); if (recent.length > 40) recent.shift();
        if (pendingReplay != null && clock >= pendingReplay) { replays.push(recent.slice(-30)); pendingReplay = null; }
      }
      const tot = possT[0] + possT[1];
      return tot ? possT[0] / tot : 0.5;
    }
    /** Кадри удару серії пенальті: виконавець біля точки, воротар на лінії, решта — у центральному колі. */
    function penFrames(x, gk, out) {
      const all = [...live(H), ...live(A)];
      const rest = all.filter((y) => y !== x && y !== gk);
      rest.forEach((y, i) => { const a = (i / rest.length) * Math.PI * 2; y.px = L / 2 + Math.cos(a) * 7; y.py = WD / 2 + Math.sin(a) * 7; });
      const spotX = L - 11, ty = out === 'wide' ? (R.chance(0.5) ? WD / 2 - 5.5 : WD / 2 + 5.5) : out === 'post' ? WD / 2 - G : WD / 2 + (R.next() - 0.5) * 6;
      const gkTo = out === 'saved' ? ty : WD / 2 + (R.chance(0.5) ? -3 : 3);
      frames = [];
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        x.px = spotX - 4 + Math.min(1, k * 2.5) * 3.5; x.py = WD / 2;
        if (gk) { gk.px = L - 0.6; gk.py = WD / 2 + (k > 0.45 ? (gkTo - WD / 2) * Math.min(1, (k - 0.45) * 3) : 0); }
        const bk = Math.max(0, (k - 0.45) / 0.55);
        ball.hold = null; ball.x = spotX + (L - 0.2 - spotX) * Math.min(1, bk * 1.3); ball.y = WD / 2 + (ty - WD / 2) * Math.min(1, bk * 1.3);
        if (out === 'saved' && bk > 0.75) { ball.x = L - 3; ball.y = gkTo + 2; }
        vis.q = []; vis.x = ball.x; vis.y = ball.y; vis.z = bk > 0 && bk < 0.77 ? 0.2 + 1.4 * Math.min(1, bk * 1.3) * (out === 'wide' ? 1.6 : 1) : 0;
        frames.push(snap());
      }
    }
    return {
      minute, penFrames,
      get frames() { return frames; },
      replays,
      get clock() { return clock; },
      get kicked() { return kicked; },
      DT,
    };
  }

  FM.sim = { create, threat, xg0, DT, PITCH: [L, WD] };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
