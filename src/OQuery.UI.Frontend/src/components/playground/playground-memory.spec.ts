import { beforeEach, describe, expect, it } from "vitest";
import { rememberPlaygroundSelection, rememberedPlaygroundPath } from "./playground-memory";

describe("playground memory", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("returns null when no playground selection was remembered", () => {
    expect(rememberedPlaygroundPath()).toBeNull();
  });

  it("restores the last project and domain", () => {
    rememberPlaygroundSelection("proj 1", "dom/2");
    expect(rememberedPlaygroundPath()).toBe("/playground/proj%201/dom%2F2");
  });

  it("restores only the project when no domain was selected", () => {
    rememberPlaygroundSelection("proj-1", "");
    expect(rememberedPlaygroundPath()).toBe("/playground/proj-1");
  });

  it("ignores an empty project id so the last real selection is kept", () => {
    rememberPlaygroundSelection("proj-1", "dom-1");
    rememberPlaygroundSelection("", "");
    expect(rememberedPlaygroundPath()).toBe("/playground/proj-1/dom-1");
  });
});
