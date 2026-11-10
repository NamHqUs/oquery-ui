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
  onSelectRawSql?: () => void;
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
  onSelectRawSql,
  compact = false,
}: EntityBuilderProps) {
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [showRawSql, setShowRawSql] = useState(false);
  const tablePickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rawSql = draft?.rawSql.trim() || "";
    const entityName = draft?.name.trim() || "";
    const selectedTableName = selectedTable?.name.trim() || "";
    setShowRawSql(Boolean(rawSql && !selectedTableName && rawSql !== entityName));
  }, [draft?.name, draft?.rawSql, selectedTable?.name]);

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
        <label>
          Entity name
          <input
            spellCheck={false}
            value={draft.name}
            onChange={(event) =>
              onDraftChange((entity) => ({ ...entity, name: event.target.value }))
            }
            placeholder="e.g. Customers"
          />
        </label>
        {showRawSql ? (
          <label className="metadata-raw-sql-field">
            <span className="metadata-raw-sql-label">
              <span>SQL Statement</span>
              <button
                type="button"
                className="metadata-raw-sql-mode-button"
                onClick={() => {
                  setShowRawSql(false);
                  onDraftChange((entity) => ({ ...entity, rawSql: "" }));
                }}
                aria-label="Switch to table selection"
                title="Switch to table selection"
              >
                <Icon name="table" size={14} />
              </button>
            </span>
            <textarea
              autoFocus
              rows={4}
              value={draft.rawSql}
              spellCheck={false}
              disabled={!canEdit}
              onChange={(event) =>
                onDraftChange((entity) => ({ ...entity, rawSql: event.target.value }))
              }
              placeholder="SELECT column1, column2 FROM table_name"
            />
          </label>
        ) : onSelectTable && (
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
                <button
                  type="button"
                  className="metadata-raw-sql-menu-item"
                  onClick={() => {
                    setShowRawSql(true);
                    onSelectRawSql?.();
                    setTablePickerOpen(false);
                  }}
                >
                  Raw SQL Statement
                </button>
                <input
                  autoFocus
                  spellCheck={false}
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
        </div>

        <FieldsBuilder
          fields={draft.fields}
          selectedTableColumns={selectedTableColumns}
          allowDataTypeEdit
          onChange={(fieldsUpdater) =>
            onDraftChange((entity) => ({
              ...entity,
              fields: fieldsUpdater(entity.fields),
            }))
          }
        />

        <RelationsBuilder
          relations={draft.relations}
          currentEntity={draft}
          allEntities={allEntities}
          databaseTables={databaseTables}
          selectedTable={selectedTable}
          onChange={(relationsUpdater) =>
            onDraftChange((entity) => ({
              ...entity,
              relations: relationsUpdater(entity.relations),
            }))
          }
        />
            </fieldset>
          </div>
        </>}
    </div>
  );
}
