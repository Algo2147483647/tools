"""Python-only checks and static asset build; the Python engine is always required."""
import argparse
import compileall
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["check", "build"])
    args = parser.parse_args()
    if args.action == "check":
        for path in [*ROOT.glob("*.py"), ROOT / "tests", ROOT / "scripts"]:
            valid = compileall.compile_file(str(path), quiet=1) if path.is_file() else compileall.compile_dir(str(path), quiet=1)
            if not valid:
                raise SystemExit(1)
        subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], cwd=ROOT, check=True)
    else:
        destination = (ROOT / "dist").resolve()
        if destination.parent != ROOT or destination.name != "dist":
            raise RuntimeError("Invalid build destination")
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(ROOT / "public", destination)
        print("Built dist/. Run server.py --dist to serve with the Python engine.")


if __name__ == "__main__":
    main()
