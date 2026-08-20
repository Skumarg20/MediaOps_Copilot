# Runbook: Storage and Delivery

## Where finished frames go

A completed render writes frames to a scratch prefix first, then promotes them to the
final delivery key in a single atomic operation. The promotion is what makes a job
visible to the submitter, which is why a job can read as `uploading` for a while with
nothing appearing on their side and nothing being wrong.

## Egress throttling

Object storage applies a per-account egress budget measured over a rolling five-minute
window. Batch exports consume that budget aggressively, and when they exhaust it the
upload stage is throttled rather than failed. The visible symptom is a long tail on
duration with normal render progress. Throttling is fleet-wide, so retrying an
individual job does nothing except consume a retry attempt.

## Partial output and cleanup

Frames written to the scratch prefix by a job that later failed are not addressable by
the submitter and are garbage-collected after 24 hours. This is deliberate: it prevents
a retry from colliding with a half-written object under the final key, and it means a
failed job leaves no artefact anyone needs to clean up by hand.

## When delivery succeeds but the submitter sees nothing

Check the promotion step before checking the render. If the job reached `succeeded` the
frames exist under the final key, and the problem is almost always downstream — a CDN
cache holding a previous version, or the submitter querying the wrong asset ID. Neither
is fixed by re-rendering.

## Storage backpressure versus upload timeout

`STORAGE_BACKPRESSURE` is a fleet-wide condition signalled by object storage;
`UPLOAD_TIMEOUT` is one job failing to flush inside its delivery window. They look
similar on a dashboard and call for opposite responses: backpressure means wait, and a
lone upload timeout means investigate that one worker's network path.
