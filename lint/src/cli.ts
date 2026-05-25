/**
 * The tool-description lint runner.
 *
 *   pnpm lint:tools
 *   tsx src/cli.ts --root . --threshold 90 --json
 *
 * Discovers every `*.tools.ts` registry, scores each tool, prints a per-tool
 * breakdown, and exits non-zero if any tool hard-fails or scores below the
 * threshold.
 */
import { relative } from "node:path";

import { discoverTools, findRepoRoot } from "./discover.js";
import { DEFAULT_THRESHOLD, scoreTool, type ToolScore } from "./score.js";

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
    const problems = s.checks.filter((c) => c.earned < c.weight);
    for (const hf of s.hardFails) {
      console.log(`        ✗ HARD FAIL [${hf.id}]: ${hf.detail}`);
    }
    if (!s.passed || problems.length > 0) {
      for (const c of problems) {
        console.log(`        · ${c.label} (${c.earned}/${c.weight}): ${c.note}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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
    if (scores.length === 0) {
      console.log("No tools found to lint.");
    } else if (ok) {
      console.log(`All ${scores.length} tool(s) passed (≥ ${args.threshold}/100).`);
    } else {
      console.log(`${failures.length} of ${scores.length} tool(s) failed.`);
    }
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("[lint] fatal:", err);
  process.exit(1);
});
