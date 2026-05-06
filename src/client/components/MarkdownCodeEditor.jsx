import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

export function MarkdownCodeEditor({ value, onChangeText, readOnly = false }) {
  const extensions = useMemo(() => [markdown()], []);

  return (
    <div className="code-editor-wrap">
      <CodeMirror
        value={value || ""}
        height="420px"
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
