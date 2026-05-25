/**
 * Score one tool against the rubric (see `../rubric.md`).
 *
 * The grader reads exactly what the model reads — `name`, `description`, and
 * the input `schema` — plus the `examples` we treat as part of the docs. It is
 * intentionally mechanical: every check is a regex or a structural test, so a
 * score is reproducible and reviewable.
 */
import type { AnyToolSpec } from "@mcp-kit/core";

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

export function scoreTool(spec: AnyToolSpec, options: ScoreOptions = { threshold: DEFAULT_THRESHOLD }): ToolScore {
  const name = typeof spec.name === "string" ? spec.name : "(unnamed)";
  const description = typeof spec.description === "string" ? spec.description : "";
  const shape = inputShape(spec);
  const paramNames = Object.keys(shape);
  const examples = Array.isArray(spec.examples) ? spec.examples : [];

  const checks: CheckResult[] = [];
  const hardFails: HardFail[] = [];

  // --- hard fail: credentials in inputs -----------------------------------
  const leakedParams = paramNames.filter((p) => CREDENTIAL_RE.test(p));
  if (leakedParams.length > 0) {
    hardFails.push({
      id: "no_credentials_in_inputs",
      detail: `parameter(s) look like credentials: ${leakedParams.join(", ")}. Move auth to the transport.`,
    });
  }

  // --- name_format (10) ----------------------------------------------------
  const nameOk = SNAKE_CASE_RE.test(name);
  checks.push({
    id: "name_format",
    label: "snake_case name",
    weight: 10,
    earned: nameOk ? 10 : 0,
    note: nameOk ? name : `"${name}" is not lowercase snake_case`,
  });

  // --- verb_first (15) -----------------------------------------------------
  const firstWord = name.split("_")[0] ?? "";
  const verbOk = VERBS.has(firstWord);
  checks.push({
    id: "verb_first",
    label: "verb-first name",
    weight: 15,
    earned: verbOk ? 15 : 0,
    note: verbOk ? `starts with "${firstWord}"` : `"${firstWord}" is not a known action verb`,
  });

  // --- when_to_use (20) ----------------------------------------------------
  const whenOk = WHEN_TO_USE_RE.test(description);
  checks.push({
    id: "when_to_use",
    label: "when-to-use sentence",
    weight: 20,
    earned: whenOk ? 20 : 0,
    note: whenOk ? "present" : 'no "use this when …" guidance',
  });

  // --- non_goals (15) ------------------------------------------------------
  const nonGoalOk = NON_GOAL_RE.test(description);
  checks.push({
    id: "non_goals",
    label: "states non-goals",
    weight: 15,
    earned: nonGoalOk ? 15 : 0,
    note: nonGoalOk ? "present" : "does not say what it will NOT do",
  });

  // --- params_described (20) ----------------------------------------------
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

  // --- examples (15) -------------------------------------------------------
  const exampleOk = examples.length > 0 || hasInlineExample(description);
  checks.push({
    id: "examples",
    label: "has example(s)",
    weight: 15,
    earned: exampleOk ? 15 : 0,
    note: examples.length > 0 ? `${examples.length} example(s)` : exampleOk ? "inline example" : "none",
  });

  // --- description_shape (5) ----------------------------------------------
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
