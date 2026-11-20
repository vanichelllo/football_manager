// Розширення 15: звук трансляції, синтезований WebAudio (без файлів): свисток, трибуни, гол, небезпечний момент.
// Вимкнено, доки людина не ввімкне (браузери однаково не грають звук без дії людини).
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const KEY = 'golovnyi-trener:sound';
  let ctx = null, crowd = null, on = false;
  try { on = root.localStorage && root.localStorage.getItem(KEY) === '1'; } catch (_) { on = false; }

  function ac() {
    if (!ctx) { const C = root.AudioContext || root.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  /** Шум (для трибун): буфер білого шуму, пропущений крізь смуговий фільтр. */
  function noise(c, secs, freq, q, gain, attack = 0.05, release = 0.6) {
    const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + Math.max(attack, secs - release)); g.gain.linearRampToValueAtTime(0, t + secs);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    return { src, g };
  }
  /** Свисток арбітра: n свистків (1 — початок, 2 — перерва, 3 — кінець). */
  function whistle(n = 1) {
    const c = on && ac(); if (!c) return;
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + i * 0.45, len = i === n - 1 && n === 3 ? 0.9 : 0.32;
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 140; // «трель» свистка
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + len - 0.05); g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(g); g.connect(c.destination); o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
    }
  }
  /** Вибух трибун після гола (ours — ваш гол: гучніше). */
  const goal = (ours = true) => { const c = on && ac(); if (c) { noise(c, 3.2, 700, 0.6, ours ? 0.5 : 0.22, 0.15, 1.6); noise(c, 2.4, 1600, 1.2, ours ? 0.18 : 0.08, 0.1, 1.2); } };
  /** «Ох!» трибун на небезпечному моменті. */
  const chance = () => { const c = on && ac(); if (c) noise(c, 1.1, 500, 0.9, 0.16, 0.08, 0.7); };
  /** Фоновий гул стадіону. */
  function ambient(start) {
    if (crowd) { try { crowd.src.stop(); } catch (_) { /* уже зупинено */ } crowd = null; }
    const c = start && on && ac(); if (!c) return;
    crowd = noise(c, 600, 450, 0.4, 0.04, 1.5, 1);
  }
  function set(v) {
    on = !!v;
    try { root.localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* приватне вікно */ }
    if (!on) ambient(false);
  }
  FM.sound = { get on() { return on; }, set, whistle, goal, chance, ambient };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
