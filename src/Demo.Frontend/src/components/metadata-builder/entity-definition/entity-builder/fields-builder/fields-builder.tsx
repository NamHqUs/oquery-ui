import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon, { IconName } from "../../../../icon/icon";
import { EditableEntity, emptyField, toAbstractDataType } from "../../../types";
import "./fields-builder.css";

const dataTypes = ["String", "Number", "Boolean", "Datetime"];
const dataTypeIcons: Record<string, IconName> = {
  String: "type",
  Number: "type-number",
  Boolean: "type-boolean",
  Datetime: "type-datetime",
};

function getDataTypeIcon(dataType: string) {
  const normalized = dataType.trim().toLowerCase();
  if (normalized === "number" || normalized === "numeric") return dataTypeIcons.Number;
  if (normalized === "boolean" || normalized === "bool" || normalized === "bit") return dataTypeIcons.Boolean;
  if (normalized === "datetime" || normalized === "datetime2" || normalized === "date" || normalized === "time" || normalized === "timestamp") {
    return dataTypeIcons.Datetime;
  }
  return dataTypeIcons[normalized === "string" ? "String" : dataType] || dataTypeIcons.String;
}

type FieldsBuilderProps = {
  fields: EditableEntity["fields"];
  selectedTableColumns: { name: string; dataType?: string }[];
  onChange: (updater: (fields: EditableEntity["fields"]) => EditableEntity["fields"]) => void;
};

export default function FieldsBuilder({ fields, selectedTableColumns, onChange }: FieldsBuilderProps) {
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
  const [dropTargetFieldIndex, setDropTargetFieldIndex] = useState<number | null>(null);
  const [openDataTypeIndex, setOpenDataTypeIndex] = useState<number | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [selectedColumnNames, setSelectedColumnNames] = useState<string[]>([]);
  const [columnMenuPosition, setColumnMenuPosition] = useState({ top: 0, left: 0 });
  const schemaButtonRef = useRef<HTMLButtonElement>(null);
  const schemaMenuRef = useRef<HTMLDivElement>(null);
  const columnsByName = new Map(selectedTableColumns.map((column) => [column.name.trim().toLowerCase(), column]));
  const existingFieldColumns = new Set(fields.map(getColumnName).filter(Boolean));
  const availableSchemaColumns = selectedTableColumns.filter((column) =>
    !existingFieldColumns.has(column.name.trim().toLowerCase()),
  );

  function getColumnName(field: EditableEntity["fields"][number]) {
    return (field.dbColumn?.trim() || field.name.trim()).toLowerCase();
  }

  function isRawSql(field: EditableEntity["fields"][number]) {
    if (!selectedTableColumns.length) {
      return field.isRawSql ?? false;
    }
    const column = getColumnName(field);
    return column ? !columnsByName.has(column) : field.isRawSql ?? false;
  }

  function getDatabaseColumn(field: EditableEntity["fields"][number]) {
    return columnsByName.get(getColumnName(field));
  }

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Element;
      if (!target.closest(".field-data-type-picker")) {
        setOpenDataTypeIndex(null);
      }
      if (
        !schemaMenuRef.current?.contains(target)
        && !schemaButtonRef.current?.contains(target)
      ) {
        setColumnPickerOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  function moveField(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= fields.length || toIndex >= fields.length) {
      return;
    }
    onChange((prevFields) => {
      const nextFields = [...prevFields];
      const [moved] = nextFields.splice(fromIndex, 1);
      nextFields.splice(toIndex, 0, moved);
      return nextFields;
    });
  }

  function updateField(index: number, update: (field: EditableEntity["fields"][number]) => EditableEntity["fields"][number]) {
    onChange((prevFields) =>
      prevFields.map((field, fieldIndex) =>
        fieldIndex === index ? update(field) : field,
      ),
    );
  }

  function addRawSqlField() {
    onChange((prevFields) => [...prevFields, { ...emptyField(), isRawSql: true }]);
  }

  function closeColumnPicker() {
    setColumnPickerOpen(false);
    setSelectedColumnNames([]);
  }

  function addSchemaFields() {
    const selectedColumns = availableSchemaColumns.filter((column) =>
      selectedColumnNames.includes(column.name),
    );
    onChange((prevFields) => [
      ...prevFields,
      ...selectedColumns
        .map((column) => ({
          ...emptyField(),
          name: column.name,
          dbColumn: column.name,
          dataType: toAbstractDataType(column.dataType, column.name),
          isRawSql: false,
        })),
    ]);
    setColumnPickerOpen(false);
    setSelectedColumnNames([]);
  }

  function removeField(index: number) {
    onChange((prevFields) => prevFields.filter((_, fieldIndex) => fieldIndex !== index));
  }

  return (
    <div className="editor-section">
      <div className="editor-section-head">
        <div>
          <h3>Fields</h3>
        </div>
        <div className="field-actions">
          {availableSchemaColumns.length > 0 && (
            <div className="schema-column-picker">
              <button
                ref={schemaButtonRef}
                className="button secondary compact add-field-button"
                type="button"
                aria-label="Add fields from schema"
                title="Add fields from schema"
                aria-haspopup="dialog"
                aria-expanded={columnPickerOpen}
                onClick={() => {
                  setSelectedColumnNames([]);
                  if (!columnPickerOpen && schemaButtonRef.current) {
                    const bounds = schemaButtonRef.current.getBoundingClientRect();
                    setColumnMenuPosition({ top: bounds.bottom + 6, left: bounds.left });
                  }
                  setColumnPickerOpen((open) => !open);
                }}
              >
                <Icon name="database" size={15} />
              </button>
              {columnPickerOpen && createPortal(
                <div
                  ref={schemaMenuRef}
                  className="schema-column-menu"
                  role="dialog"
                  aria-label="Select database columns"
                  style={{ top: columnMenuPosition.top, left: columnMenuPosition.left }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                <div className="schema-column-menu-head">
                  <strong>Database columns</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedColumnNames(
                      selectedColumnNames.length === availableSchemaColumns.length
                        ? []
                        : availableSchemaColumns.map((column) => column.name),
                    )}
                  >
                    {selectedColumnNames.length === availableSchemaColumns.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="schema-column-list">
                  {availableSchemaColumns.map((column) => (
                    <label key={column.name}>
                      <input
                        type="checkbox"
                        checked={selectedColumnNames.includes(column.name)}
                        onChange={() => setSelectedColumnNames((current) =>
                          current.includes(column.name)
                            ? current.filter((name) => name !== column.name)
                            : [...current, column.name],
                        )}
                      />
                      <span>{column.name}</span>
                      <small>{toAbstractDataType(column.dataType, column.name)}</small>
                    </label>
                  ))}
                </div>
                <div className="schema-column-actions">
                  <button
                    className="schema-column-cancel"
                    type="button"
                    onClick={closeColumnPicker}
                  >
                    Cancel
                  </button>
                  <button
                    className="schema-column-apply"
                    type="button"
                    disabled={!selectedColumnNames.length}
                    onClick={addSchemaFields}
                  >
                    Add selected
                  </button>
                </div>
                </div>,
                document.body,
              )}
            </div>
          )}
          <button
            className="button secondary compact add-field-button"
            type="button"
            aria-label="Add raw SQL field"
            title="Add raw SQL field"
            onClick={addRawSqlField}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>
      <div className="field-editor-table">
        <div className="field-editor-head">
          <span className="drag-handle-col" />
          <span>Name</span>
          <span>Column</span>
          <span>DataType</span>
          <span />
        </div>
        {fields.map((field, index) => (
          <div
            className={`field-editor-row${draggedFieldIndex === index ? " dragging" : ""}${dropTargetFieldIndex === index ? " drop-target" : ""}`}
            key={field.id ?? index}
            onDragOver={(event) => {
              if (draggedFieldIndex !== null && draggedFieldIndex !== index) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTargetFieldIndex(index);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const rawIndex =
                event.dataTransfer.getData("application/x-field-index") ||
                event.dataTransfer.getData("text/plain");
              const sourceIndex = rawIndex !== "" ? Number(rawIndex) : draggedFieldIndex;
              if (sourceIndex !== null && !Number.isNaN(sourceIndex) && sourceIndex !== index) {
                moveField(sourceIndex, index);
              }
              setDraggedFieldIndex(null);
              setDropTargetFieldIndex(null);
            }}
          >
            <span
              className="field-row-drag-handle"
              draggable
              title="Drag to reorder"
              aria-label="Drag to reorder"
              onDragStart={(event) => {
                setDraggedFieldIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
                event.dataTransfer.setData("application/x-field-index", String(index));
              }}
              onDragEnd={() => {
                setDraggedFieldIndex(null);
                setDropTargetFieldIndex(null);
              }}
            >
              <svg
                className="icon"
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="5" r="1" fill="currentColor" />
                <circle cx="9" cy="12" r="1" fill="currentColor" />
                <circle cx="9" cy="19" r="1" fill="currentColor" />
                <circle cx="15" cy="5" r="1" fill="currentColor" />
                <circle cx="15" cy="12" r="1" fill="currentColor" />
                <circle cx="15" cy="19" r="1" fill="currentColor" />
              </svg>
            </span>
            <input
              value={field.name}
              onChange={(event) => updateField(index, (current) => ({ ...current, name: event.target.value }))}
              placeholder="Field name"
            />
            <div className="field-source-cell">
              <input
                value={field.dbColumn ?? ""}
                onChange={(event) => {
                  const dbColumn = event.target.value;
                  updateField(index, (current) => ({
                    ...current,
                    dbColumn,
                    isRawSql: Boolean(dbColumn.trim() || current.name.trim())
                      && !columnsByName.has((dbColumn.trim() || current.name.trim()).toLowerCase()),
                    dataType: columnsByName.has((dbColumn.trim() || current.name.trim()).toLowerCase())
                      ? toAbstractDataType(
                          columnsByName.get((dbColumn.trim() || current.name.trim()).toLowerCase())?.dataType,
                          current.name,
                        )
                      : current.dataType,
                  }));
                }}
                placeholder={isRawSql(field) ? "SQL expression" : field.name || "Column name"}
              />
            </div>
            {isRawSql(field)
              ? <div className="field-data-type-picker">
                  <button
                    className="field-data-type-trigger"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openDataTypeIndex === index}
                    aria-label={`Data type: ${field.dataType || "String"}`}
                    title={field.dataType || "String"}
                    onClick={() => setOpenDataTypeIndex((current) => current === index ? null : index)}
                  >
                    <Icon name={getDataTypeIcon(field.dataType || "String")} size={12} />
                    <Icon name="chevron-down" size={12} />
                  </button>
                  {openDataTypeIndex === index && (
                    <div className="field-data-type-menu" role="listbox" aria-label="Data type">
                      {dataTypes.map((dataType) => (
                        <button
                          className="field-data-type-option"
                          type="button"
                          role="option"
                          aria-selected={field.dataType === dataType}
                          key={dataType}
                          onClick={() => {
                            updateField(index, (current) => ({ ...current, dataType }));
                            setOpenDataTypeIndex(null);
                          }}
                        >
                          <Icon name={getDataTypeIcon(dataType)} size={12} />
                          <span>{dataType}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              : <span
                  className="field-data-type"
                  title={toAbstractDataType(getDatabaseColumn(field)?.dataType || field.dataType, field.name)}
                  aria-label={toAbstractDataType(getDatabaseColumn(field)?.dataType || field.dataType, field.name)}
                >
                  <Icon name={getDataTypeIcon(toAbstractDataType(getDatabaseColumn(field)?.dataType || field.dataType, field.name))} size={14} />
                </span>}
            <button
              className="icon-button subtle"
              type="button"
              title="Remove field"
              disabled={fields.length === 1}
              onClick={() => removeField(index)}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
