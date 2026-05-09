import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { htmlLanguage } from "@codemirror/lang-html";
import { jsonLanguage } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

export function CodeEditor({ value, onChangeText, readOnly = false, language = "markdown", height = "100%" }) {
  const extensions = useMemo(
    () => {
      if (language === "json") return [jsonLanguage, EditorView.lineWrapping];
      return [
        markdown({
          codeLanguages: (info) => {
            const normalized = (info || "").trim().toLowerCase();
            if (normalized === "json" || normalized === "jsonc") return jsonLanguage;
            if (normalized === "html" || normalized === "htm") return htmlLanguage;
            return null;
          }
        }),
        EditorView.lineWrapping
      ];
    },
    [language]
  );

  return (
    <div className={`code-editor-wrap${height === "auto" ? " code-editor-auto" : ""}`}>
      <CodeMirror
        value={value || ""}
        height={height}
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
