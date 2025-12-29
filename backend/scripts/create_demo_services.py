import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from database import Service, async_session_factory, init_models

DEMO_SERVICES = [
    {
        "name": "Discord Bot Development",
        "description": "Custom Discord bot with moderation, music, games, leveling system, and more. Full integration with Discord API.",
        "price": "от 3000 ₽",
        "estimated_time": "3-7 дней",
        "payment_methods": "Qiwi, YooMoney, СБП, Криптовалюта",
        "frameworks": "Python, Py-cord, Disnake, Discord.py",
    },
    {
        "name": "Telegram Bot Development",
        "description": "Telegram bots for automation, notifications, payments, inline queries, and custom keyboards.",
        "price": "от 2500 ₽",
        "estimated_time": "2-5 дней",
        "payment_methods": "Qiwi, YooMoney, СБП, Криптовалюта",
        "frameworks": "Python, Aiogram, Telebot",
    },
    {
        "name": "Web Scraping & Automation",
        "description": "Data extraction from websites, automation scripts, API integration, and data processing.",
        "price": "от 2000 ₽",
        "estimated_time": "1-4 дня",
        "payment_methods": "Qiwi, YooMoney, СБП",
        "frameworks": "Python, BeautifulSoup, Selenium, Scrapy",
    },
    {
        "name": "Landing Page Development",
        "description": "Modern responsive landing pages with animations, forms, and SEO optimization.",
        "price": "от 5000 ₽",
        "estimated_time": "5-10 дней",
        "payment_methods": "Qiwi, YooMoney, СБП, Криптовалюта",
        "frameworks": "HTML, CSS, JavaScript, Tailwind CSS",
    },
]


async def create_demo_services():
    await init_models()
    
    async with async_session_factory() as session:
        result = await session.execute(select(Service))
        existing = result.scalars().all()
        
        if existing:
            print(f"Services already exist ({len(existing)} services)")
            return

        for service_data in DEMO_SERVICES:
            service = Service(
                id=str(uuid.uuid4()),
                name=service_data["name"],
                description=service_data["description"],
                price=service_data["price"],
                estimated_time=service_data["estimated_time"],
                payment_methods=service_data["payment_methods"],
                frameworks=service_data["frameworks"],
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(service)
        
        await session.commit()
        print(f"Created {len(DEMO_SERVICES)} demo services successfully!")


if __name__ == "__main__":
    asyncio.run(create_demo_services())
