export type AttrValue = string | number | boolean | null;

export type NodeType = string;
export type EdgeType = string;

export interface GraphNode {
	id: string;
	type: NodeType;
	label: string;
	attrs: Record<string, AttrValue>;
	text: string;
}

export interface GraphEdge {
	type: EdgeType;
	from: string;
	to: string;
	weight?: number;
	validFrom?: string;
	validTo?: string;
	attrs?: Record<string, AttrValue>;
}

export interface EdgeTypeSpec {
	name: EdgeType;
	from: NodeType;
	to: NodeType;
	description: string;
}

export interface GraphSchema {
	domain: string;
	description: string;
	nodeTypes: Array<{ name: NodeType; description: string }>;
	edgeTypes: EdgeTypeSpec[];
}

export interface CorpusDocument {
	id: string;
	title: string;
	text: string;
}

export interface DomainDataset {
	schema: GraphSchema;
	nodes: GraphNode[];
	edges: GraphEdge[];
	documents: CorpusDocument[];
}

export type Direction = 'out' | 'in' | 'both';

export interface TraversalOptions {
	edgeTypes?: EdgeType[];
	direction?: Direction;
	asOf?: string;
	maxHops?: number;
}

export interface ReachedNode {
	node: GraphNode;
	hops: number;
	path: string[];
	via: EdgeType[];
}
