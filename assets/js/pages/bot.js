const KEY_SYSTEMS = [
    {
        icon: '🛡️',
        title: 'Модерация и дисциплина',
        description: 'Список модерации, выговоры и связанные события — всё фиксируется и отображается в удобном формате.',
    },
    {
        icon: '📜',
        title: 'Логи сервера (audit-стиль)',
        description: 'Гибкая система логирования по категориям: сообщения, участники, роли, модерация, каналы, изменения сервера. Есть управление включением/отключением категорий и выбором каналов.',
        command: 'log_settings',
    },
    {
        icon: '📊',
        title: 'Статистика активности и очки (валюта сервера)',
        description: 'Учёт активности по сообщениям, таблица очков, история начислений, конфигурация под сервер (whitelist/blacklist, интервалы наград, роли наград). На основе очков работает внутренняя экономика.',
        command: 'stats_updater',
    },
    {
        icon: '🛍️',
        title: 'Магазин ролей за очки',
        description: 'Покупка ролей за очки с подтверждением/одобрением, учёт покупок и сроков действия, журнал операций.',
        command: 'stats_updater',
    },
    {
        icon: '🏆',
        title: 'Рейтинг и лидерборды',
        description: 'Рейтинги по опыту/активности, страницы лидербордов, карточки/визуальные элементы, фоновая логика обновления.',
        command: 'ranking',
    },
    {
        icon: '🏰',
        title: 'Кланы с казной, апгрейдами и сезонами',
        description: 'Полноценная клановая система: участники и ранги, приглашения/заявки, клановые логи, клановый банк и транзакции, вклад участников, апгрейды, сезонная конфигурация и награды, история сезонов и снапшоты.',
        command: 'clans',
    },
    {
        icon: '🏷️',
        title: 'Управление ролями',
        description: 'Авто-роль при входе, массовая выдача/снятие ролей, просмотр иерархии и вспомогательные инструменты для серверов.',
        command: 'role_commands',
    },
    {
        icon: '🧮',
        title: 'Калькулятор и математика',
        description: 'Безопасная обработка выражений (AST), лимиты сложности, поддержка функций и рендер формул (LaTeX) в изображение.',
        command: 'calculate',
    },
];

const AUDIENCE = [
    'Владельцам серверов, кому важны порядок, прозрачность и статистика.',
    'Командам модерации, которым нужен контроль действий и дисциплины.',
    'Сообществам, где хочется вовлечённости: кланы, сезоны, экономика, лидерборды.',
    'Тестовым/Dev-серверам, где важно быстро проверять новые механики и смотреть логи.',
];

const STEPS = [
    'Добавьте бота на сервер и выдайте базовые права (управление сообщениями/ролями по необходимости).',
    'Настройте каналы логов и статистики, включите нужные категории.',
    'Запустите экономику/активность и кланы — и наблюдайте рост вовлечённости через лидерборды и сезоны.',
];

const FAQ_ITEMS = [
    {
        question: 'Это один бот или набор модулей?',
        answer: 'Один бот с независимыми системами: модерация, логи, активность/очки, рейтинг, кланы и роли.',
    },
    {
        question: 'Можно ли включить только часть функций?',
        answer: 'Да. Логи включаются по категориям, активность и награды настраиваются под сервер.',
    },
    {
        question: 'Как устроены кланы?',
        answer: 'Кланы поддерживают участников и ранги, приглашения/заявки, клановую казну и транзакции, апгрейды и сезонные сбросы/награды.',
    },
    {
        question: 'Очки — это внутренняя валюта?',
        answer: 'Да. Очки используются для экономики сервера (в том числе магазин ролей) и могут быть источником прогресса для кланов.',
    },
    {
        question: 'Безопасно ли это по данным и нагрузке?',
        answer: 'Системы используют структурированное хранение и журналы событий. Для математических вычислений применены ограничения сложности выражений.',
    },
];

function resolveInviteUrl() {
    const rawValue = window.NEXT_PUBLIC_BOT_INVITE_URL || '#invite';
    if (typeof rawValue !== 'string') return '#invite';

    const trimmed = rawValue.trim();
    if (!trimmed) return '#invite';

    if (
        trimmed.startsWith('https://') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('#')
    ) {
        return trimmed;
    }

    return '#invite';
}

export function render() {
    const inviteUrl = resolveInviteUrl();
    const inviteAttrs = /^https?:\/\//.test(inviteUrl) ? 'target="_blank" rel="noopener noreferrer"' : '';

    return `
        <div class="bot-page relative overflow-hidden">
            <div class="bot-glow bot-glow-left"></div>
            <div class="bot-glow bot-glow-right"></div>

            <div class="container mx-auto px-4 py-10 max-w-6xl relative z-10">
                <section class="bot-hero fade-in">
                    <div class="bot-hero-content">
                        <h1 class="bot-title">remod3Bot — модерация, статистика и кланы в одном боте</h1>
                        <p class="bot-subtitle">
                            Автоматизируйте рутину, ведите прозрачную аналитику по серверу и развивайте вовлечённость через кланы, сезоны и систему очков.
                        </p>
                        <div class="bot-cta-row">
                            <a href="${inviteUrl}" ${inviteAttrs} class="btn btn-primary">
                                <i class="fab fa-discord"></i>
                                Добавить на сервер
                            </a>
                            <a href="#commands" class="btn btn-outline">
                                <i class="fas fa-terminal"></i>
                                Команды и возможности
                            </a>
                        </div>
                        <p class="bot-note">Работает на py-cord. Настраивается под сервер и роли.</p>
                    </div>
                </section>

                <section class="bot-section" id="commands">
                    <h2 class="bot-section-title">Ключевые системы</h2>
                    <div class="bot-grid">
                        ${KEY_SYSTEMS.map(system => `
                            <article class="bot-card fade-in">
                                <h3 class="bot-card-title">${system.icon} ${system.title}</h3>
                                <p class="bot-card-text">${system.description}</p>
                                ${system.command ? `<p class="bot-chip">${system.command}</p>` : ''}
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section">
                    <h2 class="bot-section-title">Для кого бот</h2>
                    <div class="bot-list">
                        ${AUDIENCE.map(item => `
                            <div class="bot-list-item">
                                <i class="fas fa-check-circle"></i>
                                <p>${item}</p>
                            </div>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section">
                    <h2 class="bot-section-title">Как начать</h2>
                    <div class="bot-steps">
                        ${STEPS.map((step, index) => `
                            <div class="bot-step-card">
                                <span class="bot-step-number">${index + 1}</span>
                                <p>${step}</p>
                            </div>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section">
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
                        <a href="${inviteUrl}" ${inviteAttrs} class="btn btn-primary">
                            <i class="fab fa-discord"></i>
                            Добавить на сервер
                        </a>
                        <a href="#commands" class="btn btn-outline">
                            <i class="fas fa-terminal"></i>
                            Команды и возможности
                        </a>
                    </div>
                </section>
            </div>
        </div>
    `;
}
