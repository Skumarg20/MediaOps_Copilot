# Runbook: Render Job Lifecycle

## States a job moves through

Every render job created on the platform moves through a fixed sequence of states:
`queued` → `assigned` → `rendering` → `uploading` → `succeeded`. A job may exit to
`failed` from any state after `queued`, and to `cancelled` only while it is still
`queued` or `assigned`. The state is authoritative in the `jobs` table; the worker
logs are advisory and may lag the table by up to fifteen seconds.

## Queue admission and assignment

The scheduler admits jobs from the queue in priority order, then by submission time.
A job sits in `queued` until a worker with a matching GPU class reports free capacity.
Queue depth above 40 jobs is the point at which admission latency becomes visible to
submitters; above 120 the scheduler begins shedding low-priority work and marks the
shed jobs `queued_deferred` rather than failing them.

## What "stuck" actually means

Operators describe a job as stuck when it has not changed state for longer than the
expected duration for its state. A job stuck in `assigned` almost always means the
worker accepted the assignment and then died before emitting its first progress
heartbeat. A job stuck in `rendering` past its timeout budget will be reaped by the
watchdog and marked `failed` with reason `RENDER_TIMEOUT`; it does not need manual
intervention unless the watchdog itself is unhealthy.

## Heartbeats and the watchdog

Workers emit a heartbeat every 10 seconds. The watchdog marks a job failed when three
consecutive heartbeats are missed, which is why the minimum time to detect a dead
worker is roughly 30 seconds. The watchdog runs as a singleton; if it is down, jobs
will appear to hang indefinitely in `rendering` with no failure ever recorded. Check
the watchdog before investigating an individual job that has hung with no error.

## Safe manual intervention

Manual state changes are permitted only from `failed` and `queued_deferred`. Moving a
job out of `rendering` by hand risks two workers writing the same output object and
producing a corrupt asset. Always confirm the worker is genuinely gone — no heartbeat
for more than 60 seconds — before forcing a job back to `queued`.
