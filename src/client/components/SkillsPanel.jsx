import React, { memo, useCallback, useMemo, useState } from "react";
import { Button, Checkbox, DataTable, Input, Switch } from "./UI";
import { BulkActionDropdown } from "./BulkActionDropdown";

export const SkillsPanel = memo(function SkillsPanel({
  skillsState,
  busy,
  onOpenSkill,
  onCreateSkill,
  onDeleteSkill,
  onBatchToggleAllAgents,
  onBatchSetGlobalEnabled,
  onSetGlobalEnabled,
  onResolveConflict,
  selectedIds,
  setSelectedIds,
  query,
  setQuery
}) {
  const [pendingGlobalIds, setPendingGlobalIds] = useState(() => new Set());

  const allSkills = skillsState?.skills || [];
  const normalizedQuery = query.trim().toLowerCase();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const globallyDisabledSet = useMemo(() => new Set(skillsState?.globallyDisabled || []), [skillsState?.globallyDisabled]);

  const filteredSkills = useMemo(() => {
    if (!normalizedQuery) return allSkills;
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const matchesAllTokens = (text) => tokens.every((token) => text.includes(token));

    return allSkills
      .map((skill) => {
        const name = (skill.name || "").toLowerCase();
        const id = (skill.id || "").toLowerCase();
        const description = (skill.description || "").toLowerCase();
        const combined = `${name} ${id} ${description}`;
        if (!matchesAllTokens(combined)) return null;

        let score = 0;
        for (const token of tokens) {
          if (name.startsWith(token)) score += 6;
          else if (name.includes(token)) score += 4;
          if (id.startsWith(token)) score += 5;
          else if (id.includes(token)) score += 3;
          if (description.includes(token)) score += 1;
        }
        return { skill, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || (a.skill.name || a.skill.id).localeCompare(b.skill.name || b.skill.id))
      .map((item) => item.skill);
  }, [allSkills, normalizedQuery]);

  const visibleIds = useMemo(() => filteredSkills.map((skill) => skill.id), [filteredSkills]);
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

  const toggleSelectOne = useCallback((skillId) => {
    setSelectedIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]));
  }, [setSelectedIds]);

  const handleNewSkill = async () => {
    const skillId = window.prompt("Skill ID (e.g. frontend-patterns)");
    if (!skillId?.trim()) return;
    await onCreateSkill(skillId.trim());
  };

  const installedAgents = useMemo(() => (skillsState?.agents || []).filter((a) => a.installed), [skillsState?.agents]);

  const getStatusCounts = useCallback((skillId) => {
    const statuses = installedAgents.map((agent) => agent.statuses?.[skillId]);
    return {
      conflict: statuses.filter((status) => status === "conflict").length,
      error: statuses.filter((status) => status === "missing").length
    };
  }, [installedAgents]);

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
    await onBatchToggleAllAgents(ids, true);
  };

  const bulkForce = async () => {
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(
      ids.flatMap((skillId) => installedAgents.map((agent) => onResolveConflict(agent.agentId, skillId)))
    );
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} skill${selectedIds.length > 1 ? "s" : ""} from source?`)) return;
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(ids.map((skillId) => onDeleteSkill(skillId)));
  };

  const handleSetGlobalEnabled = useCallback(async (skillId, enabled) => {
    if (pendingGlobalIds.has(skillId)) return;
    setPendingGlobalIds((prev) => {
      const next = new Set(prev);
      next.add(skillId);
      return next;
    });
    try {
      await onSetGlobalEnabled(skillId, enabled);
    } finally {
      setPendingGlobalIds((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
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
      renderCell: (skill, meta) => {
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
            onChange={(e) => handleSetGlobalEnabled(skill.id, e.target.checked)}
            disabled={meta.busy}
            tone={tone}
            title={
              meta.statusError > 0
                ? "Skill installation is incomplete — open the skill to resolve"
                : meta.statusConflict > 0
                ? "Conflict detected — open the skill to resolve"
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
      header: "Workspaces",
      renderCell: (skill, meta) => {
        if (!meta.globallyEnabled || !meta.installedAgentsCount) return <span className="muted">—</span>;
        const activeWithoutConflicts = Math.max(meta.activeCount - meta.statusConflict, 0);
        return (
          <div className="workspace-count">
            <div>Active: {activeWithoutConflicts}/{meta.installedAgentsCount}</div>
            {meta.statusConflict > 0 ? <div className="workspace-conflict">Conflict: {meta.statusConflict}</div> : null}
          </div>
        );
      }
    },
    {
      key: "name",
      className: "skills-col-name",
      header: "Name",
      renderCell: (skill) => skill.name || skill.id
    },
    {
      key: "description",
      className: "skills-col-flex",
      header: "Description",
      renderCell: (skill) => <span className="muted">{skill.description || ""}</span>
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
      renderCell: (skill, meta) => (
        <Checkbox
          checked={meta.selected}
          onChange={() => meta.onToggleSelectOne(skill.id)}
          disabled={meta.busy}
        />
      )
    }
  ], [handleSetGlobalEnabled]);

  const headerContext = useMemo(() => ({
    allVisibleSelected,
    busy,
    onToggleSelectAllVisible: toggleSelectAllVisible,
    visibleCount: filteredSkills.length
  }), [allVisibleSelected, busy, filteredSkills.length, toggleSelectAllVisible]);

  const getRowMeta = useCallback((skill) => ({
    activeCount: installedAgents.filter((agent) => (agent.enabledSkills || []).includes(skill.id)).length,
    busy,
    globallyEnabled: !globallyDisabledSet.has(skill.id),
    installedAgentsCount: installedAgents.length,
    onToggleSelectOne: toggleSelectOne,
    pendingGlobal: pendingGlobalIds.has(skill.id),
    selected: selectedSet.has(skill.id),
    statusConflict: getStatusCounts(skill.id).conflict,
    statusError: getStatusCounts(skill.id).error
  }), [busy, getStatusCounts, globallyDisabledSet, installedAgents, pendingGlobalIds, selectedSet, toggleSelectOne]);

  const rowKey = useCallback((skill) => skill.id, []);
  const handleRowClick = useCallback((skill) => onOpenSkill(skill.id), [onOpenSkill]);

  return (
    <>
      <div className="skills-toolbar section-gap">
        <Input
          className="skill-search"
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
        <Button variant="primary" onClick={handleNewSkill} disabled={busy}>+ New skill</Button>
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
        rows={filteredSkills}
        rowKey={rowKey}
        rowClassName="skills-row"
        onRowClick={handleRowClick}
        rowMeta={getRowMeta}
        headerContext={headerContext}
        minWidth="580px"
      />
    </>
  );
});
