import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkEdgeSection, ElkNode } from "elkjs/lib/elk-api";
import Icon, { type IconName } from "../../icon/icon";
import { fetchDbTableData, selectDbTable, setPreviewDbTable } from "../../data-sources/database-slice";
import "./diagram-view.css";

export type DiagramTable = {
  schema: string;
  name: string;
  dbTable?: string | null;
  columns: { name: string; dataType: string; isPrimaryKey: boolean; isNullable?: boolean }[];
};
export type DiagramGroupTone = "revenue" | "customer" | "product" | "finance" | "custom";
export type DiagramRelationship = {
  name: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
  isUnique: boolean;
  sourceRelationIndex?: number;
};
export const DIAGRAM_GROUP_TONES: DiagramGroupTone[] = ["revenue", "customer", "product", "finance", "custom"];

const dataTypeIcons: Record<string, IconName> = {
  string: "type",
  number: "type-number",
  boolean: "type-boolean",
  datetime: "type-datetime",
};

function getDataTypeIcon(dataType: string): IconName {
  const normalized = dataType.trim().toLowerCase();
  if (normalized === "number" || normalized === "numeric" || normalized === "int" || normalized === "integer" || normalized === "decimal" || normalized === "float") {
    return dataTypeIcons.number;
  }
  if (normalized === "boolean" || normalized === "bool" || normalized === "bit") {
    return dataTypeIcons.boolean;
  }
  if (normalized === "datetime" || normalized === "datetime2" || normalized === "date" || normalized === "time" || normalized === "timestamp") {
    return dataTypeIcons.datetime;
  }
  return dataTypeIcons[normalized] || dataTypeIcons.string;
}

type DiagramViewProps = {
  tables?: DiagramTable[];
  groups?: { id?: string; name: string; tables: DiagramTable[]; tone?: DiagramGroupTone }[];
  initialGroup?: string;
  selectedTableName?: string;
  loading?: boolean;
  relationships?: DiagramRelationship[];
  onSelectGroup?: (groupId: string) => void;
  onSelectRelation?: (relation: DiagramRelationship & { from: string; to: string }) => void;
  relationInspector?: ReactNode;
  onOpenTable?: (table: DiagramTable) => void;
  navigationActions?: ReactNode;
  hideActiveGroup?: boolean;
  compactCards?: boolean;
};

const CARD_WIDTH = 180;
const CARD_HEIGHT = 96;
const COLLAPSED_CARD_HEIGHT = 42;
const COMPACT_CARD_HEIGHT = 30;
const FIELD_ROW_HEIGHT = 21;
const FIELD_LIST_PADDING = 4;
const MIN_FIELD_ROWS = 5;
const DEFAULT_VISIBLE_FIELD_ROWS = 8;
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

function compactCardWidth(name, columns = [], expanded = false) {
  const longestText = expanded
    ? Math.max(name.length, ...columns.map((column) => column.name.length))
    : name.length;
  return Math.max(60, longestText * 7 + 41);
}

// Field popup default height shows up to 8 rows; the list scrolls beyond that.
function compactPopupDefaultHeight(columns = []) {
  return Math.min(Math.max(MIN_FIELD_ROWS, columns.length), DEFAULT_VISIBLE_FIELD_ROWS) * FIELD_ROW_HEIGHT + FIELD_LIST_PADDING;
}

// Popup height where every field is visible; resizing stops here so the list never scrolls.
function compactPopupMaxHeight(columns = []) {
  return Math.max(MIN_FIELD_ROWS, columns.length) * FIELD_ROW_HEIGHT + FIELD_LIST_PADDING;
}

function compactPopupMinHeight() {
  return FIELD_ROW_HEIGHT + FIELD_LIST_PADDING;
}

function translateEdgePath(path, offset) {
  return path.replace(/([ML])\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, command, x, y) =>
    `${command} ${Number(x) + offset.x} ${Number(y) + offset.y}`);
}

export function diagramGroupTone(index: number): DiagramGroupTone {
  return DIAGRAM_GROUP_TONES[index % DIAGRAM_GROUP_TONES.length];
}

function domainTone(domain): DiagramGroupTone {
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

function relationGeometry(from, to, fromWidth, fromHeight, toWidth = fromWidth, toHeight = fromHeight) {
  const start = { x: from.x + fromWidth / 2, y: from.y + fromHeight / 2 };
  const end = { x: to.x + toWidth / 2, y: to.y + toHeight / 2 };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance === 0) return null;
  const unitX = (end.x - start.x) / distance;
  const unitY = (end.y - start.y) / distance;
  const cardExtent = ((fromWidth + toWidth) / 2) * Math.abs(unitX) + ((fromHeight + toHeight) / 2) * Math.abs(unitY);
  const requiredDistance = cardExtent + 20 + ARROW_CLEARANCE;
  const fromOffset = (fromWidth / 2) * Math.abs(unitX) + (fromHeight / 2) * Math.abs(unitY);
  const toOffset = (toWidth / 2) * Math.abs(unitX) + (toHeight / 2) * Math.abs(unitY);
  return {
    start: { x: start.x + unitX * fromOffset, y: start.y + unitY * fromOffset },
    end: { x: end.x - unitX * toOffset, y: end.y - unitY * toOffset },
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    distance,
    requiredDistance,
  };
}

type CompactLayout = {
  positions: Record<string, { x: number; y: number }>;
  edgePaths: Record<string, string>;
  width: number;
  height: number;
};

const elk = new ELK();

async function createCompactLayout(tables, relationships, boardWidth, boardHeight): Promise<CompactLayout> {
  const graph: ElkNode = {
    id: "diagram",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": boardWidth > boardHeight * 1.15 ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.spacing.nodeNodeBetweenLayers": "24",
      "elk.spacing.nodeNode": "16",
    },
    children: tables.map((table) => ({
      id: tableKey(table.schema, table.name),
      width: compactCardWidth(table.name),
      height: COMPACT_CARD_HEIGHT,
    })),
    edges: relationships.map((relation, index) => ({
      id: `edge-${index}`,
      sources: [relation.from],
      targets: [relation.to],
    })),
  };
  const result = await elk.layout(graph);
  const children = result.children || [];
  const minX = Math.min(...children.map((child) => child.x || 0), 0);
  const minY = Math.min(...children.map((child) => child.y || 0), 0);
  const maxX = Math.max(...children.map((child) => (child.x || 0) + (child.width || 0)), 0);
  const maxY = Math.max(...children.map((child) => (child.y || 0) + (child.height || 0)), 0);
  const offsetX = Math.max(BOARD_MARGIN, (boardWidth - (maxX - minX)) / 2) - minX;
  const offsetY = Math.max(BOARD_MARGIN, (boardHeight - (maxY - minY)) / 2) - minY;
  const positions = Object.fromEntries(children.map((child) => [
    child.id,
    { x: (child.x || 0) + offsetX, y: (child.y || 0) + offsetY },
  ]));
  const edgePaths = Object.fromEntries((result.edges || []).flatMap((edge) =>
    (edge.sections || []).map((section: ElkEdgeSection) => {
      const points = [
        section.startPoint,
        ...(section.bendPoints || []),
        section.endPoint,
      ];
      const path = points.map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x + offsetX} ${point.y + offsetY}`).join(" ");
      return [edge.id, path];
    }),
  ));
  return {
    positions,
    edgePaths,
    width: Math.max(boardWidth, maxX - minX + BOARD_MARGIN * 2),
    height: Math.max(boardHeight, maxY - minY + BOARD_MARGIN * 2),
  };
}

function createLayout(tables, relationships, boardWidth, boardHeight, compact = false) {
  const degree = new Map(tables.map((table) => [tableKey(table.schema, table.name), 0]));
  relationships.forEach((relation) => {
    degree.set(relation.from, (degree.get(relation.from) || 0) + 1);
    degree.set(relation.to, (degree.get(relation.to) || 0) + 1);
  });
  const byName = (left, right) => left.name.localeCompare(right.name);
  const orderedTables = [...tables].sort((left, right) =>
    degree.get(tableKey(right.schema, right.name)) - degree.get(tableKey(left.schema, left.name))
    || byName(left, right));
  const cardWidth = compact
    ? Math.min(128, Math.max(100, boardWidth - 2 * BOARD_MARGIN))
    : Math.min(CARD_WIDTH, Math.max(140, boardWidth - 2 * BOARD_MARGIN));
  const expandedCardHeight = Math.min(CARD_HEIGHT, Math.max(80, boardHeight - 2 * BOARD_MARGIN));
  const cardHeight = compact ? COMPACT_CARD_HEIGHT : COLLAPSED_CARD_HEIGHT;
  const horizontalGap = compact ? 8 : 24;
  const center = { x: boardWidth / 2, y: boardHeight / 2 };
  const maxRadiusX = Math.max(0, (boardWidth - cardWidth) / 2 - BOARD_MARGIN);
  const maxRadiusY = Math.max(0, (boardHeight - cardHeight) / 2 - BOARD_MARGIN);
  const positions = new Map();
  const laidOutEdges = [];

  if (orderedTables.length === 0) {
    return { cardWidth, cardHeight: expandedCardHeight, positions };
  }

  function candidateScore(key, candidate) {
    const candidateRect = rectangleFor(candidate, cardWidth, cardHeight, 12);
    let score = 0;
    for (const [otherKey, otherPosition] of positions) {
      const otherRect = rectangleFor(otherPosition, cardWidth, cardHeight, 12);
      if (rectanglesOverlap(candidateRect, otherRect)) score += 1e9;
    }
    for (const existing of laidOutEdges) {
      if (existing.relation.from === key || existing.relation.to === key) continue;
      if (segmentIntersectsRectangle(existing.geometry.start, existing.geometry.end, candidateRect)) {
        score += 1e8;
      }
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
    if (compact && index === 0) {
      positions.set(key, { x: center.x - cardWidth / 2, y: center.y - cardHeight / 2 });
      return;
    }
    if (!compact && index === 0 && (degree.get(key) || 0) > 0) {
      positions.set(key, { x: center.x - cardWidth / 2, y: center.y - cardHeight / 2 });
      return;
    }

    if ((degree.get(key) || 0) === 0) {
      let isolatedPosition = null;
      const columnCount = Math.max(1, Math.floor((boardWidth - BOARD_MARGIN * 2) / (cardWidth + horizontalGap)));
      const rowCount = Math.max(1, Math.ceil(orderedTables.length / columnCount));
      for (let row = 0; row < rowCount && !isolatedPosition; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
          const candidate = {
            x: BOARD_MARGIN + column * (cardWidth + horizontalGap),
            y: BOARD_MARGIN + row * (cardHeight + 24),
          };
          const candidateRect = rectangleFor(candidate, cardWidth, cardHeight, 12);
          if (![...positions.values()].every((position) =>
            !rectanglesOverlap(candidateRect, rectangleFor(position, cardWidth, cardHeight, 12)))) {
            continue;
          }
          isolatedPosition = candidate;
          break;
        }
      }
      positions.set(key, isolatedPosition || { x: BOARD_MARGIN, y: BOARD_MARGIN });
      return;
    }

    let bestPosition = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const ringCount = compact ? 6 : 8;
    const angleCount = Math.max(24, orderedTables.length * 8);
    for (let ring = 1; ring <= ringCount; ring += 1) {
      const radius = ring / ringCount;
      for (let angleIndex = 0; angleIndex < angleCount; angleIndex += 1) {
        const angle = angleIndex * goldenAngle + index * 0.37;
        const candidate = {
          x: center.x + Math.cos(angle) * maxRadiusX * radius - cardWidth / 2,
          y: center.y + Math.sin(angle) * maxRadiusY * radius - cardHeight / 2,
        };
        const candidateRect = rectangleFor(candidate, cardWidth, cardHeight, compact ? 4 : 12);
        if ([...positions.values()].some((position) =>
          rectanglesOverlap(candidateRect, rectangleFor(position, cardWidth, cardHeight, compact ? 4 : 12)))) continue;
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

  const isolatedKeys = new Set(
    orderedTables
      .filter((table) => (degree.get(tableKey(table.schema, table.name)) || 0) === 0)
      .map((table) => tableKey(table.schema, table.name)),
  );
  const graphPositions = [...positions.entries()].filter(([key]) => !isolatedKeys.has(key));
  if (graphPositions.length === 0) return {
    cardWidth,
    cardHeight: expandedCardHeight,
    positions,
  };
  const bounds = graphPositions.reduce((current, [, position]) => ({
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
  const graphLeft = BOARD_MARGIN + (isolatedKeys.size > 0 ? cardWidth + horizontalGap : 0);
  const offsetX = Math.max(
    graphLeft - bounds.left,
    Math.min(boardWidth - BOARD_MARGIN - bounds.right, center.x - graphCenterX),
  );
  const offsetY = Math.max(
    BOARD_MARGIN - bounds.top,
    Math.min(boardHeight - BOARD_MARGIN - bounds.bottom, center.y - graphCenterY),
  );
  positions.forEach((position, key) => {
    if (isolatedKeys.has(key)) return;
    positions.set(key, { x: position.x + offsetX, y: position.y + offsetY });
  });

  return {
    cardWidth,
    cardHeight: expandedCardHeight,
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

export default function DiagramView({
  tables: suppliedTables,
  groups: suppliedGroups,
  initialGroup,
  selectedTableName,
  loading = false,
  relationships: suppliedRelationships,
  onSelectGroup,
  onSelectRelation,
  relationInspector,
  onOpenTable,
  navigationActions,
  hideActiveGroup = false,
  compactCards = false,
}: DiagramViewProps) {
  const dispatch = useDispatch();
  const { schema, schemaStatus, schemaError, debugUiEnabled } = useSelector((state) => state.database);
  const diagramTables = suppliedTables || schema.tables;
  const [positions, setPositions] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [popupSizes, setPopupSizes] = useState({});
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [selectedGroup, setSelectedGroup] = useState("");
  const [boardSize, setBoardSize] = useState({ width: 720, height: 360 });
  const [layoutSize, setLayoutSize] = useState({ width: 720, height: 360 });
  const [autoRange, setAutoRange] = useState(true);
  const [compactLayout, setCompactLayout] = useState<CompactLayout | null>(null);
  const drag = useRef(null);
  const graphDrag = useRef(null);
  const resizeDrag = useRef(null);
  const hasInitialLayoutSize = useRef(false);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollElement) return undefined;
    const updateSize = (width, height) => {
      if (width <= 0 || height <= 0) return;
      const nextWidth = Math.max(320, Math.floor(width));
      const nextHeight = Math.max(82, Math.floor(height));
      if (!hasInitialLayoutSize.current) {
        setLayoutSize({ width: nextWidth, height: nextHeight });
        hasInitialLayoutSize.current = true;
      }
      if (autoRange) {
        setLayoutSize((current) =>
          current.width === nextWidth && current.height === nextHeight
            ? current
            : { width: nextWidth, height: nextHeight },
        );
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
  }, [autoRange, scrollElement, suppliedTables]);

  const groups = useMemo(() => {
    if (suppliedGroups?.length) {
      return suppliedGroups
        .map((group) => ({
          name: group.name,
          tables: [...group.tables].sort((left, right) => left.name.localeCompare(right.name)),
          tone: group.tone,
        }));
    }
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
  }, [diagramTables, suppliedGroups, suppliedTables]);

  const activeGroup = suppliedTables
    ? groups.find((group) => group.name === initialGroup)
      || groups.find((group) => group.name === selectedGroup)
      || groups.find((group) => group.name === "All")
      || groups[0]
    : groups.find((group) => group.name === selectedGroup) || groups[0];
  const committedGroupRef = useRef<typeof activeGroup>(undefined);
  if (!loading && activeGroup) committedGroupRef.current = activeGroup;
  const renderedGroup = loading ? committedGroupRef.current || activeGroup : activeGroup;

  const relationships = useMemo(
    () => getDiagramRelationships(renderedGroup, suppliedRelationships || schema.relationships),
    [renderedGroup, schema.relationships, suppliedRelationships],
  );
  const layoutWidth = autoRange ? boardSize.width : layoutSize.width;
  const layoutHeight = autoRange ? boardSize.height : layoutSize.height;

  useEffect(() => {
    if (!compactCards || !renderedGroup?.tables?.length) {
      setCompactLayout(null);
      return undefined;
    }
    let cancelled = false;
    createCompactLayout(renderedGroup.tables, relationships, layoutWidth, layoutHeight)
      .then((nextLayout) => {
        if (!cancelled) {
          setCompactLayout(nextLayout);
        }
      })
      .catch((error) => {
        console.error("Unable to calculate compact diagram layout.", error);
        if (!cancelled) setCompactLayout(null);
      });
    return () => {
      cancelled = true;
    };
  }, [autoRange, compactCards, layoutHeight, layoutWidth, relationships, renderedGroup]);

  const layout = useMemo(() => {
    const next = createLayout(renderedGroup?.tables || [], relationships, layoutSize.width, layoutSize.height, compactCards);
    return {
      cardWidth: next.cardWidth,
      cardHeight: next.cardHeight,
      positions: {
        ...Object.fromEntries(next.positions),
        ...(compactLayout?.positions || {}),
      },
    };
  }, [autoRange, compactCards, compactLayout, layoutSize, relationships, renderedGroup]);
  const basePositions = { ...layout.positions, ...positions };
  const tablePositions = Object.fromEntries(Object.entries(basePositions).map(([key, position]) => [
    key,
    { x: position.x + graphPan.x, y: position.y + graphPan.y },
  ]));
  const renderedBoardSize = {
    width: Math.max(boardSize.width, compactLayout?.width || 0),
    height: Math.max(boardSize.height, compactLayout?.height || 0),
  };

  function startDrag(event, key) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPositions((current) => ({ ...current, [key]: basePositions[key] }));
    drag.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: basePositions[key],
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

  function startGraphDrag(event) {
    const target = event.target;
    if (target instanceof Element && (target.closest(".diagram-table-card") || target.closest(".diagram-edge"))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    graphDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      basePan: graphPan,
    };
  }

  function moveGraphDrag(event) {
    if (!graphDrag.current || graphDrag.current.pointerId !== event.pointerId) return;
    const currentDrag = graphDrag.current;
    setGraphPan({
      x: currentDrag.basePan.x + event.clientX - currentDrag.startX,
      y: currentDrag.basePan.y + event.clientY - currentDrag.startY,
    });
  }

  function endGraphDrag(event) {
    if (graphDrag.current?.pointerId === event.pointerId) graphDrag.current = null;
  }

  function renderFieldList(table) {
    return (
      <ul className="diagram-column-list">
        {table.columns.map((column) => (
          <li key={column.name} title={`${column.name} — ${column.dataType || "unknown type"}`}>
            <span className={`diagram-column-name${column.isPrimaryKey ? " primary" : ""}`}>{column.name}</span>
            <span className="diagram-column-key primary">
              {column.isPrimaryKey && <Icon name="key" size={13} />}
            </span>
            <span className="diagram-column-type" title={column.dataType || "unknown type"} aria-label={`Data type: ${column.dataType || "unknown type"}`}>
              <Icon name={getDataTypeIcon(column.dataType || "String")} size={13} />
            </span>
          </li>
        ))}
        {table.columns.length === 0 && <li className="diagram-no-columns">No columns</li>}
      </ul>
    );
  }

  function startResize(event, key, width, height) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeDrag.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: width,
      originHeight: height,
    };
  }

  function moveResize(event) {
    if (!resizeDrag.current || resizeDrag.current.pointerId !== event.pointerId) return;
    const currentResize = resizeDrag.current;
    const table = renderedGroup?.tables.find((item) => tableKey(item.schema, item.name) === currentResize.key);
    if (!table) return;
    setPopupSizes((current) => ({
      ...current,
      [currentResize.key]: {
        width: Math.max(
          compactCardWidth(table.name, table.columns, true),
          currentResize.originWidth + event.clientX - currentResize.startX,
        ),
        height: Math.min(
          compactPopupMaxHeight(table.columns),
          Math.max(compactPopupMinHeight(), currentResize.originHeight + event.clientY - currentResize.startY),
        ),
      },
    }));
  }

  function endResize(event) {
    if (resizeDrag.current?.pointerId === event.pointerId) resizeDrag.current = null;
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
  if (!suppliedTables && diagramTables.length === 0) {
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
      {(!suppliedTables || suppliedGroups?.length) && <div className="diagram-group-toolbar">
        <nav className="diagram-group-switch" aria-label="Diagram table groups">
          {groups.filter((group) => !hideActiveGroup || group.name !== initialGroup).map((group) => (
            <button
              type="button"
              className={`diagram-group-button tone-${group.tone || domainTone(group.name)}${activeGroup?.name === group.name ? " active" : ""}`}
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
                if (activeGroup) committedGroupRef.current = activeGroup;
                setSelectedGroup(group.name);
                onSelectGroup?.(group.id ?? group.name);
                setLayoutSize(boardSize);
                setPositions({});
                setGraphPan({ x: 0, y: 0 });
              }}
            >
              <span className="diagram-group-mark" aria-hidden="true" />
              <strong>{group.name}</strong>
              <span className="diagram-group-count">{group.tables.length}</span>
            </button>
          ))}
          {navigationActions}
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
                  setGraphPan({ x: 0, y: 0 });
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
              setGraphPan({ x: 0, y: 0 });
            }}
          >
            <Icon name="reset" size={14} /> Arrange
          </button>
        </div>
      </div>}
      <div className="diagram-content">
        {relationInspector}
        <div className="diagram-scroll" ref={setScrollElement}>
        <div
          className="diagram-board"
          style={renderedBoardSize}
          onPointerDown={startGraphDrag}
          onPointerMove={moveGraphDrag}
          onPointerUp={endGraphDrag}
          onPointerCancel={endGraphDrag}
        >
          <svg className="diagram-relations" width={renderedBoardSize.width} height={renderedBoardSize.height} aria-label="Table relationships">
            <defs>
              <marker id="diagram-relation-arrow" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 Z" />
              </marker>
            </defs>
            {relationships.map((relation, index) => {
              const from = tablePositions[relation.from];
              const to = tablePositions[relation.to];
              if (!from || !to) return null;
              const fromTable = renderedGroup?.tables.find((table) => tableKey(table.schema, table.name) === relation.from);
              const toTable = renderedGroup?.tables.find((table) => tableKey(table.schema, table.name) === relation.to);
              const fromWidth = compactCards && fromTable
                ? compactCardWidth(fromTable.name)
                : layout.cardWidth;
              const toWidth = compactCards && toTable
                ? compactCardWidth(toTable.name)
                : layout.cardWidth;
              const fromHeight = compactCards && fromTable
                ? COMPACT_CARD_HEIGHT
                : expandedTables[relation.from] ? layout.cardHeight : COLLAPSED_CARD_HEIGHT;
              const toHeight = compactCards && toTable
                ? COMPACT_CARD_HEIGHT
                : expandedTables[relation.to] ? layout.cardHeight : COLLAPSED_CARD_HEIGHT;
              const geometry = relationGeometry(from, to, fromWidth, fromHeight, toWidth, toHeight);
              const routedPath = compactLayout?.edgePaths[`edge-${index}`];
              const edgePath = routedPath && Object.keys(positions).length === 0
                ? translateEdgePath(routedPath, graphPan)
                : undefined;
              if (!geometry && !edgePath) return null;
              const path = edgePath || (geometry
                ? `M ${geometry.start.x} ${geometry.start.y} L ${geometry.end.x} ${geometry.end.y}`
                : "");
              return (
                        <g
                          className={`diagram-edge${relation.isManyToMany ? " many-to-many" : ""}`}
                          key={`${relation.name}-${index}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Select relation ${relation.name || `${relation.from} to ${relation.to}`}`}
                          onClick={() => onSelectRelation?.(relation)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectRelation?.(relation);
                            }
                          }}
                        >
                          <path
                          d={path}
                            markerEnd="url(#diagram-relation-arrow)"
                          />
                          </g>
              );
            })}
          </svg>
          {(renderedGroup?.tables || []).map((table) => {
            const key = tableKey(table.schema, table.name);
            const position = tablePositions[key];
            if (!position) return null;
            const expanded = Boolean(expandedTables[key]);
            const width = compactCards
              ? compactCardWidth(table.name)
              : layout.cardWidth;
            const height = expanded && !compactCards
              ? layout.cardHeight
              : compactCards ? COMPACT_CARD_HEIGHT : COLLAPSED_CARD_HEIGHT;
            return (
              <article
                className={`diagram-table-card${compactCards ? " compact" : ""}${expanded ? " expanded" : ""}${selectedTableName === table.name ? " selected" : ""}`}
                key={key}
                style={{
                  left: position.x,
                  top: position.y,
                  width,
                  height,
                }}
                aria-label={`${table.name}${selectedTableName === table.name ? " (selected)" : ""}`}
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
                  {!compactCards && <Icon name="table" size={15} />}
                  <span>{table.name}</span>
                  {!compactCards && table.dbTable && table.dbTable !== table.name && (
                    <span className="diagram-table-schema">{table.dbTable}</span>
                  )}
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
                {expanded && !compactCards && renderFieldList(table)}
                {expanded && !compactCards && (
                  <button
                    type="button"
                    className="diagram-card-resize-handle"
                    aria-label={`Resize ${table.name} fields`}
                    onPointerDown={(event) => startResize(event, key, width, height)}
                    onPointerMove={moveResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                  />
                )}
              </article>
            );
          })}
          {compactCards && (renderedGroup?.tables || []).map((table) => {
            const key = tableKey(table.schema, table.name);
            const position = tablePositions[key];
            if (!position || !expandedTables[key]) return null;
            const size = popupSizes[key];
            const width = size?.width || compactCardWidth(table.name, table.columns, true);
            const height = size?.height || compactPopupDefaultHeight(table.columns);
            return (
              <div
                className="diagram-field-popup"
                key={`${key}-fields`}
                style={{
                  left: position.x,
                  top: position.y + COMPACT_CARD_HEIGHT,
                  width,
                  height,
                }}
                aria-label={`${table.name} fields`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {renderFieldList(table)}
                <button
                  type="button"
                  className="diagram-card-resize-handle"
                  aria-label={`Resize ${table.name} fields`}
                  onPointerDown={(event) => startResize(event, key, width, height)}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                />
              </div>
            );
          })}
            </div>
          </div>
        {loading && (
          <div className="diagram-loading-overlay" role="status" aria-label="Loading diagram entities">
            <span className="diagram-loading-icon" aria-hidden="true">
              <i className="diagram-loading-dot" />
              <i className="diagram-loading-dot" />
              <i className="diagram-loading-dot" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
