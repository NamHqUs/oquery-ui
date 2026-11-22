import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "../shared/icon/icon";

export type SelectOption = { value: string; label: string };

// A borderless trigger with a custom popup list, replacing the native select.
export default function MainLayoutSelect({ label, prefix, icon, value, options, placeholder, disabled = false, onChange }: {
  label: string;
  prefix: string;
  icon: IconName;
  value: string;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="main-layout-select" ref={rootRef}>
    <button type="button" className="main-layout-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
      disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <Icon name={icon} size={14} />
      <span className="main-layout-select-prefix">{prefix}:</span>
      <span className="main-layout-select-value">{selected?.label ?? placeholder}</span>
      <Icon name="chevron-down" size={12} />
    </button>
    {open && options.length > 0 && <ul className="main-layout-select-menu" role="listbox" aria-label={label}>
      {options.map((option) => <li key={option.value} role="option" aria-selected={option.value === value}>
        <button type="button" className={option.value === value ? "selected" : ""} onClick={() => { setOpen(false); onChange(option.value); }}>
          {option.label}
        </button>
      </li>)}
    </ul>}
  </div>;
}
