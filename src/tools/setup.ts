import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoogleAppsScriptClient } from "../client.js";
import { ok, READ_ONLY } from "./util.js";

/**
 * The one tool that works without credentials: static, verified setup guidance.
 * The Apps Script API has more preconditions than most Google APIs (a per-user
 * toggle, a same-Cloud-project rule for scripts.run, per-operation scopes), and
 * burying them in failing 403s wastes a session — this surfaces them on demand.
 */
const SETUP_GUIDE = {
  enable_api: [
    "Enable the Google Apps Script API for the ACCOUNT: open https://script.google.com/home/usersettings and turn the 'Google Apps Script API' toggle ON. This is per-user; without it every call fails with 403 PERMISSION_DENIED even when OAuth is correct. Wait a few minutes after toggling.",
    "Enable the API for the CLOUD PROJECT that issued the OAuth client: https://console.cloud.google.com/apis/library/script.googleapis.com — press Enable.",
  ],
  oauth_setup: [
    "Create an OAuth client (type 'Desktop app') in the same Cloud project, configure the consent screen, and mint a refresh token for the scopes below (e.g. via the OAuth playground or a one-off local flow).",
    "Set GOOGLE_APPS_SCRIPT_CLIENT_ID + GOOGLE_APPS_SCRIPT_CLIENT_SECRET + GOOGLE_APPS_SCRIPT_REFRESH_TOKEN in the MCP client's server config and restart this server. A short-lived GOOGLE_APPS_SCRIPT_ACCESS_TOKEN works as a testing alternative.",
    "While the consent screen is in Testing mode, refresh tokens expire after 7 days — publish the app to keep them alive.",
  ],
  scopes: {
    "https://www.googleapis.com/auth/script.projects":
      "create_project, get_project, get_project_content, update_project_content, create_version, get_version, list_versions",
    "https://www.googleapis.com/auth/script.deployments": "manage_deployments (create/update/delete)",
    "https://www.googleapis.com/auth/script.deployments.readonly": "manage_deployments (list/get) — narrower alternative",
    "https://www.googleapis.com/auth/script.processes": "list_processes",
    "https://www.googleapis.com/auth/script.metrics": "get_project_metrics",
    note: "Request only the scopes for the tools you will use. run_function needs NONE of these — instead the token must carry every scope the target script itself uses (see run_function_extras).",
  },
  run_function_extras: [
    "The script needs an API-executable deployment: in the editor, Deploy > New deployment > API executable (or manage_deployments after adding executionApi access to the manifest).",
    "The OAuth client calling run_function must belong to the SAME Cloud project as the script: script editor > Project Settings > 'Google Cloud Platform (GCP) Project' > set the project NUMBER of the Cloud project that issued this server's OAuth client.",
    "The refresh token must include every scope the script uses (editor > Project Settings > show 'appsscript.json', or Overview > Project OAuth Scopes). A mismatch surfaces as 403 PERMISSION_DENIED or 404.",
  ],
  known_limits: [
    "The API cannot list your projects (keep scriptIds) and cannot delete a project — deleting the Drive file requires the Drive API, which this server does not expose.",
    "update_project_content writes the whole file set; versions are immutable; the @HEAD deployment cannot be deleted.",
    "list_processes reports failure status and timing but not error messages; logs live in the Apps Script dashboard / Cloud Logging.",
  ],
} as const;

export function registerSetupTools(server: McpServer, _client: GoogleAppsScriptClient): void {
  server.registerTool(
    "setup_instructions",
    {
      title: "Setup instructions",
      annotations: READ_ONLY,
      description:
        "Returns the setup checklist for this server as structured JSON: how to enable the Apps Script API (the per-account toggle at script.google.com/home/usersettings AND the Cloud-project API), which OAuth scope each tool needs (so the operator can mint a minimal-scope refresh token), the extra prerequisites of run_function (API-executable deployment, same-Cloud-project OAuth client, the script's own scopes), and the API's known limits. Works without credentials — call it first when any tool fails with 403 PERMISSION_DENIED or when setting the server up.",
      inputSchema: {},
    },
    async () => ok(SETUP_GUIDE),
  );
}
