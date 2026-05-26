export const PLUGIN_ID = "project-bridge";
export const PLUGIN_VERSION = "0.1.0";
export const SLOT_IDS = {
    settingsPage: "project-bridge-settings-page",
};
export const EXPORT_NAMES = {
    settingsPage: "ProjectBridgeSettingsPage",
};
export const JOB_KEYS = {
    tokenRefresh: "zoho-token-refresh",
};
export const WEBHOOK_KEYS = {
    projects: "zoho-projects",
    desk: "zoho-desk",
};
/** Zoho data center configuration */
export const DATA_CENTERS = {
    US: { accounts: "accounts.zoho.com", api: "www.zohoapis.com", projects: "projectsapi.zoho.com", desk: "desk.zoho.com", crm: "www.zohoapis.com" },
    EU: { accounts: "accounts.zoho.eu", api: "www.zohoapis.eu", projects: "projectsapi.zoho.eu", desk: "desk.zoho.eu", crm: "www.zohoapis.eu" },
    IN: { accounts: "accounts.zoho.in", api: "www.zohoapis.in", projects: "projectsapi.zoho.in", desk: "desk.zoho.in", crm: "www.zohoapis.in" },
    AU: { accounts: "accounts.zoho.com.au", api: "www.zohoapis.com.au", projects: "projectsapi.zoho.com.au", desk: "desk.zoho.com.au", crm: "www.zohoapis.com.au" },
    JP: { accounts: "accounts.zoho.jp", api: "www.zohoapis.jp", projects: "projectsapi.zoho.jp", desk: "desk.zoho.jp", crm: "www.zohoapis.jp" },
    CA: { accounts: "accounts.zohocloud.ca", api: "www.zohoapis.ca", projects: "projectsapi.zohocloud.ca", desk: "desk.zohocloud.ca", crm: "www.zohoapis.ca" },
};
/** OAuth scopes for project/task sync (no Cliq scopes) */
export const ZOHO_SCOPES = [
    "ZohoProjects.tasks.ALL",
    "ZohoProjects.portals.READ",
    "ZohoProjects.projects.ALL",
    "Desk.tickets.ALL",
    "Desk.tasks.ALL",
    "Desk.contacts.READ",
    "Desk.basic.READ",
    "Desk.settings.READ",
    "ZohoCRM.modules.ALL",
    "ZohoCRM.settings.ALL",
].join(",");
/** Status mappings: Zoho Projects → Paperclip */
export const PROJECTS_STATUS_MAP = {
    open: "todo",
    "in progress": "in_progress",
    "on hold": "blocked",
    "in review": "in_review",
    completed: "done",
    closed: "done",
};
/** Status mappings: Paperclip → Zoho Projects */
export const PAPERCLIP_TO_PROJECTS_STATUS = {
    todo: "Open",
    in_progress: "In Progress",
    blocked: "On Hold",
    in_review: "In Review",
    done: "Closed",
    cancelled: "Closed",
};
/** Priority mappings: Zoho → Paperclip */
export const PRIORITY_MAP = {
    none: "low",
    low: "low",
    medium: "medium",
    high: "high",
};
//# sourceMappingURL=constants.js.map