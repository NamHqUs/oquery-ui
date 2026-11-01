import { useState } from "react";
import { QueryResult as QueryResultData } from "../query-design/query-builder-slice";
import Icon from "../../icon/icon";
import SqlStatement from "./sql-statement";
import "./query-result.css";

type QueryResultProps = {
  result: QueryResultData | null;
  sqlStatement: string | null;
  resultView: "data" | "sql";
  onRunQuery: () => void;
  onGetSql: () => void;
  pageNumber: number;
  pageSize: number | null;
  onPageChange: (page: number) => void;
  pageNavigationEnabled: boolean;
  queryLoading: boolean;
  queryDisabled: boolean;
};

type CopyFeedback = {
  statement: string;
  status: "copied" | "error";
};

export default function QueryResult({ result, sqlStatement, resultView, onRunQuery, onGetSql, pageNumber, pageSize, onPageChange, pageNavigationEnabled, queryLoading, queryDisabled }: QueryResultProps) {
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const currentCopyStatus = copyFeedback?.statement === sqlStatement ? copyFeedback.status : null;

  const copyStatement = async () => {
    if (!sqlStatement) return;

    try {
      await navigator.clipboard.writeText(sqlStatement);
      setCopyFeedback({ statement: sqlStatement, status: "copied" });
    } catch {
      setCopyFeedback({ statement: sqlStatement, status: "error" });
    }
  };

  return (
    <section className="results-card query-results">
      <div className="results-head">
        <div className="query-result-title">
          <div>
            <span className="section-kicker">QUERY RESULT</span>
            <div className="query-result-description-row">
              <p className="query-result-description">{resultView === "sql" ? "SQL statement" : result?.name || "Run a query to see results"}</p>
              {resultView === "sql" && sqlStatement && <>
                <button className="query-result-copy" type="button" aria-label="Copy SQL statement" title="Copy SQL statement" onClick={copyStatement}>
                  <Icon name="copy" size={14} />
                </button>
                <span className="query-result-copy-feedback" aria-live="polite">
                  {currentCopyStatus === "copied" && "SQL copied"}
                  {currentCopyStatus === "error" && "Copy failed. Check clipboard permissions."}
                </span>
              </>}
            </div>
          </div>
          {resultView === "data" && result && <span className="result-count">{result.totalRecords < 0 ? "1000+" : result.totalRecords} records</span>}
        </div>
        <div className="query-result-tools">
           <button
            type="button"
            className="button secondary query-result-action"
            aria-label="Get SQL statement"
            title="Get SQL statement"
            onClick={onGetSql}
            disabled={queryLoading || queryDisabled}
          >
            <Icon name="code" size={20} />
          </button>
          <button
            type="button"
            className="button primary query-result-action"
            aria-label={queryLoading ? "Running query" : "Run query"}
            title={queryLoading ? "Running query" : "Run query"}
            onClick={onRunQuery}
            disabled={queryLoading || queryDisabled}
          >
            <Icon name="play" size={20} />
          </button>
         
        </div>
      </div>
      {resultView === "sql" && sqlStatement
        ? <SqlStatement statement={sqlStatement} />
        : result
          ? <div className="table-wrap"><table><thead><tr>{result.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>)}</tbody></table>{!result.rows.length && <p className="empty-state">No records matched this query.</p>}</div>
          : <p className="empty-state">Your query results will appear here.</p>}
      {resultView === "data" && result && pageNavigationEnabled && pageSize !== null && pageSize > 0 && <nav className="query-pagination" aria-label="Query result pages">
        <button className="button secondary" onClick={() => onPageChange(pageNumber - 1)} disabled={queryLoading || queryDisabled || pageNumber <= 1}>Previous</button>
        <span>Page {pageNumber}</span>
        <button className="button secondary" onClick={() => onPageChange(pageNumber + 1)} disabled={queryLoading || queryDisabled || result.rows.length < pageSize}>Next</button>
      </nav>}
    </section>
  );
}
