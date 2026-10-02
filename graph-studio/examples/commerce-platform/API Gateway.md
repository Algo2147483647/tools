# API Gateway

Provides the public entry point for the commerce platform.

## Responsibilities

- Accept authenticated client requests.
- Attach a correlation ID and forward order requests to Order Service.
- Return a consistent response envelope to the client.

## Outbound interface

`POST /orders` forwards an `OrderRequest` to Order Service. The request includes customer identity, line items, and an idempotency key.

## Internal architecture

The internal graph is empty. Explore inside this service to add components such as request authentication, rate limiting, and response mapping.
