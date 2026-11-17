import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type FocusEventHandler, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { FunctionDefinition } from "../function-definition/types";
import type { DomainRelation, FilterOperatorDefinition, InlineQueryResult, MetadataEntity } from "../query-builder/query-design/query-builder-slice";
import { getOQueryContextKeys } from "../query-builder/query-design/oquery-context-colors";
import "../query-builder/query-design/query-design.css";
import { getOQueryCompletions, type OQuerySuggestionEntity } from "./oquery-completions";
import { getOqueryEnterEdit } from "./oquery-editor-enter";
import { normalizeOqueryEditorText } from "./oquery-editor-text";
import { getMinimalTextEdit, getOqueryContextBlocks, getOqueryContextLenses, getOqueryErrorRange } from "./oquery-monaco-adapters";
import { createOqueryModel, ensureOqueryLanguage, monaco, OQUERY_THEME_ID, registerOqueryEditorSource } from "./oquery-monaco-setup";
import { buildInlineResultView, INLINE_RESULT_MARGIN, type InlineResultMode, type InlineResultView } from "./oquery-inline-result";
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
  // Grows the editor to its content height so the page scrolls instead of the editor.
  autoHeight?: boolean;
  showGutter?: boolean;
  showLineNumbers?: boolean;
  showFoldControls?: boolean;
  onBlur?: FocusEventHandler<HTMLElement>;
  onSelectionChange?: (text: string) => void;
  onExecuteSelectedText?: (text: string, contextName?: string) => void;
  onExecuteContext?: (contextName: string) => void;
  inlineResults?: Record<string, InlineQueryResult>;
  onClearInlineResult?: (contextName: string) => void;
};

export type OQueryEditorHandle = {
  getText: () => string;
  setText: (text: string) => void;
};

const COMPACT_LINE_HEIGHT = 20.8;
const COMPACT_CHROME_HEIGHT = 34;
const AUTO_HEIGHT_VIEWPORT_MARGIN = 16;

type ScrollSnapshot = { element: Element | Window; left: number; top: number }[];

// Focusing the editor reveals its caret, which can be far below the viewport when the text was bound from a saved query.
function captureScrollPositions(host: HTMLElement): ScrollSnapshot {
  const snapshot: ScrollSnapshot = [{ element: window, left: window.scrollX, top: window.scrollY }];
  for (let node = host.parentElement; node; node = node.parentElement) {
    snapshot.push({ element: node, left: node.scrollLeft, top: node.scrollTop });
  }
  return snapshot;
}

function restoreScrollPositions(snapshot: ScrollSnapshot) {
  for (const { element, left, top } of snapshot) {
    if (element instanceof Window) element.scrollTo(left, top);
    else {
      element.scrollLeft = left;
      element.scrollTop = top;
    }
  }
}

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
    onExecuteContext, suggestionEntitiesMetadata, inlineResults, onClearInlineResult,
  } = props;
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const inlineViewsRef = useRef(new Map<string, { entry: InlineQueryResult; mode: InlineResultMode; collapsed: boolean; view: InlineResultView; host: HTMLElement }>());
  const inlineModesRef = useRef(new Map<string, InlineResultMode>());
  const inlineCollapsedRef = useRef(new Set<string>());
  const inlineZoneIdsRef = useRef<string[]>([]);
  const inlineZoneContextsRef = useRef(new Map<string, string>());
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
    const { errorFunctionName: functionName = "", suggestionEntitiesMetadata } = latestRef.current;
    // Entities are highlighted only when they exist in the domain currently shown in the editor.
    const knownEntityNames = suggestionEntitiesMetadata
      ? new Set(suggestionEntitiesMetadata.map((entity) => entity.name))
      : undefined;
    // A statement whose entity is missing from the domain is greyed out as a whole, so its context keys are not coloured.
    const unknownBlocks = knownEntityNames
      ? getOqueryContextBlocks(text).filter((block) => !knownEntityNames.has(block.entityName))
      : [];
    const unknownLines = new Set<number>();
    for (const block of unknownBlocks)
      for (let line = block.startLine; line <= block.endLine; line++) unknownLines.add(line);
    // Monaco puts a whole-line className on a background overlay, not on the text, so each line is decorated inline.
    const unknownEntityDecorations = unknownBlocks.flatMap((block) =>
      Array.from({ length: block.endLine - block.startLine + 1 }, (_, offset) => {
        const lineNumber = block.startLine + offset;
        return {
          range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
          options: { inlineClassName: "query-oquery-unknown-entity-text" },
        };
      }));
    const contextDecorations = getOQueryContextKeys(text, knownEntityNames)
      .filter((key) => !unknownLines.has(model.getPositionAt(key.start).lineNumber))
      .map((key) => ({
        range: getRange(model, key.start, key.end),
        options: {
          inlineClassName: key.kind === "table" ? "query-oquery-table-key" : "query-oquery-context-key",
        },
      }));
    const errorDecorations = getErrorFunctionMatches(text, functionName).map((match) => ({
      range: getRange(model, match.start, match.end),
      options: { inlineClassName: "query-oquery-error-function" },
    }));
    // Run glyphs live in the fixed-width gutter, so showing them never shifts the text. Contexts of unknown entities get none.
    const runDecorations = latestRef.current.onExecuteContext
      ? getOqueryContextLenses(text)
        .filter((lens) => !unknownLines.has(lens.lineNumber))
        .map((lens) => ({
          range: new monaco.Range(lens.lineNumber, 1, lens.lineNumber, 1),
          options: {
            glyphMarginClassName: "query-oquery-run-glyph",
            glyphMarginHoverMessage: { value: `Run ${lens.contextName} context` },
          },
        }))
      : [];
    decorationsRef.current?.set([...unknownEntityDecorations, ...contextDecorations, ...errorDecorations, ...runDecorations]);
  };

  // Results sit under the last line of their context block. Zones are re-anchored on every
  // text change, so a result follows its block as lines are added or removed above it.
  const syncInlineZones = () => {
    const model = modelRef.current;
    const editor = editorRef.current;
    if (!model || !editor) return;
    const latest = latestRef.current;
    const results = latest.inlineResults ?? {};
    const views = inlineViewsRef.current;
    const anchored = new Set<string>();
    const zones: { afterLineNumber: number; heightInPx: number; domNode: HTMLElement; suppressMouseDown: boolean; contextName: string }[] = [];
    // View zones are sized to the editor's full content width, so the result is sized explicitly
    // to the visible width. Otherwise its right edge and body scrollbar are clipped by the editor.
    const layout = editor.getLayoutInfo();
    const marginRight = layout.verticalScrollbarWidth + INLINE_RESULT_MARGIN;
    const nodeWidth = Math.max(0, layout.contentWidth - INLINE_RESULT_MARGIN - marginRight);
    for (const block of getOqueryContextBlocks(model.getValue())) {
      if (anchored.has(block.contextName)) continue;
      anchored.add(block.contextName);
      const entry = results[block.contextName];
      if (!entry) continue;
      const contextName = block.contextName;
      const mode = inlineModesRef.current.get(contextName) ?? "data";
      const collapsed = inlineCollapsedRef.current.has(contextName);
      let cached = views.get(contextName);
      if (!cached || cached.entry !== entry || cached.mode !== mode || cached.collapsed !== collapsed) {
        const view = buildInlineResultView(contextName, entry, mode, collapsed,
          () => latestRef.current.onClearInlineResult?.(contextName),
          (nextMode) => {
            inlineModesRef.current.set(contextName, nextMode);
            views.delete(contextName);
            syncInlineZones();
          });
        // Monaco resets the width of a zone's own DOM node on every layout, so the result is
        // placed inside a host element that Monaco owns and sized explicitly.
        const host = document.createElement("div");
        host.append(view.node);
        cached = { entry, mode, collapsed, view, host };
        views.set(contextName, cached);
      }
      cached.view.node.style.marginRight = `${marginRight}px`;
      cached.view.node.style.width = `${nodeWidth}px`;
      zones.push({
        afterLineNumber: block.endLine,
        heightInPx: cached.view.height,
        domNode: cached.host,
        suppressMouseDown: true,
        contextName,
      });
    }
    for (const name of [...views.keys()]) {
      if (!results[name]) {
        views.delete(name);
        inlineCollapsedRef.current.delete(name);
      }
    }
    // With no results left, the Data/SQL and collapse choices from the previous query no longer apply.
    if (Object.keys(results).length === 0) {
      inlineModesRef.current.clear();
      inlineCollapsedRef.current.clear();
    }
    editor.changeViewZones((accessor) => {
      inlineZoneIdsRef.current.forEach((id) => accessor.removeZone(id));
      const ids = zones.map(({ contextName, ...zone }) => ({ contextName, id: accessor.addZone(zone) }));
      inlineZoneIdsRef.current = ids.map((item) => item.id);
      inlineZoneContextsRef.current = new Map(ids.map((item) => [item.id, item.contextName]));
    });
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
    const autoHeight = Boolean(current.autoHeight);
    if (autoHeight) host.classList.add("query-oquery-auto-height");
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
      renderLineHighlight: "none",
      // Stops the word under the caret from looking selected after a single click.
      occurrencesHighlight: "off",
      renderWhitespace: "none",
      scrollbar: { alwaysConsumeMouseWheel: false, vertical: autoHeight ? "hidden" : "auto" },
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

    const syncAutoHeight = () => {
      if (!autoHeight) return;
      host.style.position = "relative";
      // An empty query gets the full viewport height so a new query has room to write.
      const fillHeight = model.getValue() === "" ? window.innerHeight - AUTO_HEIGHT_VIEWPORT_MARGIN : 0;
      host.style.height = `${Math.max(editor.getContentHeight(), fillHeight)}px`;
    };

    const subscriptions = [
      editor.onDidContentSizeChange(syncAutoHeight),
      editor.onDidLayoutChange(syncInlineZones),
      model.onDidChangeContent(() => {
        setLineCount(model.getLineCount());
        refreshDecorations();
        syncInlineZones();
        syncAutoHeight();
        if (!externalWriteRef.current) latestRef.current.onTextChange(model.getValue());
      }),
      editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection();
        latestRef.current.onSelectionChange?.(selection ? model.getValueInRange(selection) : "");
      }),
      editor.onMouseDown((event) => {
        if (event.target.type === monaco.editor.MouseTargetType.GUTTER_VIEW_ZONE) {
          const zoneId = (event.target.detail as { viewZoneId?: string } | undefined)?.viewZoneId;
          const contextName = zoneId ? inlineZoneContextsRef.current.get(zoneId) : undefined;
          if (!contextName) return;
          const collapsed = inlineCollapsedRef.current;
          if (collapsed.has(contextName)) collapsed.delete(contextName);
          else collapsed.add(contextName);
          syncInlineZones();
          return;
        }
        if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
        const lineNumber = event.target.position?.lineNumber;
        const lens = getOqueryContextLenses(model.getValue()).find((item) => item.lineNumber === lineNumber);
        if (lens) latestRef.current.onExecuteContext?.(lens.contextName);
      }),
    ];
    refreshDecorations();
    syncInlineZones();
    syncAutoHeight();

    let scrollBeforePointerFocus: ScrollSnapshot | null = null;
    const handlePointerDown = () => {
      scrollBeforePointerFocus = captureScrollPositions(host);
    };
    const clearScrollSnapshot = () => {
      scrollBeforePointerFocus = null;
    };
    const restoreScrollAfterPointerFocus = () => {
      const snapshot = scrollBeforePointerFocus;
      if (!snapshot) return;
      scrollBeforePointerFocus = null;
      restoreScrollPositions(snapshot);
      requestAnimationFrame(() => restoreScrollPositions(snapshot));
    };
    host.addEventListener("pointerdown", handlePointerDown, true);
    host.addEventListener("focusin", restoreScrollAfterPointerFocus, true);
    window.addEventListener("pointerup", clearScrollSnapshot);
    window.addEventListener("resize", syncAutoHeight);

    return () => {
      host.removeEventListener("pointerdown", handlePointerDown, true);
      host.removeEventListener("focusin", restoreScrollAfterPointerFocus, true);
      window.removeEventListener("pointerup", clearScrollSnapshot);
      window.removeEventListener("resize", syncAutoHeight);
      subscriptions.forEach((subscription) => subscription.dispose());
      unregisterSource();
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      inlineViewsRef.current.clear();
      inlineZoneIdsRef.current = [];
      inlineZoneContextsRef.current.clear();      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
    // The editor is created once per mounted component; props are read through latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  useEffect(() => {
    syncInlineZones();
    // syncInlineZones reads the latest results through latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineResults]);

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

  // Switching domains changes the entity names, so highlights must be recalculated for the new domain.
  const knownEntityKey = suggestionEntitiesMetadata?.map((entity) => entity.name).join("\n");
  useEffect(() => {
    refreshDecorations();
    // refreshDecorations reads the latest props through refs; the key captures the entity names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownEntityKey]);

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
        // The run result is anchored to the context block that contains the end of the selection.
        const contextName = getOqueryContextBlocks(model.getValue())
          .filter((block) => block.startLine <= selection.endLineNumber)
          .pop()?.contextName;
        latestRef.current.onExecuteSelectedText?.(model.getValueInRange(selection), contextName);
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
