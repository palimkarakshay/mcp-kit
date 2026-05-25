/**
 * Long-running-job tools — the async + polling half of the cookbook.
 *
 * `start_job` kicks off work and returns *immediately* with a job id; the model
 * then polls `get_job_status` until the job finishes (or calls `cancel_job`).
 * This is the deliberate opposite of the run-and-wait pattern (e.g. the REST /
 * Anaplan recipe blocks the call until the upstream operation completes). Async
 * + polling fits work that can outlive a single tool call.
 *
 * The store is module-level so the four tools share one set of jobs; tests
 * inject a store backed by a fake clock via {@link setJobStore}.
 */
import { type AnyToolSpec, defineTool, notFound, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { JobStore } from "./store.js";

let injected: JobStore | undefined;

/** Override the shared job store (tests). Pass `undefined` to reset. */
export function setJobStore(store: JobStore | undefined): void {
  injected = store;
}

function store(): JobStore {
  if (!injected) injected = new JobStore();
  return injected;
}

/** Status values a caller may use as a `list_jobs` filter. */
const STATUS_VALUES = ["queued", "running", "succeeded", "cancelled"] as const;

const startJob = defineTool({
  name: "start_job",
  title: "Start a background job",
  description:
    "Start a simulated long-running job and return its id straight away, without waiting for it to finish. " +
    "Use this when work may take longer than a single quick call and you want to kick it off and poll for the " +
    "result later — the async pattern. After calling this, poll get_job_status with the returned job_id until " +
    "status is \"succeeded\", or call cancel_job to stop it. " +
    "It does not block until the job completes and does not return the final result itself; for the outcome you " +
    "must poll get_job_status instead. Each call starts a brand-new job, so it is not idempotent. " +
    'Example: start_job({ "label": "nightly export", "duration_ms": 3000 }).',
  inputSchema: {
    label: z
      .string()
      .min(1)
      .describe('Human-readable label for the job, e.g. "nightly export". Echoed back in status and result.'),
    duration_ms: z
      .number()
      .int()
      .min(0)
      .max(600000)
      .describe("How long the job should take, in milliseconds (0–600000). Use 0 to complete immediately. Defaults to 3000.")
      .default(3000),
  },
  outputSchema: {
    job_id: z.string().describe("Opaque id of the started job; pass it to get_job_status or cancel_job."),
    status: z.string().describe('Initial status, usually "queued" (or "succeeded" if duration_ms was 0).'),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: false },
  examples: [
    { description: "Start a 3-second job.", arguments: { label: "nightly export", duration_ms: 3000 } },
    { description: "Start a job that completes immediately.", arguments: { label: "quick task", duration_ms: 0 } },
  ],
  handler: (args) => {
    const job = store().start(args.label, args.duration_ms);
    return toolResult(`Started job ${job.job_id} ("${job.label}") — status ${job.status}.`, {
      job_id: job.job_id,
      status: job.status,
    });
  },
});

const getJobStatus = defineTool({
  name: "get_job_status",
  title: "Get job status",
  description:
    "Read the current status and progress of a job started by start_job. " +
    "Use this when you are polling a previously started job: call it repeatedly until status becomes " +
    "\"succeeded\" (the result field is then populated) or \"cancelled\". Progress is a 0..1 fraction you can " +
    "surface to the user while waiting. " +
    "It does not start, wait for, or cancel work, and it does not block — each call returns an instantaneous " +
    "snapshot; use start_job to begin a job and cancel_job to stop one. An unknown job_id is an error. " +
    'Example: get_job_status({ "job_id": "job_1" }).',
  inputSchema: {
    job_id: z.string().min(1).describe('The id returned by start_job, e.g. "job_1". Identifies which job to read.'),
  },
  outputSchema: {
    job_id: z.string().describe("The job that was queried."),
    status: z.string().describe('One of "queued", "running", "succeeded", "cancelled".'),
    progress: z.number().describe("Completion fraction from 0 to 1."),
    label: z.string().describe("The label the job was started with."),
    result: z
      .object({ message: z.string() })
      .optional()
      .describe("The job's result, present only once status is \"succeeded\"."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  examples: [{ description: "Poll a job by id.", arguments: { job_id: "job_1" } }],
  handler: (args) => {
    const job = store().get(args.job_id);
    if (!job) throw notFound(`No job with id "${args.job_id}".`, { job_id: args.job_id });
    return toolResult(
      `Job ${job.job_id} is ${job.status} (${Math.round(job.progress * 100)}%).`,
      job,
    );
  },
});

const cancelJob = defineTool({
  name: "cancel_job",
  title: "Cancel a job",
  description:
    "Cancel a job that is still queued or running, started by start_job. " +
    "Use this when you want to stop work you no longer need before it finishes. Cancelling an already-finished " +
    "job is a harmless no-op that returns its final status. " +
    "It does not start jobs and does not delete history or undo a job that has already succeeded; use start_job " +
    "to begin work and get_job_status to inspect it. An unknown job_id is an error. " +
    'Example: cancel_job({ "job_id": "job_1" }).',
  inputSchema: {
    job_id: z.string().min(1).describe('The id of the job to cancel, as returned by start_job, e.g. "job_1".'),
  },
  outputSchema: {
    job_id: z.string().describe("The job that was targeted."),
    status: z.string().describe('Status after the attempt — "cancelled" if it was stopped, otherwise unchanged.'),
    progress: z.number().describe("Completion fraction from 0 to 1 at the time of cancellation."),
    label: z.string().describe("The label the job was started with."),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: true },
  examples: [{ description: "Cancel a running job.", arguments: { job_id: "job_1" } }],
  handler: (args) => {
    const job = store().cancel(args.job_id);
    if (!job) throw notFound(`No job with id "${args.job_id}".`, { job_id: args.job_id });
    return toolResult(`Job ${job.job_id} is now ${job.status}.`, {
      job_id: job.job_id,
      status: job.status,
      progress: job.progress,
      label: job.label,
    });
  },
});

const listJobs = defineTool({
  name: "list_jobs",
  title: "List jobs",
  description:
    "List all jobs started this session, newest first, optionally filtered by status. " +
    "Use this when you want an overview of background work — for example to find a job id you forgot, or to see " +
    "which jobs are still running. " +
    "It returns only lightweight summaries (id, status, progress, label), not full results, and it does not " +
    "start or cancel anything; use get_job_status for one job's result and start_job to create work. " +
    'Example: list_jobs({ "status": "running" }).',
  inputSchema: {
    status: z
      .enum(STATUS_VALUES)
      .optional()
      .describe('Optional status filter; one of "queued", "running", "succeeded", "cancelled". Omit for all jobs.'),
  },
  outputSchema: {
    count: z.number().describe("Number of jobs returned."),
    jobs: z
      .array(
        z.object({
          job_id: z.string(),
          status: z.string(),
          progress: z.number(),
          label: z.string(),
        }),
      )
      .describe("Job summaries, newest first."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  examples: [
    { description: "List every job.", arguments: {} },
    { description: "List only running jobs.", arguments: { status: "running" } },
  ],
  handler: (args) => {
    const jobs = store().list(args.status);
    return toolResult(`${jobs.length} job(s).`, { count: jobs.length, jobs });
  },
});

export const tools: AnyToolSpec[] = [startJob, getJobStatus, cancelJob, listJobs];
