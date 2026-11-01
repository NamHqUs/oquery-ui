import { createContext, ReactNode, useCallback, useContext, useState } from "react";
import "./message-box.css";

export type MessageBoxAction = {
  value: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
};

export type MessageBoxRequest = {
  eyebrow?: string;
  title: string;
  message: string;
  actions: MessageBoxAction[];
};

type QueuedMessageBox = {
  request: MessageBoxRequest;
  resolve: (value: string) => void;
};

const MessageBoxContext = createContext<((request: MessageBoxRequest) => Promise<string>) | null>(null);

export function MessageBoxProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedMessageBox[]>([]);
  const showMessageBox = useCallback((request: MessageBoxRequest) => new Promise<string>((resolve) => {
    setQueue((current) => [...current, { request, resolve }]);
  }), []);

  const active = queue[0];
  const complete = (value: string) => {
    if (!active) return;
    active.resolve(value);
    setQueue((current) => current.slice(1));
  };

  return (
    <MessageBoxContext.Provider value={showMessageBox}>
      {children}
      {active && (
        <div className="message-box-backdrop">
          <section className="message-box" role="alertdialog" aria-modal="true" aria-labelledby="message-box-title" aria-describedby="message-box-message">
            {active.request.eyebrow && <span className="section-kicker">{active.request.eyebrow}</span>}
            <h2 id="message-box-title">{active.request.title}</h2>
            <p id="message-box-message">{active.request.message}</p>
            <div className="message-box-actions">
              {active.request.actions.map((action) => (
                <button
                  className={`button ${action.variant || "secondary"}`}
                  type="button"
                  key={action.value}
                  onClick={() => complete(action.value)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </MessageBoxContext.Provider>
  );
}

export function useMessageBox() {
  const showMessageBox = useContext(MessageBoxContext);
  if (!showMessageBox) throw new Error("useMessageBox must be used within MessageBoxProvider.");
  return showMessageBox;
}
