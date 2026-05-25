import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/github/client.js";

// Opt-in: hits the real public GitHub API. Skipped unless RUN_LIVE=1, so CI
// stays hermetic and rate-limit-proof. This is the v0.1 "wraps one public
// endpoint" proof you can run on demand.
const live = process.env.RUN_LIVE === "1";

describe.skipIf(!live)("GitHub live public endpoint", () => {
  it("fetches a real public repository", async () => {
    const client = new GitHubClient(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {});
    const repo = await client.getRepository("modelcontextprotocol", "servers");
    expect(repo.fullName.toLowerCase()).toBe("modelcontextprotocol/servers");
    expect(repo.stars).toBeGreaterThan(0);
    expect(typeof repo.defaultBranch).toBe("string");
  }, 20_000);
});
