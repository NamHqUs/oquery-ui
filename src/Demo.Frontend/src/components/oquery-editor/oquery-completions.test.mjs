import assert from "node:assert/strict";
import test from "node:test";
import { getOQueryCompletions } from "./oquery-completions.ts";

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
