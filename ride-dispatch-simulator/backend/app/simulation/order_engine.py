"""Order collection, lifecycle guardrails and bounded terminal retention."""
from app.models import Order

UNPICKED = frozenset(("Waiting", "Assigned", "PickingUp"))
TERMINAL = frozenset(("Completed", "Cancelled"))


class OrderEngine:
    def __init__(self, max_wait=600.0, terminal_retention=500):
        self.by_id: dict[int, Order] = {}
        self.max_wait = max_wait
        self.terminal_retention = terminal_retention
        self.next_id = 1

    def add(self, order: Order):
        if order.id in self.by_id:
            raise ValueError(f"Duplicate order ID {order.id}")
        self.by_id[order.id] = order
        self.next_id = max(self.next_id, order.id + 1)

    def update_waits(self, time: float, cancel):
        for order in self.by_id.values():
            if order.status in UNPICKED:
                order.waitTime = max(0.0, time - order.createTime)
                if order.waitTime > self.max_wait:
                    cancel(order)

    def prune(self):
        terminal = [order.id for order in self.by_id.values() if order.status in TERMINAL]
        for order_id in terminal[:-self.terminal_retention]:
            del self.by_id[order_id]
