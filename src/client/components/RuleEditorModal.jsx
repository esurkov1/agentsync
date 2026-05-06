import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { markdown } from "../lib/markdown";
import { MarkdownCodeEditor } from "./MarkdownCodeEditor";

export function RuleEditorModal({
  rule,
  content,
  setContent,
  name,
  setName,
  onClose,
  onSave,
  onDelete,
  onRename,
  busy
}) {
  const [viewTab, setViewTab] = useState("CODE");

  useEffect(() => {
    setViewTab("CODE");
  }, [rule?.id]);

  const htmlPreview = useMemo(() => markdown.render(content || ""), [content]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-block">
            {rule?.deletable ? (
              <input
                className="input modal-title-input"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                onBlur={onRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <strong className="modal-title">{rule?.name}</strong>
            )}
            <div className="muted modal-path">{rule?.path}</div>
          </div>
          <div className="modal-actions">
            {rule?.deletable ? (
              <Button className="danger" onClick={onDelete} disabled={busy}>
                Удалить
              </Button>
            ) : (
              <Button onClick={onClose} disabled={busy}>
                Закрыть
              </Button>
            )}
            <Button className="primary" onClick={onSave} disabled={busy}>
              Сохранить
            </Button>
          </div>
        </div>

        <div className="editor-tabs">
          <button className={`tab ${viewTab === "CODE" ? "active" : ""}`} onClick={() => setViewTab("CODE")}>
            Code
          </button>
          <button className={`tab ${viewTab === "PREVIEW" ? "active" : ""}`} onClick={() => setViewTab("PREVIEW")}>
            Preview
          </button>
        </div>

        {viewTab === "CODE" ? (
          <MarkdownCodeEditor value={content} onChange={(e) => setContent(e.target.value)} />
        ) : (
          <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
        )}
      </div>
    </div>
  );
}
