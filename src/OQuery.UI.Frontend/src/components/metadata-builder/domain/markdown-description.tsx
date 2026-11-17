import type { ReactNode } from "react";

type MarkdownDescriptionProps = {
  value: string;
};

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: "\"",
};

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi, (entity, reference: string) => {
    const normalizedReference = reference.toLowerCase();
    if (normalizedReference in namedEntities) {
      return namedEntities[normalizedReference];
    }

    const isHex = normalizedReference[1] === "x";
    const codePoint = Number.parseInt(reference.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function renderInline(value: string): ReactNode[] {
  return decodeHtmlEntities(value).split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
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
  let quote: string[] = [];

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
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(<blockquote key={`quote-${blocks.length}`}>{quote.map((line, index) => (
      <span key={index}>{index > 0 && <br />}{renderInline(line)}</span>
    ))}</blockquote>);
    quote = [];
  };

  lines.forEach((line) => {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    const quoteLine = line.match(/^\s*>\s?(.*)$/);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
    } else if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const Heading = `h${heading[1].length}` as "h1" | "h2" | "h3";
      blocks.push(<Heading key={`heading-${blocks.length}`}>{renderInline(heading[2])}</Heading>);
    } else if (listItem) {
      flushParagraph();
      flushQuote();
      list.push(listItem[1]);
    } else if (line.trim()) {
      flushList();
      flushQuote();
      paragraph.push(line.trim());
    } else {
      flushParagraph();
      flushList();
      flushQuote();
    }
  });
  flushParagraph();
  flushList();
  flushQuote();

  return <div className="markdown-description">{blocks}</div>;
}
