/**
 * Find and load every tool registry in the repo.
 *
 * Convention: a file named `*.tools.ts` exports `const tools: AnyToolSpec[]`.
 * The lint walks the tree, dynamically imports each registry (via tsx, so it
 * reads the TypeScript source directly), and collects the specs. Drop a new
 * recipe in and the lint grades it automatically — no central list to update.
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AnyToolSpec } from "@mcp-kit/core";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".venv",
  "venv",
  "coverage",
  "__pycache__",
  ".pytest_cache",
]);

/** Walk up from `start` to the directory holding `pnpm-workspace.yaml`. */
export function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".tools.ts")) {
      out.push(join(dir, entry.name));
    }
  }
}

export interface DiscoveredTool {
  spec: AnyToolSpec;
  file: string;
}

export interface DiscoveryResult {
  tools: DiscoveredTool[];
  files: string[];
  errors: string[];
}

function isLintable(value: unknown): value is AnyToolSpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.description === "string" &&
    typeof v.inputSchema === "object" &&
    v.inputSchema !== null
  );
}

export async function discoverTools(root: string): Promise<DiscoveryResult> {
  const files: string[] = [];
  await walk(root, files);
  files.sort();

  const tools: DiscoveredTool[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const mod: unknown = await import(pathToFileURL(file).href);
      const exported = (mod as { tools?: unknown }).tools;
      if (!Array.isArray(exported)) {
        errors.push(`${file}: expected an exported \`tools\` array`);
        continue;
      }
      for (const item of exported) {
        if (isLintable(item)) tools.push({ spec: item, file });
        else errors.push(`${file}: an exported entry is missing name/description/inputSchema`);
      }
    } catch (err) {
      errors.push(`${file}: failed to import — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tools, files, errors };
}
