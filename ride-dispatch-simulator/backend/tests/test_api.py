"""Real ASGI commands, socket streams, headless clocks, and child-process benchmarks."""

import time

from fastapi.testclient import TestClient
import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.settings import Settings
from app.main import create_app
from app.websocket.channel import LatestFrameChannel


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, persistence_interval=0.2))) as instance:
        yield instance


def create(client, **config):
    response = client.post("/api/simulations", json={"config": {"supply": 50, **config}})
    assert response.status_code == 201, response.text
    return response.json()


def test_api_metadata_and_authoritative_snapshot(client):
    assert client.get("/health").json()["service"] == "vector-backend"
    assert {item["id"] for item in client.get("/api/algorithms").json()} >= {
        "nearest", "fifo", "greedy", "hungarian", "batch", "score",
    }
    response = create(client)
    identifier = response["simulationId"]
    assert len(response["network"]["zones"]) == 10
    assert len(response["state"]["vehicles"]) == 50
    assert len(response["state"]["orders"]) == 30
    assert len(response["state"]["zoneStats"]) == 10
    assert response["state"]["running"] is False
    assert client.get(f"/api/simulations/{identifier}").json()["sequence"] == response["sequence"]
    assert client.get("/api/simulations").json()[0]["simulationId"] == identifier
    exported = client.get(f"/api/simulations/{identifier}/snapshot")
    assert "attachment" in exported.headers["content-disposition"]
    assert exported.json()["state"] == response["state"]
    assert isinstance(client.get(f"/api/simulations/{identifier}/metrics").json(), list)


def test_clock_runs_without_frontend_pause_reset_and_independent_sessions(client):
    first = create(client, secondsPerRealSecond=10)
    second = create(client)
    identifier = first["simulationId"]
    url = f"/api/simulations/{identifier}"
    started = client.post(f"{url}/start").json()
    time.sleep(0.35)
    advanced = client.get(url).json()
    assert advanced["state"]["time"] > started["state"]["time"] + 1
    assert advanced["sequence"] > started["sequence"]
    assert client.get(f"/api/simulations/{second['simulationId']}").json()["state"]["time"] == second["state"]["time"]
    paused = client.post(f"{url}/pause").json()
    time.sleep(0.2)
    assert client.get(url).json()["state"]["time"] == paused["state"]["time"]
    updated = client.patch(f"{url}/config", json={"algorithm": "hungarian", "simulationSpeed": 5,
                                                "weights": {"fairness": 2}, "supplyDistribution": "random_cluster"}).json()
    assert updated["state"]["config"]["algorithm"] == "hungarian"
    assert updated["state"]["config"]["weights"]["fairness"] == 2
    assert "distance" in updated["state"]["config"]["weights"]
    sought = client.post(f"{url}/time", json={"hour": 17}).json()
    assert sought["state"]["time"] == 0
    assert sought["state"]["config"]["startHour"] == 17
    reset = client.post(f"{url}/reset", json={"config": {"supply": 60, "startHour": 9}}).json()
    assert reset["sequence"] > sought["sequence"]
    assert reset["state"]["time"] == 0
    assert reset["state"]["config"]["startHour"] == 9
    assert len(reset["state"]["vehicles"]) == 60
    assert reset["state"]["running"] is False
    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404


def test_websocket_snapshot_live_state_reconnect_and_origin(client):
    record = create(client)
    identifier = record["simulationId"]
    url = f"/api/simulations/{identifier}"
    with client.websocket_connect(f"/ws/simulation/{identifier}") as socket:
        initial = socket.receive_json()
        assert initial["type"] == "snapshot"
        assert initial["state"] == record["state"]
        client.post(f"{url}/start")
        command = socket.receive_json()
        assert command["sequence"] > initial["sequence"]
        frame = socket.receive_json()
        assert frame["sequence"] > command["sequence"]
        assert frame["state"]["time"] > initial["state"]["time"]
        assert all(key in frame["state"] for key in ("vehicles", "orders", "metrics", "candidates", "events", "zoneStats"))
    # No subscriber is required for the authoritative clock to keep advancing.
    time.sleep(0.2)
    with client.websocket_connect(f"/ws/simulation/{identifier}") as socket:
        reconnected = socket.receive_json()
        assert reconnected["type"] == "snapshot"
        assert reconnected["state"]["time"] > frame["state"]["time"]
        assert "history" in reconnected["state"]
    with pytest.raises(WebSocketDisconnect) as rejected:
        with client.websocket_connect(f"/ws/simulation/{identifier}", headers={"origin": "https://untrusted.example"}):
            pass
    assert rejected.value.code == 4403
    with pytest.raises(WebSocketDisconnect) as missing:
        with client.websocket_connect("/ws/simulation/missing"):
            pass
    assert missing.value.code == 4404


@pytest.mark.parametrize("patch", [
    {"supply": 0}, {"supply": 1001}, {"supply": 50.5}, {"supply": True},
    {"demand": 10}, {"demand": -1}, {"algorithm": "not-a-plugin"},
    {"simulationSpeed": 3}, {"startHour": 24}, {"secondsPerRealSecond": 0},
    {"weights": {"surprise": 1}}, {"weights": {"idle": -1}},
    {"weights": None}, {"demand": None}, {"unknown": 1},
    {"supplyDistribution": "other"}, {"simulationSpeed": True}, {"demand": "2"},
])
def test_invalid_configuration_returns_422(client, patch):
    assert client.post("/api/simulations", json={"config": patch}).status_code == 422
    assert client.patch("/api/simulations/missing/config", json=patch).status_code == 422


def test_missing_resources_and_invalid_commands(client):
    assert client.get("/api/simulations/missing").status_code == 404
    assert client.post("/api/simulations/missing/start").status_code == 404
    assert client.get("/api/benchmarks/missing").status_code == 404
    assert client.post("/api/benchmarks", json={"duration": -1}).status_code == 422
    assert client.post("/api/benchmarks", json={"duration": 14401}).status_code == 422
    record = create(client)
    assert client.post(f"/api/simulations/{record['simulationId']}/time", json={"hour": 25}).status_code == 422
    assert client.post("/api/simulations", content='{"config":{"demand":NaN}}',
                       headers={"content-type": "application/json"}).status_code == 422


def test_session_capacity_is_explicit(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, max_sessions=1))) as client:
        create(client)
        response = client.post("/api/simulations", json={})
        assert response.status_code == 409


def test_checkpoint_restores_exact_state_paused_after_restart(tmp_path):
    settings = Settings(data_dir=tmp_path)
    with TestClient(create_app(settings)) as client:
        record = create(client, algorithm="score", seed=781)
        identifier = record["simulationId"]
        url = f"/api/simulations/{identifier}"
        client.post(f"{url}/start")
        time.sleep(0.25)
        state = client.post(f"{url}/pause").json()
    with TestClient(create_app(settings)) as client:
        restored = client.get(url).json()
        assert restored["state"]["running"] is False
        assert restored["sequence"] > state["sequence"]
        for key in ("time", "config", "vehicles", "orders", "metrics"):
            assert restored["state"][key] == state["state"][key]
        assert client.post(f"{url}/start").status_code == 200
        time.sleep(0.15)
        assert client.get(url).json()["state"]["time"] > state["state"]["time"]


def test_benchmark_runs_in_process_streams_results_and_exports_csv(client):
    response = client.post("/api/benchmarks", json={"config": {"supply": 50, "seed": 123}, "duration": 3})
    assert response.status_code == 202, response.text
    identifier = response.json()["benchmarkId"]
    assert client.get("/health").status_code == 200
    with client.websocket_connect(f"/ws/benchmarks/{identifier}") as socket:
        job = socket.receive_json()
        while job["status"] not in {"completed", "cancelled", "failed"}:
            job = socket.receive_json()
    assert job["status"] == "completed", job
    assert job["completed"] == job["total"] == 6
    assert len({result["algorithm"] for result in job["results"]}) == 6
    assert {result["seed"] for result in job["results"]} == {123}
    assert {result["metrics"]["created"] for result in job["results"]} == {job["results"][0]["metrics"]["created"]}
    csv = client.get(f"/api/benchmarks/{identifier}/csv")
    assert csv.status_code == 200
    assert "avgPickupETA" in csv.text and "incomeVariance" in csv.text
    assert "supplyDistribution" in csv.text and "weights" in csv.text
    assert job["config"]["supply"] == 50
    assert set(job["config"]["weights"]) == {"distance", "wait", "idle", "balance", "fairness"}
    assert len(csv.text.strip().splitlines()) == 7
    # Cancelling a completed job is idempotent and preserves its results.
    assert client.delete(f"/api/benchmarks/{identifier}").json()["status"] == "completed"


def test_reconnect_snapshot_can_restore_an_older_checkpoint_after_crash(tmp_path):
    settings = Settings(data_dir=tmp_path, persistence_interval=60)
    with TestClient(create_app(settings)) as client:
        record = create(client)
        identifier = record["simulationId"]
        url = f"/api/simulations/{identifier}"
        client.post(f"{url}/start")
        checkpoint_path = tmp_path / "simulations" / f"{identifier}.json"
        committed_checkpoint = checkpoint_path.read_text(encoding="utf-8")
        time.sleep(0.4)
        last_seen = client.get(url).json()
    # Reproduce abrupt power loss: only the previous durable checkpoint survived.
    checkpoint_path.write_text(committed_checkpoint, encoding="utf-8")
    with TestClient(create_app(settings)) as client:
        with client.websocket_connect(f"/ws/simulation/{identifier}") as socket:
            initial = socket.receive_json()
            assert initial["type"] == "snapshot"
            assert initial["state"]["running"] is False
            assert initial["sequence"] < last_seen["sequence"]
            assert initial["state"]["time"] < last_seen["state"]["time"]
            # A new connection's initial snapshot is the authoritative baseline;
            # following frames remain monotonically ordered within that connection.
            client.post(f"{url}/start")
            assert socket.receive_json()["sequence"] > initial["sequence"]


def test_benchmark_cancellation_terminates_worker(client):
    response = client.post("/api/benchmarks", json={"config": {"supply": 1000, "demand": 5}, "duration": 14400})
    identifier = response.json()["benchmarkId"]
    job = client.app.state.benchmarks.get(identifier)
    assert job.process.pid is not None
    cancelled = client.delete(f"/api/benchmarks/{identifier}")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert not job.process.is_alive()


def test_latest_frame_queue_bounds_slow_client_backlog():
    channel = LatestFrameChannel()
    queue = channel.subscribe()
    for sequence in range(1000):
        channel.publish({"sequence": sequence})
    assert queue.qsize() == 1
    assert queue.get_nowait()["sequence"] == 999
    channel.unsubscribe(queue)
    assert not channel.subscribers
