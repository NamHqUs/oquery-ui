import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type FocusEventHandler, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { FunctionDefinition } from "../function-definition/types";
import type { DomainRelation, FilterOperatorDefinition, MetadataEntity } from "../query-builder/query-design/query-builder-slice";
import { getOQueryContextKeys } from "../query-builder/query-design/oquery-context-colors";
import "../query-builder/query-design/query-design.css";
import { getOQueryCompletions, type OQuerySuggestionEntity } from "./oquery-completions";
import { getOqueryEnterEdit } from "./oquery-editor-enter";
import { normalizeOqueryEditorText } from "./oquery-editor-text";
import { getMinimalTextEdit, getOqueryContextLenses, getOqueryErrorRange } from "./oquery-monaco-adapters";
import { createOqueryModel, ensureOqueryLanguage, monaco, OQUERY_THEME_ID, registerOqueryEditorSource } from "./oquery-monaco-setup";
import type { OQueryErrorPosition } from "./oquery-validation";

type OQueryEditorProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "onBlur"> & {
  value?: string;
  initialText?: string;
  textOverride?: string;
  onTextChange: (text: string) => void;
  domain: {
    id: string;
    name: string;
    description?: string;
    entities: MetadataEntity[];
    relations: DomainRelation[];
  };
  highlight?: (text: string) => ReactNode;
  oquery?: boolean;
  functionDefinitions: FunctionDefinition[];
  operators: FilterOperatorDefinition[];
  suggestionFields?: string[];
  suggestionEntities?: string[];
  suggestionEntityName?: string;
  suggestionEntitiesMetadata?: OQuerySuggestionEntity[];
  errorFunctionName?: string;
  errorPosition?: OQueryErrorPosition | null;
  errorMessage?: string;
  compact?: boolean;
  showGutter?: boolean;
  showLineNumbers?: boolean;
  showFoldControls?: boolean;
  onBlur?: FocusEventHandler<HTMLElement>;
  onSelectionChange?: (text: string) => void;
  onExecuteSelectedText?: (text: string) => void;
  onExecuteContext?: (contextName: string) => void;
};

export type OQueryEditorHandle = {
  getText: () => string;
  setText: (text: string) => void;
};

const COMPACT_LINE_HEIGHT = 20.8;
const COMPACT_CHROME_HEIGHT = 34;

function getDoubleClickSelection(textarea: HTMLTextAreaElement): string {
  const { selectionStart, selectionEnd } = textarea;
  let end = selectionEnd;
  while (end > selectionStart && textarea.value[end - 1] === " ") end--;
  if (end !== selectionEnd) textarea.setSelectionRange(selectionStart, end);
  return textarea.value.slice(selectionStart, end);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRange(model: monaco.editor.ITextModel, start: number, end: number): monaco.Range {
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(end);
  return new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
}

function getErrorFunctionMatches(text: string, functionName: string): { start: number; end: number }[] {
  if (!functionName) return [];
  const pattern = new RegExp(`\\b(${escapeRegExp(functionName)})(?=\\s*\\()`, "gi");
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[1]!.length,
  }));
}

const OqueryMonacoEditor = forwardRef<OQueryEditorHandle, OQueryEditorProps>((props, ref) => {
  const {
    textOverride, disabled = false, onBlur,
    functionDefinitions, errorFunctionName = "", errorPosition = null, errorMessage = "",
    compact = false, showGutter = true, showLineNumbers = true, showFoldControls = true,
    onExecuteContext,
  } = props;
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const externalWriteRef = useRef(false);
  const latestRef = useRef(props);
  const [lineCount, setLineCount] = useState(() => normalizeOqueryEditorText(props.textOverride ?? props.initialText ?? props.value ?? "").split("\n").length);

  useLayoutEffect(() => {
    latestRef.current = props;
  });

  const refreshDecorations = () => {
    const model = modelRef.current;
    if (!model) return;
    const text = model.getValue();
    const { errorFunctionName: functionName = "" } = latestRef.current;
    const contextDecorations = getOQueryContextKeys(text).map((key) => ({
      range: getRange(model, key.start, key.end),
      options: {
        inlineClassName: key.kind === "table" ? "query-oquery-table-key" : "query-oquery-context-key",
      },
    }));
    const errorDecorations = getErrorFunctionMatches(text, functionName).map((match) => ({
      range: getRange(model, match.start, match.end),
      options: { inlineClassName: "query-oquery-error-function" },
    }));
    // Run glyphs live in the fixed-width gutter, so showing them never shifts the text.
    const runDecorations = latestRef.current.onExecuteContext
      ? getOqueryContextLenses(text).map((lens) => ({
        range: new monaco.Range(lens.lineNumber, 1, lens.lineNumber, 1),
        options: {
          glyphMarginClassName: "query-oquery-run-glyph",
          glyphMarginHoverMessage: { value: `Run ${lens.contextName} context` },
        },
      }))
      : [];
    decorationsRef.current?.set([...contextDecorations, ...errorDecorations, ...runDecorations]);
  };

  const writeExternalText = (next: string) => {
    const model = modelRef.current;
    const editor = editorRef.current;
    if (!model || !editor) return;
    // A problem widget opened from a marker refers to the previous text, so it closes when the text is replaced.
    editor.getContribution<{ close(focusEditor?: boolean): void; dispose(): void }>("editor.contrib.markerController")?.close(false);
    const edit = getMinimalTextEdit(model.getValue(), normalizeOqueryEditorText(next));
    if (!edit) return;
    externalWriteRef.current = true;
    try {
      editor.executeEdits("oquery-external", [{
        range: getRange(model, edit.start, edit.end),
        text: edit.text,
        forceMoveMarkers: true,
      }]);
    } finally {
      externalWriteRef.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    getText: () => modelRef.current?.getValue() ?? "",
    setText: writeExternalText,
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const current = latestRef.current;
    const initial = normalizeOqueryEditorText(current.textOverride ?? current.initialText ?? current.value ?? "");
    ensureOqueryLanguage(current.functionDefinitions);
    const model = createOqueryModel(initial, instanceId);
    const editor = monaco.editor.create(host, {
      model,
      theme: OQUERY_THEME_ID,
      automaticLayout: true,
      readOnly: current.disabled ?? false,
      ariaLabel: current["aria-label"] ?? "OQuery text editor",
      lineNumbers: current.showLineNumbers === false || current.showGutter === false ? "off" : "on",
      folding: (current.showFoldControls ?? true) && current.showGutter !== false,
      glyphMargin: Boolean(current.onExecuteContext),
      lineDecorationsWidth: current.showGutter === false ? 0 : 16,
      // Clicking a line number would otherwise select the whole row.
      selectOnLineNumbers: false,
      minimap: { enabled: false },
      wordWrap: "off",
      scrollBeyondLastLine: false,
      fontFamily: "\"Cascadia Mono\", Consolas, ui-monospace, SFMono-Regular, Menlo, Monaco, \"Liberation Mono\", \"Courier New\", monospace",
      fontSize: 13,
      fontWeight: "300",
      lineHeight: COMPACT_LINE_HEIGHT,
      tabSize: 2,
      insertSpaces: true,
      padding: { top: 16, bottom: 16 },
      renderLineHighlight: "line",
      renderWhitespace: "none",
      scrollbar: { alwaysConsumeMouseWheel: false },
      wordBasedSuggestions: "off",
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      fixedOverflowWidgets: true,
    });
    modelRef.current = model;
    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection();

    const unregisterSource = registerOqueryEditorSource(model, {
      getCompletions: (text, offset) => {
        const latest = latestRef.current;
        return getOQueryCompletions(
          text,
          offset,
          latest.suggestionFields ?? [],
          latest.operators,
          latest.suggestionEntities ?? [],
          latest.functionDefinitions,
          latest.suggestionEntityName ?? "",
          latest.suggestionEntitiesMetadata ?? [],
        );
      },
    });

    const subscriptions = [
      model.onDidChangeContent(() => {
        setLineCount(model.getLineCount());
        refreshDecorations();
        if (!externalWriteRef.current) latestRef.current.onTextChange(model.getValue());
      }),
      editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection();
        latestRef.current.onSelectionChange?.(selection ? model.getValueInRange(selection) : "");
      }),
      editor.onMouseDown((event) => {
        if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
        const lineNumber = event.target.position?.lineNumber;
        const lens = getOqueryContextLenses(model.getValue()).find((item) => item.lineNumber === lineNumber);
        if (lens) latestRef.current.onExecuteContext?.(lens.contextName);
      }),
    ];
    refreshDecorations();

    return () => {
      subscriptions.forEach((subscription) => subscription.dispose());
      unregisterSource();
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
    // The editor is created once per mounted component; props are read through latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  useLayoutEffect(() => {
    if (textOverride === undefined) return;
    writeExternalText(textOverride);
    // writeExternalText reads refs only, so it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textOverride]);

  const hasRunContext = Boolean(onExecuteContext);

  useEffect(() => {
    ensureOqueryLanguage(functionDefinitions);
    refreshDecorations();
    // refreshDecorations reads the latest props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionDefinitions, errorFunctionName, hasRunContext]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly: disabled,
      lineNumbers: showLineNumbers && showGutter ? "on" : "off",
      folding: showFoldControls && showGutter,
      lineDecorationsWidth: showGutter ? 16 : 0,
      glyphMargin: hasRunContext,
    });
  }, [disabled, showLineNumbers, showFoldControls, showGutter, hasRunContext]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    monaco.editor.setModelMarkers(model, "oquery", errorPosition ? [{
      ...getOqueryErrorRange(errorPosition),
      severity: monaco.MarkerSeverity.Error,
      message: errorMessage || "OQuery error",
    }] : []);
    // Markers depend on the position values, not the object identity recreated on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorPosition?.line, errorPosition?.column, errorPosition?.length, errorMessage]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    // Captured before Monaco's own handlers so OQuery Enter and Run-selection
    // behavior takes precedence; other keys fall through to Monaco.
    const onKeyDown = (event: KeyboardEvent) => {
      const editor = editorRef.current;
      const model = modelRef.current;
      if (!editor || !model || latestRef.current.disabled) return;
      if (event.key !== "Enter" || event.altKey || event.shiftKey) return;
      const selection = editor.getSelection();
      if (!selection) return;
      if (event.ctrlKey || event.metaKey) {
        if (selection.isEmpty()) return;
        event.preventDefault();
        event.stopPropagation();
        latestRef.current.onExecuteSelectedText?.(model.getValueInRange(selection));
        return;
      }
      if (wrapper.querySelector(".suggest-widget.visible")) return;
      event.preventDefault();
      event.stopPropagation();
      const text = model.getValue();
      const edit = getOqueryEnterEdit(
        text,
        model.getOffsetAt(selection.getStartPosition()),
        model.getOffsetAt(selection.getEndPosition()),
      );
      const minimal = getMinimalTextEdit(text, edit.value);
      // The caret is set as part of the edit: calling setPosition after executeEdits
      // is not reliable here because the parent re-syncs textOverride on the same change.
      const caretLines = edit.value.slice(0, edit.caret).split("\n");
      const caretColumn = caretLines[caretLines.length - 1]!.length + 1;
      const caret = new monaco.Selection(caretLines.length, caretColumn, caretLines.length, caretColumn);
      if (minimal) {
        editor.executeEdits("oquery-enter", [{
          range: getRange(model, minimal.start, minimal.end),
          text: minimal.text,
          forceMoveMarkers: true,
        }], [caret]);
      } else {
        editor.setSelection(caret);
      }
    };
    wrapper.addEventListener("keydown", onKeyDown, { capture: true });
    return () => wrapper.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const compactHeight = Math.max(1, lineCount) * COMPACT_LINE_HEIGHT + COMPACT_CHROME_HEIGHT;

  return (
    <div
      ref={wrapperRef}
      className={`query-oquery-code-editor query-oquery-monaco${showGutter ? "" : " no-gutter"}`}
      style={compact ? { height: `${compactHeight}px` } : undefined}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) return;
        onBlur?.(event);
      }}
    >
      <div ref={hostRef} className="query-oquery-monaco-host" />
    </div>
  );
});

OqueryMonacoEditor.displayName = "OqueryMonacoEditor";

const OQueryEditor = forwardRef<OQueryEditorHandle, OQueryEditorProps>((props, ref) => {
  if (props.oquery) return <OqueryMonacoEditor {...props} ref={ref} />;
  const {
    onTextChange, highlight, value, onSelectionChange, onExecuteSelectedText,
    oquery, domain, operators, functionDefinitions, errorFunctionName, compact, showGutter, showFoldControls,
    onDoubleClick, errorMessage, showLineNumbers, suggestionFields, suggestionEntities, suggestionEntityName,
    suggestionEntitiesMetadata, initialText, textOverride, errorPosition, onExecuteContext, ...textareaProps
  } = props;
  const selectionText = (textarea: HTMLTextAreaElement) => textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  return (
    <div className="oquery-editor">
      {highlight && <pre className="oquery-editor-highlight" aria-hidden="true">{highlight(String(value ?? "")) || " "}</pre>}
      <textarea {...textareaProps} value={value} onChange={(event) => onTextChange(event.target.value)}
        onSelect={(event) => onSelectionChange?.(selectionText(event.currentTarget))}
        onDoubleClick={(event) => {
          onSelectionChange?.(getDoubleClickSelection(event.currentTarget));
          onDoubleClick?.(event);
        }}
        onBlur={(event) => { onSelectionChange?.(selectionText(event.currentTarget)); textareaProps.onBlur?.(event); }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            const selected = selectionText(event.currentTarget);
            if (selected) { event.preventDefault(); onExecuteSelectedText?.(selected); }
          }
          textareaProps.onKeyDown?.(event);
        }} />
    </div>
  );
});

OQueryEditor.displayName = "OQueryEditor";
export default OQueryEditor;
