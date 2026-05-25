import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { tools } from "../src/abaplint.tools.js";

type Client = Awaited<ReturnType<typeof connectInMemory>>["client"];

async function withServer<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const { client, close } = await connectInMemory(buildServer({ name: "abaplint-test", version: "0", tools }));
  try {
    return await fn(client);
  } finally {
    await close();
  }
}

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("abaplint server", () => {
  it("lint_string returns a structured issue list", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "lint_string",
        arguments: { code: "REPORT zfoo.\nDATA lv_x TYPE i.", filename: "zfoo.prog.abap" },
      });
      const sc = res.structuredContent as {
        issueCount: number;
        issues: { rule: string; line: number }[];
        severities: Record<string, number>;
      };
      expect(typeof sc.issueCount).toBe("number");
      expect(sc.issueCount).toBe(sc.issues.length);
      expect(typeof sc.severities).toBe("object");
    });
  });

  it("lint_string flags broken ABAP", async () => {
    await withServer(async (client) => {
      // Missing statement terminators -> abaplint reports parser issues.
      const res = await client.callTool({
        name: "lint_string",
        arguments: { code: "DATA lv_x TYPE i\nWRITE lv_x", filename: "zbad.prog.abap" },
      });
      const sc = res.structuredContent as { issueCount: number; issues: { rule: string }[] };
      expect(sc.issueCount).toBeGreaterThan(0);
      expect(sc.issues[0]?.rule).toBeTruthy();
    });
  });

  it("get_rule_explanations returns the catalog, then a specific rule", async () => {
    await withServer(async (client) => {
      const catalogRes = await client.callTool({ name: "get_rule_explanations", arguments: {} });
      const catalog = catalogRes.structuredContent as { count: number; rules: { key: string; title: string }[] };
      expect(catalog.count).toBeGreaterThan(50);
      const someKey = catalog.rules[0]!.key;

      const oneRes = await client.callTool({ name: "get_rule_explanations", arguments: { rules: [someKey] } });
      const one = oneRes.structuredContent as { count: number; missing: string[]; rules: { key: string }[] };
      expect(one.count).toBe(1);
      expect(one.rules[0]?.key).toBe(someKey);
      expect(one.missing).toHaveLength(0);
    });
  });

  it("get_rule_explanations reports unknown keys as missing", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "get_rule_explanations",
        arguments: { rules: ["definitely_not_a_real_rule"] },
      });
      const sc = res.structuredContent as { count: number; missing: string[] };
      expect(sc.count).toBe(0);
      expect(sc.missing).toContain("definitely_not_a_real_rule");
    });
  });

  it("lint_file lints a file on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "abaplint-"));
    tmpDirs.push(dir);
    const file = join(dir, "zbad.prog.abap");
    await writeFile(file, "DATA lv_x TYPE i\nWRITE lv_x", "utf8");
    await withServer(async (client) => {
      const res = await client.callTool({ name: "lint_file", arguments: { path: file } });
      const sc = res.structuredContent as { path: string; issueCount: number };
      expect(sc.path).toBe(file);
      expect(sc.issueCount).toBeGreaterThan(0);
    });
  });

  it("lint_file surfaces a missing path as not_found", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "lint_file", arguments: { path: "/no/such/file.prog.abap" } });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("not_found");
    });
  });

  it("lint_directory scans every .abap file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "abaplint-"));
    tmpDirs.push(dir);
    await writeFile(join(dir, "a.prog.abap"), "REPORT a.\nDATA lv TYPE i.", "utf8");
    await writeFile(join(dir, "b.prog.abap"), "REPORT b.\nDATA lv TYPE i.", "utf8");
    await writeFile(join(dir, "notabap.txt"), "ignored", "utf8");
    await withServer(async (client) => {
      const res = await client.callTool({ name: "lint_directory", arguments: { path: dir } });
      const sc = res.structuredContent as { filesScanned: number; truncated: boolean };
      expect(sc.filesScanned).toBe(2);
      expect(sc.truncated).toBe(false);
    });
  });
});
