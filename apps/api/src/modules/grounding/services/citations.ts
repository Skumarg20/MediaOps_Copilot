import type { Evidence } from '@/types.js';

export type CitationCheck = {
  valid: string[];
  invalid: string[];
};

export function resolveCitation(raw: string, knownIds: string[]): string | null {
  const id = raw.trim();
  if (id.length === 0) return null;
  if (knownIds.includes(id)) return id;

  const bare = id.replace(/^#/, '');
  const suffixMatches = knownIds.filter((known) => known.endsWith(`#${bare}`));
  if (suffixMatches.length === 1) return suffixMatches[0] ?? null;

  const wrapped = knownIds.filter((known) => bare.endsWith(known));
  if (wrapped.length > 0) {
    return wrapped.reduce((longest, known) => (known.length > longest.length ? known : longest));
  }

  const lowered = bare.toLowerCase();
  const caseMatches = knownIds.filter((known) => known.toLowerCase() === lowered);
  if (caseMatches.length === 1) return caseMatches[0] ?? null;

  return null;
}

export function validateCitations(citedIds: string[], evidence: Evidence[]): CitationCheck {
  const knownIds = evidence.map((e) => e.id);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const raw of dedupe(citedIds)) {
    const id = raw.trim();
    if (id.length === 0) continue;

    const resolved = resolveCitation(id, knownIds);
    if (resolved) valid.push(resolved);
    else invalid.push(id);
  }

  return { valid: dedupe(valid), invalid };
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
