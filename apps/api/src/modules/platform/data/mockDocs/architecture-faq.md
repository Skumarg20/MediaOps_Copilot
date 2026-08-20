# Architecture FAQ

## How is work distributed across the fleet?

A single scheduler process holds the queue and assigns jobs to workers by GPU class
and reported free capacity. Workers pull nothing; assignment is push-based, which
keeps the queue authoritative and means a worker cannot starve itself by failing to
poll. The scheduler is a singleton with a standby replica that takes over on lease
expiry after 20 seconds.

## Where is job state stored?

Job state lives in the primary relational store and is the only source of truth.
Worker logs, metrics, and the operator console are all derived views and may lag. When
two views disagree, the table wins. This is why the support workflow always starts
from the job record rather than from a dashboard.

## What happens to output when a job fails midway?

Partial output is written to a scratch prefix that is not addressable by the submitter,
and it is garbage-collected after 24 hours. A failed job therefore leaves no visible
artefact, which is deliberate: it prevents a retry from colliding with a half-written
object under the final key.

## How are priorities handled?

Three priority tiers exist: interactive, standard, and batch. Interactive jobs preempt
nothing but are admitted first; batch jobs are the ones shed when queue depth crosses
the shedding threshold. Priority affects admission order only — it does not change the
compute a job receives once it is rendering.

## Can two workers process the same job?

Not under normal operation. Assignment writes a lease with the worker identity, and a
second worker cannot take the job while the lease is valid. The one path to double
processing is a manual state change that returns a job to `queued` while its original
worker is still alive, which is why that intervention requires confirming the worker is
gone.

## What is the difference between queue wait and render duration?

Queue wait is the interval between submission and the first heartbeat. Render duration
is measured from the first heartbeat to completion. Submitters usually report the sum
as "how long it took", so separating the two is the first step in almost every
performance investigation.
