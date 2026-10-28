import http.client
import threading
import unittest
from engine import parse_json, dumps
from server import StudioServer


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = StudioServer(('127.0.0.1', 0))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port)
        connection.request(method, path, dumps(body) if body is not None else None, headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_static_and_private_assets(self):
        status, headers, body = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'id="source"', body)
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        for path in ('/server.py', '/requirements.txt', '/.venv/pyvenv.cfg'):
            self.assertEqual(self.request('GET', path)[0], 404)
        self.assertEqual(self.request('GET', '/%2e%2e/server.py')[0], 403)
        self.assertEqual(self.request('HEAD', '/')[2], b'')

    def test_settings_private_to_session_and_no_secret_echo(self):
        status, headers, body = self.request('GET', '/api/bootstrap')
        data = parse_json(body)
        cookie = headers['Set-Cookie'].split(';')[0]
        headers = {'Cookie': cookie, 'X-Studio-Token': data['token'], 'Content-Type': 'application/json'}
        self.assertEqual(self.request('POST', '/api/settings', {'baseUrl': 'https://example.com/v1', 'model': 'example', 'apiKey': 'test-secret'}, headers)[0], 200)
        data = self.request('GET', '/api/bootstrap', headers={'Cookie': cookie})[2]
        self.assertNotIn(b'test-secret', data)
        self.assertTrue(parse_json(data)['settings']['hasKey'])
        other = parse_json(self.request('GET', '/api/bootstrap')[2])
        self.assertFalse(other['settings']['hasKey'])
        self.assertEqual(other['settings']['baseUrl'], '')

    def test_cross_origin_and_missing_token(self):
        self.assertEqual(self.request('GET', '/api/bootstrap', headers={'Origin': 'https://unrelated.example'})[0], 403)
        self.assertEqual(self.request('GET', '/', headers={'Host': 'unrelated.example'})[0], 403)
        self.assertEqual(self.request('POST', '/api/settings', {}, {'Content-Type': 'application/json'})[0], 403)


if __name__ == '__main__':
    unittest.main()
