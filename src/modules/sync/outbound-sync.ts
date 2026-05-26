/**
 * Outbound sync: Paperclip → Zoho.
 * When a Paperclip Issue status changes, update the corresponding Zoho entity.
 */

import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
import { PAPERCLIP_TO_PROJECTS_STATUS } from "../../constants.js";
import { projectsFetch } from "../../lib/zoho-client.js";

/**
 * Handle issue.updated events and sync status back to Zoho.
 */
export async function handleIssueUpdated(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const payload = event.payload as {
    issueId?: string;
    companyId?: string;
    changes?: { status?: { from: string; to: string } };
  };

  if (!payload.issueId || !payload.companyId || !payload.changes?.status) {
    return;
  }

  const issue = await ctx.issues.get(payload.issueId, payload.companyId);
  if (!issue) return;

  // Check if this is a Zoho-synced issue via originKind
  const originKind = issue.originKind;
  if (!originKind?.startsWith("plugin:zoho-suite:")) {
    return;
  }

  // Parse the originFingerprint to get Zoho entity info
  // Format: "projects:task:<taskId>"
  const fingerprint = issue.originFingerprint;
  if (!fingerprint) return;

  const parts = fingerprint.split(":");
  if (parts.length < 3) return;

  const [source, entityType, entityId] = parts;
  const newPaperclipStatus = payload.changes.status.to;

  if (source === "projects" && entityType === "task") {
    // We need the projectId — get it from originId or look it up
    const projectId = issue.originId; // We'll store zohoProjectId here on create
    if (projectId) {
      await syncTaskStatusToProjects(ctx, { entityId, projectId }, newPaperclipStatus);
    }
  }
  // Future: desk, crm handlers
}

async function syncTaskStatusToProjects(
  ctx: PluginContext,
  zoho: { entityId: string; projectId?: string },
  paperclipStatus: string,
): Promise<void> {
  const zohoStatus = PAPERCLIP_TO_PROJECTS_STATUS[paperclipStatus];
  if (!zohoStatus) {
    ctx.logger.warn(`No Zoho status mapping for Paperclip status "${paperclipStatus}"`);
    return;
  }

  const config = (await ctx.config.get()) as { portalId?: string };
  const portalId = config.portalId;
  if (!portalId || !zoho.projectId) {
    ctx.logger.warn("Missing portalId or projectId for outbound sync");
    return;
  }

  const path = `/portal/${portalId}/projects/${zoho.projectId}/tasks/${zoho.entityId}/`;
  const result = await projectsFetch(ctx, "PUT", path, {
    status: { name: zohoStatus },
  });

  if (result.ok) {
    ctx.logger.info(
      `Synced task ${zoho.entityId} to Zoho status "${zohoStatus}"`,
    );
  } else {
    ctx.logger.error(
      `Failed to sync task ${zoho.entityId} to Zoho (${result.status}): ${JSON.stringify(result.data)}`,
    );
  }
}
