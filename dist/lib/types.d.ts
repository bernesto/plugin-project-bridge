import type { DataCenterKey } from "../constants.js";
/** Plugin auth state stored in ctx.state */
export type ZohoAuthState = {
    refreshToken: string;
    accessToken: string;
    expiresAt: number;
    dataCenter: DataCenterKey;
    connectedUser?: string;
};
/** Agent mapping entry: Zoho user → Paperclip agent */
export type AgentMappingEntry = {
    zohoName: string;
    zohoId?: string;
    paperclipAgentId: string;
};
/** Project mapping entry: Zoho project → Paperclip project + company */
export type ProjectMappingEntry = {
    zohoProjectId: string;
    zohoProjectName?: string;
    paperclipProjectId: string;
    paperclipCompanyId: string;
};
/** Project group mapping: Zoho project group name → Paperclip company ID */
export type GroupMappingEntry = {
    groupName: string;
    companyId: string;
    companyName?: string;
};
/** Zoho API service types */
export type ZohoService = "desk" | "crm" | "projects";
/** Normalized Zoho Projects task from webhook */
export type NormalizedProjectsTask = {
    taskId: string;
    taskName: string;
    description?: string;
    projectId: string;
    projectName?: string;
    status: string;
    statusType?: string;
    priority?: string;
    assignee?: string;
    assignedAgent?: string;
    parentTaskId?: string;
    completed: boolean;
    customFields: Record<string, string>;
    tags?: string[];
    agentTags?: string[];
    orgPrefix?: string;
    dependencies?: Array<{
        taskId: string;
        type: string;
    }>;
    raw: unknown;
};
//# sourceMappingURL=types.d.ts.map