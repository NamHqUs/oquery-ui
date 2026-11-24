// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import FunctionList from "./function-list";
import type { FunctionDefinition } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const definition = (name: string, isBuiltin: boolean) => ({
  name,
  arguments: [],
  resultType: "Number",
  isAggregate: false,
  isBuiltin,
  canDelete: !isBuiltin,
}) as unknown as FunctionDefinition;

const definitions = [definition("Any", true), definition("MyFunction", false)];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(selectedName: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<FunctionList definitions={definitions} selectedName={selectedName} status="ready" onSelect={() => undefined} />);
  });
  return container;
}

function activeTabTitle(element: HTMLElement) {
  return element.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
}

test("switches to the Custom tab when the selected function is custom", () => {
  const element = render("");
  expect(activeTabTitle(element)).toMatch(/^Builtin/);

  act(() => {
    root?.render(<FunctionList definitions={definitions} selectedName="MyFunction" status="ready" onSelect={() => undefined} />);
  });
  expect(activeTabTitle(element)).toMatch(/^Custom/);
});
