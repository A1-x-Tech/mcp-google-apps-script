#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleAppsScriptClient } from "./client.js";
import { ConfigError, DEFAULT_BASE, hasCredentials, loadConfig } from "./config.js";
import { instrumentToolCalls, Telemetry } from "./telemetry.js";
import type { GoogleAppsScriptConfig } from "./types.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerVersionTools } from "./tools/versions.js";
import { registerDeploymentTools } from "./tools/deployments.js";
import { registerExecutionTools } from "./tools/execution.js";
import { registerProcessTools } from "./tools/processes.js";
import { registerSetupTools } from "./tools/setup.js";
import { registerRawTool } from "./tools/raw.js";

/**
 * Prose handed to the calling model in the `initialize` result — the only place
 * it learns what the tool list cannot say: which Google product this API is,
 * what the API refuses to do, and the behaviours that make a naive loop
 * expensive, lossy or duplicating.
 */
const INSTRUCTIONS =
  "Google Apps Script API v1 manages script projects — code files, versions, deployments, " +
  "function runs and execution history. It is not the runtime services themselves: reading a " +
  "spreadsheet or sending mail happens INSIDE a script; this API only writes and runs that " +
  "script. There is no project list and no project delete — keep every scriptId create_project " +
  "returns (deleting means trashing the Drive file, outside this server). Every call needs the " +
  "per-account Apps Script API toggle at script.google.com/home/usersettings ON, or it fails " +
  "with 403 — call setup_instructions when anything is denied. update_project_content's replace " +
  "mode overwrites the WHOLE file set (merge mode preserves unnamed files but is not atomic); " +
  "the appsscript manifest must always survive; file names carry no extension. Editing HEAD " +
  "ships nothing: create_version snapshots it, manage_deployments points a deployment at the " +
  "version — update an existing deployment to keep its URL, deleting one breaks its URL forever. " +
  "run_function works only against an API-executable deployment, with an OAuth client from the " +
  "SAME Cloud project as the script, and a token carrying the script's own scopes; a script " +
  "throw returns script_error with the stack, not a transport error — fix the code, don't " +
  "retry. list_processes shows which executions failed but never the error text (that lives in " +
  "Cloud Logging). Writes are never retried after a 5xx or timeout: verify with a read before " +
  "re-sending; create_version re-sent blindly duplicates versions.";

/**
 * Prepended to INSTRUCTIONS when no credentials are configured. The model reads
 * this before it picks a tool, so an unconfigured session opens with the fix
 * rather than with a failed call. There is no in-chat login here: credentials
 * come only from the environment, so the fix is an operator action + restart.
 */
const UNCONFIGURED_PREFIX =
  "ATTENTION: Google Apps Script is not connected yet — no credentials are configured, so every " +
  "tool call except setup_instructions will fail. The operator must set GOOGLE_APPS_SCRIPT_CLIENT_ID + " +
  "GOOGLE_APPS_SCRIPT_CLIENT_SECRET + GOOGLE_APPS_SCRIPT_REFRESH_TOKEN (recommended), or " +
  "GOOGLE_APPS_SCRIPT_ACCESS_TOKEN with a short-lived access token, in the MCP client's " +
  "server config and restart this server — the variables are read only at startup. ";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads the config without dying on a bad value. A server that exits here never
 * completes the MCP handshake, so the user sees a dead server and no reason.
 * Instead the problem is carried into the session, where the model can read it
 * and relay it: the config degrades to "no credentials" and every tool call
 * fails with the actionable message.
 */
function loadConfigOrDegraded(telemetry: Telemetry): {
  config: GoogleAppsScriptConfig;
  problem?: ConfigError;
} {
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    // Fire-and-forget now that the process survives: the historical
    // `startup_failed` funnel stays comparable, but nothing blocks startup.
    telemetry.send("startup_failed", { reason: err.reason });
    return {
      config: { apiBase: process.env.GOOGLE_APPS_SCRIPT_API_BASE || DEFAULT_BASE },
      problem: err,
    };
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so missing
  // credentials can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const { config, problem } = loadConfigOrDegraded(telemetry);
  const client = new GoogleAppsScriptClient(config);

  // Decided once, at startup: credentials come only from the environment, so
  // "restart after setting the variables" is the accurate advice to give.
  const connected = hasCredentials(config);

  const server = new McpServer(
    {
      name: "mcp-google-apps-script",
      version: readVersion(),
    },
    // Surfaces in the initialize result, before the client sees a single tool.
    {
      instructions: connected
        ? INSTRUCTIONS
        : UNCONFIGURED_PREFIX + (problem ? `Configuration problem: ${problem.message} ` : "") + INSTRUCTIONS,
    },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    // Split on purpose: `server_start` keeps meaning "a usable install started",
    // so the unconfigured case gets its own event instead of inflating that number.
    if (connected) telemetry.send("server_start");
    else telemetry.send("unconfigured_start", { reason: problem?.reason ?? "missing_credentials" });
  };

  registerProjectTools(server, client);
  registerVersionTools(server, client);
  registerDeploymentTools(server, client);
  registerExecutionTools(server, client);
  registerProcessTools(server, client);
  registerSetupTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-google-apps-script running on stdio${connected ? "" : " (no credentials — set the environment variables and restart)"}`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting mcp-google-apps-script:", err);
  process.exit(1);
});
