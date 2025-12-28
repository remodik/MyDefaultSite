const birthdayTimestamp = 1791406800;

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

    el.innerHTML = `<span style="color:#7289DA;font-weight:bold;">${relativeTime}</span> (${fullDate})`;
}

function formatRelativeTime(seconds) {
    if (seconds <= 0) return "сегодня! 🎉";

    const intervals = {
        год: 31536000,
        месяц: 2592000,
        неделя: 604800,
        день: 86400,
        час: 3600,
        минута: 60
    };

    const pluralRules = new Intl.PluralRules("ru");

    const forms = {
        год: ["год", "года", "лет"],
        месяц: ["месяц", "месяца", "месяцев"],
        неделя: ["неделя", "недели", "недель"],
        день: ["день", "дня", "дней"],
        час: ["час", "часа", "часов"],
        минута: ["минута", "минуты", "минут"]
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

function getLocalLikes() {
    return localStorage.getItem('pageLikes') ? parseInt(localStorage.getItem('pageLikes')) : 0;
}

function setLocalLikes(count) {
    localStorage.setItem('pageLikes', count.toString());
    localStorage.setItem('hasLiked', 'true');
}

function hasLikedLocally() {
    return localStorage.getItem('hasLiked') === 'true';
}

async function getStats() {
    try {
        const response = await fetch('stats.php');
        const data = await response.json();

        const viewsEl = document.getElementById('viewsCount');
        const likesEl = document.getElementById('likesCount');

        if (viewsEl) viewsEl.textContent = data.views || 0;
        if (likesEl) likesEl.textContent = data.likes || 0;

        if (data.hasLiked || hasLikedLocally()) {
            document.querySelector('#likesContainer i').className = 'fas fa-heart';
            document.querySelector('#likesContainer').style.color = '#e74c3c';
        }
    } catch (err) {
        console.error("Ошибка получения данных, используем локальные значения:", err);
        const viewsEl = document.getElementById('viewsCount');
        const likesEl = document.getElementById('likesCount');

        if (viewsEl) viewsEl.textContent = '0';
        if (likesEl) likesEl.textContent = getLocalLikes();

        if (hasLikedLocally()) {
            document.querySelector('#likesContainer i').className = 'fas fa-heart';
            document.querySelector('#likesContainer').style.color = '#e74c3c';
        }
    }
}

async function sendLike() {
    try {
        if (hasLikedLocally()) {
            alert('Вы уже поставили лайк! ❤️');
            return;
        }

        const response = await fetch('stats.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'like' })
        });

        const result = await response.json();

        if (result.success) {
            document.querySelector('#likesContainer i').className = 'fas fa-heart';
            document.querySelector('#likesContainer').style.color = '#e74c3c';
            document.getElementById('likesCount').textContent = result.likes;

            setLocalLikes(result.likes);

            alert('Спасибо за лайк! ❤️');
        } else {
            const currentLikes = getLocalLikes() + 1;
            setLocalLikes(currentLikes);

            document.querySelector('#likesContainer i').className = 'fas fa-heart';
            document.querySelector('#likesContainer').style.color = '#e74c3c';
            document.getElementById('likesCount').textContent = currentLikes;

            alert('Спасибо за лайк! ❤️');
        }
    } catch (err) {
        console.error("Ошибка отправки лайка, используем локальное хранилище:", err);
        const currentLikes = getLocalLikes() + 1;
        setLocalLikes(currentLikes);

        document.querySelector('#likesContainer i').className = 'fas fa-heart';
        document.querySelector('#likesContainer').style.color = '#e74c3c';
        document.getElementById('likesCount').textContent = currentLikes;

        alert('Спасибо за лайк! ❤️');
    }
}

window.addEventListener("DOMContentLoaded", () => {
    updateBirthdayCountdown();
    setInterval(updateBirthdayCountdown, 60000);
    getStats();

    document.getElementById('likesContainer').addEventListener('click', sendLike);
});
