import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";

// ─── Styles ─────────────────────────────────────────────────────────────────

const btn: CSSProperties = {
  appearance: "none", border: "1px solid var(--border)", borderRadius: "999px",
  background: "transparent", color: "inherit", padding: "6px 14px", fontSize: "12px", cursor: "pointer",
};
const btnPrimary: CSSProperties = { ...btn, background: "var(--foreground)", color: "var(--background)", borderColor: "var(--foreground)" };
const btnDanger: CSSProperties = { ...btn, color: "var(--destructive, #dc2626)", borderColor: "var(--destructive, #dc2626)" };
const btnSmall: CSSProperties = { ...btn, padding: "4px 10px", fontSize: "11px" };
const btnSmallDanger: CSSProperties = { ...btnDanger, padding: "4px 10px", fontSize: "11px" };

const input: CSSProperties = {
  flex: 1, border: "1px solid var(--border)", borderRadius: "8px",
  padding: "8px 10px", background: "transparent", color: "inherit", fontSize: "12px", minWidth: 0,
};
const selectStyle: CSSProperties = {
  ...input, flex: 1, cursor: "pointer", minWidth: 160,
};

const section: CSSProperties = { marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1.25rem" };
const row: CSSProperties = { display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" };
const btnGroup: CSSProperties = { display: "flex", gap: "0.5rem", marginTop: "0.75rem" };
const muted: CSSProperties = { fontSize: "12px", color: "var(--muted-foreground, #888)" };
const dot = (ok: boolean): CSSProperties => ({
  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
  background: ok ? "var(--success, #22c55e)" : "var(--destructive, #dc2626)", marginRight: 6,
});
const cardStyle: CSSProperties = {
  border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem 1.25rem",
  marginBottom: "1rem", background: "var(--card, transparent)",
};
const cardHeaderStyle: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem",
};
const badgeStyle = (active: boolean): CSSProperties => ({
  fontSize: "10px", padding: "2px 8px", borderRadius: "999px",
  background: active ? "var(--success, #22c55e)" : "var(--muted, #666)",
  color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px",
});
const subsectionStyle: CSSProperties = {
  marginLeft: "1rem", paddingLeft: "1rem", borderLeft: "2px solid var(--border)", marginBottom: "1rem",
};

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceDef = { type: string; name: string; description: string; status: "available" | "coming-soon" };
type ServiceRecord = { id: string; type: string; name: string; enabled: boolean; createdAt: string };
type ConnectionStatus = { connected: boolean; dataCenter: string; connectedUser?: string; tokenExpiresAt?: number; tokenValid: boolean };
type ConnectUrlData = { connectUrl: string; configured: boolean };
type IdName = { id: string; name: string };
type ZohoProject = { id: string; name: string; status: string; group: IdName | null; clientCompany: IdName | null };
type ZohoClient = { id: string; name: string; users: Array<{ id: string; name: string; email: string }> };

const AVAILABLE_SERVICES: ServiceDef[] = [
  { type: "zoho-projects", name: "Zoho Projects", description: "Bidirectional project and task sync", status: "available" },
  { type: "zoho-desk", name: "Zoho Desk", description: "Ticket and support task sync", status: "coming-soon" },
  { type: "zoho-crm", name: "Zoho CRM", description: "Deal, lead, and activity sync", status: "coming-soon" },
  { type: "github", name: "GitHub Issues", description: "Issue and project sync", status: "coming-soon" },
  { type: "linear", name: "Linear", description: "Issue and project sync", status: "coming-soon" },
  { type: "google-tasks", name: "Google Tasks", description: "Task sync via Google Workspace", status: "coming-soon" },
  { type: "notion", name: "Notion", description: "Database and checklist sync", status: "coming-soon" },
];

// ─── Helper: extract company prefix from project name ───────────────────────

function extractCompanyPrefix(projectName: string): string {
  if (projectName.includes(" - ")) return projectName.split(" - ")[0].trim();
  return "";
}

function getUniqueCompanyPrefixes(projects: ZohoProject[]): string[] {
  const prefixes = new Set<string>();
  for (const p of projects) {
    const prefix = extractCompanyPrefix(p.name);
    if (prefix) prefixes.add(prefix);
  }
  return Array.from(prefixes).sort();
}

// ─── Zoho Projects Service Config ───────────────────────────────────────────

type OrgMapping = { zohoCompany: string; paperclipCompanyId: string };
type AgentMapping = { zohoName: string; paperclipAgentId: string; org: string };
type ProjectMapping = { zohoProjectId: string; zohoProjectName: string; paperclipProjectId: string; org: string };

function ZohoProjectsConfig({ serviceId }: { serviceId: string }) {
  const { data: status, refresh } = usePluginData<ConnectionStatus>("connection-status");
  const { data: connectData } = usePluginData<ConnectUrlData>("connect-url");
  const { data: zohoClientsData } = usePluginData<{ clients: ZohoClient[] }>("zoho-clients-list", { portalId: "60418044" });
  const { data: zohoProjectsData } = usePluginData<{ projects: ZohoProject[] }>("zoho-projects-list", { portalId: "60418044" });
  const { data: paperclipCompaniesData } = usePluginData<{ companies: IdName[] }>("paperclip-companies");
  const disconnectAction = usePluginAction("disconnect");
  const saveGroupMapping = usePluginAction("save-group-mapping");
  const saveAgentMapping = usePluginAction("save-agent-mapping");
  const saveProjectMapping = usePluginAction("save-project-mapping");

  const [orgMappings, setOrgMappings] = useState<OrgMapping[]>([]);
  const [agentMappings, setAgentMappings] = useState<AgentMapping[]>([]);
  const [projectMappings, setProjectMappings] = useState<ProjectMapping[]>([]);
  const [addingOrg, setAddingOrg] = useState(false);
  const [newOrgZoho, setNewOrgZoho] = useState("");
  const [newOrgPaperclip, setNewOrgPaperclip] = useState("");

  // Poll while disconnected
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!status?.connected) {
      pollRef.current = setInterval(() => refresh(), 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.connected, refresh]);

  const handleDisconnect = useCallback(async () => {
    if (confirm("Disconnect from Zoho? You will need to re-authenticate.")) {
      await disconnectAction();
      refresh();
    }
  }, [disconnectAction, refresh]);

  // Derived data
  const zohoClients = zohoClientsData?.clients ?? [];
  const zohoProjects = zohoProjectsData?.projects ?? [];
  const paperclipCompanies = paperclipCompaniesData?.companies ?? [];
  const mappedZohoCompanies = new Set(orgMappings.map((m) => m.zohoCompany));
  const unmappedZohoClients = zohoClients.filter((c) => !mappedZohoCompanies.has(c.name));
  const mappedPaperclipCompanyIds = new Set(orgMappings.map((m) => m.paperclipCompanyId));

  // Auto-save org mapping
  const saveOrgs = useCallback(async (mappings: OrgMapping[]) => {
    await saveGroupMapping({
      mapping: mappings.map((m) => ({ groupName: m.zohoCompany, companyId: m.paperclipCompanyId })),
    });
  }, [saveGroupMapping]);

  const handleAddOrg = useCallback(async () => {
    if (!newOrgZoho || !newOrgPaperclip) return;
    const updated = [...orgMappings, { zohoCompany: newOrgZoho, paperclipCompanyId: newOrgPaperclip }];
    setOrgMappings(updated);
    setAddingOrg(false);
    setNewOrgZoho("");
    setNewOrgPaperclip("");
    await saveOrgs(updated);
  }, [newOrgZoho, newOrgPaperclip, orgMappings, saveOrgs]);

  const handleRemoveOrg = useCallback(async (zohoCompany: string) => {
    const updated = orgMappings.filter((m) => m.zohoCompany !== zohoCompany);
    setOrgMappings(updated);
    // Also remove agent/project mappings for this org
    setAgentMappings((prev) => prev.filter((a) => a.org !== zohoCompany));
    setProjectMappings((prev) => prev.filter((p) => p.org !== zohoCompany));
    await saveOrgs(updated);
  }, [orgMappings, saveOrgs]);

  // Get Paperclip company name by ID
  const getCompanyName = (id: string) => paperclipCompanies.find((c) => c.id === id)?.name ?? id;

  // Get Zoho projects for a specific org (by name prefix)
  const getProjectsForOrg = (org: string) => zohoProjects.filter((p) => extractCompanyPrefix(p.name) === org);

  // Get Zoho client users for a specific org
  const getUsersForOrg = (org: string) => zohoClients.find((c) => c.name === org)?.users ?? [];

  // Get Paperclip agents for a company
  const [agentsByCompany, setAgentsByCompany] = useState<Record<string, IdName[]>>({});
  const loadAgentsForCompany = useCallback(async (companyId: string) => {
    // This is a simple cache — only fetch once per company
    if (agentsByCompany[companyId]) return;
    // We can't call usePluginData conditionally, so we use the action pattern
    // For now, agents will be loaded via a separate data call
  }, [agentsByCompany]);

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {/* ─── Connection ─────────────────────────────────────── */}
      <div style={section}>
        <h4 style={{ marginTop: 0 }}>Connection</h4>
        {status?.connected ? (
          <>
            <p style={{ margin: "0.25rem 0" }}>
              <span style={dot(status.tokenValid)} />
              Connected ({status.dataCenter})
              {status.connectedUser && <> as <strong>{status.connectedUser}</strong></>}
              {" "}<span style={muted}>
                {status.tokenValid ? "Token valid" : "Token expired"}
                {status.tokenExpiresAt && ` — expires ${new Date(status.tokenExpiresAt).toLocaleString()}`}
              </span>
            </p>
            <div style={btnGroup}>
              <a href={connectData?.connectUrl || "#"} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
                <button type="button" style={btn}>Reconnect</button>
              </a>
              <button type="button" style={btnDanger} onClick={handleDisconnect}>Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0.25rem 0" }}>
              <span style={dot(false)} />
              Not connected
            </p>
            <p style={muted}>Configure Client ID, Secret, and OAuth Callback URL in plugin config, then connect.</p>
            <div style={btnGroup}>
              {connectData?.configured ? (
                <a href={connectData.connectUrl} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
                  <button type="button" style={btnPrimary}>Connect to Zoho</button>
                </a>
              ) : (
                <button type="button" style={{ ...btnPrimary, opacity: 0.5, cursor: "not-allowed" }} disabled>
                  Connect to Zoho (configure callback URL first)
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Mappings (gated on connection) ─────────────────── */}
      {status?.connected && (
        <>
          {/* Organization Mapping */}
          <div style={section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h4 style={{ margin: 0 }}>Organization Mapping</h4>
              {!addingOrg && unmappedZohoClients.length > 0 && (
                <button type="button" style={btnSmall} onClick={() => setAddingOrg(true)}>+ Add</button>
              )}
            </div>
            <p style={muted}>Map Zoho client companies to Paperclip organizations.</p>

            {/* Existing org mappings */}
            {orgMappings.map((mapping) => (
              <div key={mapping.zohoCompany} style={{ marginBottom: "1.25rem" }}>
                <div style={row}>
                  <span style={{ flex: 1, fontSize: "13px" }}><strong>{mapping.zohoCompany}</strong> (Zoho)</span>
                  <span style={muted}>→</span>
                  <span style={{ flex: 1, fontSize: "13px" }}><strong>{getCompanyName(mapping.paperclipCompanyId)}</strong> (Paperclip)</span>
                  <button type="button" style={btnSmallDanger} onClick={() => handleRemoveOrg(mapping.zohoCompany)} title="Remove">x</button>
                </div>

                {/* Nested: Agents for this org */}
                <div style={subsectionStyle}>
                  <p style={{ ...muted, marginBottom: "0.5rem", marginTop: "0.25rem" }}>
                    <strong>Agents</strong> — {getUsersForOrg(mapping.zohoCompany).length} Zoho client users
                  </p>
                  {getUsersForOrg(mapping.zohoCompany).map((zu) => {
                    const existingAgent = agentMappings.find((am) => am.zohoName === zu.name && am.org === mapping.zohoCompany);
                    return (
                      <div key={zu.id} style={{ ...row, fontSize: "12px" }}>
                        <span style={{ flex: 1 }}>{zu.name} <span style={muted}>({zu.email})</span></span>
                        <span style={muted}>→</span>
                        <span style={{ flex: 1, color: existingAgent ? "inherit" : "var(--muted-foreground, #888)" }}>
                          {existingAgent ? existingAgent.paperclipAgentId : "(auto-match by name)"}
                        </span>
                      </div>
                    );
                  })}
                  {getUsersForOrg(mapping.zohoCompany).length === 0 && (
                    <p style={muted}>No client users found. Users are loaded from the Zoho client company.</p>
                  )}
                </div>

                {/* Nested: Projects for this org */}
                <div style={subsectionStyle}>
                  <p style={{ ...muted, marginBottom: "0.5rem", marginTop: "0.25rem" }}>
                    <strong>Projects</strong> — {getProjectsForOrg(mapping.zohoCompany).length} Zoho projects
                  </p>
                  {getProjectsForOrg(mapping.zohoCompany).map((zp) => {
                    const existing = projectMappings.find((pm) => pm.zohoProjectId === zp.id);
                    return (
                      <div key={zp.id} style={{ ...row, fontSize: "12px" }}>
                        <span style={{ flex: 1 }}>{zp.name}</span>
                        <span style={muted}>→</span>
                        <span style={{ flex: 1, color: existing ? "inherit" : "var(--muted-foreground, #888)" }}>
                          {existing ? existing.zohoProjectName : "(auto-link by name)"}
                        </span>
                      </div>
                    );
                  })}
                  {getProjectsForOrg(mapping.zohoCompany).length === 0 && (
                    <p style={muted}>No projects found for this organization.</p>
                  )}
                </div>
              </div>
            ))}

            {/* Add org mapping */}
            {addingOrg && (
              <div style={{ ...cardStyle, padding: "0.75rem 1rem" }}>
                <div style={row}>
                  <select
                    style={selectStyle}
                    value={newOrgZoho}
                    onChange={(e) => setNewOrgZoho(e.target.value)}
                  >
                    <option value="">Select Zoho client company...</option>
                    {unmappedZohoClients.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <span style={muted}>→</span>
                  <select
                    style={selectStyle}
                    value={newOrgPaperclip}
                    onChange={(e) => setNewOrgPaperclip(e.target.value)}
                  >
                    <option value="">Select Paperclip company...</option>
                    {paperclipCompanies
                      .filter((c) => !mappedPaperclipCompanyIds.has(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <button type="button" style={btnPrimary} onClick={handleAddOrg} disabled={!newOrgZoho || !newOrgPaperclip}>
                    Save
                  </button>
                  <button type="button" style={btn} onClick={() => { setAddingOrg(false); setNewOrgZoho(""); setNewOrgPaperclip(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {orgMappings.length === 0 && !addingOrg && (
              <p style={muted}>
                {zohoClients.length > 0
                  ? `${zohoClients.length} Zoho client companies found. Click + Add to map them to Paperclip organizations.`
                  : "Loading Zoho client companies..."
                }
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Coming Soon ────────────────────────────────────────────────────────────

function ComingSoonConfig({ serviceDef }: { serviceDef: ServiceDef }) {
  return (
    <div style={{ padding: "1rem 0" }}>
      <p style={muted}>{serviceDef.description} — coming soon.</p>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export function ProjectBridgeSettingsPage(_props: PluginSettingsPageProps) {
  const { data: services, refresh: refreshServices } = usePluginData<ServiceRecord[]>("services");
  const { data: status, refresh: refreshStatus } = usePluginData<ConnectionStatus>("connection-status");
  const addService = usePluginAction("add-service");
  const removeService = usePluginAction("remove-service");
  const [addingService, setAddingService] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [expandedService, setExpandedService] = useState<string | null>(null);

  // Poll connection status every 3s so badge updates after connect/disconnect
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    statusPollRef.current = setInterval(() => refreshStatus(), 3000);
    return () => { if (statusPollRef.current) clearInterval(statusPollRef.current); };
  }, [refreshStatus]);

  const handleAddService = useCallback(async () => {
    if (!selectedType) return;
    const def = AVAILABLE_SERVICES.find((s) => s.type === selectedType);
    if (!def) return;
    await addService({ serviceType: def.type, name: def.name });
    setAddingService(false);
    setSelectedType("");
    refreshServices();
  }, [selectedType, addService, refreshServices]);

  const handleRemoveService = useCallback(async (serviceId: string) => {
    if (!confirm("Remove this service and its configuration?")) return;
    await removeService({ serviceId });
    refreshServices();
  }, [removeService, refreshServices]);

  const serviceList = services ?? [];
  const configuredTypes = new Set(serviceList.map((s) => s.type));

  // Determine button label for each service
  const getServiceButtonLabel = (svc: ServiceRecord, isExpanded: boolean): string => {
    if (isExpanded) return "Collapse";
    if (svc.type === "zoho-projects" && status?.connected) return "Edit";
    return "Setup";
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 850 }}>
      <div style={section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Connected Services</h3>
          {!addingService && (
            <button type="button" style={btnSmall} onClick={() => setAddingService(true)}>+ Add Service</button>
          )}
        </div>

        {addingService && (
          <div style={{ ...cardStyle, borderColor: "var(--border)" }}>
            <div style={row}>
              <select style={{ ...selectStyle, minWidth: 220 }} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                <option value="">Select a service...</option>
                {AVAILABLE_SERVICES.map((s) => (
                  <option key={s.type} value={s.type} disabled={configuredTypes.has(s.type)}>
                    {s.name}{configuredTypes.has(s.type) ? " (already added)" : ""}{s.status === "coming-soon" ? " (coming soon)" : ""}
                  </option>
                ))}
              </select>
              <button type="button" style={btnPrimary} onClick={handleAddService} disabled={!selectedType}>Add</button>
              <button type="button" style={btn} onClick={() => { setAddingService(false); setSelectedType(""); }}>Cancel</button>
            </div>
            {selectedType && (
              <p style={{ ...muted, marginTop: "0.5rem", marginBottom: 0 }}>
                {AVAILABLE_SERVICES.find((s) => s.type === selectedType)?.description}
              </p>
            )}
          </div>
        )}

        {serviceList.length === 0 && !addingService && (
          <p style={muted}>No services connected yet. Add a service to start syncing projects and tasks.</p>
        )}

        {serviceList.map((svc) => {
          const def = AVAILABLE_SERVICES.find((d) => d.type === svc.type);
          const isExpanded = expandedService === svc.id;
          const isConnected = svc.type === "zoho-projects" && status?.connected;

          return (
            <div key={svc.id} style={cardStyle}>
              <div style={cardHeaderStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {svc.type === "zoho-projects" && <span style={dot(!!isConnected)} />}
                  <strong style={{ fontSize: "14px" }}>{svc.name}</strong>
                  <span style={badgeStyle(def?.status !== "coming-soon" && !!isConnected)}>
                    {def?.status === "coming-soon" ? "Coming Soon" : isConnected ? "Connected" : "Not Connected"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" style={btnSmall} onClick={() => setExpandedService(isExpanded ? null : svc.id)}>
                    {getServiceButtonLabel(svc, isExpanded)}
                  </button>
                  <button type="button" style={btnSmallDanger} onClick={() => handleRemoveService(svc.id)}>
                    Remove
                  </button>
                </div>
              </div>

              {!isExpanded && (
                <p style={{ ...muted, margin: 0 }}>{def?.description ?? svc.type}</p>
              )}

              {isExpanded && (
                def?.status === "coming-soon"
                  ? <ComingSoonConfig serviceDef={def} />
                  : svc.type === "zoho-projects"
                    ? <ZohoProjectsConfig serviceId={svc.id} />
                    : <ComingSoonConfig serviceDef={def ?? { type: svc.type, name: svc.name, description: "Unknown service", status: "coming-soon" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
