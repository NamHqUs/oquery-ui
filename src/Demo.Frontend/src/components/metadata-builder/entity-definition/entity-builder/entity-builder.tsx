import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../../icon/icon";
import { MetadataEntity } from "../../../query-builder/query-design/query-builder-slice";
import { EditableEntity } from "../../types";
import FieldsBuilder from "./fields-builder/fields-builder";
import RelationsBuilder from "./relations-builder/relations-builder";
import "./entity-builder.css";

type EntityBuilderProps = {
  draft: EditableEntity | null;
  canEdit: boolean;
  message: string;
  allEntities: MetadataEntity[];
  onDraftChange: (updater: (draft: EditableEntity) => EditableEntity) => void;
  databaseOptions?: string[];
  databaseTables?: DatabaseTableOption[];
  selectedTable?: DatabaseTableOption;
  onSelectTable?: (table: DatabaseTableOption) => void;
  compact?: boolean;
};

export type DatabaseTableOption = {
  schema: string;
  name: string;
  columns: { name: string; dataType?: string; isPrimaryKey?: boolean }[];
};

export default function EntityBuilder({
  draft,
  canEdit,
  message,
  allEntities,
  onDraftChange,
  databaseOptions = [],
  databaseTables = [],
  selectedTable,
  onSelectTable,
  compact = false,
}: EntityBuilderProps) {
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [showRawSql, setShowRawSql] = useState(false);
  const tablePickerRef = useRef<HTMLDivElement>(null);
  const filteredTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return databaseTables.filter((table) =>
      `${table.schema} ${table.name}`.toLowerCase().includes(query),
    );
  }, [databaseTables, tableSearch]);
  const selectedTableColumns = selectedTable?.columns ?? [];
  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      if (!tablePickerRef.current?.contains(event.target as Node)) {
        setTablePickerOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  return (
    <div className={`metadata-editor-content${compact ? " metadata-editor-compact" : ""}`}>
      {!draft
        ? <div className="metadata-empty">
            <Icon name="table" size={32} />
            <p>Select an entity to view or edit its metadata.</p>
          </div>
        : <>
          {message && (
            <p className="metadata-alert" role="alert">
              {message}
            </p>
          )}
          <div className="metadata-form">
            <fieldset className="metadata-form-fieldset" disabled={!canEdit}>
        <div className="metadata-form-grid">
        {onSelectTable && (
          <div
            ref={tablePickerRef}
            className={`metadata-table-picker${tablePickerOpen ? " open" : ""}`}
          >
            <label>
              Table
              <button
                type="button"
                className="metadata-table-picker-trigger"
                onClick={() => setTablePickerOpen((open) => !open)}
                aria-expanded={tablePickerOpen}
              >
                <span>
                  {selectedTable
                    ? `${selectedTable.schema || "dbo"}.${selectedTable.name}`
                    : "Select a table"}
                </span>
                <Icon name="chevron" size={14} />
              </button>
            </label>
            {tablePickerOpen && (
              <div
                className="metadata-table-picker-menu"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTablePickerOpen(false);
                  }
                }}
              >
                <input
                  autoFocus
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder="Select a table"
                  aria-label="Search database tables"
                />
                {filteredTables.map((table) => (
                  <button
                    type="button"
                    key={`${table.schema}.${table.name}`}
                    onClick={() => {
                      onSelectTable(table);
                      setTablePickerOpen(false);
                      setTableSearch("");
                    }}
                  >
                    <strong>{table.name}</strong>
                    <small>{table.schema || "Default schema"}</small>
                  </button>
                ))}
                {!filteredTables.length && <span className="metadata-table-picker-empty">No tables match your search.</span>}
              </div>
            )}
          </div>
        )}
          <label>
            Entity name
            <input
              value={draft.name}
              onChange={(event) =>
                onDraftChange((entity) => ({ ...entity, name: event.target.value }))
              }
              placeholder="e.g. Customers"
            />
          </label>
        </div>

        <FieldsBuilder
          fields={draft.fields}
          selectedTableColumns={selectedTableColumns}
          onChange={(fieldsUpdater) =>
            onDraftChange((entity) => ({
              ...entity,
              fields: fieldsUpdater(entity.fields),
            }))
          }
        />

        <RelationsBuilder
          relations={draft.relations}
          currentEntityName={draft.name}
          allEntities={allEntities}
          onChange={(relationsUpdater) =>
            onDraftChange((entity) => ({
              ...entity,
              relations: relationsUpdater(entity.relations),
            }))
          }
        />
            </fieldset>
            <div className="metadata-raw-sql-editor">
              {!showRawSql && (
                <button
                  type="button"
                  className="metadata-raw-sql-toggle"
                  onClick={() => setShowRawSql(true)}
                >
                  SQL Statement
                </button>
              )}
              {showRawSql && (
                <label>
                  SQL Statement
                  <textarea
                    autoFocus
                    rows={4}
                    value={draft.rawSql}
                    disabled={!canEdit}
                    onChange={(event) =>
                      onDraftChange((entity) => ({ ...entity, rawSql: event.target.value }))
                    }
                    onBlur={() => {
                      if (!draft.rawSql.trim()) setShowRawSql(false);
                    }}
                    placeholder="SELECT column1, column2 FROM table_name"
                  />
                </label>
              )}
            </div>
          </div>
        </>}
    </div>
  );
}
