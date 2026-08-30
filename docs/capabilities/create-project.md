# Google Apps Script: Create a script project — MCP tool

**Google Apps Script MCP tool:** Creates a standalone or container-bound Apps Script project.

Technical name: `create_project`

## What task it solves

> I want to create a new Apps Script project.

Creates an Apps Script project — standalone, or bound to a Google Doc, Sheet, Slides deck or Form — and returns its `scriptId`, the handle every other tool needs.

## When to use it

Use this capability when starting a new automation from scratch: a standalone script, or a script that must live inside a specific spreadsheet/document to use its container APIs (e.g. `SpreadsheetApp.getActive()`). It runs only when an AI client calls it.

## What to provide

- `title` — **required**. The project title shown in the Apps Script editor.
- `parent_id` — **optional**. Drive file id of a Google Doc, Sheet, Slides or Form to bind the project to; omit for a standalone project.

## What it returns

The created project: `scriptId`, `title`, `parentId` (bound projects only), `createTime`, `updateTime`. The new project holds only a default manifest and an empty code file.

## What changes in Google Apps Script

A new script project appears in the user's account (standalone projects also appear as a Drive file). **Keep the returned `scriptId`** — the API cannot list projects, so it is the only handle. Re-sending the call creates a second, independent project.

## Example request

> Create a standalone Apps Script project called "Invoice automation", then add the code we discussed with update_project_content.

## Errors and limitations

Requires the `script.projects` scope and the per-account Apps Script API toggle at script.google.com/home/usersettings (403 PERMISSION_DENIED otherwise — see [setup instructions](./setup-instructions.md)). Binding needs access to the parent file. The API cannot delete a project afterwards — that would be a Drive-file deletion, outside this server.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Update project files](./update-project-content.md) — add real code right after creating.
- [Get project metadata](./get-project.md) — verify the project.

## Technical details

- **Impact:** changes data
- **Group:** Projects
- **Description source:** `create_project` registration in `src/tools/projects.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
