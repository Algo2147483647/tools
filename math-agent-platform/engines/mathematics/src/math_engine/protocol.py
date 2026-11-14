"""The Python package owns the wire schemas and mathematical tool catalogue."""
import json
import math
from importlib.resources import files
from jsonschema import Draft202012Validator
from .common import ToolError

CATALOGUE = json.loads(files('math_engine').joinpath('catalogue.json').read_text(encoding='utf-8'))
REQUEST_SCHEMA = {
    'type': 'object', 'required': ['schemaVersion', 'tool', 'arguments'], 'additionalProperties': False,
    'properties': {'schemaVersion': {'const': 1}, 'tool': {'type': 'string', 'enum': [d['name'] for d in CATALOGUE]},
                   'arguments': {'type': 'object'}, 'dataset': {'type': 'object', 'required': ['columns', 'rows'],
                   'properties': {'columns': {'type': 'array', 'items': {'type': 'string'}}, 'rows': {'type': 'array', 'items': {'type': 'array'}}}, 'additionalProperties': False}}}
VALUE_SCHEMA = {'type': 'object', 'required': ['result', 'views', 'diagnostics', 'verification', 'assumptions', 'warnings'],
                'properties': {'result': {}, 'views': {'type': 'array', 'items': {'type': 'object'}},
                'diagnostics': {'type': 'object'}, 'verification': {'type': 'object'},
                'assumptions': {'type': 'array', 'items': {'type': 'string'}}, 'warnings': {'type': 'array', 'items': {'type': 'string'}}},
                'additionalProperties': False}
RESPONSE_SCHEMA = {'type': 'object', 'required': ['schemaVersion', 'ok'], 'additionalProperties': False,
                   'properties': {'schemaVersion': {'const': 1}, 'ok': {'type': 'boolean'}, 'value': VALUE_SCHEMA,
                   'error': {'type': 'object', 'required': ['code', 'message'], 'properties': {'code': {'type': 'string'}, 'message': {'type': 'string'}}, 'additionalProperties': False}},
                   'oneOf': [{'properties': {'ok': {'const': True}}, 'required': ['value'], 'not': {'required': ['error']}},
                             {'properties': {'ok': {'const': False}}, 'required': ['error'], 'not': {'required': ['value']}}]}


def validate(value, schema):
    # jsonschema's number type accepts non-finite Python floats; JSON wire values must not.
    def finite(v):
        if isinstance(v, float) and not math.isfinite(v): raise ToolError('INVALID_ARGUMENT', 'Non-finite numbers are unsupported.')
        if isinstance(v, dict):
            for item in v.values(): finite(item)
        if isinstance(v, list):
            for item in v: finite(item)
    finite(value)
    error = next(Draft202012Validator(schema).iter_errors(value), None)
    if error: raise ToolError('INVALID_ARGUMENT', 'Invalid request field: ' + '.'.join(map(str, error.absolute_path)) + ' (' + error.validator + ')')


def validate_request(request):
    validate(request, REQUEST_SCHEMA)
    definition = next(d for d in CATALOGUE if d['name'] == request['tool'])
    validate(request['arguments'], definition['parameters'])

