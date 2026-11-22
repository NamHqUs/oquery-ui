import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkEdgeSection, ElkNode } from "elkjs/lib/elk-api";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { type IconName } from "../../shared/icon/icon";
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
  targetRelationName?: string;
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
  onOpenTable?: (table: DiagramTable) => void;
  navigationActions?: ReactNode;
  compactCards?: boolean;
};

const CARD_WIDTH = 162;
const CARD_HEIGHT = 77;
const COLLAPSED_CARD_HEIGHT = 34;
const COMPACT_CARD_HEIGHT = 30;
const FIELD_ROW_HEIGHT = 21;
const FIELD_LIST_PADDING = 4;
const DEFAULT_VISIBLE_FIELD_ROWS = 8;
const BOARD_MARGIN = 20;
const COMPACT_TOP_INSET = 6;
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

function toRect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height };
}

function rectsOverlap(first, second) {
  return first.left < second.right && first.right > second.left
    && first.top < second.bottom && first.bottom > second.top;
}

function compactCardWidth(name, columns = [], expanded = false) {
  const longestText = expanded
    ? Math.max(name.length, ...columns.map((column) => column.name.length))
    : name.length;
  return Math.max(60, longestText * 7 + 41);
}

// Popup sections: a Fields title and list, then a Relations title and list. Each height count includes its title row.
const POPUP_SECTION_TITLE_HEIGHT = 22;
const POPUP_MIN_WIDTH = 200;
const POPUP_BORDER_HEIGHT = 2;
const RELATION_ROW_HEIGHT = 21;
const MAX_VISIBLE_RELATION_ROWS = 5;

function fieldSectionHeight(rowCount) {
  return POPUP_SECTION_TITLE_HEIGHT + rowCount * FIELD_ROW_HEIGHT + FIELD_LIST_PADDING;
}

function relationSectionHeight(rowCount) {
  // An empty relation section still renders one "No relations" row.
  return POPUP_SECTION_TITLE_HEIGHT + Math.max(1, rowCount) * RELATION_ROW_HEIGHT + FIELD_LIST_PADDING;
}

function popupDefaultWidth(table) {
  return Math.max(POPUP_MIN_WIDTH, compactCardWidth(table.name, table.columns, true));
}

function relationsForTable(table, relationships = []) {
  const outgoing = relationships
    .filter((relation) => relation.sourceTable === table.name)
    .map((relation) => ({ name: relation.name, target: relation.targetTable, type: "many-to-one", icon: "relation-many-to-one" as const }));
  const incoming = relationships
    .filter((relation) => relation.targetTable === table.name)
    .map((relation) => ({ name: relation.targetRelationName || relation.name, target: relation.sourceTable, type: "one-to-many", icon: "relation-one-to-many" as const }));
  return [...outgoing, ...incoming];
}

// Field rows shown without scrolling: the table's own rows, capped at 8.
function visibleFieldRows(columns = []) {
  return Math.min(Math.max(1, columns.length), DEFAULT_VISIBLE_FIELD_ROWS);
}

// Default popup height fits the content: fields up to 8 rows, relations up to 5 rows; the lists scroll beyond that.
function popupDefaultHeight(columns = [], relationCount = 0) {
  return fieldSectionHeight(visibleFieldRows(columns))
    + relationSectionHeight(Math.min(relationCount, MAX_VISIBLE_RELATION_ROWS));
}

// Popup height where all visible fields and every relation fit. Dragging the resize handle stops here.
function popupMaxHeight(columns = [], relationCount = 0) {
  return fieldSectionHeight(visibleFieldRows(columns)) + relationSectionHeight(relationCount);
}

function popupMinHeight() {
  return fieldSectionHeight(1) + relationSectionHeight(1);
}

// Fields are sized to their rows, so Relations starts directly below them. Extra height goes to Relations.
function splitPopupHeight(height, columns = [], relationCount = 0) {
  const fieldsContent = fieldSectionHeight(visibleFieldRows(columns));
  const relationsDefault = relationSectionHeight(Math.min(relationCount, MAX_VISIBLE_RELATION_ROWS));
  const fieldsHeight = Math.min(fieldsContent, Math.max(fieldSectionHeight(1), height - relationsDefault));
  return { fieldsHeight, relationsHeight: height - fieldsHeight };
}

function translateEdgePath(path, offset) {
  return path.replace(/([ML])\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, command, x, y) =>
    `${command} ${Number(x) + offset.x} ${Number(y) + offset.y}`);
}

export function diagramGroupTone(index: number): DiagramGroupTone {
  return DIAGRAM_GROUP_TONES[index % DIAGRAM_GROUP_TONES.length];
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

type RouteEndpoint = { key: string; x: number; y: number; width: number; height: number };
type RouteRequest = { index: number; from: RouteEndpoint; to: RouteEndpoint };
type RouteSide = "left" | "right" | "top" | "bottom";
type RouteSlot = { position: number; count: number };

const ROUTE_LANE_SPACING = 6;

function sideAnchor(endpoint: RouteEndpoint, side: RouteSide, slot: RouteSlot) {
  const ratio = (slot.position + 1) / (slot.count + 1);
  if (side === "left") return { x: endpoint.x, y: endpoint.y + endpoint.height * ratio };
  if (side === "right") return { x: endpoint.x + endpoint.width, y: endpoint.y + endpoint.height * ratio };
  if (side === "top") return { x: endpoint.x + endpoint.width * ratio, y: endpoint.y };
  return { x: endpoint.x + endpoint.width * ratio, y: endpoint.y + endpoint.height };
}

// Edges that share a card side get distinct anchor points (ordered by the other card's position to avoid crossings)
// and distinct midline lanes, so routed edges fan out instead of stacking on one line.
function routeRelationPaths(requests: RouteRequest[]): Map<number, string> {
  const plans = requests.map(({ index, from, to }) => {
    const dx = to.x + to.width / 2 - (from.x + from.width / 2);
    const dy = to.y + to.height / 2 - (from.y + from.height / 2);
    const horizontal = Math.abs(dx) / (from.width + to.width) >= Math.abs(dy) / (from.height + to.height);
    const forward = horizontal ? dx >= 0 : dy >= 0;
    const fromSide: RouteSide = horizontal ? (forward ? "right" : "left") : (forward ? "bottom" : "top");
    const toSide: RouteSide = horizontal ? (forward ? "left" : "right") : (forward ? "top" : "bottom");
    return { index, from, to, horizontal, fromSide, toSide };
  });

  const bySlot = new Map<string, { plan: (typeof plans)[number]; end: "from" | "to"; otherCenter: number }[]>();
  const slotFor = new Map<string, RouteSlot>();
  const addToSlot = (endpoint: RouteEndpoint, side: RouteSide, plan: (typeof plans)[number], end: "from" | "to", other: RouteEndpoint) => {
    const slotKey = `${endpoint.key}|${side}`;
    const otherCenter = plan.horizontal
      ? other.y + other.height / 2
      : other.x + other.width / 2;
    const entries = bySlot.get(slotKey) || [];
    entries.push({ plan, end, otherCenter });
    bySlot.set(slotKey, entries);
  };
  for (const plan of plans) {
    addToSlot(plan.from, plan.fromSide, plan, "from", plan.to);
    addToSlot(plan.to, plan.toSide, plan, "to", plan.from);
  }
  for (const entries of bySlot.values()) {
    entries.sort((left, right) => left.otherCenter - right.otherCenter || left.plan.index - right.plan.index);
    entries.forEach((entry, position) => {
      slotFor.set(`${entry.plan.index}-${entry.end}`, { position, count: entries.length });
    });
  }

  const paths = new Map<number, string>();
  for (const plan of plans) {
    const fromSlot = slotFor.get(`${plan.index}-from`);
    const toSlot = slotFor.get(`${plan.index}-to`);
    const start = sideAnchor(plan.from, plan.fromSide, fromSlot);
    const end = sideAnchor(plan.to, plan.toSide, toSlot);
    const lane = (fromSlot.position - (fromSlot.count - 1) / 2) * ROUTE_LANE_SPACING;
    if (plan.horizontal) {
      const midX = (start.x + end.x) / 2 + lane;
      paths.set(plan.index, `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`);
    } else {
      const midY = (start.y + end.y) / 2 + lane;
      paths.set(plan.index, `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`);
    }
  }
  return paths;
}

type CompactLayout = {
  positions: Record<string, { x: number; y: number }>;
  edgePaths: Record<string, string>;
  width: number;
  height: number;
};

const elk = new ELK();

async function createCompactLayout(tables, relationships, direction: "RIGHT" | "DOWN", nodeSize): Promise<CompactLayout> {
  const graph: ElkNode = {
    id: "diagram",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.spacing.nodeNodeBetweenLayers": "24",
      "elk.spacing.nodeNode": "16",
      "elk.spacing.edgeEdge": "10",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
    },
    children: tables.map((table) => ({
      id: tableKey(table.schema, table.name),
      ...nodeSize(table),
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
  const offsetX = BOARD_MARGIN - minX;
  const offsetY = BOARD_MARGIN - minY;
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
    width: maxX - minX + BOARD_MARGIN * 2,
    height: maxY - minY + BOARD_MARGIN * 2,
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
    : Math.min(CARD_WIDTH, Math.max(126, boardWidth - 2 * BOARD_MARGIN));
  const expandedCardHeight = Math.min(CARD_HEIGHT, Math.max(65, boardHeight - 2 * BOARD_MARGIN));
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

// Memoized so a drag re-commits only the moved card and the edges whose path string changed.
const DiagramEdge = memo(function DiagramEdge({ path, manyToMany }: { path: string; manyToMany: boolean }) {
  return (
    <g className={`diagram-edge${manyToMany ? " many-to-many" : ""}`}>
      <path d={path} markerEnd="url(#diagram-relation-arrow)" />
    </g>
  );
});

type DiagramCardProps = {
  table: DiagramTable;
  cardKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  compact: boolean;
  expanded: boolean;
  selected: boolean;
  onSelect: (table: DiagramTable) => void;
  onPreview: (table: DiagramTable) => void;
  onToggleExpand: (cardKey: string) => void;
  onHeaderPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, cardKey: string) => void;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHeaderPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

const DiagramCard = memo(function DiagramCard({
  table,
  cardKey,
  x,
  y,
  width,
  height,
  compact,
  expanded,
  selected,
  onSelect,
  onPreview,
  onToggleExpand,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
}: DiagramCardProps) {
  return (
    <article
      className={`diagram-table-card${compact ? " compact" : ""}${expanded ? " expanded" : ""}${selected ? " selected" : ""}`}
      style={{ left: x, top: y, width, height }}
      aria-label={`${table.name}${selected ? " (selected)" : ""}`}
    >
      <button
        type="button"
        className="diagram-table-header"
        onClick={() => onSelect(table)}
        onDoubleClick={() => onPreview(table)}
        onPointerDown={(event) => onHeaderPointerDown(event, cardKey)}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        title={`Double-click to preview ${table.name}`}
      >
        {!compact && <Icon name="table" size={15} />}
        <span>{table.name}</span>
        {!compact && table.dbTable && table.dbTable !== table.name && (
          <span className="diagram-table-schema">{table.dbTable}</span>
        )}
      </button>
      <button
        type="button"
        className="diagram-column-toggle"
        aria-label={`${expanded ? "Collapse" : "Expand"} columns for ${table.name}`}
        aria-expanded={expanded}
        onClick={() => onToggleExpand(cardKey)}
        title={expanded ? "Collapse columns" : "Expand columns"}
      >
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={13} />
      </button>
    </article>
  );
});

export default function DiagramView({
  tables: suppliedTables,
  groups: suppliedGroups,
  initialGroup,
  selectedTableName,
  loading = false,
  relationships: suppliedRelationships,
  onOpenTable,
  navigationActions,
  compactCards = false,
}: DiagramViewProps) {
  const dispatch = useDispatch();
  const { schema, schemaStatus, schemaError } = useSelector((state) => state.database);
  const diagramTables = suppliedTables || schema.tables;
  const [positions, setPositions] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [popupSizes, setPopupSizes] = useState({});
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [boardSize, setBoardSize] = useState({ width: 720, height: 360 });
  const [layoutSize, setLayoutSize] = useState({ width: 720, height: 360 });
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
      setLayoutSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
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
  }, [scrollElement, suppliedTables]);

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
      || groups.find((group) => group.name === "All")
      || groups[0]
    : groups[0];
  const committedGroupRef = useRef<typeof activeGroup>(undefined);
  if (!loading && activeGroup) committedGroupRef.current = activeGroup;
  const renderedGroup = loading ? committedGroupRef.current || activeGroup : activeGroup;

  const relationships = useMemo(
    () => getDiagramRelationships(renderedGroup, suppliedRelationships || schema.relationships),
    [renderedGroup, schema.relationships, suppliedRelationships],
  );

  const layoutSource = layoutSize;
  const layoutDirection = layoutSource.width > layoutSource.height * 1.15 ? "RIGHT" : "DOWN";

  const layoutKey = JSON.stringify({
    tables: (renderedGroup?.tables || []).map((table) => tableKey(table.schema, table.name)),
    relationships: relationships.map((relation) => [relation.from, relation.to]),
    direction: layoutDirection,
    compactCards,
  });

  useEffect(() => {
    if (!renderedGroup?.tables?.length) {
      setCompactLayout(null);
      return undefined;
    }
    let cancelled = false;
    const nodeSize = compactCards
      ? (table) => ({ width: compactCardWidth(table.name), height: COMPACT_CARD_HEIGHT })
      : () => ({ width: CARD_WIDTH, height: COLLAPSED_CARD_HEIGHT });
    createCompactLayout(renderedGroup.tables, relationships, layoutDirection, nodeSize)
      .then((nextLayout) => {
        if (!cancelled) {
          setCompactLayout(nextLayout);
        }
      })
      .catch((error) => {
        console.error("Unable to calculate diagram layout.", error);
        if (!cancelled) setCompactLayout(null);
      });
    return () => {
      cancelled = true;
    };
  }, [layoutKey]);

  const compactOffsetX = Math.max(0, (layoutSize.width - (compactLayout?.width || 0)) / 2);
  const compactOffsetY = COMPACT_TOP_INSET - BOARD_MARGIN;
  const layout = useMemo(() => {
    const next = createLayout(renderedGroup?.tables || [], relationships, layoutSize.width, layoutSize.height, compactCards);
    const centeredCompactPositions = Object.fromEntries(Object.entries(compactLayout?.positions || {}).map(([key, position]) => [
      key,
      { x: position.x + compactOffsetX, y: position.y + compactOffsetY },
    ]));
    return {
      cardWidth: next.cardWidth,
      cardHeight: next.cardHeight,
      positions: {
        ...Object.fromEntries(next.positions),
        ...centeredCompactPositions,
      },
    };
  }, [compactCards, compactLayout, compactOffsetX, compactOffsetY, layoutSize, relationships, renderedGroup]);
  const basePositions = { ...layout.positions, ...positions };
  const tablePositions = Object.fromEntries(Object.entries(basePositions).map(([key, position]) => [
    key,
    { x: position.x + graphPan.x, y: position.y + graphPan.y },
  ]));
  const renderedBoardSize = {
    width: Math.max(boardSize.width, compactLayout?.width || 0),
    height: Math.max(boardSize.height, compactLayout?.height || 0),
  };

  // Only edges attached to a moved card are re-routed; every other edge keeps its ELK route, translated to the current pan.
  const movedKeys = new Set(Object.keys(positions));
  const edgeRequests: RouteRequest[] = [];
  relationships.forEach((relation, index) => {
    const from = tablePositions[relation.from];
    const to = tablePositions[relation.to];
    if (!from || !to) return;
    const touchesMoved = movedKeys.has(relation.from) || movedKeys.has(relation.to);
    if (!touchesMoved && compactLayout?.edgePaths[`edge-${index}`]) return;
    const fromSize = cardSizeFor(renderedGroup?.tables.find((table) => tableKey(table.schema, table.name) === relation.from));
    const toSize = cardSizeFor(renderedGroup?.tables.find((table) => tableKey(table.schema, table.name) === relation.to));
    edgeRequests.push({
      index,
      from: { key: relation.from, x: from.x, y: from.y, width: fromSize.width, height: fromSize.height },
      to: { key: relation.to, x: to.x, y: to.y, width: toSize.width, height: toSize.height },
    });
  });
  const reroutedPaths = routeRelationPaths(edgeRequests);

  // Handlers are stable across renders so memoized cards don't re-render on drag; they read the latest layout from this ref.
  const latest = useRef(null);
  latest.current = { basePositions, boardSize, layout, onOpenTable };

  const startDrag = useCallback((event, key) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: latest.current.basePositions[key],
    };
  }, []);

  const moveDrag = useCallback((event) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const currentDrag = drag.current;
    const { boardSize: currentBoard, layout: currentLayout } = latest.current;
    setPositions((current) => ({
      ...current,
      [currentDrag.key]: {
        x: Math.max(0, Math.min(currentBoard.width - currentLayout.cardWidth, currentDrag.origin.x + event.clientX - currentDrag.startX)),
        y: Math.max(0, Math.min(currentBoard.height - currentLayout.cardHeight, currentDrag.origin.y + event.clientY - currentDrag.startY)),
      },
    }));
  }, []);

  const endDrag = useCallback((event) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }, []);

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
            <span className="diagram-column-type" title={column.dataType || "unknown type"} aria-label={`Data type: ${column.dataType || "unknown type"}`}>
              <Icon name={getDataTypeIcon(column.dataType || "String")} size={13} />
            </span>
            <span className={`diagram-column-name${column.isPrimaryKey ? " primary" : ""}`}>{column.name}</span>
            <span className="diagram-column-key primary">
              {column.isPrimaryKey && <Icon name="key" size={13} />}
            </span>
          </li>
        ))}
        {table.columns.length === 0 && <li className="diagram-no-columns">No columns</li>}
      </ul>
    );
  }

  function popupRelations(table) {
    return relationsForTable(table, suppliedRelationships || schema.relationships);
  }

  function popupWidthFor(table) {
    return popupSizes[tableKey(table.schema, table.name)]?.width || popupDefaultWidth(table);
  }

  function popupHeightFor(table) {
    return popupSizes[tableKey(table.schema, table.name)]?.height
      || popupDefaultHeight(table.columns, popupRelations(table).length);
  }

  // The card is the header only; expanded fields and relations render in a popup below it.
  function cardSizeFor(table) {
    if (compactCards && table) return { width: compactCardWidth(table.name), height: COMPACT_CARD_HEIGHT };
    return { width: layout.cardWidth, height: COLLAPSED_CARD_HEIGHT };
  }

  // Popups live outside the clipped board, so they are placed against the visible diagram area.
  // Candidates are tried in order (below, above, right, left); a popup never overlaps its own card
  // or the selected card. If no candidate fits, the popup is not rendered.
  function popupPlacementFor(table, position) {
    const cardSize = cardSizeFor(table);
    const width = popupWidthFor(table);
    const height = popupHeightFor(table) + POPUP_BORDER_HEIGHT;
    const areaWidth = boardSize.width;
    const areaHeight = boardSize.height;
    const cardVisible = position.x < areaWidth && position.y < areaHeight
      && position.x + cardSize.width > 0 && position.y + cardSize.height > 0;
    if (!cardVisible) return null;

    const avoid = [toRect(position.x, position.y, cardSize.width, cardSize.height)];
    const selected = renderedGroup?.tables.find((item) => item.name === selectedTableName);
    const selectedPosition = selected && tablePositions[tableKey(selected.schema, selected.name)];
    if (selectedPosition) {
      const selectedSize = cardSizeFor(selected);
      avoid.push(toRect(selectedPosition.x, selectedPosition.y, selectedSize.width, selectedSize.height));
    }

    const candidates = [
      { left: position.x, top: position.y + cardSize.height },
      { left: position.x, top: position.y - height },
      { left: position.x + cardSize.width, top: position.y },
      { left: position.x - width, top: position.y },
    ];
    for (const candidate of candidates) {
      const left = Math.max(0, Math.min(candidate.left, areaWidth - width));
      const top = Math.max(0, Math.min(candidate.top, areaHeight - height));
      const rect = toRect(left, top, width, height);
      if (avoid.every((other) => !rectsOverlap(rect, other))) return { left, top, width, height };
    }
    return null;
  }

  function renderPopupSections(table) {
    const relations = popupRelations(table);
    const { fieldsHeight, relationsHeight } = splitPopupHeight(popupHeightFor(table), table.columns, relations.length);
    return (
      <>
        <div className="diagram-popup-section diagram-popup-fields" style={{ height: fieldsHeight }}>
          <div className="diagram-popup-title">Fields</div>
          {renderFieldList(table)}
        </div>
        <div className="diagram-popup-section diagram-popup-relations" style={{ height: relationsHeight }}>
          <div className="diagram-popup-title">Relations</div>
          {relations.length === 0
            ? <div className="diagram-relation-empty">No relations</div>
            : <ul className="diagram-relation-list">
              {relations.map((relation, index) => <li key={`${relation.type}-${relation.name}-${index}`} title={`${relation.name} → ${relation.target} (${relation.type})`}>
                <span className="diagram-relation-type" title={relation.type} aria-label={relation.type}>
                  <Icon name={relation.icon} size={13} />
                </span>
                <span className="diagram-relation-name">{relation.name}</span>
                <span className="diagram-relation-target">→ {relation.target}</span>
              </li>)}
            </ul>}
        </div>
      </>
    );
  }

  function startResize(event, table) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeDrag.current = {
      key: tableKey(table.schema, table.name),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: popupWidthFor(table),
      originHeight: popupHeightFor(table),
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
          popupDefaultWidth(table),
          currentResize.originWidth + event.clientX - currentResize.startX,
        ),
        height: Math.min(
          popupMaxHeight(table.columns, popupRelations(table).length),
          Math.max(popupMinHeight(), currentResize.originHeight + event.clientY - currentResize.startY),
        ),
      },
    }));
  }

  function endResize(event) {
    if (resizeDrag.current?.pointerId === event.pointerId) resizeDrag.current = null;
  }

  const previewTable = useCallback((table) => {
    const selection = { name: table.name, schema: table.schema };
    dispatch(selectDbTable(selection));
    dispatch(setPreviewDbTable(selection));
    dispatch(fetchDbTableData({ tableName: table.name, schema: table.schema, limit: 10, refresh: true }));
  }, [dispatch]);

  const selectTable = useCallback((table) => {
    dispatch(selectDbTable({ name: table.name, schema: table.schema }));
    latest.current.onOpenTable?.(table);
  }, [dispatch]);

  const toggleExpanded = useCallback((key) => {
    setExpandedTables((current) => (current[key] ? {} : { [key]: true }));
  }, []);

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
      <div className="diagram-content">
        <div className="diagram-layout-controls">
          {navigationActions}
          <button
            type="button"
            className="diagram-layout-button"
            aria-label="Arrange diagram"
            title="Arrange diagram"
            onClick={() => {
              setLayoutSize(boardSize);
              setPositions({});
              setGraphPan({ x: 0, y: 0 });
            }}
          >
            <Icon name="reset" size={14} />
          </button>
        </div>
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
              const routedPath = compactLayout?.edgePaths[`edge-${index}`];
              const path = reroutedPaths.get(index)
                ?? (routedPath ? translateEdgePath(routedPath, { x: compactOffsetX + graphPan.x, y: compactOffsetY + graphPan.y }) : undefined);
              if (!path) return null;
              return (
                <DiagramEdge
                  key={`${relation.name}-${index}`}
                  path={path}
                  manyToMany={Boolean(relation.isManyToMany)}
                />
              );
            })}
          </svg>
          {(renderedGroup?.tables || []).map((table) => {
            const key = tableKey(table.schema, table.name);
            const position = tablePositions[key];
            if (!position) return null;
            const { width, height } = cardSizeFor(table);
            return (
              <DiagramCard
                key={key}
                table={table}
                cardKey={key}
                x={position.x}
                y={position.y}
                width={width}
                height={height}
                compact={compactCards}
                expanded={Boolean(expandedTables[key])}
                selected={selectedTableName === table.name}
                onSelect={selectTable}
                onPreview={previewTable}
                onToggleExpand={toggleExpanded}
                onHeaderPointerDown={startDrag}
                onHeaderPointerMove={moveDrag}
                onHeaderPointerUp={endDrag}
              />
            );
          })}            </div>
          </div>
          {(renderedGroup?.tables || []).map((table) => {
            const key = tableKey(table.schema, table.name);
            const position = tablePositions[key];
            if (!position || !expandedTables[key]) return null;
            const placement = popupPlacementFor(table, position);
            if (!placement) return null;
            return (
              <div
                className="diagram-field-popup"
                key={`${key}-fields`}
                style={placement}
                aria-label={`${table.name} fields and relations`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {renderPopupSections(table)}
                <button
                  type="button"
                  className="diagram-card-resize-handle"
                  aria-label={`Resize ${table.name} fields`}
                  onPointerDown={(event) => startResize(event, table)}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                />
              </div>
            );
          })}
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
