import type { FilterOperatorDefinition } from "./query-builder-slice";

const allDataTypes = ["string", "number", "datetime", "boolean"];
const orderedDataTypes = ["number", "datetime"];

// The built-in operators are fixed by the OQuery engine, so the query builder reads them from here instead of the API.
const builtinOperators: [number, string, string, string[]][] = [
  [0, "Equals", "=", allDataTypes],
  [1, "Not equals", "<>", allDataTypes],
  [2, "Like", "LIKE", ["string"]],
  [3, "Not like", "NOT LIKE", ["string"]],
  [4, "Greater than", ">", orderedDataTypes],
  [5, "Less than", "<", orderedDataTypes],
  [6, "Greater than or equal to", ">=", orderedDataTypes],
  [7, "Less than or equal to", "<=", orderedDataTypes],
  [8, "Between", "BETWEEN", orderedDataTypes],
  [9, "Not between", "NOT BETWEEN", orderedDataTypes],
  [10, "In", "IN", allDataTypes],
  [11, "Not in", "NOT IN", allDataTypes],
  [12, "Is null", "IS NULL", allDataTypes],
  [13, "Is not null", "IS NOT NULL", allDataTypes],
];

export const builtinFilterOperators: FilterOperatorDefinition[] = builtinOperators.map(
  ([code, name, symbol, supportedDataTypes]) => ({
    id: `builtin:${code}`,
    name,
    symbol,
    supportedDataTypes,
    isBuiltin: true,
  }),
);
