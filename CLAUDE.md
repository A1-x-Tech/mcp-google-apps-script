# CLAUDE.md — mcp-google-apps-script

MCP server for the Google Apps Script API v1 (TypeScript, stdio). Mixed
read/write: tools cover project creation (standalone and bound), code file
read/update with merge and replace semantics, immutable versions, deployments,
function execution, execution history/metrics and static setup guidance;
`raw_request` is the escape hatch. The server talks to
`https://script.googleapis.com` with a Bearer token; the token is minted from
an OAuth2 refresh token via `https://oauth2.googleapis.com/token` (or a static
`GOOGLE_APPS_SCRIPT_ACCESS_TOKEN`, mostly for testing). The API has no project
list and no project delete — a scriptId is the only handle, and deleting a
project means deleting its Drive file, which this server does not cover.

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests + dist smoke, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live READ-ONLY check (refresh-flow creds; optional script id argv/GOOGLE_APPS_SCRIPT_SMOKE_SCRIPT_ID)
npm run smoke -- --live  # opt-in write scenario on a DISPOSABLE project, cleanup via Drive API in finally
```

## Architecture

- `src/config.ts` — env → config. Credentials: either the refresh triple
  `GOOGLE_APPS_SCRIPT_CLIENT_ID` + `GOOGLE_APPS_SCRIPT_CLIENT_SECRET` +
  `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN` (all three or `ConfigError`
  `incomplete_oauth_config`) or `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN`; optional
  `GOOGLE_APPS_SCRIPT_API_BASE`, `GOOGLE_APPS_SCRIPT_TIMEOUT_MS`,
  `GOOGLE_APPS_SCRIPT_MAX_RETRIES`. No credentials at all is NOT an error: the fields stay
  `undefined` and the server starts degraded. Also home to `CredentialsError` /
  `MISSING_CREDENTIALS_MESSAGE` (opens with the historical startup error verbatim, then names
  the variables and the restart) and `hasCredentials()`.
- `src/client.ts` — all HTTP and all wire mapping. Token lifecycle (cache until ~60s before
  expiry, dedupe concurrent refreshes, one forced re-mint + replay on 401); `request()`
  resolves the path against the base and rejects foreign origins (SSRF guard), enforces an
  AbortController timeout that also covers reading the body, supports repeated query params
  (arrays are appended), retries 429 always but 5xx/network errors **only for GET** —
  replaying a write after an ambiguous failure would duplicate it — and throws
  `GoogleAppsScriptError(status, body)`. Typed per-endpoint methods:
  `replaceProjectContent()` guards the `appsscript` manifest before any fetch;
  `mergeProjectContent()` implements merge-on-top-of-replace (read HEAD, upsert by name,
  drop deleteFiles, PUT back — shields the manifest and unknown names);
  `buildScriptFiles()` maps `server_js|html|json` → `SERVER_JS|HTML|JSON`;
  `normalizeRunOperation()` turns the scripts.run Operation into `{ done, result }` or
  `{ done, script_error: { type, message, stack } }`; `listProcesses()` picks
  `processes` vs `processes:listScriptProcesses` and the matching filter prefix.
- `src/tools/projects.ts` — `create_project`, `get_project`, `get_project_content`,
  `update_project_content` (mode merge/replace + delete_files), `get_project_metrics`.
  `src/tools/versions.ts` — `create_version`, `list_versions`, `get_version`.
  `src/tools/deployments.ts` — `manage_deployments` (create/list/get/update/delete).
  `src/tools/execution.ts` — `run_function`. `src/tools/processes.ts` — `list_processes`
  (read-only). `src/tools/setup.ts` — `setup_instructions` (static, needs no credentials).
  `src/tools/raw.ts` — `raw_request` (GET/POST/PUT/DELETE). `src/tools/util.ts` —
  `ok`/`fail`, the four annotation presets (`READ_ONLY`/`WRITE`/`UPDATE`/`DESTRUCTIVE`) and
  shared zod schema factories (`scriptIdSchema`, `deploymentIdSchema`,
  `versionNumberSchema`, `rfc3339Timestamp`, `scriptFileSchema`).
- `src/index.ts` — wires every `register*` into the McpServer. `loadConfigOrDegraded()`
  catches `ConfigError`, pings `startup_failed` (fire-and-forget) and degrades the config to
  "no credentials"; an unconfigured start prepends `UNCONFIGURED_PREFIX` — plus
  `Configuration problem: <message>` when a ConfigError was caught — to the initialize
  `instructions`, and `oninitialized` sends `server_start` for a configured install or
  `unconfigured_start` (with the reason) otherwise.
- `src/telemetry.ts` — anonymous usage pings (ids/names/versions only, never data or
  arguments; fire-and-forget, must never block or throw; opt-out `ASKADS_TELEMETRY=0`).
  `server_start` means "a usable install started"; `unconfigured_start` is a degraded start
  and `startup_failed` a malformed config caught at load — both carry a `reason` from a
  closed vocabulary (`missing_credentials`, `incomplete_oauth_config`) — never a variable's
  name or value.

## Conventions (do not break)

- **Never exit because of configuration.** A server that dies before the MCP handshake leaves
  the user with a red cross and no reason — telemetry across this line of servers showed that
  state accounted for nearly every unconfigured install, and almost none of them recovered.
  Missing credentials are a survivable state: start, answer initialize (with the unconfigured
  prefix in `instructions`) and tools/list, and let the first tool call fail with
  `CredentialsError` — its message names the variables to set and says to restart, because
  credentials come only from the environment. `config.test.ts`, `client.test.ts` and
  `test/dist-smoke.test.js` pin this. (`setup_instructions` still works degraded — it is the
  way out of that state.)
- **Credential failures are not transport failures.** `CredentialsError` is thrown in
  `accessToken()` before any fetch — before the retry/backoff loop, the token mint and the
  401 replay — because retrying it burns seconds of backoff before the user sees the one
  message that helps. Pinned by the "fetch never called" assertion in `client.test.ts`.
- **Never retry a write on 5xx/network errors.** Only 429 (rejected before executing) and GET
  are safe; the gate lives in `request()` and is pinned by tests. This matters more here than
  in most APIs: a replayed `create_version` piles up immutable versions, a replayed
  `run_function` executes side effects twice.
- **The manifest always survives.** `replaceProjectContent()` rejects a file set without
  `appsscript` before any network traffic and `mergeProjectContent()` refuses to delete it —
  a project without its manifest is bricked.
- **A script throw is data, not an error.** scripts.run returns HTTP 200 with the
  ExecutionError inside the Operation; `normalizeRunOperation()` surfaces it as
  `script_error` with the stack so the calling model can read and fix the code instead of
  retrying a "failed" call.
- **Wire mapping lives in the client, not the tools.** Tools accept the normalized snake_case
  vocabulary and must not know the wire enums (`SERVER_JS`, `DAILY`,
  `userProcessFilter.functionName`) — add any mapping in `client.ts`.
- **Auth is the client's job.** Tools never see tokens; the Bearer header, refresh, caching
  and the 401 replay all live in `request()`/`accessToken()`.
- **Files are addressed by name without extension** (`Code`, not `Code.gs`) — descriptions
  must keep steering the model to `get_project_content` before `update_project_content`.
- **Validate inputs with zod** in `inputSchema`; reuse the shared schema **factories** in
  `util.ts` (a fresh schema per field avoids `$ref` dedup in the JSON schema).
- **Annotations are pinned per tool** in `annotations.test.ts` — changing one is a conscious
  decision that updates the map, with all four hints always set.
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Responses pass through verbatim (describe the fields in the tool `description`, the only
  place the external model reads).

## Adding a tool

Before changing the tool registry, read [the MCP capability documentation contract](docs/CAPABILITY-DOCUMENTATION.md). Every registered tool must have exactly one task-oriented page in `docs/capabilities/`; update that page, the index, and the coverage test in the same change.

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. If it hits a new endpoint, add a method to `src/client.ts` with the wire mapping.
3. Import and call the register fn in `src/index.ts`.
4. Add a `*.test.ts` using the mock-fetch (client) / fake-client (tools) harness — no
   network — and add the tool + hints to `annotations.test.ts` and `test/dist-smoke.test.js`.
5. `npm run typecheck && npm test`.

## Releasing

Keep the version in sync across **all** channels in one go (`git push --follow-tags` pushes
the tag but does **not** create a GitHub Release; the registry is immutable per version):

1. Bump `version` in **three places, identically**: `package.json`, and in `server.json`
   **both** the root `version` **and** `packages[0].version`. `mcpName` in `package.json` must
   match `name` in `server.json` (`io.github.A1-x-Tech/mcp-google-apps-script`). Verify:
   `grep -n '"version"' package.json server.json`.
   > ⚠️ `mcp-publisher` publishes the **root** `server.json.version`. A stale root makes
   > `mcp-publisher publish` fail with a misleading `400 cannot publish duplicate version`
   > while `npm publish` succeeds.
2. Update `CHANGELOG.md`, then `npm publish` (runs typecheck + tests + build via
   `prepublishOnly` / `prepare`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Official MCP registry:** `mcp-publisher publish` (login with
   `mcp-publisher login github --token "$(gh auth token)"`).
