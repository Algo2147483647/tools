"""Proof of backend autonomy and real REST/WebSocket integration, without a browser."""
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from websockets.sync.client import connect


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='.runtime/smoke-report.json')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    sessions = []
    job = None

    def request(method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(base + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None

    ws_base = base.replace('http://', 'ws://').replace('https://', 'wss://')
    report = {}
    try:
        report['health'] = request('GET', '/health')
        algorithms = request('GET', '/api/algorithms')
        assert len(algorithms) >= 6
        report['algorithms'] = [a['id'] for a in algorithms]
        first = request('POST', '/api/simulations', {'config': {'supply': 500, 'demand': 3,
                        'algorithm': 'hungarian', 'simulationSpeed': 10}})
        sessions.append(first['simulationId'])
        second = request('POST', '/api/simulations', {'config': {'supply': 50}})
        sessions.append(second['simulationId'])
        identity = sessions[0]
        request('POST', f'/api/simulations/{identity}/start')
        time.sleep(0.5)
        autonomous = request('GET', f'/api/simulations/{identity}')
        assert autonomous['state']['time'] > 0, 'Backend must run without subscribers'
        with connect(f'{ws_base}/ws/simulation/{identity}', open_timeout=10) as ws:
            message = json.loads(ws.recv(timeout=10))
            assert message['type'] == 'snapshot'
            sequence = message['sequence']
            deadline = time.monotonic() + 20
            while message['state']['time'] < 60:
                assert time.monotonic() < deadline, 'Simulation did not advance over WebSocket'
                message = json.loads(ws.recv(timeout=10))
                assert message['sequence'] >= sequence
                sequence = message['sequence']
            report['autonomousStreaming'] = {'time': message['state']['time'],
                      'drivers': message['state']['metrics']['activeDrivers'],
                      'ordersCreated': message['state']['metrics']['created']}
            assert message['state']['metrics']['activeDrivers'] == 500
            assert message['state']['metrics']['created'] > 30
        paused = request('POST', f'/api/simulations/{identity}/pause')
        time.sleep(0.3)
        assert request('GET', f'/api/simulations/{identity}')['state']['time'] == paused['state']['time']
        assert request('GET', f'/api/simulations/{sessions[1]}')['state']['time'] == 0
        reset = request('POST', f'/api/simulations/{identity}/reset', {'config': {'algorithm': 'batch'}})
        assert reset['state']['time'] == 0 and reset['state']['metrics']['created'] == 30
        report['pauseResetIsolation'] = True
        try:
            request('PATCH', f'/api/simulations/{identity}/config', {'algorithm': 'missing-plugin'})
            raise AssertionError('Unregistered algorithm accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 422
        created_job = request('POST', '/api/benchmarks', {'config': {'seed': 71429, 'supply': 100}, 'duration': 60})
        job = created_job['benchmarkId']
        with connect(f'{ws_base}/ws/benchmarks/{job}', open_timeout=10) as ws:
            message = json.loads(ws.recv(timeout=30))
            while message['status'] not in ('completed', 'failed', 'cancelled'):
                message = json.loads(ws.recv(timeout=30))
            assert message['status'] == 'completed', message
            assert len(message['results']) == len(algorithms)
            assert len({r['metrics']['created'] for r in message['results']}) == 1
            report['benchmark'] = {'status': message['status'], 'algorithms': len(message['results']), 'identicalDemand': True}
        report['passed'] = True
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
    finally:
        for identity in sessions:
            request('DELETE', f'/api/simulations/{identity}')
        if job:
            request('DELETE', f'/api/benchmarks/{job}')


if __name__ == '__main__':
    main()
