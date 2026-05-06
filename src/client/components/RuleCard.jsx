import React from "react";
import { Badge } from "./Badge";

export function RuleCard({ rule, preview, syncSummary, onOpen }) {
  return (
    <button className="rule-card" onClick={() => onOpen(rule)}>
      <div className="rule-card-top">
        <strong>{rule.name}</strong>
        <Badge ok={syncSummary.ok}>{syncSummary.text}</Badge>
      </div>
      <div className="rule-preview muted">{preview || "Нажмите, чтобы открыть и редактировать"}</div>
      <div className="rule-meta muted">{rule.path}</div>
    </button>
  );
}
