import React, { useState, useCallback } from "react";
import { Editor } from "../components/Editor";
import { Button, Panel, Switch } from "../components/UI";

function statusDotClass(status) {
  if (status === "installed") return "ok";
  if (status === "globally_disabled") return "dim";
  return "dim";
}

function statusLabel(status) {
  if (status === "installed") return "Active";
  if (status === "globally_disabled") return "Globally disabled";
  if (status === "available") return "Available";
  if (status === "not_installed") return "Not installed";
  if (status === "unsupported") return "Not supported";
  return "Unknown";
}

function ConnStatus({ status, message }) {
  if (!status) return null;
  const dot =
    status === "ok"
      ? { color: "#4ade80", label: "OK" }
      : status === "error"
      ? { color: "#f87171", label: "Error" }
      : { color: "#a1a1aa", label: "Unknown" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px" }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot.color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span style={{ color: dot.color, fontWeight: 500 }}>{dot.label}</span>
      {message && <span style={{ color: "var(--muted)", fontSize: "11px" }}>{message}</span>}
    </span>
  );
}

function McpStatsPanel({ server, globallyEnabled, onSetGlobalEnabled, busy, testing, onTest, connStatus }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const tools = connStatus?.tools ?? null;
  const toolCount = Array.isArray(tools) ? tools.length : null;

  return (
    <Panel>
      <strong className="modal-title">Stats</strong>
      <div className="details-stats section-gap">
        <div className="details-stat-row">
          <div><div className="details-stat-label">Active</div></div>
          <Switch
            checked={globallyEnabled}
            onChange={(e) => onSetGlobalEnabled(server.id, e.target.checked)}
            disabled={busy}
            title={globallyEnabled ? "Disable globally" : "Enable globally"}
          />
        </div>
        <div className="details-stat-row" style={{ alignItems: "flex-start", gap: "8px" }}>
          <div style={{ flex: 1 }}>
            <div className="details-stat-label">Connection</div>
            <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {connStatus ? (
                <>
                  <ConnStatus status={connStatus.status} message={null} />
                  {toolCount !== null && (
                    <button
                      onClick={() => setToolsOpen((v) => !v)}
                      style={{
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        color: "var(--muted)", fontSize: "11px", display: "inline-flex",
                        alignItems: "center", gap: "3px"
                      }}
                    >
                      <span style={{ fontSize: "9px" }}>{toolsOpen ? "▾" : "▸"}</span>
                      {`Tools (${toolCount})`}
                    </button>
                  )}
                </>
              ) : (
                <span className="muted" style={{ fontSize: "12px" }}>{testing ? "Testing…" : "Not tested"}</span>
              )}
            </div>
            {toolsOpen && toolCount !== null && (
              <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
                {toolCount === 0
                  ? <span className="muted" style={{ fontSize: "11px" }}>No tools exposed</span>
                  : tools.map((tool) => (
                    <span key={tool.name} style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--muted)" }}>
                      {tool.name}
                    </span>
                  ))
                }
              </div>
            )}
          </div>
          <Button onClick={onTest} disabled={busy || testing} style={{ flexShrink: 0, marginTop: "2px" }}>
            {testing ? "Testing…" : "Test"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function WorkspaceRow({ framework, enabled, status, canToggle, serverId, onToggleServer, busy, globallyEnabled }) {
  return (
    <div className="skill-target-row">
      <div className="skill-target-left" style={{ flex: 1, minWidth: 0 }}>
        <span
          className={`status-dot ${statusDotClass(status)}`}
          title={statusLabel(status)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="skill-target-label">{framework.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
            <span className="skill-target-meta" style={{ margin: 0 }}>{statusLabel(status)}</span>
          </div>
        </div>
      </div>
      <Switch
        checked={enabled}
        onChange={(e) => onToggleServer(framework.agentId, serverId, e.target.checked)}
        disabled={busy || !canToggle}
        style={{ flexShrink: 0, marginTop: "2px" }}
        title={
          !framework.installed
            ? "Workspace is not installed"
            : !framework.supported
            ? "MCP not supported for this workspace"
            : !globallyEnabled
            ? "Enable globally first"
            : enabled
            ? "Disable"
            : "Enable"
        }
      />
    </div>
  );
}

export function McpDetailsPage({
  server,
  content,
  busy,
  onBack,
  onSave,
  onRename,
  onChangeContent,
  mcpState,
  onToggleServer,
  onSetGlobalEnabled,
  onTestServer,
  serverStatuses = {},
}) {
  const dirty = (content || "") !== (server.content || "");
  const globallyEnabled = !new Set(mcpState?.globallyDisabled || []).has(server.id);

  const connStatus = serverStatuses[server.id] ?? null;
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTestServer(server.id);
    } catch (e) {
      // onTestServer updates serverStatuses even on error
    } finally {
      setTesting(false);
    }
  };

  const workspaceRows = (mcpState?.frameworks || []).map((framework) => {
    const enabled = (framework.enabledServers || []).includes(server.id);
    const status = !framework.supported
      ? "unsupported"
      : !framework.installed
      ? "not_installed"
      : !globallyEnabled
      ? "globally_disabled"
      : framework.statuses?.[server.id] || "available";
    const canToggle = framework.installed && framework.supported && globallyEnabled;
    return { framework, enabled, status, canToggle };
  });

  const visibleRows = workspaceRows.filter(
    (row) => row.status !== "not_installed" && row.status !== "unsupported"
  );

  return (
    <section className="skill-page section-gap">
      <div className="skill-layout section-gap">
        <Editor
          title={server.id}
          path={server.path || server.id}
          value={content}
          onChangeText={onChangeContent}
          onSave={onSave}
          onRename={onRename}
          dirty={dirty}
          busy={busy}
          canRename={!!onRename}
          className="skill-main"
        />

        <aside className="skill-side">
          <McpStatsPanel
            server={server}
            globallyEnabled={globallyEnabled}
            onSetGlobalEnabled={onSetGlobalEnabled}
            busy={busy}
            testing={testing}
            onTest={handleTest}
            connStatus={connStatus}
          />

          <Panel>
            <strong className="modal-title">Workspaces</strong>
            <div className="skill-targets section-gap">
              {visibleRows.length === 0 && (
                <span className="muted" style={{ fontSize: "12px" }}>
                  No supported workspaces installed.
                </span>
              )}
              {visibleRows.map(({ framework, enabled, status, canToggle }) => (
                <WorkspaceRow
                  key={framework.agentId}
                  framework={framework}
                  enabled={enabled}
                  status={status}
                  canToggle={canToggle}
                  serverId={server.id}
                  onToggleServer={onToggleServer}
                  busy={busy}
                  globallyEnabled={globallyEnabled}
                />
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
