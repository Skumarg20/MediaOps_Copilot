import type { Citation, Rationale } from '@/lib/types';

type Props = {
  rationale: Rationale;
  citations: Citation[];
  overlapScore?: number;
};

function Row({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="text-sm text-ink-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-ink-200">{value}</span>
          {children}
        </div>
      </div>
    </div>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm leading-relaxed text-ink-400">{children}</p>;
}

const BAND_STYLE: Record<string, string> = {
  High: 'border-signal-ok/50 bg-signal-ok/10 text-signal-ok',
  Medium: 'border-signal-warn/50 bg-signal-warn/10 text-signal-warn',
  Low: 'border-signal-bad/50 bg-signal-bad/10 text-signal-bad',
};

export function RationalePanel({ rationale, citations, overlapScore }: Props) {
  return (
    <div className="border-t border-ink-700 bg-ink-950/60 px-4 py-3">
      <div className="grid gap-x-8 lg:grid-cols-2">
        <section>
          <Row label="Path" value={rationale.path.chosen}>
            {rationale.path.deterministic ? (
              <span className="rounded border border-signal-info/40 bg-signal-info/10 px-1.5 py-0.5 text-[11px] text-signal-info">
                deterministic
              </span>
            ) : (
              <span className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-ink-400">
                learned
              </span>
            )}
          </Row>
          <Why>{rationale.path.why}</Why>

          <Row label="Model" value={rationale.model.chosen}>
            {rationale.model.exploring ? (
              <span className="rounded border border-signal-warn/50 bg-signal-warn/10 px-1.5 py-0.5 text-[11px] text-signal-warn">
                exploring
              </span>
            ) : (
              <span className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-ink-400">
                exploiting
              </span>
            )}
            <span className="text-xs text-ink-400">
              {rationale.model.arm_mean_reward.toFixed(1)} mean · {rationale.model.arm_pulls} pulls
            </span>
          </Row>
          <Why>{rationale.model.why}</Why>
        </section>

        <section>
          <Row label="Confidence" value={rationale.confidence.band}>
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                BAND_STYLE[rationale.confidence.band] ?? 'border-ink-600 text-ink-400'
              }`}
            >
              {overlapScore !== undefined ? `${overlapScore.toFixed(2)} overlap` : 'grounding'}
            </span>
          </Row>
          <Why>{rationale.confidence.why}</Why>

          <Row label="Triage" value={rationale.triage.class} />
          <Why>{rationale.triage.why}</Why>
        </section>
      </div>

      <section className="mt-3 border-t border-ink-800 pt-3">
        <div className="text-xs uppercase tracking-wide text-ink-400">
          Citations ({citations.length})
        </div>
        {citations.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">
            No citations — the answer was withheld rather than asserted.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {citations.map((c) => (
              <li key={c.id} className="rounded border border-ink-700 bg-ink-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs text-signal-info">{c.id}</code>
                  <span className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-ink-400">
                    {c.source}
                  </span>
                  {c.score !== undefined ? (
                    <span className="text-[11px] text-ink-400">score {c.score.toFixed(3)}</span>
                  ) : (
                    <span className="text-[11px] text-ink-400">exact</span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-200">{c.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
