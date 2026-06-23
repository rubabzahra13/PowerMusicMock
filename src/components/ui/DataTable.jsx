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

                  // Add a 3px left border to the first cell if row.alreadyExists is true
                  const cellStyle =
                    colIndex === 0 && row.alreadyExists
                      ? { borderLeft: '3px solid var(--color-already-exists-border)' }
                      : undefined;

                  return (
                    <td
                      key={column.key}
                      style={cellStyle}
                      className={`px-3 py-2.5 text-sm text-[var(--color-text-primary)] ${
                        column.cellClassName ?? 'whitespace-nowrap align-middle'
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
