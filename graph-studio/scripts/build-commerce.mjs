import fs from "node:fs";
import path from "node:path";

// Fictional reference architecture: arrows are calls/events, never money amounts.
const output = path.resolve("public/examples/commerce");
const check = process.argv.includes("--check");
function write(file, doc) {
  const content = JSON.stringify(doc, null, 2) + "\n";
  const target = path.join(output, file);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content)
      throw new Error(`Commerce example is stale: ${file}. Run npm run examples:commerce.`);
  } else fs.writeFileSync(target, content);
}
const groups = {
  experience: "Customer experience",
  commerce: "Commerce domain",
  checkout: "Checkout & orders",
  payments: "Payments",
  risk: "Risk checks",
  settlement: "Settlement",
  fulfillment: "Fulfillment",
  warehouse: "Warehouse",
  delivery: "Delivery",
  aftersales: "After-sales",
  platform: "Platform services",
  messaging: "Messaging",
  observability: "Observability",
  partners: "External partners",
};
const groupParents = {
  checkout: "commerce",
  payments: "commerce",
  risk: "payments",
  settlement: "payments",
  fulfillment: "commerce",
  warehouse: "fulfillment",
  delivery: "fulfillment",
  aftersales: "commerce",
  messaging: "platform",
  observability: "platform",
};
const entries = [
  ["web", "Web storefront", "experience", "channel", "Customer shopping and self-service returns."],
  ["mobile", "Mobile app", "experience", "channel", "Mobile checkout and order tracking."],
  ["gateway", "Storefront API", "experience", "service", "Routes customer requests to domain services."],
  ["cart", "Shopping cart", "checkout", "service", "Holds proposed line items before order placement."],
  ["pricing", "Pricing & promotions", "checkout", "service", "Produces an immutable price quote."],
  [
    "orders",
    "Order orchestration",
    "checkout",
    "service",
    "Coordinates stock, payment and fulfillment; operations are idempotent.",
  ],
  ["order-db", "Order records", "checkout", "data", "Stores order state and correlation IDs."],
  ["fraud", "Fraud screening", "risk", "service", "Evaluates payment risk before authorization."],
  ["risk-rules", "Risk rules", "risk", "data", "Versioned policy input to fraud screening."],
  ["authorize", "Payment authorization", "settlement", "service", "Requests authorization from the payment partner."],
  ["capture", "Payment capture", "settlement", "service", "Captures an authorized amount after stock is reserved."],
  ["refund", "Refund execution", "settlement", "service", "Issues an idempotent refund for an approved return."],
  ["payment-ledger", "Payment ledger", "settlement", "data", "Records authorization, capture and refund outcomes."],
  [
    "reserve",
    "Stock reservation",
    "warehouse",
    "service",
    "Reserves stock with an expiry; releases it after a failed payment.",
  ],
  ["stock-db", "Stock records", "warehouse", "data", "Available, reserved and returned stock."],
  ["pick", "Picking", "warehouse", "operation", "Picks reserved items after payment confirmation."],
  ["pack", "Packing", "warehouse", "operation", "Checks items and prepares parcels."],
  ["restock", "Return restocking", "warehouse", "operation", "Returns accepted items to available stock."],
  ["shipment", "Shipment creation", "delivery", "service", "Creates the shipment and requests a carrier label."],
  ["dispatch", "Parcel dispatch", "delivery", "operation", "Hands the parcel to the carrier."],
  ["tracking", "Delivery tracking", "delivery", "service", "Consumes carrier events and publishes delivery status."],
  ["return-case", "Return request", "aftersales", "service", "Links a customer claim to the original order."],
  [
    "inspection",
    "Return inspection",
    "aftersales",
    "operation",
    "Approves condition and eligibility before refund and restocking.",
  ],
  ["case-db", "After-sales records", "aftersales", "data", "Stores case decisions and refund correlation IDs."],
  ["events", "Domain event bus", "messaging", "service", "Delivers domain events; consumers deduplicate event IDs."],
  ["notifications", "Customer notifications", "messaging", "service", "Builds order, shipment and refund messages."],
  ["email", "Email delivery", "messaging", "service", "Delivers transactional email."],
  ["audit", "Audit trail", "observability", "data", "Receives business audit events."],
  ["metrics", "Metrics & alerts", "observability", "service", "Receives application health metrics."],
  [
    "synthetic-monitor",
    "Synthetic checkout monitor",
    "observability",
    "operation",
    "Intentionally unconnected in this business-event graph: still a member of Observability.",
  ],
  ["bank", "Payment provider", "partners", "partner", "External authorization, capture and refund API."],
  ["carrier", "Parcel carrier", "partners", "partner", "External label and tracking API."],
];
const connections = [
  ["web", "gateway", "request"],
  ["mobile", "gateway", "request"],
  ["gateway", "cart", "request"],
  ["cart", "pricing", "request"],
  ["gateway", "orders", "request"],
  ["pricing", "orders", "quote"],
  ["orders", "order-db", "write"],
  ["orders", "reserve", "request"],
  ["reserve", "stock-db", "write"],
  ["reserve", "orders", "reserved"],
  ["orders", "fraud", "request"],
  ["risk-rules", "fraud", "policy"],
  ["fraud", "authorize", "approved"],
  ["authorize", "bank", "request"],
  ["authorize", "payment-ledger", "write"],
  ["authorize", "capture", "authorized"],
  ["capture", "bank", "request"],
  ["capture", "payment-ledger", "write"],
  ["capture", "orders", "paid"],
  ["orders", "pick", "release"],
  ["pick", "pack", "picked"],
  ["pack", "shipment", "packed"],
  ["shipment", "carrier", "request"],
  ["shipment", "dispatch", "label-ready"],
  ["dispatch", "carrier", "handover"],
  ["carrier", "tracking", "tracking-event"],
  ["tracking", "orders", "delivered"],
  ["orders", "events", "publish"],
  ["tracking", "events", "publish"],
  ["events", "notifications", "event"],
  ["notifications", "email", "send"],
  ["events", "audit", "record"],
  ["orders", "metrics", "telemetry"],
  ["gateway", "return-case", "request"],
  ["return-case", "orders", "lookup"],
  ["return-case", "case-db", "write"],
  ["return-case", "inspection", "review"],
  ["inspection", "restock", "accepted"],
  ["restock", "stock-db", "write"],
  ["inspection", "refund", "approved"],
  ["refund", "bank", "request"],
  ["refund", "payment-ledger", "write"],
  ["refund", "return-case", "refunded"],
  ["return-case", "events", "publish"],
  ["refund", "metrics", "telemetry"],
];
const nodes = Object.fromEntries(
  entries.map(([id, title, parent, type, description]) => [
    id,
    {
      title,
      type,
      define: description,
      notes: "[Scenario guide](./notes/scenario.md) · [Failure and return paths](./notes/exceptions.md)",
    },
  ]),
);
const edges = connections.map(([source, target, value], i) => ({ id: `relationship-${i + 1}`, source, target, value }));
const hierarchy = {
  id: "commerce-domains",
  groups: Object.fromEntries(Object.entries(groups).map(([id, title]) => [id, { title }])),
  parentById: { ...groupParents, ...Object.fromEntries(entries.map(([id, , parent]) => [id, parent])) },
};
const main = {
  format: "graph-studio",
  version: 3,
  id: "commerce-reference",
  title: "Commerce: order-to-delivery and returns",
  metadata: {
    description: "Fictional reference architecture for nested node-link exploration.",
    relationshipSemantics: "Directed API calls, events and operational handoffs; not quantities.",
  },
  nodes,
  edges,
  hierarchy,
};
function scoped(id, title, keys) {
  const keep = new Set(keys);
  const doc = structuredClone(main);
  doc.id = id;
  doc.title = title;
  doc.nodes = Object.fromEntries(Object.entries(nodes).filter(([key]) => keep.has(key)));
  doc.edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  const needed = new Set(keys);
  for (const key of keys) {
    let p = hierarchy.parentById[key];
    while (p) {
      needed.add(p);
      p = hierarchy.parentById[p];
    }
  }
  doc.hierarchy.groups = Object.fromEntries(Object.entries(hierarchy.groups).filter(([key]) => needed.has(key)));
  doc.hierarchy.parentById = Object.fromEntries(
    Object.entries(hierarchy.parentById).filter(([key]) => needed.has(key)),
  );
  return doc;
}
const order = scoped(
  "order-journey",
  "Order journey: checkout to delivery",
  entries
    .filter(([, , parent]) => parent !== "aftersales" && parent !== "observability")
    .map(([id]) => id)
    .filter((id) => !["refund", "restock"].includes(id)),
);
const returns = scoped("returns-journey", "Return journey: inspection, refund and restocking", [
  "web",
  "gateway",
  "orders",
  "order-db",
  "return-case",
  "inspection",
  "case-db",
  "restock",
  "stock-db",
  "refund",
  "bank",
  "payment-ledger",
  "events",
  "notifications",
  "email",
  "audit",
  "metrics",
  "synthetic-monitor",
]);
fs.mkdirSync(output, { recursive: true });
for (const [file, doc] of [
  ["commerce.json", main],
  ["order-journey.json", order],
  ["returns-journey.json", returns],
])
  write(file, doc);
write("graph-studio.workspace.json", {
  format: "graph-studio-workspace",
  version: 1,
  name: "Commerce operations",
  defaultGraph: "commerce.json",
  graphs: ["commerce.json", "order-journey.json", "returns-journey.json"],
  metadata: { assets: ["README.md", "notes/scenario.md", "notes/exceptions.md"] },
});
console.log(`${Object.keys(nodes).length} nodes, ${edges.length} relationships, ${Object.keys(groups).length} groups`);
