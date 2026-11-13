import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import Icon from "../icon/icon";
import { docGroups, docSections } from "./doc-agenda";
import "./documentation.css";

const SECTION_IDS = docSections.map((section) => section.id);

// The app header is about 130px tall; a section becomes active once its top passes this line.
const ACTIVE_LINE_PX = 190;

function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0]);

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= ACTIVE_LINE_PX) current = id;
      }
      setActiveId(current);
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [ids]);

  return activeId;
}

function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Documentation() {
  const activeId = useActiveSection(SECTION_IDS);

  return (
    <div className="doc-page">
      <aside className="doc-nav" aria-label="Documentation navigation">
        <div className="doc-nav-brand">
          <span className="doc-nav-icon"><Icon name="file-text" size={15} /></span>
          <div>
            <small>OQUERY STUDIO</small>
            <strong>Documentation</strong>
          </div>
        </div>
        {docGroups.map((group) => (
          <div className="doc-nav-group" key={group.id}>
            <span className="doc-nav-label">{group.label}</span>
            {docSections
              .filter((section) => section.group === group.id)
              .map((section) => {
                const isActive = section.id === activeId;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={isActive ? "active" : undefined}
                    aria-current={isActive ? "location" : undefined}
                    onClick={(event) => jumpTo(event, section.id)}
                  >
                    {section.title}
                  </a>
                );
              })}
          </div>
        ))}
      </aside>

      <article className="doc-article">
        <header className="doc-hero">
          <span className="eyebrow"><i /> PRODUCT GUIDE · .NET QUERY ENGINE</span>
          <h1>Build configurable data experiences with oQuery</h1>
          <p>
            oQuery turns query intent, runtime metadata, and domain vocabulary into safe, provider-specific SQL.
            Follow relationships, derive grouping and HAVING, compose reusable contexts, and power data grids,
            saved queries, admin screens, and APIs without a CLR class for every table.
          </p>
          <div className="doc-hero-actions">
            <a className="button primary" href="#quickstart" onClick={(event) => jumpTo(event, "quickstart")}>
              <Icon name="play" size={13} /> Start the quickstart
            </a>
            <a className="doc-text-link" href="https://github.com/NamHqUs/OQuery" target="_blank" rel="noreferrer">
              View source on GitHub <Icon name="chevron" size={12} />
            </a>
          </div>
        </header>

        {docSections.map((doc, index) => {
          const Content = doc.Content;
          const groupLabel = docGroups.find((group) => group.id === doc.group)?.label ?? "";
          return (
            <section key={doc.id} id={doc.id} className="doc-section">
              <header className="doc-section-head">
                <span className="doc-kicker">{String(index + 1).padStart(2, "0")} · {groupLabel}</span>
                <h2>{doc.title}</h2>
                <p>{doc.lead}</p>
              </header>
              <Content />
            </section>
          );
        })}
      </article>
    </div>
  );
}
