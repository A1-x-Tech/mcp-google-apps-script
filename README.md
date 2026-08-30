# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Apps Script MCP

**English** | [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/mcp-google-apps-script)](https://www.npmjs.com/package/mcp-google-apps-script)
[![CI](https://github.com/A1-x-Tech/mcp-google-apps-script/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-apps-script/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-apps-script/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-apps-script)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Apps Script MCP** lets an AI app write and operate Google Apps Script in plain language. Create a script project, read and edit its code, snapshot versions, manage deployments, run functions and read the execution history.

It uses the Google Apps Script API with your Google account. It distinguishes the editable HEAD code from immutable versions and makes the limits of the Apps Script API explicit instead of implying that every scripting task is possible.

- **13 tools.** Create standalone and bound projects, read and update code files, snapshot immutable versions, manage deployments, run functions, and inspect execution history and metrics.
- **Versions are immutable.** A version snapshots HEAD and can never be edited or deleted; deployments point at versions, so you ship and roll back without changing a URL.
- **The manifest always survives.** Merge mode keeps the `appsscript` manifest and every file you did not mention; replace mode refuses a file set without the manifest before any network traffic.
- **Keep your scriptId.** The API cannot list projects and cannot delete them — the `scriptId` returned by `create_project` is the only handle.
- **Minimal Google scopes.** Each operation names its own scope (`script.projects`, `script.deployments`, `script.processes`, `script.metrics`); request only what your tasks need.

Start with a read-only question:

> Show me the files in my report script and which functions failed this week.

[Connect the server](#quick-start) · [Explore use cases](#what-you-can-ask-it-to-do) · [Open technical documentation](#technical-documentation)

---

## See it work in a minute

> **You:** Show the code and the recent runs of my report script.
>
> **Assistant:** Shows every file with its source and the execution history — which functions ran, when, and which failed. Nothing changes.
>
> **You:** Add a `formatDate` helper to the Utils file and keep everything else as is.
>
> **Assistant:** Shows the proposed source and confirms that merge mode leaves the other files untouched, then asks for confirmation before writing.
>
> **You:** Confirm.
>
> **Assistant:** Writes the file to HEAD. It does not create a version, redeploy or run anything unless you ask separately.

## Contents

- [Quick start](#quick-start)
- [What you can ask it to do](#what-you-can-ask-it-to-do)
- [How a project changes](#how-a-project-changes)
- [What can change](#what-can-change)
- [Getting access](#getting-access)
- [Configuration](#configuration)
- [Data, limits and background work](#data-limits-and-background-work)
- [Technical documentation](#technical-documentation)
- [Support](#support)

## Quick start

You need Node.js 20+, a Google account and OAuth credentials from a Google Cloud project with the Google Apps Script API enabled.

1. [Prepare Google OAuth access](#getting-access).
2. Add the server to your AI app.
3. Ask the read-only question above.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**In the app:** open **Settings → Plugins → MCP servers**, select **Add server**, then add `npx -y mcp-google-apps-script@latest` with `GOOGLE_APPS_SCRIPT_CLIENT_ID`, `GOOGLE_APPS_SCRIPT_CLIENT_SECRET` and `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN`.

**From the command line:**

```bash
codex mcp add google-apps-script \
  --env GOOGLE_APPS_SCRIPT_CLIENT_ID=your_client_id \
  --env GOOGLE_APPS_SCRIPT_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_APPS_SCRIPT_REFRESH_TOKEN=your_refresh_token \
  -- npx -y mcp-google-apps-script@latest
```

```bash
codex mcp list
```

[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_APPS_SCRIPT_CLIENT_ID=your_client_id \
  --env GOOGLE_APPS_SCRIPT_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_APPS_SCRIPT_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-apps-script \
  -- npx -y mcp-google-apps-script@latest
```

```bash
claude mcp list
```

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "google-apps-script": {
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script@latest"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "your_client_id",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

If **Edit Config** is unavailable, edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

[Claude Desktop MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Add this to `~/.cursor/mcp.json` on macOS/Linux or `%USERPROFILE%\.cursor\mcp.json` on Windows:

```json
{
  "mcpServers": {
    "google-apps-script": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script@latest"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "your_client_id",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Cursor MCP documentation](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Run **MCP: Open User Configuration** and add:

```json
{
  "servers": {
    "google-apps-script": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script@latest"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "${input:apps_script_client_id}",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "${input:apps_script_client_secret}",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "${input:apps_script_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "apps_script_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "apps_script_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "apps_script_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Check it with **MCP: List Servers**.

[VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## What you can ask it to do

### Inspect a project and its runs

- Show this script's files and explain what each function does.
- Which functions failed this week? Show the execution history for `sendDigest`.
- How many users, executions and failures did this script have over the last 7 days?

### Write and evolve code

- Create a standalone project, or a script bound to a Doc, Sheet, Slides or Form.
- Add a helper function to one file without touching the others.
- Snapshot the current code as a version with a description before we refactor.

### Ship, run and roll back

- Deploy version 4 and show its entry points — web app URL or API-executable config.
- Run `sendDigest` and show the result; if the script throws, show the stack trace.
- Repoint the deployment back to version 3 without changing its URL.

## How a project changes

1. `create_project` creates a **project** — standalone, or bound to a Doc, Sheet, Slides or Form. Keep the returned `scriptId`: the API cannot list projects.
2. Code lives at **HEAD** as files addressed by name without extension. `update_project_content` merges by default — it upserts the files you name and keeps the rest — and only replaces the entire set when asked; the `appsscript` manifest can never be deleted.
3. `create_version` snapshots HEAD as an **immutable version** — no edit, no delete, numbers only grow.
4. A **deployment** exposes a version as a web app or API executable. Updating a deployment repoints it at another version without changing its URL; the automatic `@HEAD` deployment cannot be deleted.

The API cannot delete a project either — that means deleting its Drive file, which this server does not cover. `run_function` requires an API-executable deployment, an OAuth client from the same Cloud project as the script and the script's own scopes on the token; Apps Script stops any execution after 6 minutes. The execution history shows status and timing but no error messages — those live in Cloud Logging or come from re-running the function.

## What can change

| Operation | What happens | Confirmation boundary |
|---|---|---|
| Read a project, its code, versions, runs or metrics | Reads data | No change |
| Create a project | Adds a standalone or bound script project | Changes Google Apps Script |
| Update project files | Overwrites code at HEAD; replace mode swaps the entire file set | Changes a project |
| Create a version | Adds an immutable snapshot that can never be removed | Changes a project |
| Create or update a deployment | Changes what a live URL or API endpoint serves | Changes a project's live behavior |
| Delete a deployment | Permanently breaks the deployment URL | Destructive |
| Run a function | Executes real code with real side effects | Destructive |
| Raw API request | Can call API methods without a dedicated tool | Potentially destructive |

The AI client controls confirmation prompts. The server marks reads, writes and destructive tools so the client can distinguish an inspection from a live change.

## Getting access

The Google Apps Script API requires OAuth 2.0; an API key is not enough.

1. Create or select a Google Cloud project and enable **Google Apps Script API**.
2. Turn on the per-account toggle at [script.google.com/home/usersettings](https://script.google.com/home/usersettings) — without it every call fails with `403`.
3. Configure the OAuth consent screen and create a **Desktop app** OAuth client.
4. Authorize the Google account that owns the scripts. The [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) can obtain the refresh token when **Use your own OAuth credentials** is enabled.
5. Request the scopes for the tools you plan to use:

   ```text
   https://www.googleapis.com/auth/script.projects
   https://www.googleapis.com/auth/script.deployments
   https://www.googleapis.com/auth/script.processes
   https://www.googleapis.com/auth/script.metrics
   ```

   For inspection-only use, replace the first two with the read-only variants `script.projects.readonly` and `script.deployments.readonly`; `list_processes` and `get_project_metrics` still need `script.processes` and `script.metrics`, which have no narrower form. `run_function` needs none of these scopes — instead the token must carry every scope the target script itself uses, and the OAuth client must belong to the **same Cloud project** as the script.

Testing-mode OAuth refresh tokens can expire after seven days. Publish the OAuth app, or use an Internal app in a Workspace domain, when you need long-lived access. Treat the client secret and refresh token as passwords.

The `setup_instructions` tool returns this same checklist and works even before credentials are configured.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_APPS_SCRIPT_CLIENT_ID` | Yes* | OAuth client ID. |
| `GOOGLE_APPS_SCRIPT_CLIENT_SECRET` | Yes* | OAuth client secret. |
| `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN` | Yes* | OAuth refresh token. |
| `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN` | Yes* | Short-lived alternative to the OAuth trio. |
| `GOOGLE_APPS_SCRIPT_API_BASE` | No | Google Apps Script API base URL override. |
| `GOOGLE_APPS_SCRIPT_TIMEOUT_MS` | No | Per-request timeout; default `60000` ms. |
| `GOOGLE_APPS_SCRIPT_MAX_RETRIES` | No | Temporary-error retries; default `3`. |

\* Provide either the OAuth trio or an access token.

## Data, limits and background work

- **Requests go to Google Apps Script.** The local server refreshes Google OAuth tokens and calls the Apps Script API. Its anonymous telemetry contains an installation ID, package version, AI client and platform versions, and tool names — never OAuth tokens, script sources, tool arguments or prompts. Set `ASKADS_TELEMETRY=0` to opt out.
- **Writes are never replayed blindly.** On `429`, the server uses backoff; reads also retry after network and `5xx` errors, while writes are not replayed after an uncertain failure — a duplicated `create_version` piles up immutable versions, and a duplicated `run_function` executes side effects twice. After an ambiguous failure, check `list_versions` or the execution history instead of re-sending.
- **There is no background polling.** The server runs only when called, and a function executes only when you ask for it. Scripts keep their own Apps Script triggers on Google's side; if your AI app supports scheduled tasks, it can also check the execution history periodically.

## Technical documentation

- [MCP capability catalog](./docs/capabilities/index.md) — task-oriented pages for every tool.
- [All tools and inputs](./docs/TOOLS.md)
- [Development documentation](./docs/DEVELOPMENT.md)
- [Publishing documentation](./docs/PUBLISHING.md)
- [Google Apps Script API reference](https://developers.google.com/apps-script/api)

## Support

Found a bug or need a scenario? [Create an issue](https://github.com/A1-x-Tech/mcp-google-apps-script/issues) or write in [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  You made it to the end!
</p>
