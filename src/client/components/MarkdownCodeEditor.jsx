import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

export function MarkdownCodeEditor({ value, onChangeText, readOnly = false }) {
  const extensions = useMemo(() => [markdown(), EditorView.lineWrapping], []);

  return (
    <div className="code-editor-wrap">
      <CodeMirror
        value={value || ""}
        height="100%"
        theme={oneDark}
        extensions={extensions}
        editable={!readOnly}
        basicSetup={{
          foldGutter: false,
          lineNumbers: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false
        }}
        onChange={(nextValue) => onChangeText(nextValue)}
        className="code-editor-cm"
      />
    </div>
  );
}
