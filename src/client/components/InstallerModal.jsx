import React from "react";
import { Button, Checkbox, DataTable, Modal } from "./UI";

function InstalledMark() {
  return (
    <span className="installer-installed-mark" title="Already installed">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="18" height="18" rx="5" fill="#14532d" stroke="#166534" strokeWidth="1"/>
        <path d="M4.5 9.5L7.5 12.5L13.5 5.5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

const GROUP_ORDER = ["skills", "agents", "mcp", "hooks", "plugins"];
const GROUP_SINGULAR = { skills: "Skill", agents: "Agent", mcp: "MCP Server", hooks: "Hook", plugins: "Plugin" };

function rowKey(row) {
  return `${row.type}:${row.id}:${row.relPath}`;
}

function InstallerGrid({ group, rows, busy, selectedKeys, onToggleItem, onToggleCategory, onSetItemType }) {
  const label = GROUP_SINGULAR[group] ?? group;
  const hasTypeCol = group === "agents" || group === "skills";
  const allSelected = rows.length > 0 && rows.every((r) => selectedKeys.has(rowKey(r)));
  const gridCols = hasTypeCol ? "minmax(0,1fr) 110px minmax(0,2fr) 32px" : "minmax(0,1fr) minmax(0,2fr) 32px";

  return (
    <div className="installer-grid" style={{ "--ig-cols": gridCols }}>
      <div className="installer-grid-head">
        <div>{label}</div>
        {hasTypeCol && <div>Install as</div>}
        <div>Description</div>
        <div className="installer-grid-ctrl">
          <Checkbox
            checked={allSelected}
            onChange={(e) => onToggleCategory(group, e.target.checked)}
            disabled={busy || !rows.length}
          />
        </div>
      </div>
      {rows.map((row) => {
        const key = rowKey(row);
        const selected = selectedKeys.has(key);
        const isInstalled = !!row.installed;
        return (
          <div
            key={key}
            className={`installer-grid-row${selected ? " installer-grid-row--sel" : ""}${isInstalled ? " installer-grid-row--installed" : ""}`}
            onClick={() => !busy && !isInstalled && onToggleItem(row)}
          >
            <div className="installer-item-name">{row.id}</div>
            {hasTypeCol && (
              <div className="installer-grid-ctrl" onClick={(e) => e.stopPropagation()}>
                {isInstalled ? (
                  <span className="installer-type-label muted">
                    {row.type === "agents" ? "Agent" : "Skill"}
                  </span>
                ) : (
                  <select
                    className="installer-type-select"
                    value={row.type}
                    disabled={busy}
                    onChange={(e) => onSetItemType(row, e.target.value)}
                  >
                    <option value="agents">Agent</option>
                    <option value="skills">Skill</option>
                  </select>
                )}
              </div>
            )}
            <div>
              {row.description
                ? <span className="installer-item-desc muted">{row.description}</span>
                : <span className="muted">—</span>}
            </div>
            <div className="installer-grid-ctrl" onClick={(e) => e.stopPropagation()}>
              {isInstalled
                ? <InstalledMark />
                : <Checkbox checked={selected} onChange={() => onToggleItem(row)} disabled={busy} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MCP_CHECKBOX_COL = {
  key: "check",
  className: "skills-col-check",
  onCellClick: (e) => e.stopPropagation(),
  renderHeader: (ctx) => (
    <Checkbox checked={ctx.allSelected} onChange={(e) => ctx.onToggleAll(e.target.checked)} disabled={ctx.busy || !ctx.count} />
  ),
  renderCell: (item, meta) => item.installed
    ? <InstalledMark />
    : <Checkbox checked={meta.selected} onChange={() => meta.toggle(item)} disabled={meta.busy} />
};

const MCP_COLUMNS = [
  {
    key: "name",
    className: "skills-col-name",
    header: "MCP Server",
    renderCell: (item) => <span className="installer-item-name">{item.id}</span>
  },
  {
    key: "params",
    className: "skills-col-flex",
    header: "Parameters",
    renderCell: (item) =>
      item.mcpParams
        ? <pre className="installer-mcp-params">{JSON.stringify(item.mcpParams, null, 2)}</pre>
        : <span className="muted">—</span>
  },
  MCP_CHECKBOX_COL
];

function GroupSection({ group, rows, busy, selectedKeys, onToggleItem, onToggleCategory, onSetItemType }) {
  if (group === "mcp") {
    const allSelected = rows.length > 0 && rows.every((r) => selectedKeys.has(rowKey(r)));
    return (
      <DataTable
        columns={MCP_COLUMNS}
        rows={rows}
        rowKey={rowKey}
        onRowClick={(row) => !busy && !row.installed && onToggleItem(row)}
        rowMeta={(row) => ({ busy, selected: selectedKeys.has(rowKey(row)), toggle: onToggleItem })}
        rowClassName={(row) => `skills-row${row.installed ? " installer-row--installed" : ""}`}
        headerContext={{ allSelected, busy, count: rows.length, onToggleAll: (enabled) => onToggleCategory("mcp", enabled) }}
        minWidth={560}
        emptyTitle="No items detected"
        emptyDescription=""
      />
    );
  }
  return (
    <InstallerGrid
      group={group}
      rows={rows}
      busy={busy}
      selectedKeys={selectedKeys}
      onToggleItem={onToggleItem}
      onToggleCategory={onToggleCategory}
      onSetItemType={onSetItemType}
    />
  );
}

function PluginSection({ plugin, busy, selectedKeys, onToggleItem, onTogglePlugin, onSetItemType }) {
  const byType = {};
  for (const item of plugin.items) (byType[item.type] ??= []).push(item);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {GROUP_ORDER.map((group) => {
        const rows = byType[group];
        if (!rows || rows.length === 0) return null;
        return (
          <GroupSection
            key={group}
            group={group}
            rows={rows}
            busy={busy}
            selectedKeys={selectedKeys}
            onToggleItem={onToggleItem}
            onToggleCategory={(g, enabled) => onTogglePlugin(plugin.id, enabled, rows.map((i) => rowKey(i)))}
            onSetItemType={onSetItemType}
          />
        );
      })}
    </div>
  );
}

export function InstallerModal({
  busy,
  error,
  repoUrl,
  grouped,
  selectedKeys,
  onToggleItem,
  onToggleCategory,
  onTogglePlugin,
  onToggleAll,
  onSetItemType,
  onSetAllItemTypes,
  totalCount,
  progress = { done: 0, total: 0 },
  onInstall,
  onClose
}) {
  const shortPath = repoUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
  const parts = shortPath.split("/").filter(Boolean);
  const repoName = parts[1] || parts[0] || "Install";

  return (
    <Modal onClose={onClose} maxWidth={1120}>
      <div className="modal-head">
        <div className="modal-title-block">
          <strong className="modal-title">{repoName}</strong>
          {shortPath && <div className="muted modal-path">{shortPath}</div>}
        </div>
        <div className="modal-actions">
          {onSetAllItemTypes && (
            <div className="installer-bulk-type">
              <span className="muted">All as:</span>
              <select
                className="installer-type-select"
                disabled={busy}
                defaultValue=""
                onChange={(e) => { if (e.target.value) { onSetAllItemTypes(e.target.value); e.target.value = ""; } }}
              >
                <option value="" disabled>type…</option>
                <option value="agents">Agent</option>
                <option value="skills">Skill</option>
              </select>
            </div>
          )}
          <Button variant="primary" onClick={onInstall} disabled={busy || selectedKeys.size === 0} loading={busy}>
            Install Selected
          </Button>
        </div>
      </div>

      {busy && (
        <div className="installer-progress-wrap">
          <div className="installer-progress-track">
            <div
              className={`installer-progress-fill${progress.total > 0 ? "" : " installer-progress-fill--indeterminate"}`}
              style={progress.total > 0 ? { width: `${Math.round((progress.done / progress.total) * 100)}%` } : undefined}
            />
          </div>
          {progress.total > 0 && <div className="installer-progress-label">{progress.done} / {progress.total}</div>}
        </div>
      )}

      {error ? <div className="muted section-gap" style={{ color: "#fca5a5" }}>{error}</div> : null}

      <div className="section-gap" style={{ display: "grid", gap: 16 }}>
        {grouped.mode === "plugin" ? (
          <>
            {grouped.plugins.map((plugin) => (
              <PluginSection
                key={plugin.id}
                plugin={plugin}
                busy={busy}
                selectedKeys={selectedKeys}
                onToggleItem={onToggleItem}
                onTogglePlugin={onTogglePlugin}
                onSetItemType={onSetItemType}
              />
            ))}
            {GROUP_ORDER.map((group) => {
              const rows = grouped.orphans[group] || [];
              if (rows.length === 0) return null;
              return (
                <GroupSection
                  key={group}
                  group={group}
                  rows={rows}
                  busy={busy}
                  selectedKeys={selectedKeys}
                  onToggleItem={onToggleItem}
                  onToggleCategory={onToggleCategory}
                  onSetItemType={onSetItemType}
                />
              );
            })}
          </>
        ) : (
          GROUP_ORDER.map((group) => {
            const rows = (grouped.data || {})[group] || [];
            if (rows.length === 0) return null;
            return (
              <GroupSection
                key={group}
                group={group}
                rows={rows}
                busy={busy}
                selectedKeys={selectedKeys}
                onToggleItem={onToggleItem}
                onToggleCategory={onToggleCategory}
                onSetItemType={onSetItemType}
              />
            );
          })
        )}
      </div>
    </Modal>
  );
}
