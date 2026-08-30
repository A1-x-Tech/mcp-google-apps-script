# Google Apps Script: Get project metadata — MCP tool

**Google Apps Script MCP tool:** Reads a project's metadata without its code.

Technical name: `get_project`

## What task it solves

> I want to check what a script project is and when it changed.

Returns the project's metadata: title, `scriptId`, `parentId` (present only for bound projects), creator, last modifying user, and create/update times.

## When to use it

Use it to verify that a `scriptId` exists and is accessible, to tell a standalone project from a bound one, or to see when a project was last modified — without pulling all of its source code.

## What to provide

- `script_id` — **required**. The script project id — from the Apps Script editor URL or from create_project output.

## What it returns

Project metadata as compact JSON: `scriptId`, `title`, `parentId`, `creator`, `lastModifyUser`, `createTime`, `updateTime`. No code is included — use [get_project_content](./get-project-content.md) for the files.

## What changes in Google Apps Script

Nothing — this is a pure read.

## Example request

> Check that script 1AbC... exists and tell me whether it is standalone or bound to a spreadsheet.

## Errors and limitations

Requires the `script.projects` scope and the account's Apps Script API toggle. 404 means the id is wrong or the token's user has no access; 403 usually means the toggle at script.google.com/home/usersettings is off.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get project files](./get-project-content.md) — the actual code.
- [Create a script project](./create-project.md).

## Technical details

- **Impact:** read-only
- **Group:** Projects
- **Description source:** `get_project` registration in `src/tools/projects.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
