import asyncio
import os
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete

DB_FD, DB_PATH = tempfile.mkstemp(prefix="mydefaultsite-test-", suffix=".db")
os.close(DB_FD)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH}"

from fastapi.testclient import TestClient  # noqa: E402

from backend.database import Conversation, DirectMessage, User, UserProfile, async_session_factory, engine  # noqa: E402
from backend.server import ACCESS_TOKEN_EXPIRE_MINUTES, app, create_access_token, get_password_hash  # noqa: E402


class ProfileAndConversationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._client_context = TestClient(app)
        cls.client = cls._client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls._client_context.__exit__(None, None, None)
        asyncio.run(engine.dispose())
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def setUp(self):
        asyncio.run(self._reset_database())

    @staticmethod
    async def _reset_database():
        async with async_session_factory() as session:
            await session.execute(delete(DirectMessage))
            await session.execute(delete(Conversation))
            await session.execute(delete(UserProfile))
            await session.execute(delete(User))
            await session.commit()

    @staticmethod
    async def _create_user(username: str) -> User:
        async with async_session_factory() as session:
            user = User(
                id=str(uuid.uuid4()),
                username=username,
                email=f"{username}@example.com",
                password_hash=get_password_hash("password123"),
                role="user",
                created_at=datetime.now(),
            )
            session.add(user)
            await session.commit()
            return user

    @staticmethod
    def _auth_headers(user_id: str) -> dict[str, str]:
        token = create_access_token(
            {"sub": user_id},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_profile_get_and_put(self):
        user = asyncio.run(self._create_user("alice"))
        headers = self._auth_headers(user.id)

        response = self.client.get("/api/me/profile", headers=headers)
        self.assertEqual(response.status_code, 200)
        profile = response.json()
        self.assertEqual(profile["username"], "alice")
        self.assertEqual(profile["display_name"], "alice")
        self.assertEqual(profile["privacy_dm"], "all")

        update_response = self.client.put(
            "/api/me/profile",
            headers=headers,
            json={
                "display_name": "Alice Cooper",
                "bio": "Backend developer",
                "privacy_dm": "none",
                "accent_color": "#5865f2",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        updated_profile = update_response.json()
        self.assertEqual(updated_profile["display_name"], "Alice Cooper")
        self.assertEqual(updated_profile["bio"], "Backend developer")
        self.assertEqual(updated_profile["privacy_dm"], "none")
        self.assertEqual(updated_profile["accent_color"], "#5865f2")

        fetch_again = self.client.get("/api/me/profile", headers=headers)
        self.assertEqual(fetch_again.status_code, 200)
        final_profile = fetch_again.json()
        self.assertEqual(final_profile["display_name"], "Alice Cooper")
        self.assertEqual(final_profile["privacy_dm"], "none")

    def test_conversations_list(self):
        user_a = asyncio.run(self._create_user("alice"))
        user_b = asyncio.run(self._create_user("bob"))
        user_c = asyncio.run(self._create_user("charlie"))

        headers_a = self._auth_headers(user_a.id)
        headers_c = self._auth_headers(user_c.id)

        conversation_response = self.client.post(
            "/api/conversations",
            headers=headers_a,
            json={"user_id": user_b.id},
        )
        self.assertEqual(conversation_response.status_code, 200)
        conversation = conversation_response.json()
        conversation_id = conversation["id"]

        send_response = self.client.post(
            f"/api/conversations/{conversation_id}/messages",
            headers=headers_a,
            json={"text": "Hello Bob"},
        )
        self.assertEqual(send_response.status_code, 200)

        list_response = self.client.get("/api/me/conversations", headers=headers_a)
        self.assertEqual(list_response.status_code, 200)
        conversation_list = list_response.json()
        self.assertEqual(len(conversation_list), 1)
        self.assertEqual(conversation_list[0]["id"], conversation_id)
        self.assertEqual(conversation_list[0]["last_message"], "Hello Bob")

        empty_list_response = self.client.get("/api/me/conversations", headers=headers_c)
        self.assertEqual(empty_list_response.status_code, 200)
        self.assertEqual(empty_list_response.json(), [])


if __name__ == "__main__":
    unittest.main()
