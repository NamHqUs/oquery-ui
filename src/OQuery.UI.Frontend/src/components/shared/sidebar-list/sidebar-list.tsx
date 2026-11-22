import { type CSSProperties, type ReactNode, type RefObject } from "react";
import Icon from "../icon/icon";

type SidebarListProps = {
  className: string;
  ariaLabel: string;
  title: string;
  totalCount?: ReactNode;
  filter: string;
  searchPlaceholder: string;
  onFilterChange: (filter: string) => void;
  children: ReactNode;
  listRef?: RefObject<HTMLDivElement | null>;
  listClassName: string;
  searchClassName: string;
  scrollStyle?: CSSProperties;
};

export default function SidebarList({
  className,
  ariaLabel,
  title,
  totalCount,
  filter,
  searchPlaceholder,
  onFilterChange,
  children,
  listRef,
  listClassName,
  searchClassName,
  scrollStyle,
}: SidebarListProps) {
  return (
    <aside className={className} aria-label={ariaLabel}>
      <div className="sidebar-list-heading">
        <span className="section-kicker">{title}</span>
        {totalCount}
      </div>
      <label className={searchClassName}>
        <Icon name="search" size={14} />
        <input
          type="search"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      </label>
      <div className={listClassName} ref={listRef} style={scrollStyle}>
        {children}
      </div>
    </aside>
  );
}
