import React, { memo, useMemo, useState } from "react";
import { Checkbox } from "./Checkbox";

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

const DataTableRow = memo(function DataTableRow({
  columns,
  row,
  rowMeta,
  rowKeyValue,
  rowClassName,
  onRowClick,
  selectable
}) {
  return (
    <tr
      className={rowClassName || ""}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
    >
      {columns.map((column) => (
        <td
          key={`${rowKeyValue}:${column.key}`}
          className={column.className || ""}
          onClick={column.onCellClick ? (e) => column.onCellClick(e, row) : undefined}
        >
          {column.renderCell(row, rowMeta)}
        </td>
      ))}
      {selectable && (
        <td
          className="skills-col-check"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selectable.isSelected(row)}
            onChange={() => selectable.onToggleOne(row)}
            disabled={selectable.busy}
          />
        </td>
      )}
    </tr>
  );
}, (prev, next) => (
  prev.columns === next.columns &&
  prev.row === next.row &&
  prev.rowKeyValue === next.rowKeyValue &&
  prev.rowClassName === next.rowClassName &&
  prev.onRowClick === next.onRowClick &&
  prev.selectable === next.selectable &&
  shallowEqual(prev.rowMeta, next.rowMeta)
));

function defaultSortValue(value) {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase();
  if (React.isValidElement(value)) return defaultSortValue(value.props?.children);
  if (Array.isArray(value)) return defaultSortValue(value[0]);
  return String(value).toLowerCase();
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function SortIndicator({ direction }) {
  return (
    <span className={`sort-indicator${direction ? ` sort-indicator--${direction}` : ""}`} aria-hidden="true">
      {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕"}
    </span>
  );
}

export function DataTable({
  columns,
  rows,
  rowKey,
  rowClassName,
  onRowClick,
  rowMeta,
  selectable,
  hideHeader,
  minWidth,
  emptyTitle = "No data yet",
  emptyDescription = "Try changing filters or create a new item."
}) {
  const [sort, setSort] = useState({ key: null, dir: null });

  const sortedRows = useMemo(() => {
    if (!sort.key || !sort.dir) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column || !column.sortable) return rows;
    const accessor = column.sortValue
      ? (row) => column.sortValue(row, rowMeta ? rowMeta(row) : undefined)
      : (row) => defaultSortValue(column.renderCell(row, rowMeta ? rowMeta(row) : undefined));
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((ra, rb) => compareValues(accessor(ra), accessor(rb)) * factor);
  }, [rows, sort, columns, rowMeta]);

  const cycleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: null };
    });
  };

  if (rows.length === 0) {
    return (
      <div className="skills-table-wrap section-gap">
        <div className="table-empty-state">
          <div className="table-empty-title">{emptyTitle}</div>
          <div className="table-empty-description">{emptyDescription}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="skills-table-wrap section-gap">
      <table className="skills-table" style={minWidth ? { minWidth } : undefined}>
        {!hideHeader && (
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = column.sortable && sort.key === column.key;
                const direction = isSorted ? sort.dir : null;
                const className = [
                  column.className || "",
                  column.sortable ? "sortable" : "",
                  isSorted ? "sorted" : ""
                ].filter(Boolean).join(" ");
                return (
                  <th
                    key={column.key}
                    className={className}
                    aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="sort-header"
                        onClick={() => cycleSort(column.key)}
                      >
                        <span>{column.header}</span>
                        <SortIndicator direction={direction} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {selectable && (
                <th className="skills-col-check">
                  <Checkbox
                    checked={selectable.allSelected}
                    onChange={selectable.onToggleAll}
                    disabled={selectable.busy || rows.length === 0}
                  />
                </th>
              )}
            </tr>
          </thead>
        )}
        <tbody>
          {sortedRows.map((row) => {
            const key = rowKey(row);
            return (
              <DataTableRow
                key={key}
                columns={columns}
                row={row}
                rowMeta={rowMeta ? rowMeta(row) : undefined}
                rowKeyValue={key}
                rowClassName={typeof rowClassName === "function" ? rowClassName(row) : rowClassName}
                onRowClick={onRowClick}
                selectable={selectable}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
