# Returns and exceptional paths

The Returns journey deliberately contains a directed cycle: a return case requests inspection, inspection approves a refund, and refund execution reports the result back to the case. This is a business interaction cycle, not a cycle in the containment hierarchy.

An accepted physical return may produce two independent outcomes: restocking in Warehouse and a refund in Settlement. The case record and payment ledger retain separate audit responsibilities. Customer notifications are triggered through the event bus.

The reference graph omits retry queues, timers and every possible failure transition to keep the example readable. In a production implementation, idempotency keys, reservation expiry, failed-capture release and refund reconciliation would need explicit policies.

## What folding means

When Payments is folded, its services share a visible summary. Two same-kind edges with the same visible endpoints may be shown as a relationship count. Their original IDs remain accessible. Opposite directions and different relationship kinds remain distinct.

A path in the folded view is not proof of reachability between specific underlying services. For graph analysis, use G. Folding changes the presentation only.

## Editing exercise

In After-sales, select Return request and Return inspection and create a new group. Enter it, move Return inspection back to After-sales, then ungroup the remaining container. The original connections remain intact throughout. Save and reopen the file to verify that H round-trips; use undo to recover earlier membership.
