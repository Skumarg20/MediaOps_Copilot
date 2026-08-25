import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';
import { DOC_ADJACENCY_EDGE, DOC_SECTION_TYPE, documentNodes, entities, nid, relations } from './builder.js';


const HUBS = [
	{ id: 'HUB-01', name: 'Chennai', country: 'IN', capacityTeu: 1800 },
	{ id: 'HUB-02', name: 'Mumbai', country: 'IN', capacityTeu: 2400 },
	{ id: 'HUB-03', name: 'Dubai', country: 'AE', capacityTeu: 5200 },
	{ id: 'HUB-04', name: 'Rotterdam', country: 'NL', capacityTeu: 6100 },
	{ id: 'HUB-05', name: 'Hamburg', country: 'DE', capacityTeu: 3900 },
	{ id: 'HUB-06', name: 'Singapore', country: 'SG', capacityTeu: 7000 },
	{ id: 'HUB-07', name: 'Shanghai', country: 'CN', capacityTeu: 8300 },
	{ id: 'HUB-08', name: 'Chicago', country: 'US', capacityTeu: 2100 },
	{ id: 'HUB-09', name: 'Perth', country: 'AU', capacityTeu: 700 },
	{ id: 'HUB-10', name: 'Auckland', country: 'NZ', capacityTeu: 520 }
];

const LANES = [
	{ a: 'HUB-07', b: 'HUB-06', transitDays: 4, openedAt: '2024-01-01' },
	{ a: 'HUB-06', b: 'HUB-01', transitDays: 6, openedAt: '2024-01-01' },
	{ a: 'HUB-01', b: 'HUB-02', transitDays: 3, openedAt: '2024-01-01' },
	{ a: 'HUB-01', b: 'HUB-03', transitDays: 7, openedAt: '2026-06-15' },
	{ a: 'HUB-02', b: 'HUB-03', transitDays: 5, openedAt: '2024-01-01' },
	{ a: 'HUB-03', b: 'HUB-04', transitDays: 11, openedAt: '2024-01-01' },
	{ a: 'HUB-04', b: 'HUB-05', transitDays: 2, openedAt: '2024-01-01' },
	{ a: 'HUB-04', b: 'HUB-08', transitDays: 9, openedAt: '2026-07-20' },
	{ a: 'HUB-09', b: 'HUB-10', transitDays: 5, openedAt: '2025-03-01' }
];

const CARRIERS = [
	{ id: 'CAR-01', name: 'BlueAnchor Line', mode: 'ocean', fleet: 41 },
	{ id: 'CAR-02', name: 'SkyFreight Cargo', mode: 'air', fleet: 12 },
	{ id: 'CAR-03', name: 'RailBridge Logistics', mode: 'rail', fleet: 27 },
	{ id: 'CAR-04', name: 'CoastalHaul', mode: 'ocean', fleet: 8 }
];

const CONSIGNEES = [
	{ id: 'CNE-01', name: 'Meridian Retail', industry: 'retail', country: 'DE' },
	{ id: 'CNE-02', name: 'Halcyon Foods', industry: 'food', country: 'NL' },
	{ id: 'CNE-03', name: 'Vertex Industrial', industry: 'industrial', country: 'US' },
	{ id: 'CNE-04', name: 'Southern Cross Supply', industry: 'retail', country: 'AU' }
];

const SHIPMENTS = [
	{ id: 'SHP-2001', carrier: 'CAR-01', origin: 'HUB-07', destination: 'HUB-05', consignee: 'CNE-01', teu: 120, status: 'delivered', departedAt: '2026-06-04' },
	{ id: 'SHP-2002', carrier: 'CAR-01', origin: 'HUB-06', destination: 'HUB-04', consignee: 'CNE-02', teu: 96, status: 'delivered', departedAt: '2026-06-11' },
	{ id: 'SHP-2003', carrier: 'CAR-02', origin: 'HUB-01', destination: 'HUB-05', consignee: 'CNE-01', teu: 14, status: 'delayed', departedAt: '2026-06-19' },
	{ id: 'SHP-2004', carrier: 'CAR-02', origin: 'HUB-02', destination: 'HUB-08', consignee: 'CNE-03', teu: 11, status: 'delayed', departedAt: '2026-07-02' },
	{ id: 'SHP-2005', carrier: 'CAR-03', origin: 'HUB-04', destination: 'HUB-05', consignee: 'CNE-02', teu: 60, status: 'delivered', departedAt: '2026-07-08' },
	{ id: 'SHP-2006', carrier: 'CAR-02', origin: 'HUB-06', destination: 'HUB-08', consignee: 'CNE-03', teu: 9, status: 'delayed', departedAt: '2026-07-15' },
	{ id: 'SHP-2007', carrier: 'CAR-01', origin: 'HUB-07', destination: 'HUB-04', consignee: 'CNE-02', teu: 140, status: 'delayed', departedAt: '2026-07-22' },
	{ id: 'SHP-2008', carrier: 'CAR-03', origin: 'HUB-03', destination: 'HUB-04', consignee: 'CNE-01', teu: 74, status: 'delivered', departedAt: '2026-07-30' },
	{ id: 'SHP-2009', carrier: 'CAR-04', origin: 'HUB-09', destination: 'HUB-10', consignee: 'CNE-04', teu: 22, status: 'delivered', departedAt: '2026-08-03' },
	{ id: 'SHP-2010', carrier: 'CAR-01', origin: 'HUB-01', destination: 'HUB-08', consignee: 'CNE-03', teu: 88, status: 'delayed', departedAt: '2026-08-09' },
	{ id: 'SHP-2011', carrier: 'CAR-04', origin: 'HUB-09', destination: 'HUB-10', consignee: 'CNE-04', teu: 18, status: 'delivered', departedAt: '2026-08-14' }
];

const DISRUPTIONS = [
	{ id: 'DSR-01', title: 'Rotterdam dock strike', severity: 'critical', startedAt: '2026-08-05', affects: 'HUB-04' },
	{ id: 'DSR-02', title: 'Dubai customs backlog', severity: 'high', startedAt: '2026-08-08', affects: 'HUB-03' },
	{ id: 'DSR-03', title: 'Shanghai typhoon closure', severity: 'medium', startedAt: '2026-08-11', affects: 'HUB-07' },
	{ id: 'DSR-04', title: 'Chicago rail congestion', severity: 'low', startedAt: '2026-08-15', affects: 'HUB-08' }
];

const DOCUMENTS: CorpusDocument[] = [
	{
		id: 'log-routing-policy',
		title: 'Routing and re-route policy',
		text: `# Routing and re-route policy

A shipment is routed on the lowest total transit time that satisfies its service level, not
on the shortest physical distance. Transit time already includes expected dwell at each
hub.

## Re-route versus hold

A shipment is re-routed when an alternative path exists that still meets the service level,
and held when it does not. Holding is the correct outcome for a corridor with a single
crossing: re-routing onto a path that does not exist wastes a day discovering that.

## Single-crossing corridors

Where a corridor has exactly one crossing hub, every shipment across it shares that hub's
risk. Those corridors are listed in the network register and reviewed whenever a
disruption opens at the crossing.`
	},
	{
		id: 'log-disruption-handling',
		title: 'Disruption handling',
		text: `# Disruption handling

A disruption is raised against a hub. Exposure spreads to the lanes touching that hub, the
shipments moving over them, and the consignees waiting on those shipments.

## Severity

A critical disruption stops acceptance into the hub. High and medium disruptions throttle
it. A low disruption is advisory and is not by itself a reason to re-route.

## Feeder networks

A feeder pair with no link to the trunk network is unaffected by trunk disruptions and
must not be swept into a blanket re-route instruction.`
	},
	{
		id: 'log-carrier-management',
		title: 'Carrier performance management',
		text: `# Carrier performance management

Carrier performance is measured on delivered-on-time share, weighted by TEU rather than by
shipment count, so a single large late move is not hidden by many small punctual ones.

## Review triggers

A carrier enters review when delayed shipments exceed a third of its moves in a rolling
quarter. Review considers mode: an air carrier and an ocean carrier are never compared
directly.`
	}
];

export const LOGISTICS_SCHEMA: GraphSchema = {
	domain: 'logistics',
	description:
		'Freight logistics: hubs are connected by lanes, carriers move shipments between hubs to consignees, and disruptions are raised against hubs.',
	nodeTypes: [
		{ name: 'Hub', description: 'A port or terminal with a handling capacity.' },
		{ name: 'Carrier', description: 'A transport provider with a mode and a fleet.' },
		{ name: 'Shipment', description: 'One consignment with an origin, destination and status.' },
		{ name: 'Consignee', description: 'The party receiving a shipment.' },
		{ name: 'Disruption', description: 'An event affecting a hub, with a severity.' },
		DOC_SECTION_TYPE
	],
	edgeTypes: [
		{ name: 'LANE_TO', from: 'Hub', to: 'Hub', description: 'A scheduled lane between two hubs.' },
		{ name: 'DEPARTS_FROM', from: 'Shipment', to: 'Hub', description: 'Shipment originates at this hub.' },
		{ name: 'ARRIVES_AT', from: 'Shipment', to: 'Hub', description: 'Shipment terminates at this hub.' },
		{ name: 'CARRIED_BY', from: 'Shipment', to: 'Carrier', description: 'Shipment is moved by this carrier.' },
		{ name: 'CONSIGNED_TO', from: 'Shipment', to: 'Consignee', description: 'Shipment is destined for this consignee.' },
		{ name: 'AFFECTS', from: 'Disruption', to: 'Hub', description: 'Disruption is raised against this hub.' },
		DOC_ADJACENCY_EDGE
	]
};

export function buildLogisticsDataset(): DomainDataset {
	const nodes: GraphNode[] = [
		...entities('Hub', 'hub', HUBS, (row) => ({
			label: row.name,
			attrs: { name: row.name, country: row.country, capacityTeu: row.capacityTeu },
			text: `Hub ${row.id} ${row.name} in ${row.country}, handling capacity ${row.capacityTeu} TEU.`
		})),
		...entities('Carrier', 'carrier', CARRIERS, (row) => ({
			label: row.name,
			attrs: { name: row.name, mode: row.mode, fleet: row.fleet },
			text: `Carrier ${row.id} ${row.name}, ${row.mode} mode, fleet of ${row.fleet}.`
		})),
		...entities('Shipment', 'shipment', SHIPMENTS, (row) => ({
			label: row.id,
			attrs: {
				carrier: row.carrier,
				origin: row.origin,
				destination: row.destination,
				consignee: row.consignee,
				teu: row.teu,
				status: row.status,
				departedAt: row.departedAt,
				delayed: row.status === 'delayed'
			},
			text: `Shipment ${row.id}: ${row.teu} TEU from ${row.origin} to ${row.destination} for ${row.consignee}, carried by ${row.carrier}, departed ${row.departedAt}, status ${row.status}.`
		})),
		...entities('Consignee', 'consignee', CONSIGNEES, (row) => ({
			label: row.name,
			attrs: { name: row.name, industry: row.industry, country: row.country },
			text: `Consignee ${row.id} ${row.name}, ${row.industry} sector in ${row.country}.`
		})),
		...entities('Disruption', 'disruption', DISRUPTIONS, (row) => ({
			label: row.title,
			attrs: { title: row.title, severity: row.severity, startedAt: row.startedAt, affects: row.affects },
			text: `Disruption ${row.id} ${row.title}, severity ${row.severity}, opened ${row.startedAt} at hub ${row.affects}.`
		}))
	];

	const edges: GraphEdge[] = [
		...relations(
			'LANE_TO',
			LANES.flatMap((lane) => [
				{ from: nid('hub', lane.a), to: nid('hub', lane.b), validFrom: lane.openedAt, attrs: { transitDays: lane.transitDays } },
				{ from: nid('hub', lane.b), to: nid('hub', lane.a), validFrom: lane.openedAt, attrs: { transitDays: lane.transitDays } }
			])
		),
		...relations(
			'DEPARTS_FROM',
			SHIPMENTS.map((row) => ({ from: nid('shipment', row.id), to: nid('hub', row.origin), validFrom: row.departedAt }))
		),
		...relations(
			'ARRIVES_AT',
			SHIPMENTS.map((row) => ({ from: nid('shipment', row.id), to: nid('hub', row.destination), validFrom: row.departedAt }))
		),
		...relations(
			'CARRIED_BY',
			SHIPMENTS.map((row) => ({ from: nid('shipment', row.id), to: nid('carrier', row.carrier), validFrom: row.departedAt }))
		),
		...relations(
			'CONSIGNED_TO',
			SHIPMENTS.map((row) => ({ from: nid('shipment', row.id), to: nid('consignee', row.consignee), validFrom: row.departedAt }))
		),
		...relations(
			'AFFECTS',
			DISRUPTIONS.map((row) => ({ from: nid('disruption', row.id), to: nid('hub', row.affects), validFrom: row.startedAt, weight: 1 }))
		)
	];

	const docs = documentNodes(DOCUMENTS);
	nodes.push(...docs.nodes);
	edges.push(...docs.edges);

	return { schema: LOGISTICS_SCHEMA, nodes, edges, documents: DOCUMENTS };
}

export const LOGISTICS_AS_OF = '2026-08-20';
