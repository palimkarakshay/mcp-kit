/**
 * The one-call entry every server in the kit uses: read config from the
 * environment, build a server from a list of tools, and run it over the
 * selected transport (with graceful shutdown for HTTP).
 *
 * This is what makes a recipe's `cli.ts` a three-line file.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ConfigError, loadConfig } from "./config.js";
import { registerTools, type AnyToolSpec } from "./tool.js";
import { run, type HttpServerHandle } from "./transports/index.js";

export interface ServeOptions {
  name: string;
  version: string;
  instructions?: string;
  tools: readonly AnyToolSpec[];
}

/** Build a fresh server instance from {@link ServeOptions}. */
export function buildServer(options: ServeOptions): McpServer {
  const server = new McpServer(
    { name: options.name, version: options.version },
    options.instructions ? { instructions: options.instructions } : undefined,
  );
  registerTools(server, options.tools);
  return server;
}

/**
 * Load config, then serve. Exits the process with code 2 on a configuration
 * error. Returns an {@link HttpServerHandle} for HTTP (with SIGINT/SIGTERM
 * shutdown wired up) or `undefined` for stdio.
 */
export async function serveFromEnv(options: ServeOptions): Promise<HttpServerHandle | undefined> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[mcp] configuration error:\n${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  const handle = await run(() => buildServer(options), config);

  if (handle) {
    const shutdown = (): void => {
      handle
        .close()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
  return handle;
}
