# Google Apps Script: Create a version — MCP tool

**Google Apps Script MCP tool:** Snapshots the project's current code as a new immutable version.

Technical name: `create_version`

## What task it solves

> I want to freeze the current code so it can be deployed.

Snapshots HEAD as a new immutable version and returns its `versionNumber` — the value deployments point at.

## When to use it

Use it after the code in HEAD is ready to ship: create a version, then point a deployment at it with [manage_deployments](./manage-deployments.md). Creating a version alone changes nothing that runs.

## What to provide

- `script_id` — **required**.
- `description` — **optional**. Changelog line shown in the editor's version list.

## What it returns

The created version: `versionNumber`, `description`, `createTime`.

## What changes in Google Apps Script

A new immutable version is appended to the project's version list. Versions cannot be edited or deleted and numbers only grow — **every call creates a NEW version**, so after an ambiguous failure check [list_versions](./list-versions.md) before re-sending, or you will pile up duplicates.

## Example request

> The refactored code looks good — snapshot it as a version described "v2: batched writes" and update the production deployment to it.

## Errors and limitations

Requires the `script.projects` scope. This write is never retried automatically after a 5xx or timeout. The version captures HEAD at call time — concurrent edits race it.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Manage deployments](./manage-deployments.md) — actually ship the version.
- [List versions](./list-versions.md) — verify what was created.

## Technical details

- **Impact:** changes data
- **Group:** Versions
- **Description source:** `create_version` registration in `src/tools/versions.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
