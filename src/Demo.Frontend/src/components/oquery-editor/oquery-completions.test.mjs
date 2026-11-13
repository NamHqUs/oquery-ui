import assert from "node:assert/strict";
import test from "node:test";
import { getOQueryCompletions } from "./oquery-completions.ts";

const entities = [
  { name: "Departments", fields: ["Id"], relations: [{ name: "Employees", target: "Employees" }] },
  { name: "Employees", fields: ["Id"], relations: [{ name: "PerformanceReviews", target: "PerformanceReviews" }] },
  { name: "PerformanceReviews", fields: ["Score", "Rating", "BonusAmount", "ReviewYear"], relations: [] },
];

const functions = [
  { name: "Sum", isAggregate: true },
  { name: "Avg", isAggregate: true },
  { name: "AnyFunction", isAggregate: false },
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

test("uses the aggregate receiver as the context inside a relation aggregate", () => {
  assert.deepEqual(fieldLabels("Departments: Employees.Sum("), ["Id", "PerformanceReviews"]);
});

test("uses the nested aggregate receiver and restores the outer context", () => {
  assert.deepEqual(fieldLabels("Departments: Employees.AnyFunction(PerformanceReviews.Avg("), ["BonusAmount", "Rating", "ReviewYear", "Score"]);
  assert.deepEqual(fieldLabels("Departments: Employees.AnyFunction(PerformanceReviews.Avg(Score), "), ["Id", "PerformanceReviews"]);
});

test("does not inherit an incomplete aggregate context from a previous projection", () => {
  const text = [
    "Departments:",
    "    Employees.Avg(PerformanceReviews.AvgIf(Rating, ReviewYear = 2025).Round(2) AverageRating",
    "    Employees.Sum(PerformanceReviews.SumIf(BonusAmount,  ",
  ].join("\n");
  assert.deepEqual(fieldLabels(text), ["BonusAmount", "Rating", "ReviewYear", "Score"]);
});
