import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../../../icon/icon";
import { MetadataEntity, relationsForEntity, type DomainRelation, type EntityRelationView } from "../../../../query-builder/query-design/query-builder-slice";
import { EditableEntity, pluralize, singularize, updateRelationSide } from "../../../types";
import "./relations-builder.css";

type DatabaseTable = {
  schema: string;
  name: string;
  columns: { name: string }[];
};

type PickerState = {
  index: number;
  left: number;
  width: number;
  anchorY: number;
  flipUp: boolean;
};

const pickerMenuMaxHeight = 240;

type RelationsBuilderProps = {
  domainRelations: DomainRelation[];
  currentEntity: EditableEntity;
  allEntities: MetadataEntity[];
  databaseTables: DatabaseTable[];
  selectedTable?: DatabaseTable;
  onRelationsChange: (updater: (relations: DomainRelation[]) => DomainRelation[]) => void;
};

export default function RelationsBuilder({
  domainRelations,
  currentEntity,
  allEntities,
  databaseTables,
  selectedTable,
  onRelationsChange,
}: RelationsBuilderProps) {
  const relations = relationsForEntity(currentEntity.name, domainRelations);
  const [openEntityPicker, setOpenEntityPicker] = useState<PickerState | null>(null);
  const pickerTriggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const pickerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openEntityPicker) return;
    const openIndex = openEntityPicker.index;

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (pickerMenuRef.current?.contains(target) || pickerTriggerRefs.current[openIndex]?.contains(target)) return;
      setOpenEntityPicker(null);
    }
    function closeOnScroll(event: Event) {
      if (pickerMenuRef.current?.contains(event.target as Node)) return;
      setOpenEntityPicker(null);
    }
    function closeOnResize() {
      setOpenEntityPicker(null);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
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

  function keyPairsOf(relation: { fromFields: string[]; toFields: string[] }) {
    return relation.fromFields.map((dbColumn, keyIndex) => ({
      dbColumn,
      refDbColumn: relation.toFields[keyIndex] ?? "",
    }));
  }

  function addRelation() {
    onRelationsChange((prev) => [
      ...prev,
      {
        sourceEntity: currentEntity.name,
        sourceRelationName: "",
        sourceFields: [""],
        targetEntity: "",
        targetRelationName: "",
        targetFields: [""],
      },
    ]);
  }

  function oppositeSide(side: "source" | "target") {
    return side === "source" ? "target" : "source";
  }

  function nameOnSide(relation: DomainRelation, side: "source" | "target") {
    return side === "source" ? relation.sourceRelationName : relation.targetRelationName;
  }

  function updateRelationAt(
    viewIndex: number,
    update: (relation: DomainRelation, view: EntityRelationView) => DomainRelation,
  ) {
    const view = relations[viewIndex];
    if (!view) return;
    onRelationsChange((prev) =>
      prev.map((relation, relationIndex) => relationIndex === view.relationIndex ? update(relation, view) : relation),
    );
  }

  function removeRelation(viewIndex: number) {
    const view = relations[viewIndex];
    if (!view) return;
    setOpenEntityPicker(null);
    onRelationsChange((prev) => prev.filter((_, relationIndex) => relationIndex !== view.relationIndex));
  }

  // Picking the other entity also fills empty names on both sides, so a relation is complete after one edit.
  function selectReferenceEntity(viewIndex: number, entityName: string) {
    const view = relations[viewIndex];
    setOpenEntityPicker(null);
    if (!view || view.refEntity === entityName) return;
    updateRelationAt(viewIndex, (relation) => {
      const otherSide = oppositeSide(view.side);
      const thisName = view.name.trim() ? view.name : singularize(entityName);
      const otherName = nameOnSide(relation, otherSide).trim()
        ? nameOnSide(relation, otherSide)
        : currentEntity.name.trim() ? pluralize(currentEntity.name.trim()) : "";
      const withEntity = updateRelationSide(relation, view.side, {
        name: thisName,
        refEntity: entityName,
        toFields: view.fromFields.map(() => ""),
      });
      return updateRelationSide(withEntity, otherSide, { name: otherName });
    });
  }

  function renameThisSide(viewIndex: number, name: string) {
    updateRelationAt(viewIndex, (relation, view) => updateRelationSide(relation, view.side, { name }));
  }

  function renameOtherSide(viewIndex: number, name: string) {
    updateRelationAt(viewIndex, (relation, view) => updateRelationSide(relation, oppositeSide(view.side), { name }));
  }

  function setKeyPairs(viewIndex: number, fromFields: string[], toFields: string[]) {
    updateRelationAt(viewIndex, (relation, view) => updateRelationSide(relation, view.side, { fromFields, toFields }));
  }

  function addKeyPair(viewIndex: number) {
    const view = relations[viewIndex];
    if (!view) return;
    setKeyPairs(viewIndex, [...view.fromFields, ""], [...view.toFields, ""]);
  }

  function removeKeyPair(viewIndex: number, keyIndex: number) {
    const view = relations[viewIndex];
    if (!view) return;
    setKeyPairs(
      viewIndex,
      view.fromFields.filter((_, mapIdx) => mapIdx !== keyIndex),
      view.toFields.filter((_, mapIdx) => mapIdx !== keyIndex),
    );
  }

  function updateKeyPair(
    viewIndex: number,
    keyIndex: number,
    field: "dbColumn" | "refDbColumn",
    value: string,
  ) {
    const view = relations[viewIndex];
    if (!view) return;
    const replaceAt = (items: string[]) => items.map((item, mapIdx) => mapIdx === keyIndex ? value : item);
    setKeyPairs(
      viewIndex,
      field === "dbColumn" ? replaceAt(view.fromFields) : view.fromFields,
      field === "refDbColumn" ? replaceAt(view.toFields) : view.toFields,
    );
  }

  const availableEntities = allEntities;
  const thisLabel = currentEntity.name.trim() || "this entity";

  function togglePicker(index: number, trigger: HTMLButtonElement) {
    const rect = trigger.getBoundingClientRect();
    const flipUp = rect.bottom + pickerMenuMaxHeight + 4 > window.innerHeight;
    setOpenEntityPicker((current) => current?.index === index ? null : {
      index,
      left: rect.left,
      width: Math.max(rect.width, 200),
      anchorY: flipUp ? rect.top : rect.bottom,
      flipUp,
    });
  }

  const pickerMenu = openEntityPicker && createPortal(
    <div
      ref={pickerMenuRef}
      className="relation-entity-picker-menu"
      style={{
        left: openEntityPicker.left,
        width: openEntityPicker.width,
        ...(openEntityPicker.flipUp
          ? { bottom: window.innerHeight - openEntityPicker.anchorY + 4 }
          : { top: openEntityPicker.anchorY + 4 }),
      }}
    >
      {availableEntities.map((entity) => (
        <button
          type="button"
          key={entity.name}
          onClick={() => selectReferenceEntity(openEntityPicker.index, entity.name)}
        >
          {entity.name}
        </button>
      ))}
      {!availableEntities.length && <span className="relation-entity-picker-empty">No entities available.</span>}
    </div>,
    document.body,
  );

  return (
    <div className="editor-section relation-section">
      <div className="editor-section-head">
        <div>
          <h3>Relations</h3>
          <p>Shared by both entities. Each side names how it reaches the other; key columns link the rows.</p>
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
        ? <div className="section-empty">No relations defined. Use + to link {thisLabel} to another entity.</div>
        : <div className="relation-table-scroll">
            <table className="relation-table">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col className="relation-col-key" />
                <col className="relation-col-remove" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" title={`How ${thisLabel} refers to the related entity`}>Name in {thisLabel}</th>
                  <th scope="col">Related entity</th>
                  <th scope="col" title="How the related entity refers back to this entity">Name in related entity</th>
                  <th scope="col">{thisLabel} column</th>
                  <th scope="col">Related column</th>
                  <th scope="col" aria-label="Key actions" />
                  <th scope="col" aria-label="Remove relation" />
                </tr>
              </thead>
              <tbody>
                {relations.flatMap((view, index) => {
                  const pairs = keyPairsOf(view).length ? keyPairsOf(view) : [{ dbColumn: "", refDbColumn: "" }];
                  const hasReference = Boolean(view.refEntity.trim());
                  const referenceColumns = columnsForEntity(view.refEntity);
                  const otherName = nameOnSide(domainRelations[view.relationIndex], oppositeSide(view.side));
                  const pickerOpen = openEntityPicker?.index === index;
                  return pairs.map((key, keyIndex) => {
                    const isFirst = keyIndex === 0;
                    const isLast = keyIndex === pairs.length - 1;
                    return (
                      <tr
                        key={`${view.relationIndex}-${view.side}-${keyIndex}`}
                        className={isFirst ? "relation-row relation-row-start" : "relation-row"}
                      >
                        {isFirst && <>
                          <td rowSpan={pairs.length}>
                            <input
                              className="relation-field"
                              spellCheck={false}
                              value={view.name}
                              onChange={(event) => renameThisSide(index, event.target.value)}
                              placeholder="e.g. Customer"
                              aria-label={`Name in ${thisLabel}`}
                            />
                          </td>
                          <td rowSpan={pairs.length}>
                            <button
                              ref={(element) => { pickerTriggerRefs.current[index] = element; }}
                              className={`relation-entity-picker-trigger${pickerOpen ? " open" : ""}`}
                              type="button"
                              onClick={(event) => togglePicker(index, event.currentTarget)}
                              aria-expanded={pickerOpen}
                              aria-label="Related entity"
                            >
                              <span>{view.refEntity || "Select entity"}</span>
                              <Icon name="chevron" size={13} />
                            </button>
                          </td>
                          <td rowSpan={pairs.length}>
                            <input
                              className="relation-field"
                              spellCheck={false}
                              value={otherName}
                              onChange={(event) => renameOtherSide(index, event.target.value)}
                              placeholder="e.g. Orders"
                              aria-label="Name in related entity"
                            />
                          </td>
                        </>}
                        <td>
                          <select
                            className="relation-field relation-column-picker"
                            value={key.dbColumn}
                            onChange={(event) => updateKeyPair(index, keyIndex, "dbColumn", event.target.value)}
                            aria-label={`${thisLabel} column, key ${keyIndex + 1}`}
                          >
                            <option value="">Select column</option>
                            {currentColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                          </select>
                        </td>
                        <td>
                          <div className="relation-select-wrapper">
                            <select
                            className="relation-field relation-column-picker"
                              value={key.refDbColumn}
                              disabled={!hasReference}
                              onChange={(event) => updateKeyPair(index, keyIndex, "refDbColumn", event.target.value)}
                              aria-label={`Related column, key ${keyIndex + 1}`}
                            >
                              <option value="">Select column</option>
                              {referenceColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                            </select>
                            <Icon name="chevron-down" size={13} />
                          </div>
                        </td>
                        <td>
                          <div className="relation-key-actions">
                            {view.fromFields.length > 1 && <button
                              className="icon-button subtle"
                              type="button"
                              title="Remove key"
                              aria-label="Remove key"
                              onClick={() => removeKeyPair(index, keyIndex)}
                            >
                              <Icon name="trash" size={12} />
                            </button>}
                            {isLast && hasReference && <button
                              className="icon-button subtle"
                              type="button"
                              title="Add key"
                              aria-label="Add key"
                              onClick={() => addKeyPair(index)}
                            >
                              <Icon name="plus" size={12} />
                            </button>}
                          </div>
                        </td>
                        {isFirst && <td rowSpan={pairs.length} className="relation-remove-cell">
                          <button
                            className="icon-button subtle relation-remove"
                            type="button"
                            title="Remove relation"
                            aria-label="Remove relation"
                            onClick={() => removeRelation(index)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </td>}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>}
      {pickerMenu}
    </div>
  );
}
