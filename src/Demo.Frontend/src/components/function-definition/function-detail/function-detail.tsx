import Icon from "../../icon/icon";
import {
  EditableFunctionArgument,
  EditableFunctionDefinition,
  EditableFunctionTemplate,
  emptyFunctionArgument,
  emptyFunctionTemplate,
  functionArgumentDataTypes,
  functionDatabaseTypes,
  functionResultDataTypes,
  FunctionDatabaseType,
  FunctionResultDataType,
} from "../types";
import DefinitionActions from "../../metadata-builder/definition-actions/definition-actions";
import type { DefinitionActionAdapter } from "../../metadata-builder/definition-actions/definition-actions";
import "./function-detail.css";

type FunctionDetailProps = {
  draft: EditableFunctionDefinition | null;
  selectedName: string;
  canEdit: boolean;
  message: string;
  actionAdapter: DefinitionActionAdapter;
  onDraftChange: (update: (current: EditableFunctionDefinition) => EditableFunctionDefinition) => void;
};

export default function FunctionDetail({
  draft,
  selectedName,
  canEdit,
  message,
  actionAdapter,
  onDraftChange,
}: FunctionDetailProps) {
  const updateDraft = (
    update: (current: EditableFunctionDefinition) => EditableFunctionDefinition,
  ) => onDraftChange(update);

  const updateArgument = (
    index: number,
    update: (argument: EditableFunctionArgument) => EditableFunctionArgument,
  ) => {
    updateDraft((current) => ({
      ...current,
      arguments: current.arguments.map((argument, argumentIndex) =>
        argumentIndex === index ? update(argument) : argument,
      ),
    }));
  };

  const updateTemplate = (
    index: number,
    update: (template: EditableFunctionTemplate) => EditableFunctionTemplate,
  ) => {
    updateDraft((current) => ({
      ...current,
      sqlTemplateRows: current.sqlTemplateRows.map((template, templateIndex) =>
        templateIndex === index ? update(template) : template,
      ),
    }));
  };

  const usedDatabaseTypes = new Set(draft?.sqlTemplateRows.map((template) => template.databaseType) || []);
  const availableDatabaseTypes = functionDatabaseTypes.filter((databaseType) =>
    !usedDatabaseTypes.has(databaseType),
  );

  return (
    <div className="metadata-editor">
      <div className="table-details-heading metadata-editor-heading">
        <div className="table-details-title">
          <span className="section-kicker">FUNCTION DEFINITION</span>
          <h3>{selectedName || (draft ? "New Function…" : "Select a function")}</h3>
        </div>
        <DefinitionActions adapter={actionAdapter} />
      </div>
      {!draft
        ? <div className="metadata-empty">
            <Icon name="function" size={32} />
            <p>{message || "Select a function to view its definition."}</p>
          </div>
        : <>
          {message && <p className="metadata-alert" role="alert">{message}</p>}
          <fieldset className="function-form" disabled={!canEdit}>
        <section className="function-signature" aria-label="Function signature">
          <label className="signature-name">
            Function Name
            <input
              value={draft.name}
              onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. DATE_TRUNC"
            />
          </label>
          <div className="signature-arguments">
            <span className="signature-paren">(</span>
            <div className="signature-argument-list">
              <div className="function-argument-table-wrap">
                <div className="function-argument-table-header">
                  <strong>Arguments</strong>
                  <button
                    className="button primary compact"
                    type="button"
                    onClick={() => updateDraft((current) => ({
                      ...current,
                      arguments: [...current.arguments, emptyFunctionArgument()],
                    }))}
                  >
                    <Icon name="plus" size={13} /> Argument
                  </button>
                </div>
                <table className="function-argument-table">
                  <thead>
                    <tr>
                      <th scope="col">Argument name</th>
                      <th scope="col">Data type</th>
                      <th scope="col">Default value (optional)</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.arguments.map((argument, index) => (
                      <tr key={argument.id}>
                        <td>
                          <input
                            aria-label={`Argument ${index + 1} name`}
                            value={argument.name}
                            onChange={(event) => updateArgument(index, (item) => ({ ...item, name: event.target.value }))}
                            placeholder="value"
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Argument ${index + 1} data type`}
                            value={argument.dataType}
                            onChange={(event) => updateArgument(index, (item) => ({
                              ...item,
                              dataType: event.target.value as EditableFunctionArgument["dataType"],
                            }))}
                          >
                            {functionArgumentDataTypes.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Argument ${index + 1} default value (optional)`}
                            value={argument.defaultValueText}
                            onChange={(event) => updateArgument(index, (item) => ({
                              ...item,
                              defaultValueText: event.target.value,
                            }))}
                            placeholder={argument.dataType === "Number" ? "e.g. 0 or *" : "e.g. *"}
                          />
                        </td>
                        <td>
                          <button
                            className="icon-button subtle"
                            type="button"
                            title={`Remove ${argument.name || `argument ${index + 1}`}`}
                            aria-label={`Remove ${argument.name || `argument ${index + 1}`}`}
                            onClick={() => updateDraft((current) => ({
                              ...current,
                              arguments: current.arguments.filter((_, itemIndex) => itemIndex !== index),
                            }))}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <span className="signature-paren">)</span>
          </div>
          <span className="signature-arrow" aria-hidden="true">→</span>
          <label className="signature-result">
            Result Type
            <select
              value={draft.resultType}
              onChange={(event) => updateDraft((current) => ({
                ...current,
                resultType: event.target.value as FunctionResultDataType,
              }))}
            >
              {functionResultDataTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
        </section>

        <div className="metadata-form-grid function-metadata-fields">
          <label className="function-description">
            Description
            <input
              value={draft.description}
              onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this function returns"
            />
          </label>
          <label className="function-checkbox">
            <input
              type="checkbox"
              checked={draft.isAggregate}
              onChange={(event) => updateDraft((current) => ({ ...current, isAggregate: event.target.checked }))}
            />
            Aggregate function
          </label>
        </div>

        <section className="editor-section">
          <div className="editor-section-head">
            <div>
              <h3>Raw SQL Template</h3>
              <p>Use argument names or positions such as {"{value}"} or {"{1}"} as placeholders.</p>
            </div>
            <button
              className="button secondary compact"
              type="button"
              onClick={() => updateDraft((current) => ({
                ...current,
                sqlTemplateRows: [
                  ...current.sqlTemplateRows,
                  emptyFunctionTemplate(availableDatabaseTypes[0]),
                ],
              }))}
              disabled={!availableDatabaseTypes.length}
            >
              <Icon name="plus" size={13} /> Database type
            </button>
          </div>
          <div className="function-template-table-wrap">
            <table className="function-template-table">
              <thead>
                <tr>
                  <th scope="col">Database Type</th>
                  <th scope="col">Raw SQL Template</th>
                </tr>
              </thead>
              <tbody>
                {draft.sqlTemplateRows.map((template, index) => {
                  const otherDatabaseTypes = new Set(
                    draft.sqlTemplateRows
                      .filter((_, rowIndex) => rowIndex !== index)
                      .map((row) => row.databaseType),
                  );
                  return (
                    <tr key={template.id}>
                      <td>
                        <div className="template-dialect-control">
                          <select
                            aria-label={`Database type for template ${index + 1}`}
                            value={template.databaseType}
                            onChange={(event) => updateTemplate(index, (row) => ({
                              ...row,
                              databaseType: event.target.value as FunctionDatabaseType,
                            }))}
                          >
                            {functionDatabaseTypes
                              .filter((databaseType) =>
                                databaseType === template.databaseType || !otherDatabaseTypes.has(databaseType),
                              )
                              .map((databaseType) => (
                                <option key={databaseType} value={databaseType}>{databaseType}</option>
                              ))}
                          </select>
                          <button
                            className="icon-button subtle"
                            type="button"
                            title={`Remove ${template.databaseType} template`}
                            aria-label={`Remove ${template.databaseType} template`}
                            onClick={() => updateDraft((current) => ({
                              ...current,
                              sqlTemplateRows: current.sqlTemplateRows.filter((_, rowIndex) => rowIndex !== index),
                            }))}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          aria-label={`Raw SQL template for ${template.databaseType}`}
                          value={template.rawSqlTemplate}
                          onChange={(event) => updateTemplate(index, (row) => ({
                            ...row,
                            rawSqlTemplate: event.target.value,
                          }))}
                          placeholder="LOWER({value})"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
          </fieldset>
        </>}
    </div>
  );
}
