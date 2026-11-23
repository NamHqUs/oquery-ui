import { describe, expect, it } from "vitest";
import { fitInlineCount } from "./page-header-actions";

describe("fitInlineCount", () => {
  const widths = [60, 80, 70];

  it("shows every action when they all fit without the menu", () => {
    expect(fitInlineCount(widths, 8, 30, 60 + 80 + 70 + 16, false)).toBe(3);
  });

  it("keeps the leading actions and reserves room for the More button when the rest do not fit", () => {
    // 60 + 8 + 80 + 8 + 30 (More) = 186 fits; adding the third action would need 264.
    expect(fitInlineCount(widths, 8, 30, 200, false)).toBe(2);
  });

  it("reserves the More button when menu-only actions exist, even if all inline actions fit", () => {
    expect(fitInlineCount(widths, 8, 30, 60 + 80 + 70 + 16 + 8, true)).toBe(2);
    expect(fitInlineCount(widths, 8, 30, 60 + 80 + 70 + 16 + 8 + 30, true)).toBe(3);
  });

  it("falls back to the menu alone when not even one action fits", () => {
    expect(fitInlineCount(widths, 8, 30, 50, false)).toBe(0);
  });
});
