'use client';

import useSWR from 'swr';
import { fetchRlStats, swrKeys } from '@/lib/api-client';
import type { ArmStat, RlStats } from '@/lib/types';

const STATE_LABEL: Record<string, string> = {
  simple_lookup: 'Simple lookup',
  complex_diagnostic: 'Complex diagnostic',
  urgent_incident: 'Urgent incident',
};

export function RLPanel() {
  const { data, error } = useSWR<RlStats>(swrKeys.rlStats, fetchRlStats, {
    refreshInterval: 4000,
    keepPreviousData: true,
  });

  if (error) {
    return (
      <p className="rounded border border-signal-bad/40 bg-signal-bad/10 px-3 py-2 text-sm text-signal-bad">
        RL stats unavailable.
      </p>
    );
  }

  if (!data) {
    return <p className="text-sm text-ink-400">Loading policy state…</p>;
  }

  const byState = new Map<string, ArmStat[]>();
  for (const arm of data.arms) {
    byState.set(arm.state, [...(byState.get(arm.state) ?? []), arm]);
  }

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          Policy state
        </h2>
        <span className="text-xs text-ink-400">{data.total_pulls} pulls</span>
      </header>

      {data.states.map((state) => {
        const arms = (byState.get(state) ?? []).sort((a, b) => b.mean_reward - a.mean_reward);
        const best = arms[0];

        return (
          <div key={state} className="rounded-md border border-ink-700 bg-ink-900/40 p-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-200">
                {STATE_LABEL[state] ?? state}
              </h3>
              <span className="text-[11px] text-ink-400">
                {arms.reduce((a, s) => a + s.pulls, 0)} pulls
              </span>
            </div>

            <ul className="mt-2 space-y-1.5">
              {arms.map((arm) => (
                <ArmBar key={arm.action} arm={arm} isBest={arm.action === best?.action} />
              ))}
            </ul>
          </div>
        );
      })}

      <RewardTrend series={data.series} />
    </section>
  );
}

/**
 * Mean reward is signed and can legitimately sit below zero, so the bar is
 * drawn from a centred origin. A bar chart that clamped at zero would hide the
 * arms that are actively bad, which is the most useful thing on this panel.
 */
function ArmBar({ arm, isBest }: { arm: ArmStat; isBest: boolean }) {
  const SCALE = 12; // rewards land roughly within ±12
  const clamped = Math.max(-SCALE, Math.min(SCALE, arm.mean_reward));
  const width = (Math.abs(clamped) / SCALE) * 50;
  const positive = clamped >= 0;

  return (
    <li className="grid grid-cols-[10.5rem_1fr_3.5rem] items-center gap-2 text-[11px]">
      <span className={`truncate font-mono ${isBest ? 'text-signal-ok' : 'text-ink-400'}`}>
        {arm.action}
      </span>

      <div className="relative h-3 rounded bg-ink-950">
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink-600" />
        <div
          className={`absolute inset-y-0 ${positive ? 'bg-signal-ok/60' : 'bg-signal-bad/60'}`}
          style={{
            left: positive ? '50%' : `${50 - width}%`,
            width: `${width}%`,
          }}
        />
      </div>

      <span className="text-right font-mono text-ink-400">
        {arm.mean_reward.toFixed(1)}
        <span className="ml-1 text-ink-600">×{arm.pulls}</span>
      </span>
    </li>
  );
}

function RewardTrend({ series }: { series: RlStats['series'] }) {
  if (series.length === 0) {
    return (
      <p className="rounded border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-400">
        Rate a few answers to see the reward trend.
      </p>
    );
  }

  const width = 320;
  const height = 80;
  const rewards = series.map((p) => p.reward);
  const min = Math.min(...rewards, -1);
  const max = Math.max(...rewards, 1);
  const span = max - min || 1;

  const x = (i: number) => (series.length === 1 ? width / 2 : (i / (series.length - 1)) * width);
  const y = (r: number) => height - ((r - min) / span) * height;

  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.reward).toFixed(1)}`).join(' ');
  const zeroY = y(0);

  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/40 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-200">
        Reward over time
      </h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-20 w-full"
        role="img"
        aria-label={`Reward trend across ${series.length} rated answers`}
      >
        {zeroY >= 0 && zeroY <= height ? (
          <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="#2f4155" strokeDasharray="3 3" />
        ) : null}
        <path d={path} fill="none" stroke="#58a6ff" strokeWidth="1.5" />
        {series.map((p, i) => (
          <circle
            key={p.transaction_id}
            cx={x(i)}
            cy={y(p.reward)}
            r="2"
            fill={p.reward >= 0 ? '#3fb950' : '#f85149'}
          />
        ))}
      </svg>
      <p className="mt-1 text-[11px] text-ink-400">
        {series.length} rated · latest {series[series.length - 1]?.reward.toFixed(2)}
      </p>
    </div>
  );
}
