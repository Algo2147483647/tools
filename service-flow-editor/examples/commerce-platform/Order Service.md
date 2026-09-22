# Order Service

Coordinates order validation and event publication for the commerce platform.

## Inbound interface

`POST /orders` receives an `OrderRequest` from API Gateway.

## Internal architecture

Explore inside this service to see Validator send `OrderValidated` and `ValidatedOrder` data to Event Publisher. Each internal component is a service node with its own document and internal graph.

## Behavior

Validate the request before publishing an order event. Retain the request's correlation ID and idempotency key throughout the flow.
