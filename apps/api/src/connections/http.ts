import { LlmUnavailableError } from './llm.types.js';


export async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
	try {
		const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) {
			throw new LlmUnavailableError(`${url} responded ${res.status}`);
		}
		return (await res.json()) as T;
	} catch (err) {
		if (err instanceof LlmUnavailableError) throw err;
		const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
		throw new LlmUnavailableError(timedOut ? `${url} timed out after ${timeoutMs}ms` : `${url} unreachable`, err);
	}
}

export function ttlCache<T>(load: () => Promise<T>, ttlMs: number): () => Promise<T> {
	let entry: { at: number; value: Promise<T> } | null = null;

	return () => {
		const now = Date.now();
		if (entry && now - entry.at < ttlMs) return entry.value;

		const value = load().catch((err: unknown) => {
			entry = null;
			throw err;
		});
		entry = { at: now, value };
		return value;
	};
}
