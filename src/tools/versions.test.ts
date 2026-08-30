import { test } from "node:test";
import assert from "node:assert/strict";
import { registerVersionTools } from "./versions.js";

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
    createVersion: make("createVersion"),
    listVersions: make("listVersions"),
    getVersion: make("getVersion"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerVersionTools(server as never, client as never);
  return { calls, tools };
}

test("registers the three version tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["create_version", "get_version", "list_versions"]);
});

test("each tool routes to the matching client method", async () => {
  const { calls, tools } = harness();
  await tools.create_version({ script_id: "s-1", description: "notes" });
  assert.deepEqual(calls[0], { method: "createVersion", params: [{ scriptId: "s-1", description: "notes" }] });

  await tools.list_versions({ script_id: "s-1", page_size: 5, page_token: "tok" });
  assert.deepEqual(calls[1], {
    method: "listVersions",
    params: [{ scriptId: "s-1", pageSize: 5, pageToken: "tok" }],
  });

  await tools.get_version({ script_id: "s-1", version_number: 7 });
  assert.deepEqual(calls[2], { method: "getVersion", params: ["s-1", 7] });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "createVersion" });
  const res = await tools.create_version({ script_id: "s-1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
