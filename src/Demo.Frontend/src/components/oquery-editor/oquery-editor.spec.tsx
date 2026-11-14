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

    expect(onExecuteSelectedText).toHaveBeenCalledWith("User");
    expect(event.defaultPrevented).toBe(true);
    expect(editor.model.getValue()).toBe("Entity: User");
  });
});
