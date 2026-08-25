import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';
import { DOC_ADJACENCY_EDGE, DOC_SECTION_TYPE, documentNodes, entities, nid, relations } from './builder.js';


const INSTITUTIONS = [
	{ id: 'INS-01', name: 'Meridian Bank', country: 'GB', licence: 'full' },
	{ id: 'INS-02', name: 'Cavalier Trust', country: 'US', licence: 'full' },
	{ id: 'INS-03', name: 'Northgate Credit', country: 'IE', licence: 'restricted' },
	{ id: 'INS-04', name: 'Palmetto Exchange', country: 'PA', licence: 'e-money' }
];

const ACCOUNTS = [
	{ id: 'ACC-01', holder: 'Aldridge Consulting', institution: 'INS-01', accountType: 'business', openedAt: '2023-04-02' },
	{ id: 'ACC-02', holder: 'Brant Logistics', institution: 'INS-01', accountType: 'business', openedAt: '2023-06-19' },
	{ id: 'ACC-03', holder: 'Corven Media', institution: 'INS-02', accountType: 'business', openedAt: '2024-01-08' },
	{ id: 'ACC-04', holder: 'Delgado Imports', institution: 'INS-02', accountType: 'business', openedAt: '2024-02-27' },
	{ id: 'ACC-05', holder: 'Eastwind Holdings', institution: 'INS-03', accountType: 'corporate', openedAt: '2024-03-15' },
	{ id: 'ACC-06', holder: 'Fenmore Trading', institution: 'INS-03', accountType: 'corporate', openedAt: '2024-05-30' },
	{ id: 'ACC-07', holder: 'Garrick Ventures', institution: 'INS-02', accountType: 'corporate', openedAt: '2024-09-11' },
	{ id: 'ACC-08', holder: 'Halvard Freight', institution: 'INS-01', accountType: 'business', openedAt: '2025-01-22' },
	{ id: 'ACC-09', holder: 'Innis Retail', institution: 'INS-01', accountType: 'business', openedAt: '2025-03-04' },
	{ id: 'ACC-10', holder: 'Jorvik Supplies', institution: 'INS-02', accountType: 'business', openedAt: '2025-05-16' },
	{ id: 'ACC-11', holder: 'Kestrel Nominees', institution: 'INS-04', accountType: 'nominee', openedAt: '2026-01-09' },
	{ id: 'ACC-12', holder: 'Larkspur Nominees', institution: 'INS-04', accountType: 'nominee', openedAt: '2026-01-09' },
	{ id: 'ACC-13', holder: 'Mistral Nominees', institution: 'INS-04', accountType: 'nominee', openedAt: '2026-01-10' },
	{ id: 'ACC-14', holder: 'Norbury Services', institution: 'INS-01', accountType: 'business', openedAt: '2025-11-28' }
];

const TRANSFERS = [
	{ id: 'TRF-3001', from: 'ACC-01', to: 'ACC-05', amount: 48000, currency: 'GBP', settledAt: '2026-06-02' },
	{ id: 'TRF-3002', from: 'ACC-02', to: 'ACC-05', amount: 61500, currency: 'GBP', settledAt: '2026-06-14' },
	{ id: 'TRF-3003', from: 'ACC-03', to: 'ACC-05', amount: 39250, currency: 'USD', settledAt: '2026-06-27' },
	{ id: 'TRF-3004', from: 'ACC-04', to: 'ACC-05', amount: 77800, currency: 'USD', settledAt: '2026-07-05' },
	{ id: 'TRF-3005', from: 'ACC-05', to: 'ACC-06', amount: 190000, currency: 'EUR', settledAt: '2026-07-12' },
	{ id: 'TRF-3006', from: 'ACC-06', to: 'ACC-07', amount: 172400, currency: 'EUR', settledAt: '2026-07-19' },
	{ id: 'TRF-3007', from: 'ACC-07', to: 'ACC-05', amount: 165000, currency: 'USD', settledAt: '2026-07-26' },
	{ id: 'TRF-3008', from: 'ACC-08', to: 'ACC-02', amount: 22300, currency: 'GBP', settledAt: '2026-08-01' },
	{ id: 'TRF-3009', from: 'ACC-09', to: 'ACC-08', amount: 18900, currency: 'GBP', settledAt: '2026-08-06' },
	{ id: 'TRF-3010', from: 'ACC-10', to: 'ACC-09', amount: 14750, currency: 'USD', settledAt: '2026-08-10' },
	{ id: 'TRF-3011', from: 'ACC-14', to: 'ACC-08', amount: 9600, currency: 'GBP', settledAt: '2026-08-13' },
	{ id: 'TRF-3012', from: 'ACC-11', to: 'ACC-12', amount: 250000, currency: 'USD', settledAt: '2026-08-04' },
	{ id: 'TRF-3013', from: 'ACC-12', to: 'ACC-13', amount: 249000, currency: 'USD', settledAt: '2026-08-08' },
	{ id: 'TRF-3014', from: 'ACC-13', to: 'ACC-11', amount: 248500, currency: 'USD', settledAt: '2026-08-12' }
];

const ALERTS = [
	{ id: 'ALR-01', title: 'Rapid pass-through of incoming funds', severity: 'critical', raisedAt: '2026-07-28', flags: 'ACC-05' },
	{ id: 'ALR-02', title: 'Round-figure cross-border payment', severity: 'high', raisedAt: '2026-07-30', flags: 'ACC-07' },
	{ id: 'ALR-03', title: 'Circular transfers between nominees', severity: 'medium', raisedAt: '2026-08-14', flags: 'ACC-11' },
	{ id: 'ALR-04', title: 'Unexpected counterparty concentration', severity: 'low', raisedAt: '2026-08-16', flags: 'ACC-09' },
	{ id: 'ALR-05', title: 'Structuring pattern below threshold', severity: 'high', raisedAt: '2026-08-18', flags: 'ACC-05' }
];

const DOCUMENTS: CorpusDocument[] = [
	{
		id: 'fin-monitoring-policy',
		title: 'Transaction monitoring policy',
		text: `# Transaction monitoring policy

Monitoring runs on patterns across accounts, not on single payments. A payment that looks
ordinary in isolation can be the middle leg of a pattern that is not.

## Enhanced monitoring

An account is placed under enhanced monitoring when two or more alerts are open against it
at the same time, or when a single critical alert is raised. Enhanced monitoring reviews
counterparties as well as the account itself.

## Pass-through indicators

Funds arriving from several counterparties and leaving as one larger payment shortly after
is a pass-through indicator. The indicator is about the shape of the flow, so it cannot be
evaluated from one transaction record.`
	},
	{
		id: 'fin-network-analysis',
		title: 'Network analysis guidance',
		text: `# Network analysis guidance

Two structural questions are asked of every reviewed network: where does value
concentrate, and which groups have no connection to the rest.

## Concentration

Concentration is measured over the whole network rather than by counting a single
account's incoming payments, because an account can be central through its counterparties
without receiving the most itself.

## Closed groups

A set of accounts transacting only with each other and with no link to the wider network
is a closed group. Closed groups are reported whatever their transaction volume, because
isolation is itself the finding.`
	},
	{
		id: 'fin-account-freezing',
		title: 'Account freezing procedure',
		text: `# Account freezing procedure

Before an account is frozen, the review identifies counterparties that transact with it
and nothing else. Freezing an account that is another party's only counterparty stops that
party's payments entirely, which is a decision to take deliberately rather than discover
afterwards.

## Notification

Counterparties left without an active route are notified in the same working day. The
notification names the frozen account only where disclosure rules permit.`
	}
];

export const FINANCE_SCHEMA: GraphSchema = {
	domain: 'finance',
	description:
		'Payments monitoring: accounts are held at institutions, transfers move value between accounts, and alerts are raised against accounts.',
	nodeTypes: [
		{ name: 'Account', description: 'A payment account with a holder and a type.' },
		{ name: 'Institution', description: 'A bank or e-money firm holding accounts.' },
		{ name: 'Transfer', description: 'One settled payment between two accounts.' },
		{ name: 'Alert', description: 'A monitoring alert raised against an account, with a severity.' },
		DOC_SECTION_TYPE
	],
	edgeTypes: [
		{ name: 'HELD_AT', from: 'Account', to: 'Institution', description: 'Account is held at this institution.' },
		{ name: 'PAID_FROM', from: 'Transfer', to: 'Account', description: 'Transfer debited this account.' },
		{ name: 'PAID_TO', from: 'Transfer', to: 'Account', description: 'Transfer credited this account.' },
		{ name: 'FLAGS', from: 'Alert', to: 'Account', description: 'Alert was raised against this account.' },
		{
			name: 'COUNTERPARTY_OF',
			from: 'Account',
			to: 'Account',
			description: 'The two accounts have transacted, in either direction.'
		},
		DOC_ADJACENCY_EDGE
	]
};

export function buildFinanceDataset(): DomainDataset {
	const nodes: GraphNode[] = [
		...entities('Institution', 'institution', INSTITUTIONS, (row) => ({
			label: row.name,
			attrs: { name: row.name, country: row.country, licence: row.licence },
			text: `Institution ${row.id} ${row.name} in ${row.country}, ${row.licence} licence.`
		})),
		...entities('Account', 'account', ACCOUNTS, (row) => ({
			label: row.holder,
			attrs: { name: row.holder, institution: row.institution, accountType: row.accountType, openedAt: row.openedAt },
			text: `Account ${row.id} held by ${row.holder} at ${row.institution}, ${row.accountType} account, opened ${row.openedAt}.`
		})),
		...entities('Transfer', 'transfer', TRANSFERS, (row) => ({
			label: row.id,
			attrs: { from: row.from, to: row.to, amount: row.amount, currency: row.currency, settledAt: row.settledAt },
			text: `Transfer ${row.id}: ${row.amount} ${row.currency} from ${row.from} to ${row.to}, settled ${row.settledAt}.`
		})),
		...entities('Alert', 'alert', ALERTS, (row) => ({
			label: row.title,
			attrs: { title: row.title, severity: row.severity, raisedAt: row.raisedAt, flags: row.flags },
			text: `Alert ${row.id} ${row.title}, severity ${row.severity}, raised ${row.raisedAt} against account ${row.flags}.`
		}))
	];

	const edges: GraphEdge[] = [
		...relations(
			'HELD_AT',
			ACCOUNTS.map((row) => ({ from: nid('account', row.id), to: nid('institution', row.institution), validFrom: row.openedAt }))
		),
		...relations(
			'PAID_FROM',
			TRANSFERS.map((row) => ({ from: nid('transfer', row.id), to: nid('account', row.from), validFrom: row.settledAt }))
		),
		...relations(
			'PAID_TO',
			TRANSFERS.map((row) => ({ from: nid('transfer', row.id), to: nid('account', row.to), validFrom: row.settledAt }))
		),
		...relations(
			'FLAGS',
			ALERTS.map((row) => ({ from: nid('alert', row.id), to: nid('account', row.flags), validFrom: row.raisedAt, weight: 1 }))
		),
		...relations(
			'COUNTERPARTY_OF',
			TRANSFERS.flatMap((row) => [
				{ from: nid('account', row.from), to: nid('account', row.to), validFrom: row.settledAt },
				{ from: nid('account', row.to), to: nid('account', row.from), validFrom: row.settledAt }
			])
		)
	];

	const docs = documentNodes(DOCUMENTS);
	nodes.push(...docs.nodes);
	edges.push(...docs.edges);

	return { schema: FINANCE_SCHEMA, nodes, edges, documents: DOCUMENTS };
}

export const FINANCE_AS_OF = '2026-08-20';
