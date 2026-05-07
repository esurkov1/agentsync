import React from "react";
import { Editor } from "./Editor";
import { Modal } from "./UI";

export function SkillModal({ skill, content, onChangeContent, onClose, onSave, busy, showSave }) {
  return (
    <Modal className="editor-modal" onClose={onClose}>
      <Editor
        title={skill.name}
        path={skill.path}
        value={content}
        onChangeText={onChangeContent}
        onSave={onSave}
        dirty={showSave}
        busy={busy}
        framed={false}
      />
    </Modal>
  );
}
