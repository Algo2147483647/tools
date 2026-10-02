# Validator

Checks order requests before they enter the publication flow.

## Responsibilities

- Check required fields and line-item structure.
- Reject requests that violate order business rules.
- Produce a normalized `ValidatedOrder` for Event Publisher.

## Outbound flow

The `OrderValidated` event identifies a successfully validated order. The corresponding graph edge also carries the `ValidatedOrder` data-type label.
