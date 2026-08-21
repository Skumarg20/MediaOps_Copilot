import type { Evidence } from '@/types.js';

export type CitationCheck = {
  valid: string[];
  invalid: string[];
};

export function validateCitations(citedIds: string[], evidence: Evidence[]): CitationCheck {
  const known = new Set(evidence.map((e) => e.id));
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const raw of dedupe(citedIds)) {
    const id = raw.trim();
    if (id.length === 0) continue;
    if (known.has(id)) valid.push(id);
    else invalid.push(id);
  }

  return { valid, invalid };
}

export function extractCitedIds(answer: string): string[] {
  const ids: string[] = [];

  const inline = answer.match(/\[([^\]\s][^\]]*)\]/g) ?? [];
  for (const marker of inline) {
    const inner = marker.slice(1, -1);
    for (const part of inner.split(',')) {
      const id = part.trim();
      if (id) ids.push(id);
    }
  }

  const footer = /citations?\s*:\s*(.+)$/im.exec(answer);
  if (footer?.[1]) {
    for (const part of footer[1].split(',')) {
      const id = part.trim().replace(/^\[|\]$/g, '');
      if (id && id.toLowerCase() !== 'none') ids.push(id);
    }
  }

  return dedupe(ids);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
