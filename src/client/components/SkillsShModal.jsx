import React, { useRef, useEffect, useState } from "react";
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

function fmtInstalls(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const COLUMNS = [
  {
    key: "name",
    className: "skills-col-flex",
    header: "Skill",
    renderCell: (item) => (
      <div>
        <div className="installer-item-name">{item.name}</div>
        {item.source && <div className="installer-item-desc muted">{item.source}</div>}
      </div>
    )
  },
  {
    key: "installs",
    className: "skills-col-installs",
    header: "Downloads",
    renderCell: (item) => {
      const fmt = fmtInstalls(item.installs);
      return fmt ? <span className="skillssh-installs-count">{fmt}</span> : <span className="muted">—</span>;
    }
  },
  {
    key: "check",
    className: "skills-col-check",
    onCellClick: (e) => e.stopPropagation(),
    renderHeader: (ctx) => (
      <Checkbox
        checked={ctx.allSelected}
        onChange={(e) => ctx.onToggleAll(e.target.checked)}
        disabled={ctx.busy || !ctx.count}
      />
    ),
    renderCell: (item, meta) => item.installed
      ? <InstalledMark />
      : <Checkbox checked={meta.selected} onChange={() => meta.toggle(item)} disabled={meta.busy} />
  }
];

export function SkillsShModal({
  busy, searching, error,
  results, resultCount, selectedIds, selectedCount,
  progress, query, setQuery,
  onSearch, onToggleItem, onToggleAll,
  onInstall, onClose
}) {
  const inputRef = useRef(null);
  const [localQuery, setLocalQuery] = useState(query ?? "");
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = () => { setQuery(localQuery); onSearch(localQuery); };
  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const rows = results ?? [];
  const allSelected = rows.length > 0 && rows.every((i) => selectedIds.has(i.id));

  return (
    <Modal onClose={onClose} minWidth={520} maxWidth={720}>
      <div className="modal-head">
        <div className="modal-title-block">
          <strong className="modal-title">Install Skills</strong>
          <div className="muted modal-path">skills.sh registry · {resultCount > 0 ? `${resultCount} results` : "91K+ skills"}</div>
        </div>
        <div className="modal-actions">
          <Button variant="primary" onClick={onInstall} disabled={busy || searching || selectedCount === 0}>
            Install{selectedCount > 0 ? ` (${selectedCount})` : ""}
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
          {progress.total > 0 && (
            <div className="installer-progress-label">{progress.done} / {progress.total}</div>
          )}
        </div>
      )}

      <div className="section-gap" style={{ paddingBottom: 0 }}>
        <div className="skillssh-search-row">
          <input
            ref={inputRef}
            className="skillssh-search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search 91K+ skills… (e.g. git, react, tdd)"
            disabled={busy || searching}
          />
          <Button onClick={handleSearch} disabled={busy || searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="section-gap" style={{ paddingTop: 8, paddingBottom: 0 }}>
          <div className="skillssh-error">{error}</div>
        </div>
      )}

      <div className="section-gap">
        {searching ? (
          <div className="installer-progress-wrap">
            <div className="installer-progress-track">
              <div className="installer-progress-fill installer-progress-fill--indeterminate" />
            </div>
            <div className="muted" style={{ textAlign: "center", padding: "8px 0", fontSize: 12 }}>
              Searching skills.sh…
            </div>
          </div>
        ) : results === null ? (
          <div className="skillssh-empty-state">
            <div className="skillssh-empty-icon">⌕</div>
            <div className="skillssh-empty-title">Search the skills registry</div>
            <div className="muted skillssh-empty-desc">
              91,000+ reusable agent skills from the open ecosystem
            </div>
            <div className="skillssh-tip-list">
              <div className="skillssh-tip">Try <strong>react</strong>, <strong>git</strong>, <strong>tdd</strong>, <strong>scrape</strong>…</div>
              <div className="skillssh-tip">Leave blank and press Search to browse popular skills</div>
            </div>
          </div>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => !busy && !row.installed && onToggleItem(row)}
            rowClassName={(row) => `skills-row${row.installed ? " installer-row--installed" : ""}`}
            rowMeta={(row) => ({
              busy,
              selected: selectedIds.has(row.id),
              toggle: onToggleItem
            })}
            headerContext={{
              allSelected,
              busy,
              count: rows.length,
              onToggleAll: (enabled) => onToggleAll(rows, enabled)
            }}
            minWidth={420}
            emptyTitle="No skills found"
            emptyDescription="Try a different search query"
          />
        )}
      </div>
    </Modal>
  );
}
