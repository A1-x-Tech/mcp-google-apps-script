# Google Apps Script: Get a version — MCP tool

**Google Apps Script MCP tool:** Reads the metadata of one immutable version.

Technical name: `get_version`

## What task it solves

> I want to inspect one specific version of a script.

Fetches one immutable version by its number: `versionNumber`, `description`, `createTime`.

## When to use it

Use it to confirm a specific version exists and what it was described as — for example before repointing a production deployment at it. For the version's actual code, call get_project_content with `version_number` instead.

## What to provide

- `script_id` — **required**.
- `version_number` — **required**. The version number from create_version or list_versions.

## What it returns

The version's metadata as compact JSON.

## What changes in Google Apps Script

Nothing — this is a pure read.

## Example request

> What is version 12 of script 1AbC...? Check its description before we deploy it.

## Errors and limitations

Requires the `script.projects` scope (or `script.projects.readonly`). Metadata only — no code. 404 for a number that was never created.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List versions](./list-versions.md) — the full history.
- [Get project files](./get-project-content.md) — the code of this version.

## Technical details

- **Impact:** read-only
- **Group:** Versions
- **Description source:** `get_version` registration in `src/tools/versions.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
