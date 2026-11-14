import os
from .common import ToolError
def resource_limits():
    if os.name != 'nt':
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (1536*1024**2, 1536*1024**2))
            resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
        except (ImportError, ValueError, OSError): pass
        return
    import ctypes as c
    from ctypes import wintypes as w
    class BASIC(c.Structure):
        _fields_=[('processTime',c.c_int64),('jobTime',c.c_int64),('flags',w.DWORD),('minWS',c.c_size_t),('maxWS',c.c_size_t),('active',w.DWORD),('affinity',c.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]
    class IO(c.Structure): _fields_=[(n,c.c_uint64) for n in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
    class LIMIT(c.Structure): _fields_=[('basic',BASIC),('io',IO),('processMemory',c.c_size_t),('jobMemory',c.c_size_t),('peakProcess',c.c_size_t),('peakJob',c.c_size_t)]
    kernel=c.WinDLL('kernel32',use_last_error=True)
    kernel.CreateJobObjectW.argtypes=[c.c_void_p,w.LPCWSTR];kernel.CreateJobObjectW.restype=w.HANDLE
    kernel.SetInformationJobObject.argtypes=[w.HANDLE,c.c_int,c.c_void_p,w.DWORD];kernel.SetInformationJobObject.restype=w.BOOL
    kernel.GetCurrentProcess.restype=w.HANDLE
    kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE];kernel.AssignProcessToJobObject.restype=w.BOOL
    job=kernel.CreateJobObjectW(None,None);limits=LIMIT()
    limits.basic.flags=0x100|0x2000|0x8|0x2 # process memory, kill-on-close, active-process count, CPU
    limits.basic.active=1;limits.basic.processTime=25*10_000_000;limits.processMemory=1024**3
    if not job or not kernel.SetInformationJobObject(job,9,c.byref(limits),c.sizeof(limits)) or not kernel.AssignProcessToJobObject(job,kernel.GetCurrentProcess()):
        raise ToolError('ISOLATION_FAILED','Cannot establish mathematical worker resource limits.')
    global JOB_HANDLE
    JOB_HANDLE=job

