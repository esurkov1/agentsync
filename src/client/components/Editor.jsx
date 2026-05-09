import React, { useMemo, useState, useEffect, useRef } from "react";
import { markdown } from "../lib/markdown";
import { Button, Panel, Tabs } from "./UI";
import { CodeEditor } from "./CodeEditor";

const EDITOR_TABS = [
  { value: "CODE", label: "Code" },
  { value: "PREVIEW", label: "Preview" }
];

export function Editor({
  title,
  path,
  value,
  onChangeText,
  onSave,
  onRename,
  busy,
  dirty,
  readOnly = false,
  canRename = false,
  actions = null,
  className = "",
  framed = true
}) {
  const [viewTab, setViewTab] = useState("CODE");
  const [nameValue, setNameValue] = useState(title || "");
  const inputRef = useRef(null);
  const htmlPreview = useMemo(() => markdown.render(value || ""), [value]);
  const Shell = framed ? Panel : "div";
  const shellClassName = `${framed ? "editor-panel" : ""} editor-shell ${className}`.trim();

  useEffect(() => {
    setNameValue(title || "");
  }, [title]);

  const nameDirty = canRename && nameValue.trim() !== (title || "").trim();
  const showSave = dirty || nameDirty;

  const handleSave = () => {
    if (nameDirty && onRename) onRename(nameValue.trim());
    if (dirty && onSave) onSave();
  };

  const handleNameKeyDown = (e) => {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") setNameValue(title || "");
  };

  return (
    <Shell className={shellClassName}>
      <div className="modal-head editor-head">
        <div className="modal-title-block">
          {canRename ? (
            <input
              ref={inputRef}
              className="modal-title modal-title-rename"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={handleNameKeyDown}
              disabled={busy}
              spellCheck={false}
            />
          ) : (
            <strong className="modal-title">{title}</strong>
          )}
          {path ? <div className="muted modal-path">{path}</div> : null}
        </div>
        <div className="modal-actions">
          <Tabs
            tabs={EDITOR_TABS}
            current={viewTab}
            onChange={setViewTab}
            disabled={busy}
          />
          {actions}
          {showSave ? (
            <Button variant="primary" onClick={handleSave} disabled={busy || readOnly}>
              Save
            </Button>
          ) : null}
        </div>
      </div>

      {viewTab === "CODE" ? (
        <CodeEditor value={value} onChangeText={onChangeText} readOnly={readOnly} />
      ) : (
        <div className="markdown-preview editor-preview" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
      )}
    </Shell>
  );
}
