import { test } from "node:test";
import assert from "node:assert/strict";
import { registerProjectTools } from "./projects.js";

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
    createProject: make("createProject"),
    getProject: make("getProject"),
    getProjectContent: make("getProjectContent"),
    replaceProjectContent: make("replaceProjectContent"),
    mergeProjectContent: make("mergeProjectContent"),
    getProjectMetrics: make("getProjectMetrics"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerProjectTools(server as never, client as never);
  return { calls, tools };
}

test("registers the five project tools", () => {
  const { tools } = harness();
  assert.deepEqual(
    Object.keys(tools).sort(),
    ["create_project", "get_project", "get_project_content", "get_project_metrics", "update_project_content"],
  );
});

test("create_project maps parent_id to parentId", async () => {
  const { calls, tools } = harness();
  await tools.create_project({ title: "T", parent_id: "drive-1" });
  assert.deepEqual(calls[0], { method: "createProject", params: [{ title: "T", parentId: "drive-1" }] });
});

test("get_project and get_project_content pass ids and the optional version through", async () => {
  const { calls, tools } = harness();
  await tools.get_project({ script_id: "s-1" });
  assert.deepEqual(calls[0], { method: "getProject", params: ["s-1"] });

  await tools.get_project_content({ script_id: "s-1" });
  assert.deepEqual(calls[1], { method: "getProjectContent", params: ["s-1", undefined] });

  await tools.get_project_content({ script_id: "s-1", version_number: 3 });
  assert.deepEqual(calls[2], { method: "getProjectContent", params: ["s-1", 3] });
});

test("update_project_content defaults to merge and routes replace explicitly", async () => {
  const { calls, tools } = harness();
  const files = [{ name: "Code", type: "server_js", source: "//" }];

  await tools.update_project_content({ script_id: "s-1", files });
  assert.equal(calls[0].method, "mergeProjectContent");
  assert.deepEqual(calls[0].params[0], { scriptId: "s-1", files, deleteFiles: undefined });

  await tools.update_project_content({ script_id: "s-1", files, mode: "merge", delete_files: ["Old"] });
  assert.deepEqual(calls[1].params[0], { scriptId: "s-1", files, deleteFiles: ["Old"] });

  await tools.update_project_content({ script_id: "s-1", files, mode: "replace" });
  assert.equal(calls[2].method, "replaceProjectContent");
  assert.deepEqual(calls[2].params[0], { scriptId: "s-1", files });
});

test("update_project_content rejects delete_files in replace mode without calling the client", async () => {
  const { calls, tools } = harness();
  const res = await tools.update_project_content({
    script_id: "s-1",
    files: [{ name: "appsscript", type: "json", source: "{}" }],
    mode: "replace",
    delete_files: ["Old"],
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /only applies to mode "merge"/);
  assert.equal(calls.length, 0, "validation failures must not reach the API");
});

test("get_project_metrics maps snake_case params", async () => {
  const { calls, tools } = harness();
  await tools.get_project_metrics({ script_id: "s-1", granularity: "daily", deployment_id: "d-1" });
  assert.deepEqual(calls[0], {
    method: "getProjectMetrics",
    params: [{ scriptId: "s-1", granularity: "daily", deploymentId: "d-1" }],
  });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "mergeProjectContent" });
  const res = await tools.update_project_content({
    script_id: "s-1",
    files: [{ name: "Code", type: "server_js", source: "//" }],
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
