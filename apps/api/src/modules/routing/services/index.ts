import { decidePin, detectStructuralIntent, extractAnchors, isProcedural } from './rules.js';

export const routingService = {
	extractAnchors,
	decidePin,
	detectStructuralIntent,
	isProcedural
};

export type { PinCode, PinDecision, PinInput, StructuralIntent } from './rules.js';
