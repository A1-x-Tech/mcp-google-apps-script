import { test } from "node:test";
import assert from "node:assert/strict";
import { registerProjectTools } from "./projects.js";
import { registerVersionTools } from "./versions.js";
import { registerDeploymentTools } from "./deployments.js";
import { registerExecutionTools } from "./execution.js";
import { registerProcessTools } from "./processes.js";
import { registerSetupTools } from "./setup.js";
import { registerRawTool } from "./raw.js";
import { DESTRUCTIVE, READ_ONLY, UPDATE, WRITE } from "./util.js";

interface Annotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Registers every tool against a fake server, capturing each tool's annotations. */
function collectAnnotations(): Record<string, Annotations | undefined> {
  const annotations: Record<string, Annotations | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Annotations }) => {
      annotations[name] = cfg.annotations;
    },
  };
  // Registration reads the client only inside handlers, so a stub is fine here.
  registerProjectTools(server as never, {} as never);
  registerVersionTools(server as never, {} as never);
  registerDeploymentTools(server as never, {} as never);
  registerExecutionTools(server as never, {} as never);
  registerProcessTools(server as never, {} as never);
  registerSetupTools(server as never, {} as never);
  registerRawTool(server as never, {} as never);
  return annotations;
}

const ANN = collectAnnotations();

/**
 * The Apps Script API mixes reads and writes, so instead of one blanket
 * invariant the expected hints are pinned per tool. Changing a tool's
 * annotation must be a conscious decision that updates this map.
 */
const EXPECTED: Record<string, Annotations> = {
  create_project: WRITE,
  get_project: READ_ONLY,
  get_project_content: READ_ONLY,
  update_project_content: UPDATE,
  get_project_metrics: READ_ONLY,
  create_version: WRITE,
  list_versions: READ_ONLY,
  get_version: READ_ONLY,
  manage_deployments: DESTRUCTIVE,
  run_function: DESTRUCTIVE,
  list_processes: READ_ONLY,
  setup_instructions: READ_ONLY,
  raw_request: DESTRUCTIVE,
};

test("registers all thirteen tools with annotations", () => {
  assert.deepEqual(Object.keys(ANN).sort(), Object.keys(EXPECTED).sort());
  for (const [name, a] of Object.entries(ANN)) {
    assert.ok(a, `${name} is missing annotations`);
  }
});

test("every tool carries exactly its pinned hints (all four set)", () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(ANN[name], expected, `${name} annotations drifted`);
  }
});

test("run_function is never presented as a safe read — it executes arbitrary script code", () => {
  assert.equal(ANN.run_function?.readOnlyHint, false);
  assert.equal(ANN.run_function?.destructiveHint, true);
  assert.equal(ANN.run_function?.idempotentHint, false);
});

test("the execution history and metrics stay read-only", () => {
  for (const name of ["list_processes", "get_project_metrics"]) {
    assert.equal(ANN[name]?.readOnlyHint, true, `${name} must be read-only`);
  }
});
