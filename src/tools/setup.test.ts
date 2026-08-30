import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSetupTools } from "./setup.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function harness() {
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  // The setup tool must not need the client at all — it has to work degraded.
  registerSetupTools(server as never, undefined as never);
  return { tools };
}

test("registers setup_instructions", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools), ["setup_instructions"]);
});

test("setup_instructions works without credentials and covers the key prerequisites", async () => {
  const { tools } = harness();
  const res = await tools.setup_instructions({});
  assert.equal(res.isError, undefined);
  const guide = JSON.parse(res.content[0].text) as Record<string, unknown>;

  // The per-account toggle is the #1 cause of mysterious 403s.
  assert.match(JSON.stringify(guide.enable_api), /script\.google\.com\/home\/usersettings/);
  // Minimal scopes: each operation family names its scope.
  const scopes = guide.scopes as Record<string, string>;
  assert.ok(scopes["https://www.googleapis.com/auth/script.projects"].includes("update_project_content"));
  assert.ok(scopes["https://www.googleapis.com/auth/script.deployments"].includes("manage_deployments"));
  assert.ok(scopes["https://www.googleapis.com/auth/script.processes"].includes("list_processes"));
  assert.ok(scopes["https://www.googleapis.com/auth/script.metrics"].includes("get_project_metrics"));
  // run_function's same-Cloud-project rule must be spelled out.
  assert.match(JSON.stringify(guide.run_function_extras), /SAME Cloud project/);
  // The environment variables the operator must set.
  assert.match(JSON.stringify(guide.oauth_setup), /GOOGLE_APPS_SCRIPT_CLIENT_ID/);
});

test("setup_instructions never leaks environment values", async () => {
  const prev = process.env.GOOGLE_APPS_SCRIPT_REFRESH_TOKEN;
  process.env.GOOGLE_APPS_SCRIPT_REFRESH_TOKEN = "super-secret-refresh-token";
  try {
    const { tools } = harness();
    const res = await tools.setup_instructions({});
    assert.ok(!res.content[0].text.includes("super-secret-refresh-token"));
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_APPS_SCRIPT_REFRESH_TOKEN;
    else process.env.GOOGLE_APPS_SCRIPT_REFRESH_TOKEN = prev;
  }
});
