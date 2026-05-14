import React from "react";
import { Editor } from "../components/Editor";
import { DetailsStats } from "../components/DetailsStats";
import { Button, Panel, Switch } from "../components/UI";

function statusDotClass(status) {
  if (status === "installed") return "ok";
  if (status === "conflict") return "error";
  if (status === "missing") return "warn";
  if (status === "globally_disabled") return "dim";
  return "dim";
}

function statusLabel(status) {
  if (status === "installed") return "Active";
  if (status === "conflict") return "Conflict detected";
  if (status === "missing") return "Missing";
  if (status === "globally_disabled") return "Globally disabled";
  if (status === "available") return "Available";
  if (status === "not_installed") return "Not installed";
  return "Unknown";
}

export function AgentDetailsPage({
  agent,
  content,
  busy,
  onBack,
  onSave,
  onRename,
  onChangeContent,
  agentsState,
  onToggleAgent,
  onResolveConflict,
  onSetGlobalEnabled,
  onDelete,
  onOpenSkill,
  fromPlugin
}) {
  const dirty = (content || "") !== (agent.content || "");
  const globallyEnabled = !new Set(agentsState?.globallyDisabled || []).has(agent.agentName);
  const agentSystemRows = (agentsState?.frameworks || []).map((framework) => {
    const enabled = (framework.enabledAgents || []).includes(agent.agentName);
    const status = globallyEnabled ? (framework.statuses?.[agent.agentName] || "available") : "globally_disabled";
    const canToggle = framework.installed && globallyEnabled;
    return { framework, enabled, status, canToggle };
  });
  const visibleRows = agentSystemRows.filter((row) => row.status !== "not_installed");

  return (
    <section className="skill-page section-gap">
      <div className="skill-layout section-gap">
        <Editor
          title={agent.name}
          path={agent.path || agent.agentName || agent.id}
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
          <DetailsStats
            content={content}
            type="subagent"
            busy={busy}
            globalEnabled={globallyEnabled}
            onToggleGlobal={(enabled) => onSetGlobalEnabled(agent.agentName, enabled)}
            onDelete={onDelete}
            deleteName={agent.name || agent.agentName}
          />

          {(() => {
            const agentRow = (agentsState?.agents || []).find((a) => a.id === agent.agentName);
            const skills = agentRow?.skills || [];
            if (!skills.length) return null;
            return (
              <Panel>
                <strong className="modal-title">Skills <span className="muted">({skills.length})</span></strong>
                <div className="section-gap">
                  <div className="skills-usedBy-chips">
                    {skills.map((skill) => {
                      if (!skill.id) {
                        return (
                          <span
                            key={skill.name}
                            className="skills-usedBy-chip"
                            title={`Skill "${skill.name}" not installed`}
                          >
                            {skill.name}
                          </span>
                        );
                      }
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          className="skills-usedBy-chip skills-usedBy-chip--clickable"
                          onClick={() => onOpenSkill?.(skill.id)}
                          title={`Open skill ${skill.name}`}
                        >
                          {skill.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Panel>
            );
          })()}

          {!fromPlugin && <Panel>
            <strong className="modal-title">Agent system</strong>
            <div className="skill-targets section-gap">
              {visibleRows.map(({ framework, enabled, status, canToggle }) => {
                return (
                  <div key={framework.agentId} className="skill-target-row">
                    <div className="skill-target-left">
                      <span
                        className={`status-dot ${statusDotClass(status)}`}
                        title={statusLabel(status)}
                      />
                      <div>
                        <div className="skill-target-label">{framework.label}</div>
                        <div className="skill-target-meta">
                          {statusLabel(status)}
                          {status === "conflict" && onResolveConflict ? (
                            <>
                              {" · "}
                              <Button
                                variant="force"
                                onClick={() => onResolveConflict(framework.agentId, agent.agentName)}
                                disabled={busy}
                                title="Remove the conflicting file and reinstall"
                              >
                                Resolve
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      onChange={(e) => onToggleAgent(framework.agentId, agent.agentName, e.target.checked)}
                      disabled={busy || !canToggle}
                      title={
                        !framework.installed
                          ? "Agent system is not installed"
                          : !globallyEnabled
                          ? "Enable globally first"
                          : status === "conflict"
                          ? "Conflict detected — resolve before enabling"
                          : enabled
                          ? "Disable"
                          : "Enable"
                      }
                    />
                  </div>
                );
              })}
            </div>
          </Panel>}
        </aside>
      </div>
    </section>
  );
}
