import time
import uuid
from typing import Any

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from jose import jwt

from api.auth import current_user
from api.config import get_settings


def _token(payload: dict[str, Any]) -> str:
    secret = get_settings().supabase_jwt_secret
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    @app.get("/me")
    def me(user: dict = Depends(current_user)) -> dict:
        return user

    return TestClient(app)


def test_current_user_accepts_valid_token(client: TestClient) -> None:
    user_id = str(uuid.uuid4())
    token = _token({
        "sub": user_id,
        "email": "v@example.com",
        "exp": int(time.time()) + 3600,
        "aud": "authenticated",
    })
    res = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["sub"] == user_id


def test_current_user_rejects_missing_token(client: TestClient) -> None:
    res = client.get("/me")
    assert res.status_code == 401


def test_current_user_rejects_expired_token(client: TestClient) -> None:
    token = _token({
        "sub": str(uuid.uuid4()),
        "email": "v@example.com",
        "exp": int(time.time()) - 60,
        "aud": "authenticated",
    })
    res = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
