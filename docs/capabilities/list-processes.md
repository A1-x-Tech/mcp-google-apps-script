# Google Apps Script: List execution processes — MCP tool

**Google Apps Script MCP tool:** Reads the execution history — which functions ran, when, and which failed.

Technical name: `list_processes`

## What task it solves

> I want to see which script executions ran and which failed.

Lists execution processes: function name, launch type (web app, API call, time trigger, ...), status (COMPLETED, FAILED, TIMED_OUT, ...), start time and duration.

## When to use it

Use it to audit a script's activity or hunt failures: filter `statuses=["FAILED","TIMED_OUT"]` and a time window. With `script_id` only that script's executions are listed; without it, all executions started by the authorizing user.

## What to provide

- `script_id` — **optional**. Limit to one script.
- `function_name`, `deployment_id` — **optional** filters.
- `statuses`, `types` — **optional**. Process states / launch types to keep.
- `start_time`, `end_time` — **optional**. RFC3339 UTC bounds on the process start.
- `page_size` (1..50), `page_token` — **optional** pagination.

## What it returns

`processes[]` with `projectName`, `functionName`, `processType`, `processStatus`, `userAccessLevel`, `startTime`, `duration`, plus `nextPageToken`.

## What changes in Google Apps Script

Nothing — this is a pure read.

## Example request

> Show me the failed executions of script 1AbC... in the last 24 hours — which function keeps failing?

## Errors and limitations

Requires the `script.processes` scope. The API reports **the fact and timing of a failure, never the error message or logs** — get the message by re-running via run_function, or from the Apps Script dashboard / Cloud Logging. History is the user's own executions.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get execution metrics](./get-project-metrics.md) — the aggregate view.
- [Run a script function](./run-function.md) — reproduce a failure with the real error message.

## Technical details

- **Impact:** read-only
- **Group:** Processes
- **Description source:** `list_processes` registration in `src/tools/processes.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
