import "./icon.css";

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10m6-10v10" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-4 4 3 3m-6-1 3 3" /></>,
  type: <><path d="M4 6h16M12 6v14M8 20h8" /></>,
  "type-number": <><path d="m9 4-2 16M16 4l-2 16M4 9h16M3 15h16" /></>,
  "type-boolean": <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  "type-datetime": <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" /></>,
  query: <><circle cx="12" cy="5" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M12 7v4m0 0-6 5m6-5 6 5" /></>,
  schema: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  "function": <><path d="M8 20 11 7a3 3 0 0 1 3-2h2M6 11h8m1-1 5 8m0-8-5 8" /></>,
  operator: <><path d="M5 6h6m-3-3v6m5 1h6m-3 3v6m-11 0h6m3 0h6" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></>,
  group: <><rect x="3" y="4" width="11" height="11" rx="2" /><rect x="10" y="9" width="11" height="11" rx="2" /></>,
  "arrow-left": <><path d="m14 18-6-6 6-6M8 12h12" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /><path d="M8 12h8" /></>,
  remove: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  firebird: <><path d="M12 3c1 4-3 5-2 8 1-1 2-2 2-4 4 3 6 6 4 10-1 2-3 3-5 3-4 0-7-3-6-7 0-2 2-4 4-6 0 2 0 3 1 4 1-2 2-4 2-8Z" /></>,
  mysql: <><path d="M4 14c3 2 7 2 10 0 2-1 3-3 3-5l3 2-2 3c-1 2-3 4-6 5-3 1-7 0-9-2" /><path d="M7 11c2-3 4-4 7-4m-2 0 2-2m-2 2 2 2" /></>,
  oracle: <><path d="M7 5h10a7 7 0 0 1 0 14H7A7 7 0 0 1 7 5Z" /></>,
  postgres: <><path d="M7 5c2-2 7-2 9 0 2 2 2 5 1 7l2 3-3 1-2-2h-4l-2 4H5l2-6C5 10 5 7 7 5Z" /><path d="M14 6c1 1 1 3 0 4m-5 5v3m5-4v3" /><circle cx="13" cy="7" r=".7" fill="currentColor" stroke="none" /></>,
  sqlserver: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v4c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 9v5c0 1.7 3.6 3 8 3s8-1.3 8-3V9M4 14v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" /></>,
  sqlite: <><path d="M5 19c4-1 6-5 8-9 1-2 3-4 6-5-1 3-3 5-5 6-2 1-3 3-4 5-1 2-2 3-5 3Z" /><path d="m11 15 3-1m-1-3 3-1m-7 6-1 3" /></>,
  sliders: <><path d="M4 6h16M4 18h16M8 3v6M16 15v6" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="18" r="2" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
  code: <><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></>,
  chart: <><path d="M4 19V5M4 19h17" /><path d="m7 14 4-4 3 2 5-6" /><circle cx="7" cy="14" r="1" /><circle cx="11" cy="10" r="1" /><circle cx="14" cy="12" r="1" /><circle cx="19" cy="6" r="1" /></>,
  results: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11m6-11v4m-1 4 2 2 4-4" /></>,
  "chart-line": <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-5 3 3 5-7" /></>,
  "chart-bar": <><path d="M4 19V5M4 19h17" /><path d="M8 16v-5M12 16V7M16 16v-8M20 16v-4" /></>,
  "chart-donut": <><path d="M12 3a9 9 0 1 0 9 9h-9V3Z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z" /></>,
  "chart-funnel": <><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" /></>,
  "chart-scatter": <><path d="M4 19V5M4 19h17" /><circle cx="8" cy="15" r="1.5" /><circle cx="11" cy="10" r="1.5" /><circle cx="15" cy="13" r="1.5" /><circle cx="19" cy="7" r="1.5" /></>,
  upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v5h14v-5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  multiply: <path d="m6 6 12 12M18 6 6 18" />,
  divide: <><path d="M5 12h14" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></>,
  modulo: <><path d="m6 18 12-12" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></>,
  "logical-and": <path d="m5 18 7-12 7 12" />,
  "logical-or": <path d="m5 6 7 12 7-12" />,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  download: <><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
  "file-plus": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6" /><path d="M14 2v6h6M14 4v4h4M8 13h5m4 0v8m-4-4h8" /></>,
  save: <><path d="M5 3h12l4 4v13a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>,
  delete: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  ungroup: <><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="13" width="7" height="7" rx="1" /><path d="M10 7h5m0 0-2-2m2 2-2 2" /></>,
  edit: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 7.5 2 2" /></>,
};

export type IconName = keyof typeof paths;

export function getDatabaseIconName(provider: string): IconName {
  const normalized = provider.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("postgres")) return "postgres";
  if (normalized.includes("cockroach")) return "postgres";
  if (normalized.includes("sqlserver")) return "sqlserver";
  if (normalized.includes("sqlite")) return "sqlite";
  if (normalized.includes("firebird")) return "firebird";
  if (normalized.includes("mysql")) return "mysql";
  if (normalized.includes("oracle")) return "oracle";
  return "database";
}

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className={`icon icon--${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
