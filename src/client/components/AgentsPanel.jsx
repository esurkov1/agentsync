import React, { memo, useCallback, useMemo, useState } from "react";
import { Button, DataTable, Input, Switch } from "./UI";
import { BulkActionDropdown } from "./BulkActionDropdown";

export const AgentsPanel = memo(function AgentsPanel({
  agentsState,
  busy,
  onOpenAgent,
  onCreateAgent,
  onDeleteAgent,
  onBatchToggleAllFrameworks,
  onBatchSetGlobalEnabled,
  onSetGlobalEnabled,
  onResolveConflict,
  selectedIds,
  setSelectedIds,
  query,
  setQuery
}) {
  const [pendingGlobalIds, setPendingGlobalIds] = useState(() => new Set());
  const allAgents = agentsState?.agents || [];
  const normalizedQuery = query.trim().toLowerCase();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const globallyDisabledSet = useMemo(() => new Set(agentsState?.globallyDisabled || []), [agentsState?.globallyDisabled]);

  const filteredAgents = useMemo(() => {
    if (!normalizedQuery) return allAgents;
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const matchesAll = (text) => tokens.every((t) => text.includes(t));

    return allAgents
      .map((agent) => {
        const name = (agent.name || "").toLowerCase();
        const id = (agent.id || "").toLowerCase();
        const description = (agent.description || "").toLowerCase();
        const combined = `${name} ${id} ${description}`;
        if (!matchesAll(combined)) return null;

        let score = 0;
        for (const t of tokens) {
          if (name.startsWith(t)) score += 6;
          else if (name.includes(t)) score += 4;
          if (id.startsWith(t)) score += 5;
          else if (id.includes(t)) score += 3;
          if (description.includes(t)) score += 1;
        }
        return { agent, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || (a.agent.name || a.agent.id).localeCompare(b.agent.name || b.agent.id))
      .map((item) => item.agent);
  }, [allAgents, normalizedQuery]);

  const visibleIds = useMemo(() => filteredAgents.map((a) => a.id), [filteredAgents]);
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

  const toggleSelectOne = useCallback((agentId) => {
    setSelectedIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  }, [setSelectedIds]);

  const handleNewAgent = async () => {
    const agentName = window.prompt("Agent name (e.g. code-reviewer)");
    if (!agentName?.trim()) return;
    await onCreateAgent(agentName.trim());
  };

  const installedFrameworks = useMemo(() => (agentsState?.frameworks || []).filter((f) => f.installed), [agentsState?.frameworks]);

  const getStatusCounts = useCallback((agentId) => {
    const statuses = installedFrameworks.map((f) => f.statuses?.[agentId]);
    return {
      conflict: statuses.filter((status) => status === "conflict").length,
      error: statuses.filter((status) => status === "missing").length
    };
  }, [installedFrameworks]);

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

  const bulkForce = async () => {
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(
      ids.flatMap((agentName) =>
        installedFrameworks.map((f) => onResolveConflict(f.agentId, agentName))
      )
    );
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} agent${selectedIds.length > 1 ? "s" : ""} from source?`)) return;
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(ids.map((agentName) => onDeleteAgent(agentName)));
  };

  const handleSetGlobalEnabled = useCallback(async (agentName, enabled) => {
    if (pendingGlobalIds.has(agentName)) return;
    setPendingGlobalIds((prev) => {
      const next = new Set(prev);
      next.add(agentName);
      return next;
    });
    try {
      await onSetGlobalEnabled(agentName, enabled);
    } finally {
      setPendingGlobalIds((prev) => {
        const next = new Set(prev);
        next.delete(agentName);
        return next;
      });
    }
  }, [onSetGlobalEnabled, pendingGlobalIds]);

  const columns = useMemo(() => [
    {
      key: "toggle",
      className: "skills-col-toggle",
      header: "Active",
      onCellClick: (e) => e.stopPropagation(),
      renderCell: (agent, meta) => {
        const tone = meta.pendingGlobal
          ? "default"
          : !meta.globallyEnabled
          ? "default"
          : meta.statusError > 0
          ? "error"
          : meta.statusConflict > 0
          ? "conflict"
          : "default";
        return (
          <Switch
            checked={meta.globallyEnabled}
            onChange={(e) => handleSetGlobalEnabled(agent.id, e.target.checked)}
            disabled={meta.busy}
            tone={tone}
            title={
              meta.statusError > 0
                ? "Agent installation is incomplete — open the agent to resolve"
                : meta.statusConflict > 0
                ? "Conflict detected — open the agent to resolve"
                : meta.globallyEnabled
                ? "Disable globally"
                : "Enable globally"
            }
          />
        );
      }
    },
    {
      key: "agents",
      className: "skills-col-agents",
      header: "Agent system",
      renderCell: (agent, meta) => {
        if (!meta.globallyEnabled || !meta.installedFrameworksCount) return <span className="muted">—</span>;
        const activeWithoutConflicts = Math.max(meta.activeCount - meta.statusConflict, 0);
        return (
          <div className="agentSystem-count">
            <div>Active: {activeWithoutConflicts}/{meta.installedFrameworksCount}</div>
            {meta.statusConflict > 0 ? <div className="agentSystem-conflict">Conflict: {meta.statusConflict}</div> : null}
          </div>
        );
      }
    },
    {
      key: "name",
      className: "skills-col-name",
      header: "Name",
      renderCell: (agent) => agent.name || agent.id
    },
    {
      key: "description",
      className: "skills-col-flex",
      header: "Description",
      renderCell: (agent) => <span className="muted">{agent.description || ""}</span>
    },
  ], [handleSetGlobalEnabled]);

  const selectable = useMemo(() => ({
    allSelected: allVisibleSelected,
    busy,
    isSelected: (agent) => selectedSet.has(agent.id),
    onToggleAll: toggleSelectAllVisible,
    onToggleOne: (agent) => toggleSelectOne(agent.id)
  }), [allVisibleSelected, busy, selectedSet, toggleSelectAllVisible, toggleSelectOne]);

  const getRowMeta = useCallback((agent) => ({
    activeCount: installedFrameworks.filter((framework) => (framework.enabledAgents || []).includes(agent.id)).length,
    busy,
    globallyEnabled: !globallyDisabledSet.has(agent.id),
    installedFrameworksCount: installedFrameworks.length,
    pendingGlobal: pendingGlobalIds.has(agent.id),
    statusConflict: getStatusCounts(agent.id).conflict,
    statusError: getStatusCounts(agent.id).error
  }), [busy, getStatusCounts, globallyDisabledSet, installedFrameworks, pendingGlobalIds]);

  const rowKey = useCallback((agent) => agent.id, []);
  const handleRowClick = useCallback((agent) => onOpenAgent(agent.id), [onOpenAgent]);

  return (
    <>
      <div className="skills-toolbar section-gap">
        <Input
          className="skill-search"
          placeholder="Search agents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
        <Button variant="primary" onClick={handleNewAgent} disabled={busy}>+ New agent</Button>
        {selectedIds.length > 0 ? (
          <BulkActionDropdown
            count={selectedIds.length}
            onEnable={bulkEnable}
            onDisable={bulkDisable}
            onActivateAll={bulkActivateAll}
            onForce={bulkForce}
            onDelete={bulkDelete}
            disabled={busy}
          />
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={filteredAgents}
        rowKey={rowKey}
        rowClassName="skills-row"
        onRowClick={handleRowClick}
        rowMeta={getRowMeta}
        selectable={selectable}
        minWidth="580px"
        emptyTitle="No agents found"
        emptyDescription={normalizedQuery ? "Try another search query." : "Create your first custom agent."}
      />
    </>
  );
});
