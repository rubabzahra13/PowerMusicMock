export function TruncateCell({ children, className = '' }) {
  const text = children == null ? '' : String(children);
  if (!text) return null;
  return (
    <span className={`block truncate ${className}`}>
      {children}
    </span>
  );
}

export function StackedTextCell({ primary, secondary }) {
  return (
    <div className="min-w-0">
      <TruncateCell className="text-sm font-semibold text-[var(--color-text-primary)]">
        {primary}
      </TruncateCell>
      {secondary ? (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          {secondary}
        </TruncateCell>
      ) : null}
    </div>
  );
}

export default function DataTable({
  columns,
  rows,
  onRowClick,
  emptyMessage = 'No data available',
  compact = false,
  centerHeaders = false
}) {
  const isRowClickable = typeof onRowClick === 'function';

  return (
    <div
      className={`w-full border border-[var(--color-border-default)] rounded-md bg-[var(--color-surface-card)] ${
        compact ? 'overflow-hidden' : 'overflow-x-auto'
      }`}
    >
      <table className={`w-full border-collapse text-left ${compact ? 'table-fixed' : ''}`}>
        <thead>
          <tr className="bg-[#f9fafb] border-b border-[var(--color-border-default)]">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] select-none ${
                  centerHeaders ? 'text-center' : ''
                } ${column.headerClassName || ''}`}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  ...(column.width ? { width: column.width } : {})
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-default)]">
          {rows && rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                onClick={() => isRowClickable && onRowClick(row)}
                className={`transition-colors duration-150 border-b border-[var(--color-border-default)] last:border-b-0 hover:bg-[#f9fafb] ${
                  isRowClickable ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((column, colIndex) => {
                  const rawValue = row[column.key];
                  const renderedValue = column.render
                    ? column.render(rawValue, row)
                    : rawValue;

                  const cellStyle =
                    colIndex === 0 && row.alreadyExists
                      ? { borderLeft: '3px solid var(--color-already-exists-border)' }
                      : undefined;

                  const cellWidth = column.width ? { width: column.width } : {};
                  const defaultCellClass = compact
                    ? column.noShrink
                      ? 'align-middle whitespace-nowrap'
                      : 'align-middle max-w-0 overflow-hidden'
                    : 'whitespace-nowrap align-middle';

                  return (
                    <td
                      key={column.key}
                      style={{ ...cellStyle, ...cellWidth }}
                      className={`px-3 py-2.5 text-sm text-[var(--color-text-primary)] ${
                        column.cellClassName ?? defaultCellClass
                      }`}
                    >
                      {renderedValue !== undefined && renderedValue !== null
                        ? renderedValue
                        : ''}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-[var(--color-text-secondary)] bg-white"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
