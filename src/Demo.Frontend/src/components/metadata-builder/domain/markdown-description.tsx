import type { ReactNode } from "react";

type MarkdownDescriptionProps = {
  value: string;
};

function renderInline(value: string): ReactNode[] {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function MarkdownDescription({ value }: MarkdownDescriptionProps) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`paragraph-${blocks.length}`}>{paragraph.map((line, index) => (
      <span key={index}>{index > 0 && <br />}{renderInline(line)}</span>
    ))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</ul>);
    list = [];
  };

  lines.forEach((line) => {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = `h${heading[1].length}` as "h1" | "h2" | "h3";
      blocks.push(<Heading key={`heading-${blocks.length}`}>{renderInline(heading[2])}</Heading>);
    } else if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
    } else if (line.trim()) {
      flushList();
      paragraph.push(line.trim());
    } else {
      flushParagraph();
      flushList();
    }
  });
  flushParagraph();
  flushList();

  return <div className="markdown-description">{blocks}</div>;
}
