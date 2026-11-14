import { describe, expect, it } from "vitest";
import { getOquerySyntaxError } from "./oquery-validation";

describe("getOquerySyntaxError", () => {
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
});
