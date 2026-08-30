import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAppsScriptClient } from "../client.js";
import { DESTRUCTIVE, fail, ok, scriptIdSchema } from "./util.js";

export function registerExecutionTools(server: McpServer, client: GoogleAppsScriptClient): void {
  server.registerTool(
    "run_function",
    {
      title: "Run a script function",
      // The function can do anything the script's scopes allow — delete files,
      // send mail. Annotate for the worst case a call can do, not the average.
      annotations: DESTRUCTIVE,
      description:
        "Runs a named function in the script and returns { done, result } — or, when the script itself throws, { done, script_error: { type, message, stack } } with the Apps Script stack trace (this is a script bug, not a transport error; do not blindly retry, the function may have side effects). HARD PREREQUISITES the API enforces: (1) the script must have an API-executable deployment (Deploy > New deployment > API executable, or a manifest with executionApi); (2) this server's OAuth client must belong to the SAME Google Cloud project as the script (script editor > Project Settings > change the GCP project number); (3) the OAuth token must carry every scope the script itself uses (listed in the editor under Project Settings > Show \"appsscript.json\") — otherwise the call fails with 403 PERMISSION_DENIED or 404. parameters are positional and must be JSON-serializable (no Apps Script objects like Document or Range). dev_mode=true runs the latest saved code instead of the deployed version — owner only. Executions time out after 6 minutes on the Apps Script side.",
      inputSchema: {
        script_id: scriptIdSchema(),
        function_name: z.string().min(1).describe("The name of the function to run, without parentheses."),
        parameters: z
          .array(z.any())
          .optional()
          .describe("Positional arguments, JSON-serializable primitives/arrays/objects only."),
        dev_mode: z
          .boolean()
          .optional()
          .describe("Run the latest saved code instead of the deployed version (script owner only; default false)."),
      },
    },
    async ({ script_id, function_name, parameters, dev_mode }) => {
      try {
        return ok(
          await client.runFunction({
            scriptId: script_id,
            functionName: function_name,
            parameters,
            devMode: dev_mode,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
