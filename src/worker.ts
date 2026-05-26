/**
 * Project Bridge plugin worker.
 * Bridges external project management systems with Paperclip.
 * Bidirectional sync of projects, tasks, issues, statuses, and assignments.
 */

import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginHealthDiagnostics,
  type PluginJobContext,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import { JOB_KEYS, WEBHOOK_KEYS, ZOHO_SCOPES } from "./constants.js";
import type { ZohoAuthState } from "./lib/types.js";
import { proactiveTokenRefresh } from "./lib/zoho-client.js";
import { handleAgentEvent } from "./modules/provisioner/hermes-home.js";
import { handleIssueUpdated } from "./modules/sync/outbound-sync.js";
import { handleProjectsWebhook } from "./modules/sync/projects-handler.js";
import type { DataCenterKey } from "./constants.js";
import { DATA_CENTERS } from "./constants.js";

let currentContext: PluginContext | null = null;

async function getAuthState(ctx: PluginContext): Promise<ZohoAuthState | null> {
  return (await ctx.state.get({
    scopeKind: "instance",
    stateKey: "zoho.auth",
  })) as ZohoAuthState | null;
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;

    // ─── Event Listeners ──────────────────────────────────────
    ctx.events.on("issue.updated", async (event) => {
      const config = (await ctx.config.get()) as { projectsEnabled?: boolean };
      if (config.projectsEnabled !== false) {
        await handleIssueUpdated(ctx, event);
      }
    });

    ctx.events.on("agent.created", async (event) => {
      await handleAgentEvent(ctx, event);
    });
    ctx.events.on("agent.updated", async (event) => {
      await handleAgentEvent(ctx, event);
    });

    // ─── Jobs ─────────────────────────────────────────────────
    ctx.jobs.register(JOB_KEYS.tokenRefresh, async (_job: PluginJobContext) => {
      await proactiveTokenRefresh(ctx);
      ctx.logger.info("Token refresh job completed");
    });

    // ─── Data Handlers (for settings UI) ──────────────────────
    ctx.data.register("connection-status", async () => {
      const auth = await getAuthState(ctx);
      return {
        connected: !!auth?.refreshToken,
        dataCenter: auth?.dataCenter ?? "US",
        connectedUser: auth?.connectedUser,
        tokenExpiresAt: auth?.expiresAt,
        tokenValid: auth?.expiresAt ? Date.now() < auth.expiresAt : false,
      };
    });

    ctx.data.register("webhook-urls", async () => {
      return {
        projects: `Webhook URL for Zoho Projects — copy from plugin settings`,
        desk: `Webhook URL for Zoho Desk — auto-registered on connect`,
      };
    });

    // ─── Action Handlers (for settings UI) ────────────────────
    ctx.actions.register("save-agent-mapping", async (params) => {
      await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.agentMapping" }, params.mapping);
      return { ok: true };
    });

    ctx.actions.register("seed-auth", async (params) => {
      const authState: ZohoAuthState = {
        refreshToken: params.refreshToken as string,
        accessToken: params.accessToken as string,
        expiresAt: params.expiresAt as number,
        dataCenter: (params.dataCenter as DataCenterKey) ?? "US",
        connectedUser: params.connectedUser as string | undefined,
      };
      await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.auth" }, authState);
      ctx.logger.info("Auth state seeded via action");
      return { ok: true };
    });

    ctx.actions.register("save-group-mapping", async (params) => {
      await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.groupMapping" }, params.mapping);
      return { ok: true };
    });

    ctx.actions.register("save-project-mapping", async (params) => {
      await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.projectMapping" }, params.mapping);
      return { ok: true };
    });

    ctx.logger.info("Project Bridge plugin setup complete");
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    if (!ctx) {
      return { status: "error", message: "Plugin not initialized" };
    }

    const auth = await getAuthState(ctx);
    const connected = !!auth?.refreshToken;
    const tokenValid = auth?.expiresAt ? Date.now() < auth.expiresAt : false;

    return {
      status: connected ? "ok" : "degraded",
      message: connected
        ? `Connected to Zoho (${auth?.dataCenter ?? "US"})${tokenValid ? "" : " — token expired"}`
        : "Not connected to Zoho. Complete OAuth setup in settings.",
      details: { connected, dataCenter: auth?.dataCenter, tokenValid },
    };
  },

  async onConfigChanged(newConfig) {
    currentContext?.logger.info(`Config changed: ${JSON.stringify(newConfig)}`);
  },

  async onWebhook(input: PluginWebhookInput) {
    const ctx = currentContext;
    if (!ctx) throw new Error("Plugin not initialized");

    const config = (await ctx.config.get()) as {
      projectsEnabled?: boolean;
      deskEnabled?: boolean;
    };

    switch (input.endpointKey) {
      case WEBHOOK_KEYS.projects:
        if (config.projectsEnabled === false) {
          ctx.logger.info("Projects sync disabled, ignoring webhook");
          return;
        }
        await handleProjectsWebhook(ctx, input.rawBody, input.parsedBody);
        break;

      case WEBHOOK_KEYS.desk:
        if (config.deskEnabled === false) {
          ctx.logger.info("Desk sync disabled, ignoring webhook");
          return;
        }
        ctx.logger.info("Desk webhook received — handler not yet implemented (Phase 2)");
        break;

      default:
        throw new Error(`Unknown webhook endpoint: ${input.endpointKey}`);
    }
  },

  async onApiRequest(request) {
    const ctx = currentContext;
    if (!ctx) {
      return { status: 500, body: "Plugin not initialized" };
    }

    const reqPath = request.path;
    const query = request.query as Record<string, string | string[]>;

    // OAuth callback
    if (reqPath.endsWith("/callback")) {
      const code = typeof query.code === "string" ? query.code : Array.isArray(query.code) ? query.code[0] : null;
      if (!code) return { status: 400, body: "Missing authorization code" };

      const config = (await ctx.config.get()) as { zohoClientId?: string; zohoClientSecret?: string; dataCenter?: DataCenterKey };
      if (!config.zohoClientId || !config.zohoClientSecret) {
        return { status: 400, body: "Missing Zoho Client ID or Secret in plugin config" };
      }

      const dc = (config.dataCenter ?? "US") as DataCenterKey;
      const center = DATA_CENTERS[dc] ?? DATA_CENTERS.US;
      const redirectUri = typeof query.redirect_uri === "string" ? query.redirect_uri : "";

      const params = new URLSearchParams({
        code,
        client_id: config.zohoClientId,
        client_secret: config.zohoClientSecret,
        grant_type: "authorization_code",
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      });

      const res = await ctx.http.fetch(`https://${center.accounts}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!res.ok) {
        const body = await res.text();
        ctx.logger.error(`OAuth token exchange failed: ${body}`);
        return { status: 500, body: `OAuth failed: ${body}` };
      }

      const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!data.access_token || !data.refresh_token) {
        return { status: 500, body: "Token exchange returned incomplete data" };
      }

      await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.auth" }, {
        refreshToken: data.refresh_token,
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
        dataCenter: dc,
      } satisfies ZohoAuthState);

      ctx.logger.info(`OAuth completed. Connected to Zoho (${dc})`);
      return { status: 302, headers: { Location: "/settings" }, body: "Connected! Redirecting to settings..." };
    }

    // OAuth initiation
    if (reqPath.endsWith("/connect")) {
      const config = (await ctx.config.get()) as { zohoClientId?: string; dataCenter?: DataCenterKey };
      if (!config.zohoClientId) return { status: 400, body: "Configure Zoho Client ID first" };

      const dc = (config.dataCenter ?? "US") as DataCenterKey;
      const center = DATA_CENTERS[dc] ?? DATA_CENTERS.US;
      const callbackUrl = reqPath.replace("/connect", "/callback");

      const authUrl = `https://${center.accounts}/oauth/v2/auth?` +
        new URLSearchParams({
          client_id: config.zohoClientId,
          response_type: "code",
          scope: ZOHO_SCOPES,
          redirect_uri: callbackUrl,
          access_type: "offline",
          prompt: "consent",
        }).toString();

      return { status: 302, headers: { Location: authUrl }, body: "" };
    }

    return { status: 404, body: "Not found" };
  },

  async onShutdown() {
    currentContext?.logger.info("Project Bridge plugin shutting down");
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
