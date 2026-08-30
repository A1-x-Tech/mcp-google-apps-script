# Development

## Requirements

- Node.js 20+ (the published package ships compiled `dist/`; `npx` needs no separate
  install). CI runs the suite on Node 20, 22 and 24.

## Commands

```bash
npm install
npm run dev        # run from source with tsx watch
npm test           # unit tests (node:test) + dist smoke, no network
npm run typecheck  # type-check src + tests (no emit)
npm run build      # clean dist/ and compile with tsc
npm run smoke      # live READ-ONLY check (see below)
```

## Local run

```bash
npm run build
GOOGLE_APPS_SCRIPT_CLIENT_ID=... GOOGLE_APPS_SCRIPT_CLIENT_SECRET=... GOOGLE_APPS_SCRIPT_REFRESH_TOKEN=... \
  node dist/index.js
# or, for a quick session with a short-lived token:
GOOGLE_APPS_SCRIPT_ACCESS_TOKEN=$(gcloud auth print-access-token) node dist/index.js
# optional: GOOGLE_APPS_SCRIPT_API_BASE, GOOGLE_APPS_SCRIPT_TIMEOUT_MS, GOOGLE_APPS_SCRIPT_MAX_RETRIES
```

Before the first real call: enable the Apps Script API toggle at
`script.google.com/home/usersettings` for the account, and enable
`script.googleapis.com` in the Cloud project that issued the OAuth client — the
`setup_instructions` tool carries the full checklist and the scope → tools map.

## Live smoke checks

`npm run smoke` makes one live read: with a script id (first argv or
`GOOGLE_APPS_SCRIPT_SMOKE_SCRIPT_ID`) it fetches that project's metadata; without one it just
mints an access token from the refresh token — either way nothing is written.

`npm run smoke -- --live` is the **opt-in write scenario on a disposable resource**: it
creates a throwaway standalone project, merges a code file, snapshots a version — and then
deletes the project's Drive file in a `finally` block, so cleanup runs after success and
failure alike. The Apps Script API cannot delete projects, so the cleanup goes through the
Drive API and the refresh token needs the `https://www.googleapis.com/auth/drive` scope on
top of `script.projects`; without it the script prints the scriptId to delete by hand. No
pre-existing project is ever touched.

## Tests

Unit tests mock `globalThis.fetch` (client) or use a fake server + fake client (tools), so
the whole suite runs offline — including the OAuth refresh flow, whose token endpoint is
served by the same fetch stub. `test/dist-smoke.test.js` additionally spawns the built
`dist/index.js` and performs a real MCP handshake over stdio through the official SDK,
asserting the server identity, the full tool list, and the degraded start without
credentials. Put a `*.test.ts` next to the code it covers; `npm run typecheck && npm test`
is the gate (also run by `prepublishOnly`).

## Usage telemetry

The server sends anonymous events to `usage.gistrec.cloud` (`server_start` when a client
connects to a configured install, `unconfigured_start` when a client connects to a server
without credentials, `tool_call` with the tool **name**, and `startup_failed` with a
fixed-vocabulary reason code when the configuration is malformed) to count active installs
and tool demand. An event carries only impersonal technical fields: a random installation id
(`~/.config/mcp-google-apps-script/instance-id`), the package version, the AI client's name
and version from the MCP handshake, the Node.js version and the OS.

OAuth credentials, script source code, tool arguments and prompts are never sent or stored
(implementation: `src/telemetry.ts`). Sends run in the background with a 2 s timeout and are
silently skipped on any error. Opt out for all servers of this line at once:
`ASKADS_TELEMETRY=0`.
