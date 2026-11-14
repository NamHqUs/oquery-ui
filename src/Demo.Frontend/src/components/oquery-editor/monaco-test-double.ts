// Test double for the subset of the monaco-editor API used by oquery-editor.
// It is wired in through vi.mock("monaco-editor") in oquery-editor.spec.tsx.
type Listener = () => void;
type Position = { lineNumber: number; column: number };

export class Range {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number,
  ) {}
}

export class Selection extends Range {}

class FakeModel {
  disposed = false;
  markers: unknown[] = [];
  readonly uri: { toString: () => string };
  private value: string;
  private readonly listeners = new Set<Listener>();

  constructor(text: string, readonly language: string, uri: string) {
    this.value = text;
    this.uri = { toString: () => uri };
  }

  getValue() {
    return this.value;
  }

  setEOL() {}

  getLineCount() {
    return this.value.split("\n").length;
  }

  getOffsetAt({ lineNumber, column }: Position) {
    const lines = this.value.split("\n");
    let offset = 0;
    for (let index = 0; index < lineNumber - 1; index++) offset += lines[index]!.length + 1;
    return offset + column - 1;
  }

  getPositionAt(offset: number): Position {
    const before = this.value.slice(0, offset).split("\n");
    return { lineNumber: before.length, column: before[before.length - 1]!.length + 1 };
  }

  getValueInRange(range: Range) {
    return this.value.slice(
      this.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn }),
      this.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn }),
    );
  }

  onDidChangeContent(listener: Listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  applyEdit(start: number, end: number, text: string) {
    this.value = `${this.value.slice(0, start)}${text}${this.value.slice(end)}`;
    this.listeners.forEach((listener) => listener());
  }

  dispose() {
    this.disposed = true;
  }
}

class FakeEditor {
  disposed = false;
  private selection = { start: 0, end: 0 };
  private readonly selectionListeners = new Set<Listener>();

  constructor(readonly model: FakeModel, readonly options: Record<string, unknown>) {}

  updateOptions = (_options: Record<string, unknown>) => undefined;

  executeEdits = (_source: string, edits: { range: Range; text: string }[], endCursorState?: Range[]) => {
    for (const edit of edits) {
      const start = this.model.getOffsetAt({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn });
      const end = this.model.getOffsetAt({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn });
      this.model.applyEdit(start, end, edit.text);
    }
    const cursor = endCursorState?.[0];
    if (cursor) this.setSelection(cursor);
    return true;
  };

  setSelection(range: Range) {
    this.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
  }

  getSelection() {
    const { start, end } = this.selection;
    const from = this.model.getPositionAt(start);
    const to = this.model.getPositionAt(end);
    return {
      startLineNumber: from.lineNumber,
      startColumn: from.column,
      endLineNumber: to.lineNumber,
      endColumn: to.column,
      isEmpty: () => start === end,
      getStartPosition: () => from,
      getEndPosition: () => to,
    };
  }

  setPosition(position: Position) {
    const offset = this.model.getOffsetAt(position);
    this.selection = { start: offset, end: offset };
  }

  setSelectionOffsets(start: number, end = start) {
    this.selection = { start, end };
    this.selectionListeners.forEach((listener) => listener());
  }

  onDidChangeCursorSelection(listener: Listener) {
    this.selectionListeners.add(listener);
    return { dispose: () => this.selectionListeners.delete(listener) };
  }

  createDecorationsCollection() {
    return { set: (_decorations: unknown[]) => undefined, clear: () => undefined };
  }

  private readonly mouseDownListeners = new Set<(event: unknown) => void>();

  onMouseDown(listener: (event: unknown) => void) {
    this.mouseDownListeners.add(listener);
    return { dispose: () => this.mouseDownListeners.delete(listener) };
  }

  emitMouseDown(event: unknown) {
    this.mouseDownListeners.forEach((listener) => listener(event));
  }

  dispose() {
    this.disposed = true;
    this.model.dispose();
  }
}

const editors: FakeEditor[] = [];

export function lastEditor() {
  return editors[editors.length - 1];
}

export function reset() {
  editors.length = 0;
}

export const editor = {
  create: (_host: HTMLElement, options: { model: FakeModel } & Record<string, unknown>) => {
    const created = new FakeEditor(options.model, options);
    editors.push(created);
    return created;
  },
  createModel: (text: string, language: string, uri: { toString: () => string }) =>
    new FakeModel(text, language, uri.toString()),
  defineTheme: () => undefined,
  setModelMarkers: (model: FakeModel, _owner: string, markers: unknown[]) => {
    model.markers = markers;
  },
  MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 },
  EndOfLineSequence: { LF: 0, CRLF: 1 },
};

export const languages = {
  register: () => undefined,
  getLanguages: () => [],
  setLanguageConfiguration: () => undefined,
  setMonarchTokensProvider: () => undefined,
  registerCompletionItemProvider: () => undefined,
  registerFoldingRangeProvider: () => undefined,
  CompletionItemKind: {
    Class: 1, Field: 2, Reference: 3, Module: 4, Variable: 5, Function: 6, Keyword: 7, Operator: 8, Value: 9,
  },
  CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
};

export const Uri = { parse: (value: string) => ({ toString: () => value }) };
export const MarkerSeverity = { Error: 8 };
