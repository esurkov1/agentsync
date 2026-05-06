import React from "react";

export function AgentListPanel({ agents, busy, openAgentModal, switchMode }) {
  return (
    <div className="rule-cards section-gap">
      {(agents || []).map((agent) => (
        <div key={agent.agentId} className="rule-card" onClick={() => openAgentModal(agent)}>
          <div className="modal-head">
            <div className="modal-title-block">
              <strong className="modal-title">{agent.label}</strong>
              <div className="muted modal-path">{agent.path}</div>
            </div>
            <div className="modal-actions">
              <select
                className={`input mode-select ${agent.mode === "global" ? "mode-global" : "mode-local"}`}
                value={agent.mode}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => switchMode(agent.agentId, e.target.value)}
                disabled={busy}
              >
                <option value="global">global</option>
                <option value="local">local</option>
              </select>
              <button className="btn" onClick={(e) => { e.stopPropagation(); openAgentModal(agent); }} disabled={busy}>Open</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
