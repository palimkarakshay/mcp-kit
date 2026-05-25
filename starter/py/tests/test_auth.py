"""Bearer-auth tests.

Unit-tests the middleware's decision logic, plus an ASGI-level check that the
auth wrapper gates the real Streamable HTTP app (401 without token, pass-through
with the right token) -- without binding a real port.
"""

from __future__ import annotations

import pytest
from starlette.requests import Request

from mcp_kit_starter.auth import BearerAuthMiddleware, extract_bearer


def _request(headers: dict[str, str] | None = None) -> Request:
    raw = [
        (k.lower().encode(), v.encode()) for k, v in (headers or {}).items()
    ]
    return Request({"type": "http", "headers": raw, "method": "POST", "path": "/mcp"})


def _mw(token: str | None, required: bool = False) -> BearerAuthMiddleware:
    warnings: list[str] = []
    mw = BearerAuthMiddleware(
        app=lambda *a: None,  # type: ignore[arg-type]
        token=token,
        required=required,
        warn=warnings.append,
    )
    mw.warnings = warnings  # type: ignore[attr-defined]
    return mw


def test_extract_bearer() -> None:
    assert extract_bearer("Bearer abc") == "abc"
    assert extract_bearer("bearer  abc ") == "abc"
    assert extract_bearer("Basic abc") is None
    assert extract_bearer(None) is None
    assert extract_bearer("Bearer ") is None


def test_no_token_not_required_passes_and_warns_once() -> None:
    mw = _mw(token=None, required=False)
    assert mw._authorize(_request()) is None
    assert mw._authorize(_request()) is None  # second call: no second warning
    assert len(mw.warnings) == 1  # type: ignore[attr-defined]


def test_no_token_but_required_denies() -> None:
    mw = _mw(token=None, required=True)
    resp = mw._authorize(_request())
    assert resp is not None and resp.status_code == 401


def test_token_missing_header_denies_401() -> None:
    mw = _mw(token="secret")
    resp = mw._authorize(_request())
    assert resp is not None and resp.status_code == 401
    assert "WWW-Authenticate" in resp.headers


def test_token_wrong_denies_401() -> None:
    mw = _mw(token="secret")
    resp = mw._authorize(_request({"Authorization": "Bearer nope"}))
    assert resp is not None and resp.status_code == 401


def test_token_correct_allows() -> None:
    mw = _mw(token="secret")
    assert mw._authorize(_request({"Authorization": "Bearer secret"})) is None


# --- ASGI-level: the wrapper actually gates the real Streamable HTTP app. ---


def _build_app(token: str | None):
    from mcp_kit_starter.config import HttpConfig, HttpAuthConfig
    from mcp_kit_starter.server import create_starter_server
    from mcp_kit_starter.transports.http import build_http_app

    config = HttpConfig(
        host="127.0.0.1",
        port=3000,
        path="/mcp",
        auth=HttpAuthConfig(token=token, required=bool(token)),
        allowed_hosts=["127.0.0.1:3000", "localhost:3000", "testserver"],
        allowed_origins=[],
        dns_rebinding_protection=False,
    )
    # Returned without binding a port; a TestClient context manager runs the
    # app's lifespan (which starts the Streamable HTTP session manager).
    return build_http_app(create_starter_server(config), config)


_INIT = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "auth-test", "version": "0.0.0"},
    },
}
_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def test_http_initialize_rejected_without_token() -> None:
    from starlette.testclient import TestClient

    with TestClient(_build_app(token="secret")) as client:
        resp = client.post("/mcp", json=_INIT, headers=_HEADERS)
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"


def test_http_initialize_accepted_with_token() -> None:
    from starlette.testclient import TestClient

    with TestClient(_build_app(token="secret")) as client:
        resp = client.post(
            "/mcp",
            json=_INIT,
            headers={**_HEADERS, "Authorization": "Bearer secret"},
        )
    # Auth passed -> we reach the MCP layer and get a real initialize response
    # (200 SSE / JSON), not a 401.
    assert resp.status_code != 401
    assert resp.status_code == 200


def test_http_healthz_requires_token_when_configured() -> None:
    from starlette.testclient import TestClient

    with TestClient(_build_app(token="secret")) as client:
        denied = client.get("/healthz")
        ok = client.get("/healthz", headers={"Authorization": "Bearer secret"})
    # The auth hook gates every request, including the health probe.
    assert denied.status_code == 401
    assert ok.status_code == 200
    assert ok.json()["status"] == "ok"
