import { FakeLlmAdapter } from '@/connections/llmFake.js';

export const FABRICATED_CITATION = 'errorCode:FABRICATED_BY_MODEL';

export function createAdversarialLlm(): FakeLlmAdapter {
	return new FakeLlmAdapter({
		scripted: () =>
			[
				'Thought: I recognise this pattern and can answer from memory.',
				'Action: final_answer',
				'Answer: This condition normally clears on its own once upstream capacity recovers, so no operator intervention is usually required.',
				`Citations: ${FABRICATED_CITATION}`
			].join('\n')
	});
}
