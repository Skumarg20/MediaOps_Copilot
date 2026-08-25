import {
	AEROSPACE_AS_OF,
	FINANCE_AS_OF,
	LOGISTICS_AS_OF,
	MANUFACTURING_AS_OF,
	RETAIL_AS_OF
} from '@/modules/graph/index.js';
import {
	blastRadius,
	complementOf,
	exposureRanking,
	onOrAfter,
	rankByReach,
	reachedOfType,
	sectionsMatching,
	strandedBy,
	withDegree,
	withoutRelation
} from './queryHelpers.js';
import type { BenchQuery } from './structuralQueries.js';



const AEROSPACE: BenchQuery[] = [
	{
		id: 'AE1',
		domain: 'aerospace',
		query: 'what does supplier SUP-002 supply',
		category: 'lookup',
		required: async (graph) => [
			'supplier:SUP-002',
			...(await reachedOfType(graph, 'supplier:SUP-002', { targetType: 'Component', edgeTypes: ['SUPPLIES'], asOf: AEROSPACE_AS_OF }))
		],
		holdOut: true,
		note: 'The control: an entity and its direct relations, which flat retrieval can plausibly reach.'
	},
	{
		id: 'AE2',
		domain: 'aerospace',
		query: 'which factories are affected by the Thailand flood',
		category: 'multi_hop',
		required: async (graph) => (await blastRadius(graph, { from: 'risk:EVT-001', targetType: 'Factory', maxHops: 4, asOf: AEROSPACE_AS_OF })),
		holdOut: true,
		note: 'Three hops from event to factory. The paper\'s Q1, and no chunk contains the chain.'
	},
	{
		id: 'AE3',
		domain: 'aerospace',
		query: 'which components have only one active supplier',
		category: 'degree',
		required: async (graph) =>
			(await withDegree(graph, { type: 'Component', edgeTypes: ['SUPPLIES'], degree: 1, direction: 'in', asOf: AEROSPACE_AS_OF })),
		holdOut: true,
		note: 'In-degree over every component. The paper\'s Q8 — its agentic baseline found 1 of 15.'
	},
	{
		id: 'AE4',
		domain: 'aerospace',
		query: 'which customers are not affected by the Thailand flood',
		category: 'inverse',
		required: async (graph) =>
			(await complementOf(graph, 'Customer', (await blastRadius(graph, { from: 'risk:EVT-001', targetType: 'Customer', maxHops: 5, asOf: AEROSPACE_AS_OF })))),
		holdOut: true,
		note: 'Blast radius then complement. The paper\'s Q9, where every text architecture scored zero.'
	},
	{
		id: 'AE5',
		domain: 'aerospace',
		query: 'which product is built at the most factories',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await rankByReach(graph, { rootType: 'Product', targetType: 'Factory', edgeTypes: ['PRODUCES'], asOf: AEROSPACE_AS_OF }))[0];
			return top ? [top.id, ...(await reachedOfType(graph, top.id, { targetType: 'Factory', edgeTypes: ['PRODUCES'], asOf: AEROSPACE_AS_OF }))] : [];
		},
		topAnswer: async (graph) =>
			(await rankByReach(graph, { rootType: 'Product', targetType: 'Factory', edgeTypes: ['PRODUCES'], asOf: AEROSPACE_AS_OF }))[0]?.id ?? null,
		holdOut: true,
		note: 'A count over the whole assembly map, ranked.'
	},
	{
		id: 'AE6',
		domain: 'aerospace',
		query: 'if TechChip is dropped which components lose their only supplier',
		category: 'what_if',
		required: async (graph) =>
			(await strandedBy(graph, { remove: 'supplier:SUP-001', observeType: 'Component', edgeTypes: ['SUPPLIES'], asOf: AEROSPACE_AS_OF })),
		holdOut: true,
		note: 'Counterfactual removal. The paper\'s Q7, where its ReAct agent hallucinated alternative suppliers.'
	},
	{
		id: 'AE7',
		domain: 'aerospace',
		query: 'compare WideBird-X50 and RegionalJet-150',
		category: 'comparison',
		required: async () => ['product:PRD-001', 'product:PRD-002', 'factory:FAC-001', 'factory:FAC-003'],
		holdOut: true,
		note: 'Dual upstream traversal with parallel metrics. The paper\'s Q10.'
	},
	{
		id: 'AE8',
		domain: 'aerospace',
		query: 'who supplies the Flight Control Unit now',
		category: 'temporal',
		required: async (graph) =>
			(await graph.neighbors('component:CMP-001', { direction: 'in', edgeTypes: ['SUPPLIES'], asOf: AEROSPACE_AS_OF })).map((node) => node.id),
		holdOut: true,
		note: 'The expired ShenzhenChip contract is still in the prose. The paper\'s Q6.'
	},
	{
		id: 'AE9',
		domain: 'aerospace',
		query: 'rank products by exposure to open risk events',
		category: 'propagation',
		required: async (graph) => (await exposureRanking(graph, { sourceType: 'RiskEvent', targetType: 'Product', asOf: AEROSPACE_AS_OF })).map((entry) => entry.id),
		topAnswer: async (graph) => (await exposureRanking(graph, { sourceType: 'RiskEvent', targetType: 'Product', asOf: AEROSPACE_AS_OF }))[0]?.id ?? null,
		holdOut: true,
		note: 'Severity-weighted multi-hop scoring. The paper\'s Q11, where standard RAG returned zero matches.'
	},
	{
		id: 'AE10',
		domain: 'aerospace',
		query: 'when is a part registered as a single-source exception',
		category: 'prose',
		required: async (graph) => (await sectionsMatching(graph, /single-source exception/i)),
		holdOut: true,
		note: 'Genuinely a prose question — the control in the other direction.'
	},
	{
		id: 'AE11',
		domain: 'aerospace',
		query: 'which suppliers have no open risk event',
		category: 'absence',
		required: async (graph) => (await withoutRelation(graph, { type: 'Supplier', edgeTypes: ['AFFECTS'], direction: 'in' })),
		holdOut: true,
		note: 'Absence over the risk register. Every supplier appears in the corpus; only the graph knows which one is unencumbered.'
	},
	{
		id: 'AE12',
		domain: 'aerospace',
		query: 'what is the melting point of tungsten',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: true,
		note: 'Materials-adjacent vocabulary, no answer in the graph.'
	}
];


const RETAIL: BenchQuery[] = [
	{
		id: 'RE1',
		domain: 'retail',
		query: 'what does seller SEL-02 list',
		category: 'lookup',
		required: async (graph) => ['seller:SEL-02', ...(await reachedOfType(graph, 'seller:SEL-02', { targetType: 'Product', edgeTypes: ['LISTED_BY'] }))],
		holdOut: true,
		note: 'Entity and direct relations.'
	},
	{
		id: 'RE2',
		domain: 'retail',
		query: 'which seller has the most returned or refunded orders',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await rankByReach(graph, {
				rootType: 'Seller',
				targetType: 'Order',
				edgeTypes: ['FROM_SELLER'],
				where: (attrs) => attrs.returnedOrRefunded === true
			}))[0];
			return top
				? [top.id, ...(await reachedOfType(graph, top.id, { targetType: 'Order', edgeTypes: ['FROM_SELLER'], where: (attrs) => attrs.returnedOrRefunded === true }))]
				: [];
		},
		topAnswer: async (graph) =>
			(await rankByReach(graph, {
				rootType: 'Seller',
				targetType: 'Order',
				edgeTypes: ['FROM_SELLER'],
				where: (attrs) => attrs.returnedOrRefunded === true
			}))[0]?.id ?? null,
		holdOut: true,
		note: 'The aggregation failure mode in its most dangerous form: every chunk is a real order, so a confabulated total is fully cited.'
	},
	{
		id: 'RE3',
		domain: 'retail',
		query: 'which products have no orders',
		category: 'absence',
		required: async (graph) => (await withoutRelation(graph, { type: 'Product', edgeTypes: ['OF_PRODUCT'] })),
		holdOut: true,
		note: 'Absence. Similarity search can only return products that DO appear in an order.'
	},
	{
		id: 'RE4',
		domain: 'retail',
		query: 'which products are listed by only one seller',
		category: 'degree',
		required: async (graph) => (await withDegree(graph, { type: 'Product', edgeTypes: ['LISTED_BY'], degree: 1 })),
		holdOut: true,
		note: 'Degree counting across the catalogue.'
	},
	{
		id: 'RE5',
		domain: 'retail',
		query: 'which campaign is discounting EchoBud Pro now',
		category: 'temporal',
		required: async (graph) =>
			(await graph.neighbors('product:PRD-01', { direction: 'in', edgeTypes: ['PROMOTES'], asOf: RETAIL_AS_OF })).map((node) => node.id),
		holdOut: true,
		note: 'Two campaigns name the product in prose; one of them ended in July.'
	},
	{
		id: 'RE6',
		domain: 'retail',
		query: 'if CraftHouse is dropped which products lose their only seller',
		category: 'what_if',
		required: async (graph) => (await strandedBy(graph, { remove: 'seller:SEL-06', observeType: 'Product', edgeTypes: ['LISTED_BY'] })),
		holdOut: true,
		note: 'Counterfactual over listings.'
	},
	{
		id: 'RE7',
		domain: 'retail',
		query: 'which customers ordered a product with an open complaint',
		category: 'multi_hop',
		required: async (graph) => {
			const complaints = await graph.nodes('Complaint');
			const complainedProducts = (
				await Promise.all(
					complaints.map(async (complaint) =>
						(await graph.neighbors(complaint.id, { direction: 'out', edgeTypes: ['ABOUT'] })).map((node) => node.id)
					)
				)
			).flat();
			const customers = new Set<string>();
			for (const productId of complainedProducts) {
				for (const order of (await graph.neighbors(productId, { direction: 'in', edgeTypes: ['OF_PRODUCT'] }))) {
					for (const customer of (await graph.neighbors(order.id, { direction: 'out', edgeTypes: ['BY_CUSTOMER'] }))) {
						customers.add(customer.id);
					}
				}
			}
			return [...customers].sort();
		},
		holdOut: true,
		note: 'Three hops: complaint to product to order to customer.'
	},
	{
		id: 'RE8',
		domain: 'retail',
		query: 'which customers have no returned or refunded orders',
		category: 'inverse',
		required: async (graph) => {
			const returnedOrders = (await graph.nodes('Order')).filter((order) => order.attrs.returnedOrRefunded === true);
			const withReturns = new Set(
				(
					await Promise.all(
						returnedOrders.map(async (order) =>
							(await graph.neighbors(order.id, { direction: 'out', edgeTypes: ['BY_CUSTOMER'] })).map((node) => node.id)
						)
					)
				).flat()
			);
			return (await complementOf(graph, 'Customer', [...withReturns]));
		},
		holdOut: true,
		note: 'A filtered complement over the order ledger.'
	},
	{
		id: 'RE9',
		domain: 'retail',
		query: 'compare seller NorthMart and seller UrbanKart',
		category: 'comparison',
		required: async () => ['seller:SEL-01', 'seller:SEL-05', 'product:PRD-01'],
		holdOut: true,
		note: 'Two seller subgraphs enumerated and set against each other.'
	},
	{
		id: 'RE10',
		domain: 'retail',
		query: 'rank products by exposure to open complaints',
		category: 'propagation',
		required: async (graph) => (await exposureRanking(graph, { sourceType: 'Complaint', targetType: 'Product', asOf: RETAIL_AS_OF })).map((entry) => entry.id),
		topAnswer: async (graph) => (await exposureRanking(graph, { sourceType: 'Complaint', targetType: 'Product', asOf: RETAIL_AS_OF }))[0]?.id ?? null,
		holdOut: true,
		note: 'Severity-weighted scoring that spreads from complained-about products to their shelf-mates.'
	},
	{
		id: 'RE11',
		domain: 'retail',
		query: 'when does a seller enter commercial review',
		category: 'prose',
		required: async (graph) => (await sectionsMatching(graph, /commercial review/i)),
		holdOut: true,
		note: 'Prose control.'
	},
	{
		id: 'RE12',
		domain: 'retail',
		query: 'what is the tallest mountain in Africa',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: true,
		note: 'Abstention guard.'
	}
];


const MANUFACTURING: BenchQuery[] = [
	{
		id: 'MF1',
		domain: 'manufacturing',
		query: 'what does work order WO-1005 produce',
		category: 'lookup',
		required: async (graph) => ['workOrder:WO-1005', ...(await reachedOfType(graph, 'workOrder:WO-1005', { targetType: 'Batch', edgeTypes: ['PRODUCED'] }))],
		holdOut: true,
		note: 'Entity and its direct output.'
	},
	{
		id: 'MF2',
		domain: 'manufacturing',
		query: 'which line produced the most defects',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await rankByReach(graph, { rootType: 'Line', targetType: 'Defect', maxHops: 3 }))[0];
			return top ? [top.id, ...(await reachedOfType(graph, top.id, { targetType: 'Defect', maxHops: 3 }))] : [];
		},
		topAnswer: async (graph) => (await rankByReach(graph, { rootType: 'Line', targetType: 'Defect', maxHops: 3 }))[0]?.id ?? null,
		holdOut: true,
		note: 'Three hops from line to defect, counted over every line. The deepest aggregation in the set.'
	},
	{
		id: 'MF3',
		domain: 'manufacturing',
		query: 'which lines have no defects recorded',
		category: 'absence',
		required: async (graph) => {
			const defects = await graph.nodes('Defect');
			const withDefects = new Set(
				(
					await Promise.all(
						defects.map(async (defect) =>
							(await graph.expand([defect.id], { maxHops: 3, direction: 'both' }))
								.filter((entry) => entry.node.type === 'Line')
								.map((entry) => entry.node.id)
						)
					)
				).flat()
			);
			return (await complementOf(graph, 'Line', [...withDefects]));
		},
		holdOut: true,
		note: 'Absence at depth — the line has to be reached through two intermediate hops before it can be excluded.'
	},
	{
		id: 'MF4',
		domain: 'manufacturing',
		query: 'which machines are installed on only one line',
		category: 'degree',
		required: async (graph) => (await withDegree(graph, { type: 'Machine', edgeTypes: ['INSTALLED_ON'], degree: 1 })),
		holdOut: true,
		note: 'Degree over the equipment register.'
	},
	{
		id: 'MF5',
		domain: 'manufacturing',
		query: 'if the Powder Coat Booth fails which lines lose their only machine',
		category: 'what_if',
		required: async (graph) => (await strandedBy(graph, { remove: 'machine:MCH-09', observeType: 'Line', edgeTypes: ['INSTALLED_ON'] })),
		holdOut: true,
		note: 'A single-machine cell is a genuine counterfactual; every other line degrades instead of stopping.'
	},
	{
		id: 'MF6',
		domain: 'manufacturing',
		query: 'which materials feed the line that produced batch BAT-07',
		category: 'multi_hop',
		required: async (graph) => {
			const lines = (await graph.expand(['batch:BAT-07'], { maxHops: 2, direction: 'both' }))
				.filter((entry) => entry.node.type === 'Line')
				.map((entry) => entry.node.id);
			const materials = await Promise.all(
				lines.map(async (line) =>
					(await graph.neighbors(line, { direction: 'in', edgeTypes: ['CONSUMED_BY'] })).map((node) => node.id)
				)
			);
			return [...new Set(materials.flat())].sort();
		},
		holdOut: true,
		note: 'Batch to work order to line to material — three hops in two directions.'
	},
	{
		id: 'MF7',
		domain: 'manufacturing',
		query: 'compare line LN-04 and line LN-02',
		category: 'comparison',
		required: async () => ['line:LN-04', 'line:LN-02', 'plant:PLT-03', 'plant:PLT-01'],
		holdOut: true,
		note: 'Two line subgraphs compared.'
	},
	{
		id: 'MF8',
		domain: 'manufacturing',
		query: 'which work orders started on or after 2026-08-04',
		category: 'temporal',
		required: async (graph) => (await onOrAfter(graph, 'WorkOrder', 'startedAt', '2026-08-04')),
		holdOut: true,
		note: 'A date window over the schedule.'
	},
	{
		id: 'MF9',
		domain: 'manufacturing',
		query: 'rank plants by exposure to open defects',
		category: 'propagation',
		required: async (graph) => (await exposureRanking(graph, { sourceType: 'Defect', targetType: 'Plant', asOf: MANUFACTURING_AS_OF })).map((entry) => entry.id),
		topAnswer: async (graph) => (await exposureRanking(graph, { sourceType: 'Defect', targetType: 'Plant', asOf: MANUFACTURING_AS_OF }))[0]?.id ?? null,
		holdOut: true,
		note: 'Four hops of severity-weighted propagation, defect to plant.'
	},
	{
		id: 'MF10',
		domain: 'manufacturing',
		query: 'when does a line go on containment',
		category: 'prose',
		required: async (graph) => (await sectionsMatching(graph, /containment/i)),
		holdOut: true,
		note: 'Prose control.'
	},
	{
		id: 'MF11',
		domain: 'manufacturing',
		query: 'how do I tune a guitar',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: true,
		note: 'Abstention guard with a "how do I" shape.'
	}
];


const LOGISTICS: BenchQuery[] = [
	{
		id: 'LG1',
		domain: 'logistics',
		query: 'what does carrier CAR-02 handle',
		category: 'lookup',
		required: async (graph) => ['carrier:CAR-02', ...(await reachedOfType(graph, 'carrier:CAR-02', { targetType: 'Shipment', edgeTypes: ['CARRIED_BY'] }))],
		holdOut: true,
		note: 'Entity and direct relations.'
	},
	{
		id: 'LG2',
		domain: 'logistics',
		query: 'what is the lane route from Chennai to Hamburg',
		category: 'multi_hop',
		required: async (graph) => {
			const path = (await graph.shortestPath('hub:HUB-01', 'hub:HUB-05', { direction: 'both', edgeTypes: ['LANE_TO'], asOf: LOGISTICS_AS_OF }));
			return path ? path.path : [];
		},
		holdOut: true,
		note: 'A route, not a neighbourhood. The only question in the set whose answer is an ordered path.'
	},
	{
		id: 'LG3',
		domain: 'logistics',
		query: 'which hub is the biggest bottleneck in the network',
		category: 'degree',
		required: async () => ['hub:HUB-03'],
		topAnswer: async () => 'hub:HUB-03',
		holdOut: true,
		note: 'Betweenness centrality. Dubai is the sole crossing between the eastern and western halves, and nothing in any hub record says so.'
	},
	{
		id: 'LG4',
		domain: 'logistics',
		query: 'which carrier moved the most delayed shipments',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await rankByReach(graph, {
				rootType: 'Carrier',
				targetType: 'Shipment',
				edgeTypes: ['CARRIED_BY'],
				where: (attrs) => attrs.delayed === true
			}))[0];
			return top
				? [top.id, ...(await reachedOfType(graph, top.id, { targetType: 'Shipment', edgeTypes: ['CARRIED_BY'], where: (attrs) => attrs.delayed === true }))]
				: [];
		},
		topAnswer: async (graph) =>
			(await rankByReach(graph, {
				rootType: 'Carrier',
				targetType: 'Shipment',
				edgeTypes: ['CARRIED_BY'],
				where: (attrs) => attrs.delayed === true
			}))[0]?.id ?? null,
		holdOut: true,
		note: 'A filtered count across the shipment ledger.'
	},
	{
		id: 'LG5',
		domain: 'logistics',
		query: 'which consignees have no delayed shipments',
		category: 'absence',
		required: async (graph) => {
			const delayed = (await graph.nodes('Shipment')).filter((shipment) => shipment.attrs.delayed === true);
			const affected = new Set(
				(
					await Promise.all(
						delayed.map(async (shipment) =>
							(await graph.neighbors(shipment.id, { direction: 'out', edgeTypes: ['CONSIGNED_TO'] })).map((node) => node.id)
						)
					)
				).flat()
			);
			return (await complementOf(graph, 'Consignee', [...affected]));
		},
		holdOut: true,
		note: 'A filtered complement.'
	},
	{
		id: 'LG6',
		domain: 'logistics',
		query: 'if RailBridge Logistics is dropped which shipments lose their only carrier',
		category: 'what_if',
		required: async (graph) => (await strandedBy(graph, { remove: 'carrier:CAR-03', observeType: 'Shipment', edgeTypes: ['CARRIED_BY'] })),
		holdOut: true,
		note: 'Counterfactual over carriage.'
	},
	{
		id: 'LG7',
		domain: 'logistics',
		query: 'which hubs are isolated from the main freight network',
		category: 'inverse',
		required: async (graph) => {
			const trunk = new Set(
				(await graph.expand(['hub:HUB-01'], { maxHops: graph.nodeCount, direction: 'both', edgeTypes: ['LANE_TO'] })).map(
					(entry) => entry.node.id
				)
			);
			return (await graph.nodes('Hub')).filter((hub) => !trunk.has(hub.id)).map((hub) => hub.id);
		},
		holdOut: true,
		note: 'Connected components. Isolation is invisible to similarity search by construction — an isolated hub matches the query no worse than a connected one.'
	},
	{
		id: 'LG8',
		domain: 'logistics',
		query: 'compare the Rotterdam and Chennai hubs',
		category: 'comparison',
		required: async () => ['hub:HUB-04', 'hub:HUB-01'],
		holdOut: true,
		note: 'Two hub neighbourhoods compared.'
	},
	{
		id: 'LG9',
		domain: 'logistics',
		query: 'which lanes opened on or after 2026-06-01',
		category: 'temporal',
		required: async (graph) => {
			const touched = new Set<string>();
			for (const edge of (await graph.edges())) {
				if (edge.type !== 'LANE_TO') continue;
				if ((edge.validFrom ?? '') < '2026-06-01') continue;
				touched.add(edge.from);
				touched.add(edge.to);
			}
			return [...touched].sort();
		},
		holdOut: true,
		note: 'A window over edge validity, not over node attributes — the case a record-oriented retriever has no handle on at all.'
	},
	{
		id: 'LG10',
		domain: 'logistics',
		query: 'rank shipments by exposure to open disruptions',
		category: 'propagation',
		required: async (graph) => (await exposureRanking(graph, { sourceType: 'Disruption', targetType: 'Shipment', asOf: LOGISTICS_AS_OF })).map((entry) => entry.id),
		topAnswer: async (graph) => (await exposureRanking(graph, { sourceType: 'Disruption', targetType: 'Shipment', asOf: LOGISTICS_AS_OF }))[0]?.id ?? null,
		holdOut: true,
		note: 'Severity-weighted exposure across the network.'
	},
	{
		id: 'LG11',
		domain: 'logistics',
		query: 'when is a shipment re-routed rather than held',
		category: 'prose',
		required: async (graph) => (await sectionsMatching(graph, /re-?rout/i)),
		holdOut: true,
		note: 'Prose control.'
	},
	{
		id: 'LG12',
		domain: 'logistics',
		query: 'what is the population of Iceland',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: true,
		note: 'Geography-adjacent vocabulary, no answer in the graph.'
	}
];


const FINANCE: BenchQuery[] = [
	{
		id: 'FN1',
		domain: 'finance',
		query: 'what is account ACC-05',
		category: 'lookup',
		required: async () => ['account:ACC-05'],
		holdOut: true,
		note: 'Entity lookup.'
	},
	{
		id: 'FN2',
		domain: 'finance',
		query: 'which account is flagged by the most alerts',
		category: 'aggregation',
		required: async (graph) => {
			const top = (await rankByReach(graph, { rootType: 'Account', targetType: 'Alert', edgeTypes: ['FLAGS'] }))[0];
			return top ? [top.id, ...(await reachedOfType(graph, top.id, { targetType: 'Alert', edgeTypes: ['FLAGS'] }))] : [];
		},
		topAnswer: async (graph) => (await rankByReach(graph, { rootType: 'Account', targetType: 'Alert', edgeTypes: ['FLAGS'] }))[0]?.id ?? null,
		holdOut: true,
		note: 'A count that decides whether an account goes under enhanced monitoring.'
	},
	{
		id: 'FN3',
		domain: 'finance',
		query: 'which account is the most central in the payment network',
		category: 'degree',
		required: async () => ['account:ACC-05'],
		topAnswer: async () => 'account:ACC-05',
		holdOut: true,
		note: 'PageRank over the counterparty graph. The policy document says outright that counting one account\'s incoming payments is not the same question.'
	},
	{
		id: 'FN4',
		domain: 'finance',
		query: 'which accounts have no alerts raised against them',
		category: 'absence',
		required: async (graph) => (await withoutRelation(graph, { type: 'Account', edgeTypes: ['FLAGS'], direction: 'in' })),
		holdOut: true,
		note: 'Absence over the alert register.'
	},
	{
		id: 'FN5',
		domain: 'finance',
		query: 'which accounts form a closed group with no link to the rest of the network',
		category: 'inverse',
		required: async (graph) => {
			const main = new Set(
				(
					await graph.expand(['account:ACC-05'], {
						maxHops: graph.nodeCount,
						direction: 'both',
						edgeTypes: ['COUNTERPARTY_OF']
					})
				).map((entry) => entry.node.id)
			);
			const accounts = (await graph.nodes('Account')).filter((account) => !main.has(account.id));
			const linked = await Promise.all(
				accounts.map(async (account) => ({
					id: account.id,
					degree: await graph.degree(account.id, { direction: 'both', edgeTypes: ['COUNTERPARTY_OF'] })
				}))
			);
			return linked.filter((entry) => entry.degree > 0).map((entry) => entry.id);
		},
		holdOut: true,
		note: 'Connected components. The nominee ring transacts only with itself, and no amount of similarity search can notice an absence of links.'
	},
	{
		id: 'FN6',
		domain: 'finance',
		query: 'if account ACC-08 is frozen which accounts lose their only counterparty',
		category: 'what_if',
		required: async (graph) =>
			(await strandedBy(graph, { remove: 'account:ACC-08', observeType: 'Account', edgeTypes: ['COUNTERPARTY_OF'] })),
		holdOut: true,
		note: 'The freezing procedure asks for exactly this before acting, and no single record answers it.'
	},
	{
		id: 'FN7',
		domain: 'finance',
		query: 'which institutions are exposed to the alert on ACC-05',
		category: 'multi_hop',
		required: async (graph) => (await blastRadius(graph, { from: 'alert:ALR-01', targetType: 'Institution', maxHops: 3, direction: 'both', asOf: FINANCE_AS_OF })),
		holdOut: true,
		note: 'Alert to account to counterparties to institutions.'
	},
	{
		id: 'FN8',
		domain: 'finance',
		query: 'compare account ACC-05 and account ACC-09',
		category: 'comparison',
		required: async () => ['account:ACC-05', 'account:ACC-09'],
		holdOut: true,
		note: 'Two account neighbourhoods compared.'
	},
	{
		id: 'FN9',
		domain: 'finance',
		query: 'which transfers settled on or after 2026-08-05',
		category: 'temporal',
		required: async (graph) => (await onOrAfter(graph, 'Transfer', 'settledAt', '2026-08-05')),
		holdOut: true,
		note: 'A date window over the ledger.'
	},
	{
		id: 'FN10',
		domain: 'finance',
		query: 'rank accounts by exposure to open alerts',
		category: 'propagation',
		required: async (graph) => (await exposureRanking(graph, { sourceType: 'Alert', targetType: 'Account', asOf: FINANCE_AS_OF })).map((entry) => entry.id),
		topAnswer: async (graph) => (await exposureRanking(graph, { sourceType: 'Alert', targetType: 'Account', asOf: FINANCE_AS_OF }))[0]?.id ?? null,
		holdOut: true,
		note: 'Severity-weighted exposure that spreads to counterparties.'
	},
	{
		id: 'FN11',
		domain: 'finance',
		query: 'when is an account placed under enhanced monitoring',
		category: 'prose',
		required: async (graph) => (await sectionsMatching(graph, /enhanced monitoring/i)),
		holdOut: true,
		note: 'Prose control.'
	},
	{
		id: 'FN12',
		domain: 'finance',
		query: 'who painted the Mona Lisa',
		category: 'out_of_domain',
		required: async () => [],
		expectAbstain: true,
		holdOut: true,
		note: 'Abstention guard.'
	}
];

export const EXTRA_DOMAIN_QUERIES: BenchQuery[] = [...AEROSPACE, ...RETAIL, ...MANUFACTURING, ...LOGISTICS, ...FINANCE];
