import React, { useMemo, useState } from "react";
import { Braces, File, FileCode2, FileJson, FileText, FileType2, FileTerminal, Folder, FolderOpen } from "lucide-react";
import { Editor } from "../components/Editor";
import { DetailsStats } from "../components/DetailsStats";
import { Button, Panel, Switch } from "../components/UI";

function fileIcon(filePath) {
  const lower = (filePath || "").toLowerCase();
  if (lower.endsWith(".md")) return FileText;
  if (lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".jsx")) return FileCode2;
  if (lower.endsWith(".py")) return FileType2;
  if (lower.endsWith(".sh")) return FileTerminal;
  if (lower.endsWith(".json") || lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) return FileJson;
  if (lower.endsWith(".css") || lower.endsWith(".scss")) return Braces;
  return File;
}

function statusDotClass(status) {
  if (status === "installed") return "ok";
  if (status === "conflict") return "error";
  if (status === "missing") return "warn";
  if (status === "globally_disabled") return "dim";
  return "dim";
}

function statusLabel(status) {
  if (status === "installed") return "Active";
  if (status === "conflict") return "Conflict detected";
  if (status === "missing") return "Missing";
  if (status === "globally_disabled") return "Globally disabled";
  if (status === "available") return "Available";
  if (status === "not_installed") return "Not installed";
  return "Unknown";
}

function buildFileTree(paths) {
  const root = { type: "dir", name: "", path: "", children: [] };
  const dirIndex = new Map([["", root]]);

  for (const rawPath of paths || []) {
    const normalized = (rawPath || "").replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    let currentPath = "";
    let parent = root;

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const nextPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (isFile) {
        parent.children.push({ type: "file", name: part, path: nextPath });
      } else {
        let dirNode = dirIndex.get(nextPath);
        if (!dirNode) {
          dirNode = { type: "dir", name: part, path: nextPath, children: [] };
          dirIndex.set(nextPath, dirNode);
          parent.children.push(dirNode);
        }
        parent = dirNode;
        currentPath = nextPath;
      }
    }
  }

  const sortNodes = (node) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === "dir") sortNodes(child);
    }
  };
  sortNodes(root);
  return root;
}


export function SkillDetailsPage({ skill, content, busy, onBack, onSave, onRename, onChangeContent, skillsState, onToggleSkill, onResolveConflict, onSetGlobalEnabled, onDelete, fromPlugin }) {
  const [collapsedDirs, setCollapsedDirs] = useState({});
  const dirty = (content || "") !== (skill.content || "");
  const globallyEnabled = !new Set(skillsState?.globallyDisabled || []).has(skill.skillId);
  const fileTree = useMemo(() => buildFileTree(skill.files || []), [skill.files]);
  const toggleDir = (path) => {
    setCollapsedDirs((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const openInFinder = () => {
    fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId: skill.skillId })
    });
  };

  const renderNode = (node, depth = 0) => {
    if (node.type === "file") {
      const Icon = fileIcon(node.path);
      return (
        <div className="skill-tree-row" key={node.path} style={{ paddingLeft: `${depth * 14}px` }}>
          <span className="skill-file-icon" aria-hidden="true">
            <Icon size={12} strokeWidth={2} />
          </span>
          <span className="skill-file-name">{node.name}</span>
        </div>
      );
    }

    const collapsed = !!collapsedDirs[node.path];
    return (
      <div key={node.path}>
        <Button variant="tree" style={{ paddingLeft: `${depth * 14}px` }} onClick={() => toggleDir(node.path)}>
          <span className="skill-file-icon" aria-hidden="true">
            {collapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
          </span>
          <span className="skill-file-name">{node.name}</span>
        </Button>
        {!collapsed ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  };

  const agentSystemRows = (skillsState?.agents || []).map((agent) => {
    const enabled = (agent.enabledSkills || []).includes(skill.skillId);
    const status = globallyEnabled ? (agent.statuses?.[skill.skillId] || "available") : "globally_disabled";
    const canToggle = agent.installed && globallyEnabled;
    return { agent, enabled, status, canToggle };
  });
  const visibleRows = agentSystemRows.filter((row) => row.status !== "not_installed");

  return (
    <section className="skill-page section-gap">
      <div className="skill-layout section-gap">
        <Editor
          title={skill.name}
          path={skill.path || skill.skillId || skill.id}
          value={content}
          onChangeText={onChangeContent}
          onSave={onSave}
          onRename={onRename}
          dirty={dirty}
          busy={busy}
          canRename={!!onRename}
          className="skill-main"
        />

        <aside className="skill-side">
          <DetailsStats
            content={content}
            type="skill"
            busy={busy}
            globalEnabled={globallyEnabled}
            onToggleGlobal={(enabled) => onSetGlobalEnabled(skill.skillId, enabled)}
            onDelete={onDelete}
            deleteName={skill.name || skill.skillId}
          />

          <Panel>
            <div className="skill-files-head">
              <strong className="modal-title">Files <span className="muted">({(skill.files || []).length})</span></strong>
              <Button variant="text" onClick={openInFinder} title="Open in Finder" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <FolderOpen size={13} />
                <span>Open</span>
              </Button>
            </div>
            <div className="section-gap skill-files-list">
              {fileTree.children.map((node) => renderNode(node, 0))}
            </div>
          </Panel>

          {!fromPlugin && <Panel>
            <strong className="modal-title">Agent system</strong>
            <div className="skill-targets section-gap">
              {visibleRows.map(({ agent, enabled, status, canToggle }) => {
                return (
                  <div key={agent.agentId} className="skill-target-row">
                    <div className="skill-target-left">
                      <span className={`status-dot ${statusDotClass(status)}`} title={statusLabel(status)} />
                      <div>
                        <div className="skill-target-label">{agent.label}</div>
                        <div className="skill-target-meta">
                          {statusLabel(status)}
                          {status === "conflict" && onResolveConflict ? (
                            <>
                              {" · "}
                              <Button
                                variant="force"
                                onClick={() => onResolveConflict(agent.agentId, skill.skillId)}
                                disabled={busy}
                                title="Remove the conflicting file and reinstall"
                              >
                                Resolve
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      onChange={(e) => onToggleSkill(agent.agentId, skill.skillId, e.target.checked)}
                      disabled={busy || !canToggle}
                      title={
                        !agent.installed
                          ? "Agent system is not installed"
                          : !globallyEnabled
                          ? "Enable globally first"
                          : status === "conflict"
                          ? "Conflict detected — resolve before enabling"
                          : enabled
                          ? "Disable"
                          : "Enable"
                      }
                    />
                  </div>
                );
              })}
            </div>
          </Panel>}
        </aside>
      </div>
    </section>
  );
}
