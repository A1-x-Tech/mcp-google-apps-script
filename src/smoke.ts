import { ConfigError, CredentialsError, loadConfig } from "./config.js";
import { GoogleAppsScriptClient } from "./client.js";
import type { GoogleAppsScriptConfig } from "./types.js";

/**
 * Live smoke checks against the real API.
 *
 * Default mode is READ-ONLY: with a script id (argv or
 * GOOGLE_APPS_SCRIPT_SMOKE_SCRIPT_ID) it fetches that project's metadata;
 * otherwise it just mints an access token from the refresh token — either way
 * the credentials are exercised for real and nothing is written.
 *
 * `npm run smoke -- --live` is the opt-in write scenario on a DISPOSABLE
 * resource: it creates a throwaway standalone project, merges a code file into
 * it, snapshots a version — then deletes the project's Drive file in a finally
 * block, so cleanup runs after success and failure alike. The deletion goes
 * through the Drive API (the Apps Script API cannot delete projects), so the
 * refresh token needs the https://www.googleapis.com/auth/drive scope on top
 * of script.projects; without it the script prints the scriptId to delete by
 * hand. No pre-existing project is ever touched.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GoogleAppsScriptClient(config);

  if (process.argv.includes("--live")) {
    await liveDisposableScenario(client, config);
    return;
  }

  const scriptId = process.argv[2] ?? process.env.GOOGLE_APPS_SCRIPT_SMOKE_SCRIPT_ID;
  if (scriptId) {
    const project = (await client.getProject(scriptId)) as { title?: string; updateTime?: string };
    console.log(JSON.stringify({ scriptId, title: project.title, updateTime: project.updateTime }, null, 2));
    return;
  }
  console.log(JSON.stringify(await client.authCheck(), null, 2));
}

async function liveDisposableScenario(client: GoogleAppsScriptClient, config: GoogleAppsScriptConfig): Promise<void> {
  const title = `mcp-smoke-disposable-${Date.now()}`;
  console.log(`creating disposable project "${title}"...`);
  const project = (await client.createProject({ title })) as { scriptId?: string };
  const scriptId = project.scriptId;
  if (typeof scriptId !== "string" || !scriptId) throw new Error("createProject returned no scriptId");
  console.log(`created scriptId=${scriptId}`);

  try {
    await client.mergeProjectContent({
      scriptId,
      files: [
        {
          name: "Smoke",
          type: "server_js",
          source: "function smokePing() { return 'pong'; }\n",
        },
      ],
    });
    console.log("merged Smoke.gs into the project");

    const version = (await client.createVersion({ scriptId, description: "smoke" })) as {
      versionNumber?: number;
    };
    console.log(`created version ${version.versionNumber}`);

    const content = (await client.getProjectContent(scriptId)) as { files?: unknown[] };
    console.log(`project now holds ${content.files?.length ?? 0} files`);
    console.log("live smoke OK");
  } finally {
    await cleanupDisposableProject(scriptId, config);
  }
}

/**
 * Deletes the disposable project's Drive file. Runs from `finally`, so it must
 * report problems instead of throwing over the scenario's own error.
 */
async function cleanupDisposableProject(scriptId: string, config: GoogleAppsScriptConfig): Promise<void> {
  try {
    const token = await mintCleanupToken(config);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(scriptId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 204 || res.status === 200) {
      console.log(`cleanup OK: deleted disposable project ${scriptId}`);
      return;
    }
    console.error(
      `cleanup FAILED (HTTP ${res.status}): delete the disposable project manually — Drive file id ${scriptId}. ` +
        "The refresh token likely lacks the https://www.googleapis.com/auth/drive scope.",
    );
  } catch (err) {
    console.error(
      `cleanup FAILED: delete the disposable project manually — Drive file id ${scriptId}.`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * The client keeps its token private and (correctly) refuses foreign origins,
 * so the Drive cleanup mints its own token from the same refresh triple. A
 * static access token is used as-is.
 */
async function mintCleanupToken(config: GoogleAppsScriptConfig): Promise<string> {
  if (!(config.clientId && config.clientSecret && config.refreshToken)) {
    if (config.accessToken) return config.accessToken;
    throw new CredentialsError();
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as { access_token?: string };
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`token mint for cleanup failed (HTTP ${res.status})`);
  }
  return data.access_token;
}

main().catch((err) => {
  // Missing or malformed credentials are a user error, not a bug: no stack.
  const userError = err instanceof ConfigError || err instanceof CredentialsError;
  console.error("smoke failed:", userError ? err.message : err);
  process.exit(1);
});
