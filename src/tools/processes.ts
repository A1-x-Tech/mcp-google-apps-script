import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAppsScriptClient } from "../client.js";
import { fail, ok, READ_ONLY, rfc3339Timestamp } from "./util.js";

export function registerProcessTools(server: McpServer, client: GoogleAppsScriptClient): void {
  server.registerTool(
    "list_processes",
    {
      title: "List execution processes",
      annotations: READ_ONLY,
      description:
        "Lists execution processes (the execution history): each entry carries projectName, functionName, processType (WEBAPP, EXECUTION_API, TIME_DRIVEN, TRIGGER, SIMPLE_TRIGGER, ADD_ON, EDITOR, MENU, BATCH_TASK), processStatus (COMPLETED, FAILED, TIMED_OUT, RUNNING, PAUSED, CANCELED, DELAYED, UNKNOWN), userAccessLevel, startTime and duration. With script_id only that script's executions are listed; without it, ALL executions started by the authorizing user across their scripts. To hunt errors, filter statuses=[\"FAILED\",\"TIMED_OUT\"] — but note the API returns no error messages or logs here, only the fact and time of failure: get the message by re-running via run_function, or from the Apps Script dashboard / Cloud Logging. start_time/end_time (RFC3339 UTC) bound the process start; paginate with page_token. Requires the script.processes scope.",
      inputSchema: {
        script_id: z
          .string()
          .min(1)
          .optional()
          .describe("Limit to this script's executions; omit for all of the caller's executions."),
        function_name: z.string().optional().describe("Only processes that ran this function."),
        deployment_id: z.string().optional().describe("Only processes of this deployment."),
        statuses: z
          .array(
            z.enum(["RUNNING", "PAUSED", "COMPLETED", "CANCELED", "FAILED", "TIMED_OUT", "UNKNOWN", "DELAYED"]),
          )
          .optional()
          .describe('Only these process states, e.g. ["FAILED","TIMED_OUT"] for error hunting.'),
        types: z
          .array(
            z.enum([
              "ADD_ON",
              "EXECUTION_API",
              "TIME_DRIVEN",
              "TRIGGER",
              "WEBAPP",
              "EDITOR",
              "SIMPLE_TRIGGER",
              "MENU",
              "BATCH_TASK",
            ]),
          )
          .optional()
          .describe("Only these launch types (EXECUTION_API = run_function calls, TIME_DRIVEN = clock triggers)."),
        start_time: rfc3339Timestamp()
          .optional()
          .describe("Only processes started at or after this RFC3339 UTC timestamp."),
        end_time: rfc3339Timestamp()
          .optional()
          .describe("Only processes started before this RFC3339 UTC timestamp."),
        page_size: z.number().int().min(1).max(50).optional().describe("Processes per page (1..50; API default 50)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
      },
    },
    async ({ script_id, function_name, deployment_id, statuses, types, start_time, end_time, page_size, page_token }) => {
      try {
        return ok(
          await client.listProcesses({
            scriptId: script_id,
            functionName: function_name,
            deploymentId: deployment_id,
            statuses,
            types,
            startTime: start_time,
            endTime: end_time,
            pageSize: page_size,
            pageToken: page_token,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
