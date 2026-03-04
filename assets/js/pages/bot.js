const INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1206275841395392552';

const HERO_DESCRIPTION = 'remod3Bot автоматизирует рутину сервера: фиксирует действия в audit-логах, ведёт статистику и помогает поддерживать порядок. Кланы, сезоны, очки и лидерборды усиливают вовлечённость сообщества без лишней ручной работы.';

const SEO_TITLE = 'remod3Bot — Discord-бот для модерации, статистики и кланов';
const SEO_DESCRIPTION = 'remod3Bot для Discord объединяет модерацию, audit-логи, статистику активности, очки и магазин ролей, кланы с сезонами и лидерборды для прозрачного управления сервером.';

const FACTS = [
    'Кланы с сезонами и казной',
    'Audit-логи и модерирование',
    'Очки активности и магазин ролей',
    'Лидерборды и рейтинги',
];

const KEY_SYSTEMS = [
    {
        icon: '📜',
        title: 'Логи сервера (audit)',
        description: 'Гибкая система логирования по категориям: сообщения, участники, роли, модерация, каналы и изменения сервера с выбором каналов логов.',
    },
    {
        icon: '📊',
        title: 'Статистика активности + очки',
        description: 'Учёт активности по сообщениям, таблица очков и история начислений с конфигурацией наград, whitelist/blacklist и интервалов выдачи.',
    },
    {
        icon: '🛍️',
        title: 'Магазин ролей за очки',
        description: 'Покупка ролей за очки с подтверждением, учётом сроков действия и журналом операций для прозрачной экономики сервера.',
    },
    {
        icon: '🏰',
        title: 'Кланы: казна, апгрейды, сезоны',
        description: 'Участники и ранги, заявки и приглашения, клановый банк и транзакции, апгрейды, сезонные настройки, награды и история сезонов.',
    },
    {
        icon: '🏆',
        title: 'Рейтинг и лидерборды',
        description: 'Рейтинги по опыту и активности, страницы лидербордов и визуальные карточки с фоновой логикой обновления.',
    },
    {
        icon: '🛡️',
        title: 'Модерация и дисциплина',
        description: 'Список модерации, выговоры и связанные события в едином формате для контроля действий модераторов и порядка на сервере.',
    },
    {
        icon: '🏷️',
        title: 'Управление ролями',
        description: 'Авто-роль при входе, массовая выдача/снятие ролей и вспомогательные инструменты для ежедневного администрирования.',
    },
];

const STEPS = [
    'Добавьте бота на сервер и выдайте базовые права (управление сообщениями и ролями по необходимости).',
    'Настройте каналы логов и статистики, включите нужные категории и параметры очков.',
    'Запустите кланы, сезоны и магазин ролей, затем отслеживайте динамику через рейтинги и лидерборды.',
];

const FAQ_ITEMS = [
    {
        question: 'Можно ли включить только часть функций?',
        answer: 'Да. Системы настраиваются независимо: можно включать только нужные категории логов, активность, очки или кланы.',
    },
    {
        question: 'Есть ли экономика/валюта?',
        answer: 'Да. Очки работают как внутренняя валюта сервера и используются в экономике, включая магазин ролей.',
    },
    {
        question: 'Как работают кланы и сезоны?',
        answer: 'Кланы поддерживают участников, ранги, казну, транзакции и апгрейды, а сезоны помогают перезапускать прогресс и выдавать награды.',
    },
    {
        question: 'Нужны ли права администратора?',
        answer: 'Для полноценной настройки логов, модерации и ролей нужны соответствующие права на сервере. Рекомендуется назначить боту доступ к нужным каналам.',
    },
    {
        question: 'Где смотреть команды/настройки?',
        answer: 'Все ключевые разделы доступны на этой странице в блоке «Ключевые системы». Для перехода используйте кнопку «Команды и возможности».',
    },
];

let restoreMeta = null;

function setPageMeta() {
    const previousTitle = document.title;
    let descriptionMeta = document.querySelector('meta[name="description"]');
    let createdDescriptionMeta = false;
    const previousDescription = descriptionMeta ? descriptionMeta.getAttribute('content') || '' : '';

    if (!descriptionMeta) {
        descriptionMeta = document.createElement('meta');
        descriptionMeta.setAttribute('name', 'description');
        document.head.appendChild(descriptionMeta);
        createdDescriptionMeta = true;
    }

    document.title = SEO_TITLE;
    descriptionMeta.setAttribute('content', SEO_DESCRIPTION);

    return () => {
        document.title = previousTitle;

        if (createdDescriptionMeta) {
            descriptionMeta.remove();
            return;
        }

        descriptionMeta.setAttribute('content', previousDescription);
    };
}

export function render() {
    return `
        <div class="bot-page relative overflow-hidden">
            <div class="bot-glow bot-glow-left"></div>
            <div class="bot-glow bot-glow-right"></div>

            <div class="container mx-auto px-4 py-10 max-w-6xl relative z-10">
                <section class="bot-hero fade-in">
                    <div class="bot-hero-content">
                        <h1 class="bot-title">remod3Bot</h1>
                        <h2 class="bot-subheading">Модерация, статистика, экономика и кланы — в одном Discord-боте</h2>
                        <p class="bot-subtitle">${HERO_DESCRIPTION}</p>
                        <div class="bot-cta-row">
                            <a href="${INVITE_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                                <i class="fab fa-discord"></i>
                                Добавить на сервер
                            </a>
                            <a href="#features" class="btn btn-outline">
                                <i class="fas fa-terminal"></i>
                                Команды и возможности
                            </a>
                        </div>
                    </div>
                </section>

                <section class="bot-mini-stats bot-section fade-in">
                    <div class="bot-mini-stats-grid">
                        ${FACTS.map(item => `
                            <article class="bot-mini-stat-card">
                                <i class="fas fa-check-circle"></i>
                                <p>${item}</p>
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section" id="features">
                    <h2 class="bot-section-title">Ключевые системы</h2>
                    <div class="bot-grid">
                        ${KEY_SYSTEMS.map(system => `
                            <article class="bot-card fade-in">
                                <h3 class="bot-card-title">${system.icon} ${system.title}</h3>
                                <p class="bot-card-text">${system.description}</p>
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section" id="how">
                    <h2 class="bot-section-title">Как начать</h2>
                    <div class="bot-steps">
                        ${STEPS.map((step, index) => `
                            <article class="bot-step-card">
                                <span class="bot-step-number">${index + 1}</span>
                                <p>${step}</p>
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section" id="faq">
                    <h2 class="bot-section-title">FAQ</h2>
                    <div class="bot-faq-list">
                        ${FAQ_ITEMS.map((item, index) => `
                            <details class="bot-faq-item" ${index === 0 ? 'open' : ''}>
                                <summary>${item.question}</summary>
                                <p>${item.answer}</p>
                            </details>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-bottom-cta">
                    <h2>Готовы подключить remod3Bot?</h2>
                    <div class="bot-cta-row">
                        <a href="${INVITE_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                            <i class="fab fa-discord"></i>
                            Добавить на сервер
                        </a>
                        <a href="#features" class="btn btn-outline">
                            <i class="fas fa-terminal"></i>
                            Команды и возможности
                        </a>
                    </div>
                </section>
            </div>
        </div>
    `;
}

export function mount() {
    restoreMeta = setPageMeta();
}

export function unmount() {
    if (restoreMeta) {
        restoreMeta();
        restoreMeta = null;
    }
}
