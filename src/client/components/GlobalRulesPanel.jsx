import React from "react";
import { Editor } from "./Editor";

export function GlobalRulesPanel({
  rulesState,
  globalDirty,
  busy,
  saveRules,
  masterContent,
  setMasterContent
}) {
  return (
    <Editor
      title="Global Rules"
      path={rulesState?.masterPath || ""}
      value={masterContent}
      onChangeText={setMasterContent}
      onSave={saveRules}
      dirty={globalDirty}
      busy={busy}
      className="section-gap"
    />
  );
}
