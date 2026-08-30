# Google Apps Script MCP capabilities

This catalog contains 13 public pages—one for every registered MCP tool in `mcp-google-apps-script`. Each page starts with the user's task, explains the result, and states whether the call changes real data.

Use this catalog to choose a ready-made capability. Full parameter schemas and API response details remain in the [technical reference](../TOOLS.md).

## Projects

- [Create a script project](./create-project.md) — Creates a standalone or container-bound Apps Script project. **Impact:** changes data.
- [Get project metadata](./get-project.md) — Reads a project's metadata without its code. **Impact:** read-only.
- [Get project files](./get-project-content.md) — Reads the full source of a project — every file with its code. **Impact:** read-only.
- [Update project files](./update-project-content.md) — Writes code files into a project, merging with or replacing the existing set. **Impact:** destructive operation.
- [Get execution metrics](./get-project-metrics.md) — Reads a project's execution statistics — users, runs and failures over time. **Impact:** read-only.

## Versions

- [Create a version](./create-version.md) — Snapshots the project's current code as a new immutable version. **Impact:** changes data.
- [List versions](./list-versions.md) — Lists a project's immutable version history. **Impact:** read-only.
- [Get a version](./get-version.md) — Reads the metadata of one immutable version. **Impact:** read-only.

## Deployments

- [Manage deployments](./manage-deployments.md) — Creates, inspects, repoints and deletes a project's deployments. **Impact:** destructive operation.

## Execution and monitoring

- [Run a script function](./run-function.md) — Executes a named function in a script and returns its result or stack trace. **Impact:** destructive operation.
- [List execution processes](./list-processes.md) — Reads the execution history — which functions ran, when, and which failed. **Impact:** read-only.

## Setup

- [Setup instructions](./setup-instructions.md) — Returns the setup checklist — enabling the API, minimal scopes, run prerequisites. **Impact:** read-only.

## Additional API methods

- [Raw Google Apps Script API call](./raw-request.md) — Escape hatch — calls any Apps Script API v1 path directly. **Impact:** destructive operation.

## For maintainers and publishers

- [MCP capability documentation contract](../CAPABILITY-DOCUMENTATION.md)
- [Technical tool reference](../TOOLS.md)
- [GitHub repository](https://github.com/A1-x-Tech/mcp-google-apps-script)
