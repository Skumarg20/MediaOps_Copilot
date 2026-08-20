# Runbook: Timeouts and Retries

## Timeout budgets by job class

Render timeouts are set per job class, not globally. Standard 1080p jobs carry a
budget of 900 seconds, 4K jobs 1800 seconds, and batch preview jobs 240 seconds. The
budget starts counting when the worker emits its first progress heartbeat, not when
the job is assigned, so a slow assignment does not consume the render budget.

## Retrying a failed job safely

A failed job can be retried, but retrying blindly is how a transient failure becomes a
sustained incident. Before retrying, confirm three things: the failure reason is
transient rather than deterministic, the output object for that job does not already
exist in storage, and the queue has capacity to absorb the retry without pushing depth
past the shedding threshold.

Deterministic failures — malformed input assets, unsupported codecs, missing fonts —
will fail identically on retry. Retrying them wastes capacity and delays the jobs
behind them. Transient failures — worker eviction, storage backpressure, timeouts
caused by a noisy neighbour — are the ones worth retrying.

## Retry backoff policy

Automatic retries use exponential backoff with a base of 30 seconds and a cap of three
attempts. A fourth failure moves the job to `failed_permanent` and raises an alert.
Manual retries bypass the backoff entirely, which is why a human retrying a job in a
tight loop can amplify an incident rather than resolve it. Wait at least one backoff
interval between manual attempts.

## When a timeout is not really a timeout

A job that fails with `RENDER_TIMEOUT` has not necessarily exceeded its own compute
budget. The most common cause is a worker sharing a host with another job that
saturated GPU memory, which stretches wall-clock time for both. If several jobs on the
same worker time out within a short window, the correct action is to drain that worker
rather than to retry each job individually.

## Cancelling instead of retrying

If the submitter no longer needs the output, cancelling is always preferable to letting
a retry chain run. Cancellation releases the queue slot immediately and does not
consume the retry budget.
