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
import { proactiveTokenRefresh, projectsFetch, zohoFetch } from "./lib/zoho-client.js";
import { handleAgentEvent } from "./modules/provisioner/hermes-home.js";
import { handleIssueUpdated } from "./modules/sync/outbound-sync.js";
import { handleProjectsWebhook } from "./modules/sync/projects-handler.js";
import type { DataCenterKey } from "./constants.js";
import { DATA_CENTERS } from "./constants.js";

let currentContext: PluginContext | null = null;

async function handleOAuthCallback(ctx: PluginContext, input: PluginWebhookInput): Promise<void> {
  // The OAuth code comes in the webhook's parsed body or query params
  // Zoho redirects with ?code=xxx which Paperclip passes as parsedBody for GET webhooks
  const body = (input.parsedBody ?? {}) as Record<string, unknown>;
  const rawBody = input.rawBody ?? "";

  // Try to extract code from query string in rawBody, or from parsedBody
  let code = body.code as string | undefined;
  if (!code && rawBody.includes("code=")) {
    const params = new URLSearchParams(rawBody);
    code = params.get("code") ?? undefined;
  }

  if (!code) {
    ctx.logger.error("OAuth callback received without authorization code");
    return;
  }

  const config = (await ctx.config.get()) as {
    zohoClientId?: string;
    zohoClientSecret?: string;
    dataCenter?: DataCenterKey;
    oauthCallbackUrl?: string;
  };

  if (!config.zohoClientId || !config.zohoClientSecret) {
    ctx.logger.error("OAuth callback: missing client credentials in config");
    return;
  }

  const dc = (config.dataCenter ?? "US") as DataCenterKey;
  const center = DATA_CENTERS[dc] ?? DATA_CENTERS.US;
  const redirectUri = config.oauthCallbackUrl ?? "";

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
    const errBody = await res.text();
    ctx.logger.error(`OAuth token exchange failed (${res.status}): ${errBody}`);
    return;
  }

  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token || !data.refresh_token) {
    ctx.logger.error("OAuth token exchange returned incomplete data");
    return;
  }

  await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.auth" }, {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    dataCenter: dc,
  } satisfies ZohoAuthState);

  ctx.logger.info(`OAuth completed. Connected to Zoho (${dc})`);
}

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

    ctx.data.register("connect-url", async () => {
      const config = (await ctx.config.get()) as { zohoClientId?: string; dataCenter?: DataCenterKey; oauthCallbackUrl?: string };
      if (!config.zohoClientId || !config.oauthCallbackUrl) {
        return { connectUrl: "", configured: false };
      }
      const dc = (config.dataCenter ?? "US") as DataCenterKey;
      const center = DATA_CENTERS[dc] ?? DATA_CENTERS.US;
      const connectUrl = `https://${center.accounts}/oauth/v2/auth?` +
        new URLSearchParams({
          client_id: config.zohoClientId,
          response_type: "code",
          scope: ZOHO_SCOPES,
          redirect_uri: config.oauthCallbackUrl,
          access_type: "offline",
          prompt: "consent",
        }).toString();
      return { connectUrl, configured: true };
    });

    // ─── Zoho API data handlers (for settings UI dropdowns) ──
    ctx.data.register("zoho-portals", async () => {
      try {
        const result = await projectsFetch(ctx, "GET", "/portals/");
        if (!result.ok) return { portals: [], error: `API error: ${result.status}`, rawResponse: result.data };
        const data = result.data as Record<string, unknown>;
        const portals = (data.portals ?? []) as Array<Record<string, unknown>>;
        return { portals: portals.map((p) => ({ id: String(p.id ?? p.id_string ?? ""), name: String(p.name ?? "") })) };
      } catch (e) { return { portals: [], error: String(e) }; }
    });

    ctx.data.register("zoho-projects-list", async (params) => {
      try {
        const config = (await ctx.config.get()) as { portalId?: string };
        const portalId = (params.portalId as string) || config.portalId;
        if (!portalId) return { projects: [], error: "No portalId" };
        const result = await projectsFetch(ctx, "GET", `/portal/${portalId}/projects/?range=100&status=active`);
        if (!result.ok) return { projects: [], error: `API error: ${result.status}` };
        const data = result.data as Record<string, unknown>;
        const projects = (data.projects ?? []) as Array<Record<string, unknown>>;
        return {
          projects: projects.map((p) => ({
            id: String(p.id ?? p.id_string ?? ""),
            name: String(p.name ?? ""),
            status: String(p.status ?? ""),
            group: p.group ? { id: String((p.group as Record<string, unknown>).id ?? ""), name: String((p.group as Record<string, unknown>).name ?? "") } : null,
            clientCompany: p.company ? { id: String((p.company as Record<string, unknown>).id ?? ""), name: String((p.company as Record<string, unknown>).name ?? "") } : null,
          })),
        };
      } catch (e) { return { projects: [], error: String(e) }; }
    });

    ctx.data.register("zoho-users-list", async (params) => {
      try {
        const config = (await ctx.config.get()) as { portalId?: string };
        const portalId = (params.portalId as string) || config.portalId;
        if (!portalId) return { users: [], error: "No portalId" };
        const result = await projectsFetch(ctx, "GET", `/portal/${portalId}/users/?range=200&status=active`);
        if (!result.ok) return { users: [], error: `API error: ${result.status}`, rawResponse: result.data };
        const data = result.data as Record<string, unknown>;
        const users = (data.users ?? []) as Array<Record<string, unknown>>;
        return {
          users: users.map((u) => ({
            id: String(u.id ?? u.zpuid ?? ""),
            name: String(u.name ?? ""),
            email: String(u.email ?? ""),
            role: String(u.role ?? ""),
            company: u.company ? { id: String((u.company as Record<string, unknown>).id ?? ""), name: String((u.company as Record<string, unknown>).name ?? "") } : null,
          })),
        };
      } catch (e) { return { users: [], error: String(e) }; }
    });

    ctx.data.register("paperclip-companies", async () => {
      try {
        const companies = await ctx.companies.list({ limit: 50, offset: 0 });
        return { companies: companies.map((c) => ({ id: c.id, name: c.name })) };
      } catch (e) { return { companies: [], error: String(e) }; }
    });

    ctx.data.register("paperclip-agents", async (params) => {
      try {
        const companyId = params.companyId as string;
        if (!companyId) return { agents: [] };
        const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
        return { agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role })) };
      } catch (e) { return { agents: [], error: String(e) }; }
    });

    ctx.data.register("paperclip-projects-list", async (params) => {
      try {
        const companyId = params.companyId as string;
        if (!companyId) return { projects: [] };
        const projects = await ctx.projects.list({ companyId, limit: 200, offset: 0 });
        return { projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })) };
      } catch (e) { return { projects: [], error: String(e) }; }
    });

    ctx.data.register("zoho-clients-list", async (params) => {
      try {
        const config = (await ctx.config.get()) as { portalId?: string };
        const portalId = (params.portalId as string) || config.portalId;
        if (!portalId) return { clients: [], error: "No portalId" };
        const result = await projectsFetch(ctx, "GET", `/portal/${portalId}/clients/?range=100`);
        if (!result.ok) return { clients: [], error: `API error: ${result.status}`, rawResponse: result.data };
        const data = result.data as Record<string, unknown>;
        const clients = (data.clients ?? []) as Array<Record<string, unknown>>;
        return {
          clients: clients.map((c) => ({
            id: String(c.id ?? ""),
            name: String(c.name ?? ""),
            users: ((c.users ?? []) as Array<Record<string, unknown>>).map((u) => ({
              id: String(u.id ?? u.zpuid ?? ""),
              name: String(u.name ?? ""),
              email: String(u.email ?? ""),
            })),
          })),
        };
      } catch (e) { return { clients: [], error: String(e) }; }
    });

    ctx.data.register("zoho-api-debug", async (params) => {
      try {
        const path = params.path as string;
        if (!path) return { error: "path is required" };
        const result = await projectsFetch(ctx, "GET", path);
        return { status: result.status, ok: result.ok, data: result.data };
      } catch (e) { return { error: String(e) }; }
    });

    // ─── Services registry data handler ─────────────────────
    ctx.data.register("services", async () => {
      const services = (await ctx.state.get({ scopeKind: "instance", stateKey: "bridge.services" })) as any[] | null;
      return services ?? [];
    });

    ctx.data.register("service-config", async (params) => {
      const serviceId = params.serviceId as string;
      if (!serviceId) return null;
      const config = await ctx.state.get({ scopeKind: "instance", stateKey: `bridge.service.${serviceId}` });
      return config ?? null;
    });

    // ─── Action Handlers (for settings UI) ────────────────────
    ctx.actions.register("add-service", async (params) => {
      const serviceType = params.serviceType as string;
      const services = ((await ctx.state.get({ scopeKind: "instance", stateKey: "bridge.services" })) as any[] | null) ?? [];
      const serviceId = `${serviceType}-${Date.now()}`;
      services.push({ id: serviceId, type: serviceType, name: params.name as string ?? serviceType, enabled: true, createdAt: new Date().toISOString() });
      await ctx.state.set({ scopeKind: "instance", stateKey: "bridge.services" }, services);
      return { ok: true, serviceId };
    });

    ctx.actions.register("remove-service", async (params) => {
      const serviceId = params.serviceId as string;
      const services = ((await ctx.state.get({ scopeKind: "instance", stateKey: "bridge.services" })) as any[] | null) ?? [];
      const filtered = services.filter((s: any) => s.id !== serviceId);
      await ctx.state.set({ scopeKind: "instance", stateKey: "bridge.services" }, filtered);
      await ctx.state.delete({ scopeKind: "instance", stateKey: `bridge.service.${serviceId}` });
      return { ok: true };
    });

    ctx.actions.register("save-service-config", async (params) => {
      const serviceId = params.serviceId as string;
      const config = params.config;
      await ctx.state.set({ scopeKind: "instance", stateKey: `bridge.service.${serviceId}` }, config);
      return { ok: true };
    });

    // Legacy actions (still used by sync handlers internally)
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

    ctx.actions.register("disconnect", async () => {
      await ctx.state.delete({ scopeKind: "instance", stateKey: "zoho.auth" });
      ctx.logger.info("Disconnected from Zoho");
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

      case WEBHOOK_KEYS.oauthCallback:
        await handleOAuthCallback(ctx, input);
        break;

      default:
        throw new Error(`Unknown webhook endpoint: ${input.endpointKey}`);
    }
  },

  async onShutdown() {
    currentContext?.logger.info("Project Bridge plugin shutting down");
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
