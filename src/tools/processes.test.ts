import { test } from "node:test";
import assert from "node:assert/strict";
import { registerProcessTools } from "./processes.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function harness(opts: { throwOn?: string } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const client = {
    listProcesses: async (...params: unknown[]) => {
      calls.push({ method: "listProcesses", params });
      if (opts.throwOn === "listProcesses") throw new Error("boom");
      return { ok: true };
    },
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerProcessTools(server as never, client as never);
  return { calls, tools };
}

test("registers list_processes", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools), ["list_processes"]);
});

test("list_processes maps every snake_case filter to the client vocabulary", async () => {
  const { calls, tools } = harness();
  await tools.list_processes({
    script_id: "s-1",
    function_name: "main",
    deployment_id: "d-1",
    statuses: ["FAILED", "TIMED_OUT"],
    types: ["EXECUTION_API"],
    start_time: "2026-08-01T00:00:00Z",
    end_time: "2026-08-02T00:00:00Z",
    page_size: 25,
    page_token: "tok",
  });
  assert.deepEqual(calls[0], {
    method: "listProcesses",
    params: [
      {
        scriptId: "s-1",
        functionName: "main",
        deploymentId: "d-1",
        statuses: ["FAILED", "TIMED_OUT"],
        types: ["EXECUTION_API"],
        startTime: "2026-08-01T00:00:00Z",
        endTime: "2026-08-02T00:00:00Z",
        pageSize: 25,
        pageToken: "tok",
      },
    ],
  });
});

test("list_processes without script_id lists the caller's own processes", async () => {
  const { calls, tools } = harness();
  await tools.list_processes({});
  const params = calls[0].params[0] as Record<string, unknown>;
  assert.equal(params.scriptId, undefined);
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "listProcesses" });
  const res = await tools.list_processes({});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
