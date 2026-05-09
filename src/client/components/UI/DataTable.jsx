import React, { memo } from "react";
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
              {columns.map((column) => (
                <th key={column.key} className={column.className || ""}>
                  {column.header}
                </th>
              ))}
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
          {rows.map((row) => {
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
