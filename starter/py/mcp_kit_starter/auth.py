"""The auth hook -- at the transport, never in tool inputs.

Credentials are a transport concern. The model should never see or handle a
token, so no tool's input schema may contain one. For Streamable HTTP we
validate a bearer token in ASGI middleware before the request ever reaches the
MCP layer; for stdio there is no auth surface -- the parent process that spawned
the server owns identity.

This is the Python twin of ``../ts/src/auth.ts``. The Python MCP SDK ships an
OAuth/JWT-oriented auth stack; the starter deliberately mirrors the TS twin's
simpler shared-bearer-token check instead, applied as a Starlette middleware
around the Streamable HTTP app.
"""

from __future__ import annotations

import hmac
import re
import sys
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

_BEARER_RE = re.compile(r"^Bearer\s+(.+)$", re.IGNORECASE)


def _constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def extract_bearer(header: str | None) -> str | None:
    """Pull the token out of an ``Authorization: Bearer <token>`` header."""
    if not header:
        return None
    match = _BEARER_RE.match(header.strip())
    if not match:
        return None
    token = match.group(1).strip()
    return token or None


def _deny(status: int, message: str, realm: str) -> Response:
    headers: dict[str, str] = {}
    code = "unauthorized"
    if status == 401:
        headers["WWW-Authenticate"] = f'Bearer realm="{realm}", error="invalid_token"'
    else:
        code = "forbidden"
    return JSONResponse(
        {"error": {"code": code, "message": message, "retryable": False}},
        status_code=status,
        headers=headers,
    )


class BearerAuthMiddleware:
    """ASGI middleware enforcing shared bearer-token auth for HTTP.

    Mirrors ``bearerAuth`` from the TS twin:

    - No token configured and not required: log a one-time dev warning to
      stderr and pass through.
    - Token configured: require ``Authorization: Bearer <token>`` (constant-time
      compared) or respond ``401`` with a JSON error envelope.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        token: str | None,
        required: bool,
        realm: str = "mcp",
        warn: Callable[[str], None] | None = None,
    ) -> None:
        self.app = app
        self.token = token
        self.required = required
        self.realm = realm
        self._warn = warn or (lambda msg: print(msg, file=sys.stderr))
        self._warned = False

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        decision = self._authorize(Request(scope, receive))
        if decision is not None:
            await decision(scope, receive, send)
            return

        await self.app(scope, receive, send)

    def _authorize(self, request: Request) -> Response | None:
        """Return a denial Response, or None to allow the request through."""
        if not self.token:
            if self.required:
                return _deny(
                    401,
                    "Authentication required but no verifier is configured.",
                    self.realm,
                )
            if not self._warned:
                self._warn(
                    "[auth] HTTP transport is running WITHOUT authentication "
                    "(no MCP_AUTH_TOKEN set)."
                )
                self._warned = True
            return None

        presented = extract_bearer(request.headers.get("authorization"))
        if not presented:
            return _deny(
                401, "Missing bearer token in Authorization header.", self.realm
            )
        if not _constant_time_equals(presented, self.token):
            return _deny(401, "Invalid bearer token.", self.realm)
        return None
