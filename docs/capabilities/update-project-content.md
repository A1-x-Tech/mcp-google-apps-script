# Google Apps Script: Update project files — MCP tool

**Google Apps Script MCP tool:** Writes code files into a project, merging with or replacing the existing set.

Technical name: `update_project_content`

## What task it solves

> I want to change the code of a script project.

Writes files to the project's HEAD with two explicit semantics: **merge** (default — upserts the given files by name, keeps everything else, optionally deletes named files) and **replace** (the given files become the entire project).

## When to use it

Use merge for everyday edits — add or rewrite one file without touching the rest. Use replace when you intend to define the whole project in one call (e.g. right after create_project); replace deletes every file you do not send.

## What to provide

- `script_id` — **required**.
- `files` — **required**. Objects `{ name, type, source }`; `name` has no extension ("Code", not "Code.gs"), `type` is `server_js`, `html` or `json` (manifest only).
- `mode` — **optional**. `merge` (default) or `replace`.
- `delete_files` — **optional**, merge only. File names to remove; the `appsscript` manifest cannot be deleted.

## What it returns

The resulting file set of the project as compact JSON.

## What changes in Google Apps Script

The project's HEAD code changes immediately for the editor and for HEAD deployments. **Replace mode deletes every unnamed file** — a replace without the `appsscript` manifest is rejected before hitting the API. Merge is read-then-write and not atomic: a concurrent editor's change between the read and the write is overwritten. Deployed versions stay untouched until you create a version and repoint a deployment.

## Example request

> In script 1AbC..., merge a new file "Utils" with these helper functions and delete the obsolete "Legacy" file. Show me the plan first.

## Errors and limitations

Requires the `script.projects` scope. This write is never retried after a 5xx or timeout — verify with get_project_content before re-sending. Sources must be valid Apps Script (the API rejects some syntax errors with 400). The manifest must always survive.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get project files](./get-project-content.md) — read before writing.
- [Create a version](./create-version.md) — snapshot the result to ship it.

## Technical details

- **Impact:** destructive operation
- **Group:** Projects
- **Description source:** `update_project_content` registration in `src/tools/projects.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
