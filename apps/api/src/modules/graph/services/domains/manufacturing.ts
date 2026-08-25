import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';
import { DOC_ADJACENCY_EDGE, DOC_SECTION_TYPE, documentNodes, entities, nid, relations } from './builder.js';


const PLANTS = [
	{ id: 'PLT-01', name: 'Coimbatore Works', region: 'IN', shifts: 3 },
	{ id: 'PLT-02', name: 'Pune Fabrication', region: 'IN', shifts: 2 },
	{ id: 'PLT-03', name: 'Rayong Assembly', region: 'TH', shifts: 3 }
];

const LINES = [
	{ id: 'LN-01', name: 'Housing Line A', plant: 'PLT-01', taktSeconds: 42 },
	{ id: 'LN-02', name: 'Housing Line B', plant: 'PLT-01', taktSeconds: 45 },
	{ id: 'LN-03', name: 'Board Assembly', plant: 'PLT-02', taktSeconds: 28 },
	{ id: 'LN-04', name: 'Final Assembly', plant: 'PLT-03', taktSeconds: 61 },
	{ id: 'LN-05', name: 'Coating Cell', plant: 'PLT-02', taktSeconds: 90 },
	{ id: 'LN-06', name: 'Packaging Line', plant: 'PLT-03', taktSeconds: 18 }
];

const MACHINES = [
	{ id: 'MCH-01', name: 'Injection Press 1', machineType: 'press', installedOn: ['LN-01'], commissioned: '2023-04-11' },
	{ id: 'MCH-02', name: 'Injection Press 2', machineType: 'press', installedOn: ['LN-01', 'LN-02'], commissioned: '2023-04-11' },
	{ id: 'MCH-03', name: 'CNC Mill 1', machineType: 'mill', installedOn: ['LN-02'], commissioned: '2022-09-30' },
	{ id: 'MCH-04', name: 'Pick and Place 1', machineType: 'smt', installedOn: ['LN-03'], commissioned: '2024-01-15' },
	{ id: 'MCH-05', name: 'Reflow Oven', machineType: 'smt', installedOn: ['LN-03'], commissioned: '2024-01-15' },
	{ id: 'MCH-06', name: 'Torque Station', machineType: 'assembly', installedOn: ['LN-04'], commissioned: '2023-11-02' },
	{ id: 'MCH-07', name: 'Vision Inspector', machineType: 'inspection', installedOn: ['LN-04', 'LN-06'], commissioned: '2024-06-20' },
	{ id: 'MCH-08', name: 'Label Applicator', machineType: 'packaging', installedOn: ['LN-06'], commissioned: '2023-02-08' },
	{ id: 'MCH-09', name: 'Powder Coat Booth', machineType: 'coating', installedOn: ['LN-05'], commissioned: '2022-05-17' },
	{ id: 'MCH-10', name: 'Leak Tester', machineType: 'inspection', installedOn: ['LN-01', 'LN-04'], commissioned: '2025-02-11' }
];

const MATERIALS = [
	{ id: 'MAT-01', name: 'ABS pellets', materialType: 'polymer', consumedBy: ['LN-01', 'LN-02'] },
	{ id: 'MAT-02', name: 'aluminium billet', materialType: 'metal', consumedBy: ['LN-02'] },
	{ id: 'MAT-03', name: 'solder paste', materialType: 'consumable', consumedBy: ['LN-03'] },
	{ id: 'MAT-04', name: 'PCB blanks', materialType: 'electronic', consumedBy: ['LN-03'] },
	{ id: 'MAT-05', name: 'fastener kit', materialType: 'hardware', consumedBy: ['LN-04'] },
	{ id: 'MAT-06', name: 'epoxy powder', materialType: 'coating', consumedBy: ['LN-05'] },
	{ id: 'MAT-07', name: 'carton stock', materialType: 'packaging', consumedBy: ['LN-06'] },
	{ id: 'MAT-08', name: 'recycled ABS pellets', materialType: 'polymer', consumedBy: [] }
];

const OPERATORS = [
	{ id: 'OP-01', name: 'A. Mehta', certification: 'press', shift: 'day' },
	{ id: 'OP-02', name: 'R. Kulkarni', certification: 'smt', shift: 'day' },
	{ id: 'OP-03', name: 'S. Boonmee', certification: 'assembly', shift: 'night' },
	{ id: 'OP-04', name: 'L. Fernandes', certification: 'coating', shift: 'day' },
	{ id: 'OP-05', name: 'D. Iyer', certification: 'inspection', shift: 'night' },
	{ id: 'OP-06', name: 'P. Nair', certification: 'packaging', shift: 'day' }
];

const WORK_ORDERS = [
	{ id: 'WO-1001', line: 'LN-01', operator: 'OP-01', quantity: 1200, startedAt: '2026-07-06', batch: 'BAT-01' },
	{ id: 'WO-1002', line: 'LN-01', operator: 'OP-01', quantity: 1150, startedAt: '2026-07-09', batch: 'BAT-02' },
	{ id: 'WO-1003', line: 'LN-02', operator: 'OP-01', quantity: 800, startedAt: '2026-07-13', batch: 'BAT-03' },
	{ id: 'WO-1004', line: 'LN-03', operator: 'OP-02', quantity: 2400, startedAt: '2026-07-16', batch: 'BAT-04' },
	{ id: 'WO-1005', line: 'LN-03', operator: 'OP-02', quantity: 2600, startedAt: '2026-07-20', batch: 'BAT-05' },
	{ id: 'WO-1006', line: 'LN-04', operator: 'OP-03', quantity: 640, startedAt: '2026-07-24', batch: 'BAT-06' },
	{ id: 'WO-1007', line: 'LN-04', operator: 'OP-03', quantity: 700, startedAt: '2026-07-28', batch: 'BAT-07' },
	{ id: 'WO-1008', line: 'LN-05', operator: 'OP-04', quantity: 480, startedAt: '2026-08-01', batch: 'BAT-08' },
	{ id: 'WO-1009', line: 'LN-06', operator: 'OP-06', quantity: 3000, startedAt: '2026-08-04', batch: 'BAT-09' },
	{ id: 'WO-1010', line: 'LN-01', operator: 'OP-01', quantity: 1300, startedAt: '2026-08-07', batch: 'BAT-10' },
	{ id: 'WO-1011', line: 'LN-04', operator: 'OP-05', quantity: 610, startedAt: '2026-08-11', batch: 'BAT-11' },
	{ id: 'WO-1012', line: 'LN-03', operator: 'OP-02', quantity: 2200, startedAt: '2026-08-14', batch: 'BAT-12' }
];

const DEFECTS = [
	{ id: 'DEF-01', title: 'Flash on parting line', severity: 'low', foundIn: 'BAT-01', raisedAt: '2026-07-07' },
	{ id: 'DEF-02', title: 'Solder bridge', severity: 'high', foundIn: 'BAT-04', raisedAt: '2026-07-17' },
	{ id: 'DEF-03', title: 'Torque out of spec', severity: 'critical', foundIn: 'BAT-06', raisedAt: '2026-07-25' },
	{ id: 'DEF-04', title: 'Missing fastener', severity: 'high', foundIn: 'BAT-07', raisedAt: '2026-07-29' },
	{ id: 'DEF-05', title: 'Orange peel finish', severity: 'medium', foundIn: 'BAT-08', raisedAt: '2026-08-02' },
	{ id: 'DEF-06', title: 'Label misregistration', severity: 'low', foundIn: 'BAT-09', raisedAt: '2026-08-05' },
	{ id: 'DEF-07', title: 'Cold solder joint', severity: 'high', foundIn: 'BAT-12', raisedAt: '2026-08-15' },
	{ id: 'DEF-08', title: 'Seal seat scored', severity: 'medium', foundIn: 'BAT-11', raisedAt: '2026-08-12' },
	{ id: 'DEF-09', title: 'Torque tool drift', severity: 'critical', foundIn: 'BAT-11', raisedAt: '2026-08-13' }
];

const DOCUMENTS: CorpusDocument[] = [
	{
		id: 'mfg-containment-runbook',
		title: 'Line containment runbook',
		text: `# Line containment runbook

A line goes on containment when a critical defect is confirmed on a batch it produced, or
when two high-severity defects are confirmed inside one rolling week. Containment holds
every batch from that line pending sort.

## Sorting and release

Sorting works backwards from the affected batch to the work orders that produced it, then
to the machines that ran them. A line is released only after the contributing machine has
been re-qualified, not merely restarted.

## Escalation

A critical defect on final assembly escalates to the plant manager the same shift. A low
severity defect is logged for the weekly quality review and does not stop the line.`
	},
	{
		id: 'mfg-machine-maintenance',
		title: 'Machine maintenance policy',
		text: `# Machine maintenance policy

Machines are maintained on running hours, not calendar dates. A machine installed on more
than one line accrues hours from both, and its interval shortens accordingly.

## Single-machine cells

A cell with one machine has no capacity to absorb a stoppage: taking that machine out of
service stops the cell outright. Those cells are listed in the continuity register and
carry a standing spares commitment.

## Re-qualification

After any intervention that touches the process envelope, the machine is re-qualified with
a short run before production resumes. A restart is not a re-qualification.`
	},
	{
		id: 'mfg-material-approval',
		title: 'Material approval',
		text: `# Material approval

A material is approved per process, not per plant. Approval permits use; it does not
schedule it, so an approved material may sit unused until a line is qualified to draw it.

## Substitutions

Substituting an approved material for another still requires a first-article inspection on
the receiving line. Recycled feedstock is treated as a distinct material, not a
substitution of the virgin grade.`
	}
];

export const MANUFACTURING_SCHEMA: GraphSchema = {
	domain: 'manufacturing',
	description:
		'Product manufacturing: plants own lines, machines are installed on lines, lines consume materials, work orders run on lines and produce batches, and defects are found in batches.',
	nodeTypes: [
		{ name: 'Plant', description: 'A manufacturing site.' },
		{ name: 'Line', description: 'A production line or cell within a plant.' },
		{ name: 'Machine', description: 'Equipment installed on one or more lines.' },
		{ name: 'Material', description: 'An approved input consumed by lines.' },
		{ name: 'WorkOrder', description: 'A scheduled production run on a line.' },
		{ name: 'Batch', description: 'The output of one work order.' },
		{ name: 'Defect', description: 'A quality defect found in a batch, with a severity.' },
		{ name: 'Operator', description: 'A certified operator staffing work orders.' },
		DOC_SECTION_TYPE
	],
	edgeTypes: [
		{ name: 'IN_PLANT', from: 'Line', to: 'Plant', description: 'Line belongs to this plant.' },
		{ name: 'INSTALLED_ON', from: 'Machine', to: 'Line', description: 'Machine is installed on this line.' },
		{ name: 'CONSUMED_BY', from: 'Material', to: 'Line', description: 'Material is drawn by this line.' },
		{ name: 'RUNS_ON', from: 'WorkOrder', to: 'Line', description: 'Work order is scheduled on this line.' },
		{ name: 'STAFFED_BY', from: 'WorkOrder', to: 'Operator', description: 'Work order was staffed by this operator.' },
		{ name: 'PRODUCED', from: 'WorkOrder', to: 'Batch', description: 'Work order produced this batch.' },
		{ name: 'FOUND_IN', from: 'Defect', to: 'Batch', description: 'Defect was found in this batch.' },
		DOC_ADJACENCY_EDGE
	]
};

export function buildManufacturingDataset(): DomainDataset {
	const nodes: GraphNode[] = [
		...entities('Plant', 'plant', PLANTS, (row) => ({
			label: row.name,
			attrs: { name: row.name, region: row.region, shifts: row.shifts },
			text: `Plant ${row.id} ${row.name} in ${row.region}, running ${row.shifts} shifts.`
		})),
		...entities('Line', 'line', LINES, (row) => ({
			label: row.name,
			attrs: { name: row.name, plant: row.plant, taktSeconds: row.taktSeconds },
			text: `Line ${row.id} ${row.name} in plant ${row.plant}, takt time ${row.taktSeconds} seconds.`
		})),
		...entities('Machine', 'machine', MACHINES, (row) => ({
			label: row.name,
			attrs: {
				name: row.name,
				machineType: row.machineType,
				commissioned: row.commissioned,
				lineCount: row.installedOn.length
			},
			text: `Machine ${row.id} ${row.name}, type ${row.machineType}, commissioned ${row.commissioned}, installed on ${row.installedOn.join(', ') || 'no line'}.`
		})),
		...entities('Material', 'material', MATERIALS, (row) => ({
			label: row.name,
			attrs: { name: row.name, materialType: row.materialType, lineCount: row.consumedBy.length },
			text: `Material ${row.id} ${row.name}, type ${row.materialType}, drawn by ${row.consumedBy.join(', ') || 'no line'}.`
		})),
		...entities('WorkOrder', 'workOrder', WORK_ORDERS, (row) => ({
			label: row.id,
			attrs: { line: row.line, operator: row.operator, quantity: row.quantity, startedAt: row.startedAt, batch: row.batch },
			text: `Work order ${row.id} ran on line ${row.line} from ${row.startedAt}, quantity ${row.quantity}, staffed by ${row.operator}, producing batch ${row.batch}.`
		})),
		...entities(
			'Batch',
			'batch',
			WORK_ORDERS.map((order) => ({ id: order.batch, order: order.id, quantity: order.quantity, producedAt: order.startedAt })),
			(row) => ({
				label: row.id,
				attrs: { workOrder: row.order, quantity: row.quantity, producedAt: row.producedAt },
				text: `Batch ${row.id} of ${row.quantity} units, produced by work order ${row.order} on ${row.producedAt}.`
			})
		),
		...entities('Defect', 'defect', DEFECTS, (row) => ({
			label: row.title,
			attrs: { title: row.title, severity: row.severity, foundIn: row.foundIn, raisedAt: row.raisedAt },
			text: `Defect ${row.id} ${row.title}, severity ${row.severity}, raised ${row.raisedAt} against batch ${row.foundIn}.`
		})),
		...entities('Operator', 'operator', OPERATORS, (row) => ({
			label: row.name,
			attrs: { name: row.name, certification: row.certification, shift: row.shift },
			text: `Operator ${row.id} ${row.name}, certified for ${row.certification}, ${row.shift} shift.`
		}))
	];

	const edges: GraphEdge[] = [
		...relations(
			'IN_PLANT',
			LINES.map((line) => ({ from: nid('line', line.id), to: nid('plant', line.plant), validFrom: '2022-01-01' }))
		),
		...relations(
			'INSTALLED_ON',
			MACHINES.flatMap((machine) =>
				machine.installedOn.map((line) => ({
					from: nid('machine', machine.id),
					to: nid('line', line),
					validFrom: machine.commissioned
				}))
			)
		),
		...relations(
			'CONSUMED_BY',
			MATERIALS.flatMap((material) =>
				material.consumedBy.map((line) => ({ from: nid('material', material.id), to: nid('line', line), validFrom: '2022-01-01' }))
			)
		),
		...relations(
			'RUNS_ON',
			WORK_ORDERS.map((order) => ({ from: nid('workOrder', order.id), to: nid('line', order.line), validFrom: order.startedAt }))
		),
		...relations(
			'STAFFED_BY',
			WORK_ORDERS.map((order) => ({ from: nid('workOrder', order.id), to: nid('operator', order.operator), validFrom: order.startedAt }))
		),
		...relations(
			'PRODUCED',
			WORK_ORDERS.map((order) => ({ from: nid('workOrder', order.id), to: nid('batch', order.batch), validFrom: order.startedAt }))
		),
		...relations(
			'FOUND_IN',
			DEFECTS.map((defect) => ({ from: nid('defect', defect.id), to: nid('batch', defect.foundIn), validFrom: defect.raisedAt, weight: 1 }))
		)
	];

	const docs = documentNodes(DOCUMENTS);
	nodes.push(...docs.nodes);
	edges.push(...docs.edges);

	return { schema: MANUFACTURING_SCHEMA, nodes, edges, documents: DOCUMENTS };
}

export const MANUFACTURING_AS_OF = '2026-08-20';
