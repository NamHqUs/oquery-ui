import type { ComponentType } from "react";
import OverviewContent from "./sections/overview";
import QuickstartContent from "./sections/quickstart";
import QueryModelContent from "./sections/query-model";
import SyntaxContent from "./sections/syntax";
import AutomaticContent from "./sections/automatic";
import ContextsContent from "./sections/contexts";
import UiGuideContent from "./sections/ui-guide";
import ArchitectureContent from "./sections/architecture";
import ProvidersContent from "./sections/providers";
import SecurityContent from "./sections/security";
import NextStepsContent from "./sections/next-steps";

export type DocGroupId = "start" | "language" | "studio" | "operate";

export type DocGroup = {
  id: DocGroupId;
  label: string;
};

export type DocSection = {
  id: string;
  title: string;
  group: DocGroupId;
  lead: string;
  Content: ComponentType;
};

export const docGroups: DocGroup[] = [
  { id: "start", label: "Get started" },
  { id: "language", label: "Query language" },
  { id: "studio", label: "Studio and engine" },
  { id: "operate", label: "Operate" },
];

export const docSections: DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    group: "start",
    lead: "Keep the database shape, user choices, and SQL dialect concerns separate from your application domain models.",
    Content: OverviewContent,
  },
  {
    id: "quickstart",
    title: "Quickstart",
    group: "start",
    lead: "Install the package, describe the fields you want to expose, and query without a generated entity class.",
    Content: QuickstartContent,
  },
  {
    id: "query-model",
    title: "Query model",
    group: "language",
    lead: "Choose the input that fits your product. The compiler translates each input into the same expression pipeline.",
    Content: QueryModelContent,
  },
  {
    id: "syntax",
    title: "OQuery syntax",
    group: "language",
    lead: "Start small. OQuery keeps the common query path short, then gives every advanced feature a readable place in the same text format.",
    Content: SyntaxContent,
  },
  {
    id: "automatic",
    title: "Automatic behavior",
    group: "language",
    lead: "OQuery reads the shape of the expression and metadata graph, then derives the SQL operations needed for the result.",
    Content: AutomaticContent,
  },
  {
    id: "contexts",
    title: "Reusable contexts",
    group: "language",
    lead: "A context is a named query definition. Consumers choose when and how to join it, and the same context can be reused with different aliases.",
    Content: ContextsContent,
  },
  {
    id: "ui-guide",
    title: "UI workflow",
    group: "studio",
    lead: "The editor supports progressive exploration. Start visually, then switch to text whenever a query needs more control.",
    Content: UiGuideContent,
  },
  {
    id: "architecture",
    title: "How it works",
    group: "studio",
    lead: "Inputs are normalized before SQL is rendered. Dialect-specific behavior stays at the edge instead of leaking into query definitions.",
    Content: ArchitectureContent,
  },
  {
    id: "providers",
    title: "Database providers",
    group: "studio",
    lead: "Use one metadata and query model while the selected dialect handles quoting, paging, booleans, functions, and other provider details.",
    Content: ProvidersContent,
  },
  {
    id: "security",
    title: "Security boundaries",
    group: "operate",
    lead: "Queries are powerful. Pair the OQuery compiler with an authorization and resource policy before exposing it to untrusted users.",
    Content: SecurityContent,
  },
  {
    id: "next-steps",
    title: "Next steps",
    group: "operate",
    lead: "Use the live workspace to inspect metadata, compose a query, and review the generated SQL.",
    Content: NextStepsContent,
  },
];

// Header sub-nav entries: one per group, each jumping to the group's first section.
export const documentationSubmenu = docGroups.map((group) => ({
  label: group.label,
  target: docSections.find((section) => section.group === group.id)?.id ?? "",
}));
