// Країни: код ФІФА → українська назва; англійські назви й коди МОК → код ФІФА.
// Працює і в браузері (FM.countries), і в Node (require).
(function (root) {
  'use strict';
  // [код, українська назва, англійські назви / інші коди…]
  const LIST = [
    ['AFG', 'Афганістан', 'Afghanistan'], ['ALB', 'Албанія', 'Albania'], ['ALG', 'Алжир', 'Algeria', 'DZA'],
    ['AND', 'Андорра', 'Andorra'], ['ANG', 'Ангола', 'Angola', 'AGO'], ['ARG', 'Аргентина', 'Argentina'],
    ['ARM', 'Вірменія', 'Armenia'], ['AUS', 'Австралія', 'Australia'], ['AUT', 'Австрія', 'Austria'],
    ['AZE', 'Азербайджан', 'Azerbaijan'], ['BEL', 'Бельгія', 'Belgium'], ['BEN', 'Бенін', 'Benin'],
    ['BFA', 'Буркіна-Фасо', 'Burkina Faso'], ['BIH', 'Боснія і Герцеговина', 'Bosnia and Herzegovina', 'Bosnia'],
    ['BLR', 'Білорусь', 'Belarus'], ['BOL', 'Болівія', 'Bolivia'], ['BRA', 'Бразилія', 'Brazil'],
    ['BUL', 'Болгарія', 'Bulgaria', 'BGR'], ['BDI', 'Бурунді', 'Burundi'], ['CAN', 'Канада', 'Canada'],
    ['CHI', 'Чилі', 'Chile', 'CHL'], ['CHN', 'Китай', 'China', 'China PR'], ['CIV', 'Кот-д’Івуар', 'Ivory Coast', "Côte d'Ivoire", 'Cote d\'Ivoire'],
    ['CMR', 'Камерун', 'Cameroon'], ['COD', 'ДР Конго', 'DR Congo', 'Democratic Republic of the Congo', 'Congo DR'],
    ['CGO', 'Конго', 'Congo', 'Republic of the Congo', 'COG'], ['COL', 'Колумбія', 'Colombia'],
    ['COM', 'Коморські Острови', 'Comoros'], ['CPV', 'Кабо-Верде', 'Cape Verde', 'Cabo Verde'],
    ['CRC', 'Коста-Рика', 'Costa Rica', 'CRI'], ['CRO', 'Хорватія', 'Croatia', 'HRV'], ['CUW', 'Кюрасао', 'Curaçao', 'Curacao'],
    ['CYP', 'Кіпр', 'Cyprus'], ['CZE', 'Чехія', 'Czech Republic', 'Czechia'], ['DEN', 'Данія', 'Denmark', 'DNK'],
    ['DOM', 'Домініканська Республіка', 'Dominican Republic'], ['ECU', 'Еквадор', 'Ecuador'], ['EGY', 'Єгипет', 'Egypt'],
    ['ENG', 'Англія', 'England'], ['EQG', 'Екваторіальна Гвінея', 'Equatorial Guinea', 'GNQ'], ['ERI', 'Еритрея', 'Eritrea'],
    ['ESP', 'Іспанія', 'Spain', 'SPA'], ['EST', 'Естонія', 'Estonia'], ['ETH', 'Ефіопія', 'Ethiopia'], ['FIN', 'Фінляндія', 'Finland'],
    ['FRA', 'Франція', 'France'], ['FRO', 'Фарерські Острови', 'Faroe Islands'], ['GAB', 'Габон', 'Gabon'],
    ['GAM', 'Гамбія', 'Gambia', 'The Gambia', 'GMB'], ['GEO', 'Грузія', 'Georgia'], ['GER', 'Німеччина', 'Germany', 'DEU'],
    ['GHA', 'Гана', 'Ghana'], ['GLP', 'Гваделупа', 'Guadeloupe'], ['GNB', 'Гвінея-Бісау', 'Guinea-Bissau'],
    ['GRE', 'Греція', 'Greece', 'GRC'], ['GRN', 'Гренада', 'Grenada'], ['GUF', 'Французька Гвіана', 'French Guiana'],
    ['GUI', 'Гвінея', 'Guinea', 'GIN'], ['HAI', 'Гаїті', 'Haiti', 'HTI'], ['HON', 'Гондурас', 'Honduras', 'HND'],
    ['HUN', 'Угорщина', 'Hungary'], ['IDN', 'Індонезія', 'Indonesia'], ['IRL', 'Ірландія', 'Republic of Ireland', 'Ireland'],
    ['IRN', 'Іран', 'Iran'], ['IRQ', 'Ірак', 'Iraq'], ['ISL', 'Ісландія', 'Iceland'], ['ISR', 'Ізраїль', 'Israel'],
    ['ITA', 'Італія', 'Italy'], ['JAM', 'Ямайка', 'Jamaica'], ['JOR', 'Йорданія', 'Jordan'], ['JPN', 'Японія', 'Japan'],
    ['KAZ', 'Казахстан', 'Kazakhstan'], ['KEN', 'Кенія', 'Kenya'], ['KOR', 'Південна Корея', 'South Korea', 'Korea Republic'],
    ['KOS', 'Косово', 'Kosovo', 'KVX'], ['KSA', 'Саудівська Аравія', 'Saudi Arabia', 'SAU'], ['LBR', 'Ліберія', 'Liberia'],
    ['LBY', 'Лівія', 'Libya'], ['LIE', 'Ліхтенштейн', 'Liechtenstein'], ['LTU', 'Литва', 'Lithuania'],
    ['LUX', 'Люксембург', 'Luxembourg'], ['LVA', 'Латвія', 'Latvia'], ['MAD', 'Мадагаскар', 'Madagascar', 'MDG'],
    ['MAR', 'Марокко', 'Morocco'], ['MDA', 'Молдова', 'Moldova'], ['MEX', 'Мексика', 'Mexico'],
    ['MKD', 'Північна Македонія', 'North Macedonia', 'Macedonia'], ['MLI', 'Малі', 'Mali'], ['MLT', 'Мальта', 'Malta'],
    ['MNE', 'Чорногорія', 'Montenegro', 'MTN'], ['MOZ', 'Мозамбік', 'Mozambique'], ['MRT', 'Мавританія', 'Mauritania'],
    ['MTQ', 'Мартиніка', 'Martinique'], ['MYS', 'Малайзія', 'Malaysia', 'MAS'], ['NAM', 'Намібія', 'Namibia'],
    ['NCL', 'Нова Каледонія', 'New Caledonia'], ['NED', 'Нідерланди', 'Netherlands', 'NLD'], ['NGA', 'Нігерія', 'Nigeria', 'NGR'],
    ['NIG', 'Нігер', 'Niger', 'NER'], ['NIR', 'Північна Ірландія', 'Northern Ireland'], ['NOR', 'Норвегія', 'Norway'],
    ['NZL', 'Нова Зеландія', 'New Zealand'], ['PAN', 'Панама', 'Panama'], ['PAR', 'Парагвай', 'Paraguay', 'PRY'],
    ['PER', 'Перу', 'Peru'], ['PHI', 'Філіппіни', 'Philippines'], ['POL', 'Польща', 'Poland'], ['POR', 'Португалія', 'Portugal', 'PRT'],
    ['PUR', 'Пуерто-Рико', 'Puerto Rico'], ['QAT', 'Катар', 'Qatar'], ['ROU', 'Румунія', 'Romania'],
    ['RSA', 'ПАР', 'South Africa', 'ZAF'], ['RUS', 'Росія', 'Russia'], ['RWA', 'Руанда', 'Rwanda'],
    ['SCO', 'Шотландія', 'Scotland'], ['SEN', 'Сенегал', 'Senegal'], ['SLE', 'Сьєрра-Леоне', 'Sierra Leone'],
    ['SLV', 'Сальвадор', 'El Salvador'], ['SMR', 'Сан-Марино', 'San Marino'], ['SRB', 'Сербія', 'Serbia', 'SER'],
    ['STP', 'Сан-Томе і Принсіпі', 'São Tomé and Príncipe'], ['SUI', 'Швейцарія', 'Switzerland', 'CHE'],
    ['SUR', 'Суринам', 'Suriname'], ['SVK', 'Словаччина', 'Slovakia'], ['SVN', 'Словенія', 'Slovenia', 'SLO'],
    ['SWE', 'Швеція', 'Sweden'], ['SYR', 'Сирія', 'Syria'], ['TAN', 'Танзанія', 'Tanzania', 'TZA'], ['TOG', 'Того', 'Togo', 'TGO'],
    ['TJK', 'Таджикистан', 'Tajikistan'], ['TKM', 'Туркменістан', 'Turkmenistan'], ['TRI', 'Тринідад і Тобаго', 'Trinidad and Tobago'],
    ['TUN', 'Туніс', 'Tunisia'], ['TUR', 'Туреччина', 'Turkey', 'Türkiye'], ['UAE', 'ОАЕ', 'United Arab Emirates', 'ARE'],
    ['UGA', 'Уганда', 'Uganda'], ['UKR', 'Україна', 'Ukraine'], ['URU', 'Уругвай', 'Uruguay', 'URY'],
    ['USA', 'США', 'United States'], ['UZB', 'Узбекистан', 'Uzbekistan'], ['VEN', 'Венесуела', 'Venezuela'],
    ['VIE', 'В’єтнам', 'Vietnam'], ['WAL', 'Уельс', 'Wales'], ['ZAM', 'Замбія', 'Zambia'], ['ZIM', 'Зімбабве', 'Zimbabwe'],
    ['SUD', 'Судан', 'Sudan'], ['SSD', 'Південний Судан', 'South Sudan'], ['LBN', 'Ліван', 'Lebanon'], ['PLE', 'Палестина', 'Palestine'],
    ['MNG', 'Монголія', 'Mongolia'], ['THA', 'Таїланд', 'Thailand'], ['IND', 'Індія', 'India'], ['GUY', 'Гаяна', 'Guyana'],
    ['MSR', 'Монтсеррат', 'Montserrat'], ['BER', 'Бермуди', 'Bermuda'], ['CTA', 'ЦАР', 'Central African Republic', 'CAR'],
    ['CHA', 'Чад', 'Chad'], ['DJI', 'Джибуті', 'Djibouti'], ['MWI', 'Малаві', 'Malawi'], ['GIB', 'Гібралтар', 'Gibraltar'],
    ['REU', 'Реюньйон', 'Réunion'], ['MYT', 'Майотта', 'Mayotte'], ['SOM', 'Сомалі', 'Somalia'], ['ATG', 'Антигуа і Барбуда', 'Antigua and Barbuda'],
  ];
  const NAME = {};
  const ALIAS = {};
  for (const [code, uk, ...aliases] of LIST) {
    NAME[code] = uk;
    ALIAS[code.toLowerCase()] = code;
    for (const a of aliases) ALIAS[a.toLowerCase()] = code;
  }
  const api = {
    /** Будь-яке написання → код ФІФА або null. */
    code(s) {
      if (!s) return null;
      const k = String(s).replace(/\{\{|\}\}|\[\[|\]\]/g, '').split('|').pop().trim().toLowerCase();
      return ALIAS[k] || null;
    },
    /** Код → українська назва (або сам код). */
    name(code) { return NAME[code] || code || '—'; },
    /** Усі країни: [[код, назва], …] за абеткою. */
    all() { return Object.entries(NAME).sort((a, b) => a[1].localeCompare(b[1], 'uk')); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.FM = root.FM || {}).countries = api;
})(typeof window !== 'undefined' ? window : globalThis);
