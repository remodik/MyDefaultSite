import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from database import Service, async_session_factory, init_models


# Улучшенные описания с markdown форматированием
ENHANCED_DESCRIPTIONS = {
    "Discord Bot Development": """**Разработка кастомного Discord бота** с полной интеграцией Discord API.

**Возможности:**
- Система модерации и управления сервером
- Музыкальный плеер с поддержкой различных источников
- Мини-игры и развлекательный контент
- Система уровней и достижений
- Кастомные команды и события
- Интеграция с внешними API

**Технологии:** Python, Py-cord, Disnake, Discord.py""",

    "Telegram Bot Development": """**Разработка Telegram ботов** для автоматизации бизнес-процессов и взаимодействия с пользователями.

**Функционал:**
- Автоматизация рутинных задач
- Система уведомлений и рассылок
- Приём платежей (Telegram Payments API)
- Inline-режим и inline-кнопки
- Кастомные клавиатуры
- Работа с базами данных

**Технологии:** Python, Aiogram, Telebot""",

    "Web Scraping & Automation": """**Парсинг данных и автоматизация** веб-процессов под ключ.

**Услуги:**
- Извлечение данных с веб-сайтов
- Мониторинг изменений на сайтах
- Автоматизация рутинных действий в браузере
- Интеграция с внешними API
- Обработка и структурирование данных
- Экспорт в различные форматы (CSV, JSON, Excel)

**Технологии:** Python, BeautifulSoup, Selenium, Scrapy""",

    "Landing Page Development": """**Создание современных лендинг-пейдж** с адаптивным дизайном и SEO-оптимизацией.

**Что входит:**
- Адаптивный дизайн для всех устройств
- Плавные анимации и переходы
- Формы обратной связи
- SEO-оптимизация
- Оптимизация скорости загрузки
- Интеграция с аналитикой (Google Analytics, Яндекс.Метрика)

**Технологии:** HTML5, CSS3, JavaScript, Tailwind CSS"""
}


async def add_markdown_formatting():
    await init_models()

    async with async_session_factory() as session:
        result = await session.execute(select(Service))
        services = result.scalars().all()

        if not services:
            print("No services found in database")
            return

        updated_count = 0
        for service in services:
            if service.name in ENHANCED_DESCRIPTIONS:
                old_description = service.description
                service.description = ENHANCED_DESCRIPTIONS[service.name]
                updated_count += 1

                print(f"✓ Updated: {service.name}")
                print(f"  Old: {old_description[:50]}...")
                print(f"  New: {service.description[:50]}...")
                print()

        await session.commit()
        print(f"\n✓ Successfully updated {updated_count} service(s) with markdown formatting!")


if __name__ == "__main__":
    asyncio.run(add_markdown_formatting())
