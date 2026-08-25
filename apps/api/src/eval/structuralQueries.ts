import type { Neo4jGraph } from '@/modules/graph/index.js';
import { EXTRA_DOMAIN_QUERIES } from './domainQueries.js';


export type IntentCategory =
	| 'lookup'
	| 'multi_hop'
	| 'aggregation'
	| 'inverse'
	| 'absence'
	| 'degree'
	| 'comparison'
	| 'temporal'
	| 'what_if'
	| 'propagation'
	| 'prose'
	| 'out_of_domain';

export interface BenchQuery {
	id: string;
	domain: string;
	query: string;
	category: IntentCategory;
	required(graph: Neo4jGraph): Promise<string[]>;
	topAnswer?(graph: Neo4jGraph): Promise<string | null>;
	expectAbstain?: boolean;
	holdOut: boolean;
	note: string;
}


async function nodesOfType(graph: Neo4jGraph, type: string): Promise<string[]> {
	return (await graph.nodes(type)).map((node) => node.id);
}

async function jobsOnWorker(graph: Neo4jGraph, worker: string): Promise<string[]> {
	return (await graph.nodes('Job')).filter((node) => node.attrs.worker === worker).map((node) => node.id);
}

async function workerFailureCounts(graph: Neo4jGraph): Promise<Array<{ id: string; count: number }>> {
	const [workers, jobs] = await Promise.all([(await graph.nodes('Worker')), (await graph.nodes('Job'))]);
	return workers
		.map((worker) => ({
			id: worker.id,
			count: jobs.filter((job) => job.attrs.worker === worker.attrs.name && job.attrs.status === 'failed').length
		}))
		.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

async function undocumentedCodes(graph: Neo4jGraph): Promise<string[]> {
	const codes = await graph.nodes('ErrorCode');
	const degrees = await Promise.all(
		codes.map(async (code) => ({
			id: code.id,
			degree: await graph.degree(code.id, { direction: 'in', edgeTypes: ['DOCUMENTS'] })
		}))
	);
	return degrees.filter((entry) => entry.degree === 0).map((entry) => entry.id);
}

async function sectionsDocumenting(graph: Neo4jGraph, codeId: string): Promise<string[]> {
	return (await graph.neighbors(codeId, { direction: 'in', edgeTypes: ['DOCUMENTS'] })).map((node) => node.id);
}

async function singleSourcedComponents(graph: Neo4jGraph, asOf: string): Promise<string[]> {
	const components = await graph.nodes('Component');
	const degrees = await Promise.all(
		components.map(async (component) => ({
			id: component.id,
			degree: await graph.degree(component.id, { direction: 'in', edgeTypes: ['SUPPLIES'], asOf })
		}))
	);
	return degrees.filter((entry) => entry.degree === 1).map((entry) => entry.id);
}

async function incidentBlastRadius(graph: Neo4jGraph, incidentId: string, type: string): Promise<string[]> {
	return (await graph.expand([incidentId], { direction: 'out', maxHops: 4 }))
		.filter((entry) => entry.node.type === type && entry.hops > 0)
		.map((entry) => entry.node.id);
}

async function sellersOfProducts(graph: Neo4jGraph, productIds: string[]): Promise<string[]> {
	const sellers = new Set<string>();
	for (const productId of productIds) {
		for (const node of await graph.neighbors(productId, { direction: 'out', edgeTypes: ['SOLD_BY'] })) sellers.add(node.id);
	}
	return [...sellers].sort();
}

async function sellerReturnCounts(graph: Neo4jGraph): Promise<Array<{ id: string; count: number }>> {
	const sellers = await graph.nodes('Seller');
	const tallies = await Promise.all(
		sellers.map(async (seller) => ({
			id: seller.id,
			count: (await graph.neighbors(seller.id, { direction: 'in', edgeTypes: ['BY_SELLER'] })).filter(
				(sale) => sale.attrs.returnedOrRefunded === true
			).length
		}))
	);
	return tallies.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export const COMMERCE_AS_OF = '2026-08-20';


const MEDIAOPS_QUERIES: BenchQuery[] = [
	{
		id: 'M1',
		domain: 'mediaops',
		query: 'what does error code RENDER_TIMEOUT mean',
		category: 'lookup',
		required: async () => ['errorCode:RENDER_TIMEOUT'],
		holdOut: false,
		note: 'The locally contained case. Flat retrieval should get this right; it is the control.'
	},
	{
		id: 'M2',
		domain: 'mediaops',
		query: 'how do I fix job 482',
		category: 'multi_hop',
		required: async (graph) => ['job:482', 'errorCode:RENDER_TIMEOUT', ...await sectionsDocumenting(graph, 'errorCode:RENDER_TIMEOUT')],
		holdOut: false,
		note: 'Record, code and runbook. Pinning to record lookup returns the first two and never reads the third.'
	},
	{
		id: 'M3',
		domain: 'mediaops',
		query: 'which worker is causing the most failures',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await workerFailureCounts(graph))[0];
			return top ? [top.id, ...(await jobsOnWorker(graph, String((await graph.node(top.id))?.attrs.name ?? '')))] : [];
		},
		topAnswer: async (graph) => (await workerFailureCounts(graph))[0]?.id ?? null,
		holdOut: false,
		note: 'A count over every job grouped by worker. top-K cannot count; it can only sample.'
	},
	{
		id: 'M4',
		domain: 'mediaops',
		query: 'which other jobs failed for the same reason as job 482',
		category: 'inverse',
		required: async (graph) =>
			(await graph.neighbors('errorCode:RENDER_TIMEOUT', { direction: 'in', edgeTypes: ['FAILED_WITH'] }))
				.map((node) => node.id),
		holdOut: false,
		note: 'Job to code and back out to every other job. The one hop the record path had was one-way.'
	},
	{
		id: 'M5',
		domain: 'mediaops',
		query: 'which error codes have no runbook coverage',
		category: 'absence',
		required: async (graph) => (await undocumentedCodes(graph)),
		holdOut: false,
		note: 'A set complement. Similarity search can only return codes that DO match something.'
	},
	{
		id: 'M6',
		domain: 'mediaops',
		query: 'which workers have failed exactly one job',
		category: 'degree',
		required: async (graph) => (await workerFailureCounts(graph)).filter((entry) => entry.count === 1).map((entry) => entry.id),
		holdOut: false,
		note: 'In-degree counting on FAILED_WITH, filtered. The SPOF shape from the paper, in this domain.'
	},
	{
		id: 'M7',
		domain: 'mediaops',
		query: 'is job 482 the same problem as job 487',
		category: 'comparison',
		required: async () => ['job:482', 'job:487', 'errorCode:RENDER_TIMEOUT', 'errorCode:UPLOAD_TIMEOUT'],
		holdOut: false,
		note: 'Two subgraphs enumerated and compared. No chunk contains a comparison.'
	},
	{
		id: 'M8',
		domain: 'mediaops',
		query: 'which jobs were queued after 11:00 on 2026-08-18',
		category: 'temporal',
		required: async (graph) =>
			(await graph.nodes('Job'))
				.filter((job) => String(job.attrs.queuedAt) >= '2026-08-18T11:00:00Z')
				.map((job) => job.id),
		holdOut: false,
		note: 'Timestamps exist on the records but nothing was time-filterable before the graph.'
	},
	{
		id: 'M9',
		domain: 'mediaops',
		query: 'if worker-07 is drained which jobs lose their only worker',
		category: 'what_if',
		required: async (graph) => (await jobsOnWorker(graph, 'worker-07')),
		holdOut: false,
		note: 'Counterfactual. Defined by what is absent from the graph after a hypothetical edit.'
	},
	{
		id: 'M10',
		domain: 'mediaops',
		query: 'rank workers by exposure to high severity failures',
		category: 'propagation',
		required: async (graph) => {
			const top = (await workerFailureCounts(graph))[0];
			return top ? [top.id] : [];
		},
		topAnswer: async (graph) => (await workerFailureCounts(graph))[0]?.id ?? null,
		holdOut: false,
		note: 'Weighted multi-hop scoring. The score exists nowhere in any text.'
	},
	{
		id: 'M11',
		domain: 'mediaops',
		query: 'when should I drain a worker instead of retrying',
		category: 'prose',
		required: async (graph) =>
			(await graph.nodes('DocSection'))
				.filter((section) => /drain/i.test(section.text))
				.map((section) => section.id),
		holdOut: false,
		note: 'Genuinely a prose question. Included so the comparison shows what the graph does NOT help with.'
	},
	{
		id: 'M12',
		domain: 'mediaops',
		query: 'what is the capital of France',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: false,
		note: 'The abstention guard. Graph expansion must not turn one weak accidental match into evidence.'
	}
];


const COMMERCE_QUERIES: BenchQuery[] = [
	{
		id: 'C1',
		domain: 'commerce',
		query: 'what does supplier SUP-04 supply',
		category: 'lookup',
		required: async (graph) => [
			'supplier:SUP-04',
			...(await graph.neighbors('supplier:SUP-04', { direction: 'out', edgeTypes: ['SUPPLIES'], asOf: COMMERCE_AS_OF })).map((node) => node.id)
		],
		holdOut: true,
		note: 'Control case in the second domain.'
	},
	{
		id: 'C2',
		domain: 'commerce',
		query: 'which components have only one active supplier',
		category: 'degree',
		required: async (graph) => (await singleSourcedComponents(graph, COMMERCE_AS_OF)),
		holdOut: true,
		note: 'In-degree centrality on SUPPLIES across the whole graph — the canonical SPOF query.'
	},
	{
		id: 'C3',
		domain: 'commerce',
		query: 'who supplies the SoC processor now',
		category: 'temporal',
		required: async (graph) =>
			(await graph.neighbors('component:CMP-03', { direction: 'in', edgeTypes: ['SUPPLIES'], asOf: COMMERCE_AS_OF }))
				.map((node) => node.id),
		holdOut: true,
		note: 'The expired contract is still in the prose. Text retrieval returns both suppliers with no way to choose.'
	},
	{
		id: 'C4',
		domain: 'commerce',
		query: 'which seller has the most returned or refunded orders',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await sellerReturnCounts(graph))[0];
			if (!top) return [];
			return [
				top.id,
				...(await graph.neighbors(top.id, { direction: 'in', edgeTypes: ['BY_SELLER'] }))
					.filter((sale) => sale.attrs.returnedOrRefunded === true)
					.map((sale) => sale.id)
			];
		},
		topAnswer: async (graph) => (await sellerReturnCounts(graph))[0]?.id ?? null,
		holdOut: true,
		note: 'Sales aggregation. Neo4j calls this the most dangerous RAG failure: the model confabulates the total from how many chunks it received.'
	},
	{
		id: 'C5',
		domain: 'commerce',
		query: 'which products are exposed to the Shenzhen port closure',
		category: 'multi_hop',
		required: async (graph) => (await incidentBlastRadius(graph, 'incident:EVT-01', 'Product')),
		holdOut: true,
		note: 'Four hops: incident to supplier to component to factory to product.'
	},
	{
		id: 'C6',
		domain: 'commerce',
		query: 'which sellers are not exposed to the Shenzhen port closure',
		category: 'inverse',
		required: async (graph) => {
			const exposed = new Set((await sellersOfProducts(graph, (await incidentBlastRadius(graph, 'incident:EVT-01', 'Product')))));
			return (await nodesOfType(graph, 'Seller')).filter((id) => !exposed.has(id));
		},
		holdOut: true,
		note: 'Blast radius, then its complement. Two operations neither of which is a similarity search.'
	},
	{
		id: 'C7',
		domain: 'commerce',
		query: 'compare the supply chain of AuraPhone X and HomeHub Mini',
		category: 'comparison',
		required: async () => ['product:PRD-01', 'product:PRD-05', 'factory:FAC-01', 'factory:FAC-04'],
		holdOut: true,
		note: 'Dual upstream traversal with parallel metrics.'
	},
	{
		id: 'C8',
		domain: 'commerce',
		query: 'if AudioTek is dropped which components lose their only supplier',
		category: 'what_if',
		required: async (graph) => {
			const supplied = await graph.neighbors('supplier:SUP-07', {
				direction: 'out',
				edgeTypes: ['SUPPLIES'],
				asOf: COMMERCE_AS_OF
			});
			const degrees = await Promise.all(
				supplied.map(async (component) => ({
					id: component.id,
					degree: await graph.degree(component.id, { direction: 'in', edgeTypes: ['SUPPLIES'], asOf: COMMERCE_AS_OF })
				}))
			);
			return degrees.filter((entry) => entry.degree === 1).map((entry) => entry.id);
		},
		holdOut: true,
		note: 'Counterfactual removal over a real dual-sourcing policy.'
	},
	{
		id: 'C9',
		domain: 'commerce',
		query: 'rank products by exposure to active incidents',
		category: 'propagation',
		required: async (graph) => (await nodesOfType(graph, 'Product')),
		topAnswer: async () => 'product:PRD-01',
		holdOut: true,
		note: 'Severity-weighted hop-decay scoring over every product. Equation 1 of the paper, on sales data.'
	},
	{
		id: 'C10',
		domain: 'commerce',
		query: 'how many components does Chennai Assembly depend on',
		category: 'aggregation',
		required: async (graph) =>
			(await graph.neighbors('factory:FAC-01', { direction: 'in', edgeTypes: ['USED_BY'] })).map((node) => node.id),
		holdOut: true,
		note: 'A bounded count. The answer is a number, and a top-K retriever has no way to know it stopped early.'
	},
	{
		id: 'C11',
		domain: 'commerce',
		query: 'when is a seller put into commercial review',
		category: 'prose',
		required: async (graph) =>
			(await graph.nodes('DocSection'))
				.filter((section) => /commercial review/i.test(section.text))
				.map((section) => section.id),
		holdOut: true,
		note: 'Genuinely a prose question in the second domain.'
	},
	{
		id: 'C12',
		domain: 'commerce',
		query: 'what is the boiling point of mercury',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: true,
		note: 'Abstention guard for the second domain.'
	}
];

export const BENCH_QUERIES: BenchQuery[] = [...MEDIAOPS_QUERIES, ...COMMERCE_QUERIES, ...EXTRA_DOMAIN_QUERIES];

export const INTENT_CATEGORIES: IntentCategory[] = [
	'lookup',
	'multi_hop',
	'aggregation',
	'inverse',
	'absence',
	'degree',
	'comparison',
	'temporal',
	'what_if',
	'propagation',
	'prose',
	'out_of_domain'
];
