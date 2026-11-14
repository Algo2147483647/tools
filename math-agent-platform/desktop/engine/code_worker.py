"""Execute AI-authored Python in a local workspace (not an OS filesystem sandbox)."""
import sys, os, json, io, contextlib, traceback, runpy
# Reuse host-installed job limits before executing generated code.
engine=runpy.run_path(os.path.join(os.path.dirname(__file__),'math_worker.py'),run_name='math_limits')
class BoundedOutput(io.StringIO):
    def write(self,value):
        if self.tell()+len(value)>131072: raise RuntimeError('Output exceeds 128 KB')
        return super().write(value)
request=json.loads(sys.stdin.buffer.read(512*1024))
stdout,stderr=BoundedOutput(),BoundedOutput();error=None
try:
    with contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
        exec(compile(request['code'],request['filename'],'exec'),{'__name__':'__main__','__file__':request['filename']})
except BaseException as exc:
    error={'type':type(exc).__name__,'message':str(exc)[:2000]}
    try: stderr.write(traceback.format_exc()[-8000:])
    except RuntimeError: pass
print(json.dumps({'stdout':stdout.getvalue(),'stderr':stderr.getvalue(),'error':error},ensure_ascii=False))
