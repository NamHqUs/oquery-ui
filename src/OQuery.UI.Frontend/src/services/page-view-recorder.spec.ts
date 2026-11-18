import { describe, expect, it } from "vitest";
import { MAX_BATCH_PAGE_VIEWS, PageViewRecorder } from "./page-view-recorder";

describe("PageViewRecorder", () => {
  it("measures time per page from each visit", () => {
    const recorder = new PageViewRecorder();
    recorder.visit("/a", 0, true);
    recorder.visit("/b", 5000, true);

    expect(recorder.take(12000)).toEqual([
      { page: "/a", durationMs: 5000 },
      { page: "/b", durationMs: 7000 },
    ]);
  });

  it("does not track admin paths", () => {
    const recorder = new PageViewRecorder();
    recorder.visit("/admin", 0, true);

    expect(recorder.take(60000)).toEqual([]);
  });

  it("stops counting while the tab is hidden", () => {
    const recorder = new PageViewRecorder();
    recorder.visit("/a", 0, true);
    recorder.pause(2000);
    recorder.resume(10000);

    expect(recorder.take(11000)).toEqual([
      { page: "/a", durationMs: 2000 },
      { page: "/a", durationMs: 1000 },
    ]);
  });

  it("returns at most one batch and keeps the rest for the next flush", () => {
    const recorder = new PageViewRecorder();
    for (let i = 0; i < MAX_BATCH_PAGE_VIEWS + 10; i++) recorder.visit(`/p${i}`, i * 1000, true);

    const first = recorder.take(MAX_BATCH_PAGE_VIEWS * 1000 + 10000);
    const second = recorder.take(MAX_BATCH_PAGE_VIEWS * 1000 + 10000);

    expect(first).toHaveLength(MAX_BATCH_PAGE_VIEWS);
    expect(second.map((view) => view.page)).toContain(`/p${MAX_BATCH_PAGE_VIEWS + 9}`);
  });

  it("puts failed views back at the front in their original order", () => {
    const recorder = new PageViewRecorder();
    recorder.visit("/a", 0, true);
    recorder.visit("/b", 1000, true);
    const failed = recorder.take(2000);
    recorder.visit("/c", 2000, true);
    recorder.requeue(failed);

    expect(recorder.take(3000).map((view) => view.page)).toEqual(["/a", "/b", "/c"]);
  });
});
