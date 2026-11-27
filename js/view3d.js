// 3D-вид матчу: те саме, що рахує детальний рушій (js/sim.js), — у перспективі. Поле 105×68 м, прості фігурки гравців
// у кольорах клубів з номерами (біг — рухи ніг і рук), м'яч летить по дузі (висота з рушія), тіні, трибуни.
// Камери: «ТВ» збоку, «згори», «з-за воріт». Використовує Three.js (js/vendor/three.min.js, MIT).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const L = 105, WD = 68;

  function supported() {
    try {
      if (!root.THREE || !root.document) return false;
      const c = document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (_) { return false; }
  }

  /** Текстура поля: смуги газону й розмітка в масштабі (10 пікселів на метр). */
  function pitchTexture(THREE) {
    const S = 10, cw = (L + 8) * S, ch = (WD + 8) * S, o = 4 * S;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#2c7a4b' : '#33874f'; g.fillRect((i * cw) / 18, 0, cw / 18 + 1, ch); }
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 2.4; g.fillStyle = 'rgba(255,255,255,0.92)';
    const X = (m) => o + m * S, Y = (m) => o + m * S;
    g.strokeRect(X(0), Y(0), L * S, WD * S);
    g.beginPath(); g.moveTo(X(L / 2), Y(0)); g.lineTo(X(L / 2), Y(WD)); g.stroke();
    g.beginPath(); g.arc(X(L / 2), Y(WD / 2), 9.15 * S, 0, Math.PI * 2); g.stroke();
    const spot = (x, y) => { g.beginPath(); g.arc(X(x), Y(y), 3, 0, Math.PI * 2); g.fill(); };
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
    t.anisotropy = 4;
    return t;
  }
  /** Трибуни: шум кольорових цяток — уболівальники. */
  function crowdTexture(THREE, colors) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#20262d'; g.fillRect(0, 0, 256, 64);
    const pal = ['#d9d9d9', '#5a6470', '#8c96a0', '#2f3740', ...colors, ...colors];
    for (let i = 0; i < 2600; i++) { g.fillStyle = pal[(i * 7919) % pal.length]; g.fillRect((i * 37) % 256, ((i * 13) % 64), 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 2);
    return t;
  }
  function numberTexture(THREE, text, bg, fg) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = fg; g.stroke();
    g.fillStyle = fg; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(text).slice(0, 3), 32, 34);
    return new THREE.CanvasTexture(c);
  }
  // Рекламні щити: вигадані бренди (без справжніх компаній), спонсор клубу — частіше
  const BRANDS = [['КАВУН БАНК', '#1f8a4c', '#fff'], ['СТРУМОК • вода', '#1d6fd1', '#fff'], ['ВІТРИЛО АВТО', '#e8e8e8', '#14213d'], ['КЛЮЧ мобайл', '#ffcc00', '#111'],
    ['КОЛОСОК', '#c8752a', '#fff'], ['ЗЛАГОДА страхування', '#4b2a87', '#fff'], ['ПОЛЕТЕХ', '#111', '#3fe07a'], ['БУРШТИН', '#f2a51a', '#2b1a00'], ['СОКІЛ СПОРТ', '#d12f2f', '#fff']];
  /** Стрічка реклами: бренди підряд на кольорових панелях; повторюється, тож її можна прокручувати. */
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
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  /**
   * container — куди вставити полотно. opts: { kit: [[колір, оздоблення], …] на дві команди,
   *   info(id) → { k: 0|1, num, gk: bool } }.
   * Повертає { show(frame), setCamera(mode), replay(on), dispose(), el }.
   */
  function create(container, opts) {
    const THREE = root.THREE;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.domElement.className = 'v3d-canvas';
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1116);
    scene.fog = new THREE.Fog(0x0d1116, 140, 300);
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 600);
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x203024, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(-30, 90, 40); scene.add(sun);

    // поле й навколо
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, WD + 8), new THREE.MeshLambertMaterial({ map: pitchTexture(THREE) }));
    grass.rotation.x = -Math.PI / 2; scene.add(grass);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 60, WD + 60), new THREE.MeshLambertMaterial({ color: 0x245c39 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02; scene.add(apron);
    // трибуни (схематично): чотири ступінчасті блоки з «уболівальниками»
    const crowd = new THREE.MeshLambertMaterial({ map: crowdTexture(THREE, [opts.kit[0][0], opts.kit[1][0]]) });
    const stand = (w, d, x, z, ry) => {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), crowd);
        m.position.set(x + Math.sin(ry) * i * d, 1.6 + i * 3.2, z + Math.cos(ry) * i * d); m.rotation.y = ry; scene.add(m);
      }
    };
    stand(L + 30, 5, 0, WD / 2 + 12, 0); stand(L + 30, 5, 0, -(WD / 2 + 12), Math.PI);
    stand(WD + 20, 5, L / 2 + 14, 0, Math.PI / 2); stand(WD + 20, 5, -(L / 2 + 14), 0, -Math.PI / 2);
    // рекламні щити вздовж бровок і за воротами (LED: стрічка повільно прокручується)
    const brands = BRANDS.slice();
    if (opts.sponsor) brands.splice(0, 0, [String(opts.sponsor).toUpperCase(), opts.kit[0][0], lum(opts.kit[0][0]) > 0.6 ? '#111' : '#fff']);
    const ads = [];
    const adBoard = (len, x, z, ry, rep, shift) => {
      const tex = adTexture(THREE, brands); tex.repeat.set(rep, 1); tex.offset.x = shift;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      m.position.set(x, 0.45, z); m.rotation.y = ry; scene.add(m);
      ads.push(tex);
    };
    adBoard(L + 10, 0, -(WD / 2 + 4), 0, 1.6, 0); // дальня бровка — її видно з ТВ-камери
    adBoard(L + 10, 0, WD / 2 + 4, Math.PI, 1.6, 0.5);
    adBoard(WD - 8, -(L / 2 + 5), 0, Math.PI / 2, 0.6, 0.2);
    adBoard(WD - 8, L / 2 + 5, 0, -Math.PI / 2, 0.6, 0.7);
    let adClock = 0;
    // ворота
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    for (const side of [-1, 1]) {
      const gx = side * L / 2;
      const post = (z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.44, 8), white); m.position.set(gx, 1.22, z); scene.add(m); };
      post(-3.66); post(3.66);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 8), white); bar.rotation.x = Math.PI / 2; bar.position.set(gx, 2.44, 0); scene.add(bar);
      const pts = [];
      const back = gx + side * 2;
      for (let z = -3.66; z <= 3.661; z += 0.61) { pts.push(gx, 2.44, z, back, 1.6, z, back, 1.6, z, back, 0, z); }
      for (let y = 0; y <= 1.61; y += 0.4) pts.push(back, y, -3.66, back, y, 3.66);
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.LineSegments(ng, netMat));
    }

    // гравці
    const GEO = {
      body: new THREE.CylinderGeometry(0.3, 0.34, 0.8, 10), shorts: new THREE.CylinderGeometry(0.33, 0.31, 0.32, 10),
      leg: new THREE.BoxGeometry(0.15, 0.68, 0.17), arm: new THREE.BoxGeometry(0.11, 0.55, 0.11), head: new THREE.SphereGeometry(0.17, 12, 10),
      shadow: new THREE.CircleGeometry(0.5, 16), ring: new THREE.RingGeometry(0.55, 0.75, 24),
    };
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const SKIN = [0xf1c9a5, 0xe0ac8a, 0xc68863, 0x8d5a3b, 0x5c3a24].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const GK_KIT = [['#d8e021', '#1d1d1d'], ['#26c3e6', '#1d1d1d']];
    const mats = new Map();
    const mat = (hex) => { if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) })); return mats.get(hex); };
    const players = new Map();
    function makePlayer(id) {
      const inf = opts.info(id) || { k: 0, num: '', gk: false };
      const [fill, trim] = inf.gk ? GK_KIT[inf.k] : opts.kit[inf.k];
      const shortsHex = lum(fill) > 0.75 ? '#1d2735' : trim;
      const g = new THREE.Group();
      const body = new THREE.Mesh(GEO.body, mat(fill)); body.position.y = 1.22; g.add(body);
      const shorts = new THREE.Mesh(GEO.shorts, mat(shortsHex)); shorts.position.y = 0.78; g.add(shorts);
      const skin = SKIN[Math.abs(hashS(String(id))) % SKIN.length];
      const head = new THREE.Mesh(GEO.head, skin); head.position.y = 1.82; g.add(head);
      const limb = (geo, m, x, y, len) => { const p = new THREE.Group(); p.position.set(x, y, 0); const mm = new THREE.Mesh(geo, m); mm.position.y = -len / 2; p.add(mm); g.add(p); return p; };
      const sock = mat(trim);
      const legL = limb(GEO.leg, sock, -0.13, 0.64, 0.68), legR = limb(GEO.leg, sock, 0.13, 0.64, 0.68);
      const armL = limb(GEO.arm, mat(fill), -0.4, 1.58, 0.55), armR = limb(GEO.arm, mat(fill), 0.4, 1.58, 0.55);
      const sh = new THREE.Mesh(GEO.shadow, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh);
      const ring = new THREE.Mesh(GEO.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; g.add(ring);
      const num = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(THREE, inf.num, fill, lum(fill) > 0.6 ? '#111' : '#fff'), depthTest: false }));
      num.scale.set(0.95, 0.95, 1); num.position.y = 2.55; g.add(num);
      scene.add(g);
      const P = { g, legL, legR, armL, armR, ring, num, x: null, z: null, tx: 0, tz: 0, phase: Math.random() * 6, head: 0, speed: 0 };
      players.set(id, P);
      return P;
    }
    function hashS(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
    // м'яч
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    scene.add(ball);
    const bshadow = new THREE.Mesh(GEO.shadow, shadowMat); bshadow.rotation.x = -Math.PI / 2; bshadow.position.y = 0.02; scene.add(bshadow);
    const B = { x: 0, z: 0, y: 0.24, tx: 0, tz: 0, ty: 0.24 };

    let camMode = 'tv', replaying = false;
    const cam = { x: 0, y: 30, z: 60, lx: 0, ly: 0, lz: 0 };
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
        P.tx = x; P.tz = z; P.ring.visible = id === f.h; P.g.visible = true;
        seen.add(id);
      }
      for (const [id, P] of players) if (!seen.has(id)) P.g.visible = false;
      B.tx = (f.bx / 100) * L - L / 2; B.tz = (f.by / 100) * WD - WD / 2; B.ty = 0.24 + (f.bz || 0);
      if (Math.hypot(B.tx - B.x, B.tz - B.z) > 30) { B.x = B.tx; B.z = B.tz; }
    }
    function setCamera(mode) { camMode = mode; }
    function replay(on) { replaying = on; }

    function resize() {
      const w = container.clientWidth || 640, h = container.clientHeight || 360;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    let ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(container); }
    resize();

    let last = performance.now(), alive = true, raf = 0;
    function frame(now) {
      if (!alive) return;
      if (!renderer.domElement.isConnected) { dispose(); return; }
      // пауза (нових кадрів понад 2 с) — малюємо рідко, щоб берегти батарею
      if (now - lastShow > 2000 && (idle++ % 12) !== 0) { last = now; raf = root.requestAnimationFrame(frame); return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 9); // плавність: наздогнати ціль за ~0,3 с
      for (const P of players.values()) {
        if (!P.g.visible || P.x == null) continue;
        const nx = P.x + (P.tx - P.x) * k, nz = P.z + (P.tz - P.z) * k;
        const vx = (nx - P.x) / Math.max(dt, 1e-3), vz = (nz - P.z) / Math.max(dt, 1e-3);
        const sp = Math.hypot(vx, vz);
        P.speed = P.speed + (sp - P.speed) * 0.2;
        if (sp > 0.4) { const want = Math.atan2(vx, vz); let d = want - P.head; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; P.head += d * Math.min(1, dt * 8); }
        P.x = nx; P.z = nz;
        P.phase += dt * (3 + Math.min(P.speed, 40) * 0.25);
        const sw = Math.min(0.9, P.speed * 0.03);
        P.legL.rotation.x = Math.sin(P.phase) * sw; P.legR.rotation.x = -Math.sin(P.phase) * sw;
        P.armL.rotation.x = -Math.sin(P.phase) * sw * 0.8; P.armR.rotation.x = Math.sin(P.phase) * sw * 0.8;
        P.g.position.set(P.x, Math.abs(Math.sin(P.phase)) * sw * 0.08, P.z);
        P.g.rotation.y = P.head;
        P.num.material.rotation = 0;
      }
      // LED-щити: кожні 8 с стрічка зсувається на одну панель
      adClock += dt;
      const step = Math.floor(adClock / 8), frac = Math.min(1, (adClock % 8) / 0.6);
      for (const t of ads) t.offset.x = (t.userData.base ?? (t.userData.base = t.offset.x)) + (step + frac) / brands.length;
      const bk = 1 - Math.exp(-dt * 12);
      B.x += (B.tx - B.x) * bk; B.z += (B.tz - B.z) * bk; B.y += (B.ty - B.y) * bk;
      ball.position.set(B.x, B.y, B.z);
      bshadow.position.set(B.x, 0.02, B.z); const s = Math.max(0.25, 0.6 - B.y * 0.04); bshadow.scale.set(s, s, s);
      // камера
      let px, py, pz;
      const mode = replaying ? 'goal' : camMode;
      if (mode === 'top') { px = B.x * 0.6; py = 70; pz = 34; }
      else if (mode === 'goal') { const end = B.x >= 0 ? 1 : -1; px = end * (L / 2 + 16); py = 11; pz = B.z * 0.3; }
      else { const narrow = camera.aspect < 1.5; px = Math.max(-L / 2 + 12, Math.min(L / 2 - 12, B.x * 0.85)); py = narrow ? 19 : 24; pz = WD / 2 + (narrow ? 28 : 40); } // на телефоні камера ближче
      const ck = 1 - Math.exp(-dt * 2.5);
      cam.x += (px - cam.x) * ck; cam.y += (py - cam.y) * ck; cam.z += (pz - cam.z) * ck;
      cam.lx += (B.x - cam.lx) * ck; cam.ly += (Math.min(B.y, 3) * 0.5 - cam.ly) * ck; cam.lz += (B.z * (mode === 'tv' ? 0.6 : 1) - cam.lz) * ck;
      camera.position.set(cam.x, cam.y, cam.z);
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
    return { show, setCamera, replay, dispose, el: renderer.domElement, get camera() { return camMode; } };
  }

  FM.view3d = { supported, create, BRANDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
