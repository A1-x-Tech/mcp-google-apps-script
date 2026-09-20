import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleAppsScriptClient } from "../dist/client.js";
import { registerProjectTools } from "../dist/tools/projects.js";
import { registerVersionTools } from "../dist/tools/versions.js";
import { registerDeploymentTools } from "../dist/tools/deployments.js";
import { registerExecutionTools } from "../dist/tools/execution.js";
import { registerProcessTools } from "../dist/tools/processes.js";
import { registerSetupTools } from "../dist/tools/setup.js";
import { registerRawTool } from "../dist/tools/raw.js";
import { registerAuthTools } from "../dist/tools/auth.js";

/**
 * Sorted, because every assertion compares it against a sorted tool list. The
 * six onboarding tools come from @a1-x-tech/mcp-google-auth, so this list is
 * also the check that the component is wired into the published binary.
 */
const ALL_TOOLS = [
  "auth_status",
  "create_project",
  "create_version",
  "finish_login",
  "get_project",
  "get_project_content",
  "get_project_metrics",
  "get_version",
  "list_processes",
  "list_versions",
  "logout",
  "manage_deployments",
  "raw_request",
  "run_function",
  "set_client",
  "setup_instructions",
  "start_login",
  "update_project_content",
];

/**
 * A throwaway $XDG_CONFIG_HOME for the spawned server. The auth component
 * re-reads $XDG_CONFIG_HOME/mcp-google-apps-script/credentials.json per call, so
 * without this a real login on the developer's machine would make the
 * "unconfigured" case pass for the wrong reason.
 */
function isolatedConfigDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-apps-script-dist-smoke-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}


test("dist client rejects foreign-origin paths before sending the Bearer token", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    const client = new GoogleAppsScriptClient({
      accessToken: "SECRET",
      apiBase: "https://script.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await assert.rejects(() => client.request("GET", "https://example.invalid/steal"), /foreign origin/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("dist client sends the Bearer token and JSON bodies", async () => {
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return new Response('{"scriptId":"s-1"}', { status: 200 });
  };
  try {
    const client = new GoogleAppsScriptClient({
      accessToken: "SECRET",
      apiBase: "https://script.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await client.createProject({ title: "Smoke" });
    assert.equal(seen.url, "https://script.googleapis.com/v1/projects");
    assert.equal(seen.auth, "Bearer SECRET");
    assert.deepEqual(seen.body, { title: "Smoke" });
  } finally {
    globalThis.fetch = original;
  }
});

test("dist registers the expected tools", () => {
  const names = [];
  const server = {
    registerTool(name) {
      names.push(name);
    },
  };
  const client = {};

  registerAuthTools(server, client);
  registerProjectTools(server, client);
  registerVersionTools(server, client);
  registerDeploymentTools(server, client);
  registerExecutionTools(server, client);
  registerProcessTools(server, client);
  registerSetupTools(server, client);
  registerRawTool(server, client);

  assert.deepEqual(names.sort(), ALL_TOOLS);
});

test("dist binary completes a real MCP handshake over stdio and lists every tool", async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: {
      ...process.env,
      GOOGLE_APPS_SCRIPT_ACCESS_TOKEN: "test-token",
      XDG_CONFIG_HOME: isolatedConfigDir(t),
      ASKADS_TELEMETRY: "0", // keep the suite offline
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    const server = client.getServerVersion();
    assert.equal(server?.name, "mcp-google-apps-script");
    assert.match(String(server?.version), /^\d+\.\d+\.\d+$/);

    // The instructions the calling model reads before it picks any tool.
    const instructions = client.getInstructions();
    assert.equal(typeof instructions, "string");
    assert.ok(instructions.trim().length > 0, "initialize result carries no instructions");
    assert.match(instructions, /Google Apps Script API v1/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    const getProject = tools.find((t) => t.name === "get_project");
    assert.equal(getProject.annotations?.readOnlyHint, true);
    assert.ok(getProject.inputSchema?.properties?.script_id, "input schema must reach the client");
  } finally {
    await client.close();
  }
});

/**
 * The degraded-start contract: without any credentials the binary must not
 * exit before the handshake and leave the client a dead server with no reason.
 * It must start, list every tool, open the instructions with the fix, and
 * answer a tool call with the actionable error — offline: the CredentialsError
 * fires before any fetch, so this test never touches the network.
 */
test("dist binary starts without credentials: handshake, tool list, actionable call error", async (t) => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("GOOGLE_APPS_SCRIPT_"),
    ),
  );
  env.ASKADS_TELEMETRY = "0"; // keep the suite offline
  env.XDG_CONFIG_HOME = isolatedConfigDir(t); // ignore any real login on this machine
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke-unconfigured", version: "0.0.0" });
  await client.connect(transport);
  try {
    // The model must read the fix before it picks a tool.
    const instructions = client.getInstructions() ?? "";
    assert.match(instructions, /NOT CONNECTED/);
    assert.match(instructions, /start_login/);
    assert.match(instructions, /GOOGLE_APPS_SCRIPT_CLIENT_ID/);
    assert.match(instructions, /restart/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    // A tool call fails with the exact message instead of killing the server.
    const result = await client.callTool({ name: "get_project", arguments: { script_id: "smoke-script" } });
    assert.equal(result.isError, true);
    const text = result.content.map((c) => c.text ?? "").join(" ");
    assert.match(text, /not connected/i);
    assert.match(text, /start_login/);
    assert.match(text, /restart the server/);

    // setup_instructions is the one tool that must still work — it is how an
    // unconfigured session learns the way out.
    const setup = await client.callTool({ name: "setup_instructions", arguments: {} });
    assert.equal(setup.isError, undefined);
    assert.match(String(setup.content[0].text), /script\.google\.com\/home\/usersettings/);
  } finally {
    await client.close();
  }
});
