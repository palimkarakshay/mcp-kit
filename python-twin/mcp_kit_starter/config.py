"""Environment-driven configuration.

One server binary, two transports, chosen by ``MCP_TRANSPORT``. Everything is
read from the environment so the same install runs locally over stdio and
remotely over Streamable HTTP without code changes.

This is the Python twin of ``../starter/src/config.ts`` and keeps the same env var
names and defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Mapping

_TRUTHY = {"1", "true", "yes", "on"}


def _boolish(value: str | None) -> bool | None:
    """Parse a permissive boolean. Returns None when the var is unset."""
    if value is None:
        return None
    return value.strip().lower() in _TRUTHY


def _list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class ConfigError(Exception):
    """Raised with an actionable message on bad configuration input."""


@dataclass(frozen=True)
class HttpAuthConfig:
    """Bearer-token auth settings for the HTTP transport."""

    #: Shared bearer token expected on every request, if any.
    token: str | None = None
    #: When true, the server refuses to serve requests without a valid token.
    required: bool = False


@dataclass(frozen=True)
class StdioConfig:
    """Configuration for the stdio transport (no auth surface)."""

    transport: Literal["stdio"] = "stdio"


@dataclass(frozen=True)
class HttpConfig:
    """Configuration for the Streamable HTTP transport."""

    host: str = "127.0.0.1"
    port: int = 3000
    #: Path the MCP endpoint is mounted at, e.g. ``/mcp``.
    path: str = "/mcp"
    #: Stateless mode creates a fresh server per request (no sessions/SSE).
    stateless: bool = False
    auth: HttpAuthConfig = field(default_factory=HttpAuthConfig)
    #: ``Host`` header allow-list for DNS-rebinding protection.
    allowed_hosts: list[str] = field(default_factory=list)
    #: ``Origin`` header allow-list for DNS-rebinding protection.
    allowed_origins: list[str] = field(default_factory=list)
    dns_rebinding_protection: bool = False
    transport: Literal["http"] = "http"


AppConfig = StdioConfig | HttpConfig


def _parse_port(raw: str | None) -> int:
    if raw is None or raw.strip() == "":
        return 3000
    try:
        port = int(raw)
    except ValueError as exc:
        raise ConfigError(
            f"MCP_HTTP_PORT must be an integer 0-65535, got {raw!r}."
        ) from exc
    if not 0 <= port <= 65535:
        raise ConfigError(f"MCP_HTTP_PORT must be 0-65535, got {port}.")
    return port


def load_config(env: Mapping[str, str] | None = None) -> AppConfig:
    """Parse :data:`AppConfig` from an environment bag (defaults to ``os.environ``).

    Raises:
        ConfigError: with an actionable message on bad input.
    """
    if env is None:
        env = os.environ

    transport = (env.get("MCP_TRANSPORT") or "stdio").strip().lower()

    if transport == "stdio":
        return StdioConfig()
    if transport != "http":
        raise ConfigError(
            'MCP_TRANSPORT must be "stdio" or "http" (the two MCP transports), '
            f'got "{transport}".'
        )

    host = (env.get("MCP_HTTP_HOST") or "127.0.0.1").strip() or "127.0.0.1"
    port = _parse_port(env.get("MCP_HTTP_PORT"))

    path = env.get("MCP_HTTP_PATH") or "/mcp"
    if not path.startswith("/"):
        raise ConfigError("MCP_HTTP_PATH must start with '/'.")

    token = env.get("MCP_AUTH_TOKEN")
    if token is not None and token == "":
        token = None
    required_flag = _boolish(env.get("MCP_REQUIRE_AUTH")) or False
    if required_flag and not token:
        raise ConfigError(
            "MCP_REQUIRE_AUTH is set but MCP_AUTH_TOKEN is empty. "
            "Provide a token or unset MCP_REQUIRE_AUTH."
        )

    allowed_hosts = _list(env.get("MCP_ALLOWED_HOSTS"))
    allowed_origins = _list(env.get("MCP_ALLOWED_ORIGINS"))
    # Default to protecting the configured bind address unless told otherwise.
    if not allowed_hosts:
        allowed_hosts = [f"{host}:{port}", f"localhost:{port}"]

    dns_flag = _boolish(env.get("MCP_DNS_REBINDING_PROTECTION"))
    dns_rebinding_protection = (
        dns_flag
        if dns_flag is not None
        else (bool(allowed_hosts) or bool(allowed_origins))
    )

    auth = HttpAuthConfig(token=token, required=required_flag or bool(token))

    return HttpConfig(
        host=host,
        port=port,
        path=path,
        stateless=_boolish(env.get("MCP_STATELESS")) or False,
        auth=auth,
        allowed_hosts=allowed_hosts,
        allowed_origins=allowed_origins,
        dns_rebinding_protection=dns_rebinding_protection,
    )
