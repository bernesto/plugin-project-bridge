/**
 * Hermes agent provisioning.
 * Creates per-agent hermes-home directories with config, SOUL.md, and skill symlinks.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
const PAPERCLIP_BASE = path.join(os.homedir(), ".paperclip", "instances", "default", "companies");
/** Role tag → Cortex Shared Skills shortcode mapping */
const ROLE_SKILLS_MAP = {
    marketing: "mk",
    engineering: "en",
    "customer service": "cs",
    finance: "fi",
    ai: "ai",
    sales: "mk", // sales uses marketing skills as base
    support: "cs",
    creative: "mk",
    legal: "en", // legal agents use engineering skills as base
    hr: "en",
};
const CSS_BASE = path.join(os.homedir(), ".cs");
function getHermesHomePath(companyId, agentId) {
    return path.join(PAPERCLIP_BASE, companyId, "agents", agentId, "hermes-home");
}
/**
 * Provision a Hermes home directory for an agent.
 */
export async function provisionHermesHome(ctx, agentId, companyId) {
    const agent = await ctx.agents.get(agentId, companyId);
    if (!agent) {
        ctx.logger.warn(`Agent ${agentId} not found, skipping provisioning`);
        return;
    }
    const hermesHome = getHermesHomePath(companyId, agentId);
    // Create directory structure
    await fs.mkdir(path.join(hermesHome, "skills"), { recursive: true });
    // Generate config.yaml
    const configYaml = [
        "model: anthropic/claude-sonnet-4-20250514",
        "provider: anthropic",
        "toolsets:",
        "  - core",
        "  - filesystem",
        "  - web",
        "skills_path: ./skills",
        "memory_path: .",
        "",
    ].join("\n");
    await fs.writeFile(path.join(hermesHome, "config.yaml"), configYaml, "utf-8");
    // Generate SOUL.md from agent definition
    const agentName = agent.name ?? "Agent";
    const agentRole = agent.role ?? "general";
    const agentTitle = agent.title ?? agentName;
    const soulMd = [
        `# ${agentName}`,
        "",
        `**Role:** ${agentRole}`,
        `**Title:** ${agentTitle}`,
        "",
        `You are ${agentName}, an AI agent working within the Paperclip control plane.`,
        "",
    ].join("\n");
    await fs.writeFile(path.join(hermesHome, "SOUL.md"), soulMd, "utf-8");
    // Initialize MEMORY.md if not exists
    const memoryPath = path.join(hermesHome, "MEMORY.md");
    try {
        await fs.access(memoryPath);
    }
    catch {
        await fs.writeFile(memoryPath, `# ${agentName} — Memory\n\n`, "utf-8");
    }
    // Link skills based on agent role/capabilities
    const role = agentRole.toLowerCase();
    const skillCode = ROLE_SKILLS_MAP[role];
    if (skillCode) {
        const cssPath = path.join(CSS_BASE, skillCode);
        const linkPath = path.join(hermesHome, "skills", skillCode);
        try {
            await fs.access(cssPath);
            try {
                await fs.unlink(linkPath);
            }
            catch {
                // Doesn't exist yet
            }
            await fs.symlink(cssPath, linkPath);
            ctx.logger.info(`Linked skills/${skillCode} → ${cssPath} for agent ${agentName}`);
        }
        catch {
            ctx.logger.warn(`CSS path ${cssPath} not found, skipping skill link for ${agentName}`);
        }
    }
    ctx.logger.info(`Provisioned hermes-home for agent ${agentName} (${agentId}) at ${hermesHome}`);
}
/**
 * Handle agent.created and agent.updated events.
 */
export async function handleAgentEvent(ctx, event) {
    const payload = event.payload;
    if (!payload.agentId || !payload.companyId)
        return;
    try {
        await provisionHermesHome(ctx, payload.agentId, payload.companyId);
    }
    catch (error) {
        ctx.logger.error(`Failed to provision hermes-home for agent ${payload.agentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=hermes-home.js.map