/**
 * A thin wrapper around `@abaplint/core` — the actual ABAP linter.
 *
 * abaplint runs **in process** (no network, no auth), so this recipe has no REST
 * client: it builds a `Registry`, adds files, parses, and collects `Issue`s,
 * normalising each to a small structured shape. It also exposes abaplint's rule
 * metadata so a model can ask "what does rule X mean?".
 *
 * This is the sibling for clean-core-academy: the academy's
 * `src/lib/abap/lintAbap.ts` can become a thin client of this MCP server. There
 * is an `abaplint/abaplint-mcp-server` project upstream; if you don't want a
 * dependency on it, this recipe *is* that server, ready to extract.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { ArtifactsRules, Config, MemoryFile, Registry, type Issue } from "@abaplint/core";
import { McpToolError } from "@mcp-kit/core";

export interface LintIssue {
  /** abaplint rule key, e.g. "7bit_ascii". */
  rule: string;
  message: string;
  /** "Error" | "Warning" | "Info". */
  severity: string;
  filename: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

export interface SourceFile {
  filename: string;
  code: string;
}

export interface RuleExplanation {
  key: string;
  title: string;
  shortDescription: string;
  badExample?: string;
  goodExample?: string;
  extendedInformation?: string;
}

function toSummary(issue: Issue): LintIssue {
  const start = issue.getStart();
  return {
    rule: issue.getKey(),
    message: issue.getMessage(),
    severity: issue.getSeverity(),
    filename: issue.getFilename(),
    line: start.getRow(),
    column: start.getCol(),
  };
}

/** Lint one or more in-memory ABAP source files with the default rule set. */
export function lintSources(files: readonly SourceFile[]): LintIssue[] {
  const registry = new Registry(Config.getDefault());
  for (const file of files) registry.addFile(new MemoryFile(file.filename, file.code));
  registry.parse();
  return registry
    .findIssues()
    .map(toSummary)
    .sort((a, b) => a.filename.localeCompare(b.filename) || a.line - b.line || a.column - b.column);
}

/** Read one `.abap` file from disk and lint it. */
export async function lintPath(path: string): Promise<LintIssue[]> {
  let code: string;
  try {
    code = await readFile(path, "utf8");
  } catch (err) {
    throw new McpToolError(
      "not_found",
      `Cannot read ABAP file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return lintSources([{ filename: path, code }]);
}

async function collectAbapFiles(dir: string, max: number, out: string[]): Promise<void> {
  if (out.length >= max) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new McpToolError(
      "not_found",
      `Cannot read directory ${dir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (const entry of entries) {
    if (out.length >= max) return;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        await collectAbapFiles(full, max, out);
      }
    } else if (entry.isFile() && entry.name.endsWith(".abap")) {
      out.push(full);
    }
  }
}

/** Recursively lint every `*.abap` file under a directory (capped). */
export async function lintDirectory(
  dir: string,
  maxFiles: number,
): Promise<{ files: number; truncated: boolean; issues: LintIssue[] }> {
  const paths: string[] = [];
  await collectAbapFiles(dir, maxFiles + 1, paths);
  const truncated = paths.length > maxFiles;
  const kept = paths.slice(0, maxFiles);
  const sources: SourceFile[] = [];
  for (const path of kept) sources.push({ filename: path, code: await readFile(path, "utf8") });
  return { files: sources.length, truncated, issues: lintSources(sources) };
}

/**
 * Explain abaplint rules. With `keys`, returns the full metadata (title,
 * description, good/bad examples) for those rules; without, returns the catalog
 * of every rule's key + title + short description so a model can pick.
 */
export function ruleExplanations(keys?: readonly string[]): {
  count: number;
  missing: string[];
  rules: RuleExplanation[];
} {
  const metas = ArtifactsRules.getRules().map((rule) => rule.getMetadata());
  const want = keys && keys.length > 0 ? new Set(keys.map((k) => k.trim().toLowerCase())) : undefined;
  const selected = want ? metas.filter((m) => want.has(m.key)) : metas;
  const full = want !== undefined;

  const rules: RuleExplanation[] = selected
    .map((m) => {
      const explanation: RuleExplanation = {
        key: m.key,
        title: m.title,
        shortDescription: m.shortDescription,
      };
      if (full) {
        if (m.badExample) explanation.badExample = m.badExample;
        if (m.goodExample) explanation.goodExample = m.goodExample;
        if (m.extendedInformation) explanation.extendedInformation = m.extendedInformation;
      }
      return explanation;
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const missing = want ? [...want].filter((k) => !metas.some((m) => m.key === k)) : [];
  return { count: rules.length, missing, rules };
}
