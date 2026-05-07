import React, { memo } from "react";

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
  onRowClick
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
    </tr>
  );
}, (prev, next) => (
  prev.columns === next.columns &&
  prev.row === next.row &&
  prev.rowKeyValue === next.rowKeyValue &&
  prev.rowClassName === next.rowClassName &&
  prev.onRowClick === next.onRowClick &&
  shallowEqual(prev.rowMeta, next.rowMeta)
));

export function DataTable({
  columns,
  rows,
  rowKey,
  rowClassName,
  onRowClick,
  rowMeta,
  headerContext,
  minWidth
}) {
  return (
    <div className="skills-table-wrap section-gap">
      <table className="skills-table" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className || ""}>
                {column.renderHeader ? column.renderHeader(headerContext) : column.header}
              </th>
            ))}
          </tr>
        </thead>
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
                rowClassName={rowClassName}
                onRowClick={onRowClick}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
