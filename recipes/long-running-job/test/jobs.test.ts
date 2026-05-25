import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { setJobStore, tools } from "../src/jobs.tools.js";
import { JobStore } from "../src/store.js";

/** A clock whose value the test can advance by hand. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

afterEach(() => setJobStore(undefined));

async function withServer<T>(
  store: JobStore,
  fn: (client: Awaited<ReturnType<typeof connectInMemory>>["client"]) => Promise<T>,
): Promise<T> {
  setJobStore(store);
  const { client, close } = await connectInMemory(buildServer({ name: "jobs-test", version: "0", tools }));
  try {
    return await fn(client);
  } finally {
    await close();
  }
}

describe("long-running-job server", () => {
  it("start_job returns an id and an initial status", async () => {
    await withServer(new JobStore(fakeClock().now), async (client) => {
      const res = await client.callTool({
        name: "start_job",
        arguments: { label: "report", duration_ms: 3000 },
      });
      const sc = res.structuredContent as { job_id: string; status: string };
      expect(sc.job_id).toBe("job_1");
      expect(sc.status).toBe("queued");
    });
  });

  it("a 0-duration job is immediately succeeded with progress 1 and a result", async () => {
    await withServer(new JobStore(fakeClock().now), async (client) => {
      const started = await client.callTool({
        name: "start_job",
        arguments: { label: "instant", duration_ms: 0 },
      });
      const id = (started.structuredContent as { job_id: string }).job_id;

      const res = await client.callTool({ name: "get_job_status", arguments: { job_id: id } });
      const sc = res.structuredContent as {
        status: string;
        progress: number;
        label: string;
        result?: { message: string };
      };
      expect(sc.status).toBe("succeeded");
      expect(sc.progress).toBe(1);
      expect(sc.label).toBe("instant");
      expect(sc.result?.message).toBe("processed instant");
    });
  });

  it("advancing the clock moves a job running -> succeeded", async () => {
    const clock = fakeClock();
    await withServer(new JobStore(clock.now), async (client) => {
      const started = await client.callTool({
        name: "start_job",
        arguments: { label: "batch", duration_ms: 1000 },
      });
      const id = (started.structuredContent as { job_id: string }).job_id;

      clock.advance(500);
      const running = await client.callTool({ name: "get_job_status", arguments: { job_id: id } });
      expect((running.structuredContent as { status: string }).status).toBe("running");

      clock.advance(600); // total 1100 >= 1000
      const done = await client.callTool({ name: "get_job_status", arguments: { job_id: id } });
      const sc = done.structuredContent as { status: string; progress: number };
      expect(sc.status).toBe("succeeded");
      expect(sc.progress).toBe(1);
    });
  });

  it("get_job_status for an unknown id returns a not_found error", async () => {
    await withServer(new JobStore(fakeClock().now), async (client) => {
      const res = await client.callTool({ name: "get_job_status", arguments: { job_id: "nope" } });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("not_found");
    });
  });

  it("cancel_job stops a running job", async () => {
    const clock = fakeClock();
    await withServer(new JobStore(clock.now), async (client) => {
      const started = await client.callTool({
        name: "start_job",
        arguments: { label: "long", duration_ms: 5000 },
      });
      const id = (started.structuredContent as { job_id: string }).job_id;

      clock.advance(1000);
      const cancelled = await client.callTool({ name: "cancel_job", arguments: { job_id: id } });
      expect((cancelled.structuredContent as { status: string }).status).toBe("cancelled");

      // Stays cancelled even after the original duration would have elapsed.
      clock.advance(10000);
      const after = await client.callTool({ name: "get_job_status", arguments: { job_id: id } });
      expect((after.structuredContent as { status: string }).status).toBe("cancelled");
    });
  });

  it("cancel_job for an unknown id returns a not_found error", async () => {
    await withServer(new JobStore(fakeClock().now), async (client) => {
      const res = await client.callTool({ name: "cancel_job", arguments: { job_id: "ghost" } });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("not_found");
    });
  });

  it("list_jobs filters by status", async () => {
    const clock = fakeClock();
    await withServer(new JobStore(clock.now), async (client) => {
      await client.callTool({ name: "start_job", arguments: { label: "a", duration_ms: 0 } });
      await client.callTool({ name: "start_job", arguments: { label: "b", duration_ms: 5000 } });

      const all = await client.callTool({ name: "list_jobs", arguments: {} });
      expect((all.structuredContent as { count: number }).count).toBe(2);

      const succeeded = await client.callTool({ name: "list_jobs", arguments: { status: "succeeded" } });
      const sc = succeeded.structuredContent as { count: number; jobs: { label: string }[] };
      expect(sc.count).toBe(1);
      expect(sc.jobs[0]?.label).toBe("a");
    });
  });
});
