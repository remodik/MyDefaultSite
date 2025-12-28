// 404 Not Found page

export function render() {
    return `
        <div class="min-h-screen flex items-center justify-center px-4">
            <div class="text-center">
                <div class="text-9xl font-bold text-discord-accent opacity-20">404</div>
                <h1 class="text-3xl font-bold text-white mt-4">Страница не найдена</h1>
                <p class="text-discord-text mt-2 mb-8">Запрашиваемая страница не существует</p>
                <a href="/" class="btn btn-primary">
                    <i class="fas fa-home"></i>
                    На главную
                </a>
            </div>
        </div>
    `;
}

export function mount() {}

export function unmount() {}