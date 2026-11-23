import { describe, expect, it } from "vitest";
import { isSidebarCollapsed, parseSidebarPreference, SIDEBAR_AUTO_COLLAPSE_WIDTH } from "./main-layout-sidebar";

describe("main sidebar collapse", () => {
  it("follows the viewport width only when no explicit choice was made", () => {
    expect(isSidebarCollapsed("auto", SIDEBAR_AUTO_COLLAPSE_WIDTH - 1)).toBe(true);
    expect(isSidebarCollapsed("auto", SIDEBAR_AUTO_COLLAPSE_WIDTH)).toBe(false);
  });

  it("keeps an explicit choice regardless of the viewport width", () => {
    expect(isSidebarCollapsed("expanded", 800)).toBe(false);
    expect(isSidebarCollapsed("collapsed", 1920)).toBe(true);
  });

  it("treats a missing or unknown stored value as auto", () => {
    expect(parseSidebarPreference(null)).toBe("auto");
    expect(parseSidebarPreference("wide")).toBe("auto");
    expect(parseSidebarPreference("collapsed")).toBe("collapsed");
  });
});
