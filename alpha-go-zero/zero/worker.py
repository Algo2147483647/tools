import sys
import time
import traceback
from filelock import FileLock


def main(key):
    from .storage import home, read, run_dir, write
    folder = run_dir(key)
    with FileLock(str(home()/"compute.lock"),timeout=0):
        (folder/"ready").touch()
        try:
            from .config import Config
            from .pipeline import Run, Stopped
            run = Run(folder,Config(**read(folder/"status.json")["config"]))
            try:
                run.execute()
            except Stopped:
                run.status(state="stopped")
        except Exception as exc:
            traceback.print_exc()
            row = read(folder/"status.json")
            write(folder/"status.json",{**row,"state":"failed","error":str(exc),"updated":time.time()})
            raise


if __name__=="__main__":
    main(sys.argv[1])
