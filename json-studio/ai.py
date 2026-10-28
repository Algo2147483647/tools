"""Provider transport and bounded tool loop. Credentials never enter model context."""
from __future__ import annotations

import multiprocessing
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from jsonschema import Draft202012Validator
from engine import ToolError, dumps, parse_json, execute, error_payload, selection_offsets, catalog, validate_call
from protocol import RESPONSE_SCHEMA, SYSTEM_PROMPT


def validate_settings(settings):
    base = settings.get("baseUrl", "").strip().rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ToolError("Enter an HTTP(S) API base URL without credentials, query or fragment.", "CONFIGURATION")
    model = settings.get("model", "").strip()
    if not model:
        raise ToolError("Enter a model name in AI Settings.", "CONFIGURATION")
    return {"baseUrl": base, "model": model, "apiKey": settings.get("apiKey", "")}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ToolError("The API redirected the request. Set the final API base URL explicitly.", "PROVIDER_REDIRECT")


def request_model(settings, messages):
    settings = validate_settings(settings)
    payload = {"model": settings["model"], "messages": messages,
               "response_format": {"type": "json_object"}, "stream": False}
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if settings["apiKey"]:
        headers["Authorization"] = "Bearer " + settings["apiKey"]
    request = urllib.request.Request(settings["baseUrl"] + "/chat/completions",
                                     data=dumps(payload, None).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
            raw = response.read(4_000_001)
            if len(raw) > 4_000_000:
                raise ToolError("API response exceeds 4 MB.", "PROVIDER_RESPONSE")
            data = parse_json(raw.decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("missing content")
        return content
    except urllib.error.HTTPError as error:
        hints = {401: "Check the API key.", 403: "Check the key's permissions.",
                 404: "Check the base URL and model name.", 429: "Rate limit or quota exceeded.",
                 400: "Check model support for chat completions with JSON-object responses."}
        raise ToolError(f"API HTTP {error.code}. {hints.get(error.code, 'The provider could not complete the request.')}", "PROVIDER_HTTP") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ToolError("Could not reach the API within 60 seconds. Check the address, network and local proxy.", "PROVIDER_CONNECTION") from error
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise ToolError("The API did not return choices[0].message.content as text.", "PROVIDER_RESPONSE") from error


def _execute_child(connection, snapshot, calls):
    try:
        connection.send({"ok": True, "result": execute(snapshot, calls)})
    except Exception as error:
        connection.send({"ok": False, "error": error_payload(error)})
    finally:
        connection.close()


def bounded_execute(snapshot, calls, timeout=8, cancel_event=None):
    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe(duplex=False)
    process = context.Process(target=_execute_child, args=(child, snapshot, calls), daemon=True)
    process.start()
    child.close()
    try:
        deadline = time.monotonic() + timeout
        while True:
            if cancel_event is not None and cancel_event.is_set():
                raise ToolError("Operation cancelled. Original text was retained.", "CANCELLED")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ToolError(f"Tool batch exceeded {timeout} seconds. Original text was retained.", "TOOL_TIMEOUT")
            if parent.poll(min(.05, remaining)):
                break
        response = parent.recv()
        if not response["ok"]:
            details = response["error"]
            raise ToolError(details.pop("message"), details.pop("code"), **details)
        return response["result"]
    except EOFError as error:
        raise ToolError("Tool worker exited before producing a result.", "TOOL_FAILED") from error
    finally:
        parent.close()
        process.join(.1)
        if process.is_alive():
            process.terminate()
            process.join(1)


def run_chat(settings, message, snapshot, history=None, provider=request_model, runner=bounded_execute, cancel_event=None):
    def check_cancelled():
        if cancel_event is not None and cancel_event.is_set():
            raise ToolError("Operation cancelled. Original text was retained.", "CANCELLED")
    settings = validate_settings(settings)
    selection = snapshot.get("selection", {})
    selected = None
    if selection.get("end", 0) > selection.get("start", 0):
        start, end = selection_offsets(snapshot["text"], selection)
        selected = {**selection, "text": snapshot["text"][start:end]}
    selection_only = len(snapshot["text"]) > 120_000
    if selection_only and (not selected or len(selected["text"]) > 120_000):
        raise ToolError("AI context exceeds 120,000 characters. Select a smaller range and ask to process that selection.", "CONTEXT_LIMIT")
    context = {"text": selected["text"] if selection_only else snapshot["text"],
               "language": snapshot.get("language", "auto"), "selection": selected,
               "selectionOnly": selection_only}
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n" + dumps({"tools": catalog(), "responseSchema": RESPONSE_SCHEMA}, None)}]
    for item in (history or [])[-8:]:
        if item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str):
            messages.append({"role": item["role"], "content": item["content"][:4000]})
    messages.append({"role": "user", "content": dumps({"message": message, "context": context}, None)})
    reports, trace, attempts = [], [], []
    last_error = None
    for _ in range(6):
        check_cancelled()
        raw = provider(settings, messages)
        check_cancelled()
        messages.append({"role": "assistant", "content": raw})
        try:
            response = parse_json(raw)
            if list(Draft202012Validator(RESPONSE_SCHEMA).iter_errors(response)):
                raise ToolError("Response must match responseSchema exactly. Use registered tools and valid arguments.", "INVALID_AI_PROTOCOL")
            if response["type"] in ("answer", "clarify"):
                return {"message": response["message"], "type": response["type"], "reports": reports, "trace": trace, "attempts": attempts}
            calls = response["calls"]
            for call in calls:
                validate_call(call)
            if selection_only and any(call.get("scope", "document") != "selection" for call in calls):
                raise ToolError("Only selection-scope calls are available for this context.", "INVALID_SCOPE")
            check_cancelled()
            result = runner(snapshot, calls, cancel_event=cancel_event) if runner is bounded_execute else runner(snapshot, calls)
            check_cancelled()
            trace.extend(result["trace"])
            reports.extend(result["reports"])
            attempts.append({"calls": calls, "ok": True})
            if result["effect"] != "report":
                return {"type": "executed", "message": response.get("message", ""),
                        "result": result, "reports": reports, "trace": trace, "attempts": attempts}
            feedback = {"toolResults": [{"tool": report["tool"], "text": report["text"][:20_000],
                                          "truncated": len(report["text"]) > 20_000} for report in result["reports"]]}
        except Exception as error:
            if getattr(error, "code", "") == "CANCELLED":
                raise
            last_error = error_payload(error)
            attempts.append({"ok": False, "error": last_error})
            feedback = {"executionError": last_error, "instruction": "Nothing was changed. Correct the call, explain the failure, or ask for missing information."}
        messages.append({"role": "user", "content": dumps(feedback, None)})
    details = {"lastError": last_error} if last_error else {}
    reason = " Last error: " + last_error["message"] if last_error else ""
    raise ToolError("AI reached the six-round limit without a final answer or successful edit. Original text was retained." + reason, "AI_ROUND_LIMIT", **details)


def test_connection(settings):
    raw = request_model(settings, [
        {"role": "system", "content": 'Return a JSON object: {"ok":true}.'},
        {"role": "user", "content": "Test JSON response support."},
    ])
    if not isinstance(parse_json(raw), dict):
        raise ToolError("Connected, but the model did not return a JSON object.", "INVALID_AI_PROTOCOL")
    return {"message": "Connected. The model returned a JSON object."}
