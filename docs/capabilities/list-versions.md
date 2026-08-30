# Google Apps Script: List versions — MCP tool

**Google Apps Script MCP tool:** Lists a project's immutable version history.

Technical name: `list_versions`

## What task it solves

> I want to see which versions of a script exist.

Lists the project's immutable versions — `versionNumber`, `description`, `createTime` — newest first.

## When to use it

Use it to pick a `versionNumber` for a deployment (ship or roll back), to check whether a create_version call landed after an ambiguous failure, or to find an old version whose code you want to read.

## What to provide

- `script_id` — **required**.
- `page_size` — **optional**. Versions per page (1..50).
- `page_token` — **optional**. `nextPageToken` from the previous page.

## What it returns

`versions[]` and `nextPageToken` as compact JSON.

## What changes in Google Apps Script

Nothing — this is a pure read.

## Example request

> List the versions of script 1AbC... so we can roll the deployment back to the one before yesterday's change.

## Errors and limitations

Requires the `script.projects` scope (or `script.projects.readonly`). Only metadata is returned — for a version's code call get_project_content with `version_number`.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a version](./get-version.md) — one version's metadata.
- [Manage deployments](./manage-deployments.md) — point a deployment at a version.

## Technical details

- **Impact:** read-only
- **Group:** Versions
- **Description source:** `list_versions` registration in `src/tools/versions.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
