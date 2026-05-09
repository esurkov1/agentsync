import React, { useMemo, useState } from "react";
import { Panel, Select, Button, Input } from "../components/UI";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import "highlight.js/styles/github-dark.min.css";

hljs.registerLanguage("bash", bash);

const HOOK_GROUPS = [
  {
    label: "Tool Execution",
    events: [
      { key: "PreToolUse",         desc: "Before tool call. Exit 2 blocks it.",        hasMatcher: true },
      { key: "PostToolUse",        desc: "After successful tool call.",                 hasMatcher: true },
      { key: "PostToolUseFailure", desc: "After failed tool call.",                     hasMatcher: true },
    ],
  },
  {
    label: "Session",
    events: [
      { key: "UserPromptSubmit",   desc: "On prompt submit. Stdout → context.",         hasMatcher: false },
      { key: "SessionStart",       desc: "On session init / resume / compact.",         hasMatcher: false },
      { key: "SessionEnd",         desc: "On session terminate.",                       hasMatcher: false },
    ],
  },
  {
    label: "Lifecycle",
    events: [
      { key: "Stop",               desc: "Claude finished. Exit 2 blocks stop.",        hasMatcher: false },
      { key: "SubagentStart",      desc: "Subagent initialized.",                       hasMatcher: false },
      { key: "SubagentStop",       desc: "Subagent done. Exit 2 blocks it.",            hasMatcher: false },
      { key: "TaskCompleted",      desc: "Task marked complete. Exit 2 prevents.",      hasMatcher: false },
    ],
  },
  {
    label: "Compaction",
    events: [
      { key: "PreCompact",         desc: "Before context compaction.",                  hasMatcher: false },
      { key: "PostCompact",        desc: "After context compaction.",                   hasMatcher: false },
    ],
  },
  {
    label: "Security",
    events: [
      { key: "PermissionRequest",  desc: "Permission dialog shown.",                    hasMatcher: false },
      { key: "ConfigChange",       desc: "Config changed. Exit 2 blocks it.",           hasMatcher: false },
    ],
  },
  {
    label: "System",
    events: [
      { key: "Notification",       desc: "Claude notification fired.",                  hasMatcher: false },
      { key: "InstructionsLoaded", desc: "CLAUDE.md / rules/*.md loaded.",              hasMatcher: false },
      { key: "TeammateIdle",       desc: "Agent going idle. Exit 2 prevents.",          hasMatcher: false },
    ],
  },
  {
    label: "Worktrees",
    events: [
      { key: "WorktreeCreate",     desc: "Worktree created via --worktree.",            hasMatcher: false },
      { key: "WorktreeRemove",     desc: "Worktree removed.",                           hasMatcher: false },
    ],
  },
  {
    label: "MCP",
    events: [
      { key: "Elicitation",        desc: "MCP server requests input. Exit 2 declines.", hasMatcher: false },
      { key: "ElicitationResult",  desc: "User responded to MCP input request.",        hasMatcher: false },
    ],
  },
];

function parseHooks(content) {
  try { return JSON.parse(content) || {}; } catch { return {}; }
}

function buildEntry(event, matcher, command, timeoutStr) {
  const action = { type: "command", command: command.trim() };
  const t = Number(timeoutStr);
  if (timeoutStr && !isNaN(t)) action.timeout = t;
  const entry = { hooks: [action] };
  if (event.hasMatcher && matcher.trim()) entry.matcher = matcher.trim();
  return entry;
}

const MATCHER_TOOLS = ["Bash", "Read", "Write", "Edit", "MultiEdit", "WebFetch", "WebSearch", "Glob", "Grep", "LS", "Task", "TodoRead", "TodoWrite"];

function EntryForm({ event, initial, onSave, onCancel, busy, saveLabel = "Добавить" }) {
  const [matcher, setMatcher] = useState(initial?.matcher || "");
  const [command, setCommand] = useState(initial?.command || "");
  const [timeout, setTimeout] = useState(initial?.timeout || "");

  const valid = command.trim().length > 0;

  const handleSave = () => {
    if (!valid) return;
    onSave(buildEntry(event, matcher, command, timeout));
  };

  return (
    <div className="hook-entry hook-entry--editing">
      <div className="hook-entry-top">
        {event.hasMatcher && (
          <Select
            value={matcher}
            onChange={e => setMatcher(e.target.value)}
            className="hook-badge hook-badge--select"
          >
            <option value="">any tool</option>
            {MATCHER_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
        <Input
          placeholder="timeout s"
          value={timeout}
          onChange={e => setTimeout(e.target.value)}
          className="hook-badge hook-badge--input hook-timeout"
          style={{ width: 80 }}
        />
        <span style={{ flex: 1 }} />
        <Button variant="primary" size="mini" onClick={handleSave} disabled={!valid || busy}>{saveLabel}</Button>
        <Button size="mini" onClick={onCancel} disabled={busy}>✕</Button>
      </div>
      <textarea
        className="hook-cmd hook-cmd--edit"
        placeholder="shell command"
        value={command}
        onChange={e => setCommand(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
        autoFocus
        rows={2}
      />
    </div>
  );
}

function HookEntry({ event, entry, idx, onEdit, onRemove, readonly, busy }) {
  const [editing, setEditing] = useState(false);
  const cmd = entry.hooks?.[0]?.command || "";
  const timeout = entry.hooks?.[0]?.timeout;
  const highlighted = useMemo(() => hljs.highlight(cmd, { language: "bash" }).value, [cmd]);

  if (editing) {
    return (
      <EntryForm
        event={event}
        initial={{ matcher: entry.matcher || "", command: cmd, timeout: timeout?.toString() || "" }}
        onSave={updated => { onEdit(idx, updated); setEditing(false); }}
        onCancel={() => setEditing(false)}
        busy={busy}
        saveLabel="Save"
      />
    );
  }

  return (
    <div className="hook-entry">
      <div className="hook-entry-top">
        {event.hasMatcher && (
          entry.matcher
            ? <span className="hook-badge hook-matcher">{entry.matcher}</span>
            : <span className="hook-badge hook-any">any tool</span>
        )}
        {timeout != null && <span className="hook-badge hook-timeout">{timeout}s</span>}
        <span style={{ flex: 1 }} />
        {!readonly && (
          <>
            <Button size="mini" onClick={() => setEditing(true)} disabled={busy} title="Edit">✎</Button>
            <Button size="mini" className="hook-action--del" onClick={() => onRemove(idx)} disabled={busy} title="Delete">×</Button>
          </>
        )}
      </div>
      <pre className="hook-cmd hljs"><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
    </div>
  );
}

function HookEventRow({ event, entries, onAdd, onEdit, onRemove, readonly, busy }) {
  const [adding, setAdding] = useState(false);
  const hasEntries = entries.length > 0;

  return (
    <div className="hook-block">
      <div className="hook-block-head">
        <span className="hook-block-title">{event.key}</span>
        {hasEntries && <span className="hook-count">{entries.length}</span>}
        <span className="hook-block-desc">{event.desc}</span>
        {!readonly && !adding && (
          <Button variant="text" size="mini" onClick={() => setAdding(true)} disabled={busy}>+ Add</Button>
        )}
      </div>

      {(hasEntries || adding) && (
        <div className="hook-block-body">
          {entries.map((entry, idx) => (
            <HookEntry
              key={idx}
              event={event}
              entry={entry}
              idx={idx}
              onEdit={onEdit}
              onRemove={onRemove}
              readonly={readonly}
              busy={busy}
            />
          ))}
          {adding && (
            <EntryForm
              event={event}
              initial={null}
              onSave={entry => { onAdd(entry); setAdding(false); }}
              onCancel={() => setAdding(false)}
              busy={busy}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function HooksPage({
  hooksState,
  content,
  onCommit,
  onSync,
  busy,
  scope,
  setScope,
  selectedAgentId,
  setSelectedAgentId,
}) {
  const frameworks = hooksState?.frameworks || [];
  const installed = frameworks.filter(f => f.installed);
  const readonly = scope === "discovered";
  const hooks = useMemo(() => parseHooks(content), [content]);

  const commit = (next) => onCommit(JSON.stringify(next, null, 2));

  const handleAdd = (key, entry) => {
    const next = { ...hooks };
    next[key] = [...(Array.isArray(next[key]) ? next[key] : []), entry];
    commit(next);
  };

  const handleEdit = (key, idx, entry) => {
    const next = { ...hooks };
    next[key] = next[key].map((e, i) => i === idx ? entry : e);
    commit(next);
  };

  const handleRemove = (key, idx) => {
    const next = { ...hooks };
    next[key] = next[key].filter((_, i) => i !== idx);
    if (!next[key].length) delete next[key];
    commit(next);
  };

  return (
    <div className="skill-layout section-gap">
      <div className="skill-main">
        <div className="row" style={{ marginBottom: 14 }}>
          <Select value={scope} onChange={e => setScope(e.target.value)} disabled={busy}>
            <option value="global">Global</option>
            <option value="system">Per-system</option>
          </Select>
          {scope !== "global" && (
            <Select value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)} disabled={busy}>
              {frameworks.filter(f => f.installed && f.supported).map(f => (
                <option key={f.agentId} value={f.agentId}>{f.label}</option>
              ))}
            </Select>
          )}
          <span className="spacer" />
          <Button onClick={onSync} disabled={busy}>Sync</Button>
        </div>

        {HOOK_GROUPS.map(group => (
          <div key={group.label} className="hook-group">
            <div className="hook-group-label">{group.label}</div>
            {group.events.map(event => (
              <HookEventRow
                key={event.key}
                event={event}
                entries={Array.isArray(hooks[event.key]) ? hooks[event.key] : []}
                onAdd={entry => handleAdd(event.key, entry)}
                onEdit={(idx, entry) => handleEdit(event.key, idx, entry)}
                onRemove={idx => handleRemove(event.key, idx)}
                readonly={readonly}
                busy={busy}
              />
            ))}
          </div>
        ))}
      </div>

      <aside className="skill-side">
        <Panel>
          <strong className="modal-title">Agent system</strong>
          <div className="skill-targets section-gap">
            {installed.length === 0 ? (
              <div className="skill-target-meta">No installed agents.</div>
            ) : installed.map(fw => (
              <div key={fw.agentId} className="skill-target-row">
                <div className="skill-target-left">
                  <span className={`status-dot ${fw.supported ? "ok" : "warn"}`} />
                  <div>
                    <div className="skill-target-label">{fw.label}</div>
                    <div className="skill-target-meta" style={{ wordBreak: "break-all" }}>{fw.targetPath}</div>
                    {fw.discoveredEntries > 0 && (
                      <div className="skill-target-meta">{fw.discoveredEntries} discovered</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

      </aside>
    </div>
  );
}
