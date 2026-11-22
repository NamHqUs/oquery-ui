import type { QueryResult } from "../../services/dynamic-query-service";
import "./oquery-inline-result.css";

// Inline results are keyed by OQuery context name and stay until cleared or replaced by another run of that context.
export type InlineQueryResult = {
  status: "loading" | "succeeded" | "failed";
  result: QueryResult | null;
  sql: string | null;
  error: string;
};

export const INLINE_ROW_HEIGHT = 22;
export const INLINE_HEAD_HEIGHT = 28;
export const INLINE_MAX_ROWS = 8;

export type InlineResultMode = "data" | "sql";
export type InlineResultView = { node: HTMLElement; height: number };

function statusText(entry: InlineQueryResult): string {
  if (entry.status === "loading") return "running…";
  if (entry.status === "failed") return "failed";
  const total = entry.result?.totalRecords ?? 0;
  return `${total < 0 ? "1000+" : total} records`;
}

function buildModeToggle(
  contextName: string,
  mode: InlineResultMode,
  onModeChange: (mode: InlineResultMode) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "query-oquery-inline-modes";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `${contextName} result view`);
  for (const option of ["data", "sql"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "query-oquery-inline-mode";
    button.textContent = option === "data" ? "Data" : "SQL";
    button.setAttribute("aria-pressed", String(mode === option));
    button.addEventListener("click", () => onModeChange(option));
    group.append(button);
  }
  return group;
}

function buildCopyButton(contextName: string, sql: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "query-oquery-inline-copy";
  button.title = "Copy SQL";
  button.setAttribute("aria-label", `Copy ${contextName} SQL`);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("aria-hidden", "true");
  for (const attributes of [
    { tag: "rect", x: "8", y: "8", width: "12", height: "12", rx: "2" },
    { tag: "path", d: "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" },
  ]) {
    const { tag, ...attrs } = attributes;
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    svg.append(element);
  }
  button.append(svg);

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sql);
      button.classList.add("copied");
      button.title = "Copied";
      window.setTimeout(() => {
        button.classList.remove("copied");
        button.title = "Copy SQL";
      }, 1500);
    } catch {
      button.title = "Copy failed";
    }
  });
  return button;
}

// The result is built with textContent so query values are never parsed as HTML.
export function buildInlineResultView(
  contextName: string,
  entry: InlineQueryResult,
  mode: InlineResultMode,
  collapsed: boolean,
  onClear: () => void,
  onModeChange: (mode: InlineResultMode) => void,
): InlineResultView {
  const showTable = mode === "data" && entry.status !== "failed" && entry.result !== null;
  const bodyRows = mode === "sql"
    ? INLINE_MAX_ROWS + 1
    : showTable
      ? Math.min(Math.max(entry.result!.rows.length, 1), INLINE_MAX_ROWS) + 1
      : 2;
  const bodyHeight = bodyRows * INLINE_ROW_HEIGHT;
  const height = collapsed ? INLINE_HEAD_HEIGHT : INLINE_HEAD_HEIGHT + bodyHeight;

  const node = document.createElement("div");
  node.className = "query-oquery-inline-result";
  node.style.height = `${height}px`;
  // Wheel over the result scrolls the result, not the editor behind it.
  node.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
  // Monaco captures the pointer on mousedown, which would redirect the click away from the buttons.
  for (const type of ["pointerdown", "mousedown"] as const) {
    node.addEventListener(type, (event) => event.stopPropagation());
  }

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
  head.append(title, buildModeToggle(contextName, mode, onModeChange));
  if (mode === "sql" && entry.sql) head.append(buildCopyButton(contextName, entry.sql));
  head.append(clear);

  const body = document.createElement("div");
  body.className = "query-oquery-inline-body";
  body.style.height = `${bodyHeight}px`;

  if (mode === "sql") {
    const sql = document.createElement("pre");
    sql.className = entry.sql ? "query-oquery-inline-sql" : "query-oquery-inline-sql query-oquery-inline-message";
    sql.textContent = entry.sql ?? "SQL is not available for this context yet.";
    body.append(sql);
  } else if (!showTable) {
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

  node.append(head);
  if (!collapsed) node.append(body);
  return { node, height };
}
