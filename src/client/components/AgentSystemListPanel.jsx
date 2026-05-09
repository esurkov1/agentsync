import React from "react";
import { Button, Select } from "./UI";

export function AgentSystemListPanel({ agents, busy, openAgentModal, switchMode }) {
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
              <Select
                className={`mode-select ${agent.mode === "global" ? "mode-global" : "mode-local"}`}
                value={agent.mode}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => switchMode(agent.agentId, e.target.value)}
                disabled={busy}
              >
                <option value="global">Global</option>
                <option value="local">Local</option>
              </Select>
              <Button onClick={(e) => { e.stopPropagation(); openAgentModal(agent); }} disabled={busy}>Open</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
