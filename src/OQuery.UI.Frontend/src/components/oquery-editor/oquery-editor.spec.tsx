import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OQueryEditor from "./oquery-editor";
import * as monacoMock from "./monaco-test-double";

vi.mock("monaco-editor", () => import("./monaco-test-double"));

const baseProps = {
  domain: { id: "sales", name: "Sales", entities: [], relations: [] },
  functionDefinitions: [],
  operators: [],
  oquery: true as const,
};

let container: HTMLDivElement;
let root: Root;

function render(props: Partial<Parameters<typeof OQueryEditor>[0]> & { onTextChange?: (text: string) => void }) {
  act(() => {
    root.render(<OQueryEditor {...baseProps} onTextChange={() => undefined} {...props} />);
  });
}

function currentEditor() {
  const editor = monacoMock.lastEditor();
  if (!editor) throw new Error("Monaco editor was not created");
  return editor;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  monacoMock.reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OQueryEditor (Monaco)", () => {
  it("mounts Monaco with the initial OQuery text and the OQuery theme", () => {
    render({ initialText: "Entity: User" });

    const editor = currentEditor();
    expect(editor.model.getValue()).toBe("Entity: User");
    expect(editor.options.theme).toBe("oquery-dark");
    expect(editor.model.language).toBe("oquery");
  });

  it("runs a context from its gutter glyph and ignores clicks on text", () => {
    const onExecuteContext = vi.fn();
    render({ initialText: "Employees: Manager.\nDepartments: Id", onExecuteContext });

    act(() => {
      currentEditor().emitMouseDown({
        target: { type: monacoMock.editor.MouseTargetType.GUTTER_GLYPH_MARGIN, position: { lineNumber: 2 } },
      });
    });
    expect(onExecuteContext).toHaveBeenCalledWith("Departments");

    act(() => {
      currentEditor().emitMouseDown({ target: { type: 6, position: { lineNumber: 1 } } });
    });
    expect(onExecuteContext).toHaveBeenCalledTimes(1);
  });

  it("reports typed changes, and does not echo text that came from the parent", () => {
    const onTextChange = vi.fn();
    render({ initialText: "Entity: User", onTextChange });

    act(() => {
      const editor = currentEditor();
      editor.model.applyEdit(0, editor.model.getValue().length, "Entity: Users");
    });
    expect(onTextChange).toHaveBeenLastCalledWith("Entity: Users");

    onTextChange.mockClear();
    render({ textOverride: "Entity: Users", onTextChange });
    expect(onTextChange).not.toHaveBeenCalled();

    render({ textOverride: "Entity: Orders", onTextChange });
    expect(currentEditor().model.getValue()).toBe("Entity: Orders");
    expect(onTextChange).not.toHaveBeenCalled();
  });

  it("shows the build placeholder only while the query is empty", () => {
    render({ initialText: "" });
    expect(currentEditor().contentWidgets.size).toBe(1);

    act(() => {
      const editor = currentEditor();
      editor.model.applyEdit(0, 0, "Entity: Users");
    });
    expect(currentEditor().contentWidgets.size).toBe(0);
  });

  it("takes focus on mount when autoFocus is set", () => {
    render({ initialText: "", autoFocus: true });
    expect(currentEditor().focusCount).toBe(1);

    render({ initialText: "", autoFocus: false });
    expect(currentEditor().focusCount).toBe(1);
  });

  it("closes an open problem widget when the parent replaces the query text", () => {
    render({ initialText: "Entity: User" });
    const editor = currentEditor();

    render({ textOverride: "Entity: Orders" });

    expect(editor.model.getValue()).toBe("Entity: Orders");
    expect(editor.markerWidgetCloseCount).toBeGreaterThan(0);
  });

  it("shows validation errors as a Monaco marker with the server message", () => {
    render({
      initialText: "Entity: User\nPage: 1",
      errorPosition: { line: 2, column: 7, length: 1 },
      errorMessage: "Unknown field",
    });

    expect(currentEditor().model.markers).toEqual([expect.objectContaining({
      startLineNumber: 2,
      startColumn: 7,
      endColumn: 8,
      message: "Unknown field",
    })]);
  });

  it("disposes the editor and model when unmounted", () => {
    render({ initialText: "Entity: User" });
    const editor = currentEditor();

    act(() => root.unmount());
    root = createRoot(container);

    expect(editor.disposed).toBe(true);
    expect(editor.model.disposed).toBe(true);
  });

  it("inserts a list item on Enter inside a Projection section", () => {
    render({ initialText: "Projection:\n  - Id" });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("Projection:\n  - Id\n  - ");
  });

  it("places the caret on the new line after Enter", () => {
    render({ initialText: "OrderItems:" });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(editor.model.getValue()).toBe("OrderItems:\n");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 2, column: 1 });
  });

  it("runs the selected text on Ctrl+Enter instead of inserting a line", () => {
    const onExecuteSelectedText = vi.fn();
    render({ initialText: "Entity: User", onExecuteSelectedText });
    const editor = currentEditor();
    editor.setSelectionOffsets(8, 12);

    const event = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(onExecuteSelectedText).toHaveBeenCalledWith("User", "Entity");
    expect(event.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("Entity: User");
  });

  it("places the caret below an inline result on Alt+Enter", () => {
    render({
      initialText: "User:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);

    const event = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("User:\n");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 2, column: 1 });
  });

  it("keeps a normal Enter line below the grid after Alt+Enter", () => {
    render({
      initialText: "User:\nOrders:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets("User:".length);
    const altEvent = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(altEvent); });

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("User:\n\n\nOrders:");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 3, column: 1 });
    expect(editor.viewZones.at(-1)?.afterLineNumber).toBe(1);
  });

  it("keeps typed text and a following Enter below the grid after Alt+Enter", () => {
    render({
      initialText: "User:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);
    const altEvent = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(altEvent); });
    act(() => { editor.model.applyEdit(editor.model.getValue().length, editor.model.getValue().length, "abc"); });
    editor.setSelectionOffsets(editor.model.getValue().length);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(editor.model.getValue()).toBe("User:\nabc\n");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 3, column: 1 });
    expect(editor.viewZones.at(-1)?.afterLineNumber).toBe(1);
  });

  it("moves to a new row below the inline result on Alt+Enter after a normal Enter", () => {
    render({
      initialText: "User:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(enter); });
    expect(editor.model.getValue()).toBe("User:\n");

    const altEvent = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(altEvent); });

    expect(altEvent.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("User:\n\n");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 3, column: 1 });
    expect(editor.viewZones.at(-1)?.afterLineNumber).toBe(2);
  });

  it("keeps text below the grid below it when Alt+Enter is pressed on the header", () => {
    render({
      initialText: "User:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);
    const alt = () => new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(alt()); });
    act(() => { editor.model.applyEdit(editor.model.getValue().length, editor.model.getValue().length, "abc"); });
    editor.setSelectionOffsets("User:".length);

    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(alt()); });

    expect(editor.model.getValue()).toBe("User:\n\nabc");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 2, column: 1 });
    expect(editor.viewZones.at(-1)?.afterLineNumber).toBe(1);
  });

  it("keeps the grid above text typed on the row below it after Alt+Enter", () => {
    render({
      initialText: "User:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets(editor.model.getValue().length);
    const altEvent = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(altEvent); });

    act(() => { editor.model.applyEdit(editor.model.getValue().length, editor.model.getValue().length, "abc"); });

    expect(editor.model.getValue()).toBe("User:\nabc");
    expect(editor.viewZones.at(-1)?.afterLineNumber).toBe(1);
  });

  it("inserts a new line below an inline result before following content on Alt+Enter", () => {
    render({
      initialText: "User:\nOrders:",
      inlineResults: {
        User: {
          status: "succeeded",
          result: { columns: ["Id"], rows: [["1"]], totalRecords: 1 },
          sql: null,
          error: "",
        },
      },
    });
    const editor = currentEditor();
    editor.setSelectionOffsets("User:".length);

    const event = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    act(() => { container.querySelector(".query-oquery-code-editor")!.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("User:\n\nOrders:");
    expect(editor.getSelection()?.getStartPosition()).toEqual({ lineNumber: 2, column: 1 });
  });
});
