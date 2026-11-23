import { useState } from "react";
import { useSelector } from "react-redux";
import Icon from "../../shared/icon/icon";
import builtinFunctionCatalog from "../builtin-function-catalog.json";
import {
  BuiltinFunctionEntry,
  EditableFunctionArgument,
  EditableFunctionDefinition,
  EditableFunctionTemplate,
  emptyFunctionArgument,
  emptyFunctionTemplate,
  functionArgumentDataTypes,
  functionResultDataTypes,
  functionApplyForValues,
  FunctionDatabaseType,
  FunctionResultDataType,
} from "../types";
import type { RootState } from "../../../store/store";
import "./function-detail.css";

type FunctionDetailProps = {
  draft: EditableFunctionDefinition | null;
  selectedName: string;
  canEdit: boolean;
  message: string;
  onDraftChange: (update: (current: EditableFunctionDefinition) => EditableFunctionDefinition) => void;
};

type FunctionExampleCardProps = {
  usage: BuiltinFunctionEntry;
};

function FunctionExampleCard({ usage }: FunctionExampleCardProps) {
  const [copied, setCopied] = useState(false);

  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(usage.example.oquery);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="function-example-card" aria-label="Function example">
      <header className="function-example-card-top">
        <div className="function-example-badges">
          <span className="function-example-badge category">{usage.category}</span>
          <span className="function-example-badge">Returns {usage.returns}</span>
        </div>
        <code className="function-example-signature">{usage.signature}</code>
      </header>
      <p className="function-example-description">{usage.description}</p>
      <div className="function-example-code">
        <div className="function-example-code-bar">
          <span>OQuery example</span>
          <button className="button secondary compact" type="button" onClick={copyExample}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre><code>{usage.example.oquery}</code></pre>
      </div>
      <p className="function-example-explanation">
        <strong>What it does</strong>
        {usage.example.explanation}
      </p>
      <details className="function-example-sql">
        <summary>SQL Server template</summary>
        <code>{usage.sqlServerTemplate}</code>
      </details>
    </section>
  );
}

export default function FunctionDetail({
  draft,
  selectedName,
  canEdit,
  message,
  onDraftChange,
}: FunctionDetailProps) {
  const providers = useSelector((state: RootState) => state.database.providers);
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
  const availableDatabaseTypes = providers.filter((databaseType) =>
    !usedDatabaseTypes.has(databaseType),
  );
  const usage = (builtinFunctionCatalog as BuiltinFunctionEntry[]).find((entry) => entry.name === selectedName);
  const origin = !selectedName ? "New" : canEdit ? "Custom" : "Built-in";
  const argumentCount = draft?.arguments.length ?? 0;
  const templateCount = draft?.sqlTemplateRows.length ?? 0;

  return (
    <div className="metadata-editor function-detail">
      <header className="function-detail-header" aria-label="Function definition details">
        <div className="function-detail-title">
          <span className="function-detail-icon" aria-hidden="true"><Icon name="function" size={18} /></span>
          <div className="function-detail-title-text">
            <div className="function-detail-name-row">
              <h3>{selectedName || (draft ? "New function" : "Select a function")}</h3>
              {draft && <span className={`function-origin-badge ${origin.toLowerCase()}`}>{origin}</span>}
            </div>
            {draft && (
              <p className="function-detail-meta">
                <span>{argumentCount} {argumentCount === 1 ? "argument" : "arguments"}</span>
                <span>Returns {draft.resultType}</span>
                <span>{templateCount} SQL {templateCount === 1 ? "template" : "templates"}</span>
              </p>
            )}
          </div>
        </div>
      </header>
      {!draft
        ? <div className="metadata-empty">
            <Icon name="function" size={32} />
            <p>{message || "Select a function to view its definition."}</p>
          </div>
        : <div className="function-detail-body">
          {message && <p className="metadata-alert" role="alert">{message}</p>}
          {usage && <FunctionExampleCard usage={usage} />}
          <fieldset className="function-form" disabled={!canEdit}>
        <section className="function-section" aria-labelledby="function-general-title">
          <h4 id="function-general-title" className="function-section-title">General</h4>
          <div className="function-general-grid">
            <label>
              Function name
              <input
                value={draft.name}
                onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. DATE_TRUNC"
              />
            </label>
            <label>
              Result type
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
          </div>
        </section>

        <section className="function-section" aria-labelledby="function-arguments-title">
          <div className="function-section-head">
            <div>
              <h4 id="function-arguments-title" className="function-section-title">Arguments</h4>
              <p className="function-section-hint">{argumentCount} defined. Placeholders in SQL templates refer to these names or positions.</p>
            </div>
            <button
              className="button primary compact"
              type="button"
              onClick={() => updateDraft((current) => ({
                ...current,
                arguments: [...current.arguments, emptyFunctionArgument()],
              }))}
            >
              <Icon name="plus" size={13} /> Add argument
            </button>
          </div>
          <div className="function-argument-table-wrap">
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
        </section>

        <section className="function-section" aria-labelledby="function-behavior-title">
          <h4 id="function-behavior-title" className="function-section-title">Behavior</h4>
        <div className="metadata-form-grid function-metadata-fields">
          <label className="function-description">
            Description
            <input
              value={draft.description}
              onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this function returns"
            />
          </label>
          <fieldset className="function-checkbox">
            <legend>Applies to</legend>
            {functionApplyForValues.map(({ value, label }) => (
              <label key={label}>
                <input
                  type="checkbox"
                  checked={(draft.applyFor & value) === value}

                  onChange={(event) => updateDraft((current) => ({
                    ...current,
                    applyFor: event.target.checked
                      ? current.applyFor | value
                      : current.applyFor & ~value,
                  }))}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
        </section>

        <section className="function-section editor-section" aria-labelledby="function-sql-title">
          <div className="editor-section-head">
            <div>
              <h3 id="function-sql-title">Raw SQL Template</h3>
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
                            {providers
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
        </div>}
    </div>
  );
}
