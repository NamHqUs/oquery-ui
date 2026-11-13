import { Link } from "react-router-dom";
import Icon from "../../icon/icon";
import type { IconName } from "../../icon/icon";

const DESTINATIONS: { to: string; icon: IconName; title: string; body: string }[] = [
  { to: "/query-builder", icon: "query", title: "Open Query builder", body: "Compose filters, projections, joins, and sorts." },
  { to: "/data-sources", icon: "database", title: "Inspect Data sources", body: "Explore tables, fields, keys, and sample rows." },
  { to: "/", icon: "chart", title: "Open Home", body: "See query-backed dashboards and saved analyses." },
];

export default function NextStepsContent() {
  return (
    <div className="doc-next-links">
      {DESTINATIONS.map((destination) => (
        <Link key={destination.to} to={destination.to}>
          <Icon name={destination.icon} size={17} />
          <span>
            <strong>{destination.title}</strong>
            <small>{destination.body}</small>
          </span>
          <Icon name="chevron" size={14} />
        </Link>
      ))}
    </div>
  );
}
