// Імена для згенерованих юнаків: українською й мовою оригіналу (латиницею). Справжніх майбутніх гравців
// не існує, тож юнаки — вигадані, з поширеними в країні іменами.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  // [українською, оригінал]
  const N = {
    UKR: {
      first: [['Олександр', 'Oleksandr'], ['Андрій', 'Andriy'], ['Дмитро', 'Dmytro'], ['Максим', 'Maksym'], ['Артем', 'Artem'], ['Владислав', 'Vladyslav'],
        ['Богдан', 'Bohdan'], ['Назар', 'Nazar'], ['Іван', 'Ivan'], ['Тарас', 'Taras'], ['Євген', 'Yevhen'], ['Микола', 'Mykola'], ['Остап', 'Ostap'],
        ['Ярослав', 'Yaroslav'], ['Денис', 'Denys'], ['Ілля', 'Illia'], ['Матвій', 'Matviy'], ['Данило', 'Danylo'], ['Роман', 'Roman'], ['Віталій', 'Vitaliy']],
      last: [['Коваленко', 'Kovalenko'], ['Бондаренко', 'Bondarenko'], ['Ткаченко', 'Tkachenko'], ['Шевчук', 'Shevchuk'], ['Мельник', 'Melnyk'], ['Кравчук', 'Kravchuk'],
        ['Олійник', 'Oliynyk'], ['Лисенко', 'Lysenko'], ['Мороз', 'Moroz'], ['Савченко', 'Savchenko'], ['Руденко', 'Rudenko'], ['Павленко', 'Pavlenko'],
        ['Гончаренко', 'Honcharenko'], ['Литвиненко', 'Lytvynenko'], ['Кузьменко', 'Kuzmenko'], ['Поліщук', 'Polishchuk'], ['Марченко', 'Marchenko'],
        ['Сидоренко', 'Sydorenko'], ['Ковальчук', 'Kovalchuk'], ['Гнатюк', 'Hnatiuk'], ['Пономар', 'Ponomar'], ['Дяченко', 'Diachenko'], ['Яременко', 'Yaremenko'], ['Головко', 'Holovko']],
    },
    ENG: {
      first: [['Джек', 'Jack'], ['Гаррі', 'Harry'], ['Олівер', 'Oliver'], ['Чарлі', 'Charlie'], ['Альфі', 'Alfie'], ['Джордж', 'George'], ['Ноа', 'Noah'],
        ['Лео', 'Leo'], ['Арчі', 'Archie'], ['Тео', 'Theo'], ['Мейсон', 'Mason'], ['Ітан', 'Ethan'], ['Льюїс', 'Lewis'], ['Райлі', 'Riley'], ['Джошуа', 'Joshua'], ['Кай', 'Kai']],
      last: [['Сміт', 'Smith'], ['Джонс', 'Jones'], ['Тейлор', 'Taylor'], ['Браун', 'Brown'], ['Вільямс', 'Williams'], ['Вілсон', 'Wilson'], ['Девіс', 'Davies'],
        ['Еванс', 'Evans'], ['Томас', 'Thomas'], ['Робертс', 'Roberts'], ['Вокер', 'Walker'], ['Райт', 'Wright'], ['Голл', 'Hall'], ['Грін', 'Green'],
        ['Кларк', 'Clarke'], ['Гарріс', 'Harris'], ['Ворд', 'Ward'], ['Морріс', 'Morris'], ['Кінг', 'King'], ['Беннетт', 'Bennett']],
    },
    ESP: {
      first: [['Пабло', 'Pablo'], ['Алехандро', 'Alejandro'], ['Даніель', 'Daniel'], ['Хав’єр', 'Javier'], ['Серхіо', 'Sergio'], ['Адріан', 'Adrián'],
        ['Альваро', 'Álvaro'], ['Маріо', 'Mario'], ['Уго', 'Hugo'], ['Ніколас', 'Nicolás'], ['Марк', 'Marc'], ['Ікер', 'Iker'], ['Хуан', 'Juan'], ['Рубен', 'Rubén']],
      last: [['Гарсія', 'García'], ['Мартінес', 'Martínez'], ['Лопес', 'López'], ['Санчес', 'Sánchez'], ['Перес', 'Pérez'], ['Гомес', 'Gómez'], ['Фернандес', 'Fernández'],
        ['Руїс', 'Ruiz'], ['Діас', 'Díaz'], ['Морено', 'Moreno'], ['Муньос', 'Muñoz'], ['Альварес', 'Álvarez'], ['Ромеро', 'Romero'], ['Наварро', 'Navarro'],
        ['Торрес', 'Torres'], ['Домінгес', 'Domínguez'], ['Ортега', 'Ortega'], ['Рамос', 'Ramos']],
    },
    ITA: {
      first: [['Лоренцо', 'Lorenzo'], ['Франческо', 'Francesco'], ['Алессандро', 'Alessandro'], ['Маттія', 'Mattia'], ['Леонардо', 'Leonardo'], ['Андреа', 'Andrea'],
        ['Габріеле', 'Gabriele'], ['Ріккардо', 'Riccardo'], ['Томмазо', 'Tommaso'], ['Давіде', 'Davide'], ['Федеріко', 'Federico'], ['Нікколо', 'Niccolò'], ['Сімоне', 'Simone']],
      last: [['Россі', 'Rossi'], ['Руссо', 'Russo'], ['Ферраріс', 'Ferraris'], ['Еспозіто', 'Esposito'], ['Б’янкі', 'Bianchi'], ['Романо', 'Romano'], ['Коломбо', 'Colombo'],
        ['Річчі', 'Ricci'], ['Марино', 'Marino'], ['Греко', 'Greco'], ['Бруно', 'Bruno'], ['Галло', 'Gallo'], ['Конті', 'Conti'], ['Де Лука', 'De Luca'],
        ['Манчіні', 'Mancini'], ['Коста', 'Costa'], ['Джордано', 'Giordano'], ['Ломбарді', 'Lombardi']],
    },
    GER: {
      first: [['Лукас', 'Lukas'], ['Леон', 'Leon'], ['Фін', 'Finn'], ['Йонас', 'Jonas'], ['Пауль', 'Paul'], ['Фелікс', 'Felix'], ['Максиміліан', 'Maximilian'],
        ['Нікляс', 'Niklas'], ['Тім', 'Tim'], ['Ян', 'Jan'], ['Луїс', 'Luis'], ['Моріц', 'Moritz'], ['Ніко', 'Nico'], ['Бен', 'Ben']],
      last: [['Мюллер', 'Müller'], ['Шмідт', 'Schmidt'], ['Шнайдер', 'Schneider'], ['Фішер', 'Fischer'], ['Вебер', 'Weber'], ['Маєр', 'Meyer'], ['Вагнер', 'Wagner'],
        ['Беккер', 'Becker'], ['Шульц', 'Schulz'], ['Гофманн', 'Hoffmann'], ['Кох', 'Koch'], ['Ріхтер', 'Richter'], ['Клайн', 'Klein'], ['Вольф', 'Wolf'],
        ['Шредер', 'Schröder'], ['Нойманн', 'Neumann'], ['Брандт', 'Brandt'], ['Краузе', 'Krause']],
    },
    FRA: {
      first: [['Лукас', 'Lucas'], ['Гюго', 'Hugo'], ['Тео', 'Théo'], ['Натан', 'Nathan'], ['Енцо', 'Enzo'], ['Матіс', 'Mathis'], ['Рафаель', 'Raphaël'],
        ['Луї', 'Louis'], ['Габріель', 'Gabriel'], ['Ноам', 'Noam'], ['Ілан', 'Ilan'], ['Адам', 'Adam'], ['Маель', 'Maël'], ['Саша', 'Sacha']],
      last: [['Мартен', 'Martin'], ['Бернар', 'Bernard'], ['Дюбуа', 'Dubois'], ['Тома', 'Thomas'], ['Робер', 'Robert'], ['Рішар', 'Richard'], ['Петі', 'Petit'],
        ['Дюран', 'Durand'], ['Леруа', 'Leroy'], ['Моро', 'Moreau'], ['Симон', 'Simon'], ['Лоран', 'Laurent'], ['Лефевр', 'Lefebvre'], ['Мішель', 'Michel'],
        ['Камара', 'Camara'], ['Діалло', 'Diallo'], ['Траоре', 'Traoré'], ['Коне', 'Koné']],
    },
  };
  FM.names = N;
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
