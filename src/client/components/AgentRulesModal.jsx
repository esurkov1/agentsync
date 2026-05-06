import React, { useMemo, useState } from "react";
import { markdown } from "../lib/markdown";
import { MarkdownCodeEditor } from "./MarkdownCodeEditor";

export function AgentRulesModal({ agent, mode, content, onChangeContent, onChangeMode, onClose, onSave, busy, showSave }) {
  const [viewTab, setViewTab] = useState("CODE");
  const readOnly = mode === "global";
  const htmlPreview = useMemo(() => markdown.render(content || ""), [content]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-block">
            <strong className="modal-title">{agent.label}</strong>
            <div className="muted modal-path">{agent.path}</div>
          </div>
          <div className="modal-actions">
            <div className="segmented">
              <button className={`segmented-item ${viewTab === "CODE" ? "active" : ""}`} onClick={() => setViewTab("CODE")}>
                Code
              </button>
              <button className={`segmented-item ${viewTab === "PREVIEW" ? "active" : ""}`} onClick={() => setViewTab("PREVIEW")}>
                Preview
              </button>
            </div>
            <select
              className={`input mode-select ${mode === "global" ? "mode-global" : "mode-local"}`}
              value={mode}
              onChange={(e) => onChangeMode(e.target.value)}
              disabled={busy}
            >
              <option value="global">global</option>
              <option value="local">local</option>
            </select>
            {showSave ? <button className="btn primary" onClick={onSave} disabled={busy || readOnly}>Save</button> : null}
          </div>
        </div>

        {viewTab === "CODE" ? (
          <MarkdownCodeEditor value={content} onChangeText={onChangeContent} readOnly={readOnly} />
        ) : (
          <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
        )}
      </div>
    </div>
  );
}
