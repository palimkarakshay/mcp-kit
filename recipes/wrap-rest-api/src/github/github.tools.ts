/**
 * GitHub tools — the public-endpoint half of the "wrap a REST API" recipe.
 *
 * Two read-only tools over the public GitHub REST API. The client is built
 * lazily from the environment (`GITHUB_TOKEN`, optional) so importing this
 * module for the lint never touches the network; tests inject a client via
 * {@link setGitHubClient}.
 */
import { type AnyToolSpec, defineTool, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { GitHubClient } from "./client.js";

let injected: GitHubClient | undefined;

/** Override the client (tests). */
export function setGitHubClient(client: GitHubClient | undefined): void {
  injected = client;
}

function github(): GitHubClient {
  if (!injected) {
    const token = process.env.GITHUB_TOKEN;
    injected = new GitHubClient(token ? { token } : {});
  }
  return injected;
}

const getRepository = defineTool({
  name: "get_repository",
  title: "Get GitHub repository",
  description:
    "Fetch metadata for a single public GitHub repository, identified by its owner and name. " +
    "Use this when you already have a specific repo in mind — for example parsed from a URL like " +
    "github.com/<owner>/<repo> — and want facts about it: description, star and fork counts, primary " +
    "language, default branch, topics, and when it was last pushed. " +
    "It does not search across repositories, read file or README contents, or list a user's repos; " +
    "reach for a search tool or a contents endpoint for those. " +
    "Part of the wrap-rest-api server (a REST-API wrapper), not a primitive. " +
    'Example: get_repository({ "owner": "modelcontextprotocol", "repo": "servers" }).',
  inputSchema: {
    owner: z
      .string()
      .min(1)
      .describe('Repository owner — a user or organisation login, e.g. "modelcontextprotocol".'),
    repo: z.string().min(1).describe('Repository name without the owner, e.g. "servers".'),
  },
  outputSchema: {
    fullName: z.string().describe('"owner/repo".'),
    description: z.string().nullable().describe("The repo's short description, or null."),
    stars: z.number().describe("Stargazer count."),
    forks: z.number().describe("Fork count."),
    openIssues: z.number().describe("Open issues + open PRs count."),
    language: z.string().nullable().describe("Primary language, or null."),
    defaultBranch: z.string().describe("Default branch name."),
    topics: z.array(z.string()).describe("Repository topics."),
    htmlUrl: z.string().describe("Web URL of the repository."),
    pushedAt: z.string().describe("ISO-8601 timestamp of the last push."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  examples: [
    { description: "Look up the reference MCP servers repo.", arguments: { owner: "modelcontextprotocol", repo: "servers" } },
  ],
  handler: async (args) => {
    const repo = await github().getRepository(args.owner, args.repo);
    return toolResult(
      `${repo.fullName} — ★${repo.stars} · ${repo.language ?? "n/a"} · ${repo.description ?? "(no description)"}`,
      repo,
    );
  },
});

const listRepositoryIssues = defineTool({
  name: "list_repository_issues",
  title: "List GitHub repository issues",
  description:
    "List one page of issues for a public GitHub repository. " +
    "Use this when you want to browse or triage issues on a known repo — filtering by state and paging " +
    "through results. " +
    "It returns a single page (not the whole repo) and does not create, comment on, close, or search the " +
    "full-text of issues; use a write tool or a search tool for those. Note that GitHub's issues feed also " +
    "includes pull requests, which are excluded by default here. " +
    "Part of the wrap-rest-api server (a REST-API wrapper), not a primitive. " +
    'Example: list_repository_issues({ "owner": "modelcontextprotocol", "repo": "servers", "state": "open" }).',
  inputSchema: {
    owner: z.string().min(1).describe('Repository owner (user or org login), e.g. "modelcontextprotocol".'),
    repo: z.string().min(1).describe('Repository name, e.g. "servers".'),
    state: z
      .enum(["open", "closed", "all"])
      .describe('Which issues to include by state. Defaults to "open".')
      .default("open"),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe("How many issues per page (1–100). Defaults to 30.")
      .default(30),
    page: z.number().int().min(1).describe("1-based page number to fetch. Defaults to 1.").default(1),
    exclude_pull_requests: z
      .boolean()
      .describe("Drop entries that are actually pull requests. Defaults to true.")
      .default(true),
  },
  outputSchema: {
    count: z.number().describe("Number of issues returned on this page."),
    page: z.number().describe("The page that was fetched."),
    issues: z
      .array(
        z.object({
          number: z.number(),
          title: z.string(),
          state: z.string(),
          author: z.string().nullable(),
          comments: z.number(),
          createdAt: z.string(),
          htmlUrl: z.string(),
          isPullRequest: z.boolean(),
        }),
      )
      .describe("The page of issues."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  examples: [
    { description: "First page of open issues.", arguments: { owner: "modelcontextprotocol", repo: "servers" } },
    {
      description: "Closed issues, 10 per page, page 2.",
      arguments: { owner: "cli", repo: "cli", state: "closed", per_page: 10, page: 2 },
    },
  ],
  handler: async (args) => {
    const all = await github().listIssues(args.owner, args.repo, {
      state: args.state,
      perPage: args.per_page,
      page: args.page,
    });
    const issues = args.exclude_pull_requests ? all.filter((i) => !i.isPullRequest) : all;
    return toolResult(`${issues.length} issue(s) on ${args.owner}/${args.repo} (page ${args.page}).`, {
      count: issues.length,
      page: args.page,
      issues,
    });
  },
});

export const tools: AnyToolSpec[] = [getRepository, listRepositoryIssues];
