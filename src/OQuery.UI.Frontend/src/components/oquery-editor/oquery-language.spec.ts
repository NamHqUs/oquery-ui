// @vitest-environment node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, expect, it, test } from "vitest";
import { getOQueryCompletions } from "./oquery-completions.ts";
import { getOQueryContextKeys } from "./oquery-context-colors.ts";
import { toggleOqueryComments } from "./oquery-comments.ts";
import { normalizeOqueryEditorText } from "./oquery-editor-text.ts";
import { getOqueryEnterEdit } from "./oquery-editor-enter.ts";
import { getOqueryFolds } from "./oquery-folding.ts";
import {
  contextNameAtLine,
  getMinimalTextEdit,
  getOqueryContextBlocks,
  getOqueryContextLenses,
  getOqueryErrorRange,
  getOqueryFoldingRanges,
  toMonacoCompletionInsert,
} from "./oquery-monaco-adapters.ts";
import { getOqueryMonarchLanguage } from "./oquery-monaco-language.ts";
import { getOquerySyntaxError } from "./oquery-validation";

describe("oquery comments", () => {
  test("replaces only the current line and preserves its indentation", () => {
    const text = "Products:\n  WHERE Id = 1\nOrders:";
    const edit = toggleOqueryComments(text, 15, 15);
    assert.deepEqual(edit, {
      text: "Products:\n  # WHERE Id = 1\nOrders:",
      start: 10,
      end: 24,
      replacement: "  # WHERE Id = 1",
    });
  });

  test("uncomments an indented line", () => {
    const text = "Products:\n  # WHERE Id = 1";
    assert.equal(toggleOqueryComments(text, text.length, text.length).text,
      "Products:\n  WHERE Id = 1");
  });

  test("toggles only the cursor line within a multiline context", () => {
    const text = "Products:\n  WHERE Id = 1\n  TAKE 10\nOrders:";
    const position = text.indexOf("TAKE");
    const commented = toggleOqueryComments(text, position, position);
    assert.equal(commented.text, "Products:\n  WHERE Id = 1\n  # TAKE 10\nOrders:");
    assert.equal(commented.replacement, "  # TAKE 10");
    const nextPosition = commented.text.indexOf("TAKE");
    assert.equal(toggleOqueryComments(commented.text, nextPosition, nextPosition).text, text);
  });

  test("toggles explicitly selected lines without including the next line", () => {
    const text = "Products:\n  WHERE Id = 1\n  TAKE 10\nOrders:";
    const commented = toggleOqueryComments(text, 10, text.indexOf("Orders:"));
    assert.equal(commented.text, "Products:\n  # WHERE Id = 1\n  # TAKE 10\nOrders:");
    assert.equal(commented.replacement, "  # WHERE Id = 1\n  # TAKE 10");
    assert.equal(toggleOqueryComments(commented.text, 10, commented.text.indexOf("Orders:")).text, text);
  });

  test("leaves blank lines unchanged", () => {
    const text = "Products:\n  \nOrders:";
    assert.equal(toggleOqueryComments(text, 10, 10).text, text);
    assert.equal(toggleOqueryComments("", 0, 0).text, "");
  });

  test("comments the first empty line without skipping to the next line", () => {
    const text = "\nProducts:";
    assert.equal(toggleOqueryComments(text, 0, 0).text, text);
    assert.equal(toggleOqueryComments(text, 0, text.length).start, 0);
    assert.equal(toggleOqueryComments(text, 0, text.length).text, "\n# Products:");
  });

  test("first comment on CRLF-bound text preserves the next context and indentation", () => {
    const lines = [
      "User: Id, Name, Ref1.Name Manager1, Ref2.ManagerName Manager2",
      "  Inner Join Ref1 On ManagerId = Ref1.Id",
      "  Inner Join Ref2 On ManagerId = Ref2.Id",
      "Ref1 is User: Id, Name",
      "Ref2 is User: Id, Name, Ref1.Name ManagerName",
      "  Inner Join Ref1 On ManagerId = Ref1.Id",
    ];
    const text = normalizeOqueryEditorText(lines.join("\r\n"));
    const position = text.indexOf("Inner Join Ref2");
    const edit = toggleOqueryComments(text, position, position);
    assert.equal(edit.text, lines.map((line, index) => index === 2
      ? "  # Inner Join Ref2 On ManagerId = Ref2.Id"
      : line).join("\n"));
    assert.equal(text.slice(0, edit.start) + edit.replacement + text.slice(edit.end), edit.text);
  });

  test("editor line endings match textarea normalization without trimming whitespace", () => {
    assert.equal(normalizeOqueryEditorText("  User:\r\n\r  Ref1:\r\n"), "  User:\n\n  Ref1:\n");
    assert.equal(normalizeOqueryEditorText("  User:\n\n"), "  User:\n\n");
  });
});

describe("oquery completions", () => {
  const entities = [
    { name: "Departments", fields: ["Id"], relations: [{ name: "Employees", target: "Employees", kind: "collection" }] },
    {
      name: "Employees",
      fields: ["Id"],
      relations: [
        { name: "Manager", target: "Employees", kind: "lookup" },
        { name: "Members", target: "Employees", kind: "collection" },
        { name: "PerformanceReviews", target: "PerformanceReviews", kind: "collection" },
      ],
    },
    { name: "Managers", fields: ["Salary"], relations: [] },
    { name: "PerformanceReviews", fields: ["Score", "Rating", "BonusAmount", "ReviewYear"], relations: [] },
  ];

  const functions = [
    { name: "Count", isAggregate: true },
    { name: "Sum", isAggregate: true },
    { name: "Avg", isAggregate: true },
    { name: "AnyFunction", isAggregate: false },
  ];

  const numericFunctions = [
    ...functions,
    { name: "Round", isAggregate: false, arguments: [{ name: "value", dataType: "Number" }] },
  ];

  function fieldLabels(text) {
    return getOQueryCompletions(
      text,
      text.length,
      [],
      [],
      [],
      functions,
      "Departments",
      entities,
    ).items
      .filter((item) => item.kind === "field" || item.kind === "relation")
      .map((item) => item.label);
  }

  function functionLabels(text) {
    return getOQueryCompletions(
      text,
      text.length,
      [],
      [],
      [],
      functions,
      "Departments",
      entities,
    ).items
      .filter((item) => item.kind === "function")
      .map((item) => item.label);
  }

  test("suggests Number functions after a grouped expression receiver", () => {
    const labels = getOQueryCompletions(
      "Departments: (Count(Id) * 100).Ro",
      "Departments: (Count(Id) * 100).Ro".length,
      [],
      [],
      [],
      numericFunctions,
      "Departments",
      entities,
    ).items.filter((item) => item.kind === "function").map((item) => item.label);
    assert.deepEqual(labels, ["Round"]);
  });

  test("does not suggest fields after a grouped expression receiver", () => {
    assert.deepEqual(fieldLabels("Departments: (Count(Id) * 100)."), []);
  });

  test("uses the aggregate receiver as the context inside a relation aggregate", () => {
    assert.deepEqual(fieldLabels("Departments: Employees.Sum("), ["Id", "Manager", "Members", "PerformanceReviews"]);
  });

  test("uses the nested aggregate receiver and restores the outer context", () => {
    assert.deepEqual(fieldLabels("Departments: Employees.AnyFunction(PerformanceReviews.Avg("), ["BonusAmount", "Rating", "ReviewYear", "Score"]);
    assert.deepEqual(fieldLabels("Departments: Employees.AnyFunction(PerformanceReviews.Avg(Score), "), ["Id", "Manager", "Members", "PerformanceReviews"]);
  });

  test("does not inherit an incomplete aggregate context from a previous projection", () => {
    const text = [
      "Departments:",
      "    Employees.Avg(PerformanceReviews.AvgIf(Rating, ReviewYear = 2025).Round(2) AverageRating",
      "    Employees.Sum(PerformanceReviews.SumIf(BonusAmount,  ",
    ].join("\n");
    assert.deepEqual(fieldLabels(text), ["BonusAmount", "Rating", "ReviewYear", "Score"]);
  });

  test("keeps the active entity context after an expression operator", () => {
    assert.deepEqual(
      fieldLabels(["Employees:", "    FirstName + "].join("\n")),
      ["Id", "Manager", "Members", "PerformanceReviews"],
    );
  });

  test("does not show completions after a comment marker", () => {
    const result = getOQueryCompletions(
      "Departments: # Employees.",
      "Departments: # Employees.".length,
      [],
      [],
      ["Departments"],
      functions,
      "Departments",
      entities,
    );

    assert.deepEqual(result.items, []);
  });

  test("suggests only aggregates after a collection dot and no function after a lookup dot", () => {
    assert.deepEqual(functionLabels("Departments: Employees."), ["Avg", "Count", "Sum"]);
    assert.deepEqual(functionLabels("Departments: Employees.Manager."), []);
  });

  test("offers projection fields and clause keywords after a join line", () => {
    const text = "Departments:\n  Inner Join Employees On Id = Employees.Id\n  ";
    const items = getOQueryCompletions(text, text.length, [], [], [], functions, "Departments", entities).items;
    assert.deepEqual(
      items.filter((item) => item.kind === "field" || item.kind === "relation").map((item) => item.label),
      ["Id", "Employees"],
    );
    assert.ok(items.some((item) => item.label === "Where"));
  });

  test("offers projection fields on an unindented continuation line and still offers entity headers", () => {
    const fieldText = "Departments: Id\nI";
    const fieldItems = getOQueryCompletions(fieldText, fieldText.length, [], [], [], functions, "Departments", entities).items;
    assert.ok(fieldItems.some((item) => item.label === "Id" && item.kind === "field"));

    const headerText = "Departments: Id\nEm";
    const headerItems = getOQueryCompletions(headerText, headerText.length, [], [], ["Employees"], functions, "Departments", entities).items;
    assert.ok(headerItems.some((item) => item.label === "Employees" && item.kind === "entity"));
  });

  test("offers no field or relation suggestions inside a block whose entity is not in the domain", () => {
    const text = "Seller: Id\n  Where Id = <1>\n  ";
    const items = getOQueryCompletions(text, text.length, [], [], [], functions, "Departments", entities).items;
    assert.deepEqual(items, []);
    const headerText = "Seller:\nEm";
    const headerItems = getOQueryCompletions(headerText, headerText.length, [], [], ["Employees"], functions, "Departments", entities).items;
    assert.ok(headerItems.some((item) => item.label === "Employees" && item.kind === "entity"));
  });

  test("offers only clause keywords after a where line", () => {
    const text = "Departments:\n  Where Id = <1>\n  ";
    const items = getOQueryCompletions(text, text.length, [], [], [], functions, "Departments", entities).items;
    assert.equal(items.some((item) => item.kind === "field"), false);
    assert.ok(items.some((item) => item.label === "Where"));
  });

  test("suggests every declared collection aggregate after a collection dot in a header-based query", () => {
    const text = "Employees:\n  Members.";
    const labels = getOQueryCompletions(text, text.length, [], [], [], functions, "Employees", entities)
      .items.filter((item) => item.kind === "function").map((item) => item.label);
    assert.deepEqual(labels, ["Avg", "Count", "Sum"]);
  });

  test("offers aggregates in the root context alongside other functions", () => {
    assert.deepEqual(functionLabels("Departments: "), ["AnyFunction", "Avg", "Count", "Sum"]);
  });

  test("never suggests aggregate functions, even inside a collection aggregate call", () => {
    assert.deepEqual(functionLabels("Departments: Employees.Avg("), ["AnyFunction"]);
    assert.deepEqual(functionLabels("Departments: Employees.Sum("), ["AnyFunction"]);
  });

  const typedEntities = [
    {
      name: "Employees",
      fields: ["Id", "HireDate", "Salary"],
      fieldDataTypes: { Id: "Number", HireDate: "Datetime", Salary: "Number" },
      relations: [{ name: "Reports", target: "Employees", kind: "collection" }],
    },
  ];

  const typedFunctions = [
    {
      name: "DateSub",
      isAggregate: false,
      arguments: [{ name: "startDate", dataType: "Datetime" }, { name: "endDate", dataType: "Datetime" }],
    },
    {
      name: "DateAdd",
      isAggregate: false,
      arguments: [{ name: "value", dataType: "Datetime" }, { name: "amount", dataType: "Number" }],
    },
    {
      name: "Round",
      isAggregate: false,
      arguments: [{ name: "value", dataType: "Number" }, { name: "digits", dataType: "Number" }],
    },
    { name: "Avg", isAggregate: true, arguments: [{ name: "expression", dataType: "Number" }] },
    { name: "GetDate", isAggregate: false, arguments: [] },
  ];

  function typedLabels(text) {
    return getOQueryCompletions(text, text.length, [], [], [], typedFunctions, "Employees", typedEntities)
      .items.map((item) => item.label);
  }

  test("suggests only functions whose first argument matches a datetime field after its dot", () => {
    assert.deepEqual(typedLabels("Employees: HireDate."), ["DateAdd", "DateSub"]);
  });

  test("suggests only functions whose first argument matches a numeric field after its dot", () => {
    assert.deepEqual(typedLabels("Employees: Salary."), ["Round"]);
  });

  test("does not suggest scalar functions after a collection dot", () => {
    const labels = getOQueryCompletions("Employees: Reports.", "Employees: Reports.".length, [], [], [], typedFunctions, "Employees", typedEntities)
      .items.filter((item) => item.kind === "function").map((item) => item.label);
    assert.deepEqual(labels, ["Avg"]);
  });

  test("suggests fields of a join alias after its dot and treats it as a collection receiver", () => {
    const text = "Departments:\n  Join Employees e On Id = e.Id,\n    Id\n  Where e.";
    assert.deepEqual(fieldLabels(text), ["Id", "Manager", "Members", "PerformanceReviews"]);
    assert.deepEqual(functionLabels("Departments:\n  Join Employees e On Id = e.Id,\n    e."), ["Avg", "Count", "Sum"]);
  });

  test("suggests a quoted declared context through its join alias", () => {
    const text = [
      "\"User Context\" is Employees: Id",
      "Departments:",
      "  Join \"User Context\" Manager1 On Id = Manager1.Id",
      "    Id",
      "  Where Manager1.",
    ].join("\n");
    assert.deepEqual(fieldLabels(text), ["Id"]);
  });

  test("uses the outputs of a context source when the context is declared on another context", () => {
    const text = "Totals is PerformanceReviews: Score ScoreValue, Rating\nReport is Totals:\n    ";
    assert.deepEqual(fieldLabels(text), ["Rating", "ScoreValue"]);
  });

  test("offers whitespace and expression aliases of the current block in a where clause", () => {
    const text = "Departments: Id Ident,\n  Employees.Sum(Id) TotalCount\n  Where ";
    assert.deepEqual(aliasLabels(text), ["Ident", "TotalCount"]);
  });

  test("does not leak aliases from another context block into the current block", () => {
    const text = "Hidden is Employees: Id as Secret\nDepartments: Id\n  Where ";
    assert.deepEqual(aliasLabels(text), []);
  });

  function aliasLabels(text) {
    return getOQueryCompletions(text, text.length, [], [], [], functions, "Departments", entities).items
      .filter((item) => item.kind === "alias")
      .map((item) => item.label);
  }

  test("offers no keywords or operators after a dot in a where clause", () => {
    const text = "Departments:\n  Join Employees e On Id = e.Id,\n    Id\n  Where e.";
    const kinds = getOQueryCompletions(text, text.length, [], [], [], functions, "Departments", entities)
      .items.map((item) => item.kind);
    assert.equal(kinds.some((kind) => kind === "keyword" || kind === "operator"), false);
  });

  test("offers projection fields after a Select line that follows a join", () => {
    const text = "Departments:\n  Join Employees e On Id = e.Id\n  Select\n    ";
    assert.deepEqual(fieldLabels(text), ["Id", "Employees"]);
  });

  test("offers projection fields after a Select line with no join", () => {
    assert.deepEqual(fieldLabels("Departments:\n  Select\n    "), ["Id", "Employees"]);
  });

  test("resolves a field receiver inside a relation aggregate against the relation's entity", () => {
    assert.deepEqual(typedLabels("Employees: Reports.Avg(HireDate."), ["DateAdd", "DateSub"]);
  });

  test("inserts a scalar receiver function after the existing field dot", () => {
    const text = "Employees: Reports.Avg(HireDate.";
    const result = getOQueryCompletions(text, text.length, [], [], [], typedFunctions, "Employees", typedEntities);
    const dateSub = result.items.find((item) => item.label === "DateSub");
    assert.ok(dateSub);
    assert.equal(
      text.slice(0, result.replaceStart) + dateSub.insertText + text.slice(result.replaceEnd),
      "Employees: Reports.Avg(HireDate.DateSub()",
    );
  });

  test("uses the current entity context when suggesting fields on a later header", () => {
    const entityList = [
      { name: "User", fields: ["Id", "Address"], relations: [] },
      { name: "School", fields: ["Id", "Name"], relations: [] },
    ];
    const text = "User: Address\nSchool: ";
    const labels = getOQueryCompletions(text, text.length, ["Id", "Address"], [], ["User", "School"], [], "User", entityList)
      .items.map((item) => item.label);

    assert.ok(labels.includes("Id") && labels.includes("Name"));
    assert.ok(!labels.includes("Address"));
  });

  test("suggests distinct at projection and aggregate starts", () => {
    const aggregateFunctions = [{ name: "Count", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: true }];
    const projection = getOQueryCompletions("Products: ", 10, ["Id"], [], ["Products"], aggregateFunctions);
    const aggregate = getOQueryCompletions("Products: Count(", 16, ["Id"], [], ["Products"], aggregateFunctions);

    assert.ok(projection.items.map((item) => item.label).includes("Distinct"));
    assert.ok(aggregate.items.map((item) => item.label).includes("Distinct"));
  });

  test("uses ApplyFor rather than IsAggregate for receiver applicability", () => {
    const definitions = [
      { name: "WindowTotal", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: false, applyFor: 1 },
      { name: "ScalarAggregate", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: true, applyFor: 4 },
    ];
    const labels = getOQueryCompletions(
      "Products: Orders.",
      18,
      ["Id"],
      [],
      ["Products"],
      definitions,
      undefined,
      [
        { name: "Products", fields: ["Id"], relations: [{ name: "Orders", target: "Order", kind: "collection" }] },
        { name: "Order", fields: ["Amount"], relations: [] },
      ],
    ).items.map((item) => item.label);

    assert.ok(labels.includes("WindowTotal"));
    assert.ok(!labels.includes("ScalarAggregate"));
  });

  test("suggests collection functions such as Any inside a where clause after a collection dot", () => {
    const entityList = [
      { name: "Employees", fields: ["Id", "Salary"], relations: [{ name: "Members", target: "Employees", kind: "collection" }] },
    ];
    const functionList = [
      { name: "Any", arguments: [{ name: "predicate", defaultValue: null }], isAggregate: false, applyFor: 1 },
      { name: "Round", arguments: [{ name: "value", defaultValue: null }], isAggregate: false, applyFor: 4 },
    ];
    const text = "Employees: Id\n  Where Members.";
    const labels = getOQueryCompletions(text, text.length, ["Id"], [], ["Employees"], functionList, "Employees", entityList)
      .items.filter((item) => item.kind === "function").map((item) => item.label);

    assert.deepEqual(labels, ["Any"]);
  });

  test("shows every field, relation, and function after where, without truncating the list", () => {
    const fields = Array.from({ length: 25 }, (_, index) => `Field${String(index + 1).padStart(2, "0")}`);
    const entityList = [
      { name: "Employees", fields: ["Id", ...fields], relations: [{ name: "Members", target: "Employees", kind: "collection" }] },
    ];
    const functionList = [
      { name: "Round", arguments: [{ name: "value", defaultValue: null }], isAggregate: false, applyFor: 4 },
    ];
    const text = "Employees: Id\n  Where ";
    const labels = getOQueryCompletions(text, text.length, ["Id", ...fields], [], ["Employees"], functionList, "Employees", entityList)
      .items.map((item) => item.label);

    for (const expected of ["Field25", "Members", "Round"]) {
      assert.ok(labels.includes(expected), `expected ${expected}`);
    }
  });
});

describe("oquery context colors", () => {
  test("identifies context keys without coloring query property keys", () => {
    const text = "Entity: User\nContexts:\n  Managers:\n    Entity: User\n  Departments:\n    Entity: Department\n";
    const keys = getOQueryContextKeys(text);
    assert.deepEqual(keys.map(key => text.slice(key.start, key.end)), ["Managers", "Departments"]);
  });

  test("marks only entity headers that exist in the current domain", () => {
    const text = "Sellers:\n  Id\nOrders:\n  Id\nSalesManager is Sellers:\n  Id\n";
    const salesEntities = new Set(["Sellers"]);
    const keys = getOQueryContextKeys(text, salesEntities);
    assert.deepEqual(
      keys.filter(key => key.kind === "table").map(key => text.slice(key.start, key.end)),
      ["Sellers", "Sellers"],
    );
    assert.deepEqual(getOQueryContextKeys(text, new Set(["Orders"])).filter(key => key.kind === "table").map(key => text.slice(key.start, key.end)), ["Orders"]);
  });

  test("all context keys use one CSS color different from schema keywords", () => {
    const css = readFileSync(new URL("./oquery-editor.css", import.meta.url), "utf8");
    const contextColor = css.match(/\.query-oquery-context-key\s*\{[^}]*color:\s*([^;]+)/)?.[1];
    const keywordColor = css.match(/\.query-oquery-protected-key\s*\{[^}]*color:\s*([^;]+)/)?.[1];
    assert.ok(contextColor);
    assert.ok(keywordColor);
    assert.notEqual(contextColor, keywordColor);
    assert.equal(contextColor, "#f2c14e");
    const functionColor = css.match(/\.query-oquery-function\s*\{[^}]*color:\s*([^;]+)/)?.[1];
    const editorFunctionColor = css.match(/\.query-oquery-highlight \.query-oquery-function\s*\{[^}]*color:\s*([^;]+)/)?.[1];
    assert.equal(functionColor, "#7296c7");
    assert.equal(editorFunctionColor, functionColor);
    assert.notEqual(functionColor, contextColor);
    const component = readFileSync(new URL("./oquery-editor.tsx", import.meta.url), "utf8");
    assert.ok(component.includes('<span class="query-oquery-context-key">${name}</span>'));
  });

  test("fold controls use arrow CSS and do not render plus/minus text", () => {
    const css = readFileSync(new URL("./oquery-editor.css", import.meta.url), "utf8");
    assert.match(css, /\.query-oquery-line-numbers:hover \.query-oquery-gutter-line button/);
    assert.match(css, /\.query-oquery-gutter-line button\.collapsed/);
    assert.match(css, /button::before\s*\{[^}]*border-left/);
    const component = readFileSync(new URL("./oquery-editor.tsx", import.meta.url), "utf8");
    assert.ok(component.includes('className={`query-oquery-fold-button${collapsed.has(line) ? " collapsed" : ""}`}'));
    assert.ok(!component.includes('}>{collapsed.has(line) ? "+" : "-"}</button>'));
  });

  test("supports quoted keys and incomplete editor input", () => {
    const text = 'Contexts:\n  "Manager: primary": {Entity: User}\n  Other:\n';
    const keys = getOQueryContextKeys(text);
    assert.equal(text.slice(keys[0].start, keys[0].end), '"Manager: primary"');
    assert.equal(keys.length, 2);
    assert.deepEqual(getOQueryContextKeys("Entity: User\nContexts:"), []);
  });

  test("highlights root and nested RefContext values like context definition names", () => {
    const text = [
      "Entity: User",
      "Relations:",
      "  - RefContext: Managers",
      "Contexts:",
      "  Managers:",
      "    Entity: User",
      "    Relations:",
      '      - RefContext: "Departments"',
      "  Departments: {Entity: Department}",
    ].join("\n");
    assert.deepEqual(getOQueryContextKeys(text).map(key => text.slice(key.start, key.end)),
      ["Managers", "Managers", '"Departments"', "Departments"]);
  });

  test("highlights only RefContext values that map to a Contexts key", () => {
    const text = [
      "Relations:",
      "  - RefContext: Managers",
      "  - RefContext: Missing",
      "Contexts:",
      "  Managers: {Entity: User}",
    ].join("\n");
    assert.deepEqual(getOQueryContextKeys(text).map(key => text.slice(key.start, key.end)),
      ["Managers", "Managers"]);
  });

  test("uses the same context color for projection references", () => {
    const text = [
      "Relations:",
      "  - RefContext: PatientVisits",
      "Contexts:",
      "  PatientVisits:",
      "    Entity: Visits",
      "    Projection:",
      "      - PatientVisits.ChronicVisits",
    ].join("\n");
    assert.deepEqual(getOQueryContextKeys(text).map(key => text.slice(key.start, key.end)),
      ["PatientVisits", "PatientVisits", "PatientVisits"]);
  });

  test("supports flow-style references and does not highlight null references", () => {
    const text = 'Contexts: {Managers: {Entity: User}}\nRelations: [{RefContext: Managers}, {RefContext: Missing}, {RefContext: null}]';
    assert.deepEqual(getOQueryContextKeys(text).map(key => text.slice(key.start, key.end)), ["Managers", "Managers"]);
  });
});

describe("oquery editor layout", () => {
  test("home editor overrides the static example highlight margin and border", () => {
    const css = readFileSync(new URL("../reports/reports.css", import.meta.url), "utf8");
    const highlightRule = css.match(/\.new-home-example-editor \.query-oquery-highlight\s*\{([^}]*)\}/)?.[1];
    assert.ok(highlightRule, "The home editor must override static example styling.");
    assert.match(highlightRule, /(?:^|;)\s*margin:\s*0\s*(?:;|$)/);
    assert.match(highlightRule, /(?:^|;)\s*border-left:\s*0\s*(?:;|$)/);
  });
});

describe("oquery folding", () => {
  const oquery = [
    "Entity: User",
    "Contexts:",
    "  Managers:",
    "    Entity: User",
    "    Projection:",
    "      - Id",
    "      - Name",
    "Relations:",
    "  - RefContext: Managers",
    "    JoinType: Left",
    "Page: 1",
  ].join("\n");

  test("finds nested mappings, arrays, and relation items", () => {
    const folds = getOqueryFolds(oquery);
    assert.deepEqual(folds.map(fold => [fold.start, fold.end]),
      [[1, 6], [2, 6], [4, 6], [7, 9], [8, 9]]);
  });

  test("handles empty documents and ignores blank and comment-only headers", () => {
    assert.deepEqual(getOqueryFolds(""), []);
    assert.deepEqual(getOqueryFolds("# Contexts:\n  Name: value"), []);
    assert.deepEqual(getOqueryFolds("Contexts:\r\n  # comment\r\n  A:\r\n    Entity: User\r\nPage: 1")
      .map(fold => [fold.start, fold.end]), [[0, 3], [2, 3]]);
  });
});

describe("oquery monaco adapters", () => {
  test("completion inserts escape snippet syntax and place the caret stop where requested", () => {
    assert.deepEqual(toMonacoCompletionInsert({ label: "Name", kind: "field", insertText: "Name" }),
      { insertText: "Name", isSnippet: false });
    assert.deepEqual(toMonacoCompletionInsert({ label: "Sum", kind: "function", insertText: "Sum($ })", cursorOffset: 4 }),
      { insertText: "Sum($0\\$ \\})", isSnippet: true });
  });

  test("minimal edits replace only the changed middle section", () => {
    assert.equal(getMinimalTextEdit("Entity: User", "Entity: User"), null);
    assert.deepEqual(getMinimalTextEdit("Entity: User\nPage: 1", "Entity: User\nPage: 2"),
      { start: 19, end: 20, text: "2" });
    assert.deepEqual(getMinimalTextEdit("ab", "abc"), { start: 2, end: 2, text: "c" });
  });

  test("folding ranges are 1-based and comment headers do not start folds", () => {
    assert.deepEqual(getOqueryFoldingRanges("Contexts:\n  A:\n    Entity: User\n# Page:\n  x: 1"),
      [{ start: 1, end: 3 }, { start: 2, end: 3 }]);
  });

  test("context lenses are found for every context header line", () => {
    assert.deepEqual(getOqueryContextLenses("Entity: User\nManagers is Employees:"),
      [{ lineNumber: 1, contextName: "Entity" }, { lineNumber: 2, contextName: "Managers" }]);
    assert.equal(contextNameAtLine("  Projection:"), "Projection");
  });

  test("context blocks end before the next header and trim trailing blank lines", () => {
    assert.deepEqual(getOqueryContextBlocks("Entity: User\n  Name\n\nManagers is Employees:\n  Id\n\n"),
      [
        { contextName: "Entity", entityName: "Entity", startLine: 1, endLine: 2 },
        { contextName: "Managers", entityName: "Employees", startLine: 4, endLine: 5 },
      ]);
  });

  test("error ranges use the 1-based position reported by validation", () => {
    assert.deepEqual(getOqueryErrorRange({ line: 2, column: 5, length: 3 }), {
      startLineNumber: 2,
      startColumn: 5,
      endLineNumber: 2,
      endColumn: 8,
    });
  });

  test("function highlighting lists longer names first so a shorter prefix cannot win", () => {
    const language = getOqueryMonarchLanguage(["Avg", "AverageAll", "Avg"]);
    const functionRule = language.tokenizer.root.find(([, token]) => token === "function");
    assert.match(functionRule[0].source, /\(AverageAll\|Avg\)/);
    assert.equal(language.tokenizer.root.some(([, token]) => token === "function"), true);
    assert.equal(getOqueryMonarchLanguage([]).tokenizer.root.some(([, token]) => token === "function"), false);
  });

  test("constant values in angle brackets are not tokenized as keywords or functions", () => {
    const language = getOqueryMonarchLanguage(["Avg"]);
    const [enterConstant] = language.tokenizer.root.find(([, action]) => action?.next === "@constant");
    assert.equal(enterConstant.test("<Order and>"), true);
    assert.equal(enterConstant.test("Age <= 5"), false);
    assert.equal(enterConstant.test("Age <> 5"), false);
    assert.equal(enterConstant.test("Age > 5"), false);
    const [insideConstant] = language.tokenizer.constant[0];
    assert.match("Order and Avg", insideConstant);
    assert.equal(language.tokenizer.constant[1][1].next, "@pop");
  });

  test("Enter inside a list section starts a new list item with the same indentation", () => {
    const value = "Projection:\n  - Id";
    const edit = getOqueryEnterEdit(value, value.length, value.length);
    assert.equal(edit.value, "Projection:\n  - Id\n  - ");
    assert.equal(edit.caret, edit.value.length);
  });

  test("Enter on an empty list item removes the marker and outdents", () => {
    const value = "Projection:\n  -";
    const edit = getOqueryEnterEdit(value, value.length, value.length);
    assert.equal(edit.value, "Projection:\n");
  });
});

describe("getOquerySyntaxError", () => {
  const distinctFunctions = [
    { name: "Count", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: true },
    {
      name: "CountIf",
      arguments: [
        { name: "expression", defaultValue: 1 },
        { name: "predicate", defaultValue: null },
      ],
      isAggregate: true,
    },
  ];

  it("accepts distinct projections and aggregate arguments", () => {
    expect(getOquerySyntaxError(
      "Products: distinct Id, Name\nCount(distinct Id)\nCountIf(distinct Id, Id > <0>)",
      distinctFunctions,
      [],
    )).toBeNull();
  });

  it("rejects distinct outside a projection or aggregate argument", () => {
    expect(getOquerySyntaxError(
      "Products: Id distinct",
      distinctFunctions,
      [],
    )).toContain("distinct is only valid");
  });

  it("uses ApplyFor for receiver validation while retaining aggregate nesting rules", () => {
    const functions = [
      { name: "WindowTotal", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: false, applyFor: 1 },
      { name: "ScalarAggregate", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: true, applyFor: 4 },
    ];

    const entities = [
      { name: "Products", fields: ["Id"], relations: [{ name: "Orders", target: "Order", kind: "collection" as const }] },
      { name: "Order", fields: ["Amount"], relations: [] },
    ];
    expect(getOquerySyntaxError("Products: Orders.WindowTotal()", functions, [], entities, "Products")).toBeNull();
    expect(getOquerySyntaxError("Products: Orders.ScalarAggregate()", functions, [], entities, "Products")).toContain("does not accept a dataset receiver");
    expect(getOquerySyntaxError("Products: ScalarAggregate(ScalarAggregate(Id))", functions, [])).toContain("cannot be nested");
  });

  it("ignores malformed function calls in comment lines", () => {
    expect(getOquerySyntaxError(
      "Users: Id\n# UnknownFunction(, )\n# Broken(",
      [],
      [],
    )).toBeNull();
  });

  it("ignores parentheses and commas in inline comments", () => {
    expect(getOquerySyntaxError(
      "Users: Id\nName = Function(Value) # Function(, )",
      [{ name: "Function", arguments: [{ name: "value", defaultValue: null }], isAggregate: false }],
      [],
    )).toBeNull();
  });

  it("accepts a scalar receiver inside an aggregate expression", () => {
    expect(getOquerySyntaxError(
      "Departments: Id, Employees.Avg(HireDate.DateSub(<2025-10-31>) / 365.25) AverageTenureYears",
      [
        {
          name: "Avg",
          arguments: [{ name: "expression", defaultValue: null }],
          isAggregate: true,
        },
        {
          name: "DateSub",
          arguments: [
            { name: "startDate", defaultValue: null },
            { name: "endDate", defaultValue: null },
          ],
          isAggregate: false,
        },
      ],
      [],
    )).toBeNull();
  });

  describe("function applicability uses the same rules as suggestions", () => {
    const entities = [
      {
        name: "Employees",
        fields: ["Id", "HireDate"],
        fieldDataTypes: { Id: "Number", HireDate: "Datetime" },
        relations: [{ name: "Reports", target: "Employees", kind: "collection" }],
      },
    ];
    const functions = [
      {
        name: "DateSub",
        arguments: [
          { name: "startDate", dataType: "Datetime", defaultValue: null },
          { name: "endDate", dataType: "Datetime", defaultValue: null },
        ],
        isAggregate: false,
      },
      {
        name: "Avg",
        arguments: [{ name: "expression", dataType: "Number", defaultValue: null }],
        isAggregate: true,
      },
      {
        name: "Round",
        arguments: [{ name: "value", dataType: "Number", defaultValue: null }],
        isAggregate: false,
      },
    ];

    it("rejects a scalar function after a collection dot", () => {
      expect(getOquerySyntaxError("Employees: Reports.DateSub(<2025-01-01>)", functions, [], entities, "Employees"))
        .toBe("Line 1, column 20: DateSub cannot be applied to collection Reports: it does not accept a dataset receiver.");
    });

    it("accepts a scalar function whose first argument matches the receiver's data type", () => {
      expect(getOquerySyntaxError("Employees: HireDate.DateSub(<2025-01-01>)", functions, [], entities, "Employees"))
        .toBeNull();
    });

    it("rejects a scalar function whose first argument has a different data type", () => {
      expect(getOquerySyntaxError("Employees: Id.DateSub(<2025-01-01>)", functions, [], entities, "Employees"))
        .toBe("Line 1, column 15: DateSub cannot be applied to Id of type Number: its first argument is Datetime.");
    });

    it("accepts an aggregate inside a scalar function", () => {
      expect(getOquerySyntaxError("Employees: Round(Avg(Id))", functions, [], entities, "Employees"))
        .toBeNull();
    });

    it("rejects an aggregate nested inside another aggregate call", () => {
      expect(getOquerySyntaxError("Employees: Avg(Avg(Id))", functions, [], entities, "Employees"))
        .toBe("Line 1, column 16: Avg cannot be nested inside another aggregate function call.");
    });

    it("accepts root aggregates inside grouping parentheses", () => {
      expect(getOquerySyntaxError(
        "Employees: (Avg(Id) * 100.0 / Avg(Id)).Round() Percent",
        functions,
        [],
        entities,
        "Employees",
      )).toBeNull();
    });

    it("accepts a root aggregate inside a grouping nested in a scalar call", () => {
      expect(getOquerySyntaxError("Employees: Round((Avg(Id) * 2))", functions, [], entities, "Employees"))
        .toBeNull();
    });

    it("rejects an aggregate applied to a grouped expression receiver", () => {
      expect(getOquerySyntaxError("Employees: (Id * 2).Avg()", functions, [], entities, "Employees"))
        .toBe("Line 1, column 21: Avg cannot be applied to this expression: it does not accept numeric expressions.");
    });

    it("rejects a function whose first argument is not Number after a grouped expression receiver", () => {
      expect(getOquerySyntaxError("Employees: (Id * 2).DateSub(<2025-01-01>)", functions, [], entities, "Employees"))
        .toBe("Line 1, column 21: DateSub cannot be applied to this expression: its first argument is Datetime, not Number.");
    });
  });
});
