import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubClient } from "../src/github/client.js";
import { setGitHubClient, tools } from "../src/github/github.tools.js";
import type { FetchLike } from "../src/rest-client.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const fakeFetch: FetchLike = async (url) => {
  if (url.includes("/issues")) {
    return json([
      { number: 1, title: "A bug", state: "open", user: { login: "alice" }, comments: 2, created_at: "2024-01-01T00:00:00Z", html_url: "u1" },
      { number: 2, title: "A PR", state: "open", user: { login: "bob" }, comments: 0, created_at: "2024-01-02T00:00:00Z", html_url: "u2", pull_request: { url: "p" } },
    ]);
  }
  if (url.includes("/repos/")) {
    return json({
      full_name: "octo/hello",
      description: "hi",
      stargazers_count: 42,
      forks_count: 3,
      open_issues_count: 5,
      language: "TypeScript",
      default_branch: "main",
      topics: ["mcp"],
      html_url: "https://github.com/octo/hello",
      pushed_at: "2024-05-01T00:00:00Z",
    });
  }
  return json({ message: "not found" }, 404);
};

afterEach(() => setGitHubClient(undefined));

async function withServer<T>(fn: (client: Awaited<ReturnType<typeof connectInMemory>>["client"]) => Promise<T>): Promise<T> {
  setGitHubClient(new GitHubClient({ fetchImpl: fakeFetch }));
  const { client, close } = await connectInMemory(buildServer({ name: "github-test", version: "0", tools }));
  try {
    return await fn(client);
  } finally {
    await close();
  }
}

describe("GitHub server", () => {
  it("get_repository returns structured metadata", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "get_repository", arguments: { owner: "octo", repo: "hello" } });
      const sc = res.structuredContent as { fullName: string; stars: number; language: string };
      expect(sc.fullName).toBe("octo/hello");
      expect(sc.stars).toBe(42);
      expect(sc.language).toBe("TypeScript");
    });
  });

  it("list_repository_issues excludes pull requests by default", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "list_repository_issues",
        arguments: { owner: "octo", repo: "hello" },
      });
      const sc = res.structuredContent as { count: number; issues: { number: number; isPullRequest: boolean }[] };
      expect(sc.count).toBe(1);
      expect(sc.issues[0]?.number).toBe(1);
    });
  });

  it("list_repository_issues can include pull requests", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "list_repository_issues",
        arguments: { owner: "octo", repo: "hello", exclude_pull_requests: false },
      });
      const sc = res.structuredContent as { count: number };
      expect(sc.count).toBe(2);
    });
  });

  it("surfaces a not_found as a structured error", async () => {
    setGitHubClient(new GitHubClient({ fetchImpl: async () => json({ message: "Not Found" }, 404) }));
    const { client, close } = await connectInMemory(buildServer({ name: "github-test", version: "0", tools }));
    try {
      const res = await client.callTool({ name: "get_repository", arguments: { owner: "no", repo: "pe" } });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("not_found");
    } finally {
      await close();
    }
  });
});
