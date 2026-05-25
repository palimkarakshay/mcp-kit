/**
 * Environment-driven configuration.
 *
 * One server binary, two transports, chosen by `MCP_TRANSPORT`. Everything is
 * read from the environment so the same build runs locally over stdio and
 * remotely over Streamable HTTP without code changes.
 *
 * See `docs/transports.md` and `docs/auth-patterns.md`.
 */
import { z } from "zod";

export interface StdioConfig {
  transport: "stdio";
}

export interface HttpAuthConfig {
  /** Shared bearer token expected on every request, if any. */
  token?: string;
  /** When true, the server refuses to start without a token. */
  required: boolean;
}

export interface HttpConfig {
  transport: "http";
  host: string;
  port: number;
  /** Path the MCP endpoint is mounted at, e.g. `/mcp`. */
  path: string;
  /** Stateless mode creates a fresh server per request (no sessions/SSE). */
  stateless: boolean;
  auth: HttpAuthConfig;
  /** `Host` header allow-list for DNS-rebinding protection. */
  allowedHosts: string[];
  /** `Origin` header allow-list for DNS-rebinding protection. */
  allowedOrigins: string[];
  dnsRebindingProtection: boolean;
}

export type AppConfig = StdioConfig | HttpConfig;

const boolish = z
  .string()
  .transform((v) => ["1", "true", "yes", "on"].includes(v.trim().toLowerCase()));

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const httpEnvSchema = z.object({
  MCP_HTTP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  MCP_HTTP_PATH: z
    .string()
    .startsWith("/", "MCP_HTTP_PATH must start with '/'")
    .default("/mcp"),
  MCP_STATELESS: boolish.optional(),
  MCP_AUTH_TOKEN: z.string().min(1).optional(),
  MCP_REQUIRE_AUTH: boolish.optional(),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  MCP_DNS_REBINDING_PROTECTION: boolish.optional(),
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parse {@link AppConfig} from an environment bag (defaults to `process.env`).
 *
 * @throws {ConfigError} with an actionable message on bad input.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const transport = (env.MCP_TRANSPORT ?? "stdio").trim().toLowerCase();

  if (transport === "stdio") {
    return { transport: "stdio" };
  }
  if (transport !== "http") {
    throw new ConfigError(
      `MCP_TRANSPORT must be "stdio" or "http" (the two MCP transports), got "${transport}".`,
    );
  }

  const parsed = httpEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid HTTP configuration:\n${issues.join("\n")}`);
  }
  const e = parsed.data;

  const required = e.MCP_REQUIRE_AUTH ?? false;
  if (required && !e.MCP_AUTH_TOKEN) {
    throw new ConfigError(
      "MCP_REQUIRE_AUTH is set but MCP_AUTH_TOKEN is empty. Provide a token or unset MCP_REQUIRE_AUTH.",
    );
  }

  const allowedHosts = list(e.MCP_ALLOWED_HOSTS);
  const allowedOrigins = list(e.MCP_ALLOWED_ORIGINS);
  // Default to protecting the configured bind address unless told otherwise.
  if (allowedHosts.length === 0) {
    allowedHosts.push(`${e.MCP_HTTP_HOST}:${e.MCP_HTTP_PORT}`, `localhost:${e.MCP_HTTP_PORT}`);
  }
  const dnsRebindingProtection =
    e.MCP_DNS_REBINDING_PROTECTION ?? (allowedHosts.length > 0 || allowedOrigins.length > 0);

  const auth: HttpAuthConfig = { required: required || Boolean(e.MCP_AUTH_TOKEN) };
  if (e.MCP_AUTH_TOKEN !== undefined) auth.token = e.MCP_AUTH_TOKEN;

  return {
    transport: "http",
    host: e.MCP_HTTP_HOST,
    port: e.MCP_HTTP_PORT,
    path: e.MCP_HTTP_PATH,
    stateless: e.MCP_STATELESS ?? false,
    auth,
    allowedHosts,
    allowedOrigins,
    dnsRebindingProtection,
  };
}
