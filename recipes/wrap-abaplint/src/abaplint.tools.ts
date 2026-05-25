/**
 * abaplint tools — wrap the ABAP linter as MCP tools.
 *
 * Four read-only tools: lint a string, a file, or a directory of `*.abap`, and
 * explain abaplint's rules. abaplint runs in-process, so there is no client to
 * inject; tests drive the tools directly (linting strings and temp files).
 */
import { type AnyToolSpec, defineTool, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { lintDirectory, lintPath, lintSources, ruleExplanations } from "./linter.js";

function severityCounts(issues: { severity: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues) counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  return counts;
}

const lintString = defineTool({
  name: "lint_string",
  title: "Lint an ABAP snippet",
  description:
    "Lint a snippet of ABAP source passed as a string and return the issues abaplint finds. " +
    "Use this when you have ABAP code in hand (generated, pasted, or from a diff) and want style/correctness " +
    "feedback without writing it to disk — each issue has the rule key, message, severity, and line/column. " +
    "Give a filename so abaplint knows the object type (the suffix matters: .prog.abap, .clas.abap, …). " +
    "It does not modify or auto-fix the code and does not read anything from disk — use lint_file / lint_directory " +
    "for files. " +
    "Part of the wrap-abaplint server (an abaplint wrapper), not a primitive. " +
    'Example: lint_string({ "code": "REPORT zfoo.\\nDATA lv TYPE i.", "filename": "zfoo.prog.abap" }).',
  inputSchema: {
    code: z.string().min(1).describe("The ABAP source to lint, as a single string (newlines allowed)."),
    filename: z
      .string()
      .describe('Filename used for object-type detection; the suffix matters. Defaults to "zsnippet.prog.abap".')
      .default("zsnippet.prog.abap"),
  },
  outputSchema: {
    filename: z.string().describe("The filename the snippet was linted under."),
    issueCount: z.number().describe("Total number of issues found."),
    severities: z.record(z.number()).describe('Count per severity, e.g. { "Error": 1, "Warning": 2 }.'),
    issues: z
      .array(
        z.object({
          rule: z.string(),
          message: z.string(),
          severity: z.string(),
          filename: z.string(),
          line: z.number(),
          column: z.number(),
        }),
      )
      .describe("The issues, sorted by position."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [
    { description: "Lint a tiny report.", arguments: { code: "REPORT zfoo.\nDATA lv TYPE i.", filename: "zfoo.prog.abap" } },
  ],
  handler: (args) => {
    const issues = lintSources([{ filename: args.filename, code: args.code }]);
    return toolResult(`${issues.length} issue(s) in ${args.filename}.`, {
      filename: args.filename,
      issueCount: issues.length,
      severities: severityCounts(issues),
      issues,
    });
  },
});

const lintFile = defineTool({
  name: "lint_file",
  title: "Lint an ABAP file",
  description:
    "Lint a single ABAP file on the server's filesystem, by path, and return its issues. " +
    "Use this when the code already lives in a file the server can read (a checked-out repo, a generated file) and " +
    "you want abaplint's findings for just that file — the real filename drives object-type detection. " +
    "It reads but never writes the file, does not auto-fix, and lints only one path — use lint_directory to lint a " +
    "whole tree or lint_string for code you have not written to disk. " +
    "Part of the wrap-abaplint server (an abaplint wrapper), not a primitive. " +
    'Example: lint_file({ "path": "src/zcl_foo.clas.abap" }).',
  inputSchema: {
    path: z.string().min(1).describe("Path to a .abap file the server can read, e.g. \"src/zcl_foo.clas.abap\"."),
  },
  outputSchema: {
    path: z.string().describe("The file that was linted."),
    issueCount: z.number().describe("Total number of issues found."),
    severities: z.record(z.number()).describe("Count per severity."),
    issues: z
      .array(
        z.object({
          rule: z.string(),
          message: z.string(),
          severity: z.string(),
          filename: z.string(),
          line: z.number(),
          column: z.number(),
        }),
      )
      .describe("The issues, sorted by position."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [{ description: "Lint one class file.", arguments: { path: "src/zcl_foo.clas.abap" } }],
  handler: async (args) => {
    const issues = await lintPath(args.path);
    return toolResult(`${issues.length} issue(s) in ${args.path}.`, {
      path: args.path,
      issueCount: issues.length,
      severities: severityCounts(issues),
      issues,
    });
  },
});

const lintDirectoryTool = defineTool({
  name: "lint_directory",
  title: "Lint an ABAP directory",
  description:
    "Lint every .abap file under a directory on the server's filesystem (recursively) and return all issues. " +
    "Use this to lint a whole ABAP project or package at once — it walks the tree (skipping node_modules and dotfiles), " +
    "lints all files together so cross-object rules work, and reports issues plus how many files were scanned. " +
    "It reads but never writes, does not auto-fix, and caps the number of files (max_files) to stay bounded — raise " +
    "the cap or point at a subfolder for very large trees. " +
    "Part of the wrap-abaplint server (an abaplint wrapper), not a primitive. " +
    'Example: lint_directory({ "path": "src", "max_files": 200 }).',
  inputSchema: {
    path: z.string().min(1).describe('Directory to lint recursively, e.g. "src".'),
    max_files: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .describe("Maximum .abap files to scan; extra files are skipped and flagged. Defaults to 100.")
      .default(100),
  },
  outputSchema: {
    path: z.string().describe("The directory that was linted."),
    filesScanned: z.number().describe("Number of .abap files actually linted."),
    truncated: z.boolean().describe("True if more files existed than max_files."),
    issueCount: z.number().describe("Total number of issues found."),
    severities: z.record(z.number()).describe("Count per severity."),
    issues: z
      .array(
        z.object({
          rule: z.string(),
          message: z.string(),
          severity: z.string(),
          filename: z.string(),
          line: z.number(),
          column: z.number(),
        }),
      )
      .describe("The issues across all scanned files, sorted by file then position."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [{ description: "Lint the src tree.", arguments: { path: "src" } }],
  handler: async (args) => {
    const result = await lintDirectory(args.path, args.max_files);
    return toolResult(
      `${result.issues.length} issue(s) across ${result.files} file(s) in ${args.path}${result.truncated ? " (truncated)" : ""}.`,
      {
        path: args.path,
        filesScanned: result.files,
        truncated: result.truncated,
        issueCount: result.issues.length,
        severities: severityCounts(result.issues),
        issues: result.issues,
      },
    );
  },
});

const getRuleExplanations = defineTool({
  name: "get_rule_explanations",
  title: "Explain abaplint rules",
  description:
    "Explain abaplint rules: their key, title, and description (with good/bad examples for specific rules). " +
    "Use this to understand a rule reported by lint_string / lint_file / lint_directory — pass the rule keys (e.g. " +
    "the \"rule\" field of an issue) to get full explanations, or call with no keys to get the catalog of every rule's " +
    "key and title so you can choose. " +
    "It does not lint any code, change rule configuration, or enable/disable rules; it only documents them. " +
    "Part of the wrap-abaplint server (an abaplint wrapper), not a primitive. " +
    'Example: get_rule_explanations({ "rules": ["7bit_ascii", "line_length"] }).',
  inputSchema: {
    rules: z
      .array(z.string())
      .describe("Rule keys to explain in full. Omit to get the catalog (key + title + short description) of all rules.")
      .optional(),
  },
  outputSchema: {
    count: z.number().describe("Number of rules returned."),
    missing: z.array(z.string()).describe("Requested keys that are not abaplint rules."),
    rules: z
      .array(
        z.object({
          key: z.string(),
          title: z.string(),
          shortDescription: z.string(),
          badExample: z.string().optional(),
          goodExample: z.string().optional(),
          extendedInformation: z.string().optional(),
        }),
      )
      .describe("The rule explanations (or catalog entries when no keys were given)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [
    { description: "Explain two specific rules.", arguments: { rules: ["7bit_ascii", "line_length"] } },
    { description: "Browse the whole rule catalog.", arguments: {} },
  ],
  handler: (args) => {
    const result = ruleExplanations(args.rules);
    return toolResult(`${result.count} rule(s) returned.`, result);
  },
});

export const tools: AnyToolSpec[] = [lintString, lintFile, lintDirectoryTool, getRuleExplanations];
