import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';


interface SupplierFixture {
	id: string;
	name: string;
	specialty: string;
	region: string;
	tier: string;
}

interface ComponentFixture {
	id: string;
	name: string;
	componentType: string;
	criticality: string;
}

interface SupplyFixture {
	supplier: string;
	component: string;
	leadTimeDays: number;
	validFrom: string;
	validTo?: string;
}

interface FactoryFixture {
	id: string;
	name: string;
	region: string;
	capacityUnitsPerDay: number;
	uses: string[];
}

interface ProductFixture {
	id: string;
	name: string;
	category: string;
	factory: string;
	unitPrice: number;
}

interface SellerFixture {
	id: string;
	name: string;
	channel: string;
	sells: string[];
}

interface SaleFixture {
	id: string;
	product: string;
	seller: string;
	region: string;
	units: number;
	revenue: number;
	status: 'fulfilled' | 'returned' | 'refunded';
	soldAt: string;
}

interface IncidentFixture {
	id: string;
	title: string;
	severity: string;
	startedAt: string;
	affects: string[];
}

const SUPPLIERS: SupplierFixture[] = [
	{ id: 'SUP-01', name: 'NovaCell Energy', specialty: 'battery cells', region: 'KR', tier: 'tier-1' },
	{ id: 'SUP-02', name: 'LumaPanel Displays', specialty: 'display panels', region: 'JP', tier: 'tier-1' },
	{ id: 'SUP-03', name: 'ShenzhenChip', specialty: 'application processors', region: 'CN', tier: 'tier-1' },
	{ id: 'SUP-04', name: 'TechChip Micro', specialty: 'application processors', region: 'TW', tier: 'tier-1' },
	{ id: 'SUP-05', name: 'PolyResin Industries', specialty: 'moulded housings', region: 'IN', tier: 'tier-2' },
	{ id: 'SUP-06', name: 'IronWorks Metals', specialty: 'metal frames', region: 'IN', tier: 'tier-2' },
	{ id: 'SUP-07', name: 'AudioTek Components', specialty: 'audio drivers', region: 'MY', tier: 'tier-2' },
	{ id: 'SUP-08', name: 'GlassCo Optics', specialty: 'optical glass', region: 'DE', tier: 'tier-1' }
];

const COMPONENTS: ComponentFixture[] = [
	{ id: 'CMP-01', name: 'lithium cell pack', componentType: 'power', criticality: 'high' },
	{ id: 'CMP-02', name: 'OLED panel', componentType: 'display', criticality: 'high' },
	{ id: 'CMP-03', name: 'SoC processor', componentType: 'silicon', criticality: 'high' },
	{ id: 'CMP-04', name: 'resin housing', componentType: 'enclosure', criticality: 'medium' },
	{ id: 'CMP-05', name: 'alloy frame', componentType: 'enclosure', criticality: 'medium' },
	{ id: 'CMP-06', name: 'speaker driver', componentType: 'audio', criticality: 'medium' },
	{ id: 'CMP-07', name: 'camera lens', componentType: 'optics', criticality: 'high' },
	{ id: 'CMP-08', name: 'battery controller', componentType: 'power', criticality: 'high' },
	{ id: 'CMP-09', name: 'USB connector', componentType: 'interconnect', criticality: 'low' },
	{ id: 'CMP-10', name: 'haptic motor', componentType: 'actuator', criticality: 'low' }
];

const SUPPLIES: SupplyFixture[] = [
	{ supplier: 'SUP-01', component: 'CMP-01', leadTimeDays: 21, validFrom: '2025-01-01' },
	{ supplier: 'SUP-01', component: 'CMP-08', leadTimeDays: 18, validFrom: '2025-01-01' },
	{ supplier: 'SUP-02', component: 'CMP-02', leadTimeDays: 30, validFrom: '2025-01-01' },
	{ supplier: 'SUP-02', component: 'CMP-07', leadTimeDays: 24, validFrom: '2025-06-01' },
	{ supplier: 'SUP-03', component: 'CMP-03', leadTimeDays: 40, validFrom: '2024-03-01', validTo: '2026-02-16' },
	{ supplier: 'SUP-04', component: 'CMP-03', leadTimeDays: 35, validFrom: '2026-02-17' },
	{ supplier: 'SUP-04', component: 'CMP-08', leadTimeDays: 22, validFrom: '2026-02-17' },
	{ supplier: 'SUP-05', component: 'CMP-04', leadTimeDays: 12, validFrom: '2025-01-01' },
	{ supplier: 'SUP-05', component: 'CMP-09', leadTimeDays: 9, validFrom: '2025-01-01' },
	{ supplier: 'SUP-06', component: 'CMP-04', leadTimeDays: 15, validFrom: '2025-04-01' },
	{ supplier: 'SUP-06', component: 'CMP-05', leadTimeDays: 17, validFrom: '2025-01-01' },
	{ supplier: 'SUP-06', component: 'CMP-09', leadTimeDays: 11, validFrom: '2025-04-01' },
	{ supplier: 'SUP-07', component: 'CMP-06', leadTimeDays: 20, validFrom: '2025-01-01' },
	{ supplier: 'SUP-07', component: 'CMP-10', leadTimeDays: 14, validFrom: '2025-01-01' },
	{ supplier: 'SUP-08', component: 'CMP-07', leadTimeDays: 26, validFrom: '2025-01-01' },
	{ supplier: 'SUP-08', component: 'CMP-09', leadTimeDays: 10, validFrom: '2025-09-01' }
];

const FACTORIES: FactoryFixture[] = [
	{ id: 'FAC-01', name: 'Chennai Assembly', region: 'IN', capacityUnitsPerDay: 4200, uses: ['CMP-01', 'CMP-02', 'CMP-03', 'CMP-04'] },
	{ id: 'FAC-02', name: 'Pune Works', region: 'IN', capacityUnitsPerDay: 1800, uses: ['CMP-05', 'CMP-06', 'CMP-09'] },
	{ id: 'FAC-03', name: 'Shenzhen Line 4', region: 'CN', capacityUnitsPerDay: 6100, uses: ['CMP-03', 'CMP-07', 'CMP-08'] },
	{ id: 'FAC-04', name: 'Guadalajara Plant', region: 'MX', capacityUnitsPerDay: 2500, uses: ['CMP-04', 'CMP-09', 'CMP-10'] }
];

const PRODUCTS: ProductFixture[] = [
	{ id: 'PRD-01', name: 'AuraPhone X', category: 'phones', factory: 'FAC-01', unitPrice: 899 },
	{ id: 'PRD-02', name: 'AuraPhone Lite', category: 'phones', factory: 'FAC-01', unitPrice: 429 },
	{ id: 'PRD-03', name: 'SoundPod Pro', category: 'audio', factory: 'FAC-02', unitPrice: 219 },
	{ id: 'PRD-04', name: 'VisionCam S', category: 'imaging', factory: 'FAC-03', unitPrice: 649 },
	{ id: 'PRD-05', name: 'HomeHub Mini', category: 'smart-home', factory: 'FAC-04', unitPrice: 129 },
	{ id: 'PRD-06', name: 'AuraTab 11', category: 'tablets', factory: 'FAC-03', unitPrice: 559 }
];

const SELLERS: SellerFixture[] = [
	{ id: 'SEL-01', name: 'NorthMart', channel: 'retail', sells: ['PRD-01', 'PRD-02', 'PRD-05'] },
	{ id: 'SEL-02', name: 'EastBazaar', channel: 'marketplace', sells: ['PRD-03', 'PRD-06'] },
	{ id: 'SEL-03', name: 'PrimeGoods', channel: 'marketplace', sells: ['PRD-01', 'PRD-04'] },
	{ id: 'SEL-04', name: 'ValueLine', channel: 'discount', sells: ['PRD-05'] },
	{ id: 'SEL-05', name: 'UrbanKart', channel: 'marketplace', sells: ['PRD-02', 'PRD-03', 'PRD-04', 'PRD-06'] }
];

const SALES: SaleFixture[] = [
	{ id: 'SALE-1001', product: 'PRD-01', seller: 'SEL-01', region: 'IN-South', units: 120, revenue: 107880, status: 'fulfilled', soldAt: '2026-07-02' },
	{ id: 'SALE-1002', product: 'PRD-02', seller: 'SEL-01', region: 'IN-South', units: 340, revenue: 145860, status: 'fulfilled', soldAt: '2026-07-04' },
	{ id: 'SALE-1003', product: 'PRD-05', seller: 'SEL-01', region: 'EU-West', units: 210, revenue: 27090, status: 'returned', soldAt: '2026-07-09' },
	{ id: 'SALE-1004', product: 'PRD-03', seller: 'SEL-02', region: 'EU-West', units: 95, revenue: 20805, status: 'fulfilled', soldAt: '2026-07-11' },
	{ id: 'SALE-1005', product: 'PRD-06', seller: 'SEL-02', region: 'US-East', units: 140, revenue: 78260, status: 'fulfilled', soldAt: '2026-07-14' },
	{ id: 'SALE-1006', product: 'PRD-01', seller: 'SEL-03', region: 'US-East', units: 88, revenue: 79112, status: 'fulfilled', soldAt: '2026-07-16' },
	{ id: 'SALE-1007', product: 'PRD-04', seller: 'SEL-03', region: 'EU-West', units: 64, revenue: 41536, status: 'returned', soldAt: '2026-07-18' },
	{ id: 'SALE-1008', product: 'PRD-02', seller: 'SEL-05', region: 'IN-South', units: 410, revenue: 175890, status: 'returned', soldAt: '2026-07-21' },
	{ id: 'SALE-1009', product: 'PRD-03', seller: 'SEL-05', region: 'US-East', units: 180, revenue: 39420, status: 'returned', soldAt: '2026-07-23' },
	{ id: 'SALE-1010', product: 'PRD-04', seller: 'SEL-05', region: 'US-East', units: 72, revenue: 46728, status: 'refunded', soldAt: '2026-07-26' },
	{ id: 'SALE-1011', product: 'PRD-06', seller: 'SEL-05', region: 'EU-West', units: 156, revenue: 87204, status: 'fulfilled', soldAt: '2026-07-29' },
	{ id: 'SALE-1012', product: 'PRD-05', seller: 'SEL-04', region: 'IN-South', units: 520, revenue: 67080, status: 'fulfilled', soldAt: '2026-08-01' },
	{ id: 'SALE-1013', product: 'PRD-01', seller: 'SEL-01', region: 'EU-West', units: 143, revenue: 128557, status: 'fulfilled', soldAt: '2026-08-05' },
	{ id: 'SALE-1014', product: 'PRD-06', seller: 'SEL-02', region: 'IN-South', units: 97, revenue: 54223, status: 'fulfilled', soldAt: '2026-08-08' }
];

const INCIDENTS: IncidentFixture[] = [
	{ id: 'EVT-01', title: 'Shenzhen port closure', severity: 'critical', startedAt: '2026-08-10', affects: ['SUP-04'] },
	{ id: 'EVT-02', title: 'Resin feedstock price shock', severity: 'medium', startedAt: '2026-08-12', affects: ['SUP-05'] },
	{ id: 'EVT-03', title: 'Audio driver safety recall', severity: 'high', startedAt: '2026-08-15', affects: ['SUP-07'] }
];

const DOCUMENTS: CorpusDocument[] = [
	{
		id: 'policy-sourcing',
		title: 'Component sourcing policy',
		text: `# Component sourcing policy

Every component rated high criticality must carry at least two qualified suppliers on an
active contract. Where only one qualified supplier exists, procurement records a
single-source exception and reviews it every quarter.

## Qualification

A supplier is qualified for a component after two consecutive on-time deliveries at
production volume. Qualification does not transfer between component types: a supplier
qualified for enclosures is not thereby qualified for silicon.

## Contract transitions

When a supply contract ends, the outgoing supplier remains in the procurement record for
audit but stops being a valid source on the day after the contract end date. Purchase
orders raised against an ended contract are rejected at intake.`
	},
	{
		id: 'policy-returns',
		title: 'Returns and refunds policy',
		text: `# Returns and refunds policy

A sale is marked returned when the goods come back within the 30-day window, and refunded
when money is released without the goods being recovered. Refunds are the more expensive
outcome and are tracked separately for that reason.

## Seller review thresholds

A seller whose returned and refunded orders exceed one quarter of their order count in a
rolling month enters commercial review. Review looks at the product mix first: a seller
concentrated in a single high-return category is treated differently from one returning
across the whole catalogue.

## Restocking

Returned units are restocked only after inspection. Units from a product under an active
component recall are quarantined rather than restocked.`
	},
	{
		id: 'playbook-continuity',
		title: 'Production continuity playbook',
		text: `# Production continuity playbook

When a disruption event is raised against a supplier, the continuity desk works outward
from the supplier to the components it sources, the factories consuming those components,
and the finished products those factories build.

## Severity and decay

Exposure is scored by event severity weighted against distance. A directly affected
supplier carries the full weight of the event; each further step in the chain contributes
progressively less, because inventory and alternative routing absorb some of the shock.

## First actions

Confirm whether the affected supplier is the sole active source for any component it
supplies. A disruption at a dual-sourced component is a scheduling problem. A disruption
at a single-sourced component is a production stop, and the escalation path is different.`
	},
	{
		id: 'guide-seller-onboarding',
		title: 'Seller onboarding guide',
		text: `# Seller onboarding guide

Sellers are onboarded per channel. Retail sellers hold inventory and are invoiced on
dispatch. Marketplace sellers list against shared inventory and are settled on delivery
confirmation. Discount channel sellers take end-of-life and overstock lines only.

## Catalogue assignment

A seller may only list products whose factory has confirmed allocation for that channel.
Allocation is reviewed when a product's production moves between factories.

## Performance

Seller performance is reported on fulfilled order value, not gross order value, so
returned and refunded orders do not inflate the ranking.`
	}
];

export const COMMERCE_SCHEMA: GraphSchema = {
	domain: 'commerce',
	description:
		'Product sales and manufacturing: incidents hit suppliers, suppliers source components, factories consume components and build products, sellers sell products, sales record the outcome.',
	nodeTypes: [
		{ name: 'Supplier', description: 'A component supplier with a specialty and a region.' },
		{ name: 'Component', description: 'A part consumed by production, with a criticality rating.' },
		{ name: 'Factory', description: 'A production site with a daily capacity.' },
		{ name: 'Product', description: 'A finished good built at one factory.' },
		{ name: 'Category', description: 'Merchandising category a product belongs to.' },
		{ name: 'Seller', description: 'A sales channel partner listing products.' },
		{ name: 'Sale', description: 'One sales record: units, revenue and outcome status.' },
		{ name: 'Region', description: 'Sales territory.' },
		{ name: 'Incident', description: 'A disruption event with a severity, affecting suppliers.' },
		{ name: 'DocSection', description: 'One retrievable chunk of policy or playbook prose.' }
	],
	edgeTypes: [
		{ name: 'AFFECTS', from: 'Incident', to: 'Supplier', description: 'Disruption event hits this supplier.' },
		{ name: 'SUPPLIES', from: 'Supplier', to: 'Component', description: 'Supplier sources this component under contract.' },
		{ name: 'USED_BY', from: 'Component', to: 'Factory', description: 'Component is consumed by this factory.' },
		{ name: 'PRODUCES', from: 'Factory', to: 'Product', description: 'Factory builds this product.' },
		{ name: 'SOLD_BY', from: 'Product', to: 'Seller', description: 'Product is listed by this seller.' },
		{ name: 'IN_CATEGORY', from: 'Product', to: 'Category', description: 'Product belongs to this category.' },
		{ name: 'OF_PRODUCT', from: 'Sale', to: 'Product', description: 'Sale is of this product.' },
		{ name: 'BY_SELLER', from: 'Sale', to: 'Seller', description: 'Sale was made by this seller.' },
		{ name: 'TO_REGION', from: 'Sale', to: 'Region', description: 'Sale was delivered to this region.' },
		{ name: 'DOCUMENTS', from: 'DocSection', to: 'Category', description: 'Policy section covering this area.' },
		{ name: 'ADJACENT_TO', from: 'DocSection', to: 'DocSection', description: 'Neighbouring section in the same document.' }
	]
};

function chunkDocument(doc: CorpusDocument): Array<{ id: string; heading: string; text: string }> {
	const parts = doc.text.split(/\n(?=#{1,6}\s)/).map((part) => part.trim()).filter(Boolean);
	return parts.map((part, index) => {
		const heading = /^#{1,6}\s+(.*)$/m.exec(part)?.[1]?.trim() ?? doc.title;
		return { id: `${doc.id}#c${index}`, heading, text: part };
	});
}

export function buildCommerceDataset(): DomainDataset {
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	for (const supplier of SUPPLIERS) {
		nodes.push({
			id: `supplier:${supplier.id}`,
			type: 'Supplier',
			label: supplier.name,
			attrs: { code: supplier.id, name: supplier.name, specialty: supplier.specialty, region: supplier.region, tier: supplier.tier },
			text: `Supplier ${supplier.id} ${supplier.name} in ${supplier.region}, ${supplier.tier}, specialising in ${supplier.specialty}.`
		});
	}

	for (const component of COMPONENTS) {
		nodes.push({
			id: `component:${component.id}`,
			type: 'Component',
			label: component.name,
			attrs: { code: component.id, name: component.name, componentType: component.componentType, criticality: component.criticality },
			text: `Component ${component.id} ${component.name}, type ${component.componentType}, criticality ${component.criticality}.`
		});
	}

	for (const supply of SUPPLIES) {
		edges.push({
			type: 'SUPPLIES',
			from: `supplier:${supply.supplier}`,
			to: `component:${supply.component}`,
			weight: 1,
			validFrom: supply.validFrom,
			...(supply.validTo ? { validTo: supply.validTo } : {}),
			attrs: { leadTimeDays: supply.leadTimeDays }
		});
	}

	for (const factory of FACTORIES) {
		nodes.push({
			id: `factory:${factory.id}`,
			type: 'Factory',
			label: factory.name,
			attrs: { code: factory.id, name: factory.name, region: factory.region, capacityUnitsPerDay: factory.capacityUnitsPerDay },
			text: `Factory ${factory.id} ${factory.name} in ${factory.region}, capacity ${factory.capacityUnitsPerDay} units per day, consuming ${factory.uses.join(', ')}.`
		});
		for (const component of factory.uses) {
			edges.push({ type: 'USED_BY', from: `component:${component}`, to: `factory:${factory.id}`, validFrom: '2025-01-01' });
		}
	}

	const categories = new Set<string>();
	for (const product of PRODUCTS) {
		categories.add(product.category);
		nodes.push({
			id: `product:${product.id}`,
			type: 'Product',
			label: product.name,
			attrs: { code: product.id, name: product.name, category: product.category, factory: product.factory, unitPrice: product.unitPrice },
			text: `Product ${product.id} ${product.name}, category ${product.category}, built at ${product.factory}, unit price ${product.unitPrice}.`
		});
		edges.push({ type: 'PRODUCES', from: `factory:${product.factory}`, to: `product:${product.id}`, validFrom: '2025-01-01' });
		edges.push({ type: 'IN_CATEGORY', from: `product:${product.id}`, to: `category:${product.category}` });
	}

	for (const category of [...categories].sort()) {
		nodes.push({
			id: `category:${category}`,
			type: 'Category',
			label: category,
			attrs: { name: category },
			text: `Merchandising category ${category}.`
		});
	}

	for (const seller of SELLERS) {
		nodes.push({
			id: `seller:${seller.id}`,
			type: 'Seller',
			label: seller.name,
			attrs: { code: seller.id, name: seller.name, channel: seller.channel },
			text: `Seller ${seller.id} ${seller.name}, ${seller.channel} channel, listing ${seller.sells.join(', ')}.`
		});
		for (const product of seller.sells) {
			edges.push({ type: 'SOLD_BY', from: `product:${product}`, to: `seller:${seller.id}`, validFrom: '2025-01-01' });
		}
	}

	const regions = new Set<string>();
	for (const sale of SALES) {
		regions.add(sale.region);
		nodes.push({
			id: `sale:${sale.id}`,
			type: 'Sale',
			label: sale.id,
			attrs: {
				code: sale.id,
				product: sale.product,
				seller: sale.seller,
				region: sale.region,
				units: sale.units,
				revenue: sale.revenue,
				status: sale.status,
				soldAt: sale.soldAt,
				returnedOrRefunded: sale.status !== 'fulfilled'
			},
			text: `Sale ${sale.id}: ${sale.units} units of ${sale.product} by ${sale.seller} into ${sale.region} on ${sale.soldAt}, revenue ${sale.revenue}, status ${sale.status}.`
		});
		edges.push({ type: 'OF_PRODUCT', from: `sale:${sale.id}`, to: `product:${sale.product}`, validFrom: sale.soldAt });
		edges.push({ type: 'BY_SELLER', from: `sale:${sale.id}`, to: `seller:${sale.seller}`, validFrom: sale.soldAt });
		edges.push({ type: 'TO_REGION', from: `sale:${sale.id}`, to: `region:${sale.region}`, validFrom: sale.soldAt });
	}

	for (const region of [...regions].sort()) {
		nodes.push({
			id: `region:${region}`,
			type: 'Region',
			label: region,
			attrs: { name: region },
			text: `Sales region ${region}.`
		});
	}

	for (const incident of INCIDENTS) {
		nodes.push({
			id: `incident:${incident.id}`,
			type: 'Incident',
			label: incident.title,
			attrs: { code: incident.id, title: incident.title, severity: incident.severity, startedAt: incident.startedAt },
			text: `Incident ${incident.id} ${incident.title}, severity ${incident.severity}, started ${incident.startedAt}, affecting ${incident.affects.join(', ')}.`
		});
		for (const supplier of incident.affects) {
			edges.push({
				type: 'AFFECTS',
				from: `incident:${incident.id}`,
				to: `supplier:${supplier}`,
				weight: 1,
				validFrom: incident.startedAt
			});
		}
	}

	const chunks = DOCUMENTS.flatMap((doc) =>
		chunkDocument(doc).map((chunk) => ({ ...chunk, docId: doc.id }))
	);

	for (const chunk of chunks) {
		nodes.push({
			id: chunk.id,
			type: 'DocSection',
			label: chunk.heading,
			attrs: { docId: chunk.docId, heading: chunk.heading },
			text: chunk.text
		});
	}

	for (let index = 1; index < chunks.length; index += 1) {
		const previous = chunks[index - 1];
		const current = chunks[index];
		if (!previous || !current || previous.docId !== current.docId) continue;
		edges.push({ type: 'ADJACENT_TO', from: previous.id, to: current.id });
		edges.push({ type: 'ADJACENT_TO', from: current.id, to: previous.id });
	}

	return { schema: COMMERCE_SCHEMA, nodes, edges, documents: DOCUMENTS };
}

export const COMMERCE_FIXTURES = {
	suppliers: SUPPLIERS,
	components: COMPONENTS,
	supplies: SUPPLIES,
	factories: FACTORIES,
	products: PRODUCTS,
	sellers: SELLERS,
	sales: SALES,
	incidents: INCIDENTS,
	documents: DOCUMENTS
};
