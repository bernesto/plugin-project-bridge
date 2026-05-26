/**
 * Zoho API client for Paperclip plugin context.
 * Handles OAuth token refresh, rate limiting, and data-center-aware URLs.
 * Ported from ~/.claude-agent/src/cliq-api.ts, adapted to use ctx.http and ctx.state.
 */
import { DATA_CENTERS } from "../constants.js";
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const LOCKOUT_DURATION_MS = 10 * 60_000;
let lockoutUntil = 0;
function getDataCenter(dc) {
    return DATA_CENTERS[dc] ?? DATA_CENTERS.US;
}
function getBaseUrl(service, dc) {
    const center = getDataCenter(dc);
    switch (service) {
        case "desk":
            return `https://${center.desk}/api/v1`;
        case "crm":
            return `https://${center.crm}/crm/v8`;
        case "projects":
            return `https://${center.projects}/api/v3`;
    }
}
function getAuthHeader(service, token) {
    if (service === "projects") {
        return `Bearer ${token}`;
    }
    return `Zoho-oauthtoken ${token}`;
}
async function getAuth(ctx) {
    const auth = (await ctx.state.get({
        scopeKind: "instance",
        stateKey: "zoho.auth",
    }));
    if (!auth?.refreshToken) {
        throw new Error("Zoho not connected. Please complete OAuth setup in plugin settings.");
    }
    return auth;
}
async function saveAuth(ctx, auth) {
    await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.auth" }, auth);
}
async function refreshAccessToken(ctx) {
    const auth = await getAuth(ctx);
    const config = (await ctx.config.get());
    if (!config.zohoClientId || !config.zohoClientSecret) {
        throw new Error("Missing Zoho Client ID or Client Secret in plugin settings.");
    }
    const center = getDataCenter(auth.dataCenter);
    const params = new URLSearchParams({
        refresh_token: auth.refreshToken,
        client_id: config.zohoClientId,
        client_secret: config.zohoClientSecret,
        grant_type: "refresh_token",
    });
    const res = await ctx.http.fetch(`https://${center.accounts}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Zoho token refresh failed (${res.status}): ${body}`);
    }
    const data = (await res.json());
    if (!data.access_token) {
        throw new Error("Zoho token refresh returned no access_token");
    }
    const updated = {
        ...auth,
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - TOKEN_SAFETY_MARGIN_MS,
    };
    await saveAuth(ctx, updated);
    return data.access_token;
}
async function getAccessToken(ctx) {
    const auth = await getAuth(ctx);
    if (auth.accessToken && auth.expiresAt && Date.now() < auth.expiresAt) {
        return { token: auth.accessToken, dataCenter: auth.dataCenter };
    }
    const token = await refreshAccessToken(ctx);
    return { token, dataCenter: auth.dataCenter };
}
/**
 * Make an authenticated request to a Zoho API.
 * Handles token refresh on 401 and lockout on 429.
 */
export async function zohoFetch(ctx, service, method, path, body, extraHeaders) {
    if (Date.now() < lockoutUntil) {
        return {
            status: 429,
            data: { error: "Rate limited — locked out", retryAfterMs: lockoutUntil - Date.now() },
            ok: false,
        };
    }
    const { token, dataCenter } = await getAccessToken(ctx);
    const baseUrl = getBaseUrl(service, dataCenter);
    const url = `${baseUrl}${path}`;
    const headers = {
        Authorization: getAuthHeader(service, token),
        "Content-Type": "application/json",
        ...extraHeaders,
    };
    const fetchOpts = {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    };
    let res = await ctx.http.fetch(url, fetchOpts);
    // 429: rate limited — lock out
    if (res.status === 429) {
        lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
        return { status: 429, data: await safeJson(res), ok: false };
    }
    // 401: token expired — refresh and retry once
    if (res.status === 401) {
        const newToken = await refreshAccessToken(ctx);
        headers.Authorization = getAuthHeader(service, newToken);
        res = await ctx.http.fetch(url, { ...fetchOpts, headers });
        if (res.status === 429) {
            lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
            return { status: 429, data: await safeJson(res), ok: false };
        }
    }
    const data = await safeJson(res);
    return { status: res.status, data, ok: res.ok };
}
/** Convenience for Zoho Projects API calls that need portalId in the path */
export async function projectsFetch(ctx, method, path, body) {
    return zohoFetch(ctx, "projects", method, path, body);
}
/** Convenience for Zoho Desk API calls that need orgId header */
export async function deskFetch(ctx, method, path, body, orgId) {
    const headers = {};
    if (orgId)
        headers.orgId = orgId;
    return zohoFetch(ctx, "desk", method, path, body, headers);
}
/** Safely parse JSON from a response, falling back to text */
async function safeJson(res) {
    if (res.status === 204)
        return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }
    return await res.text();
}
/** Proactive token refresh for the scheduled job */
export async function proactiveTokenRefresh(ctx) {
    try {
        const auth = await getAuth(ctx);
        const timeUntilExpiry = auth.expiresAt - Date.now();
        if (timeUntilExpiry < 15 * 60_000) {
            await refreshAccessToken(ctx);
        }
    }
    catch {
        // No auth configured yet — skip
    }
}
//# sourceMappingURL=zoho-client.js.map