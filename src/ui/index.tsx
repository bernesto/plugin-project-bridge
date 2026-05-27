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

const inputStyle: CSSProperties = {
  flex: 1, border: "1px solid var(--border)", borderRadius: "8px",
  padding: "8px 10px", background: "transparent", color: "inherit", fontSize: "12px", minWidth: 0,
};
const selectStyle: CSSProperties = {
  ...inputStyle, cursor: "pointer", minWidth: 160,
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

// ─── Autocomplete Component ─────────────────────────────────────────────────

type AutocompleteOption = { id: string; label: string; sublabel?: string };

function Autocomplete({
  options, value, onChange, placeholder, disabled,
}: {
  options: AutocompleteOption[];
  value: string;
  onChange: (id: string, label: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value ? options.find((o) => o.id === value)?.label ?? "" : "");
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = (query.length === 0
    ? options
    : options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
  ).filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (value) {
      const match = options.find((o) => o.id === value);
      if (match && match.label !== query) setQuery(match.label);
    }
  }, [value, options]);

  const select = (opt: AutocompleteOption) => {
    setQuery(opt.label);
    setOpen(false);
    setFocusIdx(-1);
    onChange(opt.id, opt.label);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && focusIdx >= 0 && filtered[focusIdx]) { e.preventDefault(); select(filtered[focusIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setFocusIdx(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          maxHeight: 200, overflowY: "auto",
          border: "1px solid var(--border)", borderRadius: "8px",
          background: "var(--popover, var(--background, #1a1a1a))",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", marginTop: 2,
        }}>
          {filtered.map((opt, i) => (
            <div
              key={opt.id}
              style={{
                padding: "6px 10px", cursor: "pointer", fontSize: "12px",
                background: i === focusIdx ? "var(--accent, rgba(255,255,255,0.1))" : "transparent",
              }}
              onMouseEnter={() => setFocusIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); select(opt); }}
            >
              {opt.label}
              {opt.sublabel && <span style={{ ...muted, marginLeft: 6 }}>{opt.sublabel}</span>}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          padding: "8px 10px", fontSize: "12px",
          border: "1px solid var(--border)", borderRadius: "8px",
          background: "var(--popover, var(--background, #1a1a1a))",
          color: "var(--muted-foreground, #888)", marginTop: 2,
        }}>
          No matches
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractCompanyPrefix(projectName: string): string {
  if (projectName.includes(" - ")) return projectName.split(" - ")[0].trim();
  return "";
}

// ─── Zoho Projects Service Config ───────────────────────────────────────────

type OrgMapping = { zohoCompanyId: string; zohoCompany: string; paperclipCompanyId: string; paperclipCompanyName: string };
type AgentMapping = { zohoUserId: string; zohoName: string; paperclipAgentId: string; paperclipAgentName: string; org: string };
type ProjectMapping = { zohoProjectId: string; zohoProjectName: string; paperclipProjectId: string; paperclipProjectName: string; org: string };

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
  const [newOrgZohoId, setNewOrgZohoId] = useState("");
  const [newOrgZohoName, setNewOrgZohoName] = useState("");
  const [newOrgPaperclipId, setNewOrgPaperclipId] = useState("");
  const [newOrgPaperclipName, setNewOrgPaperclipName] = useState("");

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
  const mappedZohoClientIds = new Set(orgMappings.map((m) => m.zohoCompanyId));
  const mappedPaperclipCompanyIds = new Set(orgMappings.map((m) => m.paperclipCompanyId));

  // Autocomplete options
  const zohoClientOptions: AutocompleteOption[] = zohoClients
    .filter((c) => !mappedZohoClientIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.name, sublabel: `${c.users.length} users` }));

  const paperclipCompanyOptions: AutocompleteOption[] = paperclipCompanies
    .filter((c) => !mappedPaperclipCompanyIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.name }));

  // Auto-save org mappings
  const persistOrgs = useCallback(async (mappings: OrgMapping[]) => {
    await saveGroupMapping({
      mapping: mappings.map((m) => ({ groupName: m.zohoCompany, companyId: m.paperclipCompanyId })),
    });
  }, [saveGroupMapping]);

  const handleAddOrg = useCallback(async () => {
    if (!newOrgZohoId || !newOrgPaperclipId) return;
    const updated = [...orgMappings, {
      zohoCompanyId: newOrgZohoId, zohoCompany: newOrgZohoName,
      paperclipCompanyId: newOrgPaperclipId, paperclipCompanyName: newOrgPaperclipName,
    }];
    setOrgMappings(updated);
    setAddingOrg(false);
    setNewOrgZohoId(""); setNewOrgZohoName("");
    setNewOrgPaperclipId(""); setNewOrgPaperclipName("");
    await persistOrgs(updated);
  }, [newOrgZohoId, newOrgZohoName, newOrgPaperclipId, newOrgPaperclipName, orgMappings, persistOrgs]);

  const handleRemoveOrg = useCallback(async (zohoCompanyId: string) => {
    const updated = orgMappings.filter((m) => m.zohoCompanyId !== zohoCompanyId);
    setOrgMappings(updated);
    setAgentMappings((prev) => prev.filter((a) => a.org !== zohoCompanyId));
    setProjectMappings((prev) => prev.filter((p) => p.org !== zohoCompanyId));
    await persistOrgs(updated);
  }, [orgMappings, persistOrgs]);

  // Get Zoho client users for an org
  const getUsersForOrg = (zohoCompanyId: string) => zohoClients.find((c) => c.id === zohoCompanyId)?.users ?? [];

  // Get Zoho projects for an org (by name prefix matching the company name)
  const getProjectsForOrg = (zohoCompanyName: string) => zohoProjects.filter((p) => extractCompanyPrefix(p.name) === zohoCompanyName);

  // Get Paperclip agents for a company
  const paperclipAgentOptions = useCallback((companyId: string): AutocompleteOption[] => {
    // For now return empty — agents need to be fetched per-company
    // TODO: use usePluginData("paperclip-agents", { companyId }) when we can call hooks dynamically
    return [];
  }, []);

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
        <div style={section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h4 style={{ margin: 0 }}>Organization Mapping</h4>
            {!addingOrg && zohoClientOptions.length > 0 && (
              <button type="button" style={btnSmall} onClick={() => setAddingOrg(true)}>+ Add</button>
            )}
          </div>
          <p style={muted}>Map Zoho client companies to Paperclip organizations. Agent and project mappings appear under each organization.</p>

          {/* Existing org mappings */}
          {orgMappings.map((mapping) => (
            <div key={mapping.zohoCompanyId} style={{ marginBottom: "1.25rem" }}>
              <div style={row}>
                <span style={{ flex: 1, fontSize: "13px" }}><strong>{mapping.zohoCompany}</strong></span>
                <span style={muted}>→</span>
                <span style={{ flex: 1, fontSize: "13px" }}><strong>{mapping.paperclipCompanyName}</strong></span>
                <button type="button" style={btnSmallDanger} onClick={() => handleRemoveOrg(mapping.zohoCompanyId)} title="Remove mapping">x</button>
              </div>

              {/* Nested: Agents */}
              <div style={subsectionStyle}>
                <p style={{ ...muted, marginBottom: "0.5rem", marginTop: "0.25rem" }}>
                  <strong>Agents</strong> — {getUsersForOrg(mapping.zohoCompanyId).length} Zoho client users
                </p>
                {getUsersForOrg(mapping.zohoCompanyId).map((zu) => {
                  const existingAgent = agentMappings.find((am) => am.zohoUserId === zu.id);
                  return (
                    <div key={zu.id} style={{ ...row, fontSize: "12px" }}>
                      <span style={{ flex: 1 }}>{zu.name} <span style={muted}>({zu.email})</span></span>
                      <span style={muted}>→</span>
                      <span style={{ flex: 1, color: existingAgent ? "inherit" : "var(--muted-foreground, #888)" }}>
                        {existingAgent ? existingAgent.paperclipAgentName : "(auto-match by name)"}
                      </span>
                    </div>
                  );
                })}
                {getUsersForOrg(mapping.zohoCompanyId).length === 0 && (
                  <p style={muted}>No client users found for this company.</p>
                )}
              </div>

              {/* Nested: Projects */}
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
                        {existing ? existing.paperclipProjectName : "(auto-link by name)"}
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
                <Autocomplete
                  options={zohoClientOptions}
                  value={newOrgZohoId}
                  onChange={(id, label) => { setNewOrgZohoId(id); setNewOrgZohoName(label); }}
                  placeholder="Search Zoho client company..."
                />
                <span style={muted}>→</span>
                <Autocomplete
                  options={paperclipCompanyOptions}
                  value={newOrgPaperclipId}
                  onChange={(id, label) => { setNewOrgPaperclipId(id); setNewOrgPaperclipName(label); }}
                  placeholder="Search Paperclip company..."
                />
              </div>
              <div style={btnGroup}>
                <button type="button" style={btnPrimary} onClick={handleAddOrg} disabled={!newOrgZohoId || !newOrgPaperclipId}>
                  Save
                </button>
                <button type="button" style={btn} onClick={() => { setAddingOrg(false); setNewOrgZohoId(""); setNewOrgZohoName(""); setNewOrgPaperclipId(""); setNewOrgPaperclipName(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {orgMappings.length === 0 && !addingOrg && (
            <p style={muted}>
              {zohoClients.length > 0
                ? `${zohoClients.length} Zoho client companies found. Click + Add to map them.`
                : "Loading Zoho client companies..."
              }
            </p>
          )}
        </div>
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

  // Poll connection status so badge updates after connect/disconnect
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
                  <button type="button" style={btnSmallDanger} onClick={() => handleRemoveService(svc.id)}>Remove</button>
                </div>
              </div>
              {!isExpanded && <p style={{ ...muted, margin: 0 }}>{def?.description ?? svc.type}</p>}
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
