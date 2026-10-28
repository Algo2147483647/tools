import unittest
import threading
from engine import ToolError, dumps, execute
from ai import run_chat, bounded_execute, validate_settings

SETTINGS = {"baseUrl": "http://127.0.0.1:12345/v1", "model": "test", "apiKey": "secret-never-in-prompt"}


class AiTests(unittest.TestCase):
    def test_inspect_then_execute(self):
        seen = []
        responses = iter([
            {"type": "execute", "calls": [{"tool": "json.query", "arguments": {"path": "$.n"}}]},
            {"type": "execute", "calls": [{"tool": "json.format", "arguments": {}}]},
        ])
        def provider(settings, messages):
            seen.append(dumps(messages))
            return dumps(next(responses))
        result = run_chat(SETTINGS, 'inspect and format', {"text": '{"n":9007199254740993}'}, provider=provider, runner=execute)
        self.assertEqual(result["type"], "executed")
        self.assertEqual(result["trace"], ["json.query", "json.format"])
        self.assertIn('9007199254740993', seen[1])
        self.assertNotIn(SETTINGS["apiKey"], ''.join(seen))

    def test_protocol_repair_and_failed_batch(self):
        responses = iter(['not json', dumps({"type": "execute", "calls": [{"tool": "json.format", "arguments": {"indent": 0}}]}),
                          dumps({"type": "execute", "calls": [{"tool": "json.format", "arguments": {"indent": 2}}]})])
        result = run_chat(SETTINGS, 'format', {"text": '{}'}, provider=lambda *args: next(responses), runner=execute)
        self.assertEqual([attempt["ok"] for attempt in result["attempts"]], [False, False, True])

    def test_bounded_rounds_and_no_commit(self):
        snapshot = {"text": 'invalid json'}
        with self.assertRaises(ToolError) as error:
            run_chat(SETTINGS, 'format', snapshot, provider=lambda *args: dumps({"type": "execute", "calls": [{"tool": "json.format", "arguments": {}}]}), runner=execute)
        self.assertEqual(error.exception.code, 'AI_ROUND_LIMIT')
        self.assertEqual(snapshot["text"], 'invalid json')

    def test_large_context_selection_is_enforced(self):
        with self.assertRaises(ToolError) as error:
            run_chat(SETTINGS, 'format', {"text": 'a' * 120_001}, provider=lambda *args: '')
        self.assertEqual(error.exception.code, 'CONTEXT_LIMIT')
        responses = iter([
            {"type": "execute", "calls": [{"tool": "text.case", "arguments": {"mode": "upper"}}]},
            {"type": "execute", "calls": [{"tool": "text.case", "scope": "selection", "arguments": {"mode": "upper"}}]},
        ])
        result = run_chat(SETTINGS, 'uppercase selection', {"text": 'a' * 120_001, "selection": {"start": 0, "end": 3}},
                          provider=lambda *args: dumps(next(responses)), runner=execute)
        self.assertEqual(result["result"]["text"][:4], 'AAAa')
        self.assertFalse(result["attempts"][0]["ok"])

    def test_real_worker_and_timeout(self):
        result = bounded_execute({"text": '{"x":1}'}, [{"tool": "json.format", "arguments": {}}])
        self.assertIn('\n', result["text"])
        with self.assertRaises(ToolError) as error:
            bounded_execute({"text": '{}'}, [{"tool": "json.format", "arguments": {}}], timeout=0)
        self.assertEqual(error.exception.code, 'TOOL_TIMEOUT')

    def test_settings_validation(self):
        for url in ('file:///x', 'https://user:pass@example.com', 'https://example.com/?token=x'):
            with self.subTest(url=url), self.assertRaises(ToolError):
                validate_settings({**SETTINGS, 'baseUrl': url})

    def test_cancelled_provider_result_runs_no_tools_or_retries(self):
        cancelled = threading.Event()
        def provider(*args):
            cancelled.set()
            return dumps({"type": "execute", "calls": [{"tool": "json.format", "arguments": {}}]})
        def runner(*args):
            self.fail("Cancelled requests must not execute tools.")
        with self.assertRaises(ToolError) as error:
            run_chat(SETTINGS, 'format', {"text": '{}'}, provider=provider, runner=runner, cancel_event=cancelled)
        self.assertEqual(error.exception.code, 'CANCELLED')


if __name__ == '__main__':
    unittest.main()
