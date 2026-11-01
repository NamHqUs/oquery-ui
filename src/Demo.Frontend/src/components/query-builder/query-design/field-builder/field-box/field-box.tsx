import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ApiQueryContextDefinition, MetadataEntity } from "../query-builder-slice";
import Icon from "../../../../icon/icon";
import { FieldBoxPopupContext } from "./field-box-popup-context";
import "./field-box.css";

type FieldBoxProps = {
  entity: MetadataEntity;
  metadata: MetadataEntity[];
  joinedContexts?: ApiQueryContextDefinition[];
  value: string;
  onChange: (path: string) => void;
  onIncompleteChange?: (incomplete: boolean) => void;
  clearOnSelect?: boolean;
  completeOnSelect?: boolean;
  showPath?: boolean;
  placeholder?: string;
  placeholderIcon?: boolean;
  ariaLabel?: string;
  popupAnchor?: HTMLElement | null;
  excludedPaths?: string[];
  autoFocus?: boolean;
  allowValueSelection?: boolean;
  allowCalculationSelection?: boolean;
  allowFunctionSelection?: boolean;
  initialSection?: "fields" | "value" | "calculation";
  initialConstantValue?: string | number;
  onValueSelect?: (value: string | number) => void;
  onEscape?: () => void;
  renderCalculation?: (
    onComplete: () => void,
    registerCloseGuard: (guard?: () => Promise<boolean>) => void,
  ) => ReactNode;
  renderFunction?: (onComplete: () => void) => ReactNode;
};

const RELATION_PREFIX = "relation:";
const FIELD_PREFIX = "field:";

function getJoinedContextFields(context: ApiQueryContextDefinition, metadata: MetadataEntity[]) {
  const projections = context.query.projection ?? [];
  if (!projections.length) {
    return metadata.find((item) => item.name === context.query.entity)?.fields.map((field) => field.name) ?? [];
  }

  const fields = projections.flatMap((projection) => {
    const firstNode = "fields" in projection ? projection.fields[0] : undefined;
    const projectedField = "field" in projection
      ? projection.field.kind === "field" ? projection.field.field : undefined
      : firstNode?.kind === "field" ? firstNode.field : undefined;
    const name = projection.alias?.trim() || projectedField;
    return name ? [name] : [];
  });
  return [...new Set(fields)];
}

// Follows relation names from the root entity; returns undefined when a segment cannot be resolved.
export function resolveEntity(root: MetadataEntity, metadata: MetadataEntity[], segments: string[]) {
  let current: MetadataEntity | undefined = root;
  for (const segment of segments) {
    const relation: { relatedEntity: string } | undefined = current?.relations?.find((item) => item.name === segment);
    current = relation && metadata.find((item) => item.name === relation.relatedEntity);
    if (!current) return undefined;
  }
  return current;
}

export default function FieldBox({
  entity,
  metadata,
  joinedContexts = [],
  value,
  onChange,
  onIncompleteChange,
  clearOnSelect = false,
  completeOnSelect = false,
  showPath = false,
  placeholder = "Select field…",
  placeholderIcon = false,
  ariaLabel = "Field",
  popupAnchor,
  excludedPaths = [],
  autoFocus = false,
  allowValueSelection = false,
  allowCalculationSelection = false,
  allowFunctionSelection = false,
  initialSection = "fields",
  initialConstantValue,
  onValueSelect,
  onEscape,
  renderCalculation,
  renderFunction,
}: FieldBoxProps) {
  const valueSegments = value ? value.split(".") : [];
  const [pendingPath, setPendingPath] = useState<string[] | null>(null);
  const [pendingJoinedContext, setPendingJoinedContext] = useState<ApiQueryContextDefinition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const popupManager = useContext(FieldBoxPopupContext);
  const popupId = useRef(Symbol());
  const isMenuOpen = menuOpen && (!popupManager || popupManager.activeMenuId === popupId.current);
  const [fieldSearch, setFieldSearch] = useState("");
  const [constantValue, setConstantValue] = useState(String(initialConstantValue ?? ""));
  const [activeSection, setActiveSection] = useState<"fields" | "value" | "calculation" | "function">(initialSection);
  const constantValueInputId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPopupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeGuardRef = useRef<(() => Promise<boolean>) | undefined>(undefined);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 420 });
  const registerCloseGuard = useCallback((guard?: () => Promise<boolean>) => {
    closeGuardRef.current = guard;
  }, []);

  const openMenu = () => {
    popupManager?.setActiveMenuId(popupId.current);
    setMenuOpen(true);
  };
  const closeMenu = () => {
    setMenuOpen(false);
    if (popupManager?.activeMenuId === popupId.current) popupManager.setActiveMenuId(null);
  };
  const requestCloseMenu = async () => {
    const closeAllowed = await closeGuardRef.current?.();
    if (closeAllowed === false) return false;
    closeMenu();
    return true;
  };
  const changeSection = async (section: typeof activeSection) => {
    if (section === activeSection) return;
    const changeAllowed = await closeGuardRef.current?.();
    if (changeAllowed === false) return;
    setActiveSection(section);
  };

  useEffect(() => {
    if (autoFocus) {
      popupManager?.setActiveMenuId(popupId.current);
      setMenuOpen(true);
    }
  }, [autoFocus, popupManager?.setActiveMenuId]);

  useLayoutEffect(() => {
    if (!isMenuOpen || !triggerRef.current) return;
    const updateMenuPosition = () => {
      if (!triggerRef.current) return;
      const anchor = popupAnchor
        ?? triggerRef.current.closest(".field-builder-editing")
        ?? triggerRef.current;
      const bounds = anchor.getBoundingClientRect();
      const menu = menuPopupRef.current;
      const menuHeight = menu
        ? Math.max(menu.getBoundingClientRect().height, menu.scrollHeight)
        : 420;
      const menuWidth = menu?.getBoundingClientRect().width ?? 200;
      const inFieldCard = Boolean(triggerRef.current.closest(".field-card"));
      const inProjectionFieldPicker = Boolean(triggerRef.current.closest(".projection-row-builder"));
      const inSelectedFieldCard = Boolean(triggerRef.current.closest(".field-card.selected"));
      const projectionBounds = inProjectionFieldPicker
        ? triggerRef.current.closest(".projection-section")?.getBoundingClientRect()
        : inSelectedFieldCard
          ? triggerRef.current.closest(".field-card.selected")?.getBoundingClientRect()
          : undefined;
      const positionBounds = projectionBounds ?? bounds;
      const openBelow = inProjectionFieldPicker || inSelectedFieldCard;
      const spaceBelow = window.innerHeight - positionBounds.bottom;
      const openAbove = !openBelow && (inFieldCard
        ? spaceBelow < Math.min(menuHeight, 180) + 4 && bounds.top > spaceBelow
        : spaceBelow < menuHeight + 4 && bounds.top >= menuHeight + 4);
      const availableHeight = openAbove ? positionBounds.top - 8 : spaceBelow - 8;
      const top = openAbove
        ? positionBounds.top - Math.min(menuHeight, availableHeight) - 4
        : positionBounds.bottom + (openBelow ? 0 : 4);
      const left = Math.min(positionBounds.left, Math.max(4, window.innerWidth - menuWidth - 4));
      setMenuPosition({
        top,
        left,
        maxHeight: inFieldCard || inProjectionFieldPicker
          ? Math.max(0, Math.min(menuHeight, availableHeight))
          : 420,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isMenuOpen, popupAnchor]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target) || menuPopupRef.current?.contains(event.target)) return;
      if (event.target instanceof Element) {
        const targetPopup = event.target.closest(".field-box-menu-popup");
        const ownerPopup = triggerRef.current?.closest(".field-box-menu-popup");
        if (targetPopup && targetPopup !== ownerPopup) return;
        if (event.target.closest(".message-box-backdrop")) return;
      }
      if (closeGuardRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      void requestCloseMenu().then((closed) => {
        if (closed) onEscape?.();
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") void requestCloseMenu();
    };

    document.addEventListener("mousedown", closeOnOutsideClick, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen, onEscape, popupManager]);
  useEffect(() => {
    if (!isMenuOpen) setFieldSearch("");
  }, [isMenuOpen]);
  useEffect(() => {
    if (menuOpen && popupManager && popupManager.activeMenuId !== popupId.current) setMenuOpen(false);
  }, [menuOpen, popupManager]);
  const valueJoinedContext = joinedContexts.find((context) => value.startsWith(`${context.alias ?? context.name}.`));
  const activeJoinedContext = pendingJoinedContext ?? valueJoinedContext;
  const path = activeJoinedContext ? [] : pendingPath ?? valueSegments.slice(0, -1);
  const current = resolveEntity(entity, metadata, path) ?? entity;
  const joinedContextFields = activeJoinedContext ? getJoinedContextFields(activeJoinedContext, metadata) : [];
  const selectedField = activeJoinedContext
    ? valueJoinedContext === activeJoinedContext
      ? value.slice((activeJoinedContext.alias ?? activeJoinedContext.name).length + 1)
      : ""
    : path.join(".") === valueSegments.slice(0, -1).join(".")
      ? valueSegments[valueSegments.length - 1] ?? ""
      : "";
  useEffect(() => {
    onIncompleteChange?.(pendingPath !== null || pendingJoinedContext !== null);
  }, [onIncompleteChange, pendingJoinedContext, pendingPath]);
  const selectValue = selectedField && (activeJoinedContext
    ? joinedContextFields.includes(selectedField)
    : current.fields.some((field) => field.name === selectedField))
    ? `${FIELD_PREFIX}${selectedField}`
    : "";

  const handleSelect = (selected: string) => {
    setFieldSearch("");
    if (selected.startsWith(RELATION_PREFIX)) {
      setPendingJoinedContext(null);
      setPendingPath([...path, selected.slice(RELATION_PREFIX.length)]);
      return;
    }
    if (!selected.startsWith(FIELD_PREFIX)) return;
    const field = selected.slice(FIELD_PREFIX.length);
    if (activeJoinedContext) {
      onChange(`${activeJoinedContext.alias ?? activeJoinedContext.name}.${field}`);
      setPendingJoinedContext(null);
      setPendingPath(null);
      closeMenu();
      return;
    }
    onChange([...path, field].join("."));
    setPendingPath(clearOnSelect ? [] : path);
    closeMenu();
  };

  const relations = (current.relations || []).filter((relation) => metadata.some((item) => item.name === relation.relatedEntity));
  const filteredJoinedContextFields = joinedContextFields.filter((field) =>
    field.toLowerCase().includes(fieldSearch.trim().toLowerCase()));
  const fields = current.fields.filter((field) =>
    !excludedPaths.includes([...path, field.name].join(".")));
  const filteredFields = fields.filter((field) => field.name.toLowerCase().includes(fieldSearch.trim().toLowerCase()));
  const fieldColumns = useMemo(() => {
    if (filteredFields.length === 0) return [];
    if (filteredFields.length <= 5) return [filteredFields];

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) context.font = '12px "DM Mono", monospace';
    const measuredFields = filteredFields
      .map((field, index) => ({
        field,
        index,
        width: context?.measureText(field.name).width ?? field.name.length,
      }))
      .sort((left, right) => left.width - right.width || left.index - right.index);
    const splitIndex = Math.ceil(measuredFields.length / 2);

    return [measuredFields.slice(0, splitIndex), measuredFields.slice(splitIndex)]
      .map((column) => column
        .sort((left, right) => left.index - right.index)
        .map(({ field }) => field));
  }, [filteredFields]);
  const isComplete = completeOnSelect && Boolean(value);
  const selectConstantValue = () => {
    const numberValue = Number(constantValue);
    const selectedValue = initialConstantValue !== undefined
      && String(initialConstantValue) === constantValue
      ? initialConstantValue
      : constantValue.trim() && Number.isFinite(numberValue)
        ? numberValue
        : constantValue;
    onValueSelect?.(selectedValue);
    closeMenu();
  };
  const hasAdditionalSections = allowValueSelection || allowCalculationSelection || allowFunctionSelection;
  const tabGridTemplateColumns = [
    "minmax(0, 1fr)",
    ...(allowValueSelection ? ["minmax(0, 1fr)"] : []),
    ...(allowCalculationSelection ? ["minmax(0, 1.4fr)"] : []),
    ...(allowFunctionSelection ? ["minmax(0, 1fr)"] : []),
  ].join(" ");

  return <div className="field-box">
    {!isComplete && !showPath && path.map((segment, index) => <span className="field-box-crumb" key={`${index}-${segment}`}>
      <button type="button" className="field-box-segment" title={`Back to ${index ? path[index - 1] : entity.name}`} onClick={() => setPendingPath(path.slice(0, index))}>{segment}</button>
      <span className="field-box-dot">.</span>
    </span>)}
    {!isComplete && <div className={`field-box-menu${value ? " field-box-menu-selected" : ""}`} ref={isMenuOpen ? menuRef : undefined}>
      <button
        type="button"
        autoFocus={autoFocus}
        ref={triggerRef}
        className="operator-trigger"
        aria-label={ariaLabel}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        onClick={() => {
          if (isMenuOpen) void requestCloseMenu();
          else openMenu();
        }}
      >
        {(() => {
          const label = showPath && activeJoinedContext && pendingJoinedContext
            ? activeJoinedContext.alias ?? activeJoinedContext.name
            : showPath && (pendingPath?.length ? pendingPath.join(".") : value)
              ? (pendingPath?.length ? pendingPath.join(".") : value)
              : selectedField || placeholder;
          return placeholderIcon && label === placeholder
            ? <><Icon name="plus" size={12} /><span className="action-link-text field-box-trigger-label">{label}</span></>
            : <span className="field-box-trigger-label">{label}</span>;
        })()}
      </button>
      {isMenuOpen && createPortal(<div
        ref={menuPopupRef}
        className={`operator-menu field-box-menu-popup${hasAdditionalSections ? " field-box-menu-popup-advanced" : ""}${activeSection === "fields" ? " field-box-menu-popup-fields" : ""}${activeSection === "value" ? " field-box-menu-popup-value" : ""}${activeSection === "calculation" && renderCalculation ? " field-box-menu-popup-calculation" : ""}${activeSection === "function" && renderFunction ? " field-box-menu-popup-function" : ""}`}
        style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, maxHeight: hasAdditionalSections ? "none" : menuPosition.maxHeight, transform: "none", margin: 0 }}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (event.target instanceof Element && event.target.closest(
            "button, input, select, textarea, a, label, [role='button'], [role='tab'], [role='option'], [contenteditable='true']",
          )) return;
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          void requestCloseMenu().then((closed) => {
            if (closed) onEscape?.();
          });
        }}
        role="group"
        aria-label={`${ariaLabel} options`}
      >
        {hasAdditionalSections && <div
          className="field-box-chooser-tabs"
          role="tablist"
          aria-label="Field selection type"
          style={{ gridTemplateColumns: tabGridTemplateColumns }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "fields"}
            className={`field-box-chooser-tab${activeSection === "fields" ? " active" : ""}`}
            onClick={() => void changeSection("fields")}
          ><Icon name="database" size={12} />Fields</button>
          {allowValueSelection && <button
            type="button"
            role="tab"
            aria-selected={activeSection === "value"}
            className={`field-box-chooser-tab${activeSection === "value" ? " active" : ""}`}
            onClick={() => void changeSection("value")}
          ><Icon name="edit" size={12} />Value</button>}
          {allowCalculationSelection && <button
            type="button"
            role="tab"
            aria-selected={activeSection === "calculation"}
            className={`field-box-chooser-tab${activeSection === "calculation" ? " active" : ""}`}
            onClick={() => void changeSection("calculation")}
          ><Icon name="sliders" size={12} />Calculation</button>}
          {allowFunctionSelection && <button
            type="button"
            role="tab"
            aria-selected={activeSection === "function"}
            className={`field-box-chooser-tab${activeSection === "function" ? " active" : ""}`}
            onClick={() => void changeSection("function")}
          ><Icon name="code" size={12} />Function</button>}
        </div>}
        {activeSection === "value" && allowValueSelection
          ? <div className="field-box-value-panel" role="tabpanel" aria-label="Constant value">
            <label className="field-box-value-label" htmlFor={constantValueInputId}>Constant value</label>
            <input
                id={constantValueInputId}
              type="text"
              className="field-box-search field-box-value-input"
              aria-label="Constant value"
              placeholder="Enter text or a number"
              autoFocus
              value={constantValue}
              onChange={(event) => setConstantValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  selectConstantValue();
                }
              }}
            />
            <button type="button" className="field-box-value-submit" onClick={selectConstantValue}><Icon name="check" size={12} /> Apply</button>
          </div>
          : activeSection === "calculation" && allowCalculationSelection
            ? <div className={`field-box-value-panel field-box-calculation-panel${renderCalculation ? " field-box-calculation-panel-expanded" : ""}`} role="tabpanel" aria-label="Calculation">
              {renderCalculation
                ? renderCalculation(closeMenu, registerCloseGuard)
                : <span className="field-box-calculation-hint">Build an expression from fields, SQL functions, and values.</span>}
            </div>
            : activeSection === "function" && allowFunctionSelection
              ? <div className={`field-box-value-panel field-box-calculation-panel${renderFunction ? " field-box-calculation-panel-expanded" : ""}`} role="tabpanel" aria-label="Function">
                {renderFunction
                  ? renderFunction(closeMenu)
                  : <span className="field-box-calculation-hint">Choose a SQL function.</span>}
              </div>
            : <div role={hasAdditionalSections ? "tabpanel" : undefined} aria-label={hasAdditionalSections ? "Fields" : undefined}>
              <input
                type="search"
                className="field-box-search"
                aria-label="Search fields"
                placeholder="Search fields…"
                autoFocus
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
              />
              <div role="listbox" aria-label="Available fields">
                {activeJoinedContext ? <>
                  <span className="field-box-menu-label">{activeJoinedContext.alias ?? activeJoinedContext.name} fields</span>
                  {filteredJoinedContextFields.map((field) => (
                    <button type="button" className={`operator-option${selectValue === `${FIELD_PREFIX}${field}` ? " operator-option-selected" : ""}`} role="option" aria-selected={selectValue === `${FIELD_PREFIX}${field}`} key={field} onClick={() => handleSelect(`${FIELD_PREFIX}${field}`)}>
                      {field}
                    </button>
                  ))}
                  {filteredJoinedContextFields.length === 0 && <span className="field-box-no-results">No matching fields</span>}
                  <button type="button" className="operator-option" onClick={() => {
                    setPendingJoinedContext(null);
                    setPendingPath([]);
                  }}>Back to fields and relations</button>
                </> : <>
                {(joinedContexts.length > 0 || relations.length > 0) && <>
                  <span className="field-box-menu-label">Relations</span>
                  {joinedContexts.map((context) => (
                    <button type="button" className="operator-option" role="option" key={context.id ?? context.name} onClick={() => {
                      setPendingPath(null);
                      setPendingJoinedContext(context);
                      setFieldSearch("");
                    }}>
                      {context.alias ?? context.name}
                    </button>
                  ))}
                  {relations.map((relation) => (
                    <button type="button" className="operator-option" role="option" key={relation.name} onClick={() => handleSelect(`${RELATION_PREFIX}${relation.name}`)}>
                      {relation.name}
                    </button>
                  ))}
                </>}
                <span className="field-box-menu-label">{current.name} fields</span>
                {fieldColumns.length > 0 && <div
                  className="field-box-field-grid"
                  style={{ gridTemplateColumns: `repeat(${fieldColumns.length}, max-content)` }}
                >
                  {fieldColumns.map((column, columnIndex) => <div className="field-box-field-column" key={columnIndex}>
                    {column.map((field) => (
                      <button type="button" className={`operator-option${selectValue === `${FIELD_PREFIX}${field.name}` ? " operator-option-selected" : ""}`} role="option" aria-selected={selectValue === `${FIELD_PREFIX}${field.name}`} key={field.name} onClick={() => handleSelect(`${FIELD_PREFIX}${field.name}`)}>
                        {field.name}
                      </button>
                    ))}
                  </div>)}
                </div>}
                {filteredFields.length === 0 && <span className="field-box-no-results">No matching fields</span>}
                </>}
              </div>
            </div>}
      </div>, document.body)}
    </div>}
    {completeOnSelect && value && <span className="field-box-completed" aria-label={`Selected ${ariaLabel.toLowerCase()}: ${value}`}>
      <span>{value}</span>
    </span>}
  </div>;
}
