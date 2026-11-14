import json
import os
import sys


def main():
    sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')
    for key in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS'): os.environ[key] = '1'
    version=1
    try:
        if '--catalogue' in sys.argv:
            from . import catalogue
            print(json.dumps(catalogue(), ensure_ascii=False)); return
        # Resource limits are an executable-worker policy, not an import side effect.
        from .resources import resource_limits
        resource_limits()
        from . import execute
        raw = sys.stdin.buffer.read(4*1024*1024+1)
        if len(raw) > 4*1024*1024: raise ValueError('Request exceeds 4 MB.')
        request=json.loads(raw)
        if isinstance(request,dict) and type(request.get('schemaVersion')) is int and request['schemaVersion'] in (1,2):version=request['schemaVersion']
        result = execute(request)
    except Exception as error:
        from .common import ToolError
        result = {'schemaVersion': version, 'ok': False, 'error': {'code': error.code if isinstance(error, ToolError) else 'ENGINE_ERROR', 'message': str(error)[:500]}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == '__main__': main()
