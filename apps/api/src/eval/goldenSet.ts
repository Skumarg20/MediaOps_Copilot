import type { RetrievalPath } from '@/types.js';

export type ExpectedPath = RetrievalPath | 'any';

export interface GoldenCase {
	id: string;
	query: string;
	expectedPath: ExpectedPath;
	shouldAnswer: boolean;
	mustCite?: string[];
	note: string;
}

export const GOLDEN_SET: GoldenCase[] = [
	{
		id: 'code-render-timeout',
		query: 'what does error code RENDER_TIMEOUT mean',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:RENDER_TIMEOUT'],
		note: 'Glossary key resolves exactly; embeddings can only lose here.'
	},
	{
		id: 'code-render-stalled',
		query: 'what does RENDER_STALLED mean',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:RENDER_STALLED'],
		note: 'Exact glossary hit.'
	},
	{
		id: 'code-upload-timeout',
		query: 'explain UPLOAD_TIMEOUT',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:UPLOAD_TIMEOUT'],
		note: 'Exact glossary hit with a verb the vector path would happily match instead.'
	},
	{
		id: 'code-asset-codec',
		query: 'what is ASSET_UNSUPPORTED_CODEC',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:ASSET_UNSUPPORTED_CODEC'],
		note: 'Exact glossary hit.'
	},
	{
		id: 'code-worker-evicted',
		query: 'what does WORKER_EVICTED mean',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:WORKER_EVICTED'],
		note: 'Exact glossary hit.'
	},
	{
		id: 'code-queue-shed',
		query: 'what is QUEUE_SHED_DEFERRED',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:QUEUE_SHED_DEFERRED'],
		note: 'Exact glossary hit.'
	},
	{
		id: 'code-storage-backpressure',
		query: 'define STORAGE_BACKPRESSURE',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:STORAGE_BACKPRESSURE'],
		note: 'Exact glossary hit.'
	},
	{
		id: 'code-font-missing',
		query: 'what does FONT_MISSING mean',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['errorCode:FONT_MISSING'],
		note: 'Exact glossary hit.'
	},

	{
		id: 'job-482-why-failed',
		query: 'why did job 482 fail',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:482'],
		note: 'Record retrieval, then the failure reason is followed into the glossary.'
	},
	{
		id: 'job-485-what-happened',
		query: 'what happened to job 485',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:485'],
		note: 'Exact primary-key match.'
	},
	{
		id: 'job-487-why-failed',
		query: 'why did job 487 fail',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:487'],
		note: 'Delivery-stage failure; the record carries the reason.'
	},
	{
		id: 'job-489-status',
		query: 'status of job 489',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:489'],
		note: 'Exact primary-key match.'
	},
	{
		id: 'job-491-why-failed',
		query: 'why did job 491 fail',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:491'],
		note: 'Exact primary-key match.'
	},
	{
		id: 'job-493-what-went-wrong',
		query: 'what went wrong with job 493',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:493'],
		note: 'Exact primary-key match.'
	},
	{
		id: 'job-484-succeeded',
		query: 'did job 484 succeed',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:484'],
		note: 'A successful job is still a record lookup.'
	},
	{
		id: 'job-486-rendering',
		query: 'is job 486 still running',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:486'],
		note: 'In-flight job; status is a field, not a narrative.'
	},

	{
		id: 'job-code-482',
		query: 'did job 482 fail with RENDER_TIMEOUT',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:482'],
		note: 'Both anchors resolve; the fact anchors the answer.'
	},
	{
		id: 'job-code-487',
		query: 'is job 487 an UPLOAD_TIMEOUT',
		expectedPath: 'vectorless',
		shouldAnswer: true,
		mustCite: ['job:487'],
		note: 'Both anchors resolve.'
	},

	{
		id: 'open-slow-render',
		query: 'why is my render slower than usual',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Answer is distributed across the performance runbook, not held in a field.'
	},
	{
		id: 'open-retry-stuck-job',
		query: 'how do I safely retry a stuck job',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Procedural guidance spread across prose.'
	},
	{
		id: 'open-drain-vs-retry',
		query: 'when should I drain a worker instead of retrying',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Judgement question; the runbook explains the trade-off.'
	},
	{
		id: 'open-queue-shedding',
		query: 'what happens when the queue sheds load',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Lifecycle behaviour described in prose.'
	},
	{
		id: 'open-scheduler-assignment',
		query: 'how does the scheduler assign jobs to workers',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Architecture question.'
	},
	{
		id: 'open-escalation',
		query: 'when should I escalate to on-call',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Escalation runbook.'
	},
	{
		id: 'open-delivery-failure',
		query: 'why would frames finish rendering but not get delivered',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Storage and delivery runbook; deliberately avoids naming the error code.'
	},
	{
		id: 'open-watchdog',
		query: 'what does the watchdog do to jobs that stop reporting progress',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Timeout runbook, phrased without the code.'
	},
	{
		id: 'open-scratch-retention',
		query: 'how long do rendered frames stay in scratch storage',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Specific fact that lives inside prose rather than a column.'
	},
	{
		id: 'open-lifecycle-states',
		query: 'what are the job lifecycle states',
		expectedPath: 'vector',
		shouldAnswer: true,
		note: 'Lifecycle runbook.'
	},

	{
		id: 'ood-gibberish',
		query: 'zxqv plorbnat wibble frotz',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Nothing should clear any floor.'
	},
	{
		id: 'ood-capital-france',
		query: 'what is the capital of France',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Well-formed, entirely out of domain — the case a general model answers confidently.'
	},
	{
		id: 'ood-sourdough',
		query: 'how do I bake sourdough bread',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Out of domain but shares the "how do I" shape of a real question.'
	},
	{
		id: 'ood-keyboard-mash',
		query: 'asdfghjkl qwerty',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Degenerate input.'
	},
	{
		id: 'ood-world-cup',
		query: 'who won the world cup in 1998',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Out of domain, contains a number that must not be read as a job id.'
	},
	{
		id: 'ood-poem',
		query: 'write me a poem about rendering',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Shares domain vocabulary with no answerable content — the hardest abstention.'
	},
	{
		id: 'ood-translate',
		query: 'translate hello into Japanese',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Out of domain.'
	},
	{
		id: 'ood-swallow',
		query: 'what is the airspeed velocity of an unladen swallow',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'Out of domain.'
	},

	{
		id: 'unknown-job-999',
		query: 'why did job 999 fail',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'In-domain shape, no such record. Answering means citing the wrong job.'
	},
	{
		id: 'unknown-code',
		query: 'what does error code TOTALLY_MADE_UP mean',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'In-domain shape, no such key.'
	},
	{
		id: 'unknown-job-budget',
		query: 'what is the render budget for job 10000',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'No such record; the number must not anchor.'
	},
	{
		id: 'unknown-submitter',
		query: 'who submitted job 777',
		expectedPath: 'any',
		shouldAnswer: false,
		note: 'No such record.'
	}
];
