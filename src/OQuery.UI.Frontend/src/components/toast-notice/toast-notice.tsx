import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import Icon from "../icon/icon";
import "./toast-notice.css";

type ToastNoticeProps = {
  message: string | null | undefined;
  isError?: boolean;
  onDismiss?: () => void;
  placement?: "viewport" | "anchor";
};

export default function ToastNotice({ message, isError = false, onDismiss, placement = "viewport" }: ToastNoticeProps) {
  const [visible, setVisible] = useState(Boolean(message));
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current?.();
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  if (!message || !visible || typeof document === "undefined") return null;

  const notice = (
    <div className={`toast-notice${isError ? " error" : ""}${placement === "anchor" ? " anchored" : ""}`} role={isError ? "alert" : "status"} aria-atomic="true">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => {
        setVisible(false);
        onDismissRef.current?.();
      }}>
        <Icon name="close" size={13} />
      </button>
    </div>
  );

  return placement === "anchor" ? notice : createPortal(notice, document.body);
}
