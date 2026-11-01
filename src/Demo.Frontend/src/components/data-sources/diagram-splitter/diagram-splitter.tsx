import type { KeyboardEvent, PointerEvent } from "react";
import "./diagram-splitter.css";

type DiagramSplitterProps = {
  height: number;
  minHeight: number;
  onResize: (height: number) => void;
};

const keyboardStep = 16;

export default function DiagramSplitter({ height, minHeight, onResize }: DiagramSplitterProps) {
  const resizeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    onResize(event.clientY - container.getBoundingClientRect().top);
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
    if (event.key === "ArrowUp") onResize(height - keyboardStep);
    else if (event.key === "ArrowDown") onResize(height + keyboardStep);
    else if (event.key === "Home") onResize(minHeight);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="diagram-splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize diagram and data grid"
      aria-valuemin={minHeight}
      aria-valuenow={height}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    />
  );
}
