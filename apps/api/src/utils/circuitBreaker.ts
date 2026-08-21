import { logEvent, logger } from './logger.js';

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
		const readyToProbeAgain = Date.now() - this.openedAt >= this.resetMs;
		return !readyToProbeAgain;
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
