/**
 * A thin typed client for the Crawl4AI HTTP API, built on {@link RestClient}.
 *
 * Crawl4AI (https://github.com/unclecode/crawl4ai) ships a Docker server that
 * exposes a single `POST /crawl` endpoint: you hand it URLs plus a
 * `crawler_config`, and it returns one result per URL with `markdown`,
 * `extracted_content`, and a reusable `session_id`. This client maps the three
 * capabilities the recipe exposes onto that endpoint.
 *
 * The base URL and an optional bearer token come from the *environment* (a
 * transport concern), never from a tool argument — see `crawl4ai.tools.ts`.
 * Field mapping is intentionally tolerant (markdown may be a string or an
 * object across versions); adjust it to the Crawl4AI build you run.
 */
import { McpToolError } from "@mcp-kit/core";

import { RestClient, type FetchLike } from "./rest-client.js";

/** Crawl4AI's docker default. Override with `CRAWL4AI_BASE_URL`. */
export const DEFAULT_BASE_URL = "http://127.0.0.1:11235";

export interface Crawl4aiClientOptions {
  baseUrl?: string;
  /** Optional bearer token (`CRAWL4AI_API_TOKEN`), enabled with JWT auth. */
  token?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export type MarkdownFilter = "raw" | "fit";

export interface MarkdownResult {
  url: string;
  markdown: string;
  filter: MarkdownFilter;
}

export interface SessionResult {
  url: string;
  markdown: string;
  sessionId: string;
}

export interface CosineExtractResult {
  url: string;
  query: string;
  blocks: unknown[];
}

export interface CosineParams {
  wordCountThreshold?: number;
  simThreshold?: number;
  topK?: number;
  maxDist?: number;
}

interface RawMarkdown {
  raw_markdown?: string;
  fit_markdown?: string;
}

interface RawResult {
  url?: string;
  success?: boolean;
  status_code?: number;
  error_message?: string;
  markdown?: string | RawMarkdown | null;
  extracted_content?: unknown;
  session_id?: string;
}

interface RawCrawlResponse {
  success?: boolean;
  results?: RawResult[];
}

/** Pull the requested markdown flavour out of Crawl4AI's polymorphic field. */
function pickMarkdown(md: RawResult["markdown"], filter: MarkdownFilter): string {
  if (md == null) return "";
  if (typeof md === "string") return md;
  if (filter === "fit") return md.fit_markdown ?? md.raw_markdown ?? "";
  return md.raw_markdown ?? md.fit_markdown ?? "";
}

export class Crawl4aiClient {
  private readonly rest: RestClient;

  constructor(options: Crawl4aiClientOptions = {}) {
    const restOptions: ConstructorParameters<typeof RestClient>[0] = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      headers: { "User-Agent": "mcp-kit-recipe-crawl4ai" },
    };
    if (options.token) restOptions.bearerToken = options.token;
    if (options.timeoutMs !== undefined) restOptions.timeoutMs = options.timeoutMs;
    if (options.fetchImpl) restOptions.fetchImpl = options.fetchImpl;
    this.rest = new RestClient(restOptions);
  }

  /** POST one crawl request and return the single result, or throw cleanly. */
  private async crawlOne(url: string, crawlerParams: Record<string, unknown>): Promise<RawResult> {
    const response = await this.rest.request<RawCrawlResponse>("POST", "/crawl", {
      body: {
        urls: [url],
        crawler_config: { type: "CrawlerRunConfig", params: crawlerParams },
      },
    });
    const result = response.results?.[0];
    if (!result) {
      throw new McpToolError("upstream_error", `Crawl4AI returned no result for ${url}.`, {
        details: { url },
      });
    }
    if (result.success === false) {
      throw new McpToolError(
        "upstream_error",
        `Crawl4AI failed to crawl ${url}: ${result.error_message ?? "unknown error"}.`,
        { details: { url, statusCode: result.status_code } },
      );
    }
    return result;
  }

  /** Fetch a single page rendered to markdown. */
  async fetchMarkdown(url: string, filter: MarkdownFilter = "fit"): Promise<MarkdownResult> {
    const result = await this.crawlOne(url, { cache_mode: "bypass" });
    return { url: result.url ?? url, markdown: pickMarkdown(result.markdown, filter), filter };
  }

  /**
   * Fetch a page inside a named browser session so cookies/JS state persist
   * across calls (log in once, then navigate). Crawl4AI keys the live browser
   * by `session_id`.
   */
  async fetchWithSession(
    url: string,
    sessionId: string,
    opts: { jsCode?: string; waitFor?: string } = {},
  ): Promise<SessionResult> {
    const params: Record<string, unknown> = { cache_mode: "bypass", session_id: sessionId };
    if (opts.jsCode !== undefined) params.js_code = opts.jsCode;
    if (opts.waitFor !== undefined) params.wait_for = opts.waitFor;
    const result = await this.crawlOne(url, params);
    return {
      url: result.url ?? url,
      markdown: pickMarkdown(result.markdown, "fit"),
      sessionId: result.session_id ?? sessionId,
    };
  }

  /**
   * Run Crawl4AI's `CosineStrategy` — cluster the page into semantic blocks and
   * keep the ones most similar to `query`.
   */
  async extractCosine(url: string, query: string, params: CosineParams = {}): Promise<CosineExtractResult> {
    const strategyParams: Record<string, unknown> = { semantic_filter: query };
    if (params.wordCountThreshold !== undefined) strategyParams.word_count_threshold = params.wordCountThreshold;
    if (params.simThreshold !== undefined) strategyParams.sim_threshold = params.simThreshold;
    if (params.topK !== undefined) strategyParams.top_k = params.topK;
    if (params.maxDist !== undefined) strategyParams.max_dist = params.maxDist;

    const result = await this.crawlOne(url, {
      cache_mode: "bypass",
      extraction_strategy: { type: "CosineStrategy", params: strategyParams },
    });
    return { url: result.url ?? url, query, blocks: normaliseBlocks(result.extracted_content) };
  }
}

/** `extracted_content` arrives as a JSON string or an array depending on build. */
function normaliseBlocks(extracted: unknown): unknown[] {
  if (Array.isArray(extracted)) return extracted;
  if (typeof extracted === "string" && extracted.trim()) {
    try {
      const parsed: unknown = JSON.parse(extracted);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [extracted];
    }
  }
  return [];
}
