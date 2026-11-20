#!/usr/bin/env node
// Записує js/version.js: коли й з якого коміту зібрано гру (показується в «Налаштуваннях»).
// Запускає процес «Публікація» перед викладанням на GitHub Pages: node tools/version.js "GitHub Pages" [шлях]
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const source = process.argv[2] || 'локальна збірка';
const out = process.argv[3] || path.join(__dirname, '..', 'js', 'version.js');
let commit = (process.env.GITHUB_SHA || '').slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') }).toString().trim(); } catch (_) { commit = ''; } }
const v = { built: new Date().toISOString(), commit, source };
fs.writeFileSync(out, `// Згенеровано tools/version.js — не редагувати вручну.\nwindow.FM_VERSION = ${JSON.stringify(v)};\n`);
console.log('Версія:', v);
