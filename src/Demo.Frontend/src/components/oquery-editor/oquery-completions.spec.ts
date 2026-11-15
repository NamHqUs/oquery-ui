import { describe, expect, it } from "vitest";
import { getOQueryCompletions, type OQuerySuggestionEntity } from "./oquery-completions";

describe("getOQueryCompletions", () => {
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
});
