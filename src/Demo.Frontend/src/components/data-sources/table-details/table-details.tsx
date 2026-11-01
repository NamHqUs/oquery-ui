import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../icon/icon";
import DataGrid from "../data-grid/data-grid";
import { fetchDbTableData, selectDbTable } from "../database-slice";
import "./table-details.css";

export default function TableDetails({ dataLoadingEnabled }: { dataLoadingEnabled: boolean }) {
  const dispatch = useDispatch();
  const { schema, selectedTable, selectedSchema, dataByTable } = useSelector((state) => state.database);
  const [activeTab, setActiveTab] = useState<"structure" | "data">("structure");
  const table = schema.tables.find((item) => item.name === selectedTable && item.schema === selectedSchema);
  const tableDataKey = selectedSchema ? `${selectedSchema}.${selectedTable}` : selectedTable;
  const tableData = dataByTable[tableDataKey];

  useEffect(() => {
    if (!dataLoadingEnabled || activeTab !== "data" || !table
      || tableData?.status === "succeeded" || tableData?.status === "loading") return;
    dispatch(fetchDbTableData({ tableName: selectedTable, schema: selectedSchema }));
  }, [activeTab, dataLoadingEnabled, dispatch, selectedSchema, selectedTable, table, tableData?.status]);

  if (!table) return null;

  const relations = schema.relationships.flatMap((relation) => {
    if (relation.sourceTable === table.name && relation.sourceSchema === table.schema) {
      return [{
        relation,
        currentColumns: relation.sourceColumns,
        otherColumns: relation.targetColumns,
        otherSchema: relation.targetSchema,
        otherTable: relation.targetTable,
      }];
    }
    if (relation.targetTable === table.name && relation.targetSchema === table.schema) {
      return [{
        relation,
        currentColumns: relation.targetColumns,
        otherColumns: relation.sourceColumns,
        otherSchema: relation.sourceSchema,
        otherTable: relation.sourceTable,
      }];
    }
    return [];
  });

  return (
    <section className="table-details" aria-label={`${table.name} table details`}>
      <div className="table-details-heading">
        <div className="table-details-title">
          <span className="section-kicker">TABLE DETAILS</span>
          <h3><span>{table.schema || "Default schema"}</span><Icon name="chevron" size={13} />{table.name}</h3>
        </div>
        <div className="table-details-summary">
          <span>{table.columns.length} columns</span>
          {tableData?.status === "loading"
            ? <span>Loading preview…</span>
            : tableData?.status === "succeeded" && <span>{tableData.rows.length} preview rows</span>}
        </div>
      </div>

      <section className="table-details-columns-section" aria-label="Table details">
        <div className="table-details-tabs" role="tablist" aria-label="Table details">
          <button
            type="button"
            id="table-details-structure-tab"
            role="tab"
            aria-selected={activeTab === "structure"}
            aria-controls="table-details-structure-panel"
            className={activeTab === "structure" ? "active" : ""}
            onClick={() => setActiveTab("structure")}
          >
            STRUCTURE
          </button>
          <button
            type="button"
            id="table-details-data-tab"
            role="tab"
            aria-selected={activeTab === "data"}
            aria-controls="table-details-data-panel"
            className={activeTab === "data" ? "active" : ""}
            onClick={() => setActiveTab("data")}
          >
            DATA
          </button>
        </div>
        <>
          <div
            className="table-details-tab-panel"
            id="table-details-structure-panel"
            role="tabpanel"
            aria-labelledby="table-details-structure-tab"
            hidden={activeTab !== "structure"}
            tabIndex={0}
          >
            <div className="table-details-column-head">
              <span>Column</span><span>Data type</span><span>Key</span><span>Nullable</span>
            </div>
            {table.columns.map((column, index) => (
              <div className={`table-details-column${index === table.columns.length - 1 ? " table-details-column-last" : ""}`} key={column.name}>
                <span className="table-details-column-name">{column.name}</span>
                <span className="table-details-column-type">{column.dataType || "—"}</span>
                <span>{column.isPrimaryKey ? <span className="table-details-key">PRIMARY</span> : "—"}</span>
                <span>{column.isNullable ? "YES" : "NO"}</span>
              </div>
            ))}
            {table.columns.length === 0 && <p className="database-message">No column metadata is available.</p>}
            <div className="table-details-subsection-heading">
              <span>Relations</span>
              <span>{relations.length}</span>
            </div>
            {relations.length > 0 ? (
              <div className="table-details-relations">
                <div className="table-details-relation table-details-relation-head">
                  <span>Column</span>
                  <span>Relation</span>
                  <span>Related column</span>
                  <span>Related Table</span>
                </div>
                {relations.map((relation) => (
                  <div className="table-details-relation" key={`${relation.relation.name}-${relation.otherSchema}-${relation.otherTable}`}>
                    <span className="table-details-current-column">{relation.currentColumns.join(", ")}</span>
                    <Icon name="link" size={16} />
                    <span className="table-details-other-column">{relation.otherColumns.join(", ")}</span>
                    <button
                      type="button"
                      onClick={() => dispatch(selectDbTable({ name: relation.otherTable, schema: relation.otherSchema }))}
                      title={`View ${relation.otherSchema ? `${relation.otherSchema}.` : ""}${relation.otherTable}`}
                    >
                      <Icon name="table" size={13} />
                      {relation.otherSchema ? `${relation.otherSchema}.` : ""}{relation.otherTable}
                      <Icon name="chevron" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : <p className="database-message">No table relations.</p>}
          </div>
          <div
            className="table-details-tab-panel table-details-data-panel"
            id="table-details-data-panel"
            role="tabpanel"
            aria-labelledby="table-details-data-tab"
            hidden={activeTab !== "data"}
            tabIndex={0}
          >
            <p className="table-details-data-note">Previewing up to 10 rows.</p>
            <DataGrid showHeading={false} />
          </div>
        </>
      </section>
    </section>
  );
}
