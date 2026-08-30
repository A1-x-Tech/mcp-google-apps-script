# Google Apps Script: Setup instructions — MCP tool

**Google Apps Script MCP tool:** Returns the setup checklist — enabling the API, minimal scopes, run prerequisites.

Technical name: `setup_instructions`

## What task it solves

> I want to set this server up, or understand why every call returns 403.

Returns structured, verified setup guidance: the per-account Apps Script API toggle, the Cloud-project API enablement, which OAuth scope each tool needs, the extra prerequisites of run_function, and the API's known limits.

## When to use it

Use it when configuring the server for the first time, when a call unexpectedly fails with 403 PERMISSION_DENIED, or when deciding which minimal scopes to mint the refresh token with. It is the one tool that works before credentials are configured.

## What to provide

Nothing — the tool takes no parameters.

## What it returns

JSON with `enable_api` (the toggle at script.google.com/home/usersettings and the Cloud console step), `oauth_setup` (the GOOGLE_APPS_SCRIPT_* variables), `scopes` (scope → tools map for minimal-scope tokens), `run_function_extras` (API-executable deployment, same-Cloud-project rule, script's own scopes) and `known_limits`.

## What changes in Google Apps Script

Nothing — this is a local read; no API call is made.

## Example request

> The tools keep returning 403 — get the setup instructions and tell me what is missing.

## Errors and limitations

The guidance is static and cannot check the actual account state — it tells you what to verify, not what is currently broken. It never contains credential values.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Run a script function](./run-function.md) — the tool with the most prerequisites.
- [Raw Google Apps Script API call](./raw-request.md).

## Technical details

- **Impact:** read-only
- **Group:** Setup
- **Description source:** `setup_instructions` registration in `src/tools/setup.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
