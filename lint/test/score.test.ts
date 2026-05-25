import type { AnyToolSpec } from "@mcp-kit/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { scoreTool } from "../src/score.js";

function spec(overrides: Partial<AnyToolSpec>): AnyToolSpec {
  return {
    name: "get_thing",
    description:
      "Fetch a thing by id. Use this when you already know the id and want its current fields. " +
      "It does not search or list things. Example: get_thing({ id: 'abc' }).",
    inputSchema: { id: z.string().describe("The unique id of the thing to fetch.") },
    examples: [{ description: "Fetch thing abc.", arguments: { id: "abc" } }],
    handler: () => ({ content: [] }),
    ...overrides,
  } as AnyToolSpec;
}

describe("scoreTool", () => {
  it("gives a well-written tool a high passing score", () => {
    const result = scoreTool(spec({}));
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.hardFails).toHaveLength(0);
  });

  it("hard-fails when a parameter looks like a credential", () => {
    const result = scoreTool(
      spec({ inputSchema: { api_key: z.string().describe("Your secret API key for the service.") } }),
    );
    expect(result.passed).toBe(false);
    expect(result.hardFails.map((h) => h.id)).toContain("no_credentials_in_inputs");
  });

  it("does NOT treat pagination tokens as credentials", () => {
    const result = scoreTool(
      spec({
        name: "list_things",
        inputSchema: {
          page_token: z.string().optional().describe("Opaque cursor from a previous response's nextPageToken."),
        },
      }),
    );
    expect(result.hardFails).toHaveLength(0);
  });

  it("docks points for a non-verb name", () => {
    const result = scoreTool(spec({ name: "thing_data" }));
    const verb = result.checks.find((c) => c.id === "verb_first");
    expect(verb?.earned).toBe(0);
  });

  it("docks points when the when-to-use sentence is missing", () => {
    const result = scoreTool(spec({ description: "A thing. It returns fields. Not a search." }));
    const when = result.checks.find((c) => c.id === "when_to_use");
    expect(when?.earned).toBe(0);
  });

  it("reads a description through .describe().default() ordering", () => {
    const result = scoreTool(
      spec({
        inputSchema: {
          mode: z.enum(["a", "b"]).describe("Which mode to use; defaults to a.").default("a"),
        },
      }),
    );
    const params = result.checks.find((c) => c.id === "params_described");
    expect(params?.earned).toBe(20);
  });

  it("penalises undescribed parameters proportionally", () => {
    const result = scoreTool(
      spec({
        inputSchema: {
          described: z.string().describe("A clearly documented parameter."),
          bare: z.string(),
        },
      }),
    );
    const params = result.checks.find((c) => c.id === "params_described");
    expect(params?.earned).toBe(10);
  });
});
