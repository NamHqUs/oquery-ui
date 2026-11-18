import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { acknowledgeAnalyticsNotice, hasAcknowledgedAnalyticsNotice, startAnalyticsTracking, trackPageVisit } from "../../services/analytics-service";
import "./analytics-tracker.css";

// Renders nothing except the one-time privacy notice; all tracking runs from effects.
export default function AnalyticsTracker() {
  const { pathname } = useLocation();
  const [noticeOpen, setNoticeOpen] = useState(() => !hasAcknowledgedAnalyticsNotice());

  useEffect(() => startAnalyticsTracking(), []);
  useEffect(() => { trackPageVisit(pathname); }, [pathname]);

  if (!noticeOpen) return null;
  return (
    <div className="analytics-notice" role="region" aria-label="Privacy notice">
      <p>
        We record anonymous usage: a random visitor ID, the pages you view, time on each page, and the site you came from.
        We do not collect your name, account, or contact details.
      </p>
      <button type="button" onClick={() => { acknowledgeAnalyticsNotice(); setNoticeOpen(false); }}>Got it</button>
    </div>
  );
}
