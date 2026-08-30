# Google Apps Script: Get execution metrics — MCP tool

**Google Apps Script MCP tool:** Reads a project's execution statistics — users, runs and failures over time.

Technical name: `get_project_metrics`

## What task it solves

> I want to see how often a script runs and how often it fails.

Returns `activeUsers`, `totalExecutions` and `failedExecutions` as time series, per day (last 7 days) or per week.

## When to use it

Use it as the health overview of a deployed script: a rising `failedExecutions` series is the cue to drill down with [list_processes](./list-processes.md) filtered to FAILED. `deployment_id` narrows the numbers to one deployment.

## What to provide

- `script_id` — **required**.
- `granularity` — **required**. `daily` (last 7 days per day) or `weekly`.
- `deployment_id` — **optional**. Only count executions of this deployment.

## What it returns

Three arrays of `{ value, startTime, endTime }` as compact JSON; `value` is absent when zero.

## What changes in Google Apps Script

Nothing — this is a pure read.

## Example request

> How many executions of script 1AbC... failed this week, per day?

## Errors and limitations

Requires the `script.metrics` scope. Metrics are aggregates only — no per-execution details and no error messages; daily granularity covers only the last 7 days.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List execution processes](./list-processes.md) — the per-execution history behind these numbers.
- [Manage deployments](./manage-deployments.md) — find deployment ids.

## Technical details

- **Impact:** read-only
- **Group:** Projects
- **Description source:** `get_project_metrics` registration in `src/tools/projects.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
