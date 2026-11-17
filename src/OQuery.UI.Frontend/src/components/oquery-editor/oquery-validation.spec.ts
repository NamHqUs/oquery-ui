import { describe, expect, it } from "vitest";
import { getOquerySyntaxError } from "./oquery-validation";

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
