# Google Apps Script: Get project files — MCP tool

**Google Apps Script MCP tool:** Reads the full source of a project — every file with its code.

Technical name: `get_project_content`

## What task it solves

> I want to read a script project's code.

Returns the project's complete file set: each file's name (no extension), type (`SERVER_JS` = .gs code, `HTML`, `JSON` = the `appsscript` manifest) and full `source`.

## When to use it

Use it before any code change — merge mode addresses files by these exact names and replace mode needs the full new set including the manifest — or to read the code of an older immutable version via `version_number`.

## What to provide

- `script_id` — **required**. The script project id.
- `version_number` — **optional**. Read the content of this immutable version instead of HEAD (the latest saved code).

## What it returns

`files[]` with `name`, `type`, `source` and per-file update info as compact JSON.

## What changes in Google Apps Script

Nothing — this is a pure read.

## Example request

> Show me the current code of script 1AbC..., then we'll refactor the onOpen function.

## Errors and limitations

Requires the `script.projects` scope (or `script.projects.readonly`). File names carry no extension — `Code`, not `Code.gs`. Reading a `version_number` that does not exist returns 404; list valid numbers with [list_versions](./list-versions.md).

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Update project files](./update-project-content.md) — write changes back.
- [List versions](./list-versions.md) — find historical version numbers.

## Technical details

- **Impact:** read-only
- **Group:** Projects
- **Description source:** `get_project_content` registration in `src/tools/projects.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
