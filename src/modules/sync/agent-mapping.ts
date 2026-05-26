/**
 * Agent mapping: resolves Zoho user names to Paperclip agent IDs.
 * Mapping is stored in plugin state and configurable via settings UI.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { AgentMappingEntry } from "../../lib/types.js";

async function getAgentMapping(ctx: PluginContext): Promise<AgentMappingEntry[]> {
  const mapping = (await ctx.state.get({
    scopeKind: "instance",
    stateKey: "zoho.agentMapping",
  })) as AgentMappingEntry[] | null;
  return mapping ?? [];
}

/**
 * Resolve a Zoho agent display name to a Paperclip agent ID.
 * Tries exact match, then first-name extraction (before " - "), then without trailing period.
 */
export async function resolveAgent(
  ctx: PluginContext,
  agentName: string,
): Promise<string | null> {
  if (!agentName) return null;

  const mapping = await getAgentMapping(ctx);
  const trimmed = agentName.trim();

  // Exact match
  const exact = mapping.find(
    (e) => e.zohoName === trimmed || e.zohoId === trimmed,
  );
  if (exact) return exact.paperclipAgentId;

  // Extract name before " - " (e.g. "Ada - EA (Brian)" → "Ada")
  const namePart = trimmed.split(" - ")[0].split(" -")[0].trim();
  if (namePart !== trimmed) {
    const partial = mapping.find((e) => e.zohoName === namePart);
    if (partial) return partial.paperclipAgentId;
  }

  // Without trailing period (e.g. "David O." → "David O")
  const noDot = namePart.replace(/\.$/, "");
  if (noDot !== namePart) {
    const dotless = mapping.find((e) => e.zohoName === noDot);
    if (dotless) return dotless.paperclipAgentId;
  }

  return null;
}
