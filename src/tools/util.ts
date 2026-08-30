import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Schema factories, not shared consts: reusing one zod object across two fields
 * makes zod-to-json-schema dedupe them into a `$ref`, which some tool-schema
 * consumers (OpenAI Apps review) don't dereference and flag as `any`. A fresh
 * object per field keeps each one inlined with its type + pattern.
 */
export const scriptIdSchema = () =>
  z
    .string()
    .min(1)
    .describe(
      "The script project id — from the Apps Script editor URL (script.google.com/home/projects/<scriptId>/edit) or from create_project output. For standalone projects it doubles as the Drive file id.",
    );

/** A deployment id, as returned by manage_deployments list/create. */
export const deploymentIdSchema = () =>
  z.string().min(1).describe("The deployment id from manage_deployments (action=list or create).");

/** A positive immutable version number, as returned by create_version / list_versions. */
export const versionNumberSchema = () => z.number().int().min(1);

/** An RFC3339 UTC timestamp, e.g. 2026-08-01T00:00:00Z — the shape the process filters accept. */
export const rfc3339Timestamp = () =>
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      "Must be an RFC3339 timestamp, e.g. 2026-08-01T00:00:00Z",
    );

/**
 * One script file for update_project_content. File names carry NO extension
 * ("Code", not "Code.gs") — the type field decides the extension.
 */
export const scriptFileSchema = () =>
  z.object({
    name: z
      .string()
      .min(1)
      .describe('File name WITHOUT extension: "Code", not "Code.gs". The manifest is named "appsscript".'),
    type: z
      .enum(["server_js", "html", "json"])
      .describe('server_js = .gs code, html = HTML template, json = the "appsscript" manifest only.'),
    source: z.string().describe("The full file content."),
  });

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  let message = err instanceof Error ? err.message : String(err);
  // Surface the underlying cause (e.g. the network error behind a timeout) — no
  // secrets live in cause, and it makes failures far easier to diagnose.
  if (err instanceof Error && err.cause instanceof Error) message += ` (${err.cause.message})`;
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. All four hints are set explicitly on every tool: some clients (OpenAI
 * Apps review) require readOnlyHint, destructiveHint and openWorldHint on each.
 *
 * The Apps Script API mixes reads and writes, so each tool picks one of four
 * presets: READ_ONLY (pure reads), WRITE (creates new state; replaying
 * duplicates it), UPDATE (overwrites existing state; replaying the same update
 * converges) and DESTRUCTIVE (removes state or runs arbitrary code; replaying
 * is unsafe).
 */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export const UPDATE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
