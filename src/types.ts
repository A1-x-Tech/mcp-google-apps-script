/**
 * The server talks to the Google Apps Script API v1
 * (https://script.googleapis.com, REST over JSON). Auth is Google OAuth 2.0:
 * a Bearer access token, minted on demand from a refresh token via
 * https://oauth2.googleapis.com/token (or a static short-lived access token,
 * mostly for testing).
 */

/**
 * Normalized script file types accepted by update_project_content; the client
 * maps them to the API's wire File.type enum (SERVER_JS, HTML, JSON). The
 * "json" type exists only for the appsscript manifest — every project must
 * carry exactly one manifest file named "appsscript".
 */
export type ScriptFileType = "server_js" | "html" | "json";

/** Metrics granularity, normalized; mapped to DAILY / WEEKLY by the client. */
export type MetricsGranularity = "daily" | "weekly";

/**
 * Process states (API wire values, passed through). FAILED and TIMED_OUT are
 * the ones to filter on when hunting execution errors.
 */
export type ProcessStatus =
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED"
  | "TIMED_OUT"
  | "UNKNOWN"
  | "DELAYED";

/** Process types (API wire values, passed through). */
export type ProcessType =
  | "ADD_ON"
  | "EXECUTION_API"
  | "TIME_DRIVEN"
  | "TRIGGER"
  | "WEBAPP"
  | "EDITOR"
  | "SIMPLE_TRIGGER"
  | "MENU"
  | "BATCH_TASK";

export interface GoogleAppsScriptConfig {
  /** OAuth2 client id (refresh flow). */
  clientId?: string;
  /** OAuth2 client secret (refresh flow). Treated as a secret. */
  clientSecret?: string;
  /** OAuth2 refresh token, exchanged for access tokens. Treated as a secret. */
  refreshToken?: string;
  /** Static access token (short-lived, ~1h). Used only when the refresh triple is absent. Treated as a secret. */
  accessToken?: string;
  /** API root. Defaults to https://script.googleapis.com. */
  apiBase: string;
  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number;
  /** Max retries for transient errors (429 always; 5xx/network for reads). Defaults to 3. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled each retry. Defaults to 500. */
  retryBaseMs?: number;
}

/**
 * Google APIs report failures as a non-2xx HTTP status with a JSON envelope
 * ({ error: { code, message, status, details } }); the OAuth token endpoint
 * uses { error, error_description }. The parsed body is kept alongside the
 * status and a short readable message is derived.
 */
export class GoogleAppsScriptError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${formatErrorBody(body)}`);
    this.name = "GoogleAppsScriptError";
    this.status = status;
    this.body = body;
  }
}

/** Turns a parsed Google API error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);
  const obj = body as Record<string, unknown>;

  // OAuth token endpoint style: { error: "invalid_grant", error_description: "..." }
  if (typeof obj.error === "string") {
    const description = typeof obj.error_description === "string" ? `: ${obj.error_description}` : "";
    return `${obj.error}${description}`.slice(0, 500);
  }

  // Google API envelope: { error: { code, message, status, details } }
  const err = (typeof obj.error === "object" && obj.error !== null ? obj.error : obj) as Record<string, unknown>;
  if (typeof err.message === "string") {
    const status = typeof err.status === "string" ? `[${err.status}] ` : "";
    return `${status}${err.message}`.slice(0, 500);
  }

  return JSON.stringify(obj).slice(0, 500);
}
