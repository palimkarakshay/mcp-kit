/**
 * A small, hardened REST client — the error-mapping core of "wrap an HTTP API".
 *
 * This file is lifted verbatim from the `wrap-rest-api` recipe
 * (`recipes/wrap-rest-api/src/rest-client.ts`). The point of the cookbook is
 * that each recipe is self-contained and copyable: it owns timeouts, retries
 * with backoff, JSON parsing, and — crucially — translating HTTP failures into
 * the kit's structured {@link McpToolError}s so every tool fails the same
 * legible way. Keeping a copy here (rather than importing across recipes) is
 * deliberate: you can lift this whole folder to wrap your own service.
 *
 * Authentication is injected here, at construction, from the *environment* (a
 * transport concern) — never from a tool argument.
 */
import { McpToolError, type ErrorCode } from "@mcp-kit/core";

/** Minimal `fetch` shape so tests can inject a stub. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RestClientOptions {
  baseUrl: string;
  /** Static headers sent on every request (e.g. Accept, User-Agent). */
  headers?: Record<string, string>;
  /** Optional bearer token, read from the environment by the caller. */
  bearerToken?: string;
  timeoutMs?: number;
  /** Retries *in addition* to the first attempt. */
  maxRetries?: number;
  backoffMs?: number;
  /** Injectable fetch (defaults to global `fetch`). */
  fetchImpl?: FetchLike;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusToCode(status: number): { code: ErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: "unauthorized", retryable: false };
  if (status === 404) return { code: "not_found", retryable: false };
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status >= 500) return { code: "upstream_unavailable", retryable: true };
  return { code: "upstream_error", retryable: false };
}

export class RestClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: RestClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = { Accept: "application/json", ...options.headers };
    if (options.bearerToken) this.headers.Authorization = `Bearer ${options.bearerToken}`;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.backoffMs = options.backoffMs ?? 300;
    const impl = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (!impl) throw new Error("No fetch implementation available; pass fetchImpl.");
    this.fetchImpl = impl;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const base = path.startsWith("http") ? path : `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = { ...this.headers, ...options.headers };
    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }

    let lastError: McpToolError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        lastError = new McpToolError(
          aborted ? "timeout" : "upstream_unavailable",
          aborted
            ? `Request to ${method} ${url} timed out after ${this.timeoutMs}ms.`
            : `Network error calling ${method} ${url}: ${err instanceof Error ? err.message : String(err)}`,
          { retryable: true },
        );
        if (attempt < this.maxRetries) {
          await sleep(this.backoffMs * 2 ** attempt);
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        return (await this.parse(response)) as T;
      }

      const { code, retryable } = statusToCode(response.status);
      if (retryable && attempt < this.maxRetries) {
        await sleep(this.backoffMs * 2 ** attempt);
        continue;
      }
      throw await this.httpError(method, url, response, code, retryable);
    }
    // Unreachable, but satisfies the type checker.
    throw lastError ?? new McpToolError("internal", "Request failed without a result.");
  }

  private async parse(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }

  private async httpError(
    method: string,
    url: string,
    response: Response,
    code: ErrorCode,
    retryable: boolean,
  ): Promise<McpToolError> {
    let details: unknown;
    try {
      const text = (await response.text()).slice(0, 500);
      try {
        details = JSON.parse(text);
      } catch {
        details = text || undefined;
      }
    } catch {
      details = undefined;
    }
    return new McpToolError(
      code,
      `${method} ${url} failed with HTTP ${response.status} ${response.statusText}.`,
      { retryable, details },
    );
  }
}
