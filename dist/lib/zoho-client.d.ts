/**
 * Zoho API client for Paperclip plugin context.
 * Handles OAuth token refresh, rate limiting, and data-center-aware URLs.
 * Ported from ~/.claude-agent/src/cliq-api.ts, adapted to use ctx.http and ctx.state.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ZohoService } from "./types.js";
export type ZohoResponse = {
    status: number;
    data: unknown;
    ok: boolean;
};
/**
 * Make an authenticated request to a Zoho API.
 * Handles token refresh on 401 and lockout on 429.
 */
export declare function zohoFetch(ctx: PluginContext, service: ZohoService, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<ZohoResponse>;
/** Convenience for Zoho Projects API calls that need portalId in the path */
export declare function projectsFetch(ctx: PluginContext, method: string, path: string, body?: unknown): Promise<ZohoResponse>;
/** Convenience for Zoho Desk API calls that need orgId header */
export declare function deskFetch(ctx: PluginContext, method: string, path: string, body?: unknown, orgId?: string): Promise<ZohoResponse>;
/** Proactive token refresh for the scheduled job */
export declare function proactiveTokenRefresh(ctx: PluginContext): Promise<void>;
//# sourceMappingURL=zoho-client.d.ts.map