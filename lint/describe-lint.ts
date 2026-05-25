/**
 * describe-lint — score every MCP tool's name + description + schema against the
 * tool-design rubric (see `./rubric.md`), and fail CI below threshold.
 *
 * The rubric is distilled from the CCA-F `03-tool-design-mcp` notes and
 * Anthropic's *Writing effective tools for AI agents*. The grader reads exactly
 * what the model reads — name, description, input schema — plus the `examples`
 * we treat as documentation. Every check is a regex or a structural test, so a
 * score is reproducible and reviewable.
 *
 * Run: `tsx describe-lint.ts [--root <dir>] [--threshold <n>] [--json]`
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AnyToolSpec } from "@mcp-kit/core";

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface CheckResult {
  id: string;
  label: string;
  weight: number;
  earned: number;
  note: string;
}

export interface HardFail {
  id: string;
  detail: string;
}

export interface ToolScore {
  name: string;
  score: number;
  passed: boolean;
  checks: CheckResult[];
  hardFails: HardFail[];
}

export interface ScoreOptions {
  threshold: number;
}

export const DEFAULT_THRESHOLD = 80;

/** Imperative verbs a good tool name starts with. Extend deliberately. */
const VERBS = new Set([
  "get", "list", "search", "find", "fetch", "read", "lookup", "query", "count",
  "create", "add", "insert", "update", "set", "edit", "patch", "upsert",
  "delete", "remove", "clear", "drop",
  "run", "execute", "exec", "invoke", "call", "start", "stop", "cancel", "poll",
  "send", "post", "put", "submit", "publish", "trigger",
  "import", "export", "upload", "download", "sync", "copy", "move",
  "convert", "parse", "render", "format", "build", "generate", "compute",
  "calculate", "summarize", "translate", "transform", "extract",
  "check", "validate", "verify", "resolve", "describe", "inspect", "scan",
  "ping", "echo", "wrap", "open", "close", "watch", "wait",
]);

/**
 * Parameter names that mean "credential". Bare `token`/`key` are *excluded* on
 * purpose — `page_token`, `idempotency_key`, `sort_key` are legitimate,
 * non-secret parameters.
 */
const CREDENTIAL_RE =
  /(password|passwd|pwd|secret(?:_?key)?|client_?secret|private_?key|api_?key|apikey|access_?key|access_?token|refresh_?token|auth_?token|session_?token|bearer_?token|\boauth\b|credentials?|authorization)/i;

const WHEN_TO_USE_RE = /\buse (?:this|it|the|when|to)\b/i;
const NON_GOAL_RE =
  /(does ?n['o]?t|do not|doesn't|cannot|can't|won't|will not|not (?:for|intended|meant|able)|rather than|instead of|use [^.]*? instead|no\b[^.]*\bsupport)/i;
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Read a Zod field's description, unwrapping default/optional/nullable/effects. */
function readDescription(schema: unknown): string | undefined {
  let node = schema as { description?: string; _def?: Record<string, unknown> } | undefined;
  const seen = new Set<unknown>();
  while (node && !seen.has(node)) {
    seen.add(node);
    if (typeof node.description === "string" && node.description.trim().length > 0) {
      return node.description.trim();
    }
    const def = node._def ?? {};
    const inner = (def.innerType ?? def.schema ?? def.type ?? def.in) as typeof node | undefined;
    node = inner;
  }
  return undefined;
}

function inputShape(spec: AnyToolSpec): Record<string, unknown> {
  const schema = spec.inputSchema;
  return schema && typeof schema === "object" ? (schema as Record<string, unknown>) : {};
}

function hasInlineExample(description: string): boolean {
  return /\bexamples?\b/i.test(description) || /\w+\s*\(\s*\{/.test(description);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function scoreTool(
  spec: AnyToolSpec,
  options: ScoreOptions = { threshold: DEFAULT_THRESHOLD },
): ToolScore {
  const name = typeof spec.name === "string" ? spec.name : "(unnamed)";
  const description = typeof spec.description === "string" ? spec.description : "";
  const shape = inputShape(spec);
  const paramNames = Object.keys(shape);
  const examples = Array.isArray(spec.examples) ? spec.examples : [];

  const checks: CheckResult[] = [];
  const hardFails: HardFail[] = [];

  // hard fail: credentials in inputs
  const leakedParams = paramNames.filter((p) => CREDENTIAL_RE.test(p));
  if (leakedParams.length > 0) {
    hardFails.push({
      id: "no_credentials_in_inputs",
      detail: `parameter(s) look like credentials: ${leakedParams.join(", ")}. Move auth to the transport.`,
    });
  }

  // name_format (10)
  const nameOk = SNAKE_CASE_RE.test(name);
  checks.push({
    id: "name_format",
    label: "snake_case name",
    weight: 10,
    earned: nameOk ? 10 : 0,
    note: nameOk ? name : `"${name}" is not lowercase snake_case`,
  });

  // verb_first (15)
  const firstWord = name.split("_")[0] ?? "";
  const verbOk = VERBS.has(firstWord);
  checks.push({
    id: "verb_first",
    label: "verb-first name",
    weight: 15,
    earned: verbOk ? 15 : 0,
    note: verbOk ? `starts with "${firstWord}"` : `"${firstWord}" is not a known action verb`,
  });

  // when_to_use (20)
  const whenOk = WHEN_TO_USE_RE.test(description);
  checks.push({
    id: "when_to_use",
    label: "when-to-use sentence",
    weight: 20,
    earned: whenOk ? 20 : 0,
    note: whenOk ? "present" : 'no "use this when …" guidance',
  });

  // non_goals (15)
  const nonGoalOk = NON_GOAL_RE.test(description);
  checks.push({
    id: "non_goals",
    label: "states non-goals",
    weight: 15,
    earned: nonGoalOk ? 15 : 0,
    note: nonGoalOk ? "present" : "does not say what it will NOT do",
  });

  // params_described (20)
  let describedCount = 0;
  const undescribed: string[] = [];
  for (const p of paramNames) {
    const desc = readDescription(shape[p]);
    if (desc && desc.length >= 12) describedCount += 1;
    else undescribed.push(p);
  }
  const paramEarned =
    paramNames.length === 0 ? 20 : Math.round((describedCount / paramNames.length) * 20);
  checks.push({
    id: "params_described",
    label: "params described",
    weight: 20,
    earned: paramEarned,
    note:
      paramNames.length === 0
        ? "no parameters"
        : `${describedCount}/${paramNames.length} described${undescribed.length ? ` (missing: ${undescribed.join(", ")})` : ""}`,
  });

  // examples (15)
  const exampleOk = examples.length > 0 || hasInlineExample(description);
  checks.push({
    id: "examples",
    label: "has example(s)",
    weight: 15,
    earned: exampleOk ? 15 : 0,
    note: examples.length > 0 ? `${examples.length} example(s)` : exampleOk ? "inline example" : "none",
  });

  // description_shape (5)
  const len = description.length;
  const sentences = (description.match(/[.!?](\s|$)/g) ?? []).length;
  const shapeOk = len >= 80 && len <= 2000 && sentences >= 2;
  checks.push({
    id: "description_shape",
    label: "substantive prose",
    weight: 5,
    earned: shapeOk ? 5 : clamp(Math.round((Math.min(len, 80) / 80) * 5), 0, 5),
    note: `${len} chars, ${sentences} sentence(s)`,
  });

  const earned = checks.reduce((sum, c) => sum + c.earned, 0);
  const max = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((earned / max) * 100);
  const passed = hardFails.length === 0 && score >= options.threshold;

  return { name, score, passed, checks, hardFails };
}

// ---------------------------------------------------------------------------
// Discovery — find every `*.tools.ts` registry and load its `tools` export.
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".git", ".venv", "venv", "coverage", "__pycache__", ".pytest_cache",
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

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  root: string;
  threshold: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { root: findRepoRoot(process.cwd()), threshold: DEFAULT_THRESHOLD, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") args.root = argv[(i += 1)] ?? args.root;
    else if (arg === "--threshold") args.threshold = Number(argv[(i += 1)] ?? args.threshold);
    else if (arg === "--json") args.json = true;
  }
  if (!Number.isFinite(args.threshold)) args.threshold = DEFAULT_THRESHOLD;
  return args;
}

function bar(score: number): string {
  const filled = Math.round((score / 100) * 20);
  return `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;
}

function printHuman(scores: ToolScore[], threshold: number): void {
  console.log(`\nTool-description lint — threshold ${threshold}/100\n`);
  for (const s of scores) {
    const status = s.passed ? "PASS" : "FAIL";
    console.log(`${status}  ${s.score.toString().padStart(3)}/100  ${bar(s.score)}  ${s.name}`);
    for (const hf of s.hardFails) {
      console.log(`        ✗ HARD FAIL [${hf.id}]: ${hf.detail}`);
    }
    const problems = s.checks.filter((c) => c.earned < c.weight);
    if (!s.passed || problems.length > 0) {
      for (const c of problems) {
        console.log(`        · ${c.label} (${c.earned}/${c.weight}): ${c.note}`);
      }
    }
  }
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const { tools, files, errors } = await discoverTools(args.root);

  const scores = tools
    .map(({ spec }) => scoreTool(spec, { threshold: args.threshold }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (args.json) {
    console.log(JSON.stringify({ threshold: args.threshold, scores, errors }, null, 2));
  } else {
    const rel = files.map((f) => relative(args.root, f));
    console.log(`Scanned ${rel.length} registr${rel.length === 1 ? "y" : "ies"}: ${rel.join(", ") || "(none)"}`);
    printHuman(scores, args.threshold);
  }

  const failures = scores.filter((s) => !s.passed);
  const ok = errors.length === 0 && failures.length === 0 && scores.length > 0;

  if (!args.json) {
    console.log("");
    if (errors.length > 0) {
      console.log(`Discovery errors (${errors.length}):`);
      for (const e of errors) console.log(`  ! ${e}`);
    }
    if (scores.length === 0) console.log("No tools found to lint.");
    else if (ok) console.log(`All ${scores.length} tool(s) passed (≥ ${args.threshold}/100).`);
    else console.log(`${failures.length} of ${scores.length} tool(s) failed.`);
  }

  return ok ? 0 : 1;
}

function isMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  runCli()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error("[lint] fatal:", err);
      process.exit(1);
    });
}
