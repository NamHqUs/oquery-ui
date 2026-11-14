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
        .toBe("Line 1, column 20: DateSub cannot be applied to collection Reports: only aggregate functions apply.");
    });

    it("accepts a scalar function whose first argument matches the receiver's data type", () => {
      expect(getOquerySyntaxError("Employees: HireDate.DateSub(<2025-01-01>)", functions, [], entities, "Employees"))
        .toBeNull();
    });

    it("rejects a scalar function whose first argument has a different data type", () => {
      expect(getOquerySyntaxError("Employees: Id.DateSub(<2025-01-01>)", functions, [], entities, "Employees"))
        .toBe("Line 1, column 15: DateSub cannot be applied to Id of type Number: its first argument is Datetime.");
    });

    it("rejects an aggregate nested inside another function call", () => {
      expect(getOquerySyntaxError("Employees: Round(Avg(Id))", functions, [], entities, "Employees"))
        .toBe("Line 1, column 18: Avg cannot be nested inside another function call: it is an aggregate.");
    });
  });
});
