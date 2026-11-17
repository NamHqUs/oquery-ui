import type { MouseEvent as ReactMouseEvent } from "react";
import Icon from "../../../../icon/icon";

export default function ExpressionAddNextItem({
  onAddNextItem,
}: {
  onAddNextItem: () => void;
}) {
  return (
    <button
      type="button"
      className="expression-add-next-item"
      aria-label="Add next item"
      title="Add next item"
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onAddNextItem();
      }}
    >
      <Icon name="plus" size={12} />
    </button>
  );
}
