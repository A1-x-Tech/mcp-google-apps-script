import { test } from "node:test";
import assert from "node:assert/strict";
import { registerDeploymentTools } from "./deployments.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function harness(opts: { throwOn?: string } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const make =
    (method: string) =>
    async (...params: unknown[]) => {
      calls.push({ method, params });
      if (opts.throwOn === method) throw new Error("boom");
      return { ok: true };
    };
  const client = {
    createDeployment: make("createDeployment"),
    listDeployments: make("listDeployments"),
    getDeployment: make("getDeployment"),
    updateDeployment: make("updateDeployment"),
    deleteDeployment: make("deleteDeployment"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerDeploymentTools(server as never, client as never);
  return { calls, tools };
}

test("registers manage_deployments", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools), ["manage_deployments"]);
});

test("each action routes to the matching client method", async () => {
  const { calls, tools } = harness();
  await tools.manage_deployments({ script_id: "s", action: "create", version_number: 3, description: "prod" });
  assert.deepEqual(calls[0], {
    method: "createDeployment",
    params: [{ scriptId: "s", versionNumber: 3, description: "prod" }],
  });

  await tools.manage_deployments({ script_id: "s", action: "list" });
  assert.deepEqual(calls[1], {
    method: "listDeployments",
    params: [{ scriptId: "s", pageSize: undefined, pageToken: undefined }],
  });

  await tools.manage_deployments({ script_id: "s", action: "get", deployment_id: "d-1" });
  assert.deepEqual(calls[2], { method: "getDeployment", params: ["s", "d-1"] });

  await tools.manage_deployments({ script_id: "s", action: "update", deployment_id: "d-1", version_number: 4 });
  assert.deepEqual(calls[3], {
    method: "updateDeployment",
    params: [{ scriptId: "s", deploymentId: "d-1", versionNumber: 4, description: undefined }],
  });

  await tools.manage_deployments({ script_id: "s", action: "delete", deployment_id: "d-1" });
  assert.deepEqual(calls[4], { method: "deleteDeployment", params: ["s", "d-1"] });
});

test("list passes page_size/page_token through as pageSize/pageToken", async () => {
  const { calls, tools } = harness();
  await tools.manage_deployments({ script_id: "s", action: "list", page_size: 25, page_token: "tok" });
  assert.deepEqual(calls[0], {
    method: "listDeployments",
    params: [{ scriptId: "s", pageSize: 25, pageToken: "tok" }],
  });
});

test("create without version_number deploys HEAD (versionNumber undefined)", async () => {
  const { calls, tools } = harness();
  await tools.manage_deployments({ script_id: "s", action: "create" });
  assert.deepEqual(calls[0].params[0], { scriptId: "s", versionNumber: undefined, description: undefined });
});

test("missing per-action params fail without calling the client", async () => {
  const { calls, tools } = harness();

  for (const action of ["get", "update", "delete"]) {
    const res = await tools.manage_deployments({ script_id: "s", action });
    assert.equal(res.isError, true, action);
    assert.match(res.content[0].text, /requires deployment_id|requires/);
  }

  const update = await tools.manage_deployments({ script_id: "s", action: "update", deployment_id: "d-1" });
  assert.equal(update.isError, true);
  assert.match(update.content[0].text, /version_number and\/or description/);

  assert.equal(calls.length, 0, "validation failures must not reach the API");
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "deleteDeployment" });
  const res = await tools.manage_deployments({ script_id: "s", action: "delete", deployment_id: "d-1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
