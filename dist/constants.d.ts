export declare const PLUGIN_ID = "project-bridge";
export declare const PLUGIN_VERSION = "0.1.0";
export declare const SLOT_IDS: {
    readonly settingsPage: "project-bridge-settings-page";
};
export declare const EXPORT_NAMES: {
    readonly settingsPage: "ProjectBridgeSettingsPage";
};
export declare const JOB_KEYS: {
    readonly tokenRefresh: "zoho-token-refresh";
};
export declare const WEBHOOK_KEYS: {
    readonly projects: "zoho-projects";
    readonly desk: "zoho-desk";
};
/** Zoho data center configuration */
export declare const DATA_CENTERS: {
    readonly US: {
        readonly accounts: "accounts.zoho.com";
        readonly api: "www.zohoapis.com";
        readonly projects: "projectsapi.zoho.com";
        readonly desk: "desk.zoho.com";
        readonly crm: "www.zohoapis.com";
    };
    readonly EU: {
        readonly accounts: "accounts.zoho.eu";
        readonly api: "www.zohoapis.eu";
        readonly projects: "projectsapi.zoho.eu";
        readonly desk: "desk.zoho.eu";
        readonly crm: "www.zohoapis.eu";
    };
    readonly IN: {
        readonly accounts: "accounts.zoho.in";
        readonly api: "www.zohoapis.in";
        readonly projects: "projectsapi.zoho.in";
        readonly desk: "desk.zoho.in";
        readonly crm: "www.zohoapis.in";
    };
    readonly AU: {
        readonly accounts: "accounts.zoho.com.au";
        readonly api: "www.zohoapis.com.au";
        readonly projects: "projectsapi.zoho.com.au";
        readonly desk: "desk.zoho.com.au";
        readonly crm: "www.zohoapis.com.au";
    };
    readonly JP: {
        readonly accounts: "accounts.zoho.jp";
        readonly api: "www.zohoapis.jp";
        readonly projects: "projectsapi.zoho.jp";
        readonly desk: "desk.zoho.jp";
        readonly crm: "www.zohoapis.jp";
    };
    readonly CA: {
        readonly accounts: "accounts.zohocloud.ca";
        readonly api: "www.zohoapis.ca";
        readonly projects: "projectsapi.zohocloud.ca";
        readonly desk: "desk.zohocloud.ca";
        readonly crm: "www.zohoapis.ca";
    };
};
export type DataCenterKey = keyof typeof DATA_CENTERS;
/** OAuth scopes for project/task sync (no Cliq scopes) */
export declare const ZOHO_SCOPES: string;
/** Status mappings: Zoho Projects → Paperclip */
export declare const PROJECTS_STATUS_MAP: Record<string, string>;
/** Status mappings: Paperclip → Zoho Projects */
export declare const PAPERCLIP_TO_PROJECTS_STATUS: Record<string, string>;
/** Priority mappings: Zoho → Paperclip */
export declare const PRIORITY_MAP: Record<string, string>;
//# sourceMappingURL=constants.d.ts.map