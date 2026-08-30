import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAppsScriptClient, HttpMethod } from "../client.js";
import { DESTRUCTIVE, fail, ok } from "./util.js";

export function registerRawTool(server: McpServer, client: GoogleAppsScriptClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Raw Google Apps Script API call",
      // Full API surface incl. content replacement and deployment deletion —
      // annotate for the worst case a call can do, not the average.
      annotations: DESTRUCTIVE,
      description:
        'Escape hatch to call any Google Apps Script API v1 path directly, for requests the typed tools don\'t cover — e.g. GET "v1/projects/<scriptId>/content?versionNumber=3", or a PUT to "v1/projects/<scriptId>/content" with a hand-built files body. The path may carry a query string; repeated filter params can be encoded there (e.g. "v1/processes?userProcessFilter.statuses=FAILED&userProcessFilter.statuses=TIMED_OUT"). The Bearer token is added automatically and paths resolving to a foreign origin are rejected; the method defaults to GET. Remember: PUT v1/projects/<id>/content replaces the ENTIRE file set — prefer update_project_content, whose merge mode protects the other files.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('API path relative to https://script.googleapis.com, e.g. "v1/projects/<scriptId>/deployments".'),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE"])
          .optional()
          .describe("HTTP method (the Apps Script API uses only these four). Defaults to GET."),
        body: z.record(z.any()).optional().describe("JSON request body (POST/PUT only)."),
      },
    },
    async ({ path, method, body }) => {
      try {
        const m = (method ?? "GET") as HttpMethod;
        return ok(await client.request(m, path, body));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
