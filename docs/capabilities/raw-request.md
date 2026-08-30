# Google Apps Script: Raw API call — MCP tool

**Google Apps Script MCP tool:** Escape hatch — calls any Apps Script API v1 path directly.

Technical name: `raw_request`

## What task it solves

> I want to call an Apps Script API endpoint the typed tools don't cover.

Sends a GET/POST/PUT/DELETE request to any relative Apps Script API v1 path with the Bearer token added automatically.

## When to use it

Use it for edge cases: a hand-built content PUT, repeated query filter params, or fields a typed tool does not expose. Prefer the typed tools whenever one fits — they carry the guard rails.

## What to provide

- `path` — **required**. Relative to https://script.googleapis.com, e.g. `v1/projects/<scriptId>/deployments`; may carry a query string.
- `method` — **optional**. GET (default), POST, PUT or DELETE.
- `body` — **optional**. JSON body for POST/PUT.

## What it returns

The upstream API's JSON response verbatim, or a clear error with the HTTP status and Google's message.

## What changes in Google Apps Script

Depends entirely on the call: it can replace a project's whole file set (`PUT v1/projects/<id>/content` — prefer [update_project_content](./update-project-content.md), whose merge mode protects the other files) or delete a deployment. Treat it as the most powerful tool here.

## Example request

> Call GET v1/projects/1AbC.../content?versionNumber=3 and diff it against the current code.

## Errors and limitations

Paths resolving to a foreign origin are rejected before any network traffic, so the token never leaves script.googleapis.com. Writes (POST/PUT/DELETE) are never retried after ambiguous failures; the scope requirements of the underlying endpoint apply.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Update project files](./update-project-content.md) — the safe way to write code.
- [Setup instructions](./setup-instructions.md) — scope reference.

## Technical details

- **Impact:** destructive operation
- **Group:** Additional API methods
- **Description source:** `raw_request` registration in `src/tools/raw.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
