import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../shared/icon/icon";
import SidebarList from "../../shared/sidebar-list/sidebar-list";
import { useKeepSelectedInView } from "../../../utils/use-keep-selected-in-view";
import { selectDbTable } from "../database-slice";
import "./table-list.css";

type TableListProps = {
  scrollStyle?: CSSProperties;
};

export default function TableList({ scrollStyle }: TableListProps) {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const { schema, selectedTable, selectedSchema, schemaStatus, schemaError, debugUiEnabled } = useSelector((state) => state.database);
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
    schemaStatus,
    schemaError,
    searchQuery,
    filteredTables,
    scrollStyle,
  ]);

  useKeepSelectedInView(tableListRef, ".database-table-item[aria-current='page']", [searchQuery, selectedSchema, selectedTable]);

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
        {schemaStatus === "loading" && <p className="database-message">Loading tables…</p>}
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
