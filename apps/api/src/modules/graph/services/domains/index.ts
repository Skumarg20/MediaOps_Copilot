import type { DomainDataset } from '../types.js';
import { AEROSPACE_AS_OF, buildAerospaceDataset } from './aerospace.js';
import { buildCommerceDataset } from './commerce.js';
import { buildFinanceDataset, FINANCE_AS_OF } from './finance.js';
import { buildLogisticsDataset, LOGISTICS_AS_OF } from './logistics.js';
import { buildManufacturingDataset, MANUFACTURING_AS_OF } from './manufacturing.js';
import { buildRetailDataset, RETAIL_AS_OF } from './retail.js';

export interface DomainRegistration {
	name: string;
	summary: string;
	asOf: string;
	build(): DomainDataset;
}

export const DOMAIN_REGISTRY: DomainRegistration[] = [
	{
		name: 'aerospace',
		summary:
			'Aerospace supply chain, reconstructed from the reference paper: risk events -> suppliers -> components -> factories -> aircraft -> customers.',
		asOf: AEROSPACE_AS_OF,
		build: buildAerospaceDataset
	},
	{
		name: 'retail',
		summary: 'Product sales: sellers list products, customers order them, campaigns run for a window, complaints attach to products.',
		asOf: RETAIL_AS_OF,
		build: buildRetailDataset
	},
	{
		name: 'manufacturing',
		summary: 'Plant floor: plants own lines, machines sit on lines, work orders produce batches, defects are found in batches.',
		asOf: MANUFACTURING_AS_OF,
		build: buildManufacturingDataset
	},
	{
		name: 'logistics',
		summary: 'Freight network: hubs joined by lanes, carriers moving shipments to consignees, disruptions raised against hubs.',
		asOf: LOGISTICS_AS_OF,
		build: buildLogisticsDataset
	},
	{
		name: 'finance',
		summary: 'Payments monitoring: accounts at institutions, transfers between accounts, alerts raised against accounts.',
		asOf: FINANCE_AS_OF,
		build: buildFinanceDataset
	},
	{
		name: 'commerce',
		summary: 'Combined sales and manufacturing chain — the first non-native domain this engine was tested on.',
		asOf: '2026-08-20',
		build: buildCommerceDataset
	}
];

export const DOMAINS_BY_NAME = new Map(DOMAIN_REGISTRY.map((entry) => [entry.name, entry]));

export * from './aerospace.js';
export * from './finance.js';
export * from './logistics.js';
export * from './manufacturing.js';
export * from './retail.js';
export * from './builder.js';
