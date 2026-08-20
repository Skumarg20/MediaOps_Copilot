import { decidePin, extractAnchors } from './rules.js';

export const routingService = {
	extractAnchors,
	decidePin
};

export type { PinCode, PinDecision, PinInput } from './rules.js';
