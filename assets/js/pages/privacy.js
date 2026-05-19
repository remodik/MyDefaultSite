export function render() {
    return `
        <div class="min-h-screen px-4 py-12">
            <div class="max-w-3xl mx-auto">
                <div class="bg-discord-light rounded-lg shadow-xl p-8 fade-in">
                    <div class="mb-8">
                        <a href="/" class="text-discord-accent hover:underline text-sm">
                            <i class="fas fa-arrow-left mr-1"></i>На главную
                        </a>
                    </div>

                    <h1 class="text-3xl font-bold text-white mb-2">Политика конфиденциальности</h1>
                    <p class="text-discord-text text-sm mb-8">Последнее обновление: 19 мая 2026 г.</p>

                    <div class="space-y-6 text-discord-text leading-relaxed">

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">1. Оператор персональных данных</h2>
                            <p>Оператором персональных данных является:</p>
                            <div class="mt-2 p-4 bg-discord-dark rounded-lg text-sm">
                                <p><span class="text-white">ФИО:</span> Головкин Илья Максимович</p>
                                <p><span class="text-white">ИНН:</span> 526110332609</p>
                                <p><span class="text-white">Статус:</span> Самозанятый (плательщик НПД)</p>
                                <p><span class="text-white">Сайт:</span> remod3.ru</p>
                                <p><span class="text-white">Email:</span> <a href="/contact" class="text-discord-accent hover:underline">Форма обратной связи</a></p>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">2. Какие данные мы собираем</h2>
                            <ul class="list-disc list-inside space-y-1">
                                <li>Имя пользователя (логин)</li>
                                <li>Адрес электронной почты (если указан)</li>
                                <li>Хешированный пароль</li>
                                <li>История сообщений в чате</li>
                                <li>Данные о покупках и подписках</li>
                                <li>Технические данные: IP-адрес, время запросов (в логах сервера)</li>
                            </ul>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">3. Цели обработки данных</h2>
                            <ul class="list-disc list-inside space-y-1">
                                <li>Предоставление доступа к функциям сайта</li>
                                <li>Восстановление пароля по email</li>
                                <li>Обработка покупок и предоставление доступа к платным материалам</li>
                                <li>Обеспечение безопасности и защита от злоупотреблений</li>
                            </ul>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">4. Хранение и защита данных</h2>
                            <p>Данные хранятся на защищённых серверах. Пароли хранятся только в виде хеша (bcrypt) и не могут быть восстановлены. Передача данных третьим лицам не осуществляется, за исключением случаев, предусмотренных законодательством РФ.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">5. Права пользователя</h2>
                            <p>В соответствии с ФЗ-152 «О персональных данных» вы вправе:</p>
                            <ul class="list-disc list-inside space-y-1 mt-2">
                                <li>Получить информацию об обработке ваших данных</li>
                                <li>Потребовать исправления или удаления данных</li>
                                <li>Отозвать согласие на обработку</li>
                            </ul>
                            <p class="mt-2">Для реализации прав обратитесь через <a href="/contact" class="text-discord-accent hover:underline">форму обратной связи</a>.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">6. Cookies</h2>
                            <p>Сайт использует localStorage для хранения токена авторизации на вашем устройстве. Сторонние аналитические cookies не используются.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">7. Применимое право</h2>
                            <p>Настоящая политика регулируется законодательством Российской Федерации, в том числе ФЗ-152 «О персональных данных».</p>
                        </section>

                    </div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {}
export function unmount() {}
