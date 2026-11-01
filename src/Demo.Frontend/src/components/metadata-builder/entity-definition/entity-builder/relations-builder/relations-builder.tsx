import Icon from "../../../../icon/icon";
import { MetadataEntity } from "../../../../query-builder/query-design/query-builder-slice";
import { EditableRelation, emptyRelation } from "../../../types";
import "./relations-builder.css";

type RelationsBuilderProps = {
  relations: EditableRelation[];
  currentEntityName: string;
  allEntities: MetadataEntity[];
  onChange: (updater: (relations: EditableRelation[]) => EditableRelation[]) => void;
};

export default function RelationsBuilder({
  relations,
  currentEntityName,
  allEntities,
  onChange,
}: RelationsBuilderProps) {
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
              relatedKeys: [...item.relatedKeys, { fromDbColumn: "", toDbColumn: "" }],
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
              relatedKeys: item.relatedKeys.filter((_, mapIdx) => mapIdx !== keyIndex),
            }
          : item,
      ),
    );
  }

  function updateKeyMapping(
    relationIndex: number,
    keyIndex: number,
    field: "fromDbColumn" | "toDbColumn",
    value: string,
  ) {
    onChange((prev) =>
      prev.map((item, idx) =>
        idx === relationIndex
          ? {
              ...item,
              relatedKeys: item.relatedKeys.map((mapping, mapIdx) =>
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
          <p>Connect this entity to another entity through key mappings.</p>
        </div>
      </div>

      {!relations.length && <div className="section-empty">No relations defined.</div>}

      {relations.map((relation, index) => (
        <div className="relation-card" key={relation.id ?? index}>
          <div className="relation-main">
            <input
              value={relation.name}
              onChange={(event) => updateRelation(index, "name", event.target.value)}
              placeholder="Relation name"
            />
            <select
              value={relation.relatedEntity}
              onChange={(event) => updateRelation(index, "relatedEntity", event.target.value)}
            >
              <option value="">Related entity</option>
              {allEntities
                .filter((entity) => entity.name !== currentEntityName)
                .map((entity) => (
                  <option key={entity.name}>{entity.name}</option>
                ))}
            </select>
            <span className="relation-key-label">Reference keys</span>
            <button
              className="icon-button subtle"
              type="button"
              title="Remove relation"
              onClick={() => removeRelation(index)}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>

          <div className="key-mappings">
            {relation.relatedKeys.map((key, keyIndex) => (
              <div className="key-row" key={keyIndex}>
                <input
                  value={key.fromDbColumn}
                  onChange={(event) =>
                    updateKeyMapping(index, keyIndex, "fromDbColumn", event.target.value)
                  }
                  placeholder="Source column"
                />
                <span>→</span>
                <input
                  value={key.toDbColumn}
                  onChange={(event) =>
                    updateKeyMapping(index, keyIndex, "toDbColumn", event.target.value)
                  }
                  placeholder="Target column"
                />
                <button
                  className="icon-button subtle"
                  type="button"
                  title="Remove mapping"
                  disabled={relation.relatedKeys.length === 1}
                  onClick={() => removeKeyMapping(index, keyIndex)}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
            <button
              className="add-key"
              type="button"
              onClick={() => addKeyMapping(index)}
            >
              <Icon name="plus" size={12} /><span className="action-link-text">Add key pair</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
