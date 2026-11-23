import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Icon, { type IconName } from "../icon/icon";

export type HeaderAction = {
  key: string;
  label: string;
  icon: IconName;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
  // Button class for the inline version, for example "button primary" or "domain-action-button danger".
  className?: string;
  // Menu item style for destructive actions.
  danger?: boolean;
  // Always listed in the ⋯ menu, never inline.
  overflowOnly?: boolean;
};

// Returns how many leading inline actions fit in `available` px, with the ⋯ button reserved whenever something is in the menu.
// Widths are the measured inline button widths, `gap` the spacing between items.
export function fitInlineCount(widths: number[], gap: number, moreWidth: number, available: number, hasMenuOnly: boolean) {
  const widthOf = (count: number) => widths.slice(0, count).reduce((sum, width) => sum + width, 0) + gap * Math.max(0, count - 1);
  for (let count = widths.length; count >= 0; count--) {
    const needsMenu = hasMenuOnly || count < widths.length;
    const needed = widthOf(count) + (needsMenu ? (count > 0 ? gap : 0) + moreWidth : 0);
    if (needed <= available) return count;
  }
  return 0;
}

// Right-aligned action group for a page header. Inline actions are shown as many as the available width allows;
// the rest move into the ⋯ menu. A hidden measurement row keeps every button's width, so the split follows resizes.
export default function PageHeaderActions({ actions, status, label }: { actions: HeaderAction[]; status?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(Infinity);
  const [, setLayoutPass] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const inline = actions.filter((action) => !action.overflowOnly);
  const menuOnly = actions.filter((action) => action.overflowOnly);
  const shownInline = inline.slice(0, visibleCount);
  const menuInline = inline.slice(visibleCount);
  const menuItems = [...menuInline, ...menuOnly];
  const menuOpen = open && menuItems.length > 0;

  // Runs after every render and before paint, so the first frame already shows the final split.
  useLayoutEffect(() => {
    const fit = fitRef.current;
    const measure = measureRef.current;
    if (!fit || !measure) return;
    const widths = Array.from(measure.querySelectorAll<HTMLElement>("[data-measure-action]"), (element) => element.getBoundingClientRect().width);
    const moreWidth = measure.querySelector<HTMLElement>("[data-measure-more]")?.getBoundingClientRect().width ?? 0;
    const gap = parseFloat(getComputedStyle(fit).columnGap) || 0;
    setVisibleCount(fitInlineCount(widths, gap, moreWidth, fit.clientWidth, menuOnly.length > 0));
  });

  // The fit row's width comes from the layout, not its content, so resizing it is the only trigger needed.
  useEffect(() => {
    const fit = fitRef.current;
    if (!fit || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setLayoutPass((pass) => pass + 1));
    observer.observe(fit);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (action: HeaderAction) => {
    setOpen(false);
    action.onSelect();
  };

  return <div className="page-header-actions">
    {status}
    <div className="page-header-fit" ref={fitRef} role={label ? "toolbar" : undefined} aria-label={label}>
      {shownInline.map((action) => <button key={action.key} type="button" className={action.className ?? "button secondary"} title={action.title} onClick={action.onSelect} disabled={action.disabled}>
        <Icon name={action.icon} size={14} />{action.label}
      </button>)}
      {menuItems.length > 0 && <div className="page-header-menu" ref={menuRef}>
        <button type="button" className="button secondary" aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setOpen((current) => !current)}>
          <span aria-hidden="true">⋯</span>
        </button>
        {menuOpen && <div className="page-header-menu-panel" role="menu">
          {menuInline.map((action) => <button key={action.key} type="button" role="menuitem" className={`page-header-menu-item${action.danger ? " danger" : ""}`} title={action.title} onClick={() => choose(action)} disabled={action.disabled}>
            <Icon name={action.icon} size={14} />{action.label}
          </button>)}
          {menuInline.length > 0 && menuOnly.length > 0 && <div className="page-header-menu-divider" role="separator" />}
          {menuOnly.map((action) => <button key={action.key} type="button" role="menuitem" className={`page-header-menu-item${action.danger ? " danger" : ""}`} title={action.title} onClick={() => choose(action)} disabled={action.disabled}>
            <Icon name={action.icon} size={14} />{action.label}
          </button>)}
        </div>}
      </div>}
    </div>
    {/* Renders every inline action off-screen so its natural width can be measured. */}
    <div className="page-header-measure" aria-hidden="true" ref={measureRef}>
      {inline.map((action) => <button key={action.key} type="button" tabIndex={-1} data-measure-action className={action.className ?? "button secondary"}>
        <Icon name={action.icon} size={14} />{action.label}
      </button>)}
      <button type="button" tabIndex={-1} data-measure-more className="button secondary"><span>⋯</span></button>
    </div>
  </div>;
}
