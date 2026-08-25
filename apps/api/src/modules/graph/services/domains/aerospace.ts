import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';
import { DOC_ADJACENCY_EDGE, DOC_SECTION_TYPE, documentNodes, entities, nid, relations } from './builder.js';


const SUPPLIERS = [
	{ id: 'SUP-001', name: 'TechChip Inc', specialty: 'electronic assemblies', region: 'TW', tier: 'tier-1' },
	{ id: 'SUP-002', name: 'AeroMetal Corp', specialty: 'machined metal', region: 'US', tier: 'tier-1' },
	{ id: 'SUP-003', name: 'PrecisionCast', specialty: 'castings', region: 'DE', tier: 'tier-2' },
	{ id: 'SUP-004', name: 'ThaiRubber Co', specialty: 'elastomers', region: 'TH', tier: 'tier-2' },
	{ id: 'SUP-005', name: 'NordicComposite', specialty: 'composites', region: 'SE', tier: 'tier-1' },
	{ id: 'SUP-006', name: 'HydroFlow Systems', specialty: 'hydraulics', region: 'FR', tier: 'tier-1' },
	{ id: 'SUP-007', name: 'OptiSense Labs', specialty: 'sensors', region: 'JP', tier: 'tier-2' },
	{ id: 'SUP-008', name: 'ElectraWire', specialty: 'wiring harnesses', region: 'MX', tier: 'tier-2' },
	{ id: 'SUP-009', name: 'ShenzhenChip', specialty: 'electronic assemblies', region: 'CN', tier: 'tier-1' }
];

const COMPONENTS = [
	{ id: 'CMP-001', name: 'Flight Control Unit', componentType: 'Electronic Assembly', criticality: 'high' },
	{ id: 'CMP-002', name: 'Wing Spar Assembly', componentType: 'Machined Metal', criticality: 'high' },
	{ id: 'CMP-003', name: 'Landing Gear Strut', componentType: 'Casting', criticality: 'high' },
	{ id: 'CMP-004', name: 'Door Seal Kit', componentType: 'Elastomer', criticality: 'medium' },
	{ id: 'CMP-005', name: 'Fuselage Panel', componentType: 'Composite', criticality: 'high' },
	{ id: 'CMP-006', name: 'Avionics Bus Module', componentType: 'Electronic Assembly', criticality: 'high' },
	{ id: 'CMP-007', name: 'Hydraulic Actuator', componentType: 'Hydraulics', criticality: 'high' },
	{ id: 'CMP-008', name: 'Air Data Sensor', componentType: 'Sensor', criticality: 'high' },
	{ id: 'CMP-009', name: 'Engine Mount Bracket', componentType: 'Machined Metal', criticality: 'high' },
	{ id: 'CMP-010', name: 'Cabin Wiring Loom', componentType: 'Wiring', criticality: 'medium' },
	{ id: 'CMP-011', name: 'Window Gasket Set', componentType: 'Elastomer', criticality: 'low' },
	{ id: 'CMP-012', name: 'Nacelle Cowling', componentType: 'Composite', criticality: 'high' },
	{ id: 'CMP-013', name: 'Power Distribution Unit', componentType: 'Wiring', criticality: 'high' },
	{ id: 'CMP-014', name: 'Cockpit Display Unit', componentType: 'Electronic Assembly', criticality: 'high' },
	{ id: 'CMP-015', name: 'Tail Rotor Housing', componentType: 'Machined Metal', criticality: 'medium' }
];

const SUPPLIES = [
	{ from: 'SUP-001', to: 'CMP-001', leadTimeDays: 45, validFrom: '2024-02-17' },
	{ from: 'SUP-009', to: 'CMP-001', leadTimeDays: 52, validFrom: '2021-06-01', validTo: '2024-02-16' },
	{ from: 'SUP-001', to: 'CMP-006', leadTimeDays: 38, validFrom: '2022-01-01' },
	{ from: 'SUP-001', to: 'CMP-014', leadTimeDays: 41, validFrom: '2022-01-01' },
	{ from: 'SUP-002', to: 'CMP-002', leadTimeDays: 60, validFrom: '2021-01-01' },
	{ from: 'SUP-002', to: 'CMP-009', leadTimeDays: 34, validFrom: '2021-01-01' },
	{ from: 'SUP-002', to: 'CMP-015', leadTimeDays: 29, validFrom: '2021-01-01' },
	{ from: 'SUP-003', to: 'CMP-003', leadTimeDays: 72, validFrom: '2021-03-01' },
	{ from: 'SUP-004', to: 'CMP-004', leadTimeDays: 21, validFrom: '2021-01-01' },
	{ from: 'SUP-004', to: 'CMP-011', leadTimeDays: 18, validFrom: '2021-01-01' },
	{ from: 'SUP-005', to: 'CMP-005', leadTimeDays: 55, validFrom: '2021-01-01' },
	{ from: 'SUP-005', to: 'CMP-012', leadTimeDays: 48, validFrom: '2021-01-01' },
	{ from: 'SUP-006', to: 'CMP-007', leadTimeDays: 63, validFrom: '2021-01-01' },
	{ from: 'SUP-007', to: 'CMP-008', leadTimeDays: 40, validFrom: '2021-01-01' },
	{ from: 'SUP-008', to: 'CMP-010', leadTimeDays: 26, validFrom: '2021-01-01' },
	{ from: 'SUP-008', to: 'CMP-013', leadTimeDays: 31, validFrom: '2021-01-01' },
	{ from: 'SUP-003', to: 'CMP-015', leadTimeDays: 44, validFrom: '2020-01-01', validTo: '2020-12-31' }
];

const FACTORIES = [
	{ id: 'FAC-001', name: 'Assembly Plant Alpha', region: 'US', uses: ['CMP-001', 'CMP-002', 'CMP-005', 'CMP-006'] },
	{ id: 'FAC-002', name: 'Composite Works Beta', region: 'SE', uses: ['CMP-003', 'CMP-005', 'CMP-012'] },
	{ id: 'FAC-003', name: 'Avionics Hub Delta', region: 'US', uses: ['CMP-006', 'CMP-008', 'CMP-013', 'CMP-014'] },
	{ id: 'FAC-004', name: 'Structures Plant Gamma', region: 'DE', uses: ['CMP-002', 'CMP-003', 'CMP-009', 'CMP-014'] },
	{ id: 'FAC-005', name: 'Interiors Plant Epsilon', region: 'MX', uses: ['CMP-004', 'CMP-007', 'CMP-010', 'CMP-011'] }
];

const PRODUCTS = [
	{ id: 'PRD-001', name: 'WideBird-X50', productType: 'wide-body', builtAt: ['FAC-001', 'FAC-003', 'FAC-004', 'FAC-005'] },
	{ id: 'PRD-002', name: 'RegionalJet-150', productType: 'regional', builtAt: ['FAC-001'] },
	{ id: 'PRD-003', name: 'ExecWing-7', productType: 'business', builtAt: ['FAC-002', 'FAC-003'] },
	{ id: 'PRD-004', name: 'SkyPatrol-UAV', productType: 'unmanned', builtAt: ['FAC-003', 'FAC-004'] },
	{ id: 'PRD-005', name: 'CargoHawk-300', productType: 'freighter', builtAt: ['FAC-004', 'FAC-005'] },
	{ id: 'PRD-006', name: 'NarrowBody-900', productType: 'narrow-body', builtAt: ['FAC-002'] }
];

const CUSTOMERS = [
	{ id: 'CUS-001', name: 'AirGlobal Airlines', region: 'US', contract: 'framework' },
	{ id: 'CUS-002', name: 'PacificWings', region: 'SG', contract: 'framework' },
	{ id: 'CUS-003', name: 'EuroConnect', region: 'EU', contract: 'spot' },
	{ id: 'CUS-004', name: 'DefenseTech Corp', region: 'US', contract: 'defence' }
];

const DELIVERS_TO = [
	{ from: 'PRD-001', to: 'CUS-001', orderQty: 24 },
	{ from: 'PRD-001', to: 'CUS-002', orderQty: 12 },
	{ from: 'PRD-002', to: 'CUS-001', orderQty: 40 },
	{ from: 'PRD-002', to: 'CUS-003', orderQty: 18 },
	{ from: 'PRD-003', to: 'CUS-002', orderQty: 6 },
	{ from: 'PRD-004', to: 'CUS-004', orderQty: 30 },
	{ from: 'PRD-005', to: 'CUS-003', orderQty: 9 },
	{ from: 'PRD-006', to: 'CUS-001', orderQty: 22 }
];

const RISK_EVENTS = [
	{ id: 'EVT-001', title: 'Thailand flood', severity: 'critical', startedAt: '2024-07-14', affects: 'SUP-004' },
	{ id: 'EVT-002', title: 'Semiconductor allocation shortage', severity: 'high', startedAt: '2024-05-02', affects: 'SUP-001' },
	{ id: 'EVT-003', title: 'Steel import tariff', severity: 'medium', startedAt: '2024-03-19', affects: 'SUP-002' },
	{ id: 'EVT-004', title: 'Foundry fire', severity: 'high', startedAt: '2024-06-08', affects: 'SUP-003' },
	{ id: 'EVT-005', title: 'Resin supply squeeze', severity: 'medium', startedAt: '2024-04-25', affects: 'SUP-005' },
	{ id: 'EVT-006', title: 'Hydraulic actuator recall', severity: 'high', startedAt: '2024-07-01', affects: 'SUP-006' },
	{ id: 'EVT-007', title: 'Sensor calibration defect', severity: 'low', startedAt: '2024-02-11', affects: 'SUP-007' },
	{ id: 'EVT-008', title: 'Copper price spike', severity: 'low', startedAt: '2024-06-30', affects: 'SUP-008' }
];

const DOCUMENTS: CorpusDocument[] = [
	{
		id: 'aero-sourcing-standard',
		title: 'Aerospace sourcing standard',
		text: `# Aerospace sourcing standard

Every flight-critical component is expected to carry a qualified alternate source. Where
no alternate exists, the part is registered as a single-source exception and reviewed by
the supply board each quarter.

## Qualification

Qualification is per part number, not per supplier. A supplier approved for machined metal
is not thereby approved for electronic assemblies, and an approval does not survive a
change of manufacturing site.

## Contract transition

When a supply agreement ends the outgoing supplier stays in the procurement record for
airworthiness traceability, but ceases to be a valid source the day after the agreement
end date. Purchase orders raised against an ended agreement are rejected at intake.`
	},
	{
		id: 'aero-disruption-playbook',
		title: 'Supply disruption playbook',
		text: `# Supply disruption playbook

When a disruption is raised against a supplier, the continuity desk works outward: the
components that supplier sources, the factories consuming those components, the aircraft
those factories build, and finally the customers holding delivery positions.

## Severity and distance

Exposure is scored by event severity weighted against distance from the event. A directly
affected supplier carries the full weight; each further step contributes progressively
less, because inventory buffers and alternate routing absorb part of the shock.

## First actions

Establish whether the affected supplier is the sole active source for anything it
supplies. A disruption at a dual-sourced part is a scheduling problem. A disruption at a
single-sourced part is a line stop, and the escalation path is different.`
	},
	{
		id: 'aero-criticality-guide',
		title: 'Component criticality guide',
		text: `# Component criticality guide

Criticality is assigned from the consequence of loss, not from unit cost. A low-cost
gasket on a pressurised door is high criticality; an expensive interior trim panel is not.

## Review cadence

High-criticality parts are reviewed monthly against supplier financial health and
geographic concentration. Medium and low criticality parts are reviewed annually unless a
disruption is open against their supplier.`
	}
];

export const AEROSPACE_SCHEMA: GraphSchema = {
	domain: 'aerospace',
	description:
		'Aerospace supply chain: risk events hit suppliers, suppliers source components, factories consume components and build aircraft, aircraft are delivered to customers.',
	nodeTypes: [
		{ name: 'Supplier', description: 'A component supplier with a specialty, region and tier.' },
		{ name: 'Component', description: 'A part with a type and a criticality rating.' },
		{ name: 'Factory', description: 'A production site consuming components.' },
		{ name: 'Product', description: 'A finished aircraft.' },
		{ name: 'Customer', description: 'An airline or operator holding delivery positions.' },
		{ name: 'RiskEvent', description: 'A disruption event with a severity, affecting a supplier.' },
		DOC_SECTION_TYPE
	],
	edgeTypes: [
		{ name: 'AFFECTS', from: 'RiskEvent', to: 'Supplier', description: 'Risk event hits this supplier.' },
		{ name: 'SUPPLIES', from: 'Supplier', to: 'Component', description: 'Supplier sources this component under contract.' },
		{ name: 'USED_BY', from: 'Component', to: 'Factory', description: 'Component is consumed by this factory.' },
		{ name: 'PRODUCES', from: 'Factory', to: 'Product', description: 'Factory builds this aircraft.' },
		{ name: 'DELIVERS_TO', from: 'Product', to: 'Customer', description: 'Aircraft is delivered to this customer.' },
		DOC_ADJACENCY_EDGE
	]
};

export function buildAerospaceDataset(): DomainDataset {
	const nodes: GraphNode[] = [
		...entities('Supplier', 'supplier', SUPPLIERS, (row) => ({
			label: row.name,
			attrs: { name: row.name, specialty: row.specialty, region: row.region, tier: row.tier },
			text: `Supplier ${row.id} ${row.name}, ${row.tier}, based in ${row.region}, specialising in ${row.specialty}.`
		})),
		...entities('Component', 'component', COMPONENTS, (row) => ({
			label: row.name,
			attrs: { name: row.name, componentType: row.componentType, criticality: row.criticality },
			text: `Component ${row.id} ${row.name}, type ${row.componentType}, criticality ${row.criticality}.`
		})),
		...entities('Factory', 'factory', FACTORIES, (row) => ({
			label: row.name,
			attrs: { name: row.name, region: row.region, componentCount: row.uses.length },
			text: `Factory ${row.id} ${row.name} in ${row.region}, consuming ${row.uses.join(', ')}.`
		})),
		...entities('Product', 'product', PRODUCTS, (row) => ({
			label: row.name,
			attrs: { name: row.name, productType: row.productType, factoryCount: row.builtAt.length },
			text: `Aircraft ${row.id} ${row.name}, ${row.productType}, assembled at ${row.builtAt.join(', ')}.`
		})),
		...entities('Customer', 'customer', CUSTOMERS, (row) => ({
			label: row.name,
			attrs: { name: row.name, region: row.region, contract: row.contract },
			text: `Customer ${row.id} ${row.name} in ${row.region}, ${row.contract} contract.`
		})),
		...entities('RiskEvent', 'risk', RISK_EVENTS, (row) => ({
			label: row.title,
			attrs: { title: row.title, severity: row.severity, startedAt: row.startedAt, affects: row.affects },
			text: `Risk event ${row.id} ${row.title}, severity ${row.severity}, opened ${row.startedAt}, affecting supplier ${row.affects}.`
		}))
	];

	const edges: GraphEdge[] = [
		...relations(
			'SUPPLIES',
			SUPPLIES.map((row) => ({
				from: nid('supplier', row.from),
				to: nid('component', row.to),
				validFrom: row.validFrom,
				...(row.validTo ? { validTo: row.validTo } : {}),
				attrs: { leadTimeDays: row.leadTimeDays }
			}))
		),
		...relations(
			'USED_BY',
			FACTORIES.flatMap((factory) =>
				factory.uses.map((component) => ({
					from: nid('component', component),
					to: nid('factory', factory.id),
					validFrom: '2021-01-01'
				}))
			)
		),
		...relations(
			'PRODUCES',
			PRODUCTS.flatMap((product) =>
				product.builtAt.map((factory) => ({
					from: nid('factory', factory),
					to: nid('product', product.id),
					validFrom: '2021-01-01'
				}))
			)
		),
		...relations(
			'DELIVERS_TO',
			DELIVERS_TO.map((row) => ({
				from: nid('product', row.from),
				to: nid('customer', row.to),
				validFrom: '2021-01-01',
				attrs: { orderQty: row.orderQty }
			}))
		),
		...relations(
			'AFFECTS',
			RISK_EVENTS.map((row) => ({
				from: nid('risk', row.id),
				to: nid('supplier', row.affects),
				validFrom: row.startedAt,
				weight: 1
			}))
		)
	];

	const docs = documentNodes(DOCUMENTS);
	nodes.push(...docs.nodes);
	edges.push(...docs.edges);

	return { schema: AEROSPACE_SCHEMA, nodes, edges, documents: DOCUMENTS };
}

export const AEROSPACE_AS_OF = '2024-08-01';
