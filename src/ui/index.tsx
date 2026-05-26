import { useState, type FormEvent } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";

type ConnectionStatus = {
  connected: boolean;
  dataCenter: string;
  connectedUser?: string;
  tokenExpiresAt?: number;
  tokenValid: boolean;
};

/**
 * Project Bridge Settings Page.
 * Manages OAuth connection, group/agent/project mappings.
 */
export function ProjectBridgeSettingsPage(_props: PluginSettingsPageProps) {
  const { data: status } = usePluginData<ConnectionStatus>("connection-status");
  const saveAgentMapping = usePluginAction("save-agent-mapping");
  const saveGroupMapping = usePluginAction("save-group-mapping");
  const saveProjectMapping = usePluginAction("save-project-mapping");

  const [agentRows, setAgentRows] = useState<Array<{ zohoName: string; paperclipAgentId: string }>>([
    { zohoName: "", paperclipAgentId: "" },
  ]);
  const [groupRows, setGroupRows] = useState<Array<{ groupName: string; companyId: string }>>([
    { groupName: "", companyId: "" },
  ]);
  const [projectRows, setProjectRows] = useState<
    Array<{ zohoProjectId: string; paperclipProjectId: string; paperclipCompanyId: string }>
  >([{ zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }]);

  const handleSaveAgentMapping = async (e: FormEvent) => {
    e.preventDefault();
    const filtered = agentRows.filter((r) => r.zohoName && r.paperclipAgentId);
    await saveAgentMapping({ mapping: filtered });
  };

  const handleSaveGroupMapping = async (e: FormEvent) => {
    e.preventDefault();
    const filtered = groupRows.filter((r) => r.groupName && r.companyId);
    await saveGroupMapping({ mapping: filtered });
  };

  const handleSaveProjectMapping = async (e: FormEvent) => {
    e.preventDefault();
    const filtered = projectRows.filter(
      (r) => r.zohoProjectId && r.paperclipProjectId && r.paperclipCompanyId,
    );
    await saveProjectMapping({ mapping: filtered });
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 800 }}>
      <h1>Project Bridge</h1>

      {/* Connection Status */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Connection</h2>
        {status?.connected ? (
          <div>
            <p>
              Connected to Zoho ({status.dataCenter})
              {status.connectedUser && ` as ${status.connectedUser}`}
            </p>
            <p>
              Token: {status.tokenValid ? "Valid" : "Expired"}
              {status.tokenExpiresAt && ` (expires ${new Date(status.tokenExpiresAt).toLocaleString()})`}
            </p>
          </div>
        ) : (
          <div>
            <p>Not connected. Configure Client ID and Secret in plugin config, then click Connect.</p>
            <a href="./api/connect" target="_blank" rel="noopener">
              <button type="button">Connect to Zoho</button>
            </a>
          </div>
        )}
      </section>

      {/* Group → Company Mapping */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Organization Mapping</h2>
        <p>Map Zoho Project Group names to Paperclip Companies.</p>
        <form onSubmit={handleSaveGroupMapping}>
          {groupRows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                placeholder="Zoho Project Group"
                value={row.groupName}
                onChange={(e) => {
                  const next = [...groupRows];
                  next[i] = { ...next[i], groupName: e.target.value };
                  setGroupRows(next);
                }}
              />
              <input
                placeholder="Paperclip Company ID"
                value={row.companyId}
                onChange={(e) => {
                  const next = [...groupRows];
                  next[i] = { ...next[i], companyId: e.target.value };
                  setGroupRows(next);
                }}
              />
            </div>
          ))}
          <button type="button" onClick={() => setGroupRows([...groupRows, { groupName: "", companyId: "" }])}>
            + Add Row
          </button>
          <button type="submit" style={{ marginLeft: "0.5rem" }}>Save</button>
        </form>
      </section>

      {/* Agent Mapping */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Agent Mapping</h2>
        <p>Map Zoho user display names to Paperclip agent IDs. Agents are also auto-matched by name.</p>
        <form onSubmit={handleSaveAgentMapping}>
          {agentRows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                placeholder="Zoho Name"
                value={row.zohoName}
                onChange={(e) => {
                  const next = [...agentRows];
                  next[i] = { ...next[i], zohoName: e.target.value };
                  setAgentRows(next);
                }}
              />
              <input
                placeholder="Paperclip Agent ID"
                value={row.paperclipAgentId}
                onChange={(e) => {
                  const next = [...agentRows];
                  next[i] = { ...next[i], paperclipAgentId: e.target.value };
                  setAgentRows(next);
                }}
              />
            </div>
          ))}
          <button type="button" onClick={() => setAgentRows([...agentRows, { zohoName: "", paperclipAgentId: "" }])}>
            + Add Row
          </button>
          <button type="submit" style={{ marginLeft: "0.5rem" }}>Save</button>
        </form>
      </section>

      {/* Project Mapping (manual overrides) */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Project Mapping (Manual)</h2>
        <p>Override automatic project linking. Projects are auto-linked by name when possible.</p>
        <form onSubmit={handleSaveProjectMapping}>
          {projectRows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                placeholder="Zoho Project ID"
                value={row.zohoProjectId}
                onChange={(e) => {
                  const next = [...projectRows];
                  next[i] = { ...next[i], zohoProjectId: e.target.value };
                  setProjectRows(next);
                }}
              />
              <input
                placeholder="Paperclip Project ID"
                value={row.paperclipProjectId}
                onChange={(e) => {
                  const next = [...projectRows];
                  next[i] = { ...next[i], paperclipProjectId: e.target.value };
                  setProjectRows(next);
                }}
              />
              <input
                placeholder="Paperclip Company ID"
                value={row.paperclipCompanyId}
                onChange={(e) => {
                  const next = [...projectRows];
                  next[i] = { ...next[i], paperclipCompanyId: e.target.value };
                  setProjectRows(next);
                }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setProjectRows([...projectRows, { zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }])
            }
          >
            + Add Row
          </button>
          <button type="submit" style={{ marginLeft: "0.5rem" }}>Save</button>
        </form>
      </section>
    </div>
  );
}
