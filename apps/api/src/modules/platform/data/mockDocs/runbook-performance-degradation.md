# Runbook: Diagnosing Elevated Render Times

## What this looks like when it is reported

Submitters almost never report this in platform terms. They report that a render is
slower than usual, that a job is taking longer than it did last week, or that everything
feels sluggish today. Those three phrasings all land here. The job is to turn that
report into one of the three causes below, and the first question is always whether the
extra time is being spent waiting in the queue or actually rendering.

## Worker concurrency saturation

The most frequent cause of extended wall-clock duration is concurrency saturation on
the worker fleet. Each worker accepts up to four concurrent renders, but GPU memory
bandwidth — not core count — is the binding constraint. Once three heavy jobs land on
one host, every job on that host stretches, often by 40 to 60 percent, while CPU
utilisation still reads comfortable. The signature is elevated duration across all
jobs on a single worker with no error and no failure. Drain the worker and let the
scheduler redistribute rather than cancelling the individual jobs.

## Cold model cache after a deploy

Render workers keep decoder and upscaler weights in a local cache. A fleet restart or
a new image rollout empties that cache, and the first job on each worker pays a
one-time penalty of 30 to 90 seconds while weights are fetched from object storage.
This looks alarming on a dashboard immediately after a deploy and resolves on its own
as the cache refills. If extended durations persist beyond the first job per worker,
the cache is not the explanation and you should look elsewhere.

## Storage delivery backpressure

The upload stage writes finished frames to object storage. When storage throttles —
usually because a large batch export is running concurrently — the upload stage blocks
and the job holds its worker slot while doing no compute. This shows as a long tail in
duration with normal render-stage progress, and it degrades throughput fleet-wide
rather than on one host. Check egress throttling metrics before concluding the render
stage itself regressed.

## Distinguishing the three causes

The three causes are separable without deep investigation. Saturation is localised to
one worker and affects every job on it. Cold cache is localised to the first job after
a restart and disappears without action. Backpressure is fleet-wide, correlates with a
batch export window, and shows normal render progress with a stalled upload stage.
Establishing which of the three applies takes one query against duration grouped by
worker and stage.

## What is not a cause

Queue depth alone does not extend render duration; it extends time-to-start, which
submitters often perceive as the same thing. Check whether the reported degradation is
in queue wait or in render duration before investigating the fleet at all.
