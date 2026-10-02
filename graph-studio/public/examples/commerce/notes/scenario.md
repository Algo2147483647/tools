# From checkout to delivery

This is a reference design for a fictional retailer. It demonstrates containment and business boundaries, rather than prescribing an implementation for a real company.

1. Web and mobile channels reach the Storefront API, cart and pricing services.
2. Order orchestration persists the order and requests a stock reservation.
3. Risk checks approve authorization. Settlement coordinates authorization and capture with the external payment provider.
4. A paid order releases picking, packing, shipment creation and parcel dispatch.
5. Carrier events update delivery tracking and the order. Domain events drive notifications and audit records.

The hierarchy has four top-level areas: Customer experience, Commerce domain, Platform services and External partners. Commerce contains Checkout, Payments, Fulfillment and After-sales. Payments contains Risk checks and Settlement; Fulfillment contains Warehouse and Delivery.

H stores these ownership boundaries. G stores the connections between the actual operations, services and records. A service can call another domain without changing its owner.

## Suggested exploration

- Collapse all groups, then expand the four top-level areas.
- Keep Payments folded while expanding Fulfillment. Follow the edges crossing those boundaries.
- Enter Settlement. The external summaries show which other areas its original edges reach.
- Inspect a combined edge's tooltip for the exact original relationship IDs and endpoints.
- Enter Observability: the isolated synthetic monitor remains visible because membership is defined by H, independently of reachability in G.
- Select Picking and Packing in Warehouse, create a Pick-and-pack subgraph, then undo and redo.

The single-parent hierarchy models ownership. Cross-cutting concerns such as service type are node fields used by the type filter.
