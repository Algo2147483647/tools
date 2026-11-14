"""Shared public entry points; host enforces hard process deadlines/cancellation."""
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar

_context = ContextVar('math_execution', default=None)

@contextmanager
def execution_context(*, deadline=None, parent_call_id=None, emit=None, cancelled=None):
    previous = _context.get()
    if previous and previous['deadline'] is not None:
        deadline = min(deadline, previous['deadline']) if deadline is not None else previous['deadline']
    token = _context.set(dict(deadline=deadline, parent=parent_call_id or (previous or {}).get('parent'),
                              emit=emit or (previous or {}).get('emit'), cancelled=cancelled or (previous or {}).get('cancelled')))
    try:
        yield
    finally:
        _context.reset(token)

def invoke(request, implementation):
    ctx = _context.get() or {}
    start = time.time()
    remaining = None if ctx.get('deadline') is None else max(0, int((ctx['deadline']-start)*1000))
    metadata = request if isinstance(request, dict) else {}
    version = metadata.get('schemaVersion', 1)
    version = version if type(version) is int and version in (1, 2) else 1
    args = metadata.get('arguments')
    record = dict(callId=str(uuid.uuid4()), parentCallId=ctx.get('parent'), tool=metadata.get('tool'),
                  operation=args.get('operation', 'evaluate') if isinstance(args, dict) else 'unknown', arguments=args,
                  remainingMs=remaining, status='running')
    def emit():
        if ctx.get('emit'): ctx['emit'](dict(record))
    emit()
    try:
        if ctx.get('cancelled') and ctx['cancelled']():
            reply = {'schemaVersion':version,'ok':False,'error':{'code':'CANCELLED','message':'Parent task cancelled.'}}
        elif remaining is not None and remaining <= 0:
            reply = {'schemaVersion':version,'ok':False,'error':{'code':'TIMED_OUT','message':'Parent deadline exhausted.'}}
        else:
            reply = implementation(request)
        record.update(status='completed' if reply['ok'] else 'failed', response=reply)
        return reply
    except BaseException as exc:
        record.update(status='failed', error={'type':type(exc).__name__,'message':str(exc)[:500]})
        raise
    finally:
        record['elapsedMs'] = round((time.time()-start)*1000)
        emit()

def solve(*, tool, arguments, dataset=None, schema_version=1):
    """Return the same versioned response as the JSON worker, including errors."""
    from . import execute
    request = dict(schemaVersion=schema_version, tool=tool, arguments=arguments)
    if dataset is not None: request['dataset'] = dataset
    return execute(request)

def batch(*, tool, arguments_list, dataset=None, schema_version=1):
    """Sequential calls share the parent budget; partial mathematical failures are retained."""
    if not isinstance(arguments_list, (list, tuple)) or len(arguments_list) > 100:
        raise ValueError('Supply at most 100 cases.')
    results = []
    for arguments in arguments_list:
        result = solve(tool=tool, arguments=arguments, dataset=dataset, schema_version=schema_version)
        results.append(result)
        if not result['ok'] and result['error']['code'] in ('CANCELLED', 'TIMED_OUT'): break
    return results
