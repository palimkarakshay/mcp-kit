/**
 * Crawl4AI tools — wrap a scraper HTTP service as MCP tools.
 *
 * Three read-only tools over the Crawl4AI `POST /crawl` endpoint. The client is
 * built lazily from the environment (`CRAWL4AI_BASE_URL`, optional
 * `CRAWL4AI_API_TOKEN`) so importing this module for the lint never touches the
 * network; tests inject a client via {@link setCrawl4aiClient}.
 *
 * Note the tool names: the kit's tool-description lint requires a verb-first
 * name, so the "cosine extraction" capability is exposed as `extract_cosine`
 * (verb first), not `cosine_extract`.
 */
import { type AnyToolSpec, defineTool, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { Crawl4aiClient } from "./client.js";

let injected: Crawl4aiClient | undefined;

/** Override the client (tests). */
export function setCrawl4aiClient(client: Crawl4aiClient | undefined): void {
  injected = client;
}

function crawl4ai(): Crawl4aiClient {
  if (!injected) {
    const options: ConstructorParameters<typeof Crawl4aiClient>[0] = {};
    if (process.env.CRAWL4AI_BASE_URL) options.baseUrl = process.env.CRAWL4AI_BASE_URL;
    if (process.env.CRAWL4AI_API_TOKEN) options.token = process.env.CRAWL4AI_API_TOKEN;
    injected = new Crawl4aiClient(options);
  }
  return injected;
}

const fetchMarkdown = defineTool({
  name: "fetch_markdown",
  title: "Fetch a page as markdown",
  description:
    "Fetch a single web page through Crawl4AI and return it rendered to markdown. " +
    "Use this when you have one URL and want clean, LLM-ready markdown for it — the headless browser executes the " +
    "page's JavaScript first, so it works on sites that a plain HTTP GET would return empty. Choose the \"fit\" " +
    "filter for Crawl4AI's pruned main-content markdown, or \"raw\" for the full conversion. " +
    "It fetches exactly one URL and does not crawl links, keep a browser session between calls, or run semantic " +
    "extraction — use fetch_with_session for stateful navigation and extract_cosine for query-focused blocks. " +
    "This tool is part of the wrap-crawl4ai server (a Crawl4AI wrapper), not a generic fetch primitive. " +
    'Example: fetch_markdown({ "url": "https://example.com", "filter": "fit" }).',
  inputSchema: {
    url: z
      .string()
      .url()
      .describe('Absolute http(s) URL of the page to fetch, e.g. "https://example.com/article".'),
    filter: z
      .enum(["raw", "fit"])
      .describe('"fit" returns Crawl4AI\'s pruned main content; "raw" the full markdown. Defaults to "fit".')
      .default("fit"),
  },
  outputSchema: {
    url: z.string().describe("The URL that was crawled (as reported by Crawl4AI)."),
    filter: z.string().describe('Which markdown flavour was returned ("raw" or "fit").'),
    markdown: z.string().describe("The page rendered to markdown."),
    length: z.number().describe("Character count of the returned markdown."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  examples: [
    { description: "Fitted main-content markdown for one page.", arguments: { url: "https://example.com" } },
    { description: "Full raw markdown.", arguments: { url: "https://example.com", filter: "raw" } },
  ],
  handler: async (args) => {
    const result = await crawl4ai().fetchMarkdown(args.url, args.filter);
    return toolResult(`Fetched ${result.url} (${result.markdown.length} chars of ${result.filter} markdown).`, {
      url: result.url,
      filter: result.filter,
      markdown: result.markdown,
      length: result.markdown.length,
    });
  },
});

const fetchWithSession = defineTool({
  name: "fetch_with_session",
  title: "Fetch within a browser session",
  description:
    "Fetch a page inside a named, persistent Crawl4AI browser session so cookies and JavaScript state survive " +
    "between calls. " +
    "Use this for multi-step flows on one site: open a page in session \"s1\", optionally run js_code (click, scroll, " +
    "submit) or wait_for a selector, then call again with the same session_id to act on the now-logged-in or " +
    "now-expanded page. " +
    "It does not start a fresh stateless fetch (use fetch_markdown for a one-off) and does not manage credentials — " +
    "any login must happen via the page itself or env-configured cookies, never as a tool argument. Reuse the same " +
    "session_id across calls; pick a new one to start clean. " +
    "This tool is part of the wrap-crawl4ai server (a Crawl4AI wrapper), not a generic fetch primitive. " +
    'Example: fetch_with_session({ "url": "https://example.com/feed", "session_id": "s1", "wait_for": "css:.item" }).',
  inputSchema: {
    url: z.string().url().describe('Absolute http(s) URL to load in the session, e.g. "https://example.com/feed".'),
    session_id: z
      .string()
      .min(1)
      .describe('Stable session name to reuse the same live browser across calls, e.g. "research-1".'),
    js_code: z
      .string()
      .describe("Optional JavaScript to run in the page after load (e.g. click a 'load more' button).")
      .optional(),
    wait_for: z
      .string()
      .describe('Optional Crawl4AI wait condition before capture, e.g. "css:.results" or "js:() => window.ready".')
      .optional(),
  },
  outputSchema: {
    url: z.string().describe("The URL that was loaded."),
    sessionId: z.string().describe("The session the page was loaded in (reuse it to continue)."),
    markdown: z.string().describe("The page rendered to markdown after any js_code/wait_for."),
    length: z.number().describe("Character count of the returned markdown."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  examples: [
    {
      description: "Load a page and wait for a selector inside session s1.",
      arguments: { url: "https://example.com/feed", session_id: "s1", wait_for: "css:.item" },
    },
    {
      description: "Continue in the same session, clicking 'load more' first.",
      arguments: { url: "https://example.com/feed", session_id: "s1", js_code: "document.querySelector('.more').click()" },
    },
  ],
  handler: async (args) => {
    const opts: { jsCode?: string; waitFor?: string } = {};
    if (args.js_code !== undefined) opts.jsCode = args.js_code;
    if (args.wait_for !== undefined) opts.waitFor = args.wait_for;
    const result = await crawl4ai().fetchWithSession(args.url, args.session_id, opts);
    return toolResult(`Fetched ${result.url} in session ${result.sessionId} (${result.markdown.length} chars).`, {
      url: result.url,
      sessionId: result.sessionId,
      markdown: result.markdown,
      length: result.markdown.length,
    });
  },
});

const extractCosine = defineTool({
  name: "extract_cosine",
  title: "Extract semantic blocks by similarity",
  description:
    "Extract the parts of a page most relevant to a query using Crawl4AI's CosineStrategy (semantic clustering). " +
    "Use this when you do not want the whole page, only the chunks about a topic — pass the page url and a query " +
    "like \"pricing and plans\", and it returns the clustered text blocks ranked by cosine similarity to that query. " +
    "It does not return the full markdown (use fetch_markdown) and does not run an LLM or answer the question; it " +
    "selects and returns source blocks for you (or a model) to read. Tune word_count_threshold and sim_threshold to " +
    "trade recall for precision. " +
    "This tool is part of the wrap-crawl4ai server (a Crawl4AI wrapper), not a generic fetch primitive. " +
    'Example: extract_cosine({ "url": "https://example.com/pricing", "query": "enterprise pricing" }).',
  inputSchema: {
    url: z.string().url().describe('Absolute http(s) URL of the page to extract from, e.g. "https://example.com".'),
    query: z
      .string()
      .min(1)
      .describe('The semantic filter: the topic to keep blocks about, e.g. "refund policy".'),
    word_count_threshold: z
      .number()
      .int()
      .min(1)
      .describe("Minimum words for a block to be considered. Higher drops short snippets. Defaults to 10.")
      .default(10),
    sim_threshold: z
      .number()
      .min(0)
      .max(1)
      .describe("Minimum cosine similarity (0-1) for a block to be kept. Higher is stricter. Defaults to 0.3.")
      .default(0.3),
    top_k: z
      .number()
      .int()
      .min(1)
      .describe("Keep at most this many of the closest clusters. Defaults to 3.")
      .default(3),
  },
  outputSchema: {
    url: z.string().describe("The URL that was extracted from."),
    query: z.string().describe("The semantic filter that was applied."),
    count: z.number().describe("Number of blocks returned."),
    blocks: z.array(z.unknown()).describe("The kept semantic blocks, ranked by similarity to the query."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  examples: [
    { description: "Keep only pricing-related blocks.", arguments: { url: "https://example.com/pricing", query: "enterprise pricing" } },
    {
      description: "Stricter similarity, more clusters.",
      arguments: { url: "https://example.com/docs", query: "rate limits", sim_threshold: 0.5, top_k: 5 },
    },
  ],
  handler: async (args) => {
    const result = await crawl4ai().extractCosine(args.url, args.query, {
      wordCountThreshold: args.word_count_threshold,
      simThreshold: args.sim_threshold,
      topK: args.top_k,
    });
    return toolResult(`Extracted ${result.blocks.length} block(s) about "${result.query}" from ${result.url}.`, {
      url: result.url,
      query: result.query,
      count: result.blocks.length,
      blocks: result.blocks,
    });
  },
});

export const tools: AnyToolSpec[] = [fetchMarkdown, fetchWithSession, extractCosine];
