"""Execute AI-authored Python in a local workspace (not an OS filesystem sandbox)."""
import sys, os, json, io, contextlib, traceback, runpy
for key in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS'): os.environ[key]='1'
# Apply worker limits before executing generated code.
from pathlib import Path
base=Path(__file__).resolve().parent
source=base.parent/'mathematics'/'src'
if not source.exists(): source=base.parent.parent/'engines'/'mathematics'/'src'
sys.path.insert(0,str(source))
from math_engine.resources import resource_limits
resource_limits()
class BoundedOutput(io.StringIO):
    def write(self,value):
        if self.tell()+len(value)>131072: raise RuntimeError('Output exceeds 128 KB')
        return super().write(value)
request=json.loads(sys.stdin.buffer.read(512*1024))
from math_engine import execution_context
wire=sys.__stderr__
event_bytes=0
def emit(event):
    global event_bytes
    # Views are returned separately through the parent result; keep live records compact.
    message=dict(event)
    if message.get('response',{}).get('ok'):
        message['response']=dict(message['response'])
        message['response']['value']=dict(message['response']['value'])
        views=message['response']['value'].get('views',[])
        # Keep views in the completion record so the host can publish artifacts.
    line='MATH_EVENT '+json.dumps(message,ensure_ascii=True)+'\n'
    event_bytes+=len(line.encode('utf-8'))
    if event_bytes>6*1024*1024: raise RuntimeError('Mathematics trace exceeds 6 MB')
    wire.write(line);wire.flush()
stdout,stderr=BoundedOutput(),BoundedOutput();error=None
try:
    with execution_context(deadline=request.get('deadline',0)/1000 or None,parent_call_id=request.get('parentCallId'),emit=emit), contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
        exec(compile(request['code'],request['filename'],'exec'),{'__name__':'__main__','__file__':request['filename']})
except BaseException as exc:
    error={'type':type(exc).__name__,'message':str(exc)[:2000]}
    try: stderr.write(traceback.format_exc()[-8000:])
    except RuntimeError: pass
print(json.dumps({'stdout':stdout.getvalue(),'stderr':stderr.getvalue(),'error':error},ensure_ascii=False))
