import type { InlineQueryResult } from "../query-builder/query-design/query-builder-slice";
import "./oquery-inline-result.css";

export const INLINE_ROW_HEIGHT = 22;
export const INLINE_HEAD_HEIGHT = 28;
export const INLINE_MAX_ROWS = 8;

export type InlineResultView = { node: HTMLElement; height: number };

function statusText(entry: InlineQueryResult): string {
  if (entry.status === "loading") return "running…";
  if (entry.status === "failed") return "failed";
  const total = entry.result?.totalRecords ?? 0;
  return `${total < 0 ? "1000+" : total} records`;
}

// The result is built with textContent so query values are never parsed as HTML.
export function buildInlineResultView(contextName: string, entry: InlineQueryResult, onClear: () => void): InlineResultView {
  const showTable = entry.status !== "failed" && entry.result !== null;
  const bodyRows = showTable
    ? Math.min(Math.max(entry.result!.rows.length, 1), INLINE_MAX_ROWS) + 1
    : 2;
  const bodyHeight = bodyRows * INLINE_ROW_HEIGHT;
  const height = INLINE_HEAD_HEIGHT + bodyHeight;

  const node = document.createElement("div");
  node.className = "query-oquery-inline-result";
  node.style.height = `${height}px`;

  const head = document.createElement("div");
  head.className = "query-oquery-inline-head";
  const title = document.createElement("span");
  title.className = "query-oquery-inline-title";
  title.textContent = `${contextName} result · ${statusText(entry)}`;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "query-oquery-inline-clear";
  clear.textContent = "×";
  clear.title = "Clear result";
  clear.setAttribute("aria-label", `Clear ${contextName} result`);
  clear.addEventListener("click", onClear);
  head.append(title, clear);

  const body = document.createElement("div");
  body.className = "query-oquery-inline-body";
  body.style.height = `${bodyHeight}px`;

  if (!showTable) {
    const message = document.createElement("p");
    message.className = entry.status === "failed" ? "query-oquery-inline-message error" : "query-oquery-inline-message";
    if (entry.status === "failed") message.setAttribute("role", "alert");
    message.textContent = entry.status === "failed" ? entry.error : "Running query…";
    body.append(message);
  } else {
    const { columns, rows } = entry.result!;
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const column of columns) {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    if (rows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = Math.max(columns.length, 1);
      td.textContent = "No records matched this query.";
      tr.append(td);
      tbody.append(tr);
    }
    for (const row of rows) {
      const tr = document.createElement("tr");
      columns.forEach((_, columnIndex) => {
        const td = document.createElement("td");
        td.textContent = row[columnIndex] ?? "";
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    body.append(table);
  }

  node.append(head, body);
  return { node, height };
}
