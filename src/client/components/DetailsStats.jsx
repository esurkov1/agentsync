import React, { useMemo } from "react";
import { Badge, Button, Panel, Switch } from "./UI";

const DESCRIPTION_RULES = {
  skill: {
    target: "100-300",
    ranges: [
      { max: 80, label: "Too brief", tone: "warning" },
      { max: 300, label: "On target", tone: "success" },
      { max: 600, label: "Review length", tone: "warning" },
      { max: Infinity, label: "Too long", tone: "danger" }
    ]
  },
  subagent: {
    target: "50-180",
    ranges: [
      { max: 40, label: "Too brief", tone: "warning" },
      { max: 180, label: "On target", tone: "success" },
      { max: 350, label: "Review length", tone: "warning" },
      { max: Infinity, label: "Too long", tone: "danger" }
    ]
  }
};

function readDescription(content) {
  return (content || "").match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
}

function computeStats(content, type) {
  const text = content || "";
  const description = readDescription(text);
  const rule = DESCRIPTION_RULES[type] || DESCRIPTION_RULES.skill;
  const descriptionType = rule.ranges.find((range) => description.length <= range.max);

  return {
    lines: text ? text.split(/\r?\n/).length : 0,
    words: (text.match(/\S+/g) || []).length,
    chars: text.length,
    descriptionChars: description.length,
    descriptionTarget: rule.target,
    descriptionType
  };
}

export function DetailsStats({ content, type, globalEnabled, onToggleGlobal, busy, onDelete, deleteName }) {
  const stats = useMemo(() => computeStats(content, type), [content, type]);
  const hasGlobalToggle = typeof globalEnabled === "boolean" && typeof onToggleGlobal === "function";

  const handleDelete = () => {
    if (window.confirm(`Delete "${deleteName}"?`)) {
      onDelete();
    }
  };

  return (
    <Panel>
      <div className="details-stats">
        <div className="details-stat-strip">
          <span>{stats.lines} lines</span>
          <span>{stats.words} words</span>
          <span>{stats.chars} chars</span>
        </div>
        <div className="details-stat-row">
          <div>
            <div className="details-stat-label">Description</div>
            <div className="details-stat-meta">{stats.descriptionChars} chars · recommended {stats.descriptionTarget}</div>
          </div>
          <Badge tone={stats.descriptionType.tone}>{stats.descriptionType.label}</Badge>
        </div>
        {hasGlobalToggle ? (
          <div className="details-stat-row">
            <div>
              <div className="details-stat-label">Active</div>
            </div>
            <Switch
              checked={globalEnabled}
              onChange={(e) => onToggleGlobal(e.target.checked)}
              disabled={busy}
              title={globalEnabled ? "Disable globally" : "Enable globally"}
            />
          </div>
        ) : null}
        {onDelete ? (
          <Button variant="danger" onClick={handleDelete} disabled={busy} style={{ width: "100%", marginTop: "4px" }}>
            Delete
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
