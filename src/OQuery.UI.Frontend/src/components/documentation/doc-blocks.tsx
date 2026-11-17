import { useState } from "react";
import type { ReactNode } from "react";
import Icon from "../icon/icon";
import type { IconName } from "../icon/icon";

type CodeBlockProps = {
  language: string;
  children: string;
};

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(children);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="doc-code">
      <div className="doc-code-bar">
        <span>{language}</span>
        <button type="button" className="doc-code-copy" onClick={copyCode} aria-label={`Copy ${language} example`}>
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

type CalloutProps = {
  icon?: IconName;
  children: ReactNode;
};

export function Callout({ icon = "check", children }: CalloutProps) {
  return (
    <div className="doc-callout">
      <Icon name={icon} size={15} />
      <p>{children}</p>
    </div>
  );
}

type InfoCardProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

export function InfoCard({ icon, title, children }: InfoCardProps) {
  return (
    <div className="doc-card">
      <span className="doc-card-icon">{icon}</span>
      <strong>{title}</strong>
      <div className="doc-card-text">{children}</div>
    </div>
  );
}
