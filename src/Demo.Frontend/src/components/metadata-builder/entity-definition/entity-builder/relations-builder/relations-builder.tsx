import { useEffect, useRef, useState } from "react";
import Icon from "../../../../icon/icon";
import { MetadataEntity } from "../../../../query-builder/query-design/query-builder-slice";
import { EditableEntity, EditableRelation, emptyRelation } from "../../../types";
import "./relations-builder.css";

type DatabaseTable = {
  schema: string;
  name: string;
  columns: { name: string }[];
};

type RelationsBuilderProps = {
  relations: EditableRelation[];
  currentEntity: EditableEntity;
  allEntities: MetadataEntity[];
  databaseTables: DatabaseTable[];
  selectedTable?: DatabaseTable;
  onChange: (updater: (relations: EditableRelation[]) => EditableRelation[]) => void;
};

export default function RelationsBuilder({
  relations,
  currentEntity,
  allEntities,
  databaseTables,
  selectedTable,
  onChange,
}: RelationsBuilderProps) {
  const [openEntityPicker, setOpenEntityPicker] = useState<number | null>(null);
  const entityPickerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      if (openEntityPicker !== null
        && !entityPickerRefs.current[openEntityPicker]?.contains(event.target as Node)) {
        setOpenEntityPicker(null);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [openEntityPicker]);

  function isRawSql(entity: MetadataEntity | EditableEntity) {
    return Boolean(entity.rawSql?.trim() && entity.rawSql.trim() !== entity.name.trim());
  }

  function columnsForEntity(entityName: string) {
    if (entityName === currentEntity.name) {
      if (isRawSql(currentEntity)) {
        return currentEntity.fields
          .map((field) => field.dbColumn?.trim() || field.name.trim())
          .filter(Boolean);
      }
      if (selectedTable) {
        return selectedTable.columns.map((column) => column.name);
      }
    }

    const entity = allEntities.find((candidate) => candidate.name === entityName);
    if (!entity) return [];
    if (isRawSql(entity)) {
      return entity.fields.map((field) => field.dbColumn?.trim() || field.name.trim()).filter(Boolean);
    }

    const table = databaseTables.find((candidate) =>
      candidate.name.trim().toLowerCase() === entity.name.trim().toLowerCase()
      && (!entity.schema || entity.schema === "dbo"
        || candidate.schema.trim().toLowerCase() === entity.schema.trim().toLowerCase()),
    );
    return table?.columns.map((column) => column.name) || [];
  }

  const currentColumns = columnsForEntity(currentEntity.name);

  function addRelation() {
    onChange((prev) => [...prev, emptyRelation()]);
  }

  function removeRelation(index: number) {
    onChange((prev) => prev.filter((_, relationIndex) => relationIndex !== index));
  }

  function updateRelation<Key extends keyof EditableRelation>(
    index: number,
    key: Key,
    value: EditableRelation[Key],
  ) {
    onChange((prev) =>
      prev.map((item, relationIndex) =>
        relationIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function addKeyMapping(relationIndex: number) {
    onChange((prev) =>
      prev.map((item, idx) =>
        idx === relationIndex
          ? {
              ...item,
              refKeys: [...item.refKeys, { dbColumn: "", refDbColumn: "" }],
            }
          : item,
      ),
    );
  }

  function removeKeyMapping(relationIndex: number, keyIndex: number) {
    onChange((prev) =>
      prev.map((item, idx) =>
        idx === relationIndex
          ? {
              ...item,
              refKeys: item.refKeys.filter((_, mapIdx) => mapIdx !== keyIndex),
            }
          : item,
      ),
    );
  }

  function updateKeyMapping(
    relationIndex: number,
    keyIndex: number,
    field: "dbColumn" | "refDbColumn",
    value: string,
  ) {
    onChange((prev) =>
      prev.map((item, idx) =>
        idx === relationIndex
          ? {
              ...item,
              refKeys: item.refKeys.map((mapping, mapIdx) =>
                mapIdx === keyIndex ? { ...mapping, [field]: value } : mapping,
              ),
            }
          : item,
      ),
    );
  }

  return (
    <div className="editor-section">
      <div className="editor-section-head">
        <div>
          <h3>Relations</h3>
        </div>
        <button
          className="button secondary compact relation-add-button"
          type="button"
          aria-label="Add relation"
          title="Add relation"
          onClick={addRelation}
        >
          <Icon name="plus" size={15} />
        </button>
      </div>

      {!relations.length
        ? <div className="section-empty">No relations defined.</div>
        : <div className="relation-editor-table">
            <div className="relation-editor-head" role="row">
              <span>Relation Name</span>
              <span>Reference Entity</span>
              <span>From DbColumn</span>
              <span>To DbColumn</span>
            </div>
            {relations.map((relation, index) => (
              <div className="relation-group" key={relation.id ?? index}>
                {relation.refKeys.map((key, keyIndex) => (
                  <div
                    className="relation-editor-row"
                    role="row"
                    key={keyIndex}
                  >
                    {keyIndex === 0
                      ? <div className="relation-name-cell">
                          <input
                            spellCheck={false}
                            value={relation.name}
                            onChange={(event) => updateRelation(index, "name", event.target.value)}
                            placeholder="Relation name"
                            aria-label="Relation name"
                          />
                          <button
                            className="icon-button subtle relation-remove"
                            type="button"
                            title="Remove relation"
                            onClick={() => removeRelation(index)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      : <span className="relation-cell-placeholder" aria-hidden="true" />}
                    {keyIndex === 0
                      ? <div
                          className={`relation-entity-picker${openEntityPicker === index ? " open" : ""}`}
                          ref={(element) => { entityPickerRefs.current[index] = element; }}
                        >
                          <button
                            className="relation-entity-picker-trigger"
                            type="button"
                            onClick={() => setOpenEntityPicker((current) => current === index ? null : index)}
                            aria-expanded={openEntityPicker === index}
                          >
                            <span>{relation.refEntity || "Select entity"}</span>
                            <Icon name="chevron" size={13} />
                          </button>
                          {openEntityPicker === index && (
                            <div className="relation-entity-picker-menu">
                              {allEntities
                                .filter((entity) => entity.name !== currentEntity.name)
                                .map((entity) => (
                                  <button
                                    type="button"
                                    key={entity.name}
                                    onClick={() => {
                                      updateRelation(index, "refEntity", entity.name);
                                      setOpenEntityPicker(null);
                                    }}
                                  >
                                    {entity.name}
                                  </button>
                                ))}
                              {!allEntities.some((entity) => entity.name !== currentEntity.name)
                                && <span className="relation-entity-picker-empty">No other entities available.</span>}
                            </div>
                          )}
                        </div>
                      : <span className="relation-cell-placeholder" aria-hidden="true" />}
                    <div className="relation-source-cell">
                      <select
                        value={key.dbColumn}
                        onChange={(event) =>
                          updateKeyMapping(index, keyIndex, "dbColumn", event.target.value)
                        }
                        aria-label={`Condition ${keyIndex + 1} source column`}
                      >
                        {currentColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                    </div>
                    <div className="relation-target-cell">
                      {relation.refEntity.trim() && <select
                          value={key.refDbColumn}
                          onChange={(event) =>
                            updateKeyMapping(index, keyIndex, "refDbColumn", event.target.value)
                          }
                          aria-label={`Condition ${keyIndex + 1} target column`}
                        >
                          {columnsForEntity(relation.refEntity).map((column) =>
                            <option key={column} value={column}>{column}</option>)}
                        </select>}
                      {relation.refEntity.trim() && keyIndex === relation.refKeys.length - 1 && <button
                        className="icon-button subtle relation-condition-add"
                        type="button"
                        title="Add condition"
                        aria-label="Add condition"
                        onClick={() => addKeyMapping(index)}
                      >
                        <Icon name="plus" size={14} />
                      </button>}
                      {keyIndex > 0 && <button
                        className="icon-button subtle"
                        type="button"
                        title="Remove condition"
                        onClick={() => removeKeyMapping(index, keyIndex)}
                      >
                        <Icon name="trash" size={12} />
                      </button>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>}
    </div>
  );
}
