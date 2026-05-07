import React, { memo, useCallback, useMemo, useState } from "react";
import { Button, Checkbox, DataTable, Input, Switch } from "./UI";
import { BulkActionDropdown } from "./BulkActionDropdown";

const STATUS_DOT = {
  ok:      { color: "#4ade80", title: "Connected" },
  error:   { color: "#f87171", title: "Error" },
  unknown: { color: "#a1a1aa", title: "Unknown" },
};

function ServerStatusDot({ status }) {
  if (!status) return <span style={{ color: "var(--muted)", fontSize: "12px", lineHeight: 1 }}>—</span>;
  const s = STATUS_DOT[status.status] || STATUS_DOT.unknown;
  const toolCount = Array.isArray(status.tools) ? status.tools.length : null;
  return (
    <span className="mcp-status-cell">
      <span
        title={`${s.title}${status.message ? ": " + status.message : ""}`}
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: s.color,
          flexShrink: 0,
        }}
      />
      {toolCount !== null && (
        <span style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1 }} title={`${toolCount} tool${toolCount !== 1 ? "s" : ""}`}>
          Tools: {toolCount}
        </span>
      )}
    </span>
  );
}

export const McpPanel = memo(function McpPanel({
  mcpState,
  busy,
  onOpenServer,
  onCreateServer,
  onDeleteServer,
  onBatchToggleAllFrameworks,
  onBatchSetGlobalEnabled,
  onSetGlobalEnabled,
  selectedIds,
  setSelectedIds,
  query,
  setQuery,
  serverStatuses = {}
}) {
  const [pendingGlobalIds, setPendingGlobalIds] = useState(() => new Set());

  const allServers = mcpState?.servers || [];
  const normalizedQuery = query.trim().toLowerCase();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const globallyDisabledSet = useMemo(() => new Set(mcpState?.globallyDisabled || []), [mcpState?.globallyDisabled]);

  const filteredServers = useMemo(() => {
    if (!normalizedQuery) return allServers;
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const matchesAll = (text) => tokens.every((t) => text.includes(t));

    return allServers
      .map((server) => {
        const id = (server.id || "").toLowerCase();
        const description = (server.description || "").toLowerCase();
        const command = (server.command || "").toLowerCase();
        const combined = `${id} ${description} ${command}`;
        if (!matchesAll(combined)) return null;

        let score = 0;
        for (const t of tokens) {
          if (id.startsWith(t)) score += 6;
          else if (id.includes(t)) score += 4;
          if (command.includes(t)) score += 2;
          if (description.includes(t)) score += 1;
        }
        return { server, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.server.id.localeCompare(b.server.id))
      .map((item) => item.server);
  }, [allServers, normalizedQuery]);

  const visibleIds = useMemo(() => filteredServers.map((s) => s.id), [filteredServers]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return [...next];
    });
  }, [allVisibleSelected, setSelectedIds, visibleIds]);

  const toggleSelectOne = useCallback((serverId) => {
    setSelectedIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
  }, [setSelectedIds]);

  const handleNewServer = async () => {
    const serverId = window.prompt("Server ID (e.g. filesystem)");
    if (!serverId?.trim()) return;
    await onCreateServer(serverId.trim());
  };

  const installedFrameworks = useMemo(
    () => (mcpState?.frameworks || []).filter((f) => f.installed && f.supported),
    [mcpState?.frameworks]
  );

  const bulkEnable = async () => {
    const ids = [...selectedIds];
    setSelectedIds([]);
    await onBatchSetGlobalEnabled(ids, true);
  };

  const bulkDisable = async () => {
    const ids = [...selectedIds];
    setSelectedIds([]);
    await onBatchSetGlobalEnabled(ids, false);
  };

  const bulkActivateAll = async () => {
    const ids = [...selectedIds];
    setSelectedIds([]);
    await onBatchToggleAllFrameworks(ids, true);
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} MCP server${selectedIds.length > 1 ? "s" : ""} from source?`)) return;
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(ids.map((serverId) => onDeleteServer(serverId)));
  };

  const handleSetGlobalEnabled = useCallback(async (serverId, enabled) => {
    if (pendingGlobalIds.has(serverId)) return;
    setPendingGlobalIds((prev) => { const next = new Set(prev); next.add(serverId); return next; });
    try {
      await onSetGlobalEnabled(serverId, enabled);
    } finally {
      setPendingGlobalIds((prev) => { const next = new Set(prev); next.delete(serverId); return next; });
    }
  }, [onSetGlobalEnabled, pendingGlobalIds]);

  const columns = useMemo(() => [
    {
      key: "toggle",
      className: "skills-col-toggle",
      header: "Active",
      onCellClick: (e) => e.stopPropagation(),
      renderCell: (server, meta) => (
        <Switch
          checked={meta.globallyEnabled}
          onChange={(e) => handleSetGlobalEnabled(server.id, e.target.checked)}
          disabled={meta.busy}
          title={meta.globallyEnabled ? "Disable globally" : "Enable globally"}
        />
      )
    },
    {
      key: "workspaces",
      className: "skills-col-agents",
      header: "Workspaces",
      renderCell: (server, meta) => {
        if (!meta.globallyEnabled || !meta.installedFrameworksCount) return <span className="muted">—</span>;
        return (
          <div className="workspace-count">
            <div>Active: {meta.activeCount}/{meta.installedFrameworksCount}</div>
          </div>
        );
      }
    },
    {
      key: "conn-status",
      className: "skills-col-status",
      header: "Tools",
      renderCell: (server, meta) => <ServerStatusDot status={meta.connStatus} />
    },
    {
      key: "name",
      className: "skills-col-name skills-col-flex",
      header: "Name",
      renderCell: (server) => server.id
    },
    {
      key: "check",
      className: "skills-col-check",
      renderHeader: (ctx) => (
        <Checkbox
          checked={ctx.allVisibleSelected}
          onChange={ctx.onToggleSelectAllVisible}
          disabled={ctx.busy || !ctx.visibleCount}
        />
      ),
      onCellClick: (e) => e.stopPropagation(),
      renderCell: (server, meta) => (
        <Checkbox
          checked={meta.selected}
          onChange={() => meta.onToggleSelectOne(server.id)}
          disabled={meta.busy}
        />
      )
    }
  ], [handleSetGlobalEnabled]);

  const headerContext = useMemo(() => ({
    allVisibleSelected,
    busy,
    onToggleSelectAllVisible: toggleSelectAllVisible,
    visibleCount: filteredServers.length
  }), [allVisibleSelected, busy, filteredServers.length, toggleSelectAllVisible]);

  const getRowMeta = useCallback((server) => ({
    activeCount: installedFrameworks.filter((f) => (f.enabledServers || []).includes(server.id)).length,
    busy,
    connStatus: serverStatuses[server.id] ?? null,
    globallyEnabled: !globallyDisabledSet.has(server.id),
    installedFrameworksCount: installedFrameworks.length,
    onToggleSelectOne: toggleSelectOne,
    pendingGlobal: pendingGlobalIds.has(server.id),
    selected: selectedSet.has(server.id)
  }), [busy, globallyDisabledSet, installedFrameworks, pendingGlobalIds, selectedSet, serverStatuses, toggleSelectOne]);

  const rowKey = useCallback((server) => server.id, []);
  const handleRowClick = useCallback((server) => onOpenServer(server.id), [onOpenServer]);

  return (
    <>
      <div className="skills-toolbar section-gap">
        <Input
          className="skill-search"
          placeholder="Search MCP servers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
        <Button variant="primary" onClick={handleNewServer} disabled={busy}>+ New server</Button>
        {selectedIds.length > 0 ? (
          <BulkActionDropdown
            count={selectedIds.length}
            onEnable={bulkEnable}
            onDisable={bulkDisable}
            onActivateAll={bulkActivateAll}
            onDelete={bulkDelete}
            disabled={busy}
            showForce={false}
          />
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={filteredServers}
        rowKey={rowKey}
        rowClassName="skills-row mcp-row"
        onRowClick={handleRowClick}
        rowMeta={getRowMeta}
        headerContext={headerContext}
        minWidth="420px"
      />
    </>
  );
});
