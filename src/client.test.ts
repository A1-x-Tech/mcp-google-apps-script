import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScriptFiles, GoogleAppsScriptClient, normalizeRunOperation } from "./client.js";
import { CredentialsError, MISSING_CREDENTIALS_MESSAGE } from "./config.js";
import type { GoogleAppsScriptConfig } from "./types.js";

const BASE = "https://script.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Call = { url: string; method: string; auth: unknown; body: string | undefined };

/** A client on a static access token — no token-endpoint traffic expected. */
function staticConfig(extra: Partial<GoogleAppsScriptConfig> = {}): GoogleAppsScriptConfig {
  return { accessToken: "STATIC", apiBase: BASE, maxRetries: 0, retryBaseMs: 0, ...extra };
}

/** A client on the refresh flow. */
function refreshConfig(extra: Partial<GoogleAppsScriptConfig> = {}): GoogleAppsScriptConfig {
  return {
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtok",
    apiBase: BASE,
    maxRetries: 0,
    retryBaseMs: 0,
    ...extra,
  };
}

/** Installs a recording fetch stub; the handler decides each response. */
function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as RequestInit & { headers?: Record<string, string> };
    calls.push({
      url: String(url),
      method: String(i.method),
      auth: i.headers?.Authorization,
      body: typeof i.body === "string" ? i.body : undefined,
    });
    return handler(String(url), i, calls.length);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const okJson = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

/** Default handler: token endpoint mints TOK-1, everything else returns { ok: true }. */
function defaultHandler(url: string): Response {
  if (url === TOKEN_URL) return okJson({ access_token: "TOK-1", expires_in: 3600 });
  return okJson({ ok: true });
}

// ---- Auth ----

/**
 * The degraded-start contract: a server without credentials still runs, so the
 * client must fail the call itself — with the exact actionable message, before
 * any fetch. Zero fetch calls proves the error skips the retry/backoff loop
 * and the forced 401 re-mint alike (maxRetries is deliberately non-zero here).
 */
test("no credentials at all: CredentialsError with the exact text, fetch never called", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient({ apiBase: BASE, maxRetries: 3, retryBaseMs: 0 });
    await assert.rejects(
      () => client.getProject("abc"),
      (err: unknown) => {
        assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
        assert.equal(err.message, MISSING_CREDENTIALS_MESSAGE);
        // The historical startup error, verbatim — the message is the product.
        assert.ok(
          err.message.startsWith(
            "Google OAuth credentials are required: set GOOGLE_APPS_SCRIPT_CLIENT_ID + " +
              "GOOGLE_APPS_SCRIPT_CLIENT_SECRET + GOOGLE_APPS_SCRIPT_REFRESH_TOKEN (recommended), " +
              "or GOOGLE_APPS_SCRIPT_ACCESS_TOKEN with a short-lived access token.",
          ),
          "the message must open with the historical startup error, verbatim",
        );
        assert.match(err.message, /restart the server/, "the fix must mention the restart");
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "must not fetch at all — no retries, no token mint, no replay");
  } finally {
    mock.restore();
  }
});

test("static access token: Bearer header, no token-endpoint traffic", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleAppsScriptClient(staticConfig()).getProject("abc");
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, `${BASE}/v1/projects/abc`);
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[0].auth, "Bearer STATIC");
  } finally {
    mock.restore();
  }
});

test("refresh flow: mints a token first, then caches it across requests", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient(refreshConfig());
    await client.getProject("abc");
    await client.getProject("def");

    const tokenCalls = mock.calls.filter((c) => c.url === TOKEN_URL);
    assert.equal(tokenCalls.length, 1, "the second request must reuse the cached token");
    assert.equal(tokenCalls[0].method, "POST");
    const params = new URLSearchParams(tokenCalls[0].body);
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("client_id"), "cid");
    assert.equal(params.get("client_secret"), "csec");
    assert.equal(params.get("refresh_token"), "rtok");

    const apiCalls = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`));
    assert.equal(apiCalls.length, 2);
    for (const call of apiCalls) assert.equal(call.auth, "Bearer TOK-1");
  } finally {
    mock.restore();
  }
});

test("a 401 forces one re-mint and replays the request", async () => {
  let minted = 0;
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      minted++;
      return okJson({ access_token: `TOK-${minted}`, expires_in: 3600 });
    }
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleAppsScriptClient(refreshConfig()).getProject("abc");
    assert.deepEqual(result, { ok: true });
    assert.equal(minted, 2, "the 401 must force a second mint");
    const lastApi = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`)).at(-1);
    assert.equal(lastApi?.auth, "Bearer TOK-2");
  } finally {
    mock.restore();
  }
});

test("a persistent 401 throws instead of looping", async () => {
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) return okJson({ access_token: "TOK", expires_in: 3600 });
    apiHits++;
    return new Response('{"error":{"message":"nope","status":"UNAUTHENTICATED"}}', { status: 401 });
  });
  try {
    await assert.rejects(
      () => new GoogleAppsScriptClient(refreshConfig()).getProject("abc"),
      /HTTP 401: \[UNAUTHENTICATED\] nope/,
    );
    assert.equal(apiHits, 2, "exactly one replay after the forced re-mint");
  } finally {
    mock.restore();
  }
});

test("a failed token exchange surfaces the OAuth error", async () => {
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      return new Response('{"error":"invalid_grant","error_description":"Token has been revoked."}', {
        status: 400,
      });
    }
    return okJson({ ok: true });
  });
  try {
    await assert.rejects(
      () => new GoogleAppsScriptClient(refreshConfig()).getProject("abc"),
      /HTTP 400: invalid_grant: Token has been revoked\./,
    );
  } finally {
    mock.restore();
  }
});

// ---- Projects ----

test("createProject posts title and optional parentId", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.createProject({ title: "My script" });
    assert.equal(mock.calls[0].url, `${BASE}/v1/projects`);
    assert.equal(mock.calls[0].method, "POST");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { title: "My script" });

    await client.createProject({ title: "Bound", parentId: "drive-file-1" });
    assert.deepEqual(JSON.parse(mock.calls[1].body!), { title: "Bound", parentId: "drive-file-1" });
  } finally {
    mock.restore();
  }
});

test("getProjectContent hits /content, with versionNumber as a query param", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.getProjectContent("s-1");
    assert.equal(mock.calls[0].url, `${BASE}/v1/projects/s-1/content`);
    await client.getProjectContent("s-1", 4);
    assert.equal(mock.calls[1].url, `${BASE}/v1/projects/s-1/content?versionNumber=4`);
  } finally {
    mock.restore();
  }
});

test("replaceProjectContent PUTs the mapped file set", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleAppsScriptClient(staticConfig()).replaceProjectContent({
      scriptId: "s-1",
      files: [
        { name: "appsscript", type: "json", source: "{}" },
        { name: "Code", type: "server_js", source: "function main() {}" },
        { name: "Page", type: "html", source: "<b>hi</b>" },
      ],
    });
    assert.equal(mock.calls[0].method, "PUT");
    assert.equal(mock.calls[0].url, `${BASE}/v1/projects/s-1/content`);
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      files: [
        { name: "appsscript", type: "JSON", source: "{}" },
        { name: "Code", type: "SERVER_JS", source: "function main() {}" },
        { name: "Page", type: "HTML", source: "<b>hi</b>" },
      ],
    });
  } finally {
    mock.restore();
  }
});

test("replaceProjectContent without the manifest is rejected before any fetch", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await assert.rejects(
      () =>
        new GoogleAppsScriptClient(staticConfig()).replaceProjectContent({
          scriptId: "s-1",
          files: [{ name: "Code", type: "server_js", source: "//" }],
        }),
      /"appsscript" manifest/,
    );
    assert.equal(mock.calls.length, 0, "the guard must fire before the network");
  } finally {
    mock.restore();
  }
});

test("mergeProjectContent reads HEAD, upserts by name, keeps the rest verbatim", async () => {
  const mock = mockFetch((url, init) => {
    if (String(init.method) === "GET") {
      return okJson({
        scriptId: "s-1",
        files: [
          { name: "appsscript", type: "JSON", source: "{}", updateTime: "x" },
          { name: "Code", type: "SERVER_JS", source: "old", lastModifyUser: {} },
          { name: "Legacy", type: "SERVER_JS", source: "keep me" },
        ],
      });
    }
    return okJson({ ok: true });
  });
  try {
    await new GoogleAppsScriptClient(staticConfig()).mergeProjectContent({
      scriptId: "s-1",
      files: [
        { name: "Code", type: "server_js", source: "new" },
        { name: "Fresh", type: "html", source: "<i>new file</i>" },
      ],
    });
    assert.equal(mock.calls.length, 2);
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[1].method, "PUT");
    // Untouched files survive with only name/type/source (no output-only fields
    // echoed back); named files are replaced; new files appended.
    assert.deepEqual(JSON.parse(mock.calls[1].body!), {
      files: [
        { name: "appsscript", type: "JSON", source: "{}" },
        { name: "Code", type: "SERVER_JS", source: "new" },
        { name: "Legacy", type: "SERVER_JS", source: "keep me" },
        { name: "Fresh", type: "HTML", source: "<i>new file</i>" },
      ],
    });
  } finally {
    mock.restore();
  }
});

test("mergeProjectContent deletes named files but shields the manifest and unknown names", async () => {
  const head = {
    files: [
      { name: "appsscript", type: "JSON", source: "{}" },
      { name: "Old", type: "SERVER_JS", source: "//" },
    ],
  };
  const mock = mockFetch((url, init) => (String(init.method) === "GET" ? okJson(head) : okJson({ ok: true })));
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.mergeProjectContent({ scriptId: "s-1", files: [], deleteFiles: ["Old"] });
    assert.deepEqual(JSON.parse(mock.calls[1].body!), {
      files: [{ name: "appsscript", type: "JSON", source: "{}" }],
    });

    await assert.rejects(
      () => client.mergeProjectContent({ scriptId: "s-1", files: [], deleteFiles: ["appsscript"] }),
      /manifest cannot be deleted/,
    );
    await assert.rejects(
      () => client.mergeProjectContent({ scriptId: "s-1", files: [], deleteFiles: ["Nope"] }),
      /no file with that name/,
    );
  } finally {
    mock.restore();
  }
});

test("getProjectMetrics maps granularity and the deployment filter to query params", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.getProjectMetrics({ scriptId: "s-1", granularity: "daily" });
    let url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/projects/s-1/metrics");
    assert.equal(url.searchParams.get("metricsGranularity"), "DAILY");
    assert.equal(url.searchParams.get("metricsFilter.deploymentId"), null);

    await client.getProjectMetrics({ scriptId: "s-1", granularity: "weekly", deploymentId: "d-1" });
    url = new URL(mock.calls[1].url);
    assert.equal(url.searchParams.get("metricsGranularity"), "WEEKLY");
    assert.equal(url.searchParams.get("metricsFilter.deploymentId"), "d-1");
  } finally {
    mock.restore();
  }
});

// ---- Versions ----

test("version methods map to create/list/get", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.createVersion({ scriptId: "s-1", description: "v1 notes" });
    assert.equal(mock.calls[0].method, "POST");
    assert.equal(mock.calls[0].url, `${BASE}/v1/projects/s-1/versions`);
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { description: "v1 notes" });

    await client.createVersion({ scriptId: "s-1" });
    assert.deepEqual(JSON.parse(mock.calls[1].body!), {});

    await client.listVersions({ scriptId: "s-1", pageSize: 10, pageToken: "tok" });
    assert.equal(mock.calls[2].method, "GET");
    assert.equal(mock.calls[2].url, `${BASE}/v1/projects/s-1/versions?pageSize=10&pageToken=tok`);

    await client.getVersion("s-1", 7);
    assert.equal(mock.calls[3].url, `${BASE}/v1/projects/s-1/versions/7`);
  } finally {
    mock.restore();
  }
});

// ---- Deployments ----

test("deployment methods map to create/list/get/update/delete", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.createDeployment({ scriptId: "s-1", versionNumber: 3, description: "prod" });
    assert.equal(mock.calls[0].method, "POST");
    assert.equal(mock.calls[0].url, `${BASE}/v1/projects/s-1/deployments`);
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      scriptId: "s-1",
      versionNumber: 3,
      description: "prod",
      manifestFileName: "appsscript",
    });

    await client.listDeployments({ scriptId: "s-1" });
    assert.equal(mock.calls[1].method, "GET");
    assert.equal(mock.calls[1].url, `${BASE}/v1/projects/s-1/deployments`);

    await client.getDeployment("s-1", "d-1");
    assert.equal(mock.calls[2].url, `${BASE}/v1/projects/s-1/deployments/d-1`);

    // update is read-merge-write: an internal GET of the current deployment
    // precedes the PUT (see updateDeployment's doc comment).
    await client.updateDeployment({ scriptId: "s-1", deploymentId: "d-1", versionNumber: 4 });
    assert.equal(mock.calls[3].method, "GET");
    assert.equal(mock.calls[3].url, `${BASE}/v1/projects/s-1/deployments/d-1`);
    assert.equal(mock.calls[4].method, "PUT");
    assert.equal(mock.calls[4].url, `${BASE}/v1/projects/s-1/deployments/d-1`);
    assert.deepEqual(JSON.parse(mock.calls[4].body!), {
      deploymentConfig: { scriptId: "s-1", versionNumber: 4, manifestFileName: "appsscript" },
    });

    await client.deleteDeployment("s-1", "d-1");
    assert.equal(mock.calls[5].method, "DELETE");
    assert.equal(mock.calls[5].url, `${BASE}/v1/projects/s-1/deployments/d-1`);
  } finally {
    mock.restore();
  }
});

/**
 * The read-merge-write contract: fields the caller omits keep their values
 * from the read config. Most importantly, an omitted versionNumber must NOT
 * silently turn the deployment into a HEAD one — that would put unsaved code
 * behind a production URL.
 */
test("updateDeployment preserves omitted fields from the current config", async () => {
  const mock = mockFetch((_url, init) =>
    init.method === "GET"
      ? okJson({
          deploymentId: "d-1",
          deploymentConfig: { scriptId: "s-1", versionNumber: 7, description: "old", manifestFileName: "appsscript" },
        })
      : okJson({ ok: true }),
  );
  try {
    const client = new GoogleAppsScriptClient(staticConfig());
    await client.updateDeployment({ scriptId: "s-1", deploymentId: "d-1", description: "new" });
    assert.equal(mock.calls[1].method, "PUT");
    assert.deepEqual(JSON.parse(mock.calls[1].body!), {
      deploymentConfig: { scriptId: "s-1", versionNumber: 7, description: "new", manifestFileName: "appsscript" },
    });
  } finally {
    mock.restore();
  }
});

// ---- Execution ----

test("runFunction posts function/parameters/devMode and unwraps the result", async () => {
  const mock = mockFetch(() =>
    okJson({ done: true, response: { "@type": "type.googleapis.com/ExecutionResponse", result: 42 } }),
  );
  try {
    const result = await new GoogleAppsScriptClient(staticConfig()).runFunction({
      scriptId: "s-1",
      functionName: "sum",
      parameters: [40, 2],
      devMode: true,
    });
    assert.equal(mock.calls[0].method, "POST");
    assert.equal(mock.calls[0].url, `${BASE}/v1/scripts/s-1:run`);
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { function: "sum", parameters: [40, 2], devMode: true });
    assert.deepEqual(result, { done: true, result: 42 });
  } finally {
    mock.restore();
  }
});

test("runFunction surfaces a script throw as script_error with the stack, not an exception", async () => {
  const mock = mockFetch(() =>
    okJson({
      done: true,
      error: {
        code: 3,
        message: "ScriptError",
        details: [
          {
            "@type": "type.googleapis.com/google.apps.script.v1.ExecutionError",
            errorMessage: "Cannot read x",
            errorType: "TypeError",
            scriptStackTraceElements: [{ function: "main", lineNumber: 3 }],
          },
        ],
      },
    }),
  );
  try {
    const result = (await new GoogleAppsScriptClient(staticConfig()).runFunction({
      scriptId: "s-1",
      functionName: "main",
    })) as Record<string, unknown>;
    assert.deepEqual(result, {
      done: true,
      script_error: {
        type: "TypeError",
        message: "Cannot read x",
        stack: [{ function: "main", lineNumber: 3 }],
      },
    });
  } finally {
    mock.restore();
  }
});

test("normalizeRunOperation handles void results and detail-less errors", () => {
  assert.deepEqual(normalizeRunOperation({ done: true, response: {} }), { done: true, result: null });
  assert.deepEqual(normalizeRunOperation({ done: true, error: { message: "boom" } }), {
    done: true,
    script_error: { message: "boom" },
  });
});

// ---- Processes ----

test("listProcesses without scriptId uses the user endpoint with userProcessFilter params", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleAppsScriptClient(staticConfig()).listProcesses({
      functionName: "main",
      statuses: ["FAILED", "TIMED_OUT"],
      startTime: "2026-08-01T00:00:00Z",
      pageSize: 20,
      pageToken: "tok",
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/processes");
    assert.equal(url.searchParams.get("userProcessFilter.functionName"), "main");
    assert.deepEqual(url.searchParams.getAll("userProcessFilter.statuses"), ["FAILED", "TIMED_OUT"]);
    assert.equal(url.searchParams.get("userProcessFilter.startTime"), "2026-08-01T00:00:00Z");
    assert.equal(url.searchParams.get("pageSize"), "20");
    assert.equal(url.searchParams.get("pageToken"), "tok");
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[0].body, undefined);
  } finally {
    mock.restore();
  }
});

test("listProcesses with scriptId uses listScriptProcesses with scriptProcessFilter params", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleAppsScriptClient(staticConfig()).listProcesses({
      scriptId: "s-1",
      types: ["EXECUTION_API", "TIME_DRIVEN"],
      deploymentId: "d-1",
      endTime: "2026-08-02T00:00:00Z",
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/processes:listScriptProcesses");
    assert.equal(url.searchParams.get("scriptId"), "s-1");
    assert.deepEqual(url.searchParams.getAll("scriptProcessFilter.types"), ["EXECUTION_API", "TIME_DRIVEN"]);
    assert.equal(url.searchParams.get("scriptProcessFilter.deploymentId"), "d-1");
    assert.equal(url.searchParams.get("scriptProcessFilter.endTime"), "2026-08-02T00:00:00Z");
    assert.equal(url.searchParams.get("userProcessFilter.types"), null, "no user-filter leakage");
  } finally {
    mock.restore();
  }
});

// ---- buildScriptFiles wire mapping ----

test("buildScriptFiles maps every normalized type to its wire value", () => {
  assert.deepEqual(
    buildScriptFiles([
      { name: "Code", type: "server_js", source: "a" },
      { name: "Page", type: "html", source: "b" },
      { name: "appsscript", type: "json", source: "c" },
    ]),
    [
      { name: "Code", type: "SERVER_JS", source: "a" },
      { name: "Page", type: "HTML", source: "b" },
      { name: "appsscript", type: "JSON", source: "c" },
    ],
  );
});

// ---- Retry / timeout / SSRF behavior ----

test("request() retries a 429 for reads and writes alike", async () => {
  for (const run of [
    () => new GoogleAppsScriptClient(staticConfig({ maxRetries: 3 })).getProject("s"),
    () => new GoogleAppsScriptClient(staticConfig({ maxRetries: 3 })).deleteDeployment("s", "d"),
  ]) {
    let n = 0;
    const mock = mockFetch(() => {
      n++;
      if (n === 1) return new Response("slow down", { status: 429 });
      return okJson({ ok: true });
    });
    try {
      assert.deepEqual(await run(), { ok: true });
      assert.equal(n, 2);
    } finally {
      mock.restore();
    }
  }
});

test("request() retries a 5xx only for GET — a write is never replayed", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) return new Response("unavailable", { status: 503 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleAppsScriptClient(staticConfig({ maxRetries: 3 })).getProject("s");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2, "the read is retried");
  } finally {
    mock.restore();
  }

  // A PUT (content replace) and a POST (createVersion) are both ambiguous
  // writes: replaying could commit them twice.
  for (const run of [
    () =>
      new GoogleAppsScriptClient(staticConfig({ maxRetries: 3 })).replaceProjectContent({
        scriptId: "s",
        files: [{ name: "appsscript", type: "json", source: "{}" }],
      }),
    () => new GoogleAppsScriptClient(staticConfig({ maxRetries: 3 })).createVersion({ scriptId: "s" }),
  ]) {
    n = 0;
    const mock2 = mockFetch(() => {
      n++;
      return new Response("unavailable", { status: 503 });
    });
    try {
      await assert.rejects(run, /HTTP 503/);
      assert.equal(n, 1, "a 503 on a write must not be replayed — it may have committed");
    } finally {
      mock2.restore();
    }
  }
});

test("request() retries a network error only for GET", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) throw new Error("ECONNRESET");
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleAppsScriptClient(staticConfig({ maxRetries: 2 })).getProject("s");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    throw new Error("ECONNRESET");
  });
  try {
    await assert.rejects(
      () => new GoogleAppsScriptClient(staticConfig({ maxRetries: 2 })).createVersion({ scriptId: "s" }),
      /ECONNRESET/,
    );
    assert.equal(n, 1, "a network error on a write must not be replayed");
  } finally {
    mock2.restore();
  }
});

test("request() does not retry a 400 and gives up after maxRetries on 429", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    return new Response('{"error":{"message":"bad","status":"INVALID_ARGUMENT"}}', { status: 400 });
  });
  try {
    await assert.rejects(
      () => new GoogleAppsScriptClient(staticConfig({ maxRetries: 3 })).getProject("s"),
      /HTTP 400: \[INVALID_ARGUMENT\] bad/,
    );
    assert.equal(n, 1);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("slow down", { status: 429 });
  });
  try {
    await assert.rejects(
      () => new GoogleAppsScriptClient(staticConfig({ maxRetries: 2 })).getProject("s"),
      /HTTP 429/,
    );
    assert.equal(n, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("request() aborts and reports a timeout when the request hangs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  try {
    const client = new GoogleAppsScriptClient(staticConfig({ timeoutMs: 10, maxRetries: 0 }));
    await client.getProject("s").then(
      () => assert.fail("must reject"),
      (err) => assert.match(String(err), /timed out after 10ms/),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("request() rejects an absolute path (SSRF) and never fetches a foreign origin", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const mock = mockFetch(() => okJson({}));
    try {
      await assert.rejects(
        () => new GoogleAppsScriptClient(staticConfig()).request("GET", evil),
        /foreign origin/,
      );
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      mock.restore();
    }
  }
});

test("request() still accepts a relative API path with a query string", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const result = await new GoogleAppsScriptClient(staticConfig()).request(
      "GET",
      "v1/processes?userProcessFilter.statuses=FAILED",
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(mock.calls[0].url, `${BASE}/v1/processes?userProcessFilter.statuses=FAILED`);
  } finally {
    mock.restore();
  }
});
