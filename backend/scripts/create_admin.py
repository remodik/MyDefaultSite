import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from passlib.context import CryptContext
from sqlalchemy import select

from database import User, async_session_factory, init_models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_admin():
    await init_models()
    
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.username == "remodik"))
        existing = result.scalar_one_or_none()
        
        if existing:
            print("Admin user 'remodik' already exists")
            return

        admin = User(
            id=str(uuid.uuid4()),
            username="remodik",
            email="slenderzet@gmail.com",
            password_hash=pwd_context.hash("domer123"),
            role="admin",
            created_at=datetime.now(),
        )
        session.add(admin)
        await session.commit()
        print("Admin user 'remodik' created successfully!")
        print("Username: remodik")
        print("Password: domer123")
        print("Email: slenderzet@gmail.com")


if __name__ == "__main__":
    asyncio.run(create_admin())
