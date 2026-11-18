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
    <div className="analytics-notice" role="region" aria-label="Analytics notice">
      <p>
        <strong>We use usage data to improve this site.</strong> To do this, we store a randomly generated visitor identifier in your browser,
        the pages you view, the time spent on each page, and the site that referred you. We do not collect your name, account, or contact details.
      </p>
      <button type="button" onClick={() => { acknowledgeAnalyticsNotice(); setNoticeOpen(false); }}>OK</button>
    </div>
  );
}
