
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_NAMES, classifierService } from '@/modules/classifier/index.js';
import type { TriageClass } from '@/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../ml/synthetic_dataset.csv');

const JOB_IDS = ['482', '483', '484', '485', '486', '487', '488', '489', '490', '491', '492', '493'];
const ERROR_CODES = [
  'RENDER_TIMEOUT',
  'RENDER_STALLED',
  'UPLOAD_TIMEOUT',
  'ASSET_UNSUPPORTED_CODEC',
  'WORKER_EVICTED',
  'QUEUE_SHED_DEFERRED',
  'STORAGE_BACKPRESSURE',
  'FONT_MISSING',
];
const WORKERS = ['worker-02', 'worker-03', 'worker-07', 'worker-09', 'worker-11'];

type Template = {
  render: (slots: Slots) => string;
  label: TriageClass;
  uses: Array<'job' | 'code' | 'worker'>;
};

type Slots = { job: string; code: string; worker: string };

const WRAPPERS: Record<TriageClass, Array<(q: string) => string>> = {
  simple_lookup: [
    (q) => q,
    (q) => `${q}?`,
    (q) => `quick question - ${q}`,
    (q) => `can you tell me ${q}`,
    (q) => `${q} for the 4k class`,
    (q) => `looking up ${q}`,
    (q) => `${q} please`,
    (q) => `remind me ${q}`,
    (q) => `${q} in the glossary`,
  ],
  complex_diagnostic: [
    (q) => q,
    (q) => `${q}?`,
    (q) => `${q} - trying to work out the root cause`,
    (q) => `a submitter is asking ${q}`,
    (q) => `${q} and what should I check first`,
    (q) => `I've been asked ${q}`,
    (q) => `${q} - the dashboard is not conclusive`,
    (q) => `${q} on the 4k queue specifically`,
    (q) => `${q} before I escalate`,
  ],
  urgent_incident: [
    (q) => q,
    (q) => `${q}!`,
    (q) => `${q} - escalating now`,
    (q) => `${q}, need an answer immediately`,
    (q) => `on call here - ${q}`,
    (q) => `${q} and the pager is going off`,
    (q) => `${q}, this is customer facing`,
    (q) => `${q} - who do I page`,
    (q) => `${q} (second time today)`,
  ],
};

const TEMPLATES: Template[] = [
  { label: 'simple_lookup', uses: ['code'], render: (s) => `what does error code ${s.code} mean` },
  { label: 'simple_lookup', uses: ['code'], render: (s) => `define ${s.code}` },
  { label: 'simple_lookup', uses: ['code'], render: (s) => `${s.code}` },
  { label: 'simple_lookup', uses: ['code'], render: (s) => `meaning of ${s.code}` },
  { label: 'simple_lookup', uses: ['code'], render: (s) => `what is the severity of ${s.code}` },
  { label: 'simple_lookup', uses: ['job'], render: (s) => `status of job ${s.job}` },
  { label: 'simple_lookup', uses: ['job'], render: (s) => `what is job #${s.job} doing` },
  { label: 'simple_lookup', uses: ['job'], render: (s) => `job ${s.job} status` },
  { label: 'simple_lookup', uses: ['job'], render: (s) => `which worker ran job ${s.job}` },
  { label: 'simple_lookup', uses: ['job'], render: (s) => `how long did job ${s.job} take` },
  { label: 'simple_lookup', uses: [], render: () => `what is the queue depth limit` },
  { label: 'simple_lookup', uses: [], render: () => `render timeout budget for 4k jobs` },
  { label: 'simple_lookup', uses: [], render: () => `what are the priority tiers` },
  { label: 'simple_lookup', uses: [], render: () => `heartbeat interval` },
  { label: 'simple_lookup', uses: [], render: () => `max retry attempts` },

  { label: 'complex_diagnostic', uses: [], render: () => `why is my render slower than usual` },
  { label: 'complex_diagnostic', uses: [], render: () => `how do I safely retry a stuck job` },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `why are renders taking longer after the deploy`,
  },
  {
    label: 'complex_diagnostic',
    uses: ['job'],
    render: (s) => `why did job ${s.job} fail and how should I handle it`,
  },
  {
    label: 'complex_diagnostic',
    uses: ['code'],
    render: (s) => `why do we keep seeing ${s.code} and what should I do about it`,
  },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `how do I tell whether a slowdown is queue wait or render duration`,
  },
  {
    label: 'complex_diagnostic',
    uses: ['worker'],
    render: (s) => `should I drain ${s.worker} or retry the jobs on it`,
  },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `what is the difference between a stalled render and a timeout`,
  },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `how does the scheduler decide which worker gets a job`,
  },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `why would two workers process the same job`,
  },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `how do I know if a failure is transient or deterministic`,
  },
  {
    label: 'complex_diagnostic',
    uses: [],
    render: () => `what happens to partial output when a render fails midway`,
  },

  {
    label: 'urgent_incident',
    uses: [],
    render: () => `production down all jobs are stuck in rendering right now`,
  },
  {
    label: 'urgent_incident',
    uses: [],
    render: () => `p1 every job is failing customers are blocked`,
  },
  {
    label: 'urgent_incident',
    uses: ['code'],
    render: (s) => `urgent the whole fleet is throwing ${s.code} asap`,
  },
  {
    label: 'urgent_incident',
    uses: [],
    render: () => `sev1 outage nothing is rendering and the queue is backing up`,
  },
  {
    label: 'urgent_incident',
    uses: ['worker'],
    render: (s) => `critical ${s.worker} is stuck and all jobs on it are blocked`,
  },
  {
    label: 'urgent_incident',
    uses: [],
    render: () => `all jobs stuck queue depth climbing urgent need help now`,
  },
  {
    label: 'urgent_incident',
    uses: ['job'],
    render: (s) => `p1 job ${s.job} is stuck and customers are waiting right now`,
  },
  {
    label: 'urgent_incident',
    uses: [],
    render: () => `outage everything is deferred and nothing is being admitted`,
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type JobFixture = { failure_reason: string | null; status: string };
const jobs = JSON.parse(
  fs.readFileSync(path.resolve(here, '../modules/platform/data/jobs.json'), 'utf8'),
) as JobFixture[];

function incidentMatchCount(query: string): number {
  const upper = query.toUpperCase();
  return jobs.filter((j) => j.failure_reason && upper.includes(j.failure_reason)).length;
}

function anchorsFor(query: string): { jobIds: string[]; errorCodes: string[] } {
  const upper = query.toUpperCase();
  const errorCodes = ERROR_CODES.filter((c) => upper.includes(c));
  const jobIds = JOB_IDS.filter((id) => new RegExp(`(^|[^0-9])${id}([^0-9]|$)`).test(query));
  return { jobIds, errorCodes };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function generateDataset(): { rows: number; path: string; perClass: Record<string, number> } {
  const rand = mulberry32(20260820);
  const rows: string[] = [];
  const perClass: Record<string, number> = {};

  rows.push(['query', 'label', ...FEATURE_NAMES].join(','));

  const WRAPPER_ROTATIONS_PER_TEMPLATE = 9;
  const alreadyEmittedRowKeys = new Set<string>();

  for (let rotation = 0; rotation < WRAPPER_ROTATIONS_PER_TEMPLATE; rotation += 1) {
    for (const template of TEMPLATES) {
      const slots: Slots = {
        job: JOB_IDS[Math.floor(rand() * JOB_IDS.length)] ?? '482',
        code: ERROR_CODES[Math.floor(rand() * ERROR_CODES.length)] ?? 'RENDER_TIMEOUT',
        worker: WORKERS[Math.floor(rand() * WORKERS.length)] ?? 'worker-07',
      };
      const wrappers = WRAPPERS[template.label];
      const wrapQuery = wrappers[rotation % wrappers.length] ?? ((q: string) => q);
      const query = wrapQuery(template.render(slots));

      const key = `${query}::${template.label}`;
      if (alreadyEmittedRowKeys.has(key)) continue;
      alreadyEmittedRowKeys.add(key);

      const features = classifierService.extractFeatures(query, {
        anchors: anchorsFor(query),
        incidentMatchCount: incidentMatchCount(query),
      });
      rows.push([csvEscape(query), template.label, ...features].join(','));
      perClass[template.label] = (perClass[template.label] ?? 0) + 1;
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${rows.join('\n')}\n`, 'utf8');
  return { rows: rows.length - 1, path: OUT, perClass };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('generate-dataset')) {
  const result = generateDataset();
  process.stdout.write(
    `wrote ${result.rows} rows to ${result.path}\n${JSON.stringify(result.perClass, null, 2)}\n`,
  );
}
