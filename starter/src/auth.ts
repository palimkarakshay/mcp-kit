/**
 * The auth hook — at the transport, never in tool inputs.
 *
 * Credentials are a transport concern. The model should never see or handle a
 * token, so no tool's input schema may contain one (the lint enforces this).
 * For Streamable HTTP we validate a bearer token in Express middleware before
 * the request ever reaches the MCP layer; for stdio there is no auth surface —
 * the parent process that spawned the server owns identity.
 *
 * On success the middleware attaches an {@link AuthInfo} to `req.auth`, which
 * the SDK forwards to tool handlers as `extra.authInfo`.
 */
import { timingSafeEqual } from "node:crypto";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface BearerAuthOptions {
  /** Shared secret to compare against (constant-time). */
  token?: string;
  /** If true, reject when neither a token nor a verifier is configured. */
  required: boolean;
  /**
   * Custom verifier — resolve to {@link AuthInfo} to accept, `null` to reject.
   * Use this for JWT/OAuth introspection instead of a shared secret.
   */
  verify?: (token: string) => AuthInfo | null | Promise<AuthInfo | null>;
  /** Realm advertised in the `WWW-Authenticate` header. */
  realm?: string;
  /** Sink for the dev-mode "no auth" warning (defaults to `console.error`). */
  warn?: (message: string) => void;
}

type AuthedRequest = Request & { auth?: AuthInfo };

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function deny(res: Response, status: number, message: string, realm: string): void {
  if (status === 401) {
    res.setHeader("WWW-Authenticate", `Bearer realm="${realm}", error="invalid_token"`);
  }
  res.status(status).json({
    error: { code: status === 401 ? "unauthorized" : "forbidden", message, retryable: false },
  });
}

function staticAuthInfo(token: string): AuthInfo {
  return { token, clientId: "static-token", scopes: [] };
}

/**
 * Build Express middleware that enforces bearer-token auth for the HTTP
 * transport. Mount it before the MCP handler.
 */
export function bearerAuth(options: BearerAuthOptions): RequestHandler {
  const { token, required, verify, realm = "mcp" } = options;
  const warn = options.warn ?? ((m: string) => console.error(m));
  let warned = false;

  const handle = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Nothing to check against.
    if (!token && !verify) {
      if (required) {
        deny(res, 401, "Authentication required but no verifier is configured.", realm);
        return;
      }
      if (!warned) {
        warn("[auth] HTTP transport is running WITHOUT authentication (no MCP_AUTH_TOKEN set).");
        warned = true;
      }
      next();
      return;
    }

    const presented = extractBearer(req.headers.authorization);
    if (!presented) {
      deny(res, 401, "Missing bearer token in Authorization header.", realm);
      return;
    }

    let auth: AuthInfo | null = null;
    if (verify) {
      auth = await verify(presented);
    } else if (token) {
      auth = constantTimeEquals(presented, token) ? staticAuthInfo(presented) : null;
    }

    if (!auth) {
      deny(res, 401, "Invalid bearer token.", realm);
      return;
    }

    req.auth = auth;
    next();
  };

  return (req, res, next) => {
    handle(req as AuthedRequest, res, next).catch(() => {
      deny(res, 401, "Token verification failed.", realm);
    });
  };
}
