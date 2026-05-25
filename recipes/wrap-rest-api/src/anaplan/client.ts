/**
 * A TypeScript reimplementation of the Anaplan Integration API v2 client found
 * in the reference repo (`anaplan-kit/tooling/anaplan_kit/`). Reimplemented
 * from a reading of that Python package — the reference is not modified.
 *
 * The interesting parts, faithful to the original:
 *  - **Auth** is the `AnaplanAuthToken` scheme (not `Bearer`): basic-auth login
 *    returns a short-lived token, refreshed before expiry. Credentials come
 *    from the environment, never from a tool argument.
 *  - **Actions are async**: running an import/export/process POSTs to its
 *    `/tasks` endpoint for a `taskId`, then polls until `taskState` is
 *    `COMPLETE`. A `result.successful === false` is surfaced as an error.
 *
 * This client speaks to a live tenant; tests drive it with an injected fetch.
 */
import { McpToolError, type ErrorCode } from "@mcp-kit/core";

import type { FetchLike } from "../rest-client.js";

export interface AnaplanCredentials {
  email: string;
  password: string;
}

export interface AnaplanClientOptions {
  credentials: AnaplanCredentials;
  workspaceId: string;
  modelId: string;
  apiBase?: string;
  authUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export type AnaplanResource = "imports" | "exports" | "actions" | "processes";

export interface AnaplanItem {
  id: string;
  name: string;
}

export interface TaskResult {
  successful?: boolean;
  [key: string]: unknown;
}

export interface TaskStatus {
  taskState?: string;
  result?: TaskResult;
  [key: string]: unknown;
}

const DEFAULT_API_BASE = "https://api.anaplan.com/2/0";
const DEFAULT_AUTH_URL = "https://auth.anaplan.com/token/authenticate";
const EXPIRY_SKEW_MS = 60_000;

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

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class AnaplanClient {
  private readonly credentials: AnaplanCredentials;
  private readonly workspaceId: string;
  private readonly modelId: string;
  private readonly apiBase: string;
  private readonly authUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private token: CachedToken | undefined;

  constructor(options: AnaplanClientOptions) {
    this.credentials = options.credentials;
    this.workspaceId = options.workspaceId;
    this.modelId = options.modelId;
    this.apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
    this.authUrl = options.authUrl ?? DEFAULT_AUTH_URL;
    const impl = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (!impl) throw new Error("No fetch implementation available; pass fetchImpl.");
    this.fetchImpl = impl;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.backoffMs = options.backoffMs ?? 500;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_500;
    this.pollTimeoutMs = options.pollTimeoutMs ?? 600_000;
  }

  // --- auth ---------------------------------------------------------------

  private async authHeader(): Promise<string> {
    if (!this.token || Date.now() >= this.token.expiresAt - EXPIRY_SKEW_MS) {
      this.token = await this.authenticate();
    }
    return `AnaplanAuthToken ${this.token.value}`;
  }

  private async authenticate(): Promise<CachedToken> {
    const basic = Buffer.from(`${this.credentials.email}:${this.credentials.password}`).toString("base64");
    let response: Response;
    try {
      response = await this.fetchImpl(this.authUrl, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
      });
    } catch (err) {
      throw new McpToolError("upstream_unavailable", `Anaplan auth request failed: ${err instanceof Error ? err.message : String(err)}`, { retryable: true });
    }
    if (!response.ok) {
      throw new McpToolError("unauthorized", `Anaplan authentication failed with HTTP ${response.status}.`);
    }
    const body = (await response.json()) as { tokenInfo?: { tokenValue?: string; expiresAt?: number } };
    const value = body.tokenInfo?.tokenValue;
    if (!value) {
      throw new McpToolError("unauthorized", "Anaplan auth response did not contain a token.");
    }
    const expiresAtMs = body.tokenInfo?.expiresAt;
    const expiresAt = typeof expiresAtMs === "number" ? expiresAtMs : Date.now() + 30 * 60_000;
    return { value, expiresAt };
  }

  // --- core request -------------------------------------------------------

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.apiBase}/${path.replace(/^\/+/, "")}`;
    const auth = await this.authHeader();
    const headers: Record<string, string> = { Authorization: auth, Accept: "application/json" };
    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body: payload, signal: controller.signal });
      } catch (err) {
        if (attempt < this.maxRetries) {
          await sleep(this.backoffMs * 2 ** attempt);
          continue;
        }
        const aborted = err instanceof Error && err.name === "AbortError";
        throw new McpToolError(aborted ? "timeout" : "upstream_unavailable", `Anaplan ${method} ${url} failed: ${err instanceof Error ? err.message : String(err)}`, { retryable: true });
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        const text = await response.text();
        return (text ? JSON.parse(text) : {}) as T;
      }
      const { code, retryable } = statusToCode(response.status);
      if (retryable && attempt < this.maxRetries) {
        await sleep(this.backoffMs * 2 ** attempt);
        continue;
      }
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new McpToolError(code, `Anaplan ${method} ${url} returned HTTP ${response.status}.`, {
        retryable,
        details: detail || undefined,
      });
    }
    throw new McpToolError("internal", "Anaplan request exhausted retries without a result.");
  }

  private modelPath(suffix: string): string {
    return `/workspaces/${this.workspaceId}/models/${this.modelId}/${suffix.replace(/^\/+/, "")}`;
  }

  // --- discovery ----------------------------------------------------------

  async listResource(resource: AnaplanResource): Promise<AnaplanItem[]> {
    const body = await this.request<Record<string, AnaplanItem[]>>("GET", this.modelPath(resource));
    const items = body[resource] ?? [];
    return items.map((item) => ({ id: item.id, name: item.name }));
  }

  // --- task lifecycle (single source of truth) ----------------------------

  async startTask(resource: AnaplanResource, resourceId: string): Promise<string> {
    const body = await this.request<{ task?: { taskId?: string }; taskId?: string }>(
      "POST",
      this.modelPath(`${resource}/${encodeURIComponent(resourceId)}/tasks`),
      { localeName: "en_US" },
    );
    const taskId = body.task?.taskId ?? body.taskId;
    if (!taskId) {
      throw new McpToolError("upstream_error", `Anaplan did not return a taskId for ${resource}/${resourceId}.`, {
        details: body,
      });
    }
    return taskId;
  }

  async pollTask(resource: AnaplanResource, resourceId: string, taskId: string): Promise<TaskStatus> {
    const path = this.modelPath(`${resource}/${encodeURIComponent(resourceId)}/tasks/${encodeURIComponent(taskId)}`);
    const deadline = Date.now() + this.pollTimeoutMs;
    for (;;) {
      const body = await this.request<{ task?: TaskStatus } & TaskStatus>("GET", path);
      const status: TaskStatus = body.task ?? body;
      if (status.taskState === "COMPLETE") {
        if (status.result?.successful === false) {
          throw new McpToolError("upstream_error", `Anaplan task ${taskId} completed unsuccessfully.`, {
            details: status.result,
          });
        }
        return status;
      }
      if (Date.now() >= deadline) {
        throw new McpToolError("timeout", `Anaplan task ${taskId} did not complete within ${this.pollTimeoutMs}ms.`, {
          retryable: true,
          details: { lastState: status.taskState },
        });
      }
      if (this.pollIntervalMs > 0) await sleep(this.pollIntervalMs);
    }
  }

  async runActionAndWait(resource: AnaplanResource, resourceId: string): Promise<TaskStatus> {
    const taskId = await this.startTask(resource, resourceId);
    return this.pollTask(resource, resourceId, taskId);
  }

  runImport(importId: string): Promise<TaskStatus> {
    return this.runActionAndWait("imports", importId);
  }

  runExport(exportId: string): Promise<TaskStatus> {
    return this.runActionAndWait("exports", exportId);
  }

  runProcess(processId: string): Promise<TaskStatus> {
    return this.runActionAndWait("processes", processId);
  }
}
