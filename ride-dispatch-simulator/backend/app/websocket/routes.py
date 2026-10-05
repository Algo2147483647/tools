import asyncio

import anyio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


async def valid_origin(socket: WebSocket) -> bool:
    origin = socket.headers.get("origin")
    if origin and origin not in socket.app.state.settings.allowed_origins:
        await socket.close(code=4403, reason="Origin is not permitted")
        return False
    return True


async def stream(socket: WebSocket, channel, queue, initial: dict):
    async def send():
        await socket.send_json(initial)
        while True:
            frame = await queue.get()
            if frame["type"] == "closed":
                await socket.close(code=1001, reason="Resource closed")
                return
            await socket.send_json(frame)

    async def receive():
        while True:
            message = await socket.receive()
            if message["type"] == "websocket.disconnect":
                return
            # Commands deliberately use validated REST endpoints, not unchecked socket input.

    tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        channel.unsubscribe(queue)
        for task in tasks:
            task.cancel()
        # ASGI servers and TestClient may cancel a disconnected connection's
        # task while its child sender is waiting. Finish cleanup under shielding.
        with anyio.CancelScope(shield=True):
            await asyncio.gather(*tasks, return_exceptions=True)


@router.websocket("/ws/simulation/{identifier}")
async def simulation_socket(socket: WebSocket, identifier: str):
    if not await valid_origin(socket):
        return
    try:
        session = socket.app.state.sessions.get(identifier)
    except KeyError:
        await socket.close(code=4404, reason="Simulation not found")
        return
    await socket.accept()
    async with session.lock:
        queue = session.channel.subscribe()
        initial = {"type": "snapshot", **session.envelope()}
    await stream(socket, session.channel, queue, initial)


@router.websocket("/ws/benchmarks/{identifier}")
async def benchmark_socket(socket: WebSocket, identifier: str):
    if not await valid_origin(socket):
        return
    try:
        job = socket.app.state.benchmarks.get(identifier)
    except KeyError:
        await socket.close(code=4404, reason="Benchmark not found")
        return
    await socket.accept()
    async with job.lock:
        queue = job.channel.subscribe()
        initial = {"type": "benchmark", **job.snapshot()}
    await stream(socket, job.channel, queue, initial)
