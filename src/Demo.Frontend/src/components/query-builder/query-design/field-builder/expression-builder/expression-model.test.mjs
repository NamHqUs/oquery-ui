import assert from "node:assert/strict";
import test from "node:test";
import { formatExpression, updateExpressionNode } from "./expression-model.ts";

const field = (name) => ({ kind: "field", field: name });
const value = (constant) => ({ kind: "value", value: constant });
const condition = (filters) => ({
  kind: "condition",
  condition: { logicalOperation: 0, filters },
});

test("formats a CountIf boolean condition without changing its model", () => {
  const expression = {
    kind: "function",
    function: "CountIf",
    arguments: [condition([{ left: field("IsAbnormal"), operation: 0, right: value(true) }])],
  };
  const original = structuredClone(expression);
  assert.equal(formatExpression(expression), "CountIf(IsAbnormal = <true>)");
  assert.deepEqual(expression, original);
});

test("includes logical connectors before nested condition groups and leaves", () => {
  const expression = condition([
    { left: field("IsActive"), operation: 0, right: value(true) },
    {
      logicalOperation: 1,
      filters: [
        { left: field("Amount"), operation: 4, right: value(100) },
        { left: field("Status"), operation: 0, right: value("Pending"), logicalOperator: 1 },
      ],
    },
    { left: field("DeletedAt"), operation: 12 },
  ]);
  assert.equal(
    formatExpression(expression),
    "IsActive = <true> OR (Amount > <100> OR Status = <Pending>) AND DeletedAt IS NULL",
  );
});

test("formats legacy operands, false, zero, and field comparisons", () => {
  assert.equal(formatExpression(condition([
    { field: "Enabled", operation: 0, value: false },
    { left: field("Total"), operation: 4, right: 0 },
    { left: field("Total"), operation: 4, right: field("Minimum") },
  ])), "Enabled = <false> AND Total > <0> AND Total > Minimum");
});

test("editing another function argument preserves the complete condition", () => {
  const predicate = condition([
    { left: field("Enabled"), operation: 0, right: value(false), parameterized: true },
  ]);
  const expression = { kind: "function", function: "SumIf", arguments: [field("Amount"), predicate] };
  const updated = updateExpressionNode(expression, [0], () => field("NetAmount"));
  assert.deepEqual(updated.arguments[1], predicate);
  assert.equal(formatExpression(updated), "SumIf(NetAmount, Enabled = <false>)");
  assert.equal(formatExpression(expression), "SumIf(Amount, Enabled = <false>)");
});
