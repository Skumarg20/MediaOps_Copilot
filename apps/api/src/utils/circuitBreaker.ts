import { logEvent, logger } from './logger.js';

/**
 * Trips after N consecutive failures and stays open for a cooldown, so a dead
 * dependency costs one timeout rather than one timeout per request. Half-opens
 * on the first call after the cooldown.
 *
 * This matters *more* with a hosted provider than with a local one: a rate-limit
 * wall or a provider incident is exactly the sustained failure that would
 * otherwise turn every query into a 30-second wait before degrading.
 */
export class CircuitBreaker {
	private failures = 0;
	private openedAt = 0;

	constructor(
		private readonly name: string,
		private readonly threshold: number,
		private readonly resetMs: number
	) {}

	get isOpen(): boolean {
		if (this.failures < this.threshold) return false;
		if (Date.now() - this.openedAt >= this.resetMs) return false; // half-open
		return true;
	}

	recordSuccess(): void {
		if (this.failures >= this.threshold) {
			logEvent(logger, 'info', 'dep.circuit_closed', { dependency: this.name });
		}
		this.failures = 0;
		this.openedAt = 0;
	}

	recordFailure(): void {
		this.failures += 1;
		if (this.failures === this.threshold) {
			this.openedAt = Date.now();
			logEvent(logger, 'warn', 'dep.circuit_open', {
				dependency: this.name,
				failures: this.failures,
				reset_ms: this.resetMs
			});
		} else if (this.failures > this.threshold) {
			this.openedAt = Date.now();
		}
	}
}
