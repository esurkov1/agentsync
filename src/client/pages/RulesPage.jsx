import React from "react";
import { Editor } from "../components/Editor";
import { Button, Panel, Select } from "../components/UI";


export function RulesPage({
  rulesState,
  busy,
  saveRules,
  masterContent,
  setMasterContent,
  globalDirty,
  openAgentModal,
  switchMode
}) {
  const agents = rulesState?.agents || [];
  const installedAgents = agents.filter((agent) => agent.installed);

  return (
    <div className="skill-layout section-gap">
      <Editor
        title="Global Rules"
        path={rulesState?.masterPath || ""}
        value={masterContent}
        onChangeText={setMasterContent}
        onSave={saveRules}
        dirty={globalDirty}
        busy={busy}
        className="skill-main"
      />

      <aside className="skill-side">
        <Panel>
          <strong className="modal-title">Agent system</strong>
          <div className="skill-targets section-gap">
            {installedAgents.map((agent) => {
              const dot = !agent.installed ? "dim" : agent.mode === "local" ? "warn" : "ok";
              const canEdit = agent.installed && agent.mode === "local";
              return (
                <div
                  key={agent.agentId}
                  className="skill-target-row"
                  onClick={canEdit && !busy ? () => openAgentModal(agent) : undefined}
                  style={canEdit ? { cursor: "pointer" } : undefined}
                >
                  <div className="skill-target-left">
                    <span className={`status-dot ${dot}`} />
                    <div>
                      <div className="skill-target-label">{agent.label}</div>
                      {agent.installed ? (
                        canEdit ? (
                          <Button variant="force" onClick={(e) => { e.stopPropagation(); openAgentModal(agent); }} disabled={busy}>
                            Edit
                          </Button>
                        ) : null
                      ) : (
                        <div className="skill-target-meta">Not installed</div>
                      )}
                    </div>
                  </div>
                  {agent.installed ? (
                    <Select
                      className={`mode-select ${agent.mode === "global" ? "mode-global" : "mode-local"}`}
                      value={agent.mode}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); switchMode(agent.agentId, e.target.value); }}
                      disabled={busy}
                    >
                      <option value="global">Global</option>
                      <option value="local">Local</option>
                    </Select>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
