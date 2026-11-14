"""Source-tree launcher, also used by the bundled desktop distribution."""
import os
import sys
from pathlib import Path
for key in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
    os.environ[key] = '1'
sys.path.insert(0, str(Path(__file__).resolve().parent / 'src'))
from math_engine.__main__ import main
if __name__ == '__main__': main()
