# Google Apps Script: Manage deployments — MCP tool

**Google Apps Script MCP tool:** Creates, inspects, repoints and deletes a project's deployments.

Technical name: `manage_deployments`

## What task it solves

> I want to publish a script version and manage where it is exposed.

One tool for the whole deployment lifecycle: `action=create` deploys a version (or HEAD), `list` and `get` inspect deployments and their entry points (web app URL, API executable), `update` repoints an existing deployment at another version, `delete` removes one.

## When to use it

Use `create` to first publish a script, `get` to read a web app's URL or verify the API-executable entry point run_function needs, `update` to ship or roll back **without changing the URL**, and `delete` only when an endpoint should stop existing.

## What to provide

- `script_id` — **required**.
- `action` — **required**. `create`, `list`, `get`, `update` or `delete`.
- `deployment_id` — get/update/delete.
- `version_number` — create/update; omit on create to deploy HEAD (auto-updates with every save — risky for production).
- `description` — create/update.
- `page_size` / `page_token` — list; deployments per page (1..50) and the `nextPageToken` from the previous page.

## What it returns

The deployment(s) as compact JSON: `deploymentId`, `deploymentConfig` and — for get — `entryPoints[]` with the web app URL or API-executable config.

## What changes in Google Apps Script

`create` publishes a new endpoint; `update` changes what code an existing endpoint runs (this is the production ship/rollback action); **`delete` permanently breaks the deployment's URL and every integration calling it** — the automatic @HEAD deployment cannot be deleted. What a deployment exposes (web app vs API executable, access rules) comes from the `appsscript` manifest at the deployed version.

## Example request

> Deploy version 12 of script 1AbC... by updating the existing production deployment — do not create a new one, the URL must stay.

## Errors and limitations

Requires the `script.deployments` scope (`script.deployments.readonly` suffices for list/get). Writes are never retried after a 5xx or timeout — `list` first before re-sending a `create`. Web app and API-executable behavior also depends on the manifest of the deployed version.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create a version](./create-version.md) — make the snapshot deployments point at.
- [Run a script function](./run-function.md) — needs an API-executable deployment.

## Technical details

- **Impact:** destructive operation
- **Group:** Deployments
- **Description source:** `manage_deployments` registration in `src/tools/deployments.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
