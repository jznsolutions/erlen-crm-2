import { Fragment } from "react";

// Minimaler, sicherer Markdown-Renderer (keine HTML-Ausgabe, kein dangerouslySetInnerHTML).
// Unterstützt: # Überschriften, **fett**, *kursiv*, [Links](https://…), Listen, > Zitate, Absätze.

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const label = tok.slice(1, tok.indexOf("]"));
      const href = tok.slice(tok.indexOf("(") + 1, -1);
      out.push(<a key={k} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  const flush = () => {
    const k = `b${blocks.length}`;
    if (para.length) blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
    else if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
    } else if (quote.length) blocks.push(<blockquote key={k}>{inline(quote.join(" "), k)}</blockquote>);
    para = [];
    list = null;
    quote = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const q = line.match(/^>\s?(.*)$/);
    if (!line.trim()) { flush(); continue; }
    if (h) {
      flush();
      const k = `b${blocks.length}`;
      const Tag = (`h${h[1].length}`) as "h1" | "h2" | "h3";
      blocks.push(<Tag key={k}>{inline(h[2], k)}</Tag>);
      continue;
    }
    if (ul || ol) {
      const ordered = !!ol;
      if (para.length || quote.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (q) {
      if (para.length || list) flush();
      quote.push(q[1]);
      continue;
    }
    if (list || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return <div className="prose-erlen">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
