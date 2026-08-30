import type {
  GoogleAppsScriptConfig,
  MetricsGranularity,
  ProcessStatus,
  ProcessType,
  ScriptFileType,
} from "./types.js";
import { GoogleAppsScriptError } from "./types.js";
import { CredentialsError } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/** Google's OAuth2 token endpoint — refresh tokens are exchanged here. */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The manifest every Apps Script project must carry: a JSON file named "appsscript". */
export const MANIFEST_FILE_NAME = "appsscript";

/** A normalized script file as accepted by update_project_content. */
export interface ScriptFileInput {
  /** File name WITHOUT extension (the API's contract): "Code", not "Code.gs". */
  name: string;
  type: ScriptFileType;
  source: string;
}

/** Normalized inputs for update_project_content (replace and merge modes). */
export interface UpdateContentParams {
  scriptId: string;
  files: ScriptFileInput[];
  /** merge mode only: file names to remove from the project. */
  deleteFiles?: string[];
}

/** Normalized inputs for run_function. */
export interface RunFunctionParams {
  scriptId: string;
  functionName: string;
  /** Positional arguments; must be JSON-serializable primitives/arrays/objects. */
  parameters?: unknown[];
  /** Run the latest saved code instead of a deployed version (owner only). */
  devMode?: boolean;
}

/** Normalized inputs for list_processes. */
export interface ListProcessesParams {
  /** With a scriptId the script-scoped endpoint is used; without it, the caller's own processes. */
  scriptId?: string;
  functionName?: string;
  deploymentId?: string;
  statuses?: ProcessStatus[];
  types?: ProcessType[];
  /** RFC3339 UTC timestamps bounding the process start time. */
  startTime?: string;
  endTime?: string;
  pageSize?: number;
  pageToken?: string;
}

/** Maps a normalized file type to the API's wire File.type value. */
function mapFileType(type: ScriptFileType): string {
  return { server_js: "SERVER_JS", html: "HTML", json: "JSON" }[type];
}

/** Maps normalized metrics granularity to the API's wire value. */
function mapGranularity(granularity: MetricsGranularity): string {
  return { daily: "DAILY", weekly: "WEEKLY" }[granularity];
}

/** Builds the wire File objects for updateContent from the normalized inputs. */
export function buildScriptFiles(files: ScriptFileInput[]): Record<string, unknown>[] {
  return files.map((f) => ({ name: f.name, type: mapFileType(f.type), source: f.source }));
}

/**
 * Normalizes the Operation returned by scripts.run. A script that throws still
 * comes back as HTTP 200 with `error.details[0]` carrying the ExecutionError —
 * surfacing it as structured data (message, type, script stack trace) instead
 * of throwing keeps the stack trace readable for the calling model.
 */
export function normalizeRunOperation(op: unknown): Record<string, unknown> {
  const o = (op ?? {}) as {
    done?: boolean;
    response?: Record<string, unknown>;
    error?: { message?: string; details?: unknown[] };
  };
  if (o.error) {
    const detail = (o.error.details?.[0] ?? {}) as {
      errorMessage?: string;
      errorType?: string;
      scriptStackTraceElements?: unknown;
    };
    return {
      done: o.done ?? true,
      script_error: compact({
        type: detail.errorType,
        message: detail.errorMessage ?? o.error.message,
        stack: detail.scriptStackTraceElements,
      }),
    };
  }
  // A void function has no `result` key; null keeps the shape explicit.
  return { done: o.done ?? true, result: o.response && "result" in o.response ? o.response.result : null };
}

export class GoogleAppsScriptClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  /** Cached access token from the refresh flow, with its expiry. */
  private cachedToken?: { value: string; expiresAt: number };
  /** In-flight refresh, deduping concurrent token requests. */
  private refreshInFlight?: Promise<string>;

  constructor(private readonly config: GoogleAppsScriptConfig) {
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  private canRefresh(): boolean {
    return Boolean(this.config.refreshToken && this.config.clientId && this.config.clientSecret);
  }

  /**
   * Returns a valid Bearer token. With the refresh triple configured, mints an
   * access token from the refresh token and caches it until shortly before it
   * expires (concurrent callers share one in-flight refresh); otherwise the
   * static GOOGLE_APPS_SCRIPT_ACCESS_TOKEN is used as-is. With neither
   * configured, throws {@link CredentialsError} BEFORE any fetch — a missing
   * setup must never enter the retry/backoff loop or trigger the 401 re-mint,
   * because no amount of retrying mints credentials.
   */
  private async accessToken(forceRefresh = false): Promise<string> {
    if (!this.canRefresh()) {
      if (!this.config.accessToken) throw new CredentialsError();
      return this.config.accessToken;
    }
    if (!forceRefresh && this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.value;
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshAccessToken().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  /** Exchanges the refresh token for a fresh access token at Google's token endpoint. */
  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId as string,
      client_secret: this.config.clientSecret as string,
      refresh_token: this.config.refreshToken as string,
      grant_type: "refresh_token",
    }).toString();

    const { res, text } = await this.fetchWithTimeout(
      TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      "oauth2 token refresh",
    );

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) throw new GoogleAppsScriptError(res.status, data);

    const token = (data as { access_token?: unknown }).access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("OAuth2 token endpoint returned no access_token.");
    }
    const expiresIn = Number((data as { expires_in?: unknown }).expires_in);
    const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    // Refresh 60s ahead of the real expiry so requests never race a dying token.
    this.cachedToken = { value: token, expiresAt: Date.now() + Math.max(ttl - 60, 30) * 1000 };
    return token;
  }

  /** Verifies the OAuth credentials by minting a fresh access token (refresh flow only). */
  async authCheck(): Promise<unknown> {
    if (!this.canRefresh()) {
      throw new Error(
        "authCheck needs the refresh flow (GOOGLE_APPS_SCRIPT_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN); with a static GOOGLE_APPS_SCRIPT_ACCESS_TOKEN fetch a project instead.",
      );
    }
    await this.accessToken(true);
    return { ok: true, auth: "refresh_token" };
  }

  /** Backoff before a retry: honors Retry-After when present, else exponential (capped at 30s). */
  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res ? Number(res.headers.get("Retry-After")) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 30) * 1000;
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /**
   * fetch with an AbortController timeout. Reads the response body inside the
   * guarded zone so the timeout also covers a slow or drip-feeding body, not
   * just the initial headers, and returns the text alongside the response.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<{ res: Response; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      return { res, text };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Low-level request to a Google Apps Script API path (e.g. "v1/projects/abc").
   * Auth is a Bearer token (refreshed transparently; a 401 forces one re-mint +
   * retry). 429 is always retried with backoff; 5xx and network errors/timeouts
   * are retried only for GET — the Apps Script API has real writes (updating a
   * project's whole file set, creating versions/deployments, running functions),
   * and replaying one after an ambiguous failure could execute it twice. Any
   * other non-2xx throws a {@link GoogleAppsScriptError}.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<T> {
    // Guard method !== "GET" keeps undici from crashing on a GET-with-body.
    const hasBody = body !== undefined && method !== "GET";

    // Resolve the path against the API base, then reject anything that escaped
    // to a foreign origin (an absolute "https://evil/x" or a "\\evil/x" slipped
    // through raw_request) so the Bearer token can never leak to another host.
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (url.origin !== new URL(this.base).origin) {
      throw new Error(`raw_request path must be a relative API path (resolved to foreign origin ${url.origin})`);
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        // Repeated params (statuses, types) are appended, not overwritten.
        if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
        else url.searchParams.set(key, String(value));
      }
    }
    const target = url.toString();

    // Writes must not be replayed on ambiguous failures (see the retry gate below).
    const idempotent = method === "GET";
    let refreshedOn401 = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (hasBody) headers["Content-Type"] = "application/json";

      let res: Response;
      let text: string;
      try {
        ({ res, text } = await this.fetchWithTimeout(
          target,
          { method, headers, body: hasBody ? JSON.stringify(body) : undefined },
          path,
        ));
      } catch (err) {
        // Network error or timeout: the request may or may not have reached the
        // API, so only reads are retried; writes rethrow immediately.
        if (idempotent && attempt < this.maxRetries) {
          await delay(this.backoffMs(attempt));
          continue;
        }
        throw err;
      }

      // An expired/revoked access token: re-mint once and replay. The request
      // never executed, so this is safe for writes too.
      if (res.status === 401 && this.canRefresh() && !refreshedOn401) {
        refreshedOn401 = true;
        await this.accessToken(true);
        continue;
      }

      // 429 means the request was rejected before executing — safe to retry for
      // any method. 5xx is ambiguous (the write may have committed), so it is
      // gated to idempotent requests.
      const transient = res.status === 429 || (idempotent && res.status >= 500 && res.status < 600);
      if (transient && attempt < this.maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) throw new GoogleAppsScriptError(res.status, data);
      return data as T;
    }
  }

  // ---- Projects ----

  /**
   * Creates a script project. Without parentId the project is standalone (its
   * scriptId doubles as the Drive file id); with parentId (the Drive id of a
   * Doc, Sheet, Slide or Form) the project is bound to that container. The API
   * cannot list or delete projects — keep the returned scriptId.
   */
  async createProject(p: { title: string; parentId?: string }): Promise<unknown> {
    return this.request("POST", "v1/projects", compact({ title: p.title, parentId: p.parentId }));
  }

  /** Project metadata: title, parentId, creator, create/update times — no code. */
  async getProject(scriptId: string): Promise<unknown> {
    return this.request("GET", `v1/projects/${encodeURIComponent(scriptId)}`);
  }

  /**
   * The project's full file set (name, type, source). With versionNumber the
   * content of that immutable version is returned instead of HEAD.
   */
  async getProjectContent(scriptId: string, versionNumber?: number): Promise<unknown> {
    return this.request(
      "GET",
      `v1/projects/${encodeURIComponent(scriptId)}/content`,
      undefined,
      compact({ versionNumber }),
    );
  }

  /**
   * Replaces the ENTIRE file set (the API's only write for content). The
   * manifest must be part of the new set — a replace without it would brick
   * the project, so it is rejected here before any network traffic.
   */
  async replaceProjectContent(p: UpdateContentParams): Promise<unknown> {
    if (!p.files.some((f) => f.name === MANIFEST_FILE_NAME)) {
      throw new Error(
        `mode "replace" overwrites the whole project, so files must include the "${MANIFEST_FILE_NAME}" manifest ` +
          '(type "json") — fetch the current one with get_project_content, or use mode "merge" to keep files you do not send.',
      );
    }
    return this.request("PUT", `v1/projects/${encodeURIComponent(p.scriptId)}/content`, {
      files: buildScriptFiles(p.files),
    });
  }

  /**
   * Merge semantics on top of the API's replace-only write: reads the current
   * content, upserts the given files by name, drops deleteFiles, and PUTs the
   * merged set back. Files not named are preserved verbatim (their wire type
   * is kept as returned by the API). Not atomic — a concurrent editor's change
   * between the read and the write is overwritten.
   */
  async mergeProjectContent(p: UpdateContentParams): Promise<unknown> {
    const current = (await this.getProjectContent(p.scriptId)) as {
      files?: { name?: string; type?: string; source?: string }[];
    };
    const merged = new Map<string, Record<string, unknown>>();
    for (const f of current.files ?? []) {
      if (typeof f.name !== "string") continue;
      merged.set(f.name, { name: f.name, type: f.type, source: f.source });
    }
    for (const name of p.deleteFiles ?? []) {
      if (name === MANIFEST_FILE_NAME) {
        throw new Error(`The "${MANIFEST_FILE_NAME}" manifest cannot be deleted — every project must keep it.`);
      }
      if (!merged.delete(name)) {
        throw new Error(`Cannot delete "${name}": the project has no file with that name (names have no extension).`);
      }
    }
    for (const file of buildScriptFiles(p.files)) {
      merged.set(file.name as string, file);
    }
    return this.request("PUT", `v1/projects/${encodeURIComponent(p.scriptId)}/content`, {
      files: [...merged.values()],
    });
  }

  /** Execution metrics (active users, total/failed executions) per day or week. */
  async getProjectMetrics(p: {
    scriptId: string;
    granularity: MetricsGranularity;
    deploymentId?: string;
  }): Promise<unknown> {
    return this.request(
      "GET",
      `v1/projects/${encodeURIComponent(p.scriptId)}/metrics`,
      undefined,
      compact({
        metricsGranularity: mapGranularity(p.granularity),
        "metricsFilter.deploymentId": p.deploymentId,
      }),
    );
  }

  // ---- Versions (immutable snapshots; no update or delete in the API) ----

  /** Snapshots HEAD as a new immutable version. */
  async createVersion(p: { scriptId: string; description?: string }): Promise<unknown> {
    return this.request(
      "POST",
      `v1/projects/${encodeURIComponent(p.scriptId)}/versions`,
      compact({ description: p.description }),
    );
  }

  /** Lists the project's versions (newest first). */
  async listVersions(p: { scriptId: string; pageSize?: number; pageToken?: string }): Promise<unknown> {
    return this.request(
      "GET",
      `v1/projects/${encodeURIComponent(p.scriptId)}/versions`,
      undefined,
      compact({ pageSize: p.pageSize, pageToken: p.pageToken }),
    );
  }

  /** One version by its number. */
  async getVersion(scriptId: string, versionNumber: number): Promise<unknown> {
    return this.request(
      "GET",
      `v1/projects/${encodeURIComponent(scriptId)}/versions/${versionNumber}`,
    );
  }

  // ---- Deployments ----

  /** Deploys a version (omitting versionNumber deploys HEAD). */
  async createDeployment(p: {
    scriptId: string;
    versionNumber?: number;
    description?: string;
    manifestFileName?: string;
  }): Promise<unknown> {
    return this.request(
      "POST",
      `v1/projects/${encodeURIComponent(p.scriptId)}/deployments`,
      compact({
        scriptId: p.scriptId,
        versionNumber: p.versionNumber,
        description: p.description,
        manifestFileName: p.manifestFileName ?? MANIFEST_FILE_NAME,
      }),
    );
  }

  /** Lists the project's deployments, including the automatic HEAD deployment. */
  async listDeployments(p: { scriptId: string; pageSize?: number; pageToken?: string }): Promise<unknown> {
    return this.request(
      "GET",
      `v1/projects/${encodeURIComponent(p.scriptId)}/deployments`,
      undefined,
      compact({ pageSize: p.pageSize, pageToken: p.pageToken }),
    );
  }

  /** One deployment: config plus entry points (web app URL, API executable, add-on). */
  async getDeployment(scriptId: string, deploymentId: string): Promise<unknown> {
    return this.request(
      "GET",
      `v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,
    );
  }

  /**
   * Repoints a deployment at another version and/or changes its description.
   *
   * deployments.update is a PUT that REPLACES the whole deploymentConfig — a
   * partial body silently resets whatever it omits: no versionNumber turns the
   * deployment into a HEAD one (a production URL starts running unsaved code),
   * no description erases the existing description. So this reads the current
   * config first and merges the changes on top — the same read-merge-write
   * shape as mergeProjectContent().
   */
  async updateDeployment(p: {
    scriptId: string;
    deploymentId: string;
    versionNumber?: number;
    description?: string;
    manifestFileName?: string;
  }): Promise<unknown> {
    const current = (await this.getDeployment(p.scriptId, p.deploymentId)) as {
      deploymentConfig?: { versionNumber?: number; description?: string; manifestFileName?: string };
    };
    const base = current?.deploymentConfig ?? {};
    return this.request(
      "PUT",
      `v1/projects/${encodeURIComponent(p.scriptId)}/deployments/${encodeURIComponent(p.deploymentId)}`,
      {
        deploymentConfig: compact({
          scriptId: p.scriptId,
          versionNumber: p.versionNumber ?? base.versionNumber,
          description: p.description ?? base.description,
          manifestFileName: p.manifestFileName ?? base.manifestFileName ?? MANIFEST_FILE_NAME,
        }),
      },
    );
  }

  /** Deletes a deployment (the HEAD deployment cannot be deleted). */
  async deleteDeployment(scriptId: string, deploymentId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,
    );
  }

  // ---- Execution ----

  /**
   * Runs a function through scripts.run and normalizes the Operation: a script
   * throw comes back as HTTP 200 with the ExecutionError in error.details, so
   * it is surfaced as { script_error: { type, message, stack } } instead of an
   * exception. Requires an API-executable deployment and an OAuth token from
   * the SAME Cloud project as the script, carrying the script's own scopes.
   */
  async runFunction(p: RunFunctionParams): Promise<unknown> {
    const op = await this.request(
      "POST",
      `v1/scripts/${encodeURIComponent(p.scriptId)}:run`,
      compact({ function: p.functionName, parameters: p.parameters, devMode: p.devMode }),
    );
    return normalizeRunOperation(op);
  }

  // ---- Processes (execution history; read-only) ----

  /**
   * Lists execution processes. With scriptId the script-scoped endpoint
   * (processes:listScriptProcesses) is used; without it, the caller's own
   * processes across all scripts. Filters map to the corresponding
   * userProcessFilter.* / scriptProcessFilter.* query params.
   */
  async listProcesses(p: ListProcessesParams): Promise<unknown> {
    const scoped = p.scriptId !== undefined;
    const prefix = scoped ? "scriptProcessFilter" : "userProcessFilter";
    const query = compact({
      scriptId: scoped ? p.scriptId : undefined,
      [`${prefix}.functionName`]: p.functionName,
      [`${prefix}.deploymentId`]: p.deploymentId,
      [`${prefix}.statuses`]: p.statuses,
      [`${prefix}.types`]: p.types,
      [`${prefix}.startTime`]: p.startTime,
      [`${prefix}.endTime`]: p.endTime,
      pageSize: p.pageSize,
      pageToken: p.pageToken,
    });
    return this.request("GET", scoped ? "v1/processes:listScriptProcesses" : "v1/processes", undefined, query);
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
