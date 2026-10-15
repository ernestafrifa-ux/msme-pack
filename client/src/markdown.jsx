import { useState } from 'react';

// A small Markdown renderer for guides. It builds React elements directly
// (never HTML strings), so guide text can't inject anything into the page.
// Supports: ## and ### headings, paragraphs, - and 1. lists, - [ ] checklists,
// > notes, **bold**, *italic*, and \* to show a literal asterisk.

function inline(text, keyBase = '') {
  const out = [];
  // Protect escaped asterisks first.
  const src = text.replace(/\\\*/g, '\u0000');
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m;
  let i = 0;
  const restore = (s) => s.replace(/\u0000/g, '*');
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(restore(src.slice(last, m.index)));
    if (m[1] !== undefined) out.push(<strong key={`${keyBase}b${i++}`}>{restore(m[1])}</strong>);
    else out.push(<em key={`${keyBase}i${i++}`}>{restore(m[2])}</em>);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(restore(src.slice(last)));
  return out;
}

function Checklist({ items }) {
  const [done, setDone] = useState(() => items.map(() => false));
  return (
    <ul className="md-checklist">
      {items.map((t, i) => (
        <li key={i}>
          <label>
            <input type="checkbox" checked={done[i]} onChange={() => setDone(done.map((d, j) => (j === i ? !d : d)))} />
            <span>{inline(t, `c${i}`)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function Markdown({ source }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const Tag = h[1].length === 2 ? 'h2' : 'h3';
      blocks.push(<Tag key={i}>{inline(h[2], `h${i}`)}</Tag>);
      i++;
      continue;
    }

    if (/^- \[[ x]\] /.test(line)) {
      const items = [];
      while (i < lines.length && /^- \[[ x]\] /.test(lines[i])) items.push(lines[i++].slice(6));
      blocks.push(<Checklist key={`cl${i}`} items={items} />);
      continue;
    }

    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(<ul key={`ul${i}`}>{items.map((t, j) => <li key={j}>{inline(t, `u${i}-${j}`)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      blocks.push(<ol key={`ol${i}`}>{items.map((t, j) => <li key={j}>{inline(t, `o${i}-${j}`)}</li>)}</ol>);
      continue;
    }

    if (/^> /.test(line)) {
      const parts = [];
      while (i < lines.length && /^> ?/.test(lines[i]) && lines[i].trim()) parts.push(lines[i++].replace(/^> ?/, ''));
      blocks.push(<aside key={`q${i}`} className="md-note">{inline(parts.join(' '), `q${i}`)}</aside>);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|- |\d+\. |> )/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={`p${i}`}>{inline(para.join(' '), `p${i}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
