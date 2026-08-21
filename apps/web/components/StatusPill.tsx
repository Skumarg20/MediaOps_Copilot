'use client';

import useSWR from 'swr';
import { fetchHealth, swrKeys } from '@/lib/api-client';
import type { HealthResponse } from '@/lib/types';

const TONE = {
  ok: 'border-signal-ok/50 bg-signal-ok/10 text-signal-ok',
  degraded: 'border-signal-warn/50 bg-signal-warn/10 text-signal-warn',
  down: 'border-signal-bad/50 bg-signal-bad/10 text-signal-bad',
  unknown: 'border-ink-600 text-ink-400',
} as const;

export function StatusPill() {
  const { data, error } = useSWR<HealthResponse>(swrKeys.health, fetchHealth, {
    refreshInterval: 8000,
    keepPreviousData: true,
  });

  if (error || !data) {
    return (
      <span className={`rounded-full border px-3 py-1 text-xs ${TONE.unknown}`}>
        API unreachable
      </span>
    );
  }

  const failing = Object.values(data.checks).filter((c) => c.status !== 'up');
  const label =
    data.status === 'ok'
      ? 'All dependencies up'
      : failing.map((c) => c.name).join(', ');

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs ${TONE[data.status]}`}
      title={failing.map((c) => `${c.name}: ${c.detail ?? c.status}`).join('\n') || undefined}
    >
      {data.status === 'ok' ? '● ' : '▲ '}
      {label}
      <span className="ml-2 text-ink-400">v{data.version}</span>
    </span>
  );
}
