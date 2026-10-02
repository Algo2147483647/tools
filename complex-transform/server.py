"""Loopback-only static UI + bounded, isolated symbolic computation workers."""
import argparse
import json
import multiprocessing as multiprocessing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import socket
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
STATIC = {'index.html', 'math.js', 'geometry.js', 'presets.js', 'app.js', 'analysis-ui.js', 'styles.css', 'icon.svg'}
SLOTS = threading.BoundedSemaphore(2)


def calculate(connection, data):
    try:
        from analysis import dispatch
        connection.send(dispatch(data))
    except Exception as exc:
        connection.send({'ok': False, 'error': str(exc) or type(exc).__name__})
    finally:
        connection.close()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def valid_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

    def reply(self, value, code=200):
        raw = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try: self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError): pass

    def do_GET(self):
        if not self.valid_host(): return self.send_error(403)
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.reply({'ok': True, 'engine': 'SymPy 1.14 · mpmath 1.3', 'version': 1})
        if path == '/': self.path = '/index.html'
        elif path.lstrip('/') not in STATIC: return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if not self.valid_host() or urlparse(self.path).path.lstrip('/') not in STATIC:
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        if not self.valid_host() or self.path != '/api/analyze': return self.send_error(403)
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}:
            return self.send_error(403)
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply({'ok': False, 'error': 'JSON required'}, 415)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536: raise ValueError('Request size limit: 64 KiB')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict): raise ValueError('Expected a JSON object')
        except (ValueError, json.JSONDecodeError) as exc:
            return self.reply({'ok': False, 'error': str(exc)}, 400)
        if not SLOTS.acquire(blocking=False):
            return self.reply({'ok': False, 'error': 'Engine busy'}, 429)
        parent, child = multiprocessing.Pipe(duplex=False)
        worker = multiprocessing.Process(target=calculate, args=(child, data), daemon=True)
        try:
            worker.start()
            child.close()
            if parent.poll(25):
                try: result = parent.recv()
                except EOFError: result = {'ok': False, 'error': 'Worker stopped unexpectedly'}
            else:
                result = {'ok': False, 'error': 'Calculation timed out after 25 seconds'}
            self.reply(result)
        finally:
            if worker.is_alive(): worker.terminate()
            worker.join(timeout=2)
            parent.close()
            child.close()
            SLOTS.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8873)
    args = parser.parse_args()
    class LocalServer(ThreadingHTTPServer):
        allow_reuse_address = False
        def server_bind(self):
            if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()
    server = LocalServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    print(f'Complex Analysis Lab: http://127.0.0.1:{args.port}', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
