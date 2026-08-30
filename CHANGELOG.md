# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/A1-x-Tech/mcp-google-apps-script/releases/tag/v0.1.0
