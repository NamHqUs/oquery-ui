import { describe, expect, it } from "vitest";
import { getOQueryCompletions, type OQuerySuggestionEntity } from "./oquery-completions";

describe("getOQueryCompletions", () => {
  const aggregateFunctions = [
    { name: "Count", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: true },
  ];

  it("uses the current entity context when suggesting fields on a later header", () => {
    const entities: OQuerySuggestionEntity[] = [
      {
        name: "User",
        fields: ["Id", "Address"],
        relations: [],
      },
      {
        name: "School",
        fields: ["Id", "Name"],
        relations: [],
      },
    ];
    const text = "User: Address\nSchool: ";
    const result = getOQueryCompletions(text, text.length, ["Id", "Address"], [], ["User", "School"], [], "User", entities);

    expect(result.items.map((item) => item.label)).toEqual(expect.arrayContaining(["Id", "Name"]));
    expect(result.items.map((item) => item.label)).not.toContain("Address");
  });

  it("suggests distinct at projection and aggregate starts", () => {
    const projection = getOQueryCompletions(
      "Products: ",
      10,
      ["Id"],
      [],
      ["Products"],
      aggregateFunctions,
    );
    const aggregate = getOQueryCompletions(
      "Products: Count(",
      16,
      ["Id"],
      [],
      ["Products"],
      aggregateFunctions,
    );

    expect(projection.items.map((item) => item.label)).toContain("Distinct");
    expect(aggregate.items.map((item) => item.label)).toContain("Distinct");
  });

  it("uses ApplyFor rather than IsAggregate for receiver applicability", () => {
    const definitions = [
      { name: "WindowTotal", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: false, applyFor: 1 },
      { name: "ScalarAggregate", arguments: [{ name: "value", defaultValue: 1 }], isAggregate: true, applyFor: 4 },
    ];
    const result = getOQueryCompletions(
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
    );

    expect(result.items.map((item) => item.label)).toContain("WindowTotal");
    expect(result.items.map((item) => item.label)).not.toContain("ScalarAggregate");
  });

  it("suggests collection functions such as Any inside a where clause after a collection dot", () => {
    const entities: OQuerySuggestionEntity[] = [
      { name: "Employees", fields: ["Id", "Salary"], relations: [{ name: "Members", target: "Employees", kind: "collection" }] },
    ];
    const functions = [
      { name: "Any", arguments: [{ name: "predicate", defaultValue: null }], isAggregate: false, applyFor: 1 },
      { name: "Round", arguments: [{ name: "value", defaultValue: null }], isAggregate: false, applyFor: 4 },
    ];
    const text = "Employees: Id\n  Where Members.";
    const labels = getOQueryCompletions(text, text.length, ["Id"], [], ["Employees"], functions, "Employees", entities)
      .items.filter((item) => item.kind === "function").map((item) => item.label);

    expect(labels).toEqual(["Any"]);
  });
});
