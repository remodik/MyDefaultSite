import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from database import Service, async_session_factory, init_models


async def check_services():
    await init_models()

    async with async_session_factory() as session:
        result = await session.execute(select(Service))
        services = result.scalars().all()

        if not services:
            print("No services found in database")
            return

        print(f"Found {len(services)} service(s):\n")
        for idx, service in enumerate(services, 1):
            print(f"--- Service {idx} ---")
            print(f"ID: {service.id}")
            print(f"Name: {service.name}")
            print(f"Description:\n{service.description}")
            print(f"Price: {service.price}")
            print(f"Estimated time: {service.estimated_time}")
            print(f"Payment methods: {service.payment_methods}")
            print(f"Frameworks: {service.frameworks}")
            print()


if __name__ == "__main__":
    asyncio.run(check_services())
