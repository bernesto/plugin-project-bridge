/**
 * Hermes agent provisioning.
 * Creates per-agent hermes-home directories with config, SOUL.md, and skill symlinks.
 */
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
/**
 * Provision a Hermes home directory for an agent.
 */
export declare function provisionHermesHome(ctx: PluginContext, agentId: string, companyId: string): Promise<void>;
/**
 * Handle agent.created and agent.updated events.
 */
export declare function handleAgentEvent(ctx: PluginContext, event: PluginEvent): Promise<void>;
//# sourceMappingURL=hermes-home.d.ts.map