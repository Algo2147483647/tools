# Retry Queue

Holds events awaiting another publication attempt.

## Retry cycle

The self loop represents `RetryScheduled` followed by `BackoffExpired`. A failed delivery is scheduled with a delay and becomes eligible for another attempt after that delay.

## Responsibilities

- Keep the original event payload and correlation ID.
- Track the attempt count and next eligible delivery time.
- Apply a bounded retry policy before escalating a persistent failure.

## Extend the example

Explore inside Retry Queue to add further implementation components. Its empty internal graph is already included in the same `workspace.json` as every other level.
