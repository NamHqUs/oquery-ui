import { useEffect, type RefObject } from "react";

// Scrolls the selected item inside a scroll container so it stays visible when selection, filter, or size changes.
export function useKeepSelectedInView(
  listRef: RefObject<HTMLElement | null>,
  selectedItemSelector: string,
  deps: unknown[],
) {
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const scrollSelectedIntoView = () => {
      const selectedItem = list.querySelector<HTMLElement>(selectedItemSelector);
      if (!selectedItem) return;

      const listRect = list.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      const visibleTop = listRect.top + list.clientTop;
      const visibleBottom = visibleTop + list.clientHeight;
      if (itemRect.top < visibleTop) {
        list.scrollTop -= visibleTop - itemRect.top;
      } else if (itemRect.bottom > visibleBottom) {
        list.scrollTop += itemRect.bottom - visibleBottom;
      }
    };

    scrollSelectedIntoView();
    const observer = new ResizeObserver(scrollSelectedIntoView);
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRef, selectedItemSelector, ...deps]);
}
