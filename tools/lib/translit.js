// Зворотна транслітерація українських імен з латиниці (офіційна система 2010 року) — лише для гравців
// зі збірної України, яких немає у Вікіданих українською. Наближено: м'який знак і апостроф латиниця
// не передає, тож відновлюємо їх за поширеними закінченнями й поєднаннями.
'use strict';

const MULTI = [
  ['shch', 'щ'], ['zgh', 'зг'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'], ['zh', 'ж'],
];
const START = { ye: 'є', yi: 'ї', yu: 'ю', ya: 'я' };
const MID = { ie: 'є', iu: 'ю', ia: 'я', ye: 'є', yu: 'ю', ya: 'я', yi: 'ї' };
const ONE = { a: 'а', b: 'б', v: 'в', h: 'г', g: 'ґ', d: 'д', e: 'е', z: 'з', y: 'и', i: 'і', k: 'к', l: 'л', m: 'м', n: 'н',
  o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', j: 'й', c: 'к', w: 'в', x: 'кс', q: 'к' };
const VOW = 'аеєиіїоуюя';

function word(w) {
  const lw = w.toLowerCase();
  let out = '';
  for (let i = 0; i < lw.length;) {
    const rest = lw.slice(i);
    const prev = out.slice(-1);
    const atStart = i === 0;
    // «-iy», «-yi», «-ii» наприкінці — «-ій» / «-ий»
    if (/^(iy|ii)$/.test(rest)) { out += 'ій'; break; }
    if (rest === 'yi' && !atStart) { out += VOW.includes(prev) ? 'ї' : 'ий'; break; }
    if (rest === 'y' && !atStart && VOW.includes(prev)) { out += 'й'; break; }
    const m = MULTI.find(([l]) => rest.startsWith(l));
    if (m) { out += m[1]; i += m[0].length; continue; }
    const two = rest.slice(0, 2);
    if (atStart && START[two]) { out += START[two]; i += 2; continue; }
    if (!atStart && VOW.includes(prev) && START[two]) { out += START[two]; i += 2; continue; } // «Andriyenko»
    if (!atStart && MID[two] && !(two[0] === 'y' && !VOW.includes(prev) && two !== 'yu' && two !== 'ya' && two !== 'ye')) { out += MID[two]; i += 2; continue; }
    if (rest[0] === 'y' && !atStart && VOW.includes(prev)) { out += 'й'; i += 1; continue; } // «Oleksiy» усередині, «Mykolayovych»
    out += ONE[rest[0]] != null ? ONE[rest[0]] : rest[0];
    i += 1;
  }
  // м'який знак: «-lnyk», «-lchuk», «-lskyi», «-tskyi», «-nko» не чіпаємо
  out = out.replace(/л(?=[бвгґджзкмнпрстфхцчшщ])/g, 'ль').replace(/льль/g, 'ль')
    .replace(/цьк/g, 'цьк').replace(/([нстдлз])ськ/g, '$1ськ').replace(/ск(ий|а)$/, 'ськ$1').replace(/цк(ий|а)$/, 'цьк$1');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** «Mykyta Melnyk» → «Микита Мельник». */
function toUk(name) {
  return String(name).split(/(\s+|-)/).map((w) => (/^[A-Za-z']+$/.test(w) ? word(w.replace(/'/g, '')) : w)).join('');
}

module.exports = { toUk };
