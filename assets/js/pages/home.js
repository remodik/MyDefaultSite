// Home page

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
    el.innerHTML = `<span class="text-discord-accent font-bold">${relativeTime}</span> (${fullDate})`;
}

export function render() {
    return `
        <div class="max-w-lg mx-auto px-4 py-8">
            <div class="card fade-in">
                <!-- Banner -->
                <div class="banner" style="background-image: url('/assets/images/blue_mybanner.gif'); background-size: cover; background-position: center;"></div>
                
                <!-- Header -->
                <div class="relative -mt-16 px-6 pb-6 text-center">
                    <div class="inline-block relative">
                        <img src="/assets/images/blue_avatar.png" alt="Avatar" class="avatar mx-auto" onerror="this.src='https://via.placeholder.com/120/5865F2/ffffff?text=R'">
                    </div>
                    <h1 class="text-2xl font-bold text-white mt-4">remod3</h1>
                    <div class="mt-2 space-x-2">
                        <span class="tag tag-primary">チェリー | せんちゃ</span>
                    </div>
                    <div class="mt-1">
                        <span class="tag bg-discord-light text-white">ベテルギウスロマネ・コンティ</span>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="bg-discord-light px-6 py-8 space-y-6">
                    <!-- About -->
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
                    
                    <!-- Skills -->
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
                    
                    <!-- Contacts -->
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
                                <span>Тояма, Япония (мечтаю там побывать)</span>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Social Links -->
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
    `;
}

export function mount() {
    updateBirthdayCountdown();
    const interval = setInterval(updateBirthdayCountdown, 60000);
    
    // Store cleanup function
    window._homeCleanup = () => clearInterval(interval);
}

export function unmount() {
    if (window._homeCleanup) {
        window._homeCleanup();
        delete window._homeCleanup;
    }
}