# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-24

### Changed

- First stable release. The code is unchanged from 0.2.0; the version now states
  what was already true of it — the tool surface, tool argument shapes,
  environment variable names and response envelopes are settled, and breaking any
  of them from here on requires a major bump.

## [0.2.0] - 2026-09-20

### Added

- In-chat Google login via `@a1-x-tech/mcp-google-auth` — 6 new onboarding
  tools: `auth_status`, `setup_instructions`, `set_client`, `start_login`
  (deliberately not read-only), `finish_login`, `logout`. The flow is loopback
  `127.0.0.1` + PKCE against a user-owned Desktop OAuth client; the code is
  exchanged locally and the client secret never passes through the chat. Each
  tool has a capability page under `docs/capabilities/`.
- Tokens from a login are stored per server in
  `~/.config/mcp-google-apps-script/credentials.json` (0600) and re-read on every
  call, so a login finished mid-session works without restarting the AI client.
  `GOOGLE_APPS_SCRIPT_OAUTH_PORT` pins the loopback listener port for SSH forwarding.
- `finish_login` verifies a fresh login against **Apps Script API** itself rather than
  Google's identity endpoint: OIDC answers even when the API is switched off in
  the Cloud project, which would make a broken setup look connected. A 403 that
  says the API is disabled is translated into the actual fix — enable it in the
  same project as the OAuth client.

### Changed

- The client accepts the component's `TokenProvider` as a fallback token
  source: environment credentials (the refresh triple or `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN`)
  keep absolute priority and behave exactly as before; the stored in-chat login
  is used only when the environment carries no credentials. The single 401
  re-mint + replay works for provider-backed tokens too, and is skipped when
  nothing can be re-minted.
- The unconfigured `initialize` instructions lead with the in-chat login
  (`setup_instructions` → `set_client` → `start_login` → `finish_login`, no
  restart needed); setting the environment variables + restart remains the
  documented alternative.

## [0.1.0] — 2026-08-30

### Added

- First release: a full MCP server for the Google Apps Script API v1 (stdio,
  TypeScript, `@modelcontextprotocol/sdk` + `zod`).
- Tools (13):
  - `create_project` — standalone or container-bound projects (parent_id);
  - `get_project`, `get_project_content` — metadata and the full file set,
    including the content of historical immutable versions;
  - `update_project_content` — code writes with explicit **merge** (upsert by
    name + delete_files, everything else preserved) and **replace** (whole file
    set; the `appsscript` manifest is guarded before any network traffic)
    semantics;
  - `get_project_metrics` — activeUsers / totalExecutions / failedExecutions
    time series;
  - `create_version`, `list_versions`, `get_version` — immutable snapshots;
  - `manage_deployments` — create/list/get/update/delete, incl. shipping and
    rollback by repointing an existing deployment;
  - `run_function` — scripts.run with normalized results: `result` on success,
    `script_error` with type/message/stack when the script throws;
  - `list_processes` — read-only execution history with status/type/time
    filters (user-level and script-level endpoints);
  - `setup_instructions` — static setup checklist (API toggle, minimal scopes
    per tool, run_function prerequisites) that works without credentials;
  - `raw_request` — escape hatch to any API v1 path (SSRF-guarded,
    GET/POST/PUT/DELETE).
- Degraded start: without credentials the server still completes the MCP
  handshake, carries the fix in the initialize instructions, and fails tool
  calls with an actionable `CredentialsError` (thrown before any fetch).
- OAuth2 refresh flow: access tokens are minted from
  `GOOGLE_APPS_SCRIPT_CLIENT_ID`/`_CLIENT_SECRET`/`_REFRESH_TOKEN`, cached until
  just before expiry, deduped across concurrent requests and re-minted once on
  a 401; a static `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN` works as an alternative.
- Resilience: request timeout covering body reads, `Retry-After`-aware backoff,
  429 retried for every method, 5xx/network retries gated to reads so writes
  (content PUTs, version/deployment creation, function runs) are never replayed.
- Anonymous usage telemetry (event/tool names and versions only; opt out with
  `ASKADS_TELEMETRY=0`), including the `startup_failed` and `unconfigured_start`
  events.
- Offline test suite (93 tests): mocked-fetch client tests incl. the OAuth flow
  and merge/replace semantics, fake-server tool tests, pinned per-tool
  annotations, capability-docs coverage, plus a dist smoke test that spawns the
  built binary and performs a real MCP handshake over stdio (configured and
  degraded).
- Opt-in live smoke scenario on a disposable project
  (`npm run smoke -- --live`): create → merge content → create version, with
  cleanup through the Drive API in `finally` (after success and failure alike).
- CI (Node 20/22/24: typecheck + build + tests) and a daily live health check
  that skips itself when repo secrets are absent.

[1.0.0]: https://github.com/A1-x-Tech/mcp-google-apps-script/releases/tag/v1.0.0
[0.2.0]: https://github.com/A1-x-Tech/mcp-google-apps-script/releases/tag/v0.2.0
[0.1.0]: https://github.com/A1-x-Tech/mcp-google-apps-script/releases/tag/v0.1.0
