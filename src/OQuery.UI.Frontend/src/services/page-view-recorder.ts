export type PageViewDuration = { page: string; durationMs: number };

// Mirrors the server rules: the backend drops /admin* paths and caps each batch at 50 page views.
export const MAX_BATCH_PAGE_VIEWS = 50;
const MAX_PENDING_PAGE_VIEWS = 200;

export function isTrackablePath(path: string): boolean {
  return !path.startsWith("/admin");
}

// Accumulates time per page. Time only counts while the tab is visible; `pause` and `resume` track that.
export class PageViewRecorder {
  private current: { page: string; enteredAt: number | null } | null = null;
  private pending: PageViewDuration[] = [];

  visit(path: string, now: number, active: boolean): void {
    this.closeSegment(now);
    this.current = isTrackablePath(path) ? { page: path, enteredAt: active ? now : null } : null;
  }

  pause(now: number): void {
    this.closeSegment(now);
    if (this.current) this.current.enteredAt = null;
  }

  resume(now: number): void {
    if (this.current && this.current.enteredAt === null) this.current.enteredAt = now;
  }

  // Closes the running segment so long stays are reported in heartbeats, then returns one batch.
  take(now: number): PageViewDuration[] {
    this.closeSegment(now);
    return this.pending.splice(0, MAX_BATCH_PAGE_VIEWS);
  }

  // Puts views from a failed send back at the front so they are retried in order.
  requeue(views: PageViewDuration[]): void {
    this.pending = [...views, ...this.pending].slice(0, MAX_PENDING_PAGE_VIEWS);
  }

  private closeSegment(now: number): void {
    if (!this.current || this.current.enteredAt === null) return;
    const durationMs = Math.max(0, now - this.current.enteredAt);
    if (durationMs > 0) this.pending.push({ page: this.current.page, durationMs: Math.round(durationMs) });
    this.current.enteredAt = now;
  }
}
