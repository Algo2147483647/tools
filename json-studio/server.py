"""Loopback-only static server, per-browser in-memory settings, and AI API."""
from __future__ import annotations

import argparse
import mimetypes
import secrets
import threading
import time
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

from engine import ToolError, MAX_TEXT, dumps, parse_json, error_payload
from ai import run_chat, test_connection, validate_settings
from protocol import reference

ROOT = Path(__file__).resolve().parent


class StudioServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, public=None):
        self.public = (public or ROOT / "public").resolve()
        self.sessions = {}
        self.session_lock = threading.Lock()
        self.jobs = threading.BoundedSemaphore(4)
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "JSONStudio/2"

    def log_message(self, *args):
        pass  # Never log editor text, prompts, credentials, or URLs.

    def respond(self, status, payload, content_type="application/json; charset=utf-8", cookie=None):
        body = dumps(payload, None).encode("utf-8") if content_type.startswith("application/json") else payload
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    def check_origin(self):
        port = self.server.server_address[1]
        allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if self.headers.get("Host") not in allowed:
            raise ToolError("Invalid local host.", "FORBIDDEN")
        origin = self.headers.get("Origin")
        if origin and origin not in {"http://" + host for host in allowed}:
            raise ToolError("Cross-origin requests are not allowed.", "FORBIDDEN")

    def session(self, create=False):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            pass
        name = f"studio_{self.server.server_address[1]}"
        sid = cookie[name].value if name in cookie else ""
        with self.server.session_lock:
            now = time.monotonic()
            for key in list(self.server.sessions):
                if now - self.server.sessions[key]["seen"] > 12 * 3600:
                    del self.server.sessions[key]
            session = self.server.sessions.get(sid)
            new_cookie = None
            if session is None and create:
                if len(self.server.sessions) >= 100:
                    raise ToolError("Too many browser sessions. Restart the local service.", "SESSION_LIMIT")
                sid = secrets.token_urlsafe(32)
                session = {"token": secrets.token_urlsafe(32), "settings": {"baseUrl": "", "model": "", "apiKey": ""}, "seen": now, "tasks": {}}
                self.server.sessions[sid] = session
                new_cookie = f"{name}={sid}; HttpOnly; SameSite=Strict; Path=/"
            if session:
                session["seen"] = now
            return session, new_cookie

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            self.check_origin()
            path = unquote(urlparse(self.path).path)
            if path == "/api/bootstrap":
                session, cookie = self.session(create=True)
                settings = session["settings"]
                self.respond(200, {"token": session["token"], "reference": reference(),
                                   "settings": {"baseUrl": settings["baseUrl"], "model": settings["model"], "hasKey": bool(settings["apiKey"])}}, cookie=cookie)
                return
            if path.startswith("/api/"):
                self.respond(404, {"error": {"code": "NOT_FOUND", "message": "Unknown API route."}})
                return
            if "\\" in path or "\x00" in path or ".." in path.split("/"):
                raise ToolError("Invalid asset path.", "FORBIDDEN")
            asset = (self.server.public / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
            if not asset.is_relative_to(self.server.public) or not asset.is_file():
                self.respond(404, b"Not found", "text/plain; charset=utf-8")
                return
            mime = {".js": "text/javascript", ".css": "text/css", ".html": "text/html"}.get(asset.suffix, mimetypes.guess_type(str(asset))[0] or "application/octet-stream")
            self.respond(200, asset.read_bytes(), mime + ("; charset=utf-8" if mime.startswith("text/") else ""))
        except Exception as error:
            self.respond(403 if getattr(error, "code", "") == "FORBIDDEN" else 400, {"error": error_payload(error)})

    def do_POST(self):
        acquired = False
        task_id = None
        session = None
        try:
            self.check_origin()
            session, _ = self.session()
            if not session or not secrets.compare_digest(self.headers.get("X-Studio-Token", ""), session["token"]):
                raise ToolError("Browser session expired. Reload the page.", "FORBIDDEN")
            if self.headers.get_content_type() != "application/json":
                raise ToolError("Expected application/json.", "INVALID_REQUEST")
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16_000_000:
                raise ToolError("Request body exceeds the size limit.", "LIMIT_EXCEEDED")
            self.connection.settimeout(15)
            payload = parse_json(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ToolError("Expected a JSON object.", "INVALID_REQUEST")
            path = urlparse(self.path).path
            if path == "/api/cancel":
                request_id = payload.get("requestId")
                if not isinstance(request_id, str) or not 1 <= len(request_id) <= 80:
                    raise ToolError("Invalid request identifier.", "INVALID_REQUEST")
                with self.server.session_lock:
                    if len(session["tasks"]) >= 64 and request_id not in session["tasks"]:
                        raise ToolError("Too many pending requests.", "BUSY")
                    session["tasks"].setdefault(request_id, threading.Event()).set()
                self.respond(200, {"cancelled": True})
                return
            if path == "/api/settings":
                if any(not isinstance(payload.get(key, ""), str) or len(payload.get(key, "")) > 4096 for key in ("baseUrl", "model", "apiKey")):
                    raise ToolError("Settings must be strings of at most 4096 characters.", "INVALID_REQUEST")
                settings = {"baseUrl": payload.get("baseUrl", ""), "model": payload.get("model", ""),
                            "apiKey": "" if payload.get("clearKey") else payload.get("apiKey") or session["settings"]["apiKey"]}
                session["settings"] = validate_settings(settings)
                self.respond(200, {"saved": True, "hasKey": bool(session["settings"]["apiKey"])})
                return
            if path not in ("/api/chat", "/api/test"):
                self.respond(404, {"error": {"code": "NOT_FOUND", "message": "Unknown API route."}})
                return
            acquired = self.server.jobs.acquire(blocking=False)
            if not acquired:
                raise ToolError("The local engine is busy. Try again shortly.", "BUSY")
            settings = dict(session["settings"])
            if path == "/api/test":
                result = test_connection(settings)
            else:
                message, snapshot = payload.get("message"), payload.get("snapshot")
                if not isinstance(message, str) or not message.strip() or len(message) > 16000:
                    raise ToolError("Enter a request of 1–16,000 characters.", "INVALID_REQUEST")
                if not isinstance(snapshot, dict) or not isinstance(snapshot.get("text"), str) or len(snapshot["text"]) > MAX_TEXT:
                    raise ToolError("Invalid editor snapshot or input exceeds 2,000,000 characters.", "INVALID_REQUEST")
                if snapshot.get("language", "auto") not in ("auto", "json", "yaml", "text"):
                    raise ToolError("Invalid editor language.", "INVALID_REQUEST")
                selection = snapshot.get("selection", {})
                if not isinstance(selection, dict) or any(type(selection.get(key, 0)) is not int for key in ("start", "end")):
                    raise ToolError("Invalid selection offsets.", "INVALID_REQUEST")
                history = payload.get("history", [])
                if not isinstance(history, list) or any(not isinstance(item, dict) for item in history):
                    raise ToolError("Invalid conversation history.", "INVALID_REQUEST")
                task_id = payload.get("requestId")
                if not isinstance(task_id, str) or not 1 <= len(task_id) <= 80:
                    task_id = None
                    raise ToolError("A runtime request identifier is required.", "INVALID_REQUEST")
                with self.server.session_lock:
                    if len(session["tasks"]) >= 64 and task_id not in session["tasks"]:
                        raise ToolError("Too many pending requests.", "BUSY")
                    cancel_event = session["tasks"].setdefault(task_id, threading.Event())
                result = run_chat(settings, message, snapshot, history, cancel_event=cancel_event)
                result["baseRevision"] = snapshot.get("revision")
            self.respond(200, result)
        except Exception as error:
            code = getattr(error, "code", "")
            status = 403 if code == "FORBIDDEN" else 429 if code == "BUSY" else 400
            self.respond(status, {"error": error_payload(error)})
        finally:
            if task_id and session:
                with self.server.session_lock:
                    session["tasks"].pop(task_id, None)
            if acquired:
                self.server.jobs.release()


def main():
    parser = argparse.ArgumentParser(description="JSON Studio local Python engine")
    parser.add_argument("--port", type=int, default=4189)
    parser.add_argument("--dist", action="store_true")
    parser.add_argument("--open-browser", action="store_true", help="Open the local page after the server binds successfully")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    with StudioServer(("127.0.0.1", args.port), ROOT / ("dist" if args.dist else "public")) as server:
        print(f"JSON Studio: http://127.0.0.1:{args.port}/", flush=True)
        print("Python engine ready. Press Ctrl+C to stop.", flush=True)
        if args.open_browser:
            threading.Thread(target=webbrowser.open, args=(f"http://127.0.0.1:{args.port}/",), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
