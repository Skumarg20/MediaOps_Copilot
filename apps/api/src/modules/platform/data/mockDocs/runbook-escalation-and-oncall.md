# Runbook: Escalation and On-Call

## When to escalate rather than investigate

Escalate immediately if any of three things is true: the scheduler singleton and its
standby are both unresponsive, queue depth has been above the shedding threshold for
more than fifteen minutes, or more than a quarter of the worker fleet is failing the
same job class. These are the conditions where individual investigation costs time the
incident does not have.

## What to gather before paging

Bring the job ID, the failure reason from the record, the worker the job ran on, and
whether the pattern is isolated to one worker or spread across the fleet. That last
distinction determines who gets paged: a single-worker pattern goes to fleet ops, and a
fleet-wide pattern goes to the platform on-call.

## Severity definitions

P1 is customer-visible and ongoing — renders failing or not starting for multiple
submitters. P2 is degraded but progressing, including extended durations that still
complete. P3 is a single job or a question about behaviour. Severity drives response
time, not investigation depth; a P3 with an unclear cause is still worth understanding.

## What the support agent should not decide alone

Anything that mutates state. Requeuing a job whose worker may still be alive, draining a
worker during a delivery window, or promoting a batch job past shedding all have
consequences the agent cannot see. The agent proposes; a human commits.

## After the incident

Record which of the three performance causes actually applied, or which error code was
responsible. That record is what makes the next occurrence a lookup instead of an
investigation, and it is the input the triage classifier learns from.
