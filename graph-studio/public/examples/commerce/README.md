# Commerce operations

A fictional e-commerce architecture illustrating nested node-link diagrams. Arrows represent requests, events, writes and handoffs; they are not payment amounts or a strict execution sequence.

Open this folder as a workspace, or choose **Commerce operations** from the example gallery. Graph documents use protocol v3 and open in **Nested node-link** automatically.

- [Complete architecture](./commerce.json): 32 nodes, 45 relationships and 14 groups; includes one intentionally unconnected monitor.
- [Order journey](./order-journey.json): checkout, payment, warehouse and delivery.
- [Returns journey](./returns-journey.json): inspection, refund, restocking and customer updates.
- [Scenario guide](./notes/scenario.md)
- [Failure and return paths](./notes/exceptions.md)

Try **Collapse all** to see domain boundaries. Expand **Commerce domain**, then **Payments**, then **Settlement**. Enter **Warehouse** to inspect its complete member set and its external boundary connections. The Subgraphs panel supports member selection, grouping, moving, renaming and ungrouping. Graph undo/redo restores these edits.

Switch to **Node-link**, then **All**, to see the original nodes and directed relationships without any containment. Switching back retains the hierarchy. Fold state is saved locally per document; the JSON saves the authoritative hierarchy.

Regenerate the JSON data with `node scripts/build-commerce.mjs` from the Graph Studio project.
