"""Create an admin with an interactively supplied password."""

import argparse
import asyncio
import uuid
from getpass import getpass
from pathlib import Path
import sys

import bcrypt
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import User, async_session_factory, init_models


async def create_admin(username: str, password: str, email: str | None) -> None:
    await init_models()
    async with async_session_factory() as session:
        if await session.scalar(select(User.id).where(User.username == username)):
            raise SystemExit("Пользователь с таким именем уже существует")
        session.add(User(id=str(uuid.uuid4()), username=username, email=email, role="admin",
                         password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()))
        await session.commit()
    print(f"Администратор {username} создан")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username")
    parser.add_argument("--email")
    args = parser.parse_args()
    if not 1 <= len(args.username) <= 50:
        parser.error("имя должно содержать от 1 до 50 символов")
    password = getpass("Пароль: ")
    if not password or len(password.encode()) > 72:
        parser.error("пароль должен содержать от 1 до 72 байт")
    if password != getpass("Повторите пароль: "):
        parser.error("пароли не совпадают")
    asyncio.run(create_admin(args.username, password, args.email))
