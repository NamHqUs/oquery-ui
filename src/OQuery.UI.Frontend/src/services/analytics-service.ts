import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";
import { PageViewRecorder, MAX_BATCH_PAGE_VIEWS } from "./page-view-recorder";

const VISITOR_KEY = "oquery.analytics.visitor";
const SECTION_KEY = "oquery.analytics.section";
const NOTICE_KEY = "oquery.analytics.notice-ack";
const HEARTBEAT_MS = 30_000;
// A section is one continuous visit. Returning after this much hidden time starts a new section.
const SECTION_IDLE_MS = 30 * 60_000;

type Section = {
  sectionId: string;
  lastActiveAt: number;
  landingPage: string;
  referrer: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

const recorder = new PageViewRecorder();
let currentPath = "/";

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Storage can be blocked (private mode, disabled cookies). Tracking must never break the app, so failures are ignored.
function readStorage(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* ignored: tracking is best effort */ }
}

function visitorId(): string {
  const stored = readStorage(localStorage, VISITOR_KEY);
  if (stored) return stored;
  const created = newId();
  writeStorage(localStorage, VISITOR_KEY, created);
  return created;
}

function readSection(): Section | null {
  const raw = readStorage(sessionStorage, SECTION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Section; } catch { return null; }
}

function touchSection(now: number, path: string): Section {
  const stored = readSection();
  if (stored && now - stored.lastActiveAt <= SECTION_IDLE_MS) {
    if (!document.hidden) {
      stored.lastActiveAt = now;
      writeStorage(sessionStorage, SECTION_KEY, JSON.stringify(stored));
    }
    return stored;
  }
  const params = new URLSearchParams(window.location.search);
  const section: Section = {
    sectionId: newId(),
    lastActiveAt: now,
    landingPage: path,
    referrer: document.referrer,
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
  };
  writeStorage(sessionStorage, SECTION_KEY, JSON.stringify(section));
  return section;
}

// Sends the open segments and queued page views. Heartbeats with no page views still update the section's last-seen time.
async function flush(keepalive: boolean): Promise<void> {
  const now = Date.now();
  const section = touchSection(now, currentPath);
  const visitor = visitorId();
  while (true) {
    const pageViews = recorder.take(now);
    try {
      await requestJson(apiUrls.analytics.events, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId: visitor,
          sectionId: section.sectionId,
          referrer: section.referrer || null,
          utmSource: section.utmSource ?? null,
          utmMedium: section.utmMedium ?? null,
          utmCampaign: section.utmCampaign ?? null,
          landingPage: section.landingPage,
          pageViews,
        }),
        keepalive,
      });
    } catch {
      recorder.requeue(pageViews);
      return;
    }
    if (pageViews.length < MAX_BATCH_PAGE_VIEWS) return;
  }
}

// Records a route change. Called from the router so each page's time is measured from its visit.
export function trackPageVisit(path: string): void {
  currentPath = path;
  const now = Date.now();
  recorder.visit(path, now, !document.hidden);
  touchSection(now, path);
}

// Starts heartbeats and visibility handling. Returns a cleanup function.
export function startAnalyticsTracking(): () => void {
  const onVisibilityChange = () => {
    const now = Date.now();
    if (document.hidden) {
      recorder.pause(now);
      void flush(true);
    } else {
      recorder.resume(now);
    }
  };
  const onPageHide = () => {
    recorder.pause(Date.now());
    void flush(true);
  };
  const timer = window.setInterval(() => {
    if (!document.hidden) void flush(false);
  }, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
  };
}

export function hasAcknowledgedAnalyticsNotice(): boolean {
  return readStorage(localStorage, NOTICE_KEY) === "1";
}

export function acknowledgeAnalyticsNotice(): void {
  writeStorage(localStorage, NOTICE_KEY, "1");
}
