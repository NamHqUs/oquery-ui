import { describe, expect, it } from "vitest";
import { datesForDays, rangeForDates, toCsv, validateDates } from "./admin-analytics-service";

describe("admin analytics date helpers", () => {
  it("converts an inclusive day range to the API's half-open range", () => {
    expect(rangeForDates("2026-01-01", "2026-01-31")).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });

  it("builds the last N days ending today in UTC", () => {
    expect(datesForDays(7, new Date("2026-03-10T12:00:00Z"))).toEqual({ fromDay: "2026-03-04", toDay: "2026-03-10" });
  });

  it("rejects a reversed range and a span over 366 days", () => {
    expect(validateDates("2026-02-01", "2026-01-01")).toBe("'From' must be on or before 'To'.");
    expect(validateDates("2025-01-01", "2026-01-02")).toBe("The range may not exceed 366 days.");
    expect(validateDates("2025-01-01", "2026-01-01")).toBeNull();
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines per RFC 4180", () => {
    const csv = toCsv(["URL", "Requests"], [["/a,b", 1], ['/say "hi"', 2], ["/line\nbreak", 3]]);
    expect(csv).toBe('URL,Requests\r\n"/a,b",1\r\n"/say ""hi""",2\r\n"/line\nbreak",3\r\n');
  });
});
