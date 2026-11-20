// Один HTML-файл з усією грою (стилі, база, скрипти всередині): відкривається подвійним кліком без інтернету.
// Запуск: npm run bundle → dist/golovnyi-trener.html
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// шрифти з інтернету — прибираємо (без мережі однаково не завантажаться; є запасні системні)
html = html.replace(/\s*<link rel="preconnect"[^>]*>/g, '').replace(/\s*<link rel="stylesheet" href="https:[^>]*>/g, '');
html = html.replace(/\s*<link rel="manifest"[^>]*>/g, '').replace(/\s*<link rel="icon"[^>]*>/g, '');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => `<style>\n${fs.readFileSync(path.join(root, href), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${code}\n</script>`;
});
const out = path.join(root, 'dist', 'golovnyi-trener.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Готово: ${path.relative(root, out)}, ${(html.length / 1024 / 1024).toFixed(1)} МБ`);
