// src/ui/index.tsx
import { useState } from "react";
import {
  usePluginAction,
  usePluginData
} from "@paperclipai/plugin-sdk/ui";
import { jsx, jsxs } from "react/jsx-runtime";
function ProjectBridgeSettingsPage(_props) {
  const { data: status } = usePluginData("connection-status");
  const saveAgentMapping = usePluginAction("save-agent-mapping");
  const saveGroupMapping = usePluginAction("save-group-mapping");
  const saveProjectMapping = usePluginAction("save-project-mapping");
  const [agentRows, setAgentRows] = useState([
    { zohoName: "", paperclipAgentId: "" }
  ]);
  const [groupRows, setGroupRows] = useState([
    { groupName: "", companyId: "" }
  ]);
  const [projectRows, setProjectRows] = useState([{ zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }]);
  const handleSaveAgentMapping = async (e) => {
    e.preventDefault();
    const filtered = agentRows.filter((r) => r.zohoName && r.paperclipAgentId);
    await saveAgentMapping({ mapping: filtered });
  };
  const handleSaveGroupMapping = async (e) => {
    e.preventDefault();
    const filtered = groupRows.filter((r) => r.groupName && r.companyId);
    await saveGroupMapping({ mapping: filtered });
  };
  const handleSaveProjectMapping = async (e) => {
    e.preventDefault();
    const filtered = projectRows.filter(
      (r) => r.zohoProjectId && r.paperclipProjectId && r.paperclipCompanyId
    );
    await saveProjectMapping({ mapping: filtered });
  };
  return /* @__PURE__ */ jsxs("div", { style: { padding: "1.5rem", maxWidth: 800 }, children: [
    /* @__PURE__ */ jsx("h1", { children: "Project Bridge" }),
    /* @__PURE__ */ jsxs("section", { style: { marginBottom: "2rem" }, children: [
      /* @__PURE__ */ jsx("h2", { children: "Connection" }),
      status?.connected ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("p", { children: [
          "Connected to Zoho (",
          status.dataCenter,
          ")",
          status.connectedUser && ` as ${status.connectedUser}`
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          "Token: ",
          status.tokenValid ? "Valid" : "Expired",
          status.tokenExpiresAt && ` (expires ${new Date(status.tokenExpiresAt).toLocaleString()})`
        ] })
      ] }) : /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { children: "Not connected. Configure Client ID and Secret in plugin config, then click Connect." }),
        /* @__PURE__ */ jsx("a", { href: "./api/connect", target: "_blank", rel: "noopener", children: /* @__PURE__ */ jsx("button", { type: "button", children: "Connect to Zoho" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: { marginBottom: "2rem" }, children: [
      /* @__PURE__ */ jsx("h2", { children: "Organization Mapping" }),
      /* @__PURE__ */ jsx("p", { children: "Map Zoho Project Group names to Paperclip Companies." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveGroupMapping, children: [
        groupRows.map((row, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Zoho Project Group",
              value: row.groupName,
              onChange: (e) => {
                const next = [...groupRows];
                next[i] = { ...next[i], groupName: e.target.value };
                setGroupRows(next);
              }
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Paperclip Company ID",
              value: row.companyId,
              onChange: (e) => {
                const next = [...groupRows];
                next[i] = { ...next[i], companyId: e.target.value };
                setGroupRows(next);
              }
            }
          )
        ] }, i)),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setGroupRows([...groupRows, { groupName: "", companyId: "" }]), children: "+ Add Row" }),
        /* @__PURE__ */ jsx("button", { type: "submit", style: { marginLeft: "0.5rem" }, children: "Save" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: { marginBottom: "2rem" }, children: [
      /* @__PURE__ */ jsx("h2", { children: "Agent Mapping" }),
      /* @__PURE__ */ jsx("p", { children: "Map Zoho user display names to Paperclip agent IDs. Agents are also auto-matched by name." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveAgentMapping, children: [
        agentRows.map((row, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Zoho Name",
              value: row.zohoName,
              onChange: (e) => {
                const next = [...agentRows];
                next[i] = { ...next[i], zohoName: e.target.value };
                setAgentRows(next);
              }
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Paperclip Agent ID",
              value: row.paperclipAgentId,
              onChange: (e) => {
                const next = [...agentRows];
                next[i] = { ...next[i], paperclipAgentId: e.target.value };
                setAgentRows(next);
              }
            }
          )
        ] }, i)),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setAgentRows([...agentRows, { zohoName: "", paperclipAgentId: "" }]), children: "+ Add Row" }),
        /* @__PURE__ */ jsx("button", { type: "submit", style: { marginLeft: "0.5rem" }, children: "Save" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: { marginBottom: "2rem" }, children: [
      /* @__PURE__ */ jsx("h2", { children: "Project Mapping (Manual)" }),
      /* @__PURE__ */ jsx("p", { children: "Override automatic project linking. Projects are auto-linked by name when possible." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveProjectMapping, children: [
        projectRows.map((row, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Zoho Project ID",
              value: row.zohoProjectId,
              onChange: (e) => {
                const next = [...projectRows];
                next[i] = { ...next[i], zohoProjectId: e.target.value };
                setProjectRows(next);
              }
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Paperclip Project ID",
              value: row.paperclipProjectId,
              onChange: (e) => {
                const next = [...projectRows];
                next[i] = { ...next[i], paperclipProjectId: e.target.value };
                setProjectRows(next);
              }
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Paperclip Company ID",
              value: row.paperclipCompanyId,
              onChange: (e) => {
                const next = [...projectRows];
                next[i] = { ...next[i], paperclipCompanyId: e.target.value };
                setProjectRows(next);
              }
            }
          )
        ] }, i)),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setProjectRows([...projectRows, { zohoProjectId: "", paperclipProjectId: "", paperclipCompanyId: "" }]),
            children: "+ Add Row"
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "submit", style: { marginLeft: "0.5rem" }, children: "Save" })
      ] })
    ] })
  ] });
}
export {
  ProjectBridgeSettingsPage
};
//# sourceMappingURL=index.js.map
