# Tools

For task-oriented guidance, open the [MCP capability catalog](./capabilities/index.md). This page remains the technical reference for schemas and API responses.

The Google Apps Script API mixes reads and writes, so every tool carries
explicit MCP annotations: reads are `readOnlyHint`, updates are
idempotent-but-overwriting, deletes and arbitrary code execution are
destructive. Inputs use a normalized snake_case vocabulary; the client maps
them to the API's wire values (`SERVER_JS` / `HTML` / `JSON`, `DAILY` /
`WEEKLY`, `userProcessFilter.*` / `scriptProcessFilter.*`) and handles OAuth
entirely on its own.

`script_id` is the project id from the Apps Script editor URL
(`script.google.com/home/projects/<scriptId>/edit`) or from `create_project`
output. For standalone projects it doubles as the Drive file id.

## Projects

| Tool | Description |
|---|---|
| `create_project` | Creates a project: standalone (no `parent_id`) or bound to a Doc/Sheet/Slides/Form (`parent_id` = Drive file id). Returns `scriptId` — **keep it: the API cannot list projects**. A new project holds only a default manifest and an empty code file. |
| `get_project` | Metadata only: title, `parentId` (bound projects), creator, `createTime`/`updateTime`. No code. |
| `get_project_content` | The full file set: `files[]` with `name` (no extension), `type` (`SERVER_JS`/`HTML`/`JSON`), `source`. `version_number` reads an immutable version instead of HEAD. |
| `update_project_content` | Writes HEAD. `mode: "merge"` (default) reads current content, upserts the given files by name, removes `delete_files`, keeps the rest — not atomic. `mode: "replace"` makes the given files the ENTIRE project and requires the `appsscript` manifest in the list (guarded before any network traffic). The manifest can never be deleted. |
| `get_project_metrics` | `activeUsers` / `totalExecutions` / `failedExecutions` time series; `granularity` `daily` (last 7 days) or `weekly`; optional `deployment_id` filter. |

## Versions

| Tool | Description |
|---|---|
| `create_version` | Snapshots HEAD as a new **immutable** version (no edit, no delete; numbers only grow). Every call creates a new version — check `list_versions` after an ambiguous failure instead of re-sending. |
| `list_versions` | Version metadata, newest first; `page_size` ≤ 50, paginate via `page_token`. |
| `get_version` | One version's metadata by number. Its code: `get_project_content` with `version_number`. |

## Deployments

| Tool | Description |
|---|---|
| `manage_deployments` | `action`: `create` (deploys `version_number`, or HEAD when omitted), `list`, `get` (needs `deployment_id`; returns `entryPoints[]` — web app URL, API-executable config), `update` (repoints at another version — ship/rollback without changing the URL), `delete` (permanent; breaks the URL; the automatic @HEAD deployment cannot be deleted). What a deployment exposes comes from the `appsscript` manifest at the deployed version. |

## Execution

| Tool | Description |
|---|---|
| `run_function` | `POST scripts/<id>:run`. Success → `{ done, result }` (`null` for void); a script throw → `{ done, script_error: { type, message, stack } }` — HTTP 200 on the wire, surfaced as data so the model can read the stack. Prerequisites: API-executable deployment; OAuth client from the **same Cloud project** as the script; token carries the script's own scopes. `dev_mode` runs HEAD (owner only). 6-minute Apps Script execution limit. |

## Processes (read-only)

| Tool | Description |
|---|---|
| `list_processes` | Execution history. With `script_id` → `processes:listScriptProcesses` (`scriptProcessFilter.*`); without → `processes` (`userProcessFilter.*`, the caller's own executions). Filters: `function_name`, `deployment_id`, `statuses[]`, `types[]`, `start_time`/`end_time` (RFC3339). **No error messages** — only status/timing; messages live in Cloud Logging or come from re-running via `run_function`. |

## Setup

| Tool | Description |
|---|---|
| `setup_instructions` | Static structured guidance: the per-account Apps Script API toggle, Cloud-project enablement, scope → tools map, `run_function` prerequisites, known API limits. Works without credentials; makes no API call. |

## Escape hatch

| Tool | Description |
|---|---|
| `raw_request` | Calls any Apps Script API v1 path directly (`GET`/`POST`/`PUT`/`DELETE`, default GET); the path may carry a query string with repeated params. A path resolving to a foreign origin is rejected (SSRF guard), so the Bearer token never leaves `script.googleapis.com`. |

## Notes

- **Retry policy:** 429 is retried with backoff for every method (the request was rejected
  before executing); 5xx and network errors are retried **only for GET** — replaying a write
  after an ambiguous failure could duplicate it (a second version, a second deployment, a
  second function execution).
- **OAuth:** access tokens are minted from the refresh token automatically, cached until ~60s
  before expiry, and re-minted once on a 401.
- **File names have no extension** (`Code`, not `Code.gs`); the `type` field decides the
  extension. Every project must keep the `appsscript` manifest (type `JSON`).
- **No project list, no project delete.** Track scriptIds yourself; deleting a project means
  deleting its Drive file, which this server does not expose.

## OAuth scopes (minimal per operation)

| Scope | Needed by |
|---|---|
| `https://www.googleapis.com/auth/script.projects` | create_project, get_project, get_project_content, update_project_content, create_version, get_version, list_versions |
| `https://www.googleapis.com/auth/script.projects.readonly` | read-only alternative for get/list of projects & versions |
| `https://www.googleapis.com/auth/script.deployments` | manage_deployments (create/update/delete) |
| `https://www.googleapis.com/auth/script.deployments.readonly` | manage_deployments (list/get) |
| `https://www.googleapis.com/auth/script.processes` | list_processes |
| `https://www.googleapis.com/auth/script.metrics` | get_project_metrics |
| the target script's own scopes | run_function (plus the same-Cloud-project rule) |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_APPS_SCRIPT_CLIENT_ID` | yes* | — | OAuth2 client id (refresh flow). |
| `GOOGLE_APPS_SCRIPT_CLIENT_SECRET` | yes* | — | OAuth2 client secret (refresh flow). Secret. |
| `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN` | yes* | — | OAuth2 refresh token (refresh flow). Secret. |
| `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN` | yes* | — | Alternative: static access token (~1 h lifetime). Secret. |
| `GOOGLE_APPS_SCRIPT_API_BASE` | no | `https://script.googleapis.com` | API root override. |
| `GOOGLE_APPS_SCRIPT_TIMEOUT_MS` | no | `60000` | Per-request timeout, ms. |
| `GOOGLE_APPS_SCRIPT_MAX_RETRIES` | no | `3` | Retries on transient errors. |

\* Either the refresh triple together, or the static access token.
