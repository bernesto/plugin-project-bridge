/**
 * Outbound sync: Paperclip → Zoho.
 * When a Paperclip Issue status changes, update the corresponding Zoho entity.
 */
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
/**
 * Handle issue.updated events and sync status back to Zoho.
 */
export declare function handleIssueUpdated(ctx: PluginContext, event: PluginEvent): Promise<void>;
//# sourceMappingURL=outbound-sync.d.ts.map