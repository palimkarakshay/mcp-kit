/**
 * In-memory job store — the engine behind the async + polling recipe.
 *
 * A "job" is started once and then progresses over wall-clock time. Status is
 * *computed* from how long the job has been running (rather than mutated by a
 * background worker), so the store stays a plain `Map` with no timers and no
 * shared async state. `cancel` is the only explicit state transition.
 *
 * The clock is injectable (`now`) so tests can assert the full lifecycle —
 * queued → running → succeeded — without sleeping. A `duration_ms` of `0`
 * completes a job immediately, which keeps the happy-path test deterministic.
 */

/** Lifecycle states a job can be observed in. */
export type JobStatus = "queued" | "running" | "succeeded" | "cancelled";

/** A function returning "now" in epoch milliseconds. Injectable for tests. */
export type Clock = () => number;

/** The simulated result a succeeded job produces. */
export interface JobResult {
  message: string;
}

/** A point-in-time view of a job, as returned to callers. */
export interface JobView {
  job_id: string;
  status: JobStatus;
  /** Completion fraction in the range 0..1. */
  progress: number;
  label: string;
  /** Present only once the job has succeeded. */
  result?: JobResult;
}

/** A compact job summary used by `list_jobs`. */
export interface JobSummary {
  job_id: string;
  status: JobStatus;
  progress: number;
  label: string;
}

interface JobRecord {
  id: string;
  label: string;
  startedAt: number;
  durationMs: number;
  cancelled: boolean;
}

/** A tiny share of the lifecycle that is genuinely queued before running. */
const QUEUE_FRACTION = 0.1;

/**
 * Holds jobs for the lifetime of the process. A single instance is shared by
 * the tool handlers; tests construct their own with a fake clock.
 */
export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private seq = 0;
  private readonly now: Clock;

  constructor(now: Clock = Date.now) {
    this.now = now;
  }

  /** Start a new job and return its initial, computed view. */
  start(label: string, durationMs: number): JobView {
    this.seq += 1;
    const id = `job_${this.seq}`;
    const record: JobRecord = {
      id,
      label,
      startedAt: this.now(),
      durationMs,
      cancelled: false,
    };
    this.jobs.set(id, record);
    return this.view(record);
  }

  /** Look up a job's current view, or `undefined` if the id is unknown. */
  get(id: string): JobView | undefined {
    const record = this.jobs.get(id);
    return record ? this.view(record) : undefined;
  }

  /**
   * Cancel a job. Returns the updated view, `undefined` if unknown, or the
   * unchanged view if the job had already finished (a no-op, not an error).
   */
  cancel(id: string): JobView | undefined {
    const record = this.jobs.get(id);
    if (!record) return undefined;
    const status = this.computeStatus(record);
    if (status === "running" || status === "queued") {
      record.cancelled = true;
    }
    return this.view(record);
  }

  /** List all jobs, newest first, optionally filtered by status. */
  list(status?: JobStatus): JobSummary[] {
    const summaries: JobSummary[] = [];
    for (const record of this.jobs.values()) {
      const view = this.view(record);
      if (status && view.status !== status) continue;
      summaries.push({
        job_id: view.job_id,
        status: view.status,
        progress: view.progress,
        label: view.label,
      });
    }
    // Newest first: ids are monotonically increasing `job_<n>`.
    summaries.reverse();
    return summaries;
  }

  private computeStatus(record: JobRecord): JobStatus {
    if (record.cancelled) return "cancelled";
    const elapsed = this.now() - record.startedAt;
    if (record.durationMs <= 0 || elapsed >= record.durationMs) return "succeeded";
    if (elapsed <= record.durationMs * QUEUE_FRACTION) return "queued";
    return "running";
  }

  private computeProgress(record: JobRecord, status: JobStatus): number {
    if (status === "succeeded") return 1;
    if (record.durationMs <= 0) return 1;
    const elapsed = this.now() - record.startedAt;
    const fraction = elapsed / record.durationMs;
    return Math.max(0, Math.min(1, fraction));
  }

  private view(record: JobRecord): JobView {
    const status = this.computeStatus(record);
    const progress = this.computeProgress(record, status);
    const view: JobView = {
      job_id: record.id,
      status,
      progress,
      label: record.label,
    };
    if (status === "succeeded") {
      view.result = { message: `processed ${record.label}` };
    }
    return view;
  }
}
