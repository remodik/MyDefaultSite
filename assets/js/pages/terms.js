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

                    <h1 class="text-3xl font-bold text-white mb-2">Пользовательское соглашение</h1>
                    <p class="text-discord-text text-sm mb-8">Последнее обновление: 19 мая 2026 г.</p>

                    <div class="space-y-6 text-discord-text leading-relaxed">

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">1. Исполнитель</h2>
                            <div class="p-4 bg-discord-dark rounded-lg text-sm">
                                <p><span class="text-white">ФИО:</span> Головкин Илья Максимович</p>
                                <p><span class="text-white">ИНН:</span> 526110332609</p>
                                <p><span class="text-white">Статус:</span> Самозанятый (плательщик НПД)</p>
                                <p><span class="text-white">Сайт:</span> remod3.ru</p>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">2. Предмет соглашения</h2>
                            <p>Настоящее соглашение регулирует использование сайта remod3.ru, включая бесплатные и платные функции: курсы, программное обеспечение (AutoMute, лицензии), доступ к проектам и чату.</p>
                            <p class="mt-2">Регистрируясь на сайте, вы принимаете условия настоящего соглашения и <a href="/privacy" class="text-discord-accent hover:underline">Политики конфиденциальности</a>.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">3. Правила использования</h2>
                            <p>Пользователь обязуется:</p>
                            <ul class="list-disc list-inside space-y-1 mt-2">
                                <li>Не передавать доступ к аккаунту третьим лицам</li>
                                <li>Не использовать сайт для незаконной деятельности</li>
                                <li>Не распространять приобретённые материалы без разрешения</li>
                                <li>Не злоупотреблять функцией чата (спам, оскорбления)</li>
                            </ul>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">4. Платные услуги и цифровые товары</h2>
                            <p>Курсы, лицензии и подписки являются цифровыми товарами. После оплаты и предоставления доступа к цифровому контенту возврат средств не производится — в соответствии с п. 4 ст. 26.1 Закона РФ «О защите прав потребителей» и Постановлением Правительства РФ № 2463 от 31.12.2020 (товары надлежащего качества, не подлежащие обмену и возврату).</p>
                            <p class="mt-2">Исключение: если доступ к оплаченному товару не был предоставлен по техническим причинам на стороне исполнителя — возврат производится в полном объёме. Обратитесь через <a href="/contact" class="text-discord-accent hover:underline">форму обратной связи</a>.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">5. Подписки (AutoMute)</h2>
                            <p>Подписка действует в течение оплаченного периода. Исполнитель вправе изменить условия подписки с уведомлением не менее чем за 7 дней. Автоматического продления подписки нет — оплата производится вручную при желании продолжить использование.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">6. Ограничение ответственности</h2>
                            <p>Сайт предоставляется «как есть». Исполнитель не несёт ответственности за перебои в работе сервиса, вызванные действиями третьих лиц, хостинг-провайдера или форс-мажорными обстоятельствами.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">7. Изменение соглашения</h2>
                            <p>Исполнитель вправе вносить изменения в настоящее соглашение. Актуальная версия всегда доступна по адресу <a href="/terms" class="text-discord-accent hover:underline">remod3.ru/terms</a>. Продолжение использования сайта после публикации изменений означает их принятие.</p>
                        </section>

                        <section>
                            <h2 class="text-xl font-semibold text-white mb-3">8. Применимое право</h2>
                            <p>Настоящее соглашение регулируется законодательством Российской Федерации. Все споры рассматриваются в суде по месту нахождения исполнителя.</p>
                        </section>

                    </div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {}
export function unmount() {}
