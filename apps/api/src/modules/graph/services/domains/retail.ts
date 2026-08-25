import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';
import { DOC_ADJACENCY_EDGE, DOC_SECTION_TYPE, documentNodes, entities, nid, relations } from './builder.js';


const CATEGORIES = ['audio', 'kitchen', 'wearables', 'lighting', 'outdoor'];

const SELLERS = [
	{ id: 'SEL-01', name: 'NorthMart', channel: 'retail', joined: '2024-02-01' },
	{ id: 'SEL-02', name: 'EastBazaar', channel: 'marketplace', joined: '2024-05-14' },
	{ id: 'SEL-03', name: 'PrimeGoods', channel: 'marketplace', joined: '2023-11-03' },
	{ id: 'SEL-04', name: 'ValueLine', channel: 'discount', joined: '2025-01-20' },
	{ id: 'SEL-05', name: 'UrbanKart', channel: 'marketplace', joined: '2024-08-09' },
	{ id: 'SEL-06', name: 'CraftHouse', channel: 'boutique', joined: '2025-03-02' }
];

const PRODUCTS = [
	{ id: 'PRD-01', name: 'EchoBud Pro', category: 'audio', unitPrice: 149, listedBy: ['SEL-01', 'SEL-03', 'SEL-05'] },
	{ id: 'PRD-02', name: 'SoundBar Slim', category: 'audio', unitPrice: 279, listedBy: ['SEL-05'] },
	{ id: 'PRD-03', name: 'ChefBlend 900', category: 'kitchen', unitPrice: 199, listedBy: ['SEL-01', 'SEL-04'] },
	{ id: 'PRD-04', name: 'SteamKettle X', category: 'kitchen', unitPrice: 89, listedBy: ['SEL-02'] },
	{ id: 'PRD-05', name: 'PulseBand 4', category: 'wearables', unitPrice: 129, listedBy: ['SEL-03', 'SEL-05'] },
	{ id: 'PRD-06', name: 'GlowLamp Mini', category: 'lighting', unitPrice: 45, listedBy: ['SEL-04'] },
	{ id: 'PRD-07', name: 'TrailPack 40', category: 'outdoor', unitPrice: 219, listedBy: ['SEL-02', 'SEL-06'] },
	{ id: 'PRD-08', name: 'LumenStrip Pro', category: 'lighting', unitPrice: 65, listedBy: ['SEL-06'] }
];

const CUSTOMERS = [
	{ id: 'CUS-01', name: 'Rivera Household', segment: 'consumer', region: 'IN-South' },
	{ id: 'CUS-02', name: 'Okafor Household', segment: 'consumer', region: 'EU-West' },
	{ id: 'CUS-03', name: 'Bright Cafe Group', segment: 'business', region: 'US-East' },
	{ id: 'CUS-04', name: 'Tanaka Household', segment: 'consumer', region: 'APAC' },
	{ id: 'CUS-05', name: 'Summit Outfitters', segment: 'business', region: 'US-East' }
];

const REGIONS = ['IN-South', 'EU-West', 'US-East', 'APAC'];

const ORDERS = [
	{ id: 'ORD-1001', product: 'PRD-01', seller: 'SEL-01', customer: 'CUS-01', units: 2, revenue: 298, status: 'fulfilled', placedAt: '2026-06-03' },
	{ id: 'ORD-1002', product: 'PRD-03', seller: 'SEL-01', customer: 'CUS-03', units: 6, revenue: 1194, status: 'fulfilled', placedAt: '2026-06-08' },
	{ id: 'ORD-1003', product: 'PRD-01', seller: 'SEL-03', customer: 'CUS-02', units: 1, revenue: 149, status: 'returned', placedAt: '2026-06-15' },
	{ id: 'ORD-1004', product: 'PRD-05', seller: 'SEL-03', customer: 'CUS-04', units: 3, revenue: 387, status: 'fulfilled', placedAt: '2026-06-21' },
	{ id: 'ORD-1005', product: 'PRD-02', seller: 'SEL-05', customer: 'CUS-03', units: 4, revenue: 1116, status: 'returned', placedAt: '2026-07-02' },
	{ id: 'ORD-1006', product: 'PRD-01', seller: 'SEL-05', customer: 'CUS-01', units: 2, revenue: 298, status: 'refunded', placedAt: '2026-07-07' },
	{ id: 'ORD-1007', product: 'PRD-05', seller: 'SEL-05', customer: 'CUS-02', units: 5, revenue: 645, status: 'returned', placedAt: '2026-07-13' },
	{ id: 'ORD-1008', product: 'PRD-04', seller: 'SEL-02', customer: 'CUS-04', units: 7, revenue: 623, status: 'fulfilled', placedAt: '2026-07-18' },
	{ id: 'ORD-1009', product: 'PRD-07', seller: 'SEL-02', customer: 'CUS-05', units: 12, revenue: 2628, status: 'fulfilled', placedAt: '2026-07-24' },
	{ id: 'ORD-1010', product: 'PRD-06', seller: 'SEL-04', customer: 'CUS-01', units: 9, revenue: 405, status: 'fulfilled', placedAt: '2026-07-29' },
	{ id: 'ORD-1011', product: 'PRD-03', seller: 'SEL-04', customer: 'CUS-03', units: 3, revenue: 597, status: 'returned', placedAt: '2026-08-04' },
	{ id: 'ORD-1012', product: 'PRD-07', seller: 'SEL-06', customer: 'CUS-05', units: 4, revenue: 876, status: 'fulfilled', placedAt: '2026-08-09' },
	{ id: 'ORD-1013', product: 'PRD-01', seller: 'SEL-01', customer: 'CUS-04', units: 3, revenue: 447, status: 'fulfilled', placedAt: '2026-08-12' },
	{ id: 'ORD-1014', product: 'PRD-05', seller: 'SEL-03', customer: 'CUS-02', units: 2, revenue: 258, status: 'fulfilled', placedAt: '2026-08-16' }
];

const CAMPAIGNS = [
	{ id: 'CMP-A', name: 'Summer Audio Days', discountPct: 15, promotes: ['PRD-01', 'PRD-02'], validFrom: '2026-06-01', validTo: '2026-07-01' },
	{ id: 'CMP-B', name: 'Kitchen Refresh', discountPct: 10, promotes: ['PRD-03', 'PRD-04'], validFrom: '2026-07-01' },
	{ id: 'CMP-C', name: 'Trail Season', discountPct: 20, promotes: ['PRD-07'], validFrom: '2026-08-01' },
	{ id: 'CMP-D', name: 'Audio Encore', discountPct: 12, promotes: ['PRD-01'], validFrom: '2026-08-05' }
];

const COMPLAINTS = [
	{ id: 'CPL-01', title: 'Battery drains overnight', severity: 'high', openedAt: '2026-07-05', about: 'PRD-01' },
	{ id: 'CPL-02', title: 'Strap clasp breaks', severity: 'medium', openedAt: '2026-07-19', about: 'PRD-05' },
	{ id: 'CPL-03', title: 'Distortion above half volume', severity: 'critical', openedAt: '2026-07-28', about: 'PRD-02' },
	{ id: 'CPL-04', title: 'Lid seal leaks', severity: 'low', openedAt: '2026-08-02', about: 'PRD-04' }
];

const DOCUMENTS: CorpusDocument[] = [
	{
		id: 'retail-returns-policy',
		title: 'Returns and refunds policy',
		text: `# Returns and refunds policy

An order is marked returned when the goods come back inside the thirty-day window, and
refunded when money is released without the goods being recovered. Refunds are the more
expensive outcome and are tracked separately for that reason.

## Seller review thresholds

A seller whose returned and refunded orders exceed a quarter of their order count in a
rolling month enters commercial review. Review looks at the product mix first: a seller
concentrated in one high-return category is treated differently from one returning across
the whole catalogue.

## Restocking

Returned units are restocked only after inspection. Units of a product under an open
quality complaint are quarantined rather than restocked.`
	},
	{
		id: 'retail-listing-rules',
		title: 'Listing and campaign rules',
		text: `# Listing and campaign rules

A product must be listed by at least one active seller to remain in the catalogue. A
product whose only seller leaves the platform is delisted rather than transferred.

## Campaign windows

A campaign applies only between its start and end dates. Discounts do not apply
retroactively to orders placed before the window opened, and a campaign that has ended
stays in the record for reconciliation but no longer prices anything.

## Category coverage

Merchandising aims for at least one running campaign per category each quarter.
Categories with no campaign are reported to the category manager, not auto-enrolled.`
	},
	{
		id: 'retail-quality-escalation',
		title: 'Quality complaint escalation',
		text: `# Quality complaint escalation

A complaint is raised against a product, never against a seller. Exposure then spreads
outward: to the sellers listing that product, and to the customers holding orders for it.

## Severity weighting

Critical complaints suspend the listing immediately. High complaints require a corrective
action plan within five working days. Medium and low complaints are batched into the
monthly quality review.`
	}
];

export const RETAIL_SCHEMA: GraphSchema = {
	domain: 'retail',
	description:
		'Product sales: sellers list products, customers place orders in regions, campaigns promote products for a window, and quality complaints attach to products.',
	nodeTypes: [
		{ name: 'Seller', description: 'A sales channel partner listing products.' },
		{ name: 'Product', description: 'A catalogue item with a category and a price.' },
		{ name: 'Category', description: 'Merchandising category.' },
		{ name: 'Order', description: 'One sale: units, revenue and outcome status.' },
		{ name: 'Customer', description: 'A buying household or business.' },
		{ name: 'Region', description: 'Delivery territory.' },
		{ name: 'Campaign', description: 'A time-boxed promotion over a set of products.' },
		{ name: 'Complaint', description: 'A quality complaint against a product, with a severity.' },
		DOC_SECTION_TYPE
	],
	edgeTypes: [
		{ name: 'LISTED_BY', from: 'Product', to: 'Seller', description: 'Product is listed by this seller.' },
		{ name: 'IN_CATEGORY', from: 'Product', to: 'Category', description: 'Product belongs to this category.' },
		{ name: 'OF_PRODUCT', from: 'Order', to: 'Product', description: 'Order is for this product.' },
		{ name: 'FROM_SELLER', from: 'Order', to: 'Seller', description: 'Order was fulfilled by this seller.' },
		{ name: 'BY_CUSTOMER', from: 'Order', to: 'Customer', description: 'Order was placed by this customer.' },
		{ name: 'TO_REGION', from: 'Order', to: 'Region', description: 'Order shipped to this region.' },
		{ name: 'PROMOTES', from: 'Campaign', to: 'Product', description: 'Campaign discounts this product for its window.' },
		{ name: 'ABOUT', from: 'Complaint', to: 'Product', description: 'Complaint was raised against this product.' },
		DOC_ADJACENCY_EDGE
	]
};

export function buildRetailDataset(): DomainDataset {
	const nodes: GraphNode[] = [
		...entities('Seller', 'seller', SELLERS, (row) => ({
			label: row.name,
			attrs: { name: row.name, channel: row.channel, joined: row.joined },
			text: `Seller ${row.id} ${row.name}, ${row.channel} channel, joined ${row.joined}.`
		})),
		...entities('Product', 'product', PRODUCTS, (row) => ({
			label: row.name,
			attrs: { name: row.name, category: row.category, unitPrice: row.unitPrice, sellerCount: row.listedBy.length },
			text: `Product ${row.id} ${row.name}, category ${row.category}, unit price ${row.unitPrice}, listed by ${row.listedBy.join(', ')}.`
		})),
		...entities(
			'Category',
			'category',
			CATEGORIES.map((name) => ({ id: name })),
			(row) => ({ label: row.id, attrs: { name: row.id }, text: `Merchandising category ${row.id}.` })
		),
		...entities('Order', 'order', ORDERS, (row) => ({
			label: row.id,
			attrs: {
				product: row.product,
				seller: row.seller,
				customer: row.customer,
				units: row.units,
				revenue: row.revenue,
				status: row.status,
				placedAt: row.placedAt,
				returnedOrRefunded: row.status !== 'fulfilled'
			},
			text: `Order ${row.id}: ${row.units} units of ${row.product} from ${row.seller} to ${row.customer} on ${row.placedAt}, revenue ${row.revenue}, status ${row.status}.`
		})),
		...entities('Customer', 'customer', CUSTOMERS, (row) => ({
			label: row.name,
			attrs: { name: row.name, segment: row.segment, region: row.region },
			text: `Customer ${row.id} ${row.name}, ${row.segment} segment in ${row.region}.`
		})),
		...entities(
			'Region',
			'region',
			REGIONS.map((name) => ({ id: name })),
			(row) => ({ label: row.id, attrs: { name: row.id }, text: `Sales region ${row.id}.` })
		),
		...entities('Campaign', 'campaign', CAMPAIGNS, (row) => ({
			label: row.name,
			attrs: { name: row.name, discountPct: row.discountPct, validFrom: row.validFrom, validTo: row.validTo ?? null },
			text: `Campaign ${row.id} ${row.name}, ${row.discountPct}% off ${row.promotes.join(', ')}, running from ${row.validFrom}${row.validTo ? ` until ${row.validTo}` : ' with no end date set'}.`
		})),
		...entities('Complaint', 'complaint', COMPLAINTS, (row) => ({
			label: row.title,
			attrs: { title: row.title, severity: row.severity, openedAt: row.openedAt, about: row.about },
			text: `Complaint ${row.id} ${row.title}, severity ${row.severity}, opened ${row.openedAt} against ${row.about}.`
		}))
	];

	const edges: GraphEdge[] = [
		...relations(
			'LISTED_BY',
			PRODUCTS.flatMap((product) =>
				product.listedBy.map((seller) => ({ from: nid('product', product.id), to: nid('seller', seller), validFrom: '2024-01-01' }))
			)
		),
		...relations(
			'IN_CATEGORY',
			PRODUCTS.map((product) => ({ from: nid('product', product.id), to: nid('category', product.category) }))
		),
		...relations(
			'OF_PRODUCT',
			ORDERS.map((order) => ({ from: nid('order', order.id), to: nid('product', order.product), validFrom: order.placedAt }))
		),
		...relations(
			'FROM_SELLER',
			ORDERS.map((order) => ({ from: nid('order', order.id), to: nid('seller', order.seller), validFrom: order.placedAt }))
		),
		...relations(
			'BY_CUSTOMER',
			ORDERS.map((order) => ({ from: nid('order', order.id), to: nid('customer', order.customer), validFrom: order.placedAt }))
		),
		...relations(
			'TO_REGION',
			ORDERS.map((order) => {
				const customer = CUSTOMERS.find((entry) => entry.id === order.customer);
				return { from: nid('order', order.id), to: nid('region', customer?.region ?? 'US-East'), validFrom: order.placedAt };
			})
		),
		...relations(
			'PROMOTES',
			CAMPAIGNS.flatMap((campaign) =>
				campaign.promotes.map((product) => ({
					from: nid('campaign', campaign.id),
					to: nid('product', product),
					validFrom: campaign.validFrom,
					...(campaign.validTo ? { validTo: campaign.validTo } : {})
				}))
			)
		),
		...relations(
			'ABOUT',
			COMPLAINTS.map((complaint) => ({
				from: nid('complaint', complaint.id),
				to: nid('product', complaint.about),
				validFrom: complaint.openedAt,
				weight: 1
			}))
		)
	];

	const docs = documentNodes(DOCUMENTS);
	nodes.push(...docs.nodes);
	edges.push(...docs.edges);

	return { schema: RETAIL_SCHEMA, nodes, edges, documents: DOCUMENTS };
}

export const RETAIL_AS_OF = '2026-08-20';
