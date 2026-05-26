/**
 * Zoho Projects webhook handler.
 * Normalizes incoming task payloads and creates/updates Paperclip Issues.
 * Auto-links Paperclip Projects when a new Zoho project is seen.
 * Routes to the correct Company via Zoho Project Group name (primary)
 * or agent tag org prefix (fallback).
 *
 * Ported from task-webhook.py normalize_projects_payload.
 */
import { PRIORITY_MAP, PROJECTS_STATUS_MAP } from "../../constants.js";
import { projectsFetch } from "../../lib/zoho-client.js";
import { resolveAgent } from "./agent-mapping.js";
/**
 * Parse the raw webhook body — handles both JSON and form-encoded (data=<JSON>).
 */
export function parseWebhookBody(rawBody, parsedBody) {
    if (parsedBody && typeof parsedBody === "object")
        return parsedBody;
    try {
        return JSON.parse(rawBody);
    }
    catch {
        // Fall through to form-encoded
    }
    try {
        const params = new URLSearchParams(rawBody);
        const dataField = params.get("data") ?? params.get("json");
        if (dataField)
            return JSON.parse(decodeURIComponent(dataField));
    }
    catch {
        // Fall through
    }
    throw new Error("Could not parse webhook body");
}
/**
 * Extract agent tags from the raw payload and task tags.
 * Returns parsed tags like ["nr:kelly", "hb:diana"] and the first org prefix found.
 */
function extractAgentTags(raw, taskTags) {
    const agentTags = [];
    // From raw.agentTags field (set by Deluge)
    const agentTagsStr = raw.agentTags ?? "";
    if (agentTagsStr) {
        const parsed = agentTagsStr
            .replace(/[\[\]]/g, "")
            .split(",")
            .map((t) => t.trim().replace(/['"]/g, ""))
            .filter(Boolean);
        agentTags.push(...parsed);
    }
    // From task tags (e.g. {name: "nr:kelly"})
    if (taskTags) {
        for (const tag of taskTags) {
            if (tag.includes(":") && !agentTags.includes(tag)) {
                agentTags.push(tag);
            }
        }
    }
    // Extract org prefix from first agent tag
    let orgPrefix;
    for (const tag of agentTags) {
        if (tag.includes(":")) {
            orgPrefix = tag.split(":")[0].toLowerCase();
            break;
        }
    }
    return { agentTags, orgPrefix };
}
/**
 * Normalize a Zoho Projects webhook payload into a standard task structure.
 */
export function normalizeProjectsPayload(raw) {
    const taskWrapper = (raw.Task ?? raw.task ?? {});
    let task;
    if (Array.isArray(taskWrapper.tasks) && taskWrapper.tasks.length > 0) {
        task = taskWrapper.tasks[0];
    }
    else {
        task = taskWrapper;
    }
    // Custom fields
    const customFieldsArr = (task.custom_fields ?? []);
    const customFields = {};
    let assignedAgent = "";
    for (const cf of customFieldsArr) {
        const label = cf.label_name ?? "";
        const value = cf.value ?? "";
        customFields[label] = value;
        if (label === "Assigned Agent")
            assignedAgent = value;
    }
    // Fallback chain for assigned agent
    if (!assignedAgent) {
        const oldCf = (task.CF ?? task.cf ?? {});
        assignedAgent = oldCf["Assigned Agent"] ?? oldCf.assigned_agent ?? "";
    }
    if (!assignedAgent) {
        assignedAgent = raw.assignedAgent ?? "";
    }
    // Tags
    const tagsRaw = task.tags;
    const tags = Array.isArray(tagsRaw)
        ? tagsRaw.map((t) => (typeof t === "string" ? t : t.name ?? ""))
        : undefined;
    // Extract agent tags and org prefix
    const { agentTags, orgPrefix } = extractAgentTags(raw, tags);
    // If still no assigned agent, derive from agent tags
    if (!assignedAgent && agentTags.length > 0) {
        const firstTag = agentTags[0];
        if (firstTag.includes(":")) {
            const name = firstTag.split(":")[1].trim();
            assignedAgent = name.charAt(0).toUpperCase() + name.slice(1);
        }
    }
    // Status
    const statusObj = task.status;
    const statusName = typeof statusObj === "object" && statusObj !== null ? statusObj.name ?? "" : String(statusObj ?? "");
    const statusType = typeof statusObj === "object" && statusObj !== null ? statusObj.type ?? "" : "";
    const completed = task.completed === true ||
        statusType.toLowerCase() === "closed" ||
        statusType.toLowerCase() === "completed" ||
        ["closed", "completed", "done"].includes(statusName.toLowerCase());
    // Project info
    const project = (raw.Project ?? raw.project ?? raw.Projects ?? {});
    return {
        taskId: String(task.id ?? task.id_string ?? ""),
        taskName: (task.name ?? task.title ?? ""),
        description: task.description ?? undefined,
        projectId: project.id ?? project.PROJECTID ?? "",
        projectName: project.name ?? project.PROJECTNAME ?? undefined,
        status: statusName,
        statusType,
        priority: task.priority ?? undefined,
        assignee: assignedAgent.trim() || undefined,
        assignedAgent: assignedAgent.trim() || undefined,
        parentTaskId: task.parent_task_id ?? undefined,
        completed,
        customFields,
        tags,
        agentTags,
        orgPrefix,
        raw,
    };
}
function mapPriority(zohoPriority) {
    if (!zohoPriority)
        return "low";
    return (PRIORITY_MAP[zohoPriority.toLowerCase()] ?? "low");
}
function mapStatus(zohoStatus) {
    if (!zohoStatus)
        return "todo";
    return PROJECTS_STATUS_MAP[zohoStatus.toLowerCase()] ?? "in_progress";
}
// ─── State helpers ──────────────────────────────────────────────────────────
async function getProjectMapping(ctx) {
    return (await ctx.state.get({ scopeKind: "instance", stateKey: "zoho.projectMapping" })) ?? [];
}
async function saveProjectMapping(ctx, mapping) {
    await ctx.state.set({ scopeKind: "instance", stateKey: "zoho.projectMapping" }, mapping);
}
// ─── State helpers (groups) ──────────────────────────────────────────────────
async function getGroupMappings(ctx) {
    return (await ctx.state.get({ scopeKind: "instance", stateKey: "zoho.groupMapping" })) ?? [];
}
// ─── Company resolution ─────────────────────────────────────────────────────
/**
 * Resolve the Paperclip company ID for a Zoho project.
 *
 * Strategy (in order):
 * 1. Fetch the project's group name from Zoho API → match to group mapping
 * 2. If no group mapping configured, try matching group name to Paperclip company name
 * 3. Fall back to single company if only one exists
 */
async function resolveCompanyId(ctx, zohoProjectId) {
    // Step 1: Try to get the project group from Zoho API
    const groupName = await fetchProjectGroupName(ctx, zohoProjectId);
    if (groupName) {
        // Check configured group mappings
        const groupMappings = await getGroupMappings(ctx);
        if (groupMappings.length > 0) {
            const match = groupMappings.find((g) => g.groupName.toLowerCase() === groupName.toLowerCase());
            if (match) {
                ctx.logger.info(`Resolved company from project group "${groupName}" → ${match.companyName ?? match.companyId}`);
                return match.companyId;
            }
        }
        // No explicit group mapping — try matching group name to Paperclip company name
        const companies = await ctx.companies.list({ limit: 50, offset: 0 });
        const companyMatch = companies.find((c) => c.name?.toLowerCase() === groupName.toLowerCase());
        if (companyMatch) {
            ctx.logger.info(`Resolved company from project group "${groupName}" → company "${companyMatch.name}" (name match)`);
            return companyMatch.id;
        }
    }
    // Step 2: Single company fallback
    const companies = await ctx.companies.list({ limit: 10, offset: 0 });
    if (companies.length === 1)
        return companies[0].id;
    return null;
}
/**
 * Fetch the project group name from the Zoho Projects API.
 * Returns null if the API call fails or the project has no group.
 */
async function fetchProjectGroupName(ctx, zohoProjectId) {
    const config = (await ctx.config.get());
    if (!config.portalId) {
        ctx.logger.debug("No portalId configured, skipping project group lookup");
        return null;
    }
    try {
        const result = await projectsFetch(ctx, "GET", `/portal/${config.portalId}/projects/${zohoProjectId}/`);
        if (!result.ok) {
            ctx.logger.debug(`Failed to fetch project ${zohoProjectId}: ${result.status}`);
            return null;
        }
        const data = result.data;
        // Zoho Projects API returns group info in the project response
        // The field name varies — check common patterns
        const projects = (data.projects ?? [data]);
        const project = projects[0];
        if (!project)
            return null;
        // Try known field names for project group
        const groupName = project.group_name ??
            project.GROUP_NAME ??
            (project.group?.name) ??
            null;
        return groupName || null;
    }
    catch (error) {
        ctx.logger.debug(`Error fetching project group for ${zohoProjectId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
// ─── Auto-create project ────────────────────────────────────────────────────
/**
 * Auto-link a Zoho project to an existing Paperclip Project by name match.
 * If no match is found, logs a warning — projects must be created manually in Paperclip.
 */
async function autoLinkProject(ctx, zohoProjectId, zohoProjectName, companyId) {
    const projectName = zohoProjectName || "";
    try {
        const existing = await ctx.projects.list({ companyId, limit: 200, offset: 0 });
        // Try exact name match
        let match = existing.find((p) => p.name === projectName);
        // Try case-insensitive match
        if (!match && projectName) {
            const lower = projectName.toLowerCase();
            match = existing.find((p) => p.name?.toLowerCase() === lower);
        }
        if (!match) {
            ctx.logger.warn(`No Paperclip project matches Zoho project "${projectName}" (${zohoProjectId}) in company ${companyId}. Create the project in Paperclip, or add a manual mapping in plugin settings.`);
            return null;
        }
        ctx.logger.info(`Auto-linked Zoho project "${projectName}" → Paperclip project "${match.name}" (${match.id})`);
        const entry = {
            zohoProjectId,
            zohoProjectName: projectName,
            paperclipProjectId: match.id,
            paperclipCompanyId: companyId,
        };
        const mappings = await getProjectMapping(ctx);
        mappings.push(entry);
        await saveProjectMapping(ctx, mappings);
        return entry;
    }
    catch (error) {
        ctx.logger.error(`Failed to auto-link project for Zoho project ${zohoProjectId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
// ─── Main handler ───────────────────────────────────────────────────────────
/**
 * Handle an inbound Zoho Projects webhook event.
 * Creates or updates a Paperclip Issue. Auto-creates projects as needed.
 */
export async function handleProjectsWebhook(ctx, rawBody, parsedBody) {
    const raw = parseWebhookBody(rawBody, parsedBody);
    const normalized = normalizeProjectsPayload(raw);
    // Resolve project mapping — auto-create if needed
    const projectMappings = await getProjectMapping(ctx);
    let projectMap = projectMappings.find((m) => m.zohoProjectId === normalized.projectId) ?? null;
    if (!projectMap) {
        // Resolve company from project group
        const companyId = await resolveCompanyId(ctx, normalized.projectId);
        if (!companyId) {
            ctx.logger.warn(`Cannot route Zoho project ${normalized.projectId}: no company resolved from org prefix "${normalized.orgPrefix}". Configure org prefix mappings in settings.`);
            return;
        }
        // Auto-link to an existing Paperclip project by name
        projectMap = await autoLinkProject(ctx, normalized.projectId, normalized.projectName, companyId);
        if (!projectMap)
            return;
    }
    const { paperclipProjectId, paperclipCompanyId } = projectMap;
    // Resolve agent — try auto-match by name within the company
    let agentId = null;
    if (normalized.assignedAgent) {
        agentId = await resolveAgent(ctx, normalized.assignedAgent);
        // If manual mapping didn't find it, try name-based auto-match
        if (!agentId) {
            agentId = await autoResolveAgentByName(ctx, normalized.assignedAgent, paperclipCompanyId);
        }
    }
    // Check for existing issue
    const originKind = "plugin:project-bridge:projects-task";
    const originId = normalized.taskId;
    const existingIssues = await ctx.issues.list({
        companyId: paperclipCompanyId,
        projectId: paperclipProjectId,
        originKind,
        originId,
        limit: 1,
        offset: 0,
    });
    const existing = existingIssues.length > 0 ? existingIssues[0] : null;
    let issueStatus = mapStatus(normalized.status);
    const issuePriority = mapPriority(normalized.priority);
    // Paperclip requires an assignee for in_progress issues — fall back to todo if unassigned
    if (issueStatus === "in_progress" && !agentId) {
        issueStatus = "todo";
    }
    if (existing) {
        await ctx.issues.update(existing.id, {
            status: issueStatus,
            priority: issuePriority,
            assigneeAgentId: agentId ?? undefined,
        }, paperclipCompanyId);
        ctx.logger.info(`Updated issue ${existing.id} from Zoho task ${normalized.taskId} (status: ${issueStatus})`);
    }
    else {
        const issue = await ctx.issues.create({
            companyId: paperclipCompanyId,
            projectId: paperclipProjectId,
            title: normalized.taskName,
            description: normalized.description,
            status: issueStatus,
            priority: issuePriority,
            assigneeAgentId: agentId ?? undefined,
            originKind,
            originId,
        });
        ctx.logger.info(`Created issue ${issue.id} from Zoho task ${normalized.taskId}: "${normalized.taskName}"`);
        await ctx.activity.log({
            companyId: paperclipCompanyId,
            entityType: "issue",
            entityId: issue.id,
            message: `Synced from Zoho Projects task "${normalized.taskName}" (${normalized.taskId})`,
            metadata: { plugin: "project-bridge" },
        });
    }
}
/**
 * Auto-resolve agent by matching name to Paperclip agents in a company.
 * Case-insensitive partial match on agent name.
 */
async function autoResolveAgentByName(ctx, agentName, companyId) {
    const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
    const lowerName = agentName.toLowerCase();
    // Exact name match
    const exact = agents.find((a) => a.name?.toLowerCase() === lowerName);
    if (exact)
        return exact.id;
    // Name contains match (e.g. "Kelly" matches "Kelly - PM")
    const partial = agents.find((a) => a.name?.toLowerCase().includes(lowerName));
    if (partial)
        return partial.id;
    return null;
}
//# sourceMappingURL=projects-handler.js.map