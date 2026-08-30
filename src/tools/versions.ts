import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAppsScriptClient } from "../client.js";
import { fail, ok, READ_ONLY, scriptIdSchema, versionNumberSchema, WRITE } from "./util.js";

export function registerVersionTools(server: McpServer, client: GoogleAppsScriptClient): void {
  server.registerTool(
    "create_version",
    {
      title: "Create a version",
      annotations: WRITE,
      description:
        "Snapshots the project's current HEAD content as a new immutable version and returns it (versionNumber, description, createTime). Versions cannot be edited or deleted, and version numbers only grow — every call creates a NEW version, so do not re-send after an ambiguous failure without checking list_versions first. Creating a version does not change what runs anywhere: point a deployment at the new versionNumber via manage_deployments (action=create or update) to ship it.",
      inputSchema: {
        script_id: scriptIdSchema(),
        description: z
          .string()
          .optional()
          .describe("Human-readable changelog line for this version (shown in the editor's version list)."),
      },
    },
    async ({ script_id, description }) => {
      try {
        return ok(await client.createVersion({ scriptId: script_id, description }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_versions",
    {
      title: "List versions",
      annotations: READ_ONLY,
      description:
        "Lists the project's immutable versions (versionNumber, description, createTime), newest first. Paginate with page_token from nextPageToken. Use it to pick a versionNumber for manage_deployments or to read old code via get_project_content with version_number.",
      inputSchema: {
        script_id: scriptIdSchema(),
        page_size: z.number().int().min(1).max(50).optional().describe("Versions per page (1..50; API default 50)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
      },
    },
    async ({ script_id, page_size, page_token }) => {
      try {
        return ok(await client.listVersions({ scriptId: script_id, pageSize: page_size, pageToken: page_token }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_version",
    {
      title: "Get a version",
      annotations: READ_ONLY,
      description:
        "Fetches one immutable version by its number: versionNumber, description and createTime. For the code of that version call get_project_content with version_number instead — this endpoint returns metadata only.",
      inputSchema: {
        script_id: scriptIdSchema(),
        version_number: versionNumberSchema().describe("The version number from create_version or list_versions."),
      },
    },
    async ({ script_id, version_number }) => {
      try {
        return ok(await client.getVersion(script_id, version_number));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
