import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../icon/icon";
import { fetchDbTableData, selectDbTable, setPreviewDbTable } from "../database-slice";
import "./diagram-view.css";

export type DiagramTable = {
  schema: string;
  name: string;
  columns: { name: string; dataType: string; isPrimaryKey: boolean; isNullable?: boolean }[];
};

type DiagramViewProps = {
  tables?: DiagramTable[];
  onOpenTable?: (table: DiagramTable) => void;
};

const CARD_WIDTH = 210;
const CARD_HEIGHT = 112;
const BOARD_MARGIN = 20;
const ARROW_CLEARANCE = 8;
const TABLE_DOMAINS = {
  Locations: ["HR", "Healthcare"],
  Users: ["Insurance", "Sales", "Healthcare"],
  Departments: ["HR"],
  Employees: ["HR", "Insurance", "Sales", "Healthcare"],
  PerformanceReviews: ["HR"],
  LeaveRequests: ["HR"],
  Products: ["Sales"],
  Orders: ["Sales"],
  OrderItems: ["Sales"],
  Diagnoses: ["Healthcare"],
  Visits: ["Healthcare"],
  LabResults: ["Healthcare"],
  InsurancePlans: ["Insurance"],
  Policies: ["Insurance"],
  PremiumPayments: ["Insurance"],
  Claims: ["Insurance"],
};
const DOMAIN_ORDER = ["Sales", "HR", "Insurance", "Healthcare", "Others", "All"];
const DOMAIN_TONES = {
  HR: "finance",
  Insurance: "customer",
  Sales: "revenue",
  Healthcare: "product",
  Others: "custom",
};

function tableKey(schema, name) {
  return `${schema}.${name}`;
}

function domainTone(domain) {
  return DOMAIN_TONES[domain] || "custom";
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0
    && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function rectangleFor(position, width, height, padding = 0) {
  return {
    left: position.x - padding,
    right: position.x + width + padding,
    top: position.y - padding,
    bottom: position.y + height + padding,
  };
}

function rectanglesOverlap(left, right) {
  return left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top;
}

function pointInRectangle(point, rectangle) {
  return point.x >= rectangle.left && point.x <= rectangle.right
    && point.y >= rectangle.top && point.y <= rectangle.bottom;
}

function segmentIntersectsRectangle(start, end, rectangle) {
  if (pointInRectangle(start, rectangle) || pointInRectangle(end, rectangle)) return true;
  const topLeft = { x: rectangle.left, y: rectangle.top };
  const topRight = { x: rectangle.right, y: rectangle.top };
  const bottomLeft = { x: rectangle.left, y: rectangle.bottom };
  const bottomRight = { x: rectangle.right, y: rectangle.bottom };
  return segmentsCross(start, end, topLeft, topRight)
    || segmentsCross(start, end, topRight, bottomRight)
    || segmentsCross(start, end, bottomRight, bottomLeft)
    || segmentsCross(start, end, bottomLeft, topLeft);
}

function relationGeometry(from, to, cardWidth, fromHeight, toHeight = fromHeight) {
  const start = { x: from.x + cardWidth / 2, y: from.y + fromHeight / 2 };
  const end = { x: to.x + cardWidth / 2, y: to.y + toHeight / 2 };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance === 0) return null;
  const unitX = (end.x - start.x) / distance;
  const unitY = (end.y - start.y) / distance;
  const cardExtent = cardWidth * Math.abs(unitX) + ((fromHeight + toHeight) / 2) * Math.abs(unitY);
  const requiredDistance = cardExtent + 20 + ARROW_CLEARANCE;
  const fromOffset = (cardWidth / 2) * Math.abs(unitX) + (fromHeight / 2) * Math.abs(unitY);
  const toOffset = (cardWidth / 2) * Math.abs(unitX) + (toHeight / 2) * Math.abs(unitY);
  return {
    start: { x: start.x + unitX * fromOffset, y: start.y + unitY * fromOffset },
    end: { x: end.x - unitX * (toOffset + ARROW_CLEARANCE), y: end.y - unitY * (toOffset + ARROW_CLEARANCE) },
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    distance,
    requiredDistance,
  };
}

function createLayout(tables, relationships, boardWidth, boardHeight) {
  const degree = new Map(tables.map((table) => [tableKey(table.schema, table.name), 0]));
  relationships.forEach((relation) => {
    degree.set(relation.from, (degree.get(relation.from) || 0) + 1);
    degree.set(relation.to, (degree.get(relation.to) || 0) + 1);
  });
  const byName = (left, right) => left.name.localeCompare(right.name);
  const orderedTables = [...tables].sort((left, right) =>
    degree.get(tableKey(right.schema, right.name)) - degree.get(tableKey(left.schema, left.name))
    || byName(left, right));
  const cardWidth = Math.min(CARD_WIDTH, Math.max(140, boardWidth - 2 * BOARD_MARGIN));
  const cardHeight = Math.min(CARD_HEIGHT, Math.max(80, boardHeight - 2 * BOARD_MARGIN));
  const center = { x: boardWidth / 2, y: boardHeight / 2 };
  const maxRadiusX = Math.max(0, (boardWidth - cardWidth) / 2 - BOARD_MARGIN);
  const maxRadiusY = Math.max(0, (boardHeight - cardHeight) / 2 - BOARD_MARGIN);
  const positions = new Map();
  const laidOutEdges = [];

  if (orderedTables.length === 0) {
    return { cardWidth, cardHeight, positions };
  }

  function candidateScore(key, candidate) {
    const candidateRect = rectangleFor(candidate, cardWidth, cardHeight, 12);
    let score = 0;
    for (const [otherKey, otherPosition] of positions) {
      const otherRect = rectangleFor(otherPosition, cardWidth, cardHeight, 12);
      if (rectanglesOverlap(candidateRect, otherRect)) score += 1e9;
    }

    const relationEdges = relationships.filter((relation) =>
      (relation.from === key && positions.has(relation.to))
      || (relation.to === key && positions.has(relation.from)));
    const candidatePositions = new Map(positions);
    candidatePositions.set(key, candidate);
    const newGeometries = [];
    for (const relation of relationEdges) {
      const geometry = relationGeometry(
        candidatePositions.get(relation.from),
        candidatePositions.get(relation.to),
        cardWidth,
        cardHeight,
      );
      if (!geometry) continue;
      const shortfall = Math.max(0, geometry.requiredDistance - geometry.distance);
      score += shortfall * shortfall * 100;
      for (const [tableKeyValue, position] of positions) {
        if (tableKeyValue === relation.from || tableKeyValue === relation.to) continue;
        const tableRect = rectangleFor(position, cardWidth, cardHeight, 4);
        if (segmentIntersectsRectangle(geometry.start, geometry.end, tableRect)) score += 1e8;
      }
      for (const existing of laidOutEdges) {
        if (relation.from === existing.relation.from || relation.from === existing.relation.to
          || relation.to === existing.relation.from || relation.to === existing.relation.to) continue;
        if (segmentsCross(geometry.start, geometry.end, existing.geometry.start, existing.geometry.end)) score += 1e8;
      }
      newGeometries.push({ relation, geometry });
    }

    const tableDegree = degree.get(key) || 0;
    score += Math.hypot(candidate.x + cardWidth / 2 - center.x, candidate.y + cardHeight / 2 - center.y)
      * (tableDegree + 1) * 0.1;
    newGeometries.forEach(({ geometry }) => {
      score += Math.max(0, geometry.distance - geometry.requiredDistance - 220) * 0.15;
    });
    return score;
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  orderedTables.forEach((table, index) => {
    const key = tableKey(table.schema, table.name);
    if (index === 0) {
      positions.set(key, { x: center.x - cardWidth / 2, y: center.y - cardHeight / 2 });
      return;
    }

    let bestPosition = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const ringCount = 8;
    const angleCount = Math.max(24, orderedTables.length * 8);
    for (let ring = 1; ring <= ringCount; ring += 1) {
      const radius = ring / ringCount;
      for (let angleIndex = 0; angleIndex < angleCount; angleIndex += 1) {
        const angle = angleIndex * goldenAngle + index * 0.37;
        const candidate = {
          x: center.x + Math.cos(angle) * maxRadiusX * radius - cardWidth / 2,
          y: center.y + Math.sin(angle) * maxRadiusY * radius - cardHeight / 2,
        };
        const score = candidateScore(key, candidate);
        if (score < bestScore) {
          bestScore = score;
          bestPosition = candidate;
        }
      }
    }
    positions.set(key, bestPosition || { x: center.x - cardWidth / 2, y: center.y - cardHeight / 2 });

    relationships.forEach((relation) => {
      if (relation.from !== key && relation.to !== key) return;
      const from = positions.get(relation.from);
      const to = positions.get(relation.to);
      if (!from || !to) return;
      const geometry = relationGeometry(from, to, cardWidth, cardHeight);
      if (geometry) laidOutEdges.push({ relation, geometry });
    });
  });

  const bounds = [...positions.values()].reduce((current, position) => ({
    left: Math.min(current.left, position.x),
    right: Math.max(current.right, position.x + cardWidth),
    top: Math.min(current.top, position.y),
    bottom: Math.max(current.bottom, position.y + cardHeight),
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  });
  const graphCenterX = (bounds.left + bounds.right) / 2;
  const graphCenterY = (bounds.top + bounds.bottom) / 2;
  const offsetX = Math.max(
    BOARD_MARGIN - bounds.left,
    Math.min(boardWidth - BOARD_MARGIN - bounds.right, center.x - graphCenterX),
  );
  const offsetY = Math.max(
    BOARD_MARGIN - bounds.top,
    Math.min(boardHeight - BOARD_MARGIN - bounds.bottom, center.y - graphCenterY),
  );
  positions.forEach((position, key) => {
    positions.set(key, { x: position.x + offsetX, y: position.y + offsetY });
  });

  return {
    cardWidth,
    cardHeight,
    positions,
  };
}

function getDiagramRelationships(activeGroup, schemaRelationships) {
  const tableByKey = new Map((activeGroup?.tables || []).map((table) => [tableKey(table.schema, table.name), table]));
  const sourceRelations = schemaRelationships.filter((relation) =>
    tableByKey.has(tableKey(relation.sourceSchema, relation.sourceTable))
    && tableByKey.has(tableKey(relation.targetSchema, relation.targetTable)));
  const junctionKeys = new Set(sourceRelations
    .reduce((byTable, relation) => {
      const key = tableKey(relation.sourceSchema, relation.sourceTable);
      byTable.set(key, [...(byTable.get(key) || []), relation]);
      return byTable;
    }, new Map())
    .entries()
    .filter(([key, relations]) => {
      const table = tableByKey.get(key);
      const primaryKeys = table.columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
      const foreignKeyColumns = new Set(relations.flatMap((relation) => relation.sourceColumns));
      return relations.length >= 2 && primaryKeys.length > 0 && primaryKeys.every((column) => foreignKeyColumns.has(column));
    })
    .map(([key]) => key));

  const edges = sourceRelations
    .filter((relation) => !junctionKeys.has(tableKey(relation.sourceSchema, relation.sourceTable)))
    .map((relation) => ({
      ...relation,
      from: tableKey(relation.sourceSchema, relation.sourceTable),
      to: tableKey(relation.targetSchema, relation.targetTable),
      isManyToMany: false,
    }));

  for (const junctionKey of junctionKeys) {
    const joinedRelations = sourceRelations.filter((relation) =>
      tableKey(relation.sourceSchema, relation.sourceTable) === junctionKey);
    for (let index = 1; index < joinedRelations.length; index += 1) {
      const first = joinedRelations[0];
      const second = joinedRelations[index];
      edges.push({
        ...first,
        name: tableByKey.get(junctionKey).name,
        from: tableKey(first.targetSchema, first.targetTable),
        to: tableKey(second.targetSchema, second.targetTable),
        isUnique: false,
        isManyToMany: true,
      });
    }
  }
  return edges;
}

export default function DiagramView({ tables: suppliedTables, onOpenTable }: DiagramViewProps) {
  const dispatch = useDispatch();
  const { schema, schemaStatus, schemaError, debugUiEnabled } = useSelector((state) => state.database);
  const diagramTables = suppliedTables || schema.tables;
  const [positions, setPositions] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [selectedGroup, setSelectedGroup] = useState("");
  const [boardSize, setBoardSize] = useState({ width: 720, height: 360 });
  const [layoutSize, setLayoutSize] = useState({ width: 720, height: 360 });
  const [autoRange, setAutoRange] = useState(true);
  const drag = useRef(null);
  const hasInitialLayoutSize = useRef(false);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollElement) return undefined;
    const updateSize = (width, height) => {
      if (width <= 0 || height <= 0) return;
      const nextWidth = Math.max(320, Math.floor(width));
      const nextHeight = Math.max(220, Math.floor(height));
      if (!hasInitialLayoutSize.current) {
        setLayoutSize({ width: nextWidth, height: nextHeight });
        hasInitialLayoutSize.current = true;
      }
      if (autoRange && !suppliedTables) {
        setLayoutSize({ width: nextWidth, height: nextHeight });
        setPositions({});
      }
      setBoardSize((current) => current.width === nextWidth && current.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight });
    };
    const bounds = scrollElement.getBoundingClientRect();
    updateSize(bounds.width, bounds.height);
    const observer = new ResizeObserver(([entry]) => {
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [autoRange, scrollElement]);

  const groups = useMemo(() => {
    const grouped = new Map(DOMAIN_ORDER.map((name) => [name, []]));
    if (suppliedTables) {
      grouped.set("All", diagramTables);
    } else {
      grouped.get("All").push(...diagramTables);
    }
    for (const table of diagramTables) {
      const domains = TABLE_DOMAINS[table.name] || ["Others"];
      for (const domain of domains) grouped.get(domain).push(table);
    }
    return [...grouped.entries()]
      .filter(([, tables]) => tables.length > 0)
      .map(([name, tables]) => ({
        name,
        tables: tables.sort((left, right) => left.name.localeCompare(right.name)),
      }));
  }, [diagramTables, suppliedTables]);

  const activeGroup = suppliedTables
    ? groups.find((group) => group.name === "All")
    : groups.find((group) => group.name === selectedGroup) || groups[0];

  const relationships = useMemo(
    () => getDiagramRelationships(activeGroup, schema.relationships),
    [activeGroup, schema.relationships],
  );

  const layout = useMemo(() => {
    const next = createLayout(activeGroup?.tables || [], relationships, layoutSize.width, layoutSize.height);
    return {
      cardWidth: next.cardWidth,
      cardHeight: next.cardHeight,
      positions: Object.fromEntries(next.positions),
    };
  }, [activeGroup, layoutSize, relationships]);
  const tablePositions = { ...layout.positions, ...positions };

  function startDrag(event, key) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPositions(tablePositions);
    drag.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: tablePositions[key],
    };
  }

  function moveDrag(event) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const currentDrag = drag.current;
    setPositions((current) => ({
      ...current,
      [currentDrag.key]: {
        x: Math.max(0, Math.min(boardSize.width - layout.cardWidth, currentDrag.origin.x + event.clientX - currentDrag.startX)),
        y: Math.max(0, Math.min(boardSize.height - layout.cardHeight, currentDrag.origin.y + event.clientY - currentDrag.startY)),
      },
    }));
  }

  function endDrag(event) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function previewTable(table) {
    const selection = { name: table.name, schema: table.schema };
    dispatch(selectDbTable(selection));
    dispatch(setPreviewDbTable(selection));
    dispatch(fetchDbTableData({ tableName: table.name, schema: table.schema, limit: 10, refresh: true }));
  }

  if (!suppliedTables && (schemaStatus === "loading" || schemaStatus === "idle")) {
    return <div className="diagram-state"><Icon name="schema" size={20} /><span>Loading database relationships…</span></div>;
  }
  if (!suppliedTables && schemaStatus === "failed") {
    return <p className="diagram-state error" role="alert">{schemaError || "Unable to load database relationships."}</p>;
  }
  if (diagramTables.length === 0) {
    return <div className="diagram-state"><Icon name="table" size={20} /><span>No database tables are available.</span></div>;
  }

  return (
    <section className="database-diagram" aria-label="Database relationship diagram">
      {!suppliedTables && <div className="diagram-toolbar">
        <div>
          <span className="section-kicker">DATABASE SCHEMA</span>
          <p>Choose a domain to explore its relationships. Drag tables to adjust the layout; expand a table to inspect its columns. Double-click a table header to preview its first 10 rows.</p>
        </div>
      </div>}
      {!suppliedTables && <div className="diagram-group-toolbar">
        <nav className="diagram-group-switch" aria-label="Diagram table groups">
          {groups.map((group) => (
            <button
              type="button"
              className={`diagram-group-button tone-${domainTone(group.name)}${activeGroup?.name === group.name ? " active" : ""}`}
              aria-pressed={activeGroup?.name === group.name}
              key={group.name}
              onClick={() => {
                if (debugUiEnabled) {
                  const nextRelationships = getDiagramRelationships(group, schema.relationships);
                  const nextLayoutData = createLayout(group.tables, nextRelationships, boardSize.width, boardSize.height);
                  const nextLayout = {
                    cardWidth: nextLayoutData.cardWidth,
                    cardHeight: nextLayoutData.cardHeight,
                    positions: Object.fromEntries(nextLayoutData.positions),
                  };
                  console.log("Database diagram render model:", {
                    schema,
                    groups,
                    selectedGroup: group.name,
                    activeGroup: group,
                    relationships: nextRelationships,
                    layout: nextLayout,
                    tablePositions: nextLayout.positions,
                    expandedTables,
                    boardSize,
                    layoutSize: boardSize,
                  });
                }
                setSelectedGroup(group.name);
                setLayoutSize(boardSize);
                setPositions({});
              }}
            >
              <span className="diagram-group-mark" aria-hidden="true" />
              <strong>{group.name}</strong>
              <span className="diagram-group-count">{group.tables.length}</span>
            </button>
          ))}
        </nav>
        <div className="diagram-layout-controls">
          <label className="diagram-auto-range">
            <input
              type="checkbox"
              checked={autoRange}
              onChange={(event) => {
                const enabled = event.target.checked;
                setAutoRange(enabled);
                if (enabled) {
                  setLayoutSize(boardSize);
                  setPositions({});
                }
              }}
            />
            <span>Auto</span>
          </label>
          <button
            type="button"
            className="diagram-arrange-button"
            onClick={() => {
              setLayoutSize(boardSize);
              setPositions({});
            }}
          >
            <Icon name="reset" size={14} /> Arrange
          </button>
        </div>
      </div>}
      <div className="diagram-scroll" ref={setScrollElement}>
        <div className="diagram-board" style={boardSize}>
          <svg className="diagram-relations" width={boardSize.width} height={boardSize.height} aria-label="Table relationships">
            <defs>
              <marker id="diagram-relation-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" />
              </marker>
            </defs>
            {relationships.map((relation, index) => {
              const from = tablePositions[relation.from];
              const to = tablePositions[relation.to];
              if (!from || !to) return null;
              const fromHeight = expandedTables[relation.from] ? layout.cardHeight : 42;
              const toHeight = expandedTables[relation.to] ? layout.cardHeight : 42;
              const geometry = relationGeometry(from, to, layout.cardWidth, fromHeight, toHeight);
              if (!geometry) return null;
              return (
                        <g className={`diagram-edge${relation.isManyToMany ? " many-to-many" : ""}`} key={`${relation.name}-${index}`}>
                          <path
                            d={`M ${geometry.start.x} ${geometry.start.y} L ${geometry.end.x} ${geometry.end.y}`}
                            markerEnd="url(#diagram-relation-arrow)"
                          />
                          </g>
              );
            })}
          </svg>
          {(activeGroup?.tables || []).map((table) => {
            const key = tableKey(table.schema, table.name);
            const position = tablePositions[key];
            const expanded = Boolean(expandedTables[key]);
            return (
              <article
                className={`diagram-table-card${expanded ? " expanded" : ""}`}
                key={key}
                style={{ left: position.x, top: position.y, width: layout.cardWidth, height: expanded ? layout.cardHeight : 42 }}
              >
                <button
                  type="button"
                  className="diagram-table-header"
                  onClick={() => {
                    dispatch(selectDbTable({ name: table.name, schema: table.schema }));
                    onOpenTable?.(table);
                  }}
                  onDoubleClick={() => previewTable(table)}
                  onPointerDown={(event) => startDrag(event, key)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  title={`Double-click to preview ${table.name}`}
                >
                  <Icon name="table" size={15} />
                  <span>{table.name}</span>
                  <small>{table.columns.length}</small>
                  <span className="diagram-table-schema">{table.schema}</span>
                </button>
                <button
                  type="button"
                  className="diagram-column-toggle"
                  aria-label={`${expanded ? "Collapse" : "Expand"} columns for ${table.name}`}
                  aria-expanded={expanded}
                  onClick={() => setExpandedTables((current) => ({ ...current, [key]: !current[key] }))}
                  title={expanded ? "Collapse columns" : "Expand columns"}
                >
                  <Icon name={expanded ? "chevron-down" : "chevron-right"} size={13} />
                </button>
                {expanded && (
                  <ul className="diagram-column-list">
                    {table.columns.map((column) => (
                      <li key={column.name} title={`${column.name} — ${column.dataType || "unknown type"}`}>
                        <span className="diagram-column-key primary">
                          {column.isPrimaryKey && <Icon name="key" size={13} />}
                        </span>
                        <span className={`diagram-column-name${column.isPrimaryKey ? " primary" : ""}`}>{column.name}</span>
                        <span className="diagram-column-type" title="Nullable">{column.isNullable ? "YES" : "NO"}</span>
                      </li>
                    ))}
                    {table.columns.length === 0 && <li className="diagram-no-columns">No columns</li>}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
