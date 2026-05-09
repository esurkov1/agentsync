import React, { useMemo, useRef } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { Button, DataTable, Panel } from "../components/UI";

function makeNavCol(header) {
  return {
    key: "name",
    className: "skills-col-name",
    header,
    renderCell: (item) => item.id
  };
}

const mcpNavCols = () => [
  {
    key: "name",
    className: "skills-col-name",
    header: "MCP Servers",
    renderCell: (item) => item.id
  },
  {
    key: "params",
    className: "installer-col-params",
    header: "Parameters",
    renderCell: (item) => item.params
      ? <pre className="installer-params-pre">{JSON.stringify(item.params, null, 2)}</pre>
      : <span className="muted">—</span>
  }
];

export function PluginDetailsPage({
  plugin,
  frameworks,
  content,
  onChangeContent,
  onSave,
  onBack,
  busy,
  dirty,
  pluginContents,
  onNavigateSkill,
  onNavigateAgent,
  onNavigateMcp,
  onNavigateHooks
}) {
  const lastValidManifest = useRef({});
  const { manifest, isValidJson, jsonError } = useMemo(() => {
    try {
      const parsed = JSON.parse(content || "{}");
      lastValidManifest.current = parsed;
      return { manifest: parsed, isValidJson: true, jsonError: null };
    } catch (e) {
      return { manifest: lastValidManifest.current, isValidJson: false, jsonError: e.message };
    }
  }, [content]);

  const skills = pluginContents?.skills || [];
  const agents = pluginContents?.agents || [];
  const mcp = pluginContents?.mcp || [];
  const hookKeys = pluginContents?.hookKeys || [];
  const hasContent = skills.length > 0 || agents.length > 0 || mcp.length > 0 || hookKeys.length > 0;

  const installed = (frameworks || []).filter((f) => f.installed);

  return (
    <div className="skill-layout section-gap">
      <div className="skill-main plugin-details-main">
        {!hasContent ? (
          <div className="muted section-gap">No content detected in this plugin directory.</div>
        ) : null}

        {skills.length > 0 ? (
          <DataTable
            columns={[makeNavCol("Skills")]}
            rows={skills}
            rowKey={(r) => r.id}
            rowClassName="skills-row"
            onRowClick={onNavigateSkill ? (r) => onNavigateSkill(r.id) : undefined}
            minWidth={400}
            emptyTitle=""
            emptyDescription=""
          />
        ) : null}

        {agents.length > 0 ? (
          <DataTable
            columns={[makeNavCol("Agents")]}
            rows={agents}
            rowKey={(r) => r.id}
            rowClassName="skills-row"
            onRowClick={onNavigateAgent ? (r) => onNavigateAgent(r.id) : undefined}
            minWidth={400}
            emptyTitle=""
            emptyDescription=""
          />
        ) : null}

        {mcp.length > 0 ? (
          <DataTable
            columns={mcpNavCols()}
            rows={mcp}
            rowKey={(r) => r.id}
            rowClassName="skills-row"
            onRowClick={onNavigateMcp ? (r) => onNavigateMcp(r.id) : undefined}
            minWidth={400}
            emptyTitle=""
            emptyDescription=""
          />
        ) : null}

        {hookKeys.length > 0 ? (
          <div className="plugin-hooks-list section-gap">
            {hookKeys.map((k) => (
              <button
                key={k}
                className="plugin-hook-item plugin-hook-btn"
                onClick={() => onNavigateHooks && onNavigateHooks(k)}
                title="Open Hooks tab"
              >
                <span className="installer-type-badge installer-type-hooks">{k}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <aside className="skill-side">
        <Panel>
          <strong className="modal-title">Agent system</strong>
          <div className="skill-targets section-gap">
            {installed.length === 0 ? (
              <div className="skill-target-meta">No installed agent system found.</div>
            ) : installed.map((framework) => (
              <div key={framework.agentId} className="skill-target-row">
                <div className="skill-target-left">
                  <span className={`status-dot ${framework.supported ? "ok" : "warn"}`} />
                  <div>
                    <div className="skill-target-label">{framework.label}</div>
                    <div className="skill-target-meta">{framework.notes}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="section-gap">
          <div className="plugin-manifest-head">
            <div className="plugin-manifest-head-left">
              <span className={`status-dot ${isValidJson ? "ok" : "error"}`} title={isValidJson ? "Valid JSON" : jsonError} />
              <strong className="modal-title">
                {manifest.name || plugin?.id}
                {manifest.version ? <span className="plugin-details-version"> v{manifest.version}</span> : null}
              </strong>
            </div>
            <Button
              variant="primary"
              onClick={onSave}
              disabled={busy || !isValidJson}
              style={{ visibility: dirty ? "visible" : "hidden" }}
            >
              Save
            </Button>
          </div>
          {manifest.description ? <div className="muted plugin-details-desc">{manifest.description}</div> : null}
          {jsonError && dirty ? (
            <div className="plugin-manifest-error">{jsonError}</div>
          ) : null}
          <div className="plugin-manifest-code">
            <CodeEditor
              value={content}
              onChangeText={onChangeContent}
              language="json"
              height="auto"
              readOnly={busy}
            />
          </div>
        </Panel>
      </aside>
    </div>
  );
}
