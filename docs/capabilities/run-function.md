# Google Apps Script: Run a script function — MCP tool

**Google Apps Script MCP tool:** Executes a named function in a script and returns its result or stack trace.

Technical name: `run_function`

## What task it solves

> I want to run a function of my script and get its result.

Runs a named function through the Apps Script Execution API and returns `{ done, result }` — or, when the script itself throws, `{ done, script_error }` with the error type, message and Apps Script stack trace.

## When to use it

Use it to execute automation on demand, to test freshly written code (`dev_mode=true` runs the latest saved code, owner only), or to reproduce a failure seen in list_processes and capture its actual error message.

## What to provide

- `script_id` — **required**.
- `function_name` — **required**. The function to run, without parentheses.
- `parameters` — **optional**. Positional, JSON-serializable primitives/arrays/objects only.
- `dev_mode` — **optional**. Run HEAD instead of the deployed version (script owner only).

## What it returns

`{ done: true, result: ... }` on success (null for void functions) or `{ done: true, script_error: { type, message, stack } }` when the script threw — a script bug, not a transport error.

## What changes in Google Apps Script

Whatever the function does — the code runs with the script's full authority and can edit spreadsheets, send email, delete files. Treat every call as a real execution with side effects; do not blindly retry a failed run, the side effects may already have happened.

## Example request

> Run processInvoices on script 1AbC... with ["2026-08"] and show me the result — if it throws, show the stack trace.

## Errors and limitations

Three hard prerequisites the API enforces: the script needs an **API-executable deployment**; the OAuth client must belong to the **same Google Cloud project** as the script (script editor > Project Settings); the token must carry **every scope the script itself uses**. Violations surface as 403 PERMISSION_DENIED or 404 — see [setup instructions](./setup-instructions.md). Executions time out after 6 minutes; parameters cannot be Apps Script objects.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Manage deployments](./manage-deployments.md) — create the API-executable deployment.
- [List execution processes](./list-processes.md) — the history of runs.

## Technical details

- **Impact:** destructive operation
- **Group:** Execution
- **Description source:** `run_function` registration in `src/tools/execution.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
