import React from "react";
import { MarkdownCodeEditor } from "./MarkdownCodeEditor";

export function GlobalRulesPanel({
  rulesState,
  globalViewTab,
  setGlobalViewTab,
  globalDirty,
  busy,
  saveRules,
  masterContent,
  setMasterContent,
  globalHtmlPreview
}) {
  return (
    <section className="card section-gap">
      <div className="modal-head">
        <div className="modal-title-block">
          <strong className="modal-title">Global Rules</strong>
          <div className="muted modal-path">{rulesState?.masterPath || ""}</div>
        </div>
        <div className="modal-actions">
          <div className="segmented">
            <button className={`segmented-item ${globalViewTab === "CODE" ? "active" : ""}`} onClick={() => setGlobalViewTab("CODE")}>
              Code
            </button>
            <button className={`segmented-item ${globalViewTab === "PREVIEW" ? "active" : ""}`} onClick={() => setGlobalViewTab("PREVIEW")}>
              Preview
            </button>
          </div>
          {globalDirty ? <button className="btn primary" onClick={saveRules} disabled={busy}>Save</button> : null}
        </div>
      </div>

      {globalViewTab === "CODE" ? (
        <div className="section-gap">
          <MarkdownCodeEditor value={masterContent} onChangeText={setMasterContent} />
        </div>
      ) : (
        <div className="markdown-preview section-gap" dangerouslySetInnerHTML={{ __html: globalHtmlPreview }} />
      )}
    </section>
  );
}
