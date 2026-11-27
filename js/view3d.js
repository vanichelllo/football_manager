// 3D-вид матчу: те саме, що рахує детальний рушій (js/sim.js), — у перспективі, як телетрансляція.
// Стадіон: яруси трибун зі східцями й тисячами вболівальників (стрибають після голу), дах і щогли прожекторів,
// рекламні щити, лави запасних, тренери біля бровки. Поле з візерунком скошеного газону; сонце й тіні.
// Гравці: тулуб, стегна й гомілки (коліна), плечі й передпліччя (лікті), волосся, номер на спині; ім'я над
// гравцем з м'ячем. Суддя й бокові судді. Камери: «Режисер», «Трансляція», «Бровка», «Згори», «З-за воріт».
// Погода: дощ, сніг, хмари. Якість (низька/середня/висока) — для телефонів. Three.js (js/vendor/three.min.js, MIT).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const L = 105, WD = 68;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function supported() {
    try {
      if (!root.THREE || !root.document) return false;
      const c = document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (_) { return false; }
  }
  /** Детермінований генератор (щоб стадіон виглядав однаково для того самого матчу). */
  function rngOf(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  const QUALITY = {
    low: { label: 'Низька', px: 1, aa: false, shadow: 0, seat: 1.3, grass: 8 },
    mid: { label: 'Середня', px: 1.5, aa: true, shadow: 1024, seat: 0.8, grass: 11 },
    high: { label: 'Висока', px: 2, aa: true, shadow: 2048, seat: 0.55, grass: 14 },
  };
  /** Якість за пристроєм: слабкий телефон — низька, планшет — середня, комп'ютер — висока. */
  function autoQuality() {
    try {
      const w = Math.min(root.screen.width, root.screen.height), mem = root.navigator.deviceMemory || 4;
      return w < 500 || mem <= 2 ? 'low' : w < 900 || mem <= 4 ? 'mid' : 'high';
    } catch (_) { return 'mid'; }
  }

  /** Текстура поля: смуги скошеного газону, нерівності трави, розмітка в масштабі. */
  function pitchTexture(THREE, S, R, wet) {
    const cw = Math.round((L + 8) * S), ch = Math.round((WD + 8) * S), o = 4 * S;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const A = wet ? ['#2a6e45', '#307a4c'] : ['#3b8a4e', '#46985a'];
    for (let i = 0; i < 20; i++) { g.fillStyle = A[i % 2]; g.fillRect((i * cw) / 20, 0, cw / 20 + 1, ch); }
    // нерівності трави: дрібні плями світлішого й темнішого
    for (let i = 0; i < cw * ch / 60; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${0.03 + R() * 0.05})` : `rgba(255,255,200,${0.02 + R() * 0.04})`;
      g.fillRect(R() * cw, R() * ch, 1 + R() * 3, 1 + R() * 2);
    }
    // витоптані ділянки: воротарські й центр
    const worn = (x, y, rx, ry) => { const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, 'rgba(120,110,60,0.22)'); gr.addColorStop(1, 'rgba(120,110,60,0)'); g.fillStyle = gr; g.save(); g.scale(1, ry / rx); g.beginPath(); g.arc(x, y * rx / ry, rx, 0, Math.PI * 2); g.fill(); g.restore(); };
    worn(o + 3 * S, o + (WD / 2) * S, 6 * S, 9 * S); worn(o + (L - 3) * S, o + (WD / 2) * S, 6 * S, 9 * S); worn(o + (L / 2) * S, o + (WD / 2) * S, 8 * S, 6 * S);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(1.6, S * 0.12); g.fillStyle = 'rgba(255,255,255,0.9)';
    const X = (m) => o + m * S, Y = (m) => o + m * S;
    g.strokeRect(X(0), Y(0), L * S, WD * S);
    g.beginPath(); g.moveTo(X(L / 2), Y(0)); g.lineTo(X(L / 2), Y(WD)); g.stroke();
    g.beginPath(); g.arc(X(L / 2), Y(WD / 2), 9.15 * S, 0, Math.PI * 2); g.stroke();
    const spot = (x, y) => { g.beginPath(); g.arc(X(x), Y(y), Math.max(2, S * 0.2), 0, Math.PI * 2); g.fill(); };
    spot(L / 2, WD / 2);
    for (const side of [0, 1]) {
      const x0 = side ? L - 16.5 : 0, x6 = side ? L - 5.5 : 0;
      g.strokeRect(X(x0), Y(WD / 2 - 20.16), 16.5 * S, 40.32 * S);
      g.strokeRect(X(x6), Y(WD / 2 - 9.16), 5.5 * S, 18.32 * S);
      const px = side ? L - 11 : 11; spot(px, WD / 2);
      g.beginPath();
      const a = Math.acos(5.5 / 9.15);
      if (side) g.arc(X(px), Y(WD / 2), 9.15 * S, Math.PI - a, Math.PI + a); else g.arc(X(px), Y(WD / 2), 9.15 * S, -a, a);
      g.stroke();
    }
    for (const [x, y, s0] of [[0, 0, 0], [L, 0, Math.PI / 2], [L, WD, Math.PI], [0, WD, -Math.PI / 2]]) { g.beginPath(); g.arc(X(x), Y(y), 1 * S, s0, s0 + Math.PI / 2); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  }
  /** Підпис над гравцем: ім'я білим з темним контуром. */
  function labelTexture(THREE, text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, 128, 26, 248);
    g.fillStyle = '#fff'; g.fillText(text, 128, 26, 248);
    return new THREE.CanvasTexture(c);
  }
  /** Футболка: колір клубу, номер на спині (на циліндрі тулуба спина — середина текстури). */
  function shirtTexture(THREE, num, fill, trim) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = fill; g.fillRect(0, 0, 128, 64);
    g.fillStyle = trim; g.fillRect(0, 0, 128, 5); // комір і плечі
    g.fillStyle = lum(fill) > 0.6 ? '#1b1b1b' : '#fff';
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num ?? '').slice(0, 2), 64, 34);
    return new THREE.CanvasTexture(c);
  }
  /** М'яч: білий з темними латками. */
  function ballTexture(THREE) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#222'; for (const [x, y] of [[8, 8], [24, 22], [40, 8], [56, 22], [16, 28], [48, 2]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
    return new THREE.CanvasTexture(c);
  }

  // Рекламні щити: вигадані бренди (без справжніх компаній), спонсор клубу — частіше
  const BRANDS = [['КАВУН БАНК', '#1f8a4c', '#fff'], ['СТРУМОК • вода', '#1d6fd1', '#fff'], ['ВІТРИЛО АВТО', '#e8e8e8', '#14213d'], ['КЛЮЧ мобайл', '#ffcc00', '#111'],
    ['КОЛОСОК', '#c8752a', '#fff'], ['ЗЛАГОДА страхування', '#4b2a87', '#fff'], ['ПОЛЕТЕХ', '#111', '#3fe07a'], ['БУРШТИН', '#f2a51a', '#2b1a00'], ['СОКІЛ СПОРТ', '#d12f2f', '#fff']];
  function adTexture(THREE, brands) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 64;
    const g = c.getContext('2d'), w = c.width / brands.length;
    brands.forEach(([text, bg, fg], i) => {
      g.fillStyle = bg; g.fillRect(i * w, 0, w, 64);
      g.fillStyle = fg; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, i * w + w / 2, 34, w - 20);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * w + w - 3, 0, 3, 64);
    });
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }

  /** Профіль трибуни (перетин): ступені ярусів. tiers: [{ rows, rise, gap, wall }]. Повертає форму й місця. */
  function standProfile(THREE, tiers) {
    const sh = new THREE.Shape(), seats = [];
    const D = 0.8; // глибина ряду
    let u = 0, v = 1.1;
    sh.moveTo(0, 0); sh.lineTo(0, v);
    tiers.forEach((t, ti) => {
      if (ti) { u += t.gap; sh.lineTo(u, v); v += t.wall; sh.lineTo(u, v); }
      for (let i = 0; i < t.rows; i++) { seats.push([u + D * 0.55, v, ti]); u += D; sh.lineTo(u, v); v += t.rise; sh.lineTo(u, v); }
    });
    u += 0.4; sh.lineTo(u, v); sh.lineTo(u, 0); sh.lineTo(0, 0);
    return { shape: sh, seats, depth: u, top: v };
  }

  /**
   * container — куди вставити полотно. opts: { kit: [[колір, оздоблення] ×2], info(id) → { k, num, gk },
   *   name(id) → коротке ім'я, sponsor, capacity, fill (0–1), weather, seed, quality, bench: [n0, n1] }.
   * Повертає { show, setCamera, setReplayCamera, replay, cue, celebrate, dispose, el }.
   */
  function create(container, opts) {
    const THREE = root.THREE;
    const qk = QUALITY[opts.quality] ? opts.quality : autoQuality(), Q = QUALITY[qk];
    const R = rngOf(opts.seed || 'stadium');
    const weather = opts.weather || 'sun';
    const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: qk === 'high' ? 'high-performance' : 'low-power' });
    renderer.setPixelRatio(Math.min(Q.px, root.devicePixelRatio || 1));
    renderer.domElement.className = 'v3d-canvas';
    if (Q.shadow) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const SKY = { sun: 0x9fc6ea, heat: 0xb7d3ee, cloud: 0xaab4bf, wind: 0xa9b9c8, rain: 0x7d8792, snow: 0xc9d0d8 };
    const sky = SKY[weather] ?? SKY.sun;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 170, 420);
    const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.5, 700);

    // світло: небо + сонце (тіні від трибун, даху й гравців)
    const dull = weather === 'rain' || weather === 'snow' || weather === 'cloud';
    scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x2a3a2a, dull ? 1.05 : 0.72));
    const sun = new THREE.DirectionalLight(0xfff3dd, dull ? 0.35 : 0.95);
    const SUNS = [[-70, 58, -60], [60, 55, -65], [-25, 62, -80]]; // сонце за дальньою трибуною — тінь даху лягає на поле
    const sp = SUNS[Math.floor(R() * SUNS.length)];
    sun.position.set(sp[0], sp[1], sp[2]); sun.target.position.set(0, 0, 0);
    scene.add(sun, sun.target);
    if (Q.shadow) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 280;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    }

    // поле й навколо
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, WD + 8), new THREE.MeshLambertMaterial({ map: pitchTexture(THREE, Q.grass, R, weather === 'rain') }));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 80, WD + 80), new THREE.MeshLambertMaterial({ color: weather === 'snow' ? 0xdfe6ea : 0x2f6e40 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; apron.receiveShadow = true; scene.add(apron);

    // ---- стадіон: розмір за місткістю ----
    const cap = opts.capacity || 20000;
    const big = cap >= 35000, mid = cap >= 12000;
    const LONG = big ? [{ rows: 18, rise: 0.42 }, { rows: 14, rise: 0.6, gap: 2.4, wall: 2.6 }] : mid ? [{ rows: 16, rise: 0.42 }, { rows: 8, rise: 0.55, gap: 2.2, wall: 2.4 }] : [{ rows: 10, rise: 0.4 }];
    const ENDS = big ? [{ rows: 16, rise: 0.42 }, { rows: 10, rise: 0.6, gap: 2.4, wall: 2.6 }] : mid ? [{ rows: 14, rise: 0.42 }] : [{ rows: 6, rise: 0.38 }];
    const seatHex = opts.seat || (lum(opts.kit[0][0]) > 0.75 ? opts.kit[0][1] : opts.kit[0][0]);
    const seatMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(seatHex).lerp(new THREE.Color(0x3a4048), 0.45) });
    const concrete = new THREE.MeshLambertMaterial({ color: 0x5f656d });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xc9ced4, side: THREE.DoubleSide });
    const stands = [];
    const zL = WD / 2 + 7.5, xE = L / 2 + 8.5, lenL = L + 50, lenE = 2 * zL; // довгі трибуни заходять за кути — без дірок
    const buildStand = (tiers, len, pos, ry, roof) => {
      const pr = standProfile(THREE, tiers);
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); g.rotation.y = ry;
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(pr.shape, { depth: len, bevelEnabled: false }), seatMat);
      m.castShadow = !!Q.shadow; g.add(m);
      if (roof) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(pr.depth + 5, 0.5, len + 1), roofMat); r.position.set(pr.depth / 2 - 2.5, pr.top + 4.5, len / 2); r.castShadow = !!Q.shadow; g.add(r);
        for (let s = 0; s <= len; s += len / 6) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, pr.top + 4.5, 0.4), concrete); col.position.set(pr.depth - 0.3, (pr.top + 4.5) / 2, s); col.castShadow = !!Q.shadow; g.add(col); }
        // ферми під дахом — дають смугасту тінь
        for (let s = len / 12; s < len; s += len / 12) { const tr = new THREE.Mesh(new THREE.BoxGeometry(pr.depth + 5, 0.9, 0.18), concrete); tr.position.set(pr.depth / 2 - 2.5, pr.top + 3.9, s); tr.castShadow = !!Q.shadow; g.add(tr); }
      }
      scene.add(g); g.updateMatrixWorld(true);
      stands.push({ g, pr, len, end: Math.abs(Math.sin(ry)) < 0.5 });
    };
    buildStand(LONG, lenL, [lenL / 2, zL], -Math.PI / 2, false);   // ближня (на ній камера — без даху, щоб не заступав)
    buildStand(LONG, lenL, [-lenL / 2, -zL], Math.PI / 2, mid);    // дальня — її видно на трансляції
    buildStand(ENDS, lenE, [xE, -lenE / 2], 0, big);               // праворуч
    buildStand(ENDS, lenE, [-xE, lenE / 2], Math.PI, big);         // ліворуч
    // щогли прожекторів у кутах
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const h = big ? 42 : mid ? 34 : 26, x = sx * (L / 2 + 14), z = sz * (WD / 2 + 14);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, h, 6), concrete); mast.position.set(x, h / 2, z); scene.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), new THREE.MeshLambertMaterial({ color: 0xe9edf2, emissive: 0x333333 })); head.position.set(x, h + 1, z); head.lookAt(0, 0, 0); scene.add(head);
    }

    // ---- уболівальники: тисячі фігурок (тулуб + голова), колір — кольори клубів і звичайний одяг ----
    const fill = clamp(opts.fill ?? 0.75, 0.05, 1);
    const pal = (hexes) => hexes.map((h) => new THREE.Color(h));
    const HOME = pal([opts.kit[0][0], opts.kit[0][0], opts.kit[0][1]]), AWAY = pal([opts.kit[1][0], opts.kit[1][1]]);
    const PLAIN = pal(['#e9e9e9', '#d8d8d8', '#2b2f36', '#4a5260', '#7a6a58', '#9aa6b2', '#3c4c66', '#b23a3a', '#ffffff']);
    const SKINS = pal(['#f1c9a5', '#e0ac8a', '#c68863', '#8d5a3b']);
    const fans = [];
    const v = new THREE.Vector3();
    const awayStand = stands[2]; // гості — на одній із трибун за воротами
    for (const st of stands) {
      const step = Q.seat * (st.end ? 1.05 : 1);
      for (const [u, h, ti] of st.pr.seats) {
        for (let s = 0.5; s < st.len - 0.5; s += step) {
          if ((s % 14) < 1.3) continue; // прохід зі сходами
          const centre = 1 - Math.abs(s / st.len - 0.5) * 0.5; // у центрі людей більше
          if (R() > fill * centre * (ti ? 0.9 : 1)) continue;
          v.set(u + (R() - 0.5) * 0.12, h, s + (R() - 0.5) * 0.15).applyMatrix4(st.g.matrixWorld);
          const away = st === awayStand && s > st.len * 0.55;
          const r = R(), col = away ? AWAY[Math.floor(R() * AWAY.length)] : r < 0.45 ? HOME[Math.floor(R() * HOME.length)] : PLAIN[Math.floor(R() * PLAIN.length)];
          fans.push({ x: v.x, y: v.y, z: v.z, ry: st.g.rotation.y, col, skin: SKINS[Math.floor(R() * SKINS.length)], team: away ? 1 : r < 0.75 ? 0 : 2, ph: R() * 6.28 });
        }
      }
    }
    const torsoG = new THREE.BoxGeometry(0.44, 0.55, 0.3), headG = new THREE.SphereGeometry(0.13, 6, 5);
    const fanBody = new THREE.InstancedMesh(torsoG, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, fans.length));
    const fanHead = new THREE.InstancedMesh(headG, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, fans.length));
    fanBody.frustumCulled = fanHead.frustumCulled = false;
    const M4 = new THREE.Matrix4(), Qt = new THREE.Quaternion(), V1 = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), YA = new THREE.Vector3(0, 1, 0);
    fans.forEach((f, i) => {
      Qt.setFromAxisAngle(YA, f.ry);
      M4.compose(V1.set(f.x, f.y + 0.5, f.z), Qt, S1); fanBody.setMatrixAt(i, M4); fanBody.setColorAt(i, f.col);
      M4.compose(V1.set(f.x, f.y + 0.92, f.z), Qt, S1); fanHead.setMatrixAt(i, M4); fanHead.setColorAt(i, f.skin);
    });
    if (!fans.length) { fanBody.count = 0; fanHead.count = 0; }
    scene.add(fanBody, fanHead);
    let cheer = null; // { k, t0 } — святкування гола

    // ---- рекламні щити (на дальній бровці — розрив для лав запасних) ----
    const brands = BRANDS.slice();
    if (opts.sponsor) brands.splice(0, 0, [String(opts.sponsor).toUpperCase(), opts.kit[0][0], lum(opts.kit[0][0]) > 0.6 ? '#111' : '#fff']);
    const ads = [];
    const adBoard = (len, x, z, ry, rep, shift) => {
      const tex = adTexture(THREE, brands); tex.repeat.set(rep, 1); tex.offset.x = shift;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, 0.45, z); m.rotation.y = ry; scene.add(m);
      ads.push(tex);
    };
    const gapW = 34, sideLen = (L + 10 - gapW) / 2;
    adBoard(sideLen, -(gapW / 2 + sideLen / 2), -(WD / 2 + 4), 0, 0.6, 0);
    adBoard(sideLen, gapW / 2 + sideLen / 2, -(WD / 2 + 4), 0, 0.6, 0.4);
    adBoard(L + 10, 0, WD / 2 + 4, Math.PI, 1.6, 0.5);
    adBoard(WD - 8, -(L / 2 + 5), 0, Math.PI / 2, 0.6, 0.2);
    adBoard(WD - 8, L / 2 + 5, 0, -Math.PI / 2, 0.6, 0.7);
    let adClock = 0;

    // ---- ворота й кутові прапорці ----
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const nets = [];
    for (const side of [-1, 1]) {
      const gx = side * L / 2;
      const post = (z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.44, 8), white); m.position.set(gx, 1.22, z); m.castShadow = !!Q.shadow; scene.add(m); };
      post(-3.66); post(3.66);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 8), white); bar.rotation.x = Math.PI / 2; bar.position.set(gx, 2.44, 0); bar.castShadow = !!Q.shadow; scene.add(bar);
      const pts = [];
      const back = gx + side * 2;
      for (let z = -3.66; z <= 3.661; z += 0.3) { pts.push(gx, 2.44, z, back, 1.6, z, back, 1.6, z, back, 0, z); }
      for (let y = 0; y <= 1.61; y += 0.3) pts.push(back, y, -3.66, back, y, 3.66);
      for (let t = 0; t <= 1.001; t += 0.25) { const y = 2.44 - t * 0.84, x = gx + side * 2 * t; pts.push(x, y, -3.66, x, y, 3.66); }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const net = new THREE.LineSegments(ng, netMat); scene.add(net); nets.push({ net, side, shake: 0 });
    }
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xf2d22e, side: THREE.DoubleSide });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), white); p.position.set(sx * L / 2, 0.75, sz * WD / 2); scene.add(p);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32), flagMat); f.position.set(sx * L / 2 + 0.22, 1.33, sz * WD / 2); scene.add(f);
    }

    // ---- фігури (гравці, судді, запасні, тренери) ----
    const GEO = {
      torso: new THREE.CylinderGeometry(0.27, 0.21, 0.62, 12, 1, true), cap: new THREE.CircleGeometry(0.27, 12), shorts: new THREE.CylinderGeometry(0.24, 0.25, 0.3, 10),
      thigh: new THREE.BoxGeometry(0.15, 0.42, 0.17), shin: new THREE.BoxGeometry(0.12, 0.42, 0.13), boot: new THREE.BoxGeometry(0.12, 0.08, 0.26),
      upper: new THREE.BoxGeometry(0.11, 0.3, 0.11), fore: new THREE.BoxGeometry(0.09, 0.28, 0.09), neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6),
      head: new THREE.SphereGeometry(0.125, 12, 10), hair: new THREE.SphereGeometry(0.132, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      shadow: new THREE.CircleGeometry(0.45, 16), flag: new THREE.BoxGeometry(0.02, 0.28, 0.36), stick: new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4),
    };
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    const SKIN = [0xf1c9a5, 0xe0ac8a, 0xc68863, 0x8d5a3b, 0x5c3a24].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const HAIR = [0x1d1612, 0x3a2717, 0x5b3c22, 0x8a6a3a, 0xc8a46a, 0x111111].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const BOOT = new THREE.MeshLambertMaterial({ color: 0x151515 });
    const GK_KIT = [['#d8e021', '#1d1d1d'], ['#26c3e6', '#1d1d1d']];
    const mats = new Map();
    const mat = (hex) => { if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) })); return mats.get(hex); };
    function hashS(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
    const shadowOn = !!Q.shadow;
    /** Людська фігура. kit: { shirt, trim, shorts, socks, num }. */
    function makeFigure(id, kit) {
      const g = new THREE.Group();
      const add = (geo, m, x, y, z, parent = g) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.castShadow = shadowOn; parent.add(mm); return mm; };
      const shirtM = kit.num != null ? new THREE.MeshLambertMaterial({ map: shirtTexture(THREE, kit.num, kit.shirt, kit.trim) }) : mat(kit.shirt);
      add(GEO.torso, shirtM, 0, 1.24, 0);
      const top = add(GEO.cap, mat(kit.shirt), 0, 1.55, 0); top.rotation.x = -Math.PI / 2;
      add(GEO.shorts, mat(kit.shorts), 0, 0.86, 0);
      const h = hashS(String(id)), skin = SKIN[h % SKIN.length];
      add(GEO.neck, skin, 0, 1.6, 0);
      add(GEO.head, skin, 0, 1.75, 0);
      add(GEO.hair, HAIR[(h >> 3) % HAIR.length], 0, 1.765, -0.005);
      const limb = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p; };
      const leg = (x) => {
        const hip = limb(x, 0.84);
        add(GEO.thigh, skin, 0, -0.21, 0, hip);
        const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
        add(GEO.shin, mat(kit.socks), 0, -0.21, 0, knee);
        add(GEO.boot, BOOT, 0, -0.43, 0.05, knee);
        return { hip, knee };
      };
      const arm = (x) => {
        const sh = limb(x, 1.5);
        add(GEO.upper, mat(kit.shirt), 0, -0.15, 0, sh);
        const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el);
        add(GEO.fore, skin, 0, -0.14, 0, el);
        return { sh, el };
      };
      const lL = leg(-0.12), lR = leg(0.12), aL = arm(-0.33), aR = arm(0.33);
      let blob = null;
      if (!shadowOn) { blob = new THREE.Mesh(GEO.shadow, shadowMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; g.add(blob); }
      scene.add(g);
      return { g, lL, lR, aL, aR, x: null, z: null, tx: 0, tz: 0, phase: Math.random() * 6, head: 0, speed: 0, label: null, labelAt: 0 };
    }
    function animate(P, dt, k) {
      const nx = P.x + (P.tx - P.x) * k, nz = P.z + (P.tz - P.z) * k;
      const vx = (nx - P.x) / Math.max(dt, 1e-3), vz = (nz - P.z) / Math.max(dt, 1e-3);
      const sp = Math.hypot(vx, vz);
      P.speed = P.speed + (sp - P.speed) * 0.2;
      if (sp > 0.4) { const want = Math.atan2(vx, vz); let d = want - P.head; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; P.head += d * Math.min(1, dt * 8); }
      else if (P.face != null) { let d = P.face - P.head; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; P.head += d * Math.min(1, dt * 3); }
      P.x = nx; P.z = nz;
      P.phase += dt * (3 + Math.min(P.speed, 40) * 0.3);
      const sw = Math.min(0.85, P.speed * 0.035), s = Math.sin(P.phase);
      P.lL.hip.rotation.x = s * sw; P.lR.hip.rotation.x = -s * sw;
      P.lL.knee.rotation.x = Math.max(0, -s) * sw * 1.4 + 0.05; P.lR.knee.rotation.x = Math.max(0, s) * sw * 1.4 + 0.05;
      P.aL.sh.rotation.x = -s * sw * 0.9; P.aR.sh.rotation.x = s * sw * 0.9;
      P.aL.el.rotation.x = -0.25 - sw * 0.9; P.aR.el.rotation.x = -0.25 - sw * 0.9;
      P.g.position.set(P.x, Math.abs(s) * sw * 0.07, P.z);
      P.g.rotation.y = P.head;
    }

    const players = new Map();
    function makePlayer(id) {
      const inf = opts.info(id) || { k: 0, num: '', gk: false };
      const [fill2, trim] = inf.gk ? GK_KIT[inf.k] : opts.kit[inf.k];
      const shorts = lum(fill2) > 0.75 ? (lum(trim) > 0.75 ? '#1d2735' : trim) : inf.gk ? '#1d1d1d' : (lum(trim) < 0.2 ? trim : '#f2f2f2');
      const P = makeFigure(id, { shirt: fill2, trim, shorts, socks: inf.gk ? '#1d1d1d' : fill2, num: inf.num });
      P.k = inf.k;
      players.set(id, P);
      return P;
    }
    // судді: чорна форма; бокові — з прапорцями
    const REF = { shirt: '#1b1b1b', trim: '#f2d22e', shorts: '#111111', socks: '#111111' };
    const officials = [makeFigure('ref', REF), makeFigure('ar1', REF), makeFigure('ar2', REF)];
    for (const a of officials.slice(1)) { const st = new THREE.Mesh(GEO.stick, mat('#dddddd')); st.position.set(0, -0.2, 0.05); a.aR.el.add(st); const fl = new THREE.Mesh(GEO.flag, mat('#f2c12e')); fl.position.set(0, -0.4, 0.2); a.aR.el.add(fl); }
    officials[0].x = -4; officials[0].z = 6; officials[1].x = 10; officials[1].z = -(WD / 2 + 0.8); officials[2].x = -10; officials[2].z = WD / 2 + 0.8;
    // лави запасних і тренери (на дальній бровці)
    const bench = opts.bench || [7, 7];
    const BIBS = ['#e9d43a', '#f08a24'];
    const shelterMat = new THREE.MeshLambertMaterial({ color: 0xd8dde3, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (const k of [0, 1]) {
      const cx = (k ? 1 : -1) * 9, z0 = -(WD / 2 + 5.2);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 2.2), shelterMat); roof.position.set(cx, 2.2, z0 - 0.2); scene.add(roof);
      const back = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 0.1), shelterMat); back.position.set(cx, 1.1, z0 - 1.3); scene.add(back);
      for (const sx of [-4.5, 4.5]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 2.2), shelterMat); sd.position.set(cx + sx, 1.1, z0 - 0.2); scene.add(sd); }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.45, 0.6), mat('#33404f')); seat.position.set(cx, 0.22, z0 - 0.7); scene.add(seat);
      for (let i = 0; i < Math.min(9, bench[k] || 0); i++) {
        const sub = new THREE.Group(); sub.position.set(cx - 3.6 + i * 0.9, 0.3, z0 - 0.7);
        const b = new THREE.Mesh(GEO.torso, mat(BIBS[k])); b.position.y = 0.6; sub.add(b);
        const hd = new THREE.Mesh(GEO.head, SKIN[(i * 3 + k) % SKIN.length]); hd.position.y = 1.08; sub.add(hd);
        const lg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.45), mat(opts.kit[k][0])); lg.position.set(0, 0.28, 0.25); sub.add(lg);
        scene.add(sub);
      }
      const coach = makeFigure('coach' + k, { shirt: '#20252d', trim: '#20252d', shorts: '#20252d', socks: '#20252d' });
      coach.x = coach.tx = cx + (k ? -3 : 3); coach.z = coach.tz = -(WD / 2 + 2.2); coach.face = 0; coach.coach = true;
      officials.push(coach);
    }

    // м'яч
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshLambertMaterial({ map: ballTexture(THREE) }));
    ball.castShadow = shadowOn; scene.add(ball);
    const bshadow = new THREE.Mesh(GEO.shadow, shadowMat); bshadow.rotation.x = -Math.PI / 2; bshadow.position.y = 0.02; bshadow.visible = !shadowOn; scene.add(bshadow);
    const B = { x: 0, z: 0, y: 0.22, tx: 0, tz: 0, ty: 0.22, holder: null, last: null, lastAt: 0, spin: 0 };

    // погода: дощ або сніг частинками навколо камери
    let precip = null;
    if (weather === 'rain' || weather === 'snow') {
      const n = qk === 'low' ? 700 : 1800, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (R() - 0.5) * 140; pos[i * 3 + 1] = R() * 40; pos[i * 3 + 2] = (R() - 0.5) * 110; }
      const gq = new THREE.BufferGeometry(); gq.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(gq, new THREE.PointsMaterial({ color: weather === 'snow' ? 0xffffff : 0xcfd8e2, size: weather === 'snow' ? 0.35 : 0.14, transparent: true, opacity: weather === 'snow' ? 0.9 : 0.55, depthWrite: false }));
      pts.frustumCulled = false; scene.add(pts);
      precip = { pts, pos, n, speed: weather === 'snow' ? 2.2 : 24, drift: weather === 'snow' ? 0.8 : 0.2 };
    }

    // ---- камера ----
    let camMode = opts.camera || 'director', replayCam = 'goal', replaying = false;
    const cam = { x: 0, y: 30, z: 60, lx: 0, ly: 0, lz: 0, fov: 28 };
    const dir = { mode: 'tv', until: 0, end: 1 };
    let cut = true;
    /** Подія для «Режисера»: удар — план із-за воріт, гол — довше там же. */
    function cue(kind, k) {
      if (camMode !== 'director') return;
      const now = performance.now(), end = (B.tx || B.x) >= 0 ? 1 : -1; void k;
      if (kind === 'shot' && dir.mode === 'tv') { Object.assign(dir, { mode: 'goalHigh', until: now + 2600, end }); cut = true; }
      if (kind === 'goal') { Object.assign(dir, { mode: 'goalHigh', until: now + 3600, end }); cut = true; }
      if (kind === 'reset' && dir.mode !== 'tv') { dir.mode = 'tv'; cut = true; }
    }
    function celebrate(k) { cheer = { k, t0: performance.now() }; const n = nets.find((x) => x.side === (k === 0 ? 1 : -1)); if (n) n.shake = 1; }

    /** Новий кадр рушія: цілі для плавного руху. */
    let lastShow = 0, idle = 0;
    function show(f) {
      if (!f) return;
      lastShow = performance.now();
      const seen = new Set();
      for (let i = 0; i < f.pos.length; i += 4) {
        const id = f.pos[i];
        const P = players.get(id) || makePlayer(id);
        const x = (f.pos[i + 1] / 100) * L - L / 2, z = (f.pos[i + 2] / 100) * WD - WD / 2;
        if (P.x == null || Math.hypot(x - P.x, z - P.z) > 18) { P.x = x; P.z = z; } // телепорт (розстановка) — без ковзання
        P.tx = x; P.tz = z; P.g.visible = true;
        seen.add(id);
      }
      for (const [id, P] of players) if (!seen.has(id)) P.g.visible = false;
      if (f.h !== B.holder) { if (B.holder) { B.last = B.holder; B.lastAt = performance.now(); } B.holder = f.h; }
      B.tx = (f.bx / 100) * L - L / 2; B.tz = (f.by / 100) * WD - WD / 2; B.ty = 0.22 + (f.bz || 0);
      if (Math.hypot(B.tx - B.x, B.tz - B.z) > 30) { B.x = B.tx; B.z = B.tz; }
    }
    function setCamera(mode) { camMode = mode; dir.mode = 'tv'; cut = true; }
    function setReplayCamera(mode) { replayCam = mode; }
    function replay(on) { replaying = on; cut = true; }

    function resize() {
      const w = container.clientWidth || 640, h = container.clientHeight || 360;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    let ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(container); }
    resize();

    /** Ім'я над гравцем (з м'ячем і щойно віддав пас). */
    function setLabel(P, id, on) {
      if (on && !P.label && opts.name) {
        const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(THREE, opts.name(id) || ''), depthTest: false, transparent: true }));
        sp2.scale.set(3.4, 0.64, 1); sp2.position.y = 2.45; sp2.renderOrder = 10; P.g.add(sp2); P.label = sp2;
      }
      if (P.label) P.label.visible = on;
    }

    let last = performance.now(), alive = true, raf = 0;
    function frame(now) {
      if (!alive) return;
      if (!renderer.domElement.isConnected) { dispose(); return; }
      // пауза (нових кадрів понад 2 с) — малюємо рідко, щоб берегти батарею
      if (now - lastShow > 2000 && !cheer && (idle++ % 12) !== 0) { last = now; raf = root.requestAnimationFrame(frame); return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 9); // плавність: наздогнати ціль за ~0,3 с
      for (const [id, P] of players) {
        if (!P.g.visible || P.x == null) continue;
        animate(P, dt, k);
        setLabel(P, id, id === B.holder || (id === B.last && now - B.lastAt < 1800));
      }
      // судді: головний — по діагоналі від м'яча, бокові — уздовж своїх половин бровки
      const ref = officials[0], a1 = officials[1], a2 = officials[2];
      ref.tx = clamp(B.x - 7, -L / 2 + 6, L / 2 - 6); ref.tz = clamp(B.z * 0.55 + 9, -WD / 2 + 3, WD / 2 - 3);
      a1.tx = clamp(B.x > -8 ? B.x + 3 : 6, 2, L / 2 - 1); a1.tz = -(WD / 2 + 0.8);
      a2.tx = clamp(B.x < 8 ? B.x - 3 : -6, -L / 2 + 1, -2); a2.tz = WD / 2 + 0.8;
      for (const o of officials) {
        const kk = o.coach ? k * 0.3 : k * 0.55;
        o.tx = o.coach ? clamp(B.x * 0.08 + (o.tx > 0 ? 6 : -6), -12, 12) : o.tx;
        if (o.coach) o.face = Math.atan2(B.x - o.x, B.z - o.z);
        animate(o, dt, kk);
      }
      // м'яч: котиться й обертається
      const bk = 1 - Math.exp(-dt * 12);
      const ox = B.x, oz = B.z;
      B.x += (B.tx - B.x) * bk; B.z += (B.tz - B.z) * bk; B.y += (B.ty - B.y) * bk;
      ball.position.set(B.x, B.y, B.z);
      ball.rotation.x += (B.z - oz) / 0.22; ball.rotation.z -= (B.x - ox) / 0.22;
      bshadow.position.set(B.x, 0.02, B.z); const s = Math.max(0.25, 0.6 - B.y * 0.04); bshadow.scale.set(s, s, s);
      // LED-щити: кожні 8 с стрічка зсувається на одну панель
      adClock += dt;
      const step = Math.floor(adClock / 8), frac = Math.min(1, (adClock % 8) / 0.6);
      for (const t of ads) t.offset.x = (t.userData.base ?? (t.userData.base = t.offset.x)) + (step + frac) / brands.length;
      // сітка воріт після гола
      for (const n of nets) { if (n.shake > 0) { n.shake = Math.max(0, n.shake - dt * 0.8); n.net.position.x = n.side * Math.sin(now / 40) * 0.08 * n.shake; } }
      // трибуни святкують гол
      if (cheer) {
        const t = (now - cheer.t0) / 1000, arr = fanBody.instanceMatrix.array, harr = fanHead.instanceMatrix.array;
        const on = t < 4.5;
        for (let i = 0; i < fans.length; i++) {
          const f = fans[i];
          const jump = on && (f.team === cheer.k || (f.team === 2 && cheer.k === 0)) ? Math.abs(Math.sin(t * 8 + f.ph)) * 0.35 * Math.min(1, (4.5 - t)) : 0;
          arr[i * 16 + 13] = f.y + 0.5 + jump; harr[i * 16 + 13] = f.y + 0.92 + jump;
        }
        fanBody.instanceMatrix.needsUpdate = true; fanHead.instanceMatrix.needsUpdate = true;
        if (!on) cheer = null;
      }
      // дощ / сніг
      if (precip) {
        const p = precip.pos;
        for (let i = 0; i < precip.n; i++) {
          p[i * 3 + 1] -= precip.speed * dt; p[i * 3] += precip.drift * dt;
          if (p[i * 3 + 1] < 0) { p[i * 3 + 1] += 40; p[i * 3] = cam.lx + (Math.random() - 0.5) * 140; p[i * 3 + 2] = cam.lz + (Math.random() - 0.5) * 110; }
        }
        precip.pts.geometry.attributes.position.needsUpdate = true;
      }
      // камера
      const narrow = camera.aspect < 1.5;
      if (camMode === 'director' && dir.mode !== 'tv' && now > dir.until) { dir.mode = 'tv'; cut = true; }
      let mode = replaying ? (replayCam === 'director' ? 'goalHigh' : replayCam) : camMode === 'director' ? dir.mode : camMode;
      if (mode === 'director') mode = 'tv';
      let px, py, pz, lx = B.x, ly = Math.min(B.y, 3) * 0.4, lz = B.z, fov;
      const near = Math.abs(B.x) > L / 2 - 24; // м'яч у штрафному майданчику чи біля нього
      if (mode === 'top') { px = B.x * 0.6; py = 72; pz = 30; lz = B.z * 0.5; fov = narrow ? 44 : 36; }
      else if (mode === 'side') { px = clamp(B.x, -L / 2 + 4, L / 2 - 4); py = 4.2; pz = WD / 2 + 6.5; lz = B.z * 0.8; fov = narrow ? 44 : 34; }
      else if (mode === 'goal') { const end = B.x >= 0 ? 1 : -1; px = end * (L / 2 + 7); py = 6.5; pz = B.z * 0.3; fov = narrow ? 56 : 48; }
      else if (mode === 'goalHigh') { const end = replaying || camMode !== 'director' ? (B.x >= 0 ? 1 : -1) : dir.end; px = end * (L / 2 + 7.5); py = 11; pz = B.z * 0.3 + 7; lx = end * (L / 2 - 16); lz = B.z * 0.6; fov = narrow ? 54 : 46; }
      else { // «Трансляція»: висока бокова камера, ближче біля воріт
        const zoom = camMode === 'director' && near ? 0.82 : 1;
        const bz = clamp(B.z, -WD / 2, WD / 2);
        px = clamp(B.x * 0.92, -L / 2 + 8, L / 2 - 8); py = (narrow ? 23 : 25) * zoom; pz = WD / 2 + (narrow ? 24 : 27) * zoom + bz * 0.15; lz = clamp(bz * 0.6 - 4, -30, 10); ly = 2; fov = narrow ? 33 : 27;
      }
      const ck = cut ? 1 : 1 - Math.exp(-dt * 2.6);
      cut = false;
      cam.x += (px - cam.x) * ck; cam.y += (py - cam.y) * ck; cam.z += (pz - cam.z) * ck;
      cam.lx += (lx - cam.lx) * ck; cam.ly += (ly - cam.ly) * ck; cam.lz += (lz - cam.lz) * ck;
      cam.fov += (fov - cam.fov) * ck;
      camera.position.set(cam.x, cam.y, cam.z);
      if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
      camera.lookAt(cam.lx, cam.ly, cam.lz);
      renderer.render(scene, camera);
      raf = root.requestAnimationFrame(frame);
    }
    raf = root.requestAnimationFrame(frame);

    function dispose() {
      if (!alive) return;
      alive = false;
      root.cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    return { show, setCamera, setReplayCamera, replay, cue, celebrate, dispose, el: renderer.domElement, quality: qk, fans: fans.length, get camera() { return camMode; } };
  }

  const CAMERAS = [['director', 'Режисер'], ['tv', 'Трансляція'], ['side', 'Бровка'], ['top', 'Згори'], ['goal', 'З-за воріт']];
  FM.view3d = { supported, create, BRANDS, QUALITY, CAMERAS, autoQuality };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
