import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../icon/icon";
import { setColumnFilter, setTableSort } from "../database-slice";
import "./data-grid.css";

const columnClassName = (type, column, filters, sort) => [
  type.isNumeric && "numeric-column",
  type.isId && "id-column",
  type.isDateTime && "datetime-column",
  sort?.column === column && "is-sorted",
  (filters[column] || "").trim() && "is-filtered",
].filter(Boolean).join(" ");

type DataGridProps = {
  table?: { name: string; schema?: string };
  showHeading?: boolean;
};

export default function DataGrid({ table: previewTable, showHeading = true }: DataGridProps = {}) {
  const dispatch = useDispatch();
  const { selectedTable, selectedSchema, viewMode, dataByTable } = useSelector((state) => state.database);
  const tableName = previewTable ? previewTable.name : selectedTable;
  const tableSchema = previewTable ? previewTable.schema || "" : selectedSchema;
  const tableDataKey = tableSchema ? `${tableSchema}.${tableName}` : tableName;
  const tableData = dataByTable[tableDataKey];
  const columns = tableData?.columns || [];
  const rows = tableData?.rows || [];
  const isLoading = !tableData || tableData.status === "loading";
  const hasCachedData = tableData?.status === "loading" && Array.isArray(tableData.columns);
  const filters = tableData?.filters || {};
  const sort = tableData?.sort;

  const columnTypes = useMemo(() => columns.map((column, index) => {
    const values = rows.map((row) => row[index]?.trim() ?? "").filter(Boolean);
    return {
      isId: /id$/i.test(column),
      isDateTime: /(date|time|createdon|updatedon|deletedon)/i.test(column)
        || values.some((value) => /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value)),
      isNumeric: values.length > 0 && values.every((value) => Number.isFinite(Number(value))),
    };
  }), [columns, rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => columns.every((column, index) => {
      const filter = (filters[column] || "").trim().toLocaleLowerCase();
      return !filter || String(row[index] ?? "").toLocaleLowerCase().includes(filter);
    }));
    if (!sort) return filtered;

    const sortIndex = columns.indexOf(sort.column);
    if (sortIndex < 0) return filtered;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const leftValue = left[sortIndex] ?? "";
      const rightValue = right[sortIndex] ?? "";
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const comparison = leftValue !== "" && rightValue !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      return comparison * direction;
    });
  }, [rows, columns, filters, sort]);
  if (!tableName) return null;

  return (
    <>
      {showHeading && (
        <div className="database-content-heading">
          <div>
            <span className="section-kicker">TABLE DATA</span>
            <h2>{tableName}</h2>
          </div>
          {tableData?.status === "succeeded" && <span className="database-record-count">{viewMode === "diagram" ? "Top 10 row preview" : `Previewing up to ${rows.length} rows`}</span>}
        </div>
      )}
      {isLoading && !hasCachedData && <div className="database-grid-loading" role="status">Loading {tableName}…</div>}
      {tableData?.status === "failed" && <p className="database-message error" role="alert">{tableData.error}</p>}
      {(tableData?.status === "succeeded" || hasCachedData) && (
        <div className="database-grid-wrap">
          {columns.length > 0 ? (
            <table className="database-grid">
              <thead>
                <tr>{columns.map((column, index) => (
                  <th
                    className={columnClassName(columnTypes[index], column, filters, sort)}
                    key={`${column}-${index}`}
                    aria-sort={sort?.column === column ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button className="database-sort-button" onClick={() => dispatch(setTableSort({ tableName, schema: tableSchema, column }))}>
                      {column}
                      <span className="database-sort-indicator">{sort?.column === column ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                    <div className="database-filter-box">
                      <input
                        className="database-column-filter"
                        type="text"
                        value={filters[column] || ""}
                        onChange={(event) => dispatch(setColumnFilter({ tableName, schema: tableSchema, column, value: event.target.value }))}
                        placeholder={`Filter ${column}`}
                        aria-label={`Filter ${column}`}
                      />
                      {filters[column] && (
                        <button
                          className="database-filter-clear"
                          onClick={() => dispatch(setColumnFilter({ tableName, schema: tableSchema, column, value: "" }))}
                          aria-label={`Clear ${column} filter`}
                          title="Clear filter"
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr key={`${tableName}-${rowIndex}`}>
                    {row.map((value, columnIndex) => {
                      const type = columnTypes[columnIndex];
                      return (
                        <td
                          className={columnClassName(type, columns[columnIndex], {}, null)}
                          key={columnIndex}
                          title={type.isNumeric || type.isId || type.isDateTime ? value : undefined}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="database-message">This table has no columns.</p>}
          {columns.length > 0 && rows.length === 0 && <p className="database-empty">No records found in this table.</p>}
          {rows.length > 0 && visibleRows.length === 0 && <p className="database-empty">No records match the current filters.</p>}
        </div>
      )}
    </>
  );
}
