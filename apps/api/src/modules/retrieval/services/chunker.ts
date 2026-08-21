import { config } from '@/config.js';

export type Chunk = {
  id: string;
  docId: string;
  heading: string;
  text: string;
};

export function chunkMarkdown(
  docId: string,
  markdown: string,
  opts: { size?: number; overlap?: number } = {},
): Chunk[] {
  const size = opts.size ?? config.retrieval.chunkSize;
  const overlap = opts.overlap ?? config.retrieval.chunkOverlap;

  const sections = splitByHeading(markdown);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    for (const body of splitToSize(section.body, size, overlap)) {
      chunks.push({
        id: `${docId}#c${index}`,
        docId,
        heading: section.heading,
        text: section.heading ? `${section.heading}\n\n${body}` : body,
      });
      index += 1;
    }
  }

  return chunks;
}

function splitByHeading(markdown: string): Array<{ heading: string; body: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } = { heading: '', body: [] };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      if (current.heading || current.body.some((l) => l.trim())) sections.push(current);
      current = { heading: (match[2] ?? '').trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.heading || current.body.some((l) => l.trim())) sections.push(current);

  return sections
    .map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }))
    .filter((s) => s.body.length > 0);
}

function splitToSize(body: string, size: number, overlap: number): string[] {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  const out: string[] = [];
  let buffer = '';

  const flush = () => {
    if (!buffer.trim()) return;
    out.push(buffer.trim());
    buffer = overlap > 0 ? buffer.slice(-overlap) : '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      flush();
      for (const piece of packSentences(paragraph, size, overlap)) out.push(piece);
      buffer = '';
      continue;
    }
    if (buffer && `${buffer}\n\n${paragraph}`.length > size) flush();
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  if (buffer.trim()) out.push(buffer.trim());

  return out;
}

function packSentences(text: string, size: number, overlap: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if (buffer && `${buffer} ${sentence}`.length > size) {
      out.push(buffer.trim());
      buffer = overlap > 0 ? `${buffer.slice(-overlap)} ${sentence}` : sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}
