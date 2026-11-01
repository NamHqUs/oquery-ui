import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../icon/icon";
import SidebarList from "../../sidebar-list/sidebar-list";
import { selectDbTable } from "../database-slice";
import "./table-list.css";

type TableListProps = {
  scrollStyle?: CSSProperties;
};

export default function TableList({ scrollStyle }: TableListProps) {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const { schema, selectedTable, selectedSchema, tableStatus, tableError, schemaStatus, schemaError, debugUiEnabled } = useSelector((state) => state.database);
  const tableListRef = useRef<HTMLDivElement>(null);
  const filteredTables = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return schema.tables
      .filter((table) => `${table.schema || "Default schema"} ${table.name}`.toLocaleLowerCase().includes(query))
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [schema.tables, searchQuery]);

  useEffect(() => {
    if (!debugUiEnabled) return;

    console.log("Database table list render model:", {
      props: { scrollStyle },
      redux: {
        schema,
        selectedTable,
        selectedSchema,
        tableStatus,
        tableError,
        schemaStatus,
        schemaError,
      },
      viewModel: {
        searchQuery,
        filteredTables,
      },
    });
  }, [
    debugUiEnabled,
    schema,
    selectedTable,
    selectedSchema,
    tableStatus,
    tableError,
    schemaStatus,
    schemaError,
    searchQuery,
    filteredTables,
    scrollStyle,
  ]);

  useEffect(() => {
    const tableList = tableListRef.current;
    if (!tableList) return;

    const scrollSelectedIntoView = () => {
      const selectedItem = tableList.querySelector<HTMLElement>(".database-table-item[aria-current='page']");
      if (!selectedItem) return;

      const listRect = tableList.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      const visibleTop = listRect.top + tableList.clientTop;
      const visibleBottom = visibleTop + tableList.clientHeight;
      if (itemRect.top < visibleTop) {
        tableList.scrollTop -= visibleTop - itemRect.top;
      } else if (itemRect.bottom > visibleBottom) {
        tableList.scrollTop += itemRect.bottom - visibleBottom;
      }
    };

    scrollSelectedIntoView();
    const observer = new ResizeObserver(scrollSelectedIntoView);
    observer.observe(tableList);
    return () => observer.disconnect();
  }, [searchQuery, selectedSchema, selectedTable]);

  return (
    <SidebarList
      className="database-sidebar split-panel"
      ariaLabel="Database tables"
      title="TABLES"
      totalCount={schemaStatus === "succeeded" ? <span className="database-table-count">{schema.tables.length}</span> : undefined}
      filter={searchQuery}
      searchPlaceholder="Search tables"
      onFilterChange={setSearchQuery}
      listRef={tableListRef}
      listClassName="database-table-list"
      searchClassName="database-table-search"
      scrollStyle={scrollStyle}
    >
        {(tableStatus === "loading" || schemaStatus === "loading") && <p className="database-message">Loading tables…</p>}
        {tableStatus === "failed" && <p className="database-message error" role="alert">{tableError}</p>}
        {schemaStatus === "failed" && <p className="database-message error" role="alert">{schemaError}</p>}
        {schemaStatus === "succeeded" && filteredTables.map((table) => {
            const isSelected = table.name === selectedTable && table.schema === selectedSchema;
            return (
              <button
                className={`database-table-item${isSelected ? " active" : ""}`}
                key={`${table.schema}.${table.name}`}
                onClick={() => dispatch(selectDbTable({ name: table.name, schema: table.schema }))}
                aria-current={isSelected ? "page" : undefined}
              >
                <Icon name="table" size={15} />
                <span className="database-table-name">{table.name}</span>
                <span className="database-table-schema">{table.schema || "Default schema"}</span>
                <Icon name="chevron" size={14} />
              </button>
            );
          })}
        {schemaStatus === "succeeded" && schema.tables.length > 0 && filteredTables.length === 0 && (
          <p className="database-message">No tables match your search.</p>
        )}
        {schemaStatus === "succeeded" && schema.tables.length === 0 && <p className="database-message">No tables are available.</p>}
    </SidebarList>
  );
}
