# Event Publisher

Publishes validated order events to downstream consumers.

## Inbound flow

Receives `OrderValidated` and `ValidatedOrder` from Validator in the Order Service internal graph.

## Internal architecture

Explore inside this service to see Retry Queue. This demonstrates another nested level without introducing another workspace JSON file.

## Delivery behavior

Preserve correlation IDs and use the order's idempotency key to make repeated delivery safe. Transient publication failures are scheduled through Retry Queue.
