/**
 * Streamable HTTP transport (legacy name: HTTP+SSE).
 *
 * For remote / multi-user servers. Two modes, picked by config:
 *
 *  - **stateful** (default): the first `initialize` mints a session id; the
 *    client echoes it back in `Mcp-Session-Id` on later requests and may open
 *    a GET stream for server→client messages. One MCP server instance per
 *    session.
 *  - **stateless**: a fresh server + transport per request, no session, no
 *    streaming. Simplest to run behind a load balancer / in serverless.
 *
 * Auth and DNS-rebinding protection live here, at the transport — not in any
 * tool's inputs.
 */
import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from "express";

import { bearerAuth } from "../auth.js";
import type { HttpConfig } from "../config.js";

export interface HttpServerHandle {
  /** The underlying Node HTTP server. */
  server: HttpServer;
  /** Fully-qualified URL of the MCP endpoint. */
  url: string;
  /** Close active sessions and stop listening. */
  close: () => Promise<void>;
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: "invalid_input", message, retryable: false } });
}

/**
 * Start the HTTP transport and return a handle for shutting it down (used by
 * tests and graceful-shutdown signals).
 *
 * @param createServer - factory invoked once per session (stateful) or once
 *   per request (stateless). Each call must return a freshly-built server.
 */
export async function runHttp(
  createServer: () => McpServer,
  config: HttpConfig,
): Promise<HttpServerHandle> {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", transport: "http", mode: config.stateless ? "stateless" : "stateful" });
  });

  // Auth hook: enforced for every request to the MCP endpoint.
  app.use(config.path, bearerAuth({ ...config.auth }));

  const transportOptions = {
    enableDnsRebindingProtection: config.dnsRebindingProtection,
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
  } as const;

  // Tracks live sessions so we can route follow-up requests and clean up.
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  if (config.stateless) {
    app.all(
      config.path,
      asyncRoute(async (req, res) => {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          ...transportOptions,
        });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      }),
    );
  } else {
    app.post(
      config.path,
      asyncRoute(async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (typeof sessionId === "string") {
          const existing = sessions.get(sessionId);
          if (!existing) {
            badRequest(res, `Unknown session "${sessionId}". Re-initialize.`);
            return;
          }
          await existing.handleRequest(req, res, req.body);
          return;
        }

        if (!isInitializeRequest(req.body)) {
          badRequest(res, "No session id and not an initialize request. Send initialize first.");
          return;
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          ...transportOptions,
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };
        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        const sid = transport.sessionId;
        if (sid) sessions.set(sid, transport);
      }),
    );

    const replay = asyncRoute(async (req, res) => {
      const sessionId = req.headers["mcp-session-id"];
      const transport = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (!transport) {
        badRequest(res, "Missing or unknown Mcp-Session-Id.");
        return;
      }
      await transport.handleRequest(req, res);
    });
    app.get(config.path, replay);
    app.delete(config.path, replay);
  }

  const onError: ErrorRequestHandler = (_err, _req, res, _next) => {
    if (res.headersSent) return;
    res.status(500).json({ error: { code: "internal", message: "Internal server error", retryable: false } });
  };
  app.use(onError);

  const httpServer = await new Promise<HttpServer>((resolve) => {
    const s = app.listen(config.port, config.host, () => resolve(s));
  });

  const address = httpServer.address();
  const boundPort = typeof address === "object" && address ? address.port : config.port;
  const url = `http://${config.host}:${boundPort}${config.path}`;
  console.error(
    `[mcp] Streamable HTTP transport ready at ${url} (${config.stateless ? "stateless" : "stateful"}` +
      `${config.auth.token ? ", auth: bearer" : ", auth: none"})`,
  );

  return {
    server: httpServer,
    url,
    close: async () => {
      for (const transport of sessions.values()) {
        await transport.close().catch(() => undefined);
      }
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
