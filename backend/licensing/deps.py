"""Authentication for the licensing subsystem.

Two *separate* audiences, deliberately kept apart:

* :func:`get_current_admin` — you, the owner. Reuses the site's JWT (same
  ``SECRET_KEY`` / ``users`` table) and requires ``role == "admin"``.
* :func:`get_current_portal_client` — a paying client in the self-service
  portal, authenticated by presenting a **license key** (see
  :mod:`licensing.portal_routes`). No password, no account: the key *is* the
  credential, exactly as it is for the bot.

Both token families are signed with the same secret, so they are told apart by
a mandatory ``typ`` claim and each dependency rejects the other's tokens. A
portal token must never be usable as an admin token.

Defined here — rather than imported from ``server`` — to avoid a circular
import, since ``server`` imports the licensing routers.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import User, get_session
from licensing.models import LicClient

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this")
ALGORITHM = "HS256"

# Marks a client-portal token. The site's own login issues tokens without a
# ``typ``, so this claim is what keeps the two audiences from crossing over.
PORTAL_TOKEN_TYPE = "lic_portal"
PORTAL_TOKEN_TTL_HOURS = 24 * 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
portal_scheme = HTTPBearer(auto_error=False)


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    # A client-portal token is signed with the same key; never let one through
    # as an admin credential.
    if payload.get("typ") == PORTAL_TOKEN_TYPE:
        raise credentials_exception

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# --------------------------------------------------------------------------- #
# Client portal
# --------------------------------------------------------------------------- #
def create_portal_token(client_id: int) -> str:
    """Issue a portal session token for a client.

    Scoped to the *client*, not to the license they logged in with: one client
    may hold several licenses and expects to see them all in one place.
    """
    expires_at = datetime.utcnow() + timedelta(hours=PORTAL_TOKEN_TTL_HOURS)
    return jwt.encode(
        {"sub": str(client_id), "typ": PORTAL_TOKEN_TYPE, "exp": expires_at},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


async def get_current_portal_client(
    credentials: HTTPAuthorizationCredentials | None = Depends(portal_scheme),
    session: AsyncSession = Depends(get_session),
) -> LicClient:
    """Resolve the client behind a portal token, or raise 401."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise credentials_exception

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:  # bad signature, or expired
        raise credentials_exception from exc

    # Only tokens minted by the portal login may be used here — an admin's
    # site token must not silently become a client session.
    if payload.get("typ") != PORTAL_TOKEN_TYPE:
        raise credentials_exception

    raw_id = payload.get("sub")
    try:
        client_id = int(raw_id)
    except (TypeError, ValueError) as exc:
        raise credentials_exception from exc

    client = await session.get(LicClient, client_id)
    if client is None:  # client deleted since the token was issued
        raise credentials_exception
    return client
