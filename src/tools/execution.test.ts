import { test } from "node:test";
import assert from "node:assert/strict";
import { registerExecutionTools } from "./execution.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function harness(opts: { throwOn?: string; result?: unknown } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const client = {
    runFunction: async (...params: unknown[]) => {
      calls.push({ method: "runFunction", params });
      if (opts.throwOn === "runFunction") throw new Error("boom");
      return opts.result ?? { done: true, result: null };
    },
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerExecutionTools(server as never, client as never);
  return { calls, tools };
}

test("registers run_function", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools), ["run_function"]);
});

test("run_function maps snake_case params to the client vocabulary", async () => {
  const { calls, tools } = harness();
  await tools.run_function({
    script_id: "s-1",
    function_name: "sum",
    parameters: [1, "two", { three: 3 }],
    dev_mode: true,
  });
  assert.deepEqual(calls[0], {
    method: "runFunction",
    params: [{ scriptId: "s-1", functionName: "sum", parameters: [1, "two", { three: 3 }], devMode: true }],
  });
});

test("a script_error result passes through as a normal (non-isError) result", async () => {
  const { tools } = harness({
    result: { done: true, script_error: { type: "TypeError", message: "x", stack: [] } },
  });
  const res = await tools.run_function({ script_id: "s-1", function_name: "main" });
  assert.equal(res.isError, undefined, "a script bug is data for the model, not a tool failure");
  assert.match(res.content[0].text, /script_error/);
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "runFunction" });
  const res = await tools.run_function({ script_id: "s-1", function_name: "main" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
