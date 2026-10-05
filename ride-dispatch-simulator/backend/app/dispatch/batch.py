from .hungarian import Hungarian


class BatchDispatch(Hungarian):
    id = "batch"
    name = "Batch Matching"
    label = "Batch Optimization"
    description = "Accumulate requests for the configured simulation-second interval, then optimize pickup ETA."

    def interval(self, config):
        return float(config["batchInterval"])

    def initial_delay(self, config):
        return self.interval(config)
