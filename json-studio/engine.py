"""Registered text tools. No filesystem, shell, or provider access in tool code."""
from __future__ import annotations

import base64
import copy
import io
import math
import unicodedata
from decimal import Decimal
from urllib.parse import quote, unquote

import simplejson as json
import regex
from jsonpath_ng.ext import parse as jsonpath
from jsonschema import Draft202012Validator, validators
from referencing import Registry
from ruamel.yaml import YAML
from ruamel.yaml.nodes import MappingNode, SequenceNode

MAX_TEXT = 2_000_000
TOOLS = {}
HANDLERS = {}


class ToolError(ValueError):
    def __init__(self, message, code="INVALID_INPUT", **details):
        super().__init__(message)
        self.code, self.details = code, details


def fail(message, code="INVALID_INPUT", **details):
    raise ToolError(message, code, **details)


def error_payload(error):
    result = {"code": getattr(error, "code", "INVALID_INPUT"), "message": str(error)}
    result.update(getattr(error, "details", {}))
    if hasattr(error, "lineno"):
        result.update(line=error.lineno, column=error.colno)
    mark = getattr(error, "problem_mark", None)
    if mark:
        result.update(line=mark.line + 1, column=mark.column + 1)
    return result


def dumps(value, indent=2, sort_keys=False):
    return json.dumps(value, ensure_ascii=False, use_decimal=True, allow_nan=False,
                      indent=indent, sort_keys=sort_keys,
                      separators=(",", ":") if indent is None else (",", ": "))


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail(f"Duplicate object key: {key!r}. Resolve it explicitly before processing.", "DUPLICATE_KEY")
        result[key] = value
    return result


def parse_json(text):
    return json.loads(text, use_decimal=True, allow_nan=False, object_pairs_hook=unique_pairs)


def yaml_codec():
    codec = YAML(typ="rt")
    codec.preserve_quotes = True
    codec.allow_duplicate_keys = False
    # Avoid binary floating point during YAML/JSON conversion.
    codec.constructor.add_constructor("tag:yaml.org,2002:float",
        lambda loader, node: Decimal(loader.construct_scalar(node).replace("_", "")))
    codec.representer.add_representer(Decimal,
        lambda representer, value: representer.represent_scalar("tag:yaml.org,2002:float", str(value)))
    return codec


def load_yaml(text):
    # Inspect the composed graph before construction: round-trip constructors can
    # otherwise turn a recursive alias into None and silently change its value.
    root = yaml_codec().compose(text)
    count = 0
    def visit(node, active, depth):
        nonlocal count
        if node is None:
            return
        count += 1
        if count > 100_000 or depth > 128:
            fail("YAML structure or alias expansion exceeds the processing limit.", "LIMIT_EXCEEDED")
        if id(node) in active:
            fail("Cyclic YAML aliases cannot be processed.")
        if not node.tag.startswith("tag:yaml.org,2002:"):
            fail(f"Unsupported YAML tag: {node.tag}")
        active.add(id(node))
        if isinstance(node, MappingNode):
            for key, value in node.value:
                visit(key, active, depth + 1)
                visit(value, active, depth + 1)
        elif isinstance(node, SequenceNode):
            for child in node.value:
                visit(child, active, depth + 1)
        active.remove(id(node))
    visit(root, set(), 0)
    value = yaml_codec().load(text)
    validate_yaml(value)
    return value


def validate_yaml(value, active=None, depth=0):
    active = set() if active is None else active
    if depth > 128:
        fail("YAML nesting exceeds 128 levels.", "LIMIT_EXCEEDED")
    tag = getattr(value, "tag", None)
    if tag and str(tag) not in ("None", "tag:yaml.org,2002:map", "tag:yaml.org,2002:seq"):
        fail(f"Unsupported YAML tag: {tag}")
    if isinstance(value, (dict, list)):
        if id(value) in active:
            fail("Cyclic YAML aliases cannot be processed.")
        active.add(id(value))
        for child in (value.values() if isinstance(value, dict) else value):
            validate_yaml(child, active, depth + 1)
        active.remove(id(value))


def json_value(value, active=None):
    active = set() if active is None else active
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, (Decimal, float)):
        if not (value.is_finite() if isinstance(value, Decimal) else math.isfinite(value)):
            fail("Non-finite numbers cannot be converted to JSON.")
        return value
    if isinstance(value, (dict, list)):
        if id(value) in active:
            fail("Cyclic aliases cannot be converted to JSON.")
        active.add(id(value))
        if isinstance(value, dict):
            if any(not isinstance(key, str) for key in value):
                fail("JSON requires string object keys; YAML keys will not be coerced.")
            result = {str(k): json_value(v, active) for k, v in value.items()}
        else:
            result = [json_value(v, active) for v in value]
        active.remove(id(value))
        return result
    fail(f"YAML type {type(value).__name__} cannot be converted to JSON without changing its meaning.")


def dump_yaml(value, indent=2):
    codec, stream = yaml_codec(), io.StringIO()
    codec.indent(mapping=indent, sequence=indent + 2, offset=indent)
    codec.dump(value, stream)
    return stream.getvalue()


def prop(kind, description, **kwargs):
    return {"type": kind, "description": description, **kwargs}


INDENT = prop("integer", "Indentation spaces.", default=2, minimum=1, maximum=8)
PATH = prop("string", "JSONPath; supports fields, indices, wildcard, descent, slices and filters.", default="$")
POINTER = prop("string", "RFC 6901 JSON Pointer; empty string addresses root.")
REPLACE = prop("boolean", "Replace input with the query result; otherwise report only.", default=False)


def register(name, description, input_type="text", output_type="text", effect="replace", properties=None, required=(), example=None):
    schema = {"type": "object", "properties": properties or {}, "required": list(required), "additionalProperties": False}
    def decorate(handler):
        TOOLS[name] = {"name": name, "description": description, "input": input_type,
                       "output": output_type, "effect": effect, "parameters": schema,
                       "example": {"tool": name, "arguments": example or {}}}
        HANDLERS[name] = handler
        return handler
    return decorate


@register("json.format", "Format JSON without losing integer or decimal precision. Duplicate keys are rejected.", "json", "json", properties={"indent": INDENT})
def json_format(text, args):
    return dumps(parse_json(text), args["indent"])


@register("json.minify", "Remove insignificant JSON whitespace.", "json", "json")
def json_minify(text, args):
    return dumps(parse_json(text), None)


@register("json.validate", "Check strict JSON syntax and unique object keys.", "json", "report", "report")
def json_validate(text, args):
    value = parse_json(text)
    return {"valid": True, "type": type(value).__name__}


@register("json.sort_keys", "Sort object keys; array order is unchanged.", "json", "json",
          properties={"recursive": prop("boolean", "Also sort nested objects.", default=True), "indent": INDENT})
def json_sort(text, args):
    value = parse_json(text)
    if not args["recursive"] and isinstance(value, dict):
        value = dict(sorted(value.items()))
    return dumps(value, args["indent"], args["recursive"])


@register("json.query", "Select JSON values with JSONPath. Results are always an array.", "json", "json", "query",
          properties={"path": PATH, "replace": REPLACE}, example={"path": "$.items[*].name"})
def json_query(text, args):
    return [match.value for match in jsonpath(args["path"]).find(parse_json(text))]


def pointer_parts(pointer):
    if pointer == "":
        return []
    if not pointer.startswith("/") or regex.search(r"~(?![01])", pointer):
        fail("Expected an RFC 6901 JSON Pointer, for example /items/0/name.")
    return [part.replace("~1", "/").replace("~0", "~") for part in pointer[1:].split("/")]


def index_of(container, part):
    if not isinstance(container, (dict, list)):
        fail("The pointer traverses a scalar value.")
    if isinstance(container, list):
        if not regex.fullmatch(r"0|[1-9][0-9]*", part) or int(part) >= len(container):
            fail(f"Array index does not exist: {part}")
        return int(part)
    return part


def edit_pointer(value, pointer, replacement=None, remove=False):
    parts = pointer_parts(pointer)
    if not parts:
        if remove:
            fail("Cannot remove the root; use editor.clear to empty the editor.")
        return replacement
    parent = value
    for part in parts[:-1]:
        key = index_of(parent, part)
        if isinstance(parent, dict) and key not in parent:
            fail(f"Parent path does not exist: {part}")
        parent = parent[key]
    if isinstance(parent, list) and parts[-1] == "-" and not remove:
        parent.append(replacement)
        return value
    key = index_of(parent, parts[-1])
    if remove:
        if isinstance(parent, dict) and key not in parent:
            fail("The path to remove does not exist.")
        del parent[key]
    else:
        parent[key] = replacement
    return value


@register("json.set", "Set a JSON Pointer value; parents must exist. Use /- to append to an array.", "json", "json",
          properties={"pointer": POINTER, "value_json": prop("string", "Replacement value encoded as JSON text, preserving exact numbers.")},
          required=("pointer", "value_json"), example={"pointer": "/name", "value_json": '"Alice"'})
def json_set(text, args):
    return dumps(edit_pointer(parse_json(text), args["pointer"], parse_json(args["value_json"])))


@register("json.remove", "Remove an existing JSON Pointer value.", "json", "json",
          properties={"pointer": POINTER}, required=("pointer",), example={"pointer": "/unused"})
def json_remove(text, args):
    return dumps(edit_pointer(parse_json(text), args["pointer"], remove=True))


@register("json.merge", "Recursively merge objects. Conflicting scalars and arrays use the right-hand value.", "json", "json",
          properties={"other_json": prop("string", "Second JSON input as exact text.")}, required=("other_json",), example={"other_json": '{"enabled":true}'})
def json_merge(text, args):
    def merge(left, right):
        if isinstance(left, dict) and isinstance(right, dict):
            return {**left, **{k: merge(left[k], v) if k in left else v for k, v in right.items()}}
        return right
    return dumps(merge(parse_json(text), parse_json(args["other_json"])))


@register("json.diff", "Report structural differences using JSON Pointer paths; ignores object key order.", "json", "report", "report",
          properties={"other_json": prop("string", "Second JSON input as exact text.")}, required=("other_json",), example={"other_json": '{}'})
def json_diff(text, args):
    changes = []
    def visit(left, right, path):
        if isinstance(left, dict) and isinstance(right, dict):
            for key in sorted(left.keys() | right.keys()):
                child = path + "/" + key.replace("~", "~0").replace("/", "~1")
                if key not in left:
                    changes.append({"path": child, "kind": "added", "after": right[key]})
                elif key not in right:
                    changes.append({"path": child, "kind": "removed", "before": left[key]})
                else:
                    visit(left[key], right[key], child)
        elif isinstance(left, list) and isinstance(right, list):
            for index in range(max(len(left), len(right))):
                child = path + "/" + str(index)
                if index >= len(left):
                    changes.append({"path": child, "kind": "added", "after": right[index]})
                elif index >= len(right):
                    changes.append({"path": child, "kind": "removed", "before": left[index]})
                else:
                    visit(left[index], right[index], child)
        elif left != right or (isinstance(left, bool) != isinstance(right, bool)):
            changes.append({"path": path, "kind": "changed", "before": left, "after": right})
    visit(parse_json(text), parse_json(args["other_json"]), "")
    return {"equal": not changes, "changes": changes}


@register("json.schema_validate", "Validate JSON against JSON Schema 2020-12. Local references only; format is an annotation.", "json", "report", "report",
          properties={"schema_json": prop("string", "JSON Schema as JSON text.")}, required=("schema_json",), example={"schema_json": '{"type":"object"}'})
def json_schema(text, args):
    schema = parse_json(args["schema_json"])
    Draft202012Validator.check_schema(schema)
    integer_checker = Draft202012Validator.TYPE_CHECKER.redefine("integer", lambda checker, value:
        (isinstance(value, int) and not isinstance(value, bool)) or
        (isinstance(value, Decimal) and value.is_finite() and value == value.to_integral_value()))
    exact_validator = validators.extend(Draft202012Validator, type_checker=integer_checker)
    validator = exact_validator(schema, registry=Registry())
    errors = [{"path": list(e.absolute_path), "message": e.message} for e in validator.iter_errors(parse_json(text))]
    return {"valid": not errors, "errors": errors}


def array_tool(text, args, operation):
    value = parse_json(text)
    matches = jsonpath(args["path"]).find(value)
    if len(matches) != 1 or not isinstance(matches[0].value, list):
        fail("The path must select exactly one array.")
    array = matches[0].value
    def key(item):
        if args.get("by"):
            if not isinstance(item, dict) or args["by"] not in item:
                fail(f"Every array item must contain the field {args['by']!r}.")
            return item[args["by"]]
        return item
    if operation == "reverse":
        array.reverse()
    elif operation == "sort":
        def sortable(item):
            item = key(item)
            if item is None: return (0, 0)
            if isinstance(item, bool): return (1, item)
            if isinstance(item, (int, Decimal)): return (2, item)
            if isinstance(item, str): return (3, item)
            fail("Sort values must be scalars. Choose a scalar field with 'by'.")
        array.sort(key=sortable, reverse=args["order"] == "descending")
    else:
        seen, result = set(), []
        for item in array:
            marker = dumps(key(item), None, True)
            if marker not in seen:
                seen.add(marker)
                result.append(item)
        array[:] = result
    return dumps(value)


for operation in ("sort", "unique", "reverse"):
    properties = {"path": PATH}
    if operation != "reverse":
        properties["by"] = prop("string", "Object field used as key; omit for the whole item.", default="")
    if operation == "sort":
        properties["order"] = prop("string", "Sort direction; mixed scalars order null, boolean, number, string.", enum=["ascending", "descending"], default="ascending")
    register("json.array_" + operation, operation.capitalize() + " one JSON array. Unique keeps the first occurrence using canonical JSON text equality.",
             "json", "json", properties=properties)(lambda text, args, op=operation: array_tool(text, args, op))


@register("yaml.format", "Format one YAML document, retaining comments and quotes. Reject duplicate keys and custom tags.", "yaml", "yaml", properties={"indent": INDENT})
def yaml_format(text, args):
    return dump_yaml(load_yaml(text), args["indent"])


@register("yaml.validate", "Check a single YAML document, duplicate keys and unsupported tags.", "yaml", "report", "report")
def yaml_validate(text, args):
    load_yaml(text)
    return {"valid": True}


@register("yaml.query", "Query JSON-compatible YAML with JSONPath; return an array of values.", "yaml", "json", "query", properties={"path": PATH, "replace": REPLACE})
def yaml_query(text, args):
    return [m.value for m in jsonpath(args["path"]).find(json_value(load_yaml(text)))]


@register("json.to_yaml", "Convert JSON to YAML while preserving exact numeric values.", "json", "yaml", properties={"indent": INDENT})
def json_to_yaml(text, args):
    return dump_yaml(parse_json(text), args["indent"])


@register("yaml.to_json", "Convert YAML to JSON. Comments are omitted; non-string keys, dates, sets, cycles and non-finite values are rejected.", "yaml", "json", properties={"indent": INDENT})
def yaml_to_json(text, args):
    return dumps(json_value(load_yaml(text)), args["indent"])


@register("text.trim", "Trim surrounding whitespace or trim each line.", properties={"each_line": prop("boolean", "Trim every line individually.", default=False)})
def text_trim(text, args):
    return "\n".join(line.strip() for line in text.splitlines()) if args["each_line"] else text.strip()


@register("text.replace", "Replace literal text or a regular expression. Regex replacement supports backreferences; bounded execution.",
          properties={"find": prop("string", "Text or regex pattern."), "replace": prop("string", "Replacement text."),
                      "regex": prop("boolean", "Interpret find as a regex.", default=False),
                      "ignore_case": prop("boolean", "Case-insensitive matching.", default=False)},
          required=("find", "replace"), example={"find": "foo", "replace": "bar"})
def text_replace(text, args):
    if not args["regex"] and not args["ignore_case"]:
        return text.replace(args["find"], args["replace"])
    pattern = args["find"] if args["regex"] else regex.escape(args["find"])
    replacement = args["replace"] if args["regex"] else lambda match: args["replace"]
    return regex.sub(pattern, replacement, text, flags=regex.I if args["ignore_case"] else 0, timeout=1)


@register("text.case", "Change Unicode letter case.", properties={"mode": prop("string", "Case operation.", enum=["upper", "lower", "title", "swapcase", "casefold"])}, required=("mode",), example={"mode": "upper"})
def text_case(text, args):
    return getattr(text, args["mode"])()


@register("text.stats", "Count Unicode code points, UTF-8 bytes, lines, and whitespace-separated words.", output_type="report", effect="report")
def text_stats(text, args):
    return {"characters": len(text), "utf8_bytes": len(text.encode("utf-8")), "lines": len(text.splitlines()), "words": len(text.split())}


@register("text.lines_sort", "Sort lines lexically; preserves a final newline.", properties={"descending": prop("boolean", "Reverse sort order.", default=False)})
def lines_sort(text, args):
    return "\n".join(sorted(text.splitlines(), reverse=args["descending"])) + ("\n" if text.endswith("\n") else "")


@register("text.lines_unique", "Remove duplicate lines, preserving their first occurrence and a final newline.")
def lines_unique(text, args):
    return "\n".join(dict.fromkeys(text.splitlines())) + ("\n" if text.endswith("\n") else "")


@register("text.lines_filter", "Keep or exclude lines matching a bounded regular expression.",
          properties={"pattern": prop("string", "Regular expression."), "exclude": prop("boolean", "Exclude matching lines.", default=False)}, required=("pattern",), example={"pattern": "error"})
def lines_filter(text, args):
    pattern = regex.compile(args["pattern"])
    return "\n".join(line for line in text.splitlines() if bool(pattern.search(line, timeout=.1)) != args["exclude"]) + ("\n" if text.endswith("\n") else "")


@register("text.json_escape", "Encode text as a complete JSON string, including surrounding quotes.", output_type="json")
def json_escape(text, args):
    return dumps(text)


@register("text.json_unescape", "Decode a complete JSON string including its surrounding quotes.")
def json_unescape(text, args):
    value = parse_json(text)
    if not isinstance(value, str):
        fail("Expected a JSON string, not an object, array or number.")
    return value


@register("text.base64_encode", "Encode UTF-8 text as standard Base64.")
def b64_encode(text, args):
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


@register("text.base64_decode", "Decode strict standard Base64 to UTF-8 text.")
def b64_decode(text, args):
    return base64.b64decode(text, validate=True).decode("utf-8")


@register("text.url_encode", "Percent-encode a complete UTF-8 URL component; spaces become %20.")
def url_encode(text, args):
    return quote(text, safe="")


@register("text.url_decode", "Decode UTF-8 percent escapes; plus signs remain literal.")
def url_decode(text, args):
    if regex.search(r"%(?![0-9a-fA-F]{2})", text):
        fail("Malformed percent escape.")
    return unquote(text, errors="strict")


@register("text.unicode_escape", "Encode text using ASCII JSON-string escapes without outer quotes; non-BMP characters use surrogate pairs.")
def unicode_escape(text, args):
    return json.dumps(text, ensure_ascii=True)[1:-1]


@register("text.unicode_unescape", "Decode the output of unicode_escape (JSON-string contents without outer quotes).")
def unicode_unescape(text, args):
    return parse_json('"' + text + '"')


@register("text.normalize", "Normalize Unicode using a specified normalization form.",
          properties={"form": prop("string", "Unicode normalization form.", enum=["NFC", "NFD", "NFKC", "NFKD"], default="NFC")})
def normalize(text, args):
    return unicodedata.normalize(args["form"], text)


@register("editor.write", "Write newly generated or rewritten text. Prefer deterministic tools for transformations. Text is never executed as code.",
          properties={"text": prop("string", "New text."), "language": prop("string", "Output language.", enum=["text", "json", "yaml"], default="text")}, required=("text",), example={"text": "Hello"})
def editor_write(text, args):
    return args["text"]


@register("editor.clear", "Empty the current input; can be undone.")
def editor_clear(text, args):
    return ""


for action in ("undo", "redo"):
    register("editor." + action, action.capitalize() + " one editor history entry. Must be the only call.", output_type="editor", effect="editor")(
        lambda text, args, action=action: action)


@register("editor.language", "Change syntax highlighting without altering content. Must be the only call.", output_type="editor", effect="editor",
          properties={"language": prop("string", "Highlighting language.", enum=["auto", "json", "yaml", "text"])}, required=("language",), example={"language": "yaml"})
def editor_language(text, args):
    return "language"


def catalog():
    return list(TOOLS.values())


def validate_call(call):
    if not isinstance(call, dict) or set(call) - {"tool", "arguments", "scope"}:
        fail("A call accepts only tool, arguments and scope.", "INVALID_CALL")
    name = call.get("tool")
    if not isinstance(name, str) or name not in TOOLS:
        fail(f"Unknown tool: {name}", "UNKNOWN_TOOL")
    if call.get("scope", "document") not in ("document", "selection"):
        fail("Scope must be document or selection.", "INVALID_CALL")
    args = copy.deepcopy(call.get("arguments", {}))
    schema = TOOLS[name]["parameters"]
    errors = list(Draft202012Validator(schema).iter_errors(args))
    if errors:
        fail(errors[0].message, "INVALID_ARGUMENTS", tool=name, path=list(errors[0].path))
    for key, spec in schema["properties"].items():
        if key not in args and "default" in spec:
            args[key] = spec["default"]
    return name, args


def selection_offsets(text, selection):
    start, end = selection.get("start", 0), selection.get("end", 0)
    raw = text.encode("utf-16-le")
    if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(raw) // 2:
        fail("Select a nonempty text range before using selection scope.", "INVALID_SELECTION")
    try:
        return len(raw[:start * 2].decode("utf-16-le")), len(raw[:end * 2].decode("utf-16-le"))
    except UnicodeError:
        fail("Selection splits a Unicode character.", "INVALID_SELECTION")


def execute(snapshot, calls):
    """Stage a homogeneous-scope batch. Return a patch; never mutate external state."""
    text = snapshot.get("text")
    if not isinstance(text, str) or len(text) > MAX_TEXT:
        fail(f"Input must be text of at most {MAX_TEXT:,} characters.", "LIMIT_EXCEEDED")
    if not isinstance(calls, list) or not 1 <= len(calls) <= 20:
        fail("An execution requires 1 to 20 calls.", "INVALID_CALL")
    validated = [validate_call(call) for call in calls]
    scopes = {call.get("scope", "document") for call in calls}
    if len(scopes) != 1:
        fail("A batch must use a single scope.", "INVALID_CALL")
    scope = scopes.pop()
    start, end = selection_offsets(text, snapshot.get("selection", {})) if scope == "selection" else (0, len(text))
    current, language, changed = text[start:end], snapshot.get("language", "text"), False
    reports, trace = [], []
    for index, (name, args) in enumerate(validated):
        tool = TOOLS[name]
        if tool["effect"] == "editor":
            if len(calls) != 1 or scope != "document":
                fail("Editor history and language operations must run alone on the document.", "INVALID_CALL")
            return {"effect": "editor", "action": HANDLERS[name](current, args), "arguments": args, "trace": [name], "reports": []}
        try:
            result = HANDLERS[name](current, args)
            modifies = tool["effect"] == "replace" or (tool["effect"] == "query" and args.get("replace"))
            if modifies:
                current = dumps(result) if tool["effect"] == "query" else result
                if not isinstance(current, str) or len(current) > MAX_TEXT:
                    fail("Tool output exceeds the editor text limit.", "LIMIT_EXCEEDED")
                current.encode("utf-8")  # Reject unpaired surrogates before any commit.
                language = args["language"] if name == "editor.write" else tool["output"]
                changed = True
            else:
                report = dumps(result)
                if len(report) > MAX_TEXT:
                    fail("Report exceeds the result limit.", "LIMIT_EXCEEDED")
                reports.append({"tool": name, "text": report})
            trace.append(name)
        except Exception as error:
            details = error_payload(error)
            details.update(tool=name, callIndex=index, scope=scope)
            raise ToolError(details.pop("message"), details.pop("code"), **details) from error
    output = text[:start] + current + text[end:]
    if len(output) > MAX_TEXT:
        fail("Combined document exceeds the editor text limit.", "LIMIT_EXCEEDED")
    return {"effect": "replace" if changed else "report", "text": output,
            "language": language if scope == "document" else snapshot.get("language", "auto"),
            "scope": scope, "reports": reports, "trace": trace}
