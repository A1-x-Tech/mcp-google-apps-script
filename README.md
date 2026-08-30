<p align="center">
  <img src="assets/a1-logo.svg" alt="A1 x Tech" width="120" />
</p>

# mcp-google-apps-script

MCP server for the **Google Apps Script API v1** (TypeScript, stdio). Gives AI clients
(Claude, Cursor, Codex, ...) a complete, verifiable path from OAuth setup to a real script
execution: create standalone and bound projects, read and update code files with **merge and
replace semantics**, manage immutable versions and deployments, run functions and read the
execution history and metrics.

> Technical README for the handoff stage. Full public documentation, marketing copy and
> registry publication are the next task.

## Tools (13)

| Group | Tools |
|---|---|
| Projects | `create_project`, `get_project`, `get_project_content`, `update_project_content` (merge/replace), `get_project_metrics` |
| Versions | `create_version`, `list_versions`, `get_version` |
| Deployments | `manage_deployments` (create/list/get/update/delete) |
| Execution | `run_function` (result or `script_error` with the Apps Script stack) |
| Monitoring | `list_processes` (read-only execution history) |
| Setup | `setup_instructions` (works without credentials) |
| Escape hatch | `raw_request` (any API v1 path, SSRF-guarded) |

Details, schemas and scope table: [docs/TOOLS.md](docs/TOOLS.md). Task-oriented pages:
[docs/capabilities/](docs/capabilities/index.md).

## Quick start

```jsonc
// MCP client config
{
  "mcpServers": {
    "google-apps-script": {
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "...",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "...",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

Prerequisites (the `setup_instructions` tool returns the same checklist as JSON):

1. Turn ON the per-account toggle at <https://script.google.com/home/usersettings> —
   without it every call fails with 403.
2. Enable `script.googleapis.com` in the Cloud project that issued the OAuth client.
3. Mint the refresh token with the **minimal scopes** for the tools you need
   (`script.projects`, `script.deployments`, `script.processes`, `script.metrics`);
   `run_function` additionally requires an API-executable deployment, an OAuth client from
   the **same Cloud project** as the script, and the script's own scopes on the token.

Without credentials the server still starts and completes the MCP handshake (degraded
mode): the initialize instructions name the variables to set, and every tool call except
`setup_instructions` fails with the same actionable message.

## Behaviour guarantees

- **Writes are never blindly retried.** 429 is retried for every method; 5xx/network errors
  only for GET — a replayed write could create a second version or run a function twice.
- **Timeouts cover the body**, the token is auto-refreshed (once, on 401), and paths that
  resolve to a foreign origin are rejected so the Bearer token never leaves
  `script.googleapis.com`.
- **No secrets in logs or errors.** Credentials, tokens and script sources never appear in
  messages or telemetry (anonymous usage pings; opt out with `ASKADS_TELEMETRY=0`).

## Development

```bash
npm install
npm run typecheck && npm test   # offline: mocked fetch + dist smoke over real stdio
npm run smoke                   # live read-only credential check
npm run smoke -- --live         # opt-in: disposable project, cleanup via Drive API
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/PUBLISHING.md](docs/PUBLISHING.md) and
[CLAUDE.md](CLAUDE.md) for architecture and conventions.

## License

[MIT](LICENSE) © A1 x Tech
