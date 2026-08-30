import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAppsScriptClient } from "../client.js";
import { fail, ok, READ_ONLY, scriptFileSchema, scriptIdSchema, UPDATE, versionNumberSchema, WRITE } from "./util.js";

export function registerProjectTools(server: McpServer, client: GoogleAppsScriptClient): void {
  server.registerTool(
    "create_project",
    {
      title: "Create a script project",
      annotations: WRITE,
      description:
        "Creates an Apps Script project and returns it (scriptId, title, createTime). Without parent_id the project is standalone (its scriptId doubles as its Drive file id); with parent_id — the Drive id of a Google Doc, Sheet, Slides or Form — the project is created bound to that container and can use its container-specific APIs (e.g. SpreadsheetApp.getActive()). A new project holds only a default manifest and an empty Code file: add real code with update_project_content next. IMPORTANT: the API cannot list or delete projects — keep the returned scriptId, it is the only handle. Requires the script.projects scope, the Apps Script API toggle at script.google.com/home/usersettings, and — for bound projects — access to the parent file.",
      inputSchema: {
        title: z.string().min(1).describe("The project title shown in the Apps Script editor."),
        parent_id: z
          .string()
          .optional()
          .describe(
            "Drive file id of a Google Doc, Sheet, Slides or Form to bind the project to; omit for a standalone project.",
          ),
      },
    },
    async ({ title, parent_id }) => {
      try {
        return ok(await client.createProject({ title, parentId: parent_id }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project metadata",
      annotations: READ_ONLY,
      description:
        "Returns the project's metadata: title, scriptId, parentId (present only for bound projects), creator, lastModifyUser, createTime and updateTime. No code is included — use get_project_content for the files. Useful to verify a scriptId exists and check whether the project is standalone or bound.",
      inputSchema: { script_id: scriptIdSchema() },
    },
    async ({ script_id }) => {
      try {
        return ok(await client.getProject(script_id));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_project_content",
    {
      title: "Get project files",
      annotations: READ_ONLY,
      description:
        'Returns the project\'s full file set: files[] with name (no extension), type (SERVER_JS = .gs code, HTML, JSON = the "appsscript" manifest), source, and per-file update info. By default HEAD (the latest saved code) is returned; version_number returns the content of that immutable version instead. Call this before update_project_content: replace mode needs the full new set including the manifest, and merge mode addresses files by these exact names.',
      inputSchema: {
        script_id: scriptIdSchema(),
        version_number: versionNumberSchema()
          .optional()
          .describe("Read the content of this immutable version instead of HEAD."),
      },
    },
    async ({ script_id, version_number }) => {
      try {
        return ok(await client.getProjectContent(script_id, version_number));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_project_content",
    {
      title: "Update project files",
      annotations: UPDATE,
      description:
        'Writes code files to the project\'s HEAD (deployed versions are untouched until you create a version + deployment). Two modes. mode="merge" (default, safer): the current content is read first, the given files are added or overwritten BY NAME, delete_files removes named files, everything else is preserved — not atomic, a concurrent edit between read and write is lost. mode="replace": the given files become the ENTIRE project; any file not in the list is deleted, and the list must include the "appsscript" manifest (type json) or the call is rejected before hitting the API. File names carry no extension ("Code", not "Code.gs"); the manifest cannot be deleted. Returns the resulting file set. This write is never retried after a 5xx or timeout — check with get_project_content before re-sending.',
      inputSchema: {
        script_id: scriptIdSchema(),
        files: z
          .array(scriptFileSchema())
          .min(1)
          .describe("The files to write (merge: upserted by name; replace: the entire new file set)."),
        mode: z
          .enum(["merge", "replace"])
          .optional()
          .describe(
            'merge (default): upsert the given files, keep the rest; replace: the given files become the whole project (manifest "appsscript" required).',
          ),
        delete_files: z
          .array(z.string().min(1))
          .optional()
          .describe('merge only: file names to remove (no extension). The "appsscript" manifest cannot be deleted.'),
      },
    },
    async ({ script_id, files, mode, delete_files }) => {
      try {
        if (mode === "replace") {
          if (delete_files && delete_files.length > 0) {
            return fail(
              new Error('delete_files only applies to mode "merge" — in replace mode simply omit the files to drop.'),
            );
          }
          return ok(await client.replaceProjectContent({ scriptId: script_id, files }));
        }
        return ok(await client.mergeProjectContent({ scriptId: script_id, files, deleteFiles: delete_files }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_project_metrics",
    {
      title: "Get execution metrics",
      annotations: READ_ONLY,
      description:
        "Returns execution metrics for the project: activeUsers, totalExecutions and failedExecutions as time series ({ value, startTime, endTime }; value is absent when zero). granularity daily covers the last 7 days, weekly aggregates by week. deployment_id narrows the numbers to one deployment. A rising failedExecutions count is the cue to call list_processes with statuses=[FAILED] for the concrete failures. Requires the script.metrics scope.",
      inputSchema: {
        script_id: scriptIdSchema(),
        granularity: z.enum(["daily", "weekly"]).describe("daily = last 7 days per day; weekly = per week."),
        deployment_id: deploymentIdOptional(),
      },
    },
    async ({ script_id, granularity, deployment_id }) => {
      try {
        return ok(
          await client.getProjectMetrics({ scriptId: script_id, granularity, deploymentId: deployment_id }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}

/** Local helper: an optional deployment filter (fresh schema per use). */
function deploymentIdOptional() {
  return z.string().min(1).optional().describe("Only count executions of this deployment.");
}
