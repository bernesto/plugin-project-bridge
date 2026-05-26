import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_NAMES,
  JOB_KEYS,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  WEBHOOK_KEYS,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Project Bridge",
  description:
    "Bridges external project management systems with Paperclip. Bidirectional sync of projects, tasks, issues, statuses, and assignments. Starts with Zoho Projects, extensible to other services.",
  author: "Neoreef",
  categories: ["connector", "automation"],
  capabilities: [
    "companies.read",
    "projects.read",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.read",
    "issue.comments.create",
    "agents.read",
    "goals.read",
    "goals.create",
    "goals.update",
    "activity.log.write",
    "metrics.write",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "events.emit",
    "jobs.schedule",
    "webhooks.receive",
    "http.outbound",
    "secrets.read-ref",
    "instance.settings.register",
    "ui.page.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      zohoClientId: {
        type: "string",
        title: "Zoho Client ID",
      },
      zohoClientSecret: {
        type: "string",
        title: "Zoho Client Secret",
      },
      dataCenter: {
        type: "string",
        title: "Zoho Data Center",
        enum: ["US", "EU", "IN", "AU", "JP", "CA"],
        default: "US",
      },
      projectsEnabled: {
        type: "boolean",
        title: "Enable Zoho Projects Sync",
        default: true,
      },
      deskEnabled: {
        type: "boolean",
        title: "Enable Zoho Desk Sync",
        default: false,
      },
      crmEnabled: {
        type: "boolean",
        title: "Enable Zoho CRM Sync",
        default: false,
      },
      portalId: {
        type: "string",
        title: "Zoho Projects Portal ID",
      },
      deskOrgId: {
        type: "string",
        title: "Zoho Desk Organization ID",
      },
    },
  },
  jobs: [
    {
      jobKey: JOB_KEYS.tokenRefresh,
      displayName: "Zoho Token Refresh",
      description: "Proactively refresh Zoho access token before expiry",
      schedule: "*/45 * * * *",
    },
  ],
  webhooks: [
    {
      endpointKey: WEBHOOK_KEYS.projects,
      displayName: "Zoho Projects",
      description: "Receives task create/update/delete events from Zoho Projects workflow webhooks",
    },
    {
      endpointKey: WEBHOOK_KEYS.desk,
      displayName: "Zoho Desk",
      description: "Receives ticket events from Zoho Desk webhooks",
    },
  ],
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "Project Bridge Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
    ],
  },
};

export default manifest;
