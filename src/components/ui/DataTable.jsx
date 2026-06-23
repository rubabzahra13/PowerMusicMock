export default function DataTable({ columns, rows, onRowClick, emptyMessage = 'No data available' }) {
  const isRowClickable = typeof onRowClick === 'function';

  return (
    <div className="w-full overflow-x-auto border border-[var(--color-border-default)] rounded-md bg-[var(--color-surface-card)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-[#f9fafb] border-b border-[var(--color-border-default)]">
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] select-none"
                style={{ fontSize: 'var(--font-size-xs)' }}
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
                      className="px-4 py-3 text-sm text-[var(--color-text-primary)] align-middle whitespace-nowrap"
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
