const birthdayTimestamp = 1791406800;

function formatRelativeTime(seconds) {
    if (seconds <= 0) return "сегодня! 🎉";

    const pluralRules = new Intl.PluralRules("ru");
    const forms = {
        год: ["год", "года", "лет"],
        месяц: ["месяц", "месяца", "месяцев"],
        неделя: ["неделя", "недели", "недель"],
        день: ["день", "дня", "дней"],
        час: ["час", "часа", "часов"],
        минута: ["минута", "минуты", "минут"]
    };
    const intervals = {
        год: 31536000,
        месяц: 2592000,
        неделя: 604800,
        день: 86400,
        час: 3600,
        минута: 60
    };

    for (const [unit, secs] of Object.entries(intervals)) {
        const count = Math.floor(seconds / secs);
        if (count >= 1) {
            const form = forms[unit][
                pluralRules.select(count) === "one" ? 0 :
                    pluralRules.select(count) === "few" ? 1 : 2
            ];
            return `через ${count} ${form}`;
        }
    }
    return "скоро!";
}

function updateBirthdayCountdown() {
    const el = document.getElementById('birthday-countdown');
    if (!el) return;
    const now = Math.floor(Date.now() / 1000);
    const diff = birthdayTimestamp - now;
    const relativeTime = formatRelativeTime(diff);
    const fullDate = new Date(birthdayTimestamp * 1000).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    el.innerHTML = `<span class="text-discord-accent font-bold">${relativeTime}</span> <span class="text-discord-text/60 text-xs">(${fullDate})</span>`;
}

const FEATURED_PROJECTS = [
    {
        icon: 'fa-calculator',
        color: 'text-blue-400',
        bg: 'bg-blue-500/15',
        name: 'Calc',
        desc: 'Веб-калькулятор с поддержкой сложных выражений и историей вычислений.',
        tags: ['C++'],
        link: 'https://github.com/remodik/calc'
    },
    {
        icon: 'fa-bomb',
        color: 'text-red-400',
        bg: 'bg-red-500/15',
        name: 'Minesweeper.WEB',
        desc: 'Классический сапёр в браузере с разными уровнями сложности и таймером.',
        tags: ['C#', 'WPF', 'ASP.NET'],
        link: 'https://github.com/remodik/minesweeper.web'
    },
    {
        icon: 'fa-globe',
        color: 'text-purple-400',
        bg: 'bg-purple-500/15',
        name: 'Landing',
        desc: 'Современный анимированный лендинг с glassmorphism-эффектами и адаптивной вёрсткой.',
        tags: ['HTML', 'CSS', 'JS', 'Three.js', 'WebGL'],
        link: 'https://github.com/remodik/Landing'
    },
    {
        icon: 'fa-message',
        color: 'text-yellow-400',
        bg: 'bg-yellow-500/15',
        name: 'Lentik',
        desc: 'Семейный мессенджер на FastAPI + Next.js с семейной галереей, чатами и уведомлениями.',
        tags: ['Python', 'FastAPI', 'Next.js', 'WebSocket', 'TSX', 'Docker'],
        link: 'https://github.com/remodik/Lentik'
    }
];

export function render() {
    return `
        <div class="fixed inset-0 overflow-hidden pointer-events-none" id="bg-animation" aria-hidden="true">
            <div class="absolute inset-0 opacity-20">
                <div class="absolute top-20 left-10 w-72 h-72 bg-discord-accent rounded-full mix-blend-multiply filter blur-3xl opacity-25 animate-blob"></div>
                <div class="absolute top-40 right-10 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-25 animate-blob animation-delay-2000"></div>
                <div class="absolute bottom-20 left-1/3 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-25 animate-blob animation-delay-4000"></div>
            </div>
        </div>

        <div class="container mx-auto px-4 py-8 max-w-7xl relative z-10">
            <div class="grid lg:grid-cols-12 gap-6">

                <div class="lg:col-span-3 space-y-5">

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 0.2s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-chart-line text-discord-accent"></i>
                            Статистика
                        </h3>
                        <div class="space-y-4">
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="text-discord-text">Python</span>
                                    <span class="text-discord-accent font-semibold">65%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-1.5">
                                    <div class="bg-gradient-to-r from-blue-400 to-discord-accent h-1.5 rounded-full" style="width: 65%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="text-discord-text">Discord API</span>
                                    <span class="text-discord-accent font-semibold">75%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-1.5">
                                    <div class="bg-gradient-to-r from-purple-400 to-purple-600 h-1.5 rounded-full" style="width: 75%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="text-discord-text">JavaScript</span>
                                    <span class="text-discord-accent font-semibold">45%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-1.5">
                                    <div class="bg-gradient-to-r from-yellow-400 to-yellow-600 h-1.5 rounded-full" style="width: 45%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="text-discord-text">FastAPI / SQL</span>
                                    <span class="text-discord-accent font-semibold">50%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-1.5">
                                    <div class="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full" style="width: 50%"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 0.35s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-trophy text-yellow-400"></i>
                            Результаты
                        </h3>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-discord-darker rounded-lg p-3 text-center">
                                <div class="text-2xl font-bold text-discord-accent">10+</div>
                                <div class="text-xs text-discord-text mt-0.5">проектов</div>
                            </div>
                            <div class="bg-discord-darker rounded-lg p-3 text-center">
                                <div class="text-2xl font-bold text-discord-green">1.5+</div>
                                <div class="text-xs text-discord-text mt-0.5">года опыта</div>
                            </div>
                            <div class="bg-discord-darker rounded-lg p-3 text-center">
                                <div class="text-2xl font-bold text-pink-400">5+</div>
                                <div class="text-xs text-discord-text mt-0.5">ботов в деле</div>
                            </div>
                            <div class="bg-discord-darker rounded-lg p-3 text-center">
                                <div class="text-2xl font-bold text-purple-400">24/7</div>
                                <div class="text-xs text-discord-text mt-0.5">поддержка</div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 0.5s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-link text-discord-accent"></i>
                            Навигация
                        </h3>
                        <div class="space-y-1">
                            <a href="/projects" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-discord-darker transition group">
                                <i class="fas fa-folder text-discord-accent group-hover:scale-110 transition w-4 text-center"></i>
                                <span class="text-discord-text text-sm group-hover:text-white transition">Проекты</span>
                            </a>
                            <a href="/services" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-discord-darker transition group">
                                <i class="fas fa-briefcase text-discord-green group-hover:scale-110 transition w-4 text-center"></i>
                                <span class="text-discord-text text-sm group-hover:text-white transition">Услуги</span>
                            </a>
                            <a href="/contact" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-discord-darker transition group">
                                <i class="fas fa-envelope text-purple-400 group-hover:scale-110 transition w-4 text-center"></i>
                                <span class="text-discord-text text-sm group-hover:text-white transition">Написать мне</span>
                            </a>
                            <a href="https://github.com/remodik" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-discord-darker transition group">
                                <i class="fab fa-github text-white/60 group-hover:scale-110 transition w-4 text-center"></i>
                                <span class="text-discord-text text-sm group-hover:text-white transition">GitHub</span>
                            </a>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-6 space-y-5">

                    <div class="card fade-in" style="animation-delay: 0.1s">
                        <div class="banner" style="background-image: url('/assets/images/blue_mybanner.gif'); background-size: cover; background-position: center;"></div>

                        <div class="relative -mt-16 px-6 pb-6 text-center">
                            <div class="avatar-container inline-block relative">
                                <img src="/assets/images/blue_avatar.png" alt="Avatar remod3" class="avatar mx-auto"
                                     onerror="this.src='https://via.placeholder.com/120/5865F2/ffffff?text=R'">
                                <div class="avatar-decoration"></div>
                            </div>

                            <h1 class="text-2xl font-bold text-white mt-4">remod3</h1>
                            <p class="text-discord-text text-sm mt-1">Python-разработчик · Discord-боты · Веб-приложения</p>

                            <div class="mt-3 flex flex-wrap justify-center gap-2">
                                <span class="tag tag-primary" title="Никнеймы в аниме-сообществах">チェリー | せんちゃ</span>
                                <span class="tag bg-discord-light text-white/80" title="Любимый персонаж / отсылка к аниме">ベテルギウス</span>
                            </div>

                            <div class="mt-5 flex flex-wrap justify-center gap-3">
                                <a href="/projects"
                                   class="inline-flex items-center gap-2 bg-discord-accent hover:bg-discord-accent/80 text-white font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-discord-accent/25">
                                    <i class="fas fa-folder-open text-sm"></i>
                                    Смотреть проекты
                                </a>
                                <a href="/contact"
                                   class="inline-flex items-center gap-2 bg-discord-light hover:bg-discord-lighter text-white font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 border border-discord-lighter">
                                    <i class="fas fa-paper-plane text-sm"></i>
                                    Связаться
                                </a>
                            </div>
                        </div>

                        <div class="bg-discord-light px-6 py-6 space-y-6">
                            <section class="fade-in" style="animation-delay: 0.3s">
                                <h2 class="flex items-center gap-2 text-discord-accent text-base font-semibold border-b border-discord-lighter pb-2 mb-4">
                                    <i class="fas fa-user text-pink-400"></i>
                                    Обо мне
                                </h2>
                                <p class="text-discord-text text-sm leading-relaxed mb-3">
                                    Привет! Меня зовут Никита, мне 18 лет. Живу в <span class="text-white font-medium">Тояме, Япония</span> и занимаюсь разработкой на Python.
                                </p>
                                <p class="text-discord-text text-sm leading-relaxed mb-3">
                                    Специализируюсь на <span class="text-discord-accent font-medium">Discord-ботах</span> (py-cord / discord.py): системы рейтингов, управление кланами, музыкальные боты, HR-инструменты для модерации. Также строю фулстек-веб-приложения на <span class="text-white font-medium">FastAPI + Next.js</span>.
                                </p>
                                <p class="text-discord-text text-sm leading-relaxed">
                                    День рождения: <span id="birthday-countdown"></span>
                                </p>
                            </section>

                            <section class="fade-in" style="animation-delay: 0.45s">
                                <h2 class="flex items-center gap-2 text-discord-accent text-base font-semibold border-b border-discord-lighter pb-2 mb-4">
                                    <i class="fas fa-wrench text-yellow-400"></i>
                                    Технологии
                                </h2>
                                <div class="skills-container">
                                    <span class="tag">Python</span>
                                    <span class="tag">FastAPI</span>
                                    <span class="tag">py-cord</span>
                                    <span class="tag">discord.py</span>
                                    <span class="tag">Next.js</span>
                                    <span class="tag">SQLite / Turso</span>
                                    <span class="tag">Docker</span>
                                    <span class="tag">WebSocket</span>
                                    <span class="tag">HTML / CSS / JS</span>
                                </div>
                            </section>

                            <section class="fade-in" style="animation-delay: 0.55s">
                                <h2 class="flex items-center gap-2 text-discord-accent text-base font-semibold border-b border-discord-lighter pb-2 mb-4">
                                    <i class="fas fa-location-dot text-discord-green"></i>
                                    Контакты
                                </h2>
                                <div class="space-y-2">
                                    <div class="flex items-center gap-3 text-discord-text text-sm">
                                        <i class="fas fa-envelope text-discord-accent w-5 text-center"></i>
                                        <a href="mailto:slenderzet@gmail.com" class="hover:text-white transition">slenderzet@gmail.com</a>
                                    </div>
                                    <div class="flex items-center gap-3 text-discord-text text-sm">
                                        <i class="fas fa-map-marker-alt text-discord-accent w-5 text-center"></i>
                                        <span>Тояма, Япония 🇯🇵</span>
                                    </div>
                                </div>
                            </section>

                            <div class="flex justify-center gap-3 pt-2">
                                <a href="https://vk.com/remod3" target="_blank" rel="noopener noreferrer"
                                   class="social-link" aria-label="VKontakte">
                                    <i class="fab fa-vk"></i>
                                </a>
                                <a href="https://t.me/remod3" target="_blank" rel="noopener noreferrer"
                                   class="social-link" aria-label="Telegram">
                                    <i class="fab fa-telegram"></i>
                                </a>
                                <a href="https://discord.gg/nKkQdDgWfC" target="_blank" rel="noopener noreferrer"
                                   class="social-link" aria-label="Discord Server">
                                    <i class="fab fa-discord"></i>
                                </a>
                                <a href="https://open.spotify.com/user/31hx3sueaixdsbody6s6lligjm6a" target="_blank" rel="noopener noreferrer"
                                   class="social-link" aria-label="Spotify">
                                    <i class="fab fa-spotify"></i>
                                </a>
                                <a href="https://github.com/remodik" target="_blank" rel="noopener noreferrer"
                                   class="social-link" aria-label="GitHub">
                                    <i class="fab fa-github"></i>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 0.7s">
                        <div class="flex items-center justify-between mb-5">
                            <h2 class="text-white font-bold flex items-center gap-2">
                                <i class="fas fa-rocket text-discord-accent"></i>
                                Избранные проекты
                            </h2>
                            <a href="/projects"
                               class="text-discord-accent text-sm hover:underline flex items-center gap-1 transition">
                                Все проекты <i class="fas fa-arrow-right text-xs"></i>
                            </a>
                        </div>
                        <div class="grid sm:grid-cols-2 gap-3" id="featured-projects">
                            ${FEATURED_PROJECTS.map((p, i) => `
                                <a href="${p.link}" target="_blank" rel="noopener noreferrer"
                                   class="group bg-discord-darker hover:bg-discord-darker/70 rounded-xl p-4 flex flex-col gap-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30 border border-transparent hover:border-discord-lighter fade-in"
                                   style="animation-delay: ${0.75 + i * 0.1}s">
                                    <div class="flex items-start gap-3">
                                        <div class="w-10 h-10 ${p.bg} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition">
                                            <i class="fas ${p.icon} ${p.color}"></i>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-white font-semibold text-sm group-hover:text-discord-accent transition truncate">${p.name}</p>
                                            <p class="text-discord-text text-xs mt-0.5 line-clamp-2 leading-relaxed">${p.desc}</p>
                                        </div>
                                    </div>
                                    <div class="flex flex-wrap gap-1.5">
                                        ${p.tags.map(t => `<span class="text-xs bg-discord-light px-2 py-0.5 rounded-md text-discord-text/80">${t}</span>`).join('')}
                                    </div>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-3 space-y-5">

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 0.4s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-briefcase text-discord-green"></i>
                            Что делаю
                        </h3>
                        <div class="space-y-3">
                            <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-discord-darker transition group cursor-default">
                                <div class="w-8 h-8 bg-discord-accent/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-robot text-discord-accent text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-white text-sm font-medium">Discord-боты</p>
                                    <p class="text-discord-text text-xs mt-0.5">Боты любой сложности под ключ</p>
                                </div>
                            </div>
                            <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-discord-darker transition group cursor-default">
                                <div class="w-8 h-8 bg-green-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-globe text-discord-green text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-white text-sm font-medium">Веб-панели</p>
                                    <p class="text-discord-text text-xs mt-0.5">FastAPI + фронтенд с авторизацией</p>
                                </div>
                            </div>
                            <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-discord-darker transition group cursor-default">
                                <div class="w-8 h-8 bg-purple-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-plug text-purple-400 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-white text-sm font-medium">API-интеграции</p>
                                    <p class="text-discord-text text-xs mt-0.5">Discord, внешние сервисы</p>
                                </div>
                            </div>
                            <a href="/services"
                               class="mt-2 w-full block text-center text-discord-accent text-sm hover:underline py-1">
                                Подробнее об услугах →
                            </a>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 0.8s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-tv text-pink-400"></i>
                            Любимые аниме
                        </h3>
                        <div class="space-y-2.5">
                            <div class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-discord-darker transition">
                                <div class="relative w-10 h-14 rounded overflow-hidden flex-shrink-0 shadow-md">
                                    <img src="https://cdn.myanimelist.net/images/anime/1522/128039.jpg" alt="Re:Zero"
                                         class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy"
                                         onerror="this.src='https://via.placeholder.com/40x56/9333EA/ffffff?text=RZ'">
                                </div>
                                <div class="flex-1">
                                    <p class="text-white text-sm font-semibold group-hover:text-discord-accent transition">Re:Zero</p>
                                    <p class="text-discord-text text-xs">Фэнтези · Драма</p>
                                    <div class="flex items-center gap-1 mt-0.5">
                                        <i class="fas fa-star text-yellow-400 text-xs"></i>
                                        <span class="text-xs text-discord-text">9.5/10</span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-discord-darker transition">
                                <div class="relative w-10 h-14 rounded overflow-hidden flex-shrink-0 shadow-md">
                                    <img src="https://cdn.myanimelist.net/images/anime/11/39717.jpg" alt="Sword Art Online"
                                         class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy"
                                         onerror="this.src='https://via.placeholder.com/40x56/3B82F6/ffffff?text=SAO'">
                                </div>
                                <div class="flex-1">
                                    <p class="text-white text-sm font-semibold group-hover:text-discord-accent transition">Sword Art Online</p>
                                    <p class="text-discord-text text-xs">Экшен · Приключения</p>
                                    <div class="flex items-center gap-1 mt-0.5">
                                        <i class="fas fa-star text-yellow-400 text-xs"></i>
                                        <span class="text-xs text-discord-text">8.8/10</span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-discord-darker transition">
                                <div class="relative w-10 h-14 rounded overflow-hidden flex-shrink-0 shadow-md">
                                    <img src="https://cdn.myanimelist.net/images/anime/1739/140995.jpg" alt="Blue Archive"
                                         class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy"
                                         onerror="this.src='https://via.placeholder.com/40x56/F59E0B/ffffff?text=BA'">
                                </div>
                                <div class="flex-1">
                                    <p class="text-white text-sm font-semibold group-hover:text-discord-accent transition">Blue Archive</p>
                                    <p class="text-discord-text text-xs">Экшен · Школа</p>
                                    <div class="flex items-center gap-1 mt-0.5">
                                        <i class="fas fa-star text-yellow-400 text-xs"></i>
                                        <span class="text-xs text-discord-text">9.2/10</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-xl p-5 fade-in border border-discord-lighter/40" style="animation-delay: 1s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-gamepad text-discord-accent"></i>
                            Играю сейчас
                        </h3>
                        <div class="space-y-2">
                            <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-discord-darker transition">
                                <span class="text-discord-green text-xs">▶</span>
                                <span class="text-discord-text text-sm">Blue Archive</span>
                            </div>
                            <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-discord-darker transition">
                                <span class="text-discord-green text-xs">▶</span>
                                <span class="text-discord-text text-sm">Arknights: Endfield</span>
                            </div>
                            <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-discord-darker transition">
                                <span class="text-discord-green text-xs">▶</span>
                                <span class="text-discord-text text-sm">PUBG Mobile</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    updateBirthdayCountdown();
    const interval = setInterval(updateBirthdayCountdown, 60000);
    window._homeCleanup = () => clearInterval(interval);
}

export function unmount() {
    if (window._homeCleanup) {
        window._homeCleanup();
        delete window._homeCleanup;
    }
}