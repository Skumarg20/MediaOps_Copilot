import type { AttrValue, CorpusDocument, EdgeType, GraphEdge, GraphNode, NodeType } from '../types.js';


export function nid(prefix: string, id: string): string {
	return `${prefix}:${id}`;
}

export function entities<T extends { id: string }>(
	type: NodeType,
	prefix: string,
	rows: T[],
	describe: (row: T) => { label: string; text: string; attrs?: Record<string, AttrValue> }
): GraphNode[] {
	return rows.map((row) => {
		const described = describe(row);
		return {
			id: nid(prefix, row.id),
			type,
			label: described.label,
			attrs: { code: row.id, ...(described.attrs ?? {}) },
			text: described.text
		};
	});
}

export interface RelationRow {
	from: string;
	to: string;
	weight?: number;
	validFrom?: string;
	validTo?: string;
	attrs?: Record<string, AttrValue>;
}

export function relations(type: EdgeType, rows: RelationRow[]): GraphEdge[] {
	return rows.map((row) => ({
		type,
		from: row.from,
		to: row.to,
		...(row.weight !== undefined ? { weight: row.weight } : {}),
		...(row.validFrom !== undefined ? { validFrom: row.validFrom } : {}),
		...(row.validTo !== undefined ? { validTo: row.validTo } : {}),
		...(row.attrs !== undefined ? { attrs: row.attrs } : {})
	}));
}

export function chunkDocument(doc: CorpusDocument): Array<{ id: string; heading: string; text: string }> {
	const parts = doc.text
		.split(/\n(?=#{1,6}\s)/)
		.map((part) => part.trim())
		.filter(Boolean);

	return parts.map((part, index) => {
		const heading = /^#{1,6}\s+(.*)$/m.exec(part)?.[1]?.trim() ?? doc.title;
		return { id: `${doc.id}#c${index}`, heading, text: part };
	});
}

export function documentNodes(documents: CorpusDocument[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	for (const doc of documents) {
		const chunks = chunkDocument(doc);
		for (const chunk of chunks) {
			nodes.push({
				id: chunk.id,
				type: 'DocSection',
				label: chunk.heading,
				attrs: { docId: doc.id, heading: chunk.heading },
				text: chunk.text
			});
		}
		for (let index = 1; index < chunks.length; index += 1) {
			const previous = chunks[index - 1];
			const current = chunks[index];
			if (!previous || !current) continue;
			edges.push({ type: 'ADJACENT_TO', from: previous.id, to: current.id });
			edges.push({ type: 'ADJACENT_TO', from: current.id, to: previous.id });
		}
	}

	return { nodes, edges };
}

export const DOC_SECTION_TYPE = {
	name: 'DocSection',
	description: 'One retrievable chunk of policy, runbook or playbook prose.'
} as const;

export const DOC_ADJACENCY_EDGE = {
	name: 'ADJACENT_TO',
	from: 'DocSection',
	to: 'DocSection',
	description: 'Neighbouring section in the same document.'
} as const;
