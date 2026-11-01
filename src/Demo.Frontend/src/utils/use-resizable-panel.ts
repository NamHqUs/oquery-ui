import { type CSSProperties, useEffect, useState } from "react";

export type ResizablePanel = {
  width: number;
  collapsed: boolean;
  min: number;
  max: number;
  setWidth: (width: number) => void;
  toggle: () => void;
  style: CSSProperties;
};

const storagePrefix = "OQuery.panel.";
const sharedWidthKey = `${storagePrefix}shared.width`;
const widthChangeEvent = "OQuery.panel.width";
export const DEFAULT_PANEL_WIDTH = 260;

function readStoredWidth(fallback: number, min: number, max: number) {
  const stored = Number(window.localStorage.getItem(sharedWidthKey));
  return Number.isFinite(stored) && stored >= min && stored <= max ? stored : fallback;
}

export function useResizablePanel(key: string, defaultWidth = DEFAULT_PANEL_WIDTH, min = 180, max = 520): ResizablePanel {
  const [width, setWidthState] = useState(() => readStoredWidth(defaultWidth, min, max));
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(`${storagePrefix}${key}.collapsed`) === "1");

  useEffect(() => {
    const syncWidth = (next: number) => {
      if (Number.isFinite(next) && next >= min && next <= max) setWidthState(next);
    };
    const handleWidthChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "number") syncWidth(event.detail);
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === sharedWidthKey && event.newValue !== null) syncWidth(Number(event.newValue));
    };

    window.addEventListener(widthChangeEvent, handleWidthChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(widthChangeEvent, handleWidthChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [max, min]);

  const setWidth = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    setWidthState(clamped);
    window.localStorage.setItem(sharedWidthKey, String(clamped));
    window.dispatchEvent(new CustomEvent(widthChangeEvent, { detail: clamped }));
  };

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(`${storagePrefix}${key}.collapsed`, next ? "1" : "0");
  };

  return {
    width,
    collapsed,
    min,
    max,
    setWidth,
    toggle,
    style: { "--panel-width": collapsed ? "0px" : `${width}px` } as CSSProperties,
  };
}
