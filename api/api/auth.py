import time
from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from api.config import get_settings

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0


def _fetch_jwks() -> dict:
    """Fetch and cache Supabase's JWKS for asymmetric token verification."""
    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if _jwks_cache is not None and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS:
        return _jwks_cache

    url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=5)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    _jwks_fetched_at = now
    return _jwks_cache


def _find_jwk(kid: str | None) -> dict | None:
    if not kid:
        return None
    try:
        jwks = _fetch_jwks()
    except httpx.HTTPError:
        return None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    token = authorization.split(" ", 1)[1]
    settings = get_settings()

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Bad token header: {e}")

    kid = header.get("kid")
    alg = header.get("alg", "HS256")

    jwk = _find_jwk(kid)
    if jwk is not None:
        try:
            payload = jwt.decode(
                token,
                jwk,
                algorithms=[alg],
                audience="authenticated",
            )
        except JWTError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
    else:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except JWTError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    if not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub")
    return payload


CurrentUser = Annotated[dict, Depends(current_user)]
