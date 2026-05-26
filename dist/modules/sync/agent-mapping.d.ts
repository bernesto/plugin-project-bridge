/**
 * Agent mapping: resolves Zoho user names to Paperclip agent IDs.
 * Mapping is stored in plugin state and configurable via settings UI.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
/**
 * Resolve a Zoho agent display name to a Paperclip agent ID.
 * Tries exact match, then first-name extraction (before " - "), then without trailing period.
 */
export declare function resolveAgent(ctx: PluginContext, agentName: string): Promise<string | null>;
//# sourceMappingURL=agent-mapping.d.ts.map