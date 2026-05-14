import React, { memo, useCallback, useMemo, useState } from "react";
import { Button, DataTable, Input } from "./UI";

export const PluginsPanel = memo(function PluginsPanel({
  pluginsState,
  busy,
  onOpenPlugin,
  onCreatePlugin,
  onDeletePlugin,
  onSyncPlugins,
  onPreviewSync,
  preview
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allPlugins = pluginsState?.plugins || [];
  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!normalizedQuery) return allPlugins;
    return allPlugins.filter((p) => `${p.id} ${p.path}`.toLowerCase().includes(normalizedQuery));
  }, [allPlugins, normalizedQuery]);

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
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
  }, [allVisibleSelected, visibleIds]);

  const toggleSelectOne = useCallback((pluginId) => {
    setSelectedIds((prev) =>
      prev.includes(pluginId) ? prev.filter((id) => id !== pluginId) : [...prev, pluginId]
    );
  }, []);

  const handleCreate = async () => {
    const pluginId = window.prompt("Plugin ID (e.g. team-tools)");
    if (!pluginId?.trim()) return;
    await onCreatePlugin(pluginId.trim());
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} plugin${selectedIds.length > 1 ? "s" : ""}?`)) return;
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(ids.map((id) => onDeletePlugin(id)));
  };

  const columns = useMemo(() => [
    {
      key: "name",
      className: "skills-col-name",
      header: "Plugin",
      sortable: true,
      sortValue: (plugin) => (plugin.id || "").toLowerCase(),
      renderCell: (plugin) => plugin.id
    },
    {
      key: "skills",
      className: "skills-col-count",
      header: "Skills",
      sortable: true,
      sortValue: (plugin) => plugin.counts?.skills ?? -1,
      renderCell: (plugin) => plugin.counts?.skills ?? <span className="muted">—</span>
    },
    {
      key: "agents",
      className: "skills-col-count",
      header: "Agents",
      sortable: true,
      sortValue: (plugin) => plugin.counts?.agents ?? -1,
      renderCell: (plugin) => plugin.counts?.agents ?? <span className="muted">—</span>
    },
    {
      key: "hooks",
      className: "skills-col-count",
      header: "Hooks",
      sortable: true,
      sortValue: (plugin) => plugin.counts?.hooks ?? -1,
      renderCell: (plugin) => plugin.counts?.hooks ?? <span className="muted">—</span>
    },
    {
      key: "mcp",
      className: "skills-col-count",
      header: "MCP",
      sortable: true,
      sortValue: (plugin) => plugin.counts?.mcp ?? -1,
      renderCell: (plugin) => plugin.counts?.mcp ?? <span className="muted">—</span>
    },
  ], []);

  const selectable = useMemo(() => ({
    allSelected: allVisibleSelected,
    busy,
    isSelected: (plugin) => selectedSet.has(plugin.id),
    onToggleAll: toggleSelectAllVisible,
    onToggleOne: (plugin) => toggleSelectOne(plugin.id)
  }), [allVisibleSelected, busy, selectedSet, toggleSelectAllVisible, toggleSelectOne]);

  return (
    <>
      <div className="skills-toolbar section-gap">
        <Input
          className="skill-search"
          placeholder="Search plugins…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
        <Button variant="primary" onClick={handleCreate} disabled={busy}>+ New plugin</Button>
        {selectedIds.length > 0 ? (
          <Button variant="danger" onClick={bulkDelete} disabled={busy}>Delete selected</Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowClassName="skills-row"
        onRowClick={(row) => onOpenPlugin(row.id)}
        selectable={selectable}
        minWidth={940}
        emptyTitle="No plugins found"
        emptyDescription={normalizedQuery ? "Try another search query." : "Create your first plugin and sync it to marketplace."}
      />
      <div className="muted section-gap">
        Marketplace: {pluginsState?.marketplacePath}
      </div>
    </>
  );
});
