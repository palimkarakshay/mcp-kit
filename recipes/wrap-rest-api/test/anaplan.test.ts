import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { setAnaplanClient, tools } from "../src/anaplan/anaplan.tools.js";
import { AnaplanClient } from "../src/anaplan/client.js";
import type { FetchLike } from "../src/rest-client.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** A fetch that walks the auth -> start-task -> poll lifecycle. */
function lifecycleFetch(options: { successful: boolean }): FetchLike {
  return async (url, init) => {
    if (url.includes("/token/authenticate")) {
      return json({ tokenInfo: { tokenValue: "tok", expiresAt: Date.now() + 3_600_000 } });
    }
    if (url.endsWith("/processes") && (init?.method ?? "GET") === "GET") {
      return json({ processes: [{ id: "118000000005", name: "Daily Load" }] });
    }
    if (url.endsWith("/tasks") && init?.method === "POST") {
      return json({ task: { taskId: "task-1" } });
    }
    if (url.includes("/tasks/task-1")) {
      return json({ task: { taskState: "COMPLETE", result: { successful: options.successful, details: "info" } } });
    }
    return json({ message: "unexpected" }, 404);
  };
}

function makeClient(fetchImpl: FetchLike): AnaplanClient {
  return new AnaplanClient({
    credentials: { email: "e@x.com", password: "pw" },
    workspaceId: "ws1",
    modelId: "m1",
    fetchImpl,
    pollIntervalMs: 0,
  });
}

afterEach(() => setAnaplanClient(undefined));

async function withServer<T>(client: AnaplanClient, fn: (c: Awaited<ReturnType<typeof connectInMemory>>["client"]) => Promise<T>): Promise<T> {
  setAnaplanClient(client);
  const conn = await connectInMemory(buildServer({ name: "anaplan-test", version: "0", tools }));
  try {
    return await fn(conn.client);
  } finally {
    await conn.close();
  }
}

describe("Anaplan server", () => {
  it("runs a process through the async task lifecycle", async () => {
    await withServer(makeClient(lifecycleFetch({ successful: true })), async (client) => {
      const res = await client.callTool({ name: "run_anaplan_process", arguments: { process_id: "118000000005" } });
      const sc = res.structuredContent as { taskState: string; successful: boolean };
      expect(sc.taskState).toBe("COMPLETE");
      expect(sc.successful).toBe(true);
    });
  });

  it("surfaces a failed task as a structured upstream_error", async () => {
    await withServer(makeClient(lifecycleFetch({ successful: false })), async (client) => {
      const res = await client.callTool({ name: "run_anaplan_import", arguments: { import_id: "112000000012" } });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("upstream_error");
    });
  });

  it("lists actions for discovery", async () => {
    await withServer(makeClient(lifecycleFetch({ successful: true })), async (client) => {
      const res = await client.callTool({ name: "list_anaplan_actions", arguments: { kind: "processes" } });
      const sc = res.structuredContent as { count: number; items: { id: string; name: string }[] };
      expect(sc.count).toBe(1);
      expect(sc.items[0]?.id).toBe("118000000005");
    });
  });
});
