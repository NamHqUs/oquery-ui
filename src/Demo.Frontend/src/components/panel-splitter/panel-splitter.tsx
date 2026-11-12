import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { ResizablePanel } from "../../utils/use-resizable-panel";
import Icon from "../icon/icon";
import "./panel-splitter.css";

type PanelSplitterProps = {
  panel: ResizablePanel;
  label: string;
  orientation?: "vertical" | "horizontal";
  collapsible?: boolean;
  horizontalAnchor?: "top" | "bottom";
  verticalAnchor?: "left" | "right";
};

const keyboardStep = 16;

export default function PanelSplitter({
  panel,
  label,
  orientation = "vertical",
  collapsible = true,
  horizontalAnchor = "bottom",
  verticalAnchor = "left",
}: PanelSplitterProps) {
  const { width, collapsed, min, max, setWidth, toggle } = panel;
  const horizontal = orientation === "horizontal";
  const collapsedDrag = useRef(false);
  const atMinimum = !collapsed && width <= min;

  const resizeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.closest(".split-workspace");
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    setWidth(horizontal
      ? horizontalAnchor === "top" ? event.clientY - bounds.top : bounds.bottom - event.clientY
      : verticalAnchor === "right" ? bounds.right - event.clientX : event.clientX - bounds.left);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    collapsedDrag.current = collapsed;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!collapsed) resizeFromPointer(event);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (collapsedDrag.current) {
      collapsedDrag.current = false;
      toggle();
    }
    resizeFromPointer(event);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    collapsedDrag.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((!horizontal && (verticalAnchor === "left" ? event.key === "ArrowLeft" : event.key === "ArrowRight")) || (horizontal && event.key === "ArrowDown")) setWidth(width - keyboardStep);
    else if ((!horizontal && (verticalAnchor === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft")) || (horizontal && event.key === "ArrowUp")) setWidth(width + keyboardStep);
    else if (event.key === "Home") setWidth(min);
    else if (event.key === "End") setWidth(max);
    else return;
    event.preventDefault();
  };

  return (
    <div className={`panel-splitter${horizontal ? ` horizontal ${horizontalAnchor}` : ""}${collapsed ? " collapsed" : ""}${atMinimum ? " at-minimum" : ""}`}>
      {(!collapsed || !horizontal) && (
        <div
          className="panel-splitter-handle"
          role="separator"
          aria-orientation={orientation}
          aria-label={`Resize ${label}`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleKeyDown}
          onDoubleClick={toggle}
        />
      )}
      {collapsible && (
        <button
          type="button"
          className="panel-splitter-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        >
          <Icon
            name={horizontal ? "chevron-down" : verticalAnchor === "right"
              ? collapsed ? "chevron-left" : "chevron-right"
              : collapsed ? "chevron-right" : "chevron-left"}
            size={12}
          />
        </button>
      )}
    </div>
  );
}
