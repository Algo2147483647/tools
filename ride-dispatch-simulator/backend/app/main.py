"""ASGI entry point. One server worker owns clocks; benchmark workers are separate."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router as api_router
from app.core.benchmarks import BenchmarkManager
from app.core.sessions import CapacityError, SessionManager
from app.core.settings import Settings
from app.core.storage import CheckpointStore
from app.websocket.routes import router as websocket_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = CheckpointStore(settings.data_dir)
        app.state.settings = settings
        app.state.sessions = SessionManager(settings, store)
        app.state.benchmarks = BenchmarkManager(settings, store)
        await app.state.sessions.restore()
        await app.state.benchmarks.restore()
        try:
            yield
        finally:
            await app.state.benchmarks.close()
            await app.state.sessions.close()

    app = FastAPI(
        title="Vector Dispatch Simulation API", version="2.0.0", lifespan=lifespan,
        description="Authoritative simulation sessions, registered dispatch algorithms, streamed city state, and reproducible benchmark workers.",
    )
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                       allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "DELETE"],
                       allow_headers=["Content-Type"])
    app.include_router(api_router)
    app.include_router(websocket_router)

    @app.exception_handler(CapacityError)
    async def capacity_error(request: Request, exc: CapacityError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(ValueError)
    async def domain_validation(request: Request, exc: ValueError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(RequestValidationError)
    async def request_validation(request: Request, exc: RequestValidationError):
        # Invalid JSON numbers such as NaN must not cause the error response's
        # own JSON serialization to fail. Keep useful locations and messages.
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]})

    return app


app = create_app()
