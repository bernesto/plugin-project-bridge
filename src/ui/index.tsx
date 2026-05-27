import { useState, useCallback, useEffect, useRef, type FormEvent, type CSSProperties, type ReactNode } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";

// ─── Styles ─────────────────────────────────────────────────────────────────

const btn: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 14px",
  fontSize: "12px",
  cursor: "pointer",
};
const btnPrimary: CSSProperties = { ...btn, background: "var(--foreground)", color: "var(--background)", borderColor: "var(--foreground)" };
const btnDanger: CSSProperties = { ...btn, color: "var(--destructive, #dc2626)", borderColor: "var(--destructive, #dc2626)" };
const btnSmallDanger: CSSProperties = { ...btnDanger, padding: "4px 10px", fontSize: "11px" };
const btnSmall: CSSProperties = { ...btn, padding: "4px 10px", fontSize: "11px" };

const input: CSSProperties = {
  flex: 1, border: "1px solid var(--border)", borderRadius: "8px",
  padding: "8px 10px", background: "transparent", color: "inherit", fontSize: "12px", minWidth: 0,
};
const select: CSSProperties = {
  ...input, flex: "none", minWidth: 180, cursor: "pointer",
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

// ─── Service Definitions ────────────────────────────────────────────────────

type ServiceDef = {
  type: string;
  name: string;
  description: string;
  status: "available" | "coming-soon";
};

const AVAILABLE_SERVICES: ServiceDef[] = [
  { type: "zoho-projects", name: "Zoho Projects", description: "Bidirectional project and task sync", status: "available" },
  { type: "zoho-desk", name: "Zoho Desk", description: "Ticket and support task sync", status: "coming-soon" },
  { type: "zoho-crm", name: "Zoho CRM", description: "Deal, lead, and activity sync", status: "coming-soon" },
  { type: "github", name: "GitHub Issues", description: "Issue and project sync", status: "coming-soon" },
  { type: "linear", name: "Linear", description: "Issue and project sync", status: "coming-soon" },
  { type: "google-tasks", name: "Google Tasks", description: "Task sync via Google Workspace", status: "coming-soon" },
  { type: "notion", name: "Notion", description: "Database and checklist sync", status: "coming-soon" },
];

type ServiceRecord = { id: string; type: string; name: string; enabled: boolean; createdAt: string };

type ConnectionStatus = {
  connected: boolean;
  dataCenter: string;
  connectedUser?: string;
  tokenExpiresAt?: number;
  tokenValid: boolean;
};

// ─── Mapping Row Helpers ────────────────────────────────────────────────────

function MappingTable<T extends Record<string, string>>({
  rows, setRows, fields, emptyRow,
}: {
  rows: T[];
  setRows: (r: T[]) => void;
  fields: Array<{ key: keyof T; placeholder: string }>;
  emptyRow: T;
}) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={row}>
          {fields.map((f) => (
            <input
              key={f.key as string}
              style={input}
              placeholder={f.placeholder}
              value={r[f.key]}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], [f.key]: e.target.value };
                setRows(next);
              }}
            />
          ))}
          <button type="button" style={btnSmallDanger} onClick={() => {
            if (rows.length > 1) setRows(rows.filter((_, j) => j !== i));
          }} title="Remove">x</button>
        </div>
      ))}
      <div style={btnGroup}>
        <button type="button" style={btnSmall} onClick={() => setRows([...rows, { ...emptyRow }])}>+ Add</button>
      </div>
    </>
  );
}

// ─── Zoho Projects Service Config ───────────────────────────────────────────

type ConnectUrlData = { connectUrl: string; configured: boolean };

function ZohoProjectsConfig({ serviceId }: { serviceId: string }) {
  const { data: status, refresh } = usePluginData<ConnectionStatus>("connection-status");
  const { data: connectData } = usePluginData<ConnectUrlData>("connect-url");
  const saveGroupMapping = usePluginAction("save-group-mapping");
  const saveAgentMapping = usePluginAction("save-agent-mapping");
  const saveProjectMapping = usePluginAction("save-project-mapping");
  const disconnectAction = usePluginAction("disconnect");

  const [groupRows, setGroupRows] = useState([{ groupName: "", companyId: "" }]);
  const [agentRows, setAgentRows] = useState([{ zohoName: "", paperclipAgentId: "" }]);
  const [projectRows, setProjectRows] = useState([{ zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }]);

  // Poll for connection status while disconnected (catches OAuth callback completion)
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

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {/* Connection */}
      <div style={{ ...section, paddingTop: "0.5rem" }}>
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
                  Connect to Zoho (configure OAuth Callback URL first)
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Organization Mapping */}
      <div style={section}>
        <h4 style={{ marginTop: 0 }}>Organization Mapping</h4>
        <p style={muted}>Map Zoho Project Group names to Paperclip Companies.</p>
        <form onSubmit={async (e: FormEvent) => { e.preventDefault(); await saveGroupMapping({ mapping: groupRows.filter((r) => r.groupName && r.companyId) }); }}>
          <MappingTable
            rows={groupRows} setRows={setGroupRows}
            fields={[{ key: "groupName", placeholder: "Zoho Project Group" }, { key: "companyId", placeholder: "Paperclip Company ID" }]}
            emptyRow={{ groupName: "", companyId: "" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <button type="submit" style={btnPrimary}>Save Mappings</button>
          </div>
        </form>
      </div>

      {/* Agent Mapping */}
      <div style={section}>
        <h4 style={{ marginTop: 0 }}>Agent Mapping</h4>
        <p style={muted}>Map Zoho user display names to Paperclip agent IDs. Agents are also auto-matched by name.</p>
        <form onSubmit={async (e: FormEvent) => { e.preventDefault(); await saveAgentMapping({ mapping: agentRows.filter((r) => r.zohoName && r.paperclipAgentId) }); }}>
          <MappingTable
            rows={agentRows} setRows={setAgentRows}
            fields={[{ key: "zohoName", placeholder: "Zoho Name" }, { key: "paperclipAgentId", placeholder: "Paperclip Agent ID" }]}
            emptyRow={{ zohoName: "", paperclipAgentId: "" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <button type="submit" style={btnPrimary}>Save Mappings</button>
          </div>
        </form>
      </div>

      {/* Project Mapping */}
      <div style={{ marginBottom: "0.5rem" }}>
        <h4 style={{ marginTop: 0 }}>Project Mapping (Manual Override)</h4>
        <p style={muted}>Override automatic project linking. Projects are auto-linked by name when possible.</p>
        <form onSubmit={async (e: FormEvent) => { e.preventDefault(); await saveProjectMapping({ mapping: projectRows.filter((r) => r.zohoProjectId && r.paperclipProjectId && r.paperclipCompanyId) }); }}>
          <MappingTable
            rows={projectRows} setRows={setProjectRows}
            fields={[
              { key: "zohoProjectId", placeholder: "Zoho Project ID" },
              { key: "paperclipProjectId", placeholder: "Paperclip Project ID" },
              { key: "paperclipCompanyId", placeholder: "Paperclip Company ID" },
            ]}
            emptyRow={{ zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <button type="submit" style={btnPrimary}>Save Mappings</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Placeholder Config for Coming-Soon Services ────────────────────────────

function ComingSoonConfig({ serviceDef }: { serviceDef: ServiceDef }) {
  return (
    <div style={{ padding: "1rem 0" }}>
      <p style={muted}>{serviceDef.description} — coming soon. This service is not yet available for configuration.</p>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export function ProjectBridgeSettingsPage(_props: PluginSettingsPageProps) {
  const { data: services, refresh: refreshServices } = usePluginData<ServiceRecord[]>("services");
  const addService = usePluginAction("add-service");
  const removeService = usePluginAction("remove-service");
  const [addingService, setAddingService] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [expandedService, setExpandedService] = useState<string | null>(null);

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

  return (
    <div style={{ padding: "1.5rem", maxWidth: 850 }}>

      {/* Connected Services */}
      <div style={section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Connected Services</h3>
          {!addingService && (
            <button type="button" style={btnSmall} onClick={() => setAddingService(true)}>+ Add Service</button>
          )}
        </div>

        {/* Add Service Panel */}
        {addingService && (
          <div style={{ ...cardStyle, borderColor: "var(--border)" }}>
            <div style={row}>
              <select style={select} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
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

        return (
          <div key={svc.id} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <strong style={{ fontSize: "14px" }}>{svc.name}</strong>
                <span style={badgeStyle(svc.enabled)}>
                  {def?.status === "coming-soon" ? "Coming Soon" : svc.enabled ? "Active" : "Disabled"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={btnSmall}
                  onClick={() => setExpandedService(isExpanded ? null : svc.id)}
                >
                  {isExpanded ? "Collapse" : "Configure"}
                </button>
                <button
                  type="button"
                  style={btnSmallDanger}
                  onClick={() => handleRemoveService(svc.id)}
                >
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
