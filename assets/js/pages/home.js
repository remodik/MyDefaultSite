import { wakatimeApi } from '../api.js';

const birthdayTimestamp = 1791406800;
let wakatimeData = null;
const WAKATIME_CACHE_KEY = 'wakatime_cache';
const WAKATIME_CACHE_DURATION = 30 * 60 * 1000;

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
    el.innerHTML = `<span class="text-discord-accent font-bold">${relativeTime}</span> (${fullDate})`;
}

export function render() {
    return `
        <div class="fixed inset-0 overflow-hidden pointer-events-none" id="bg-animation">
            <div class="absolute inset-0 opacity-20">
                <div class="absolute top-20 left-10 w-64 h-64 bg-discord-accent rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
                <div class="absolute top-40 right-10 w-64 h-64 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
                <div class="absolute bottom-20 left-1/3 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
            </div>
        </div>

        <div class="container mx-auto px-4 py-8 max-w-7xl relative z-10">
            <div class="grid lg:grid-cols-12 gap-6">
                
                <div class="lg:col-span-3 space-y-6">
                    <div class="bg-discord-light rounded-lg p-6 fade-in" style="animation-delay: 0.2s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-chart-line text-discord-accent"></i>
                            Статистика
                        </h3>
                        <div class="space-y-4">
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="text-discord-text">Опыт</span>
                                    <span class="text-discord-accent font-semibold">1.5+ года</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-2">
                                    <div class="bg-discord-accent h-2 rounded-full" style="width: 65%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="text-discord-text">Проекты</span>
                                    <span class="text-discord-accent font-semibold">10+</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-2">
                                    <div class="bg-green-500 h-2 rounded-full" style="width: 80%"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-lg p-6 fade-in" style="animation-delay: 0.4s" id="wakatime-section">
                        <div class="flex justify-center py-4">
                            <div class="spinner"></div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-lg p-6 fade-in" style="animation-delay: 0.6s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-link text-discord-accent"></i>
                            Быстрые ссылки
                        </h3>
                        <div class="space-y-2">
                            <a href="https://github.com/remodik?tab=repositories" class="flex items-center gap-3 p-2 rounded hover:bg-discord-darker transition group">
                                <i class="fas fa-folder text-discord-accent group-hover:scale-110 transition"></i>
                                <span class="text-discord-text text-sm group-hover:text-white">Мои проекты</span>
                            </a>
                            <a href="/services" class="flex items-center gap-3 p-2 rounded hover:bg-discord-darker transition group">
                                <i class="fas fa-briefcase text-green-500 group-hover:scale-110 transition"></i>
                                <span class="text-discord-text text-sm group-hover:text-white">Услуги</span>
                            </a>
                            <a href="/contact" class="flex items-center gap-3 p-2 rounded hover:bg-discord-darker transition group">
                                <i class="fas fa-envelope text-purple-500 group-hover:scale-110 transition"></i>
                                <span class="text-discord-text text-sm group-hover:text-white">Связаться</span>
                            </a>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-6">
                    <div class="card fade-in">
                        <div class="banner" style="background-image: url('/assets/images/blue_mybanner.gif'); background-size: cover; background-position: center;"></div>
                        
                        <div class="relative -mt-16 px-6 pb-4 text-center">
                            <div class="avatar-container inline-block relative">
                                <img src="/assets/images/blue_avatar.png" alt="Avatar" class="avatar mx-auto" onerror="this.src='https://via.placeholder.com/120/5865F2/ffffff?text=R'">
                                <div class="avatar-decoration"></div>
                            </div>
                            <h1 class="text-2xl font-bold text-white mt-4">remod3</h1>
                            <div class="mt-2 space-x-2">
                                <span class="tag tag-primary">チェリー | せんちゃ</span>
                            </div>
                            <div class="mt-1">
                                <span class="tag bg-discord-light text-white">ベテルギウスロマネ・コンティ</span>
                            </div>
                        </div>
                        
                        <div class="bg-discord-light px-6 py-8 space-y-6">
                            <section class="fade-in" style="animation-delay: 0.2s">
                                <h2 class="flex items-center gap-2 text-discord-accent text-lg font-semibold border-b border-discord-lighter pb-2 mb-4">
                                    <i class="fas fa-heart text-pink-500"></i>
                                    Обо мне
                                </h2>
                                <p class="text-discord-text mb-3">
                                    Привет! Меня зовут Илья, мне 18 лет, и я обычный начинающий разработчик на Python, который любит аниме.
                                </p>
                                <p class="text-discord-text mb-3">
                                    Моя цель - создать универсального Discord бота, который будет уметь всё! (Ну, или почти)
                                </p>
                                <p class="text-discord-text">
                                    День рождения: <span id="birthday-countdown" class="text-discord-accent"></span>
                                </p>
                            </section>
                            
                            <section class="fade-in" style="animation-delay: 0.4s">
                                <h2 class="flex items-center gap-2 text-discord-accent text-lg font-semibold border-b border-discord-lighter pb-2 mb-4">
                                    <i class="fas fa-star text-yellow-500"></i>
                                    Увлечения
                                </h2>
                                <div class="skills-container">
                                    <span class="tag">Python</span>
                                    <span class="tag">Discord API</span>
                                    <span class="tag">Py-cord/disnake</span>
                                    <span class="tag">HTML/CSS</span>
                                    <span class="tag">Просмотр аниме</span>
                                </div>
                            </section>
                            
                            <section class="fade-in" style="animation-delay: 0.6s">
                                <h2 class="flex items-center gap-2 text-discord-accent text-lg font-semibold border-b border-discord-lighter pb-2 mb-4">
                                    <i class="fas fa-envelope text-green-500"></i>
                                    Контакты
                                </h2>
                                <div class="space-y-3">
                                    <div class="flex items-center gap-3 text-discord-text">
                                        <i class="fas fa-envelope text-discord-accent w-6"></i>
                                        <span>slenderzet@gmail.com</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-discord-text">
                                        <i class="fas fa-map-marker-alt text-discord-accent w-6"></i>
                                        <span>Тояма, Япония (мечтаю там побывать!)</span>
                                    </div>
                                </div>
                            </section>
                            
                            <div class="flex justify-center gap-4 pt-4">
                                <a href="https://vk.com/remod3" target="_blank" class="social-link" aria-label="VK">
                                    <i class="fab fa-vk"></i>
                                </a>
                                <a href="https://t.me/remod3" target="_blank" class="social-link" aria-label="Telegram">
                                    <i class="fab fa-telegram"></i>
                                </a>
                                <a href="https://discord.gg/nKkQdDgWfC" target="_blank" class="social-link" aria-label="Discord Server">
                                    <i class="fab fa-discord"></i>
                                </a>
                                <a href="https://discord.com/users/743864658951274528" target="_blank" class="social-link" aria-label="Discord Profile">
                                    <i class="fab fa-discord"></i>
                                </a>
                                <a href="https://open.spotify.com/user/31hx3sueaixdsbody6s6lligjm6a" target="_blank" class="social-link" aria-label="Spotify">
                                    <i class="fab fa-spotify"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-3 space-y-6">
                    <div class="bg-discord-light rounded-lg p-6 fade-in" style="animation-delay: 0.8s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-code text-discord-accent"></i>
                            Навыки
                        </h3>
                        <div class="space-y-4">
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-sm text-discord-text flex items-center gap-2">
                                        <i class="fab fa-python text-blue-400"></i>
                                        Python
                                    </span>
                                    <span class="text-xs text-discord-accent font-semibold">65%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-2">
                                    <div class="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full" style="width: 65%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-sm text-discord-text flex items-center gap-2">
                                        <i class="fab fa-js text-yellow-400"></i>
                                        JavaScript
                                    </span>
                                    <span class="text-xs text-discord-accent font-semibold">30%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-2">
                                    <div class="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full" style="width: 30%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-sm text-discord-text flex items-center gap-2">
                                        <i class="fab fa-discord text-discord-accent"></i>
                                        Discord API
                                    </span>
                                    <span class="text-xs text-discord-accent font-semibold">75%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-2">
                                    <div class="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full" style="width: 75%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-sm text-discord-text flex items-center gap-2">
                                        <i class="fas fa-database text-green-400"></i>
                                        SQL/DB
                                    </span>
                                    <span class="text-xs text-discord-accent font-semibold">35%</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-2">
                                    <div class="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full" style="width: 35%"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-discord-light rounded-lg p-6 fade-in" style="animation-delay: 1s">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-tv text-pink-500"></i>
                            Любимые аниме
                        </h3>
                        <div class="space-y-3">
                            <div class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-discord-darker transition">
                                <div class="relative w-12 h-16 rounded overflow-hidden flex-shrink-0 shadow-lg">
                                    <img 
                                        src="https://cdn.myanimelist.net/images/anime/1522/128039.jpg" 
                                        alt="Re:Zero"
                                        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                        loading="lazy"
                                        onerror="this.src='https://via.placeholder.com/48x64/9333EA/ffffff?text=RZ'"
                                    >
                                    <div class="absolute inset-0 border-2 border-purple-500/50 rounded group-hover:border-purple-500 transition"></div>
                                </div>
                                <div class="flex-1">
                                    <p class="text-white text-sm font-semibold group-hover:text-discord-accent transition">Re:Zero</p>
                                    <span class="text-xs text-discord-text/60">Фэнтези, Драма</span>
                                    <div class="flex items-center gap-1 mt-1">
                                        <i class="fas fa-star text-yellow-400 text-xs"></i>
                                        <span class="text-xs text-discord-text/80">9.5/10</span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-discord-darker transition">
                                <div class="relative w-12 h-16 rounded overflow-hidden flex-shrink-0 shadow-lg">
                                    <img 
                                        src="https://cdn.myanimelist.net/images/anime/11/39717.jpg" 
                                        alt="Sword Art Online"
                                        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                        loading="lazy"
                                        onerror="this.src='https://via.placeholder.com/48x64/3B82F6/ffffff?text=SAO'"
                                    >
                                    <div class="absolute inset-0 border-2 border-blue-500/50 rounded group-hover:border-blue-500 transition"></div>
                                </div>
                                <div class="flex-1">
                                    <p class="text-white text-sm font-semibold group-hover:text-discord-accent transition">Sword Art Online</p>
                                    <span class="text-xs text-discord-text/60">Экшен, Приключения</span>
                                    <div class="flex items-center gap-1 mt-1">
                                        <i class="fas fa-star text-yellow-400 text-xs"></i>
                                        <span class="text-xs text-discord-text/80">8.8/10</span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-discord-darker transition">
                                <div class="relative w-12 h-16 rounded overflow-hidden flex-shrink-0 shadow-lg">
                                    <img 
                                        src="https://cdn.myanimelist.net/images/anime/1739/140995.jpg" 
                                        alt="Blue Archive"
                                        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                        loading="lazy"
                                        onerror="this.src='https://via.placeholder.com/48x64/F59E0B/ffffff?text=BA'"
                                    >
                                    <div class="absolute inset-0 border-2 border-yellow-500/50 rounded group-hover:border-yellow-500 transition"></div>
                                </div>
                                <div class="flex-1">
                                    <p class="text-white text-sm font-semibold group-hover:text-discord-accent transition">Blue Archive</p>
                                    <span class="text-xs text-discord-text/60">Экшен, Школа</span>
                                    <div class="flex items-center gap-1 mt-1">
                                        <i class="fas fa-star text-yellow-400 text-xs"></i>
                                        <span class="text-xs text-discord-text/80">9.2/10</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getWakatimeCache() {
    try {
        const cached = localStorage.getItem(WAKATIME_CACHE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached);
        const now = Date.now();

        if (now < data.expiresAt) {
            return data.value;
        }

        localStorage.removeItem(WAKATIME_CACHE_KEY);
        return null;
    } catch (error) {
        console.error('Error reading Wakatime cache:', error);
        return null;
    }
}

function setWakatimeCache(data) {
    try {
        const cache = {
            value: data,
            expiresAt: Date.now() + WAKATIME_CACHE_DURATION,
            cachedAt: Date.now()
        };
        localStorage.setItem(WAKATIME_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error('Error saving Wakatime cache:', error);
    }
}

async function loadWakatimeStats() {
    const cachedData = getWakatimeCache();
    if (cachedData) {
        console.log('📦 Using cached Wakatime data');
        wakatimeData = cachedData;
        renderWakatimeSection(true);
        return;
    }

    try {
        console.log('🔄 Fetching fresh Wakatime data');
        const response = await wakatimeApi.getStats();
        wakatimeData = response.data;

        setWakatimeCache(response.data);

        const isCached = response.cached || false;
        renderWakatimeSection(isCached);

        console.log(`✅ Wakatime data loaded ${isCached ? '(from server cache)' : '(fresh)'}`);
    } catch (error) {
        console.error('❌ Failed to load Wakatime stats:', error);
        renderWakatimeSection(false);
    }
}

function renderWakatimeSection(isCached = false) {
    const container = document.getElementById('wakatime-section');
    if (!container) return;

    if (!wakatimeData) {
        container.innerHTML = `
            <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                <i class="fas fa-code text-green-500"></i>
                Сейчас работаю
            </h3>
            <div class="space-y-3">
                <div class="flex items-start gap-3">
                    <div class="w-2 h-2 bg-green-500 rounded-full mt-2 pulse"></div>
                    <div>
                        <p class="text-discord-text text-sm">Разработка универсального Discord бота</p>
                        <span class="text-xs text-discord-text/60">Python, discord.py</span>
                    </div>
                </div>
                <div class="flex items-start gap-3">
                    <div class="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                    <div>
                        <p class="text-discord-text text-sm">Изучение FastAPI и веб-разработки</p>
                        <span class="text-xs text-discord-text/60">Frontend</span>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    const totalTime = wakatimeData.human_readable_total || '0 hrs';
    const dailyAverage = wakatimeData.human_readable_daily_average || '0 hrs';
    const topLanguages = (wakatimeData.languages || []).slice(0, 5);

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-white font-bold flex items-center gap-2">
                <i class="fas fa-code text-green-500"></i>
                Coding Activity
            </h3>
            ${isCached ? '<i class="fas fa-database text-discord-text/50 text-xs" title="Данные из кэша"></i>' : ''}
        </div>
        <div class="space-y-4">
            <div class="bg-discord-darker p-3 rounded-lg">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-discord-text text-sm">За всё время</span>
                    <span class="text-green-500 font-bold">${totalTime}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-discord-text/70 text-xs">В среднем в день</span>
                    <span class="text-discord-accent text-xs">${dailyAverage}</span>
                </div>
            </div>
            
            ${topLanguages.length > 0 ? `
                <div>
                    <span class="text-discord-text text-xs mb-2 block font-semibold">Топ языки:</span>
                    <div class="space-y-2">
                        ${topLanguages.map(lang => `
                            <div>
                                <div class="flex justify-between text-xs mb-1">
                                    <span class="text-discord-text">${lang.name}</span>
                                    <span class="text-discord-accent font-semibold">${lang.text}</span>
                                </div>
                                <div class="w-full bg-discord-darker rounded-full h-1.5">
                                    <div class="bg-gradient-to-r from-green-500 to-green-600 h-1.5 rounded-full transition-all duration-500" 
                                         style="width: ${lang.percent}%"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '<p class="text-discord-text/50 text-sm text-center py-4">Нет данных о языках</p>'}
            
            <div class="text-center pt-2 border-t border-discord-darker">
                <a href="https://wakatime.com/@remod3" target="_blank" 
                   class="text-xs text-discord-text/70 hover:text-discord-accent transition">
                    <i class="fas fa-external-link-alt mr-1"></i>
                    Подробнее на WakaTime
                </a>
            </div>
        </div>
    `;
}

export function mount() {
    updateBirthdayCountdown();
    loadWakatimeStats().catch(error => console.error('Wakatime load error:', error));

    const interval = setInterval(updateBirthdayCountdown, 60000);
    window._homeCleanup = () => clearInterval(interval);
}

export function unmount() {
    if (window._homeCleanup) {
        window._homeCleanup();
        delete window._homeCleanup;
    }
}
