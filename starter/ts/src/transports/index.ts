/** Transport selection: dispatch to stdio or Streamable HTTP from config. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "../config.js";
import { runHttp, type HttpServerHandle } from "./http.js";
import { runStdio } from "./stdio.js";

export { runStdio } from "./stdio.js";
export { runHttp } from "./http.js";
export type { HttpServerHandle } from "./http.js";

/**
 * Run a server over the transport named in `config`.
 *
 * Returns an {@link HttpServerHandle} for the HTTP transport (so callers can
 * close it), or `undefined` for stdio (which lives until the stream closes).
 */
export async function run(
  createServer: () => McpServer,
  config: AppConfig,
): Promise<HttpServerHandle | undefined> {
  if (config.transport === "stdio") {
    await runStdio(createServer());
    return undefined;
  }
  return runHttp(createServer, config);
}
