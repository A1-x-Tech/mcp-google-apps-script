import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAppsScriptClient } from "../client.js";
import { DESTRUCTIVE, deploymentIdSchema, fail, ok, scriptIdSchema, versionNumberSchema } from "./util.js";

export function registerDeploymentTools(server: McpServer, client: GoogleAppsScriptClient): void {
  server.registerTool(
    "manage_deployments",
    {
      title: "Manage deployments",
      // One tool covers create/list/get/update/delete; delete removes state, so
      // the whole tool carries the destructive, non-idempotent hints.
      annotations: DESTRUCTIVE,
      description:
        "Manages the project's deployments — the published entry points (web app, API executable, add-on) that make code callable from outside the editor. action=create deploys version_number (omit it to deploy HEAD — updates live with every save; fine for testing, risky for production) with an optional description. action=list shows all deployments including the automatic @HEAD one (paginate with page_token from nextPageToken); get needs deployment_id and returns entryPoints[] — the web app URL (webApp.url) and the API-executable config run_function depends on. action=update repoints an existing deployment at another version_number and/or changes its description (this is how you ship or roll back without changing the URL; the current config is read first and merged, so omitted fields are preserved); delete removes it permanently and breaks its URL/integrations (the @HEAD deployment cannot be deleted). WHAT a deployment exposes (web app vs API executable, who can access) comes from the appsscript manifest at the deployed version — set it via update_project_content before creating the version. Requires the script.deployments scope.",
      inputSchema: {
        script_id: scriptIdSchema(),
        action: z.enum(["create", "list", "get", "update", "delete"]).describe("What to do with the deployments."),
        deployment_id: deploymentIdSchema().optional().describe("get/update/delete: the deployment to target."),
        version_number: versionNumberSchema()
          .optional()
          .describe("create/update: the immutable version to deploy; omit on create to deploy HEAD."),
        description: z.string().optional().describe("create/update: human-readable deployment description."),
        page_size: z.number().int().min(1).max(50).optional().describe("list: deployments per page (1..50; API default 50)."),
        page_token: z.string().optional().describe("list: nextPageToken from the previous page."),
      },
    },
    async ({ script_id, action, deployment_id, version_number, description, page_size, page_token }) => {
      try {
        switch (action) {
          case "create":
            return ok(
              await client.createDeployment({
                scriptId: script_id,
                versionNumber: version_number,
                description,
              }),
            );
          case "list":
            return ok(
              await client.listDeployments({ scriptId: script_id, pageSize: page_size, pageToken: page_token }),
            );
          case "get":
            if (!deployment_id) return fail(new Error('action "get" requires deployment_id.'));
            return ok(await client.getDeployment(script_id, deployment_id));
          case "update":
            if (!deployment_id) return fail(new Error('action "update" requires deployment_id.'));
            if (version_number === undefined && description === undefined) {
              return fail(new Error('action "update" requires version_number and/or description.'));
            }
            return ok(
              await client.updateDeployment({
                scriptId: script_id,
                deploymentId: deployment_id,
                versionNumber: version_number,
                description,
              }),
            );
          case "delete":
            if (!deployment_id) return fail(new Error('action "delete" requires deployment_id.'));
            return ok(await client.deleteDeployment(script_id, deployment_id));
        }
      } catch (e) {
        return fail(e);
      }
    },
  );
}
