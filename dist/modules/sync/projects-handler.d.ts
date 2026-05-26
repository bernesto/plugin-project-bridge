/**
 * Zoho Projects webhook handler.
 * Normalizes incoming task payloads and creates/updates Paperclip Issues.
 * Auto-links Paperclip Projects when a new Zoho project is seen.
 * Routes to the correct Company via Zoho Project Group name (primary)
 * or agent tag org prefix (fallback).
 *
 * Ported from task-webhook.py normalize_projects_payload.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { NormalizedProjectsTask } from "../../lib/types.js";
/**
 * Parse the raw webhook body — handles both JSON and form-encoded (data=<JSON>).
 */
export declare function parseWebhookBody(rawBody: string, parsedBody: unknown): unknown;
/**
 * Normalize a Zoho Projects webhook payload into a standard task structure.
 */
export declare function normalizeProjectsPayload(raw: Record<string, unknown>): NormalizedProjectsTask;
/**
 * Handle an inbound Zoho Projects webhook event.
 * Creates or updates a Paperclip Issue. Auto-creates projects as needed.
 */
export declare function handleProjectsWebhook(ctx: PluginContext, rawBody: string, parsedBody: unknown): Promise<void>;
//# sourceMappingURL=projects-handler.d.ts.map