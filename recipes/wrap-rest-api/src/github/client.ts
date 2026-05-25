/**
 * A thin typed client for the public GitHub REST API, built on {@link RestClient}.
 *
 * GitHub is the recipe's public-endpoint example: it works with no auth at all
 * (60 requests/hour/IP), and an *optional* token — read from `GITHUB_TOKEN` in
 * the environment, never from a tool argument — raises the limit to 5,000/hour.
 * That is the auth-at-transport pattern in miniature.
 */
import { RestClient, type FetchLike } from "../rest-client.js";

export interface GitHubClientOptions {
  token?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface RepoSummary {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  defaultBranch: string;
  topics: string[];
  htmlUrl: string;
  pushedAt: string;
}

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  author: string | null;
  comments: number;
  createdAt: string;
  htmlUrl: string;
  isPullRequest: boolean;
}

export interface ListIssuesOptions {
  state?: "open" | "closed" | "all";
  perPage?: number;
  page?: number;
}

interface RawRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  default_branch: string;
  topics?: string[];
  html_url: string;
  pushed_at: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: string;
  user: { login: string } | null;
  comments: number;
  created_at: string;
  html_url: string;
  pull_request?: unknown;
}

const seg = (value: string): string => encodeURIComponent(value);

export class GitHubClient {
  private readonly rest: RestClient;

  constructor(options: GitHubClientOptions = {}) {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mcp-kit-recipe-rest",
    };
    const restOptions: ConstructorParameters<typeof RestClient>[0] = {
      baseUrl: options.baseUrl ?? "https://api.github.com",
      headers,
    };
    if (options.token) restOptions.bearerToken = options.token;
    if (options.fetchImpl) restOptions.fetchImpl = options.fetchImpl;
    this.rest = new RestClient(restOptions);
  }

  async getRepository(owner: string, repo: string): Promise<RepoSummary> {
    const raw = await this.rest.request<RawRepo>("GET", `/repos/${seg(owner)}/${seg(repo)}`);
    return {
      fullName: raw.full_name,
      description: raw.description,
      stars: raw.stargazers_count,
      forks: raw.forks_count,
      openIssues: raw.open_issues_count,
      language: raw.language,
      defaultBranch: raw.default_branch,
      topics: raw.topics ?? [],
      htmlUrl: raw.html_url,
      pushedAt: raw.pushed_at,
    };
  }

  async listIssues(owner: string, repo: string, options: ListIssuesOptions = {}): Promise<IssueSummary[]> {
    const raw = await this.rest.request<RawIssue[]>("GET", `/repos/${seg(owner)}/${seg(repo)}/issues`, {
      query: {
        state: options.state ?? "open",
        per_page: options.perPage ?? 30,
        page: options.page ?? 1,
      },
    });
    return raw.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user?.login ?? null,
      comments: issue.comments,
      createdAt: issue.created_at,
      htmlUrl: issue.html_url,
      isPullRequest: Boolean(issue.pull_request),
    }));
  }
}
