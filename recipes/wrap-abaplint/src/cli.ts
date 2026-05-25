#!/usr/bin/env node
/**
 * abaplint MCP server entry point.
 *
 *   MCP_TRANSPORT=stdio node dist/cli.js
 *   MCP_TRANSPORT=http MCP_AUTH_TOKEN=secret node dist/cli.js
 *
 * abaplint runs in-process; there are no upstream credentials. The lint_file /
 * lint_directory tools read ABAP files from the filesystem the server runs on.
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./abaplint.tools.js";

serveFromEnv({
  name: "mcp-recipe-abaplint",
  version: "0.1.0",
  instructions:
    "Wraps abaplint (the ABAP linter): lint a string, a file, or a directory of .abap files, and explain rules. " +
    "Linting runs in-process; lint_file/lint_directory read from the server's filesystem.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
