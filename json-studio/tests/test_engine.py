import unittest
from decimal import Decimal
from jsonschema import Draft202012Validator

from engine import TOOLS, ToolError, execute, parse_json, load_yaml
from protocol import RESPONSE_SCHEMA


def call(tool, **arguments):
    return {"tool": tool, "arguments": arguments}


def run(text, *calls, **snapshot):
    return execute({"text": text, "language": "auto", **snapshot}, list(calls))


class EngineTests(unittest.TestCase):
    def test_precision_through_json_yaml_roundtrip(self):
        text = '{"id":9007199254740993,"amount":0.123456789012345678901234567890,"huge":1e1000}'
        result = run(text, call("json.to_yaml"), call("yaml.to_json"))
        self.assertEqual(parse_json(result["text"]), parse_json(text))
        self.assertIn("0.123456789012345678901234567890", result["text"])
        self.assertEqual(result["language"], "json")

    def test_format_minify_sort(self):
        result = run('{"z":{"b":2,"a":1},"a":3}', call("json.sort_keys"), call("json.minify"))
        self.assertEqual(result["text"], '{"a":3,"z":{"a":1,"b":2}}')
        result = run('{"z":{"b":2,"a":1},"a":3}', call("json.sort_keys", recursive=False))
        self.assertEqual(list(parse_json(result["text"])["z"]), ["b", "a"])

    def test_duplicate_keys_and_nonfinite_rejected(self):
        for text in ('{"a":1,"a":2}', '{"x":NaN}', '{"x":Infinity}'):
            with self.subTest(text=text), self.assertRaises(ToolError):
                run(text, call("json.format"))

    def test_json_syntax_error_has_location(self):
        with self.assertRaises(ToolError) as context:
            run('{\n "a": }', call("json.format"))
        self.assertEqual(context.exception.details["line"], 2)
        self.assertEqual(context.exception.details["tool"], "json.format")

    def test_report_does_not_replace(self):
        text = '{"items":[{"n":3},{"n":4}]}'
        result = run(text, call("json.query", path="$.items[?(@.n > 3)].n"))
        self.assertEqual(result["effect"], "report")
        self.assertEqual(result["text"], text)
        self.assertEqual(parse_json(result["reports"][0]["text"]), [4])
        result = run(text, call("json.query", path="$.items[*].n", replace=True), call("json.array_reverse"))
        self.assertEqual(parse_json(result["text"]), [4, 3])

    def test_atomic_batch_and_validation(self):
        snapshot = {"text": '[3, 1, 2]'}
        with self.assertRaises(ToolError):
            execute(snapshot, [call("json.array_sort"), call("yaml.to_json", indent=0)])
        self.assertEqual(snapshot["text"], '[3, 1, 2]')
        with self.assertRaises(ToolError):
            execute(snapshot, [call("json.array_sort"), call("json.set", pointer="/missing/path", value_json="1")])
        self.assertEqual(snapshot["text"], '[3, 1, 2]')

    def test_pointer_operations_and_merge(self):
        result = run('{"a/b":{"~x":[1]}}', call("json.set", pointer="/a~1b/~0x/-", value_json="9007199254740993"))
        self.assertEqual(parse_json(result["text"])["a/b"]["~x"], [1, 9007199254740993])
        result = run(result["text"], call("json.remove", pointer="/a~1b/~0x/0"), call("json.merge", other_json='{"ok":true}'))
        self.assertEqual(parse_json(result["text"]), {"a/b": {"~x": [9007199254740993]}, "ok": True})
        for pointer in ("/a~2b", "/a~1b/~0x/01", "/a~1b/~0x/-1"):
            with self.subTest(pointer=pointer), self.assertRaises(ToolError):
                run('{"a/b":{"~x":[1]}}', call("json.remove", pointer=pointer))

    def test_diff_and_schema(self):
        result = run('{"a":true,"n":9007199254740993}', call("json.diff", other_json='{"a":1,"n":9007199254740994}'))
        report = parse_json(result["reports"][0]["text"])
        self.assertEqual(len(report["changes"]), 2)
        self.assertEqual(report["changes"][1]["after"], 9007199254740994)
        schema = '{"$defs":{"n":{"type":"integer"}},"type":"object","properties":{"n":{"$ref":"#/$defs/n"}},"required":["n"]}'
        result = run('{"n":2}', call("json.schema_validate", schema_json=schema))
        self.assertTrue(parse_json(result["reports"][0]["text"])["valid"])
        result = run('1.0', call("json.schema_validate", schema_json='{"type":"integer"}'))
        self.assertTrue(parse_json(result["reports"][0]["text"])["valid"])
        result = run('{}', call("json.schema_validate", schema_json=schema))
        self.assertFalse(parse_json(result["reports"][0]["text"])["valid"])
        with self.assertRaises(ToolError):
            run('{}', call("json.schema_validate", schema_json='{"$ref":"https://example.invalid/schema"}'))

    def test_array_pipeline(self):
        text = '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"B"}]'
        result = run(text, call("json.array_unique", by="id"), call("json.array_sort", by="name"), call("json.to_yaml"))
        self.assertEqual([item["name"] for item in load_yaml(result["text"])], ["A", "Z"])
        with self.assertRaises(ToolError):
            run(text, call("json.array_sort", by="missing"))

    def test_yaml_comments_quotes_and_rejections(self):
        text = '# heading\nname: "Alice" # inline\namount: 0.10000000000000000001\n'
        result = run(text, call("yaml.format"))
        for fragment in ('# heading', '"Alice"', '# inline', '0.10000000000000000001'):
            self.assertIn(fragment, result["text"])
        for text in ('a: 1\na: 2', 'a: !Custom value', 'a: &a [*a]'):
            with self.subTest(text=text), self.assertRaises(ToolError):
                run(text, call("yaml.to_json"))
        for text in ('1: value', 'date: 2020-01-01', 'value: .inf', '---\na: 1\n---\nb: 2'):
            with self.subTest(text=text), self.assertRaises(ToolError):
                run(text, call("yaml.to_json"))

    def test_yaml_query(self):
        result = run('items:\n  - n: 1\n  - n: 2\n', call("yaml.query", path="$.items[*].n", replace=True))
        self.assertEqual(parse_json(result["text"]), [1, 2])
        self.assertEqual(result["language"], "json")

    def test_strings_and_encodings(self):
        text = '你好 😀 "quoted" \\ \n'
        for encode, decode in (("base64_encode", "base64_decode"), ("url_encode", "url_decode"),
                               ("unicode_escape", "unicode_unescape"), ("json_escape", "json_unescape")):
            with self.subTest(encode=encode):
                self.assertEqual(run(text, call("text." + encode), call("text." + decode))["text"], text)
        self.assertEqual(run('  Hi  ', call("text.trim"), call("text.case", mode="upper"))["text"], "HI")
        self.assertEqual(run('e\u0301', call("text.normalize"))["text"], 'é')
        self.assertEqual(run('FOO Foo foo', call("text.replace", find="foo", replace=r"\1", ignore_case=True))["text"], r"\1 \1 \1")
        self.assertEqual(run('a1 b2', call("text.replace", find=r"(\d)", replace=r"[\1]", regex=True))["text"], 'a[1] b[2]')
        self.assertEqual(run('z\na\nz\nb\n', call("text.lines_unique"), call("text.lines_sort"), call("text.lines_filter", pattern="[ab]"))["text"], 'a\nb\n')
        self.assertEqual(parse_json(run('😀 你好', call("text.stats"))["reports"][0]["text"])["characters"], 4)
        for tool, text in (("text.base64_decode", "%%%"), ("text.url_decode", "%xy"), ("text.json_unescape", "{}")):
            with self.subTest(tool=tool), self.assertRaises(ToolError):
                run(text, call(tool))

    def test_utf16_selection_and_scope(self):
        result = run('😀 hello world', {**call("text.case", mode="upper"), "scope": "selection"}, selection={"start": 3, "end": 8})
        self.assertEqual(result["text"], '😀 HELLO world')
        with self.assertRaises(ToolError):
            run('😀', {**call("text.trim"), "scope": "selection"}, selection={"start": 0, "end": 1})
        with self.assertRaises(ToolError):
            run('abc', call("text.trim"), {**call("text.case", mode="upper"), "scope": "selection"})

    def test_editor_actions(self):
        self.assertEqual(run('old', call("editor.write", text='{"x":1}', language="json"))["language"], "json")
        self.assertEqual(run('old', call("editor.clear"))["text"], "")
        self.assertEqual(run('old', call("editor.undo"))["action"], "undo")
        with self.assertRaises(ToolError):
            run('old', call("editor.undo"), call("text.trim"))

    def test_registry_and_unknown_arguments(self):
        for tool in TOOLS.values():
            with self.subTest(tool=tool["name"]):
                Draft202012Validator.check_schema(tool["parameters"])
                Draft202012Validator(RESPONSE_SCHEMA).validate({"type": "execute", "calls": [tool["example"]]})
        with self.assertRaises(ToolError):
            run('{}', call("json.format", invented=True))
        with self.assertRaises(ToolError):
            run('{}', call("shell.execute", command="whoami"))


if __name__ == '__main__':
    unittest.main()
