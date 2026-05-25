"""Config parsing tests. Python twin of the TS `loadConfig` suite."""

from __future__ import annotations

import pytest

from mcp_kit_starter.config import (
    ConfigError,
    HttpConfig,
    StdioConfig,
    load_config,
)


def test_defaults_to_stdio() -> None:
    config = load_config({})
    assert isinstance(config, StdioConfig)
    assert config.transport == "stdio"


def test_stdio_is_case_insensitive_and_trimmed() -> None:
    assert isinstance(load_config({"MCP_TRANSPORT": "  STDIO "}), StdioConfig)


def test_parses_http_and_turns_auth_and_dns_on_with_token() -> None:
    config = load_config(
        {
            "MCP_TRANSPORT": "http",
            "MCP_HTTP_PORT": "8080",
            "MCP_AUTH_TOKEN": "s3cret",
        }
    )
    assert isinstance(config, HttpConfig)
    assert config.port == 8080
    assert config.host == "127.0.0.1"
    assert config.path == "/mcp"
    assert config.auth.token == "s3cret"
    assert config.auth.required is True
    assert config.dns_rebinding_protection is True
    assert "127.0.0.1:8080" in config.allowed_hosts


def test_http_without_token_runs_unauthenticated() -> None:
    config = load_config({"MCP_TRANSPORT": "http"})
    assert isinstance(config, HttpConfig)
    assert config.auth.token is None
    assert config.auth.required is False


def test_rejects_transport_outside_the_closed_list_of_two() -> None:
    with pytest.raises(ConfigError):
        load_config({"MCP_TRANSPORT": "websocket"})


def test_rejects_require_auth_without_a_token() -> None:
    with pytest.raises(ConfigError):
        load_config({"MCP_TRANSPORT": "http", "MCP_REQUIRE_AUTH": "true"})


def test_rejects_bad_port() -> None:
    with pytest.raises(ConfigError):
        load_config({"MCP_TRANSPORT": "http", "MCP_HTTP_PORT": "notaport"})
    with pytest.raises(ConfigError):
        load_config({"MCP_TRANSPORT": "http", "MCP_HTTP_PORT": "70000"})


def test_rejects_path_without_leading_slash() -> None:
    with pytest.raises(ConfigError):
        load_config({"MCP_TRANSPORT": "http", "MCP_HTTP_PATH": "mcp"})


def test_custom_host_port_path() -> None:
    config = load_config(
        {
            "MCP_TRANSPORT": "http",
            "MCP_HTTP_HOST": "0.0.0.0",
            "MCP_HTTP_PORT": "9000",
            "MCP_HTTP_PATH": "/rpc",
        }
    )
    assert isinstance(config, HttpConfig)
    assert (config.host, config.port, config.path) == ("0.0.0.0", 9000, "/rpc")
