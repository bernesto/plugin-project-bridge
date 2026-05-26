import { useState, useCallback, type FormEvent, type CSSProperties } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";

// ─── Styles (matching Paperclip design system) ──────────────────────────────

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 14px",
  fontSize: "12px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--foreground)",
  color: "var(--background)",
  borderColor: "var(--foreground)",
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  color: "var(--destructive, #dc2626)",
  borderColor: "var(--destructive, #dc2626)",
};

const smallDangerButtonStyle: CSSProperties = {
  ...dangerButtonStyle,
  padding: "4px 10px",
  fontSize: "11px",
};

const inputStyle: CSSProperties = {
  flex: 1,
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "8px 10px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
  minWidth: 0,
};

const sectionStyle: CSSProperties = {
  marginBottom: "2rem",
  borderBottom: "1px solid var(--border)",
  paddingBottom: "1.5rem",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginBottom: "0.5rem",
  alignItems: "center",
};

const buttonGroupStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.75rem",
};

const mutedStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--muted-foreground, #888)",
};

const statusDotStyle = (ok: boolean): CSSProperties => ({
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: ok ? "var(--success, #22c55e)" : "var(--destructive, #dc2626)",
  marginRight: 6,
});

// ─── Types ──────────────────────────────────────────────────────────────────

type ConnectionStatus = {
  connected: boolean;
  dataCenter: string;
  connectedUser?: string;
  tokenExpiresAt?: number;
  tokenValid: boolean;
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ProjectBridgeSettingsPage(_props: PluginSettingsPageProps) {
  const { data: status, refresh } = usePluginData<ConnectionStatus>("connection-status");
  const saveAgentMapping = usePluginAction("save-agent-mapping");
  const saveGroupMapping = usePluginAction("save-group-mapping");
  const saveProjectMapping = usePluginAction("save-project-mapping");
  const disconnectAction = usePluginAction("disconnect");

  const [agentRows, setAgentRows] = useState<Array<{ zohoName: string; paperclipAgentId: string }>>([
    { zohoName: "", paperclipAgentId: "" },
  ]);
  const [groupRows, setGroupRows] = useState<Array<{ groupName: string; companyId: string }>>([
    { groupName: "", companyId: "" },
  ]);
  const [projectRows, setProjectRows] = useState<
    Array<{ zohoProjectId: string; paperclipProjectId: string; paperclipCompanyId: string }>
  >([{ zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }]);

  const handleDisconnect = useCallback(async () => {
    if (confirm("Disconnect from Zoho? You will need to re-authenticate.")) {
      await disconnectAction();
      refresh?.();
    }
  }, [disconnectAction, refresh]);

  const removeRow = <T,>(rows: T[], index: number, setter: (rows: T[]) => void) => {
    if (rows.length <= 1) return;
    setter(rows.filter((_, i) => i !== index));
  };

  const handleSaveGroupMapping = async (e: FormEvent) => {
    e.preventDefault();
    await saveGroupMapping({ mapping: groupRows.filter((r) => r.groupName && r.companyId) });
  };

  const handleSaveAgentMapping = async (e: FormEvent) => {
    e.preventDefault();
    await saveAgentMapping({ mapping: agentRows.filter((r) => r.zohoName && r.paperclipAgentId) });
  };

  const handleSaveProjectMapping = async (e: FormEvent) => {
    e.preventDefault();
    await saveProjectMapping({
      mapping: projectRows.filter((r) => r.zohoProjectId && r.paperclipProjectId && r.paperclipCompanyId),
    });
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 800 }}>
      <h2 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Project Bridge</h2>

      {/* ─── Connection ─────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h3>Connection</h3>
        {status?.connected ? (
          <>
            <p>
              <span style={statusDotStyle(status.tokenValid)} />
              Connected to Zoho ({status.dataCenter})
              {status.connectedUser && <> as <strong>{status.connectedUser}</strong></>}
            </p>
            <p style={mutedStyle}>
              Token: {status.tokenValid ? "Valid" : "Expired"}
              {status.tokenExpiresAt && ` — expires ${new Date(status.tokenExpiresAt).toLocaleString()}`}
            </p>
            <div style={buttonGroupStyle}>
              <a href="./api/connect" target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
                <button type="button" style={buttonStyle}>Reconnect</button>
              </a>
              <button type="button" style={dangerButtonStyle} onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              <span style={statusDotStyle(false)} />
              Not connected. Configure Client ID and Secret in plugin config, then connect.
            </p>
            <div style={buttonGroupStyle}>
              <a href="./api/connect" target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
                <button type="button" style={primaryButtonStyle}>Connect to Zoho</button>
              </a>
            </div>
          </>
        )}
      </section>

      {/* ─── Organization Mapping ──────────────────────────────── */}
      <section style={sectionStyle}>
        <h3>Organization Mapping</h3>
        <p style={mutedStyle}>Map Zoho Project Group names to Paperclip Companies.</p>
        <form onSubmit={handleSaveGroupMapping}>
          {groupRows.map((row, i) => (
            <div key={i} style={rowStyle}>
              <input
                style={inputStyle}
                placeholder="Zoho Project Group"
                value={row.groupName}
                onChange={(e) => {
                  const next = [...groupRows];
                  next[i] = { ...next[i], groupName: e.target.value };
                  setGroupRows(next);
                }}
              />
              <input
                style={inputStyle}
                placeholder="Paperclip Company ID"
                value={row.companyId}
                onChange={(e) => {
                  const next = [...groupRows];
                  next[i] = { ...next[i], companyId: e.target.value };
                  setGroupRows(next);
                }}
              />
              <button
                type="button"
                style={smallDangerButtonStyle}
                onClick={() => removeRow(groupRows, i, setGroupRows)}
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
          <div style={buttonGroupStyle}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setGroupRows([...groupRows, { groupName: "", companyId: "" }])}
            >
              + Add
            </button>
            <button type="submit" style={primaryButtonStyle}>Save</button>
          </div>
        </form>
      </section>

      {/* ─── Agent Mapping ─────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h3>Agent Mapping</h3>
        <p style={mutedStyle}>
          Map Zoho user display names to Paperclip agent IDs. Agents are also auto-matched by name.
        </p>
        <form onSubmit={handleSaveAgentMapping}>
          {agentRows.map((row, i) => (
            <div key={i} style={rowStyle}>
              <input
                style={inputStyle}
                placeholder="Zoho Name"
                value={row.zohoName}
                onChange={(e) => {
                  const next = [...agentRows];
                  next[i] = { ...next[i], zohoName: e.target.value };
                  setAgentRows(next);
                }}
              />
              <input
                style={inputStyle}
                placeholder="Paperclip Agent ID"
                value={row.paperclipAgentId}
                onChange={(e) => {
                  const next = [...agentRows];
                  next[i] = { ...next[i], paperclipAgentId: e.target.value };
                  setAgentRows(next);
                }}
              />
              <button
                type="button"
                style={smallDangerButtonStyle}
                onClick={() => removeRow(agentRows, i, setAgentRows)}
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
          <div style={buttonGroupStyle}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setAgentRows([...agentRows, { zohoName: "", paperclipAgentId: "" }])}
            >
              + Add
            </button>
            <button type="submit" style={primaryButtonStyle}>Save</button>
          </div>
        </form>
      </section>

      {/* ─── Project Mapping (manual) ──────────────────────────── */}
      <section style={{ marginBottom: "1rem" }}>
        <h3>Project Mapping (Manual)</h3>
        <p style={mutedStyle}>
          Override automatic project linking. Projects are auto-linked by name when possible.
        </p>
        <form onSubmit={handleSaveProjectMapping}>
          {projectRows.map((row, i) => (
            <div key={i} style={rowStyle}>
              <input
                style={inputStyle}
                placeholder="Zoho Project ID"
                value={row.zohoProjectId}
                onChange={(e) => {
                  const next = [...projectRows];
                  next[i] = { ...next[i], zohoProjectId: e.target.value };
                  setProjectRows(next);
                }}
              />
              <input
                style={inputStyle}
                placeholder="Paperclip Project ID"
                value={row.paperclipProjectId}
                onChange={(e) => {
                  const next = [...projectRows];
                  next[i] = { ...next[i], paperclipProjectId: e.target.value };
                  setProjectRows(next);
                }}
              />
              <input
                style={inputStyle}
                placeholder="Paperclip Company ID"
                value={row.paperclipCompanyId}
                onChange={(e) => {
                  const next = [...projectRows];
                  next[i] = { ...next[i], paperclipCompanyId: e.target.value };
                  setProjectRows(next);
                }}
              />
              <button
                type="button"
                style={smallDangerButtonStyle}
                onClick={() => removeRow(projectRows, i, setProjectRows)}
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
          <div style={buttonGroupStyle}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() =>
                setProjectRows([...projectRows, { zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }])
              }
            >
              + Add
            </button>
            <button type="submit" style={primaryButtonStyle}>Save</button>
          </div>
        </form>
      </section>
    </div>
  );
}
