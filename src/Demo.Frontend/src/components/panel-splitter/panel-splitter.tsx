import type { KeyboardEvent, PointerEvent } from "react";
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
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeFromPointer(event);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeFromPointer(event);
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
    <div className={`panel-splitter${horizontal ? ` horizontal ${horizontalAnchor}` : ""}${collapsed ? " collapsed" : ""}`}>
      {!collapsed && (
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
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={12} />
        </button>
      )}
    </div>
  );
}
