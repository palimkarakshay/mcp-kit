"""mcp-kit-starter -- the hardened MCP server base, Python twin of ``../ts``.

Hardened MCP server base: transport selection (stdio + Streamable HTTP), an auth
hook, structured errors, and a tool helper. Importable to build your own server,
or runnable on its own via ``python -m mcp_kit_starter``.
"""

from __future__ import annotations

from .config import (
    AppConfig,
    ConfigError,
    HttpAuthConfig,
    HttpConfig,
    StdioConfig,
    load_config,
)
from .errors import (
    ErrorCode,
    McpToolError,
    error_result,
    invalid_input,
    not_found,
    timeout,
    upstream_error,
)
from .server import (
    SERVER_NAME,
    SERVER_VERSION,
    create_starter_server,
    starter_tools,
)
from .tool import (
    ToolExample,
    ToolSpec,
    define_tool,
    register_tool,
    register_tools,
    wrap_handler,
)

__version__ = SERVER_VERSION

__all__ = [
    "AppConfig",
    "ConfigError",
    "HttpAuthConfig",
    "HttpConfig",
    "StdioConfig",
    "load_config",
    "ErrorCode",
    "McpToolError",
    "error_result",
    "invalid_input",
    "not_found",
    "timeout",
    "upstream_error",
    "SERVER_NAME",
    "SERVER_VERSION",
    "create_starter_server",
    "starter_tools",
    "ToolExample",
    "ToolSpec",
    "define_tool",
    "register_tool",
    "register_tools",
    "wrap_handler",
    "__version__",
]
