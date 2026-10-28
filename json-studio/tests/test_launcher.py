"""Exercise the macOS shell entrypoint with a controlled interpreter test double."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASH = shutil.which("bash")


@unittest.skipUnless(BASH, "Bash is required for launcher contract tests")
class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="json studio launcher ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copyfile(ROOT / "launch.command", self.root / "launch.command")
        (self.root / "requirements.txt").write_text("test-dependency==1\n", encoding="utf-8")
        fake = self.root / "test-python"
        fake.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$TEST_LAUNCHER_LOG"
if [ "$1" = -c ]; then
    case "$2" in *hashlib*) printf '%s\\n' test-requirements-hash ;; esac
    exit 0
fi
if [ "$1" = -m ] && [ "$2" = venv ]; then
    mkdir -p "$3/bin"
    cp "$0" "$3/bin/python"
    chmod +x "$3/bin/python"
fi
if [ "$1" = -m ] && [ "$2" = pip ]; then
    exit "${TEST_PIP_EXIT:-0}"
fi
exit 0
''', encoding="utf-8", newline="\n")
        fake.chmod(0o755)
        self.log = self.root / "launch.log"
        self.env = {**os.environ, "STUDIO_PYTHON": fake.as_posix(), "TEST_LAUNCHER_LOG": self.log.as_posix()}

    def launch(self, *args, success=True):
        result = subprocess.run([BASH, (self.root / "launch.command").as_posix(), *args],
                                cwd=ROOT.parent, env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return self.log.read_text(encoding="utf-8") if self.log.exists() else ""

    def test_first_launch_cache_and_browser_flag(self):
        log = self.launch()
        self.assertIn('-m venv .venv', log)
        self.assertIn('-m pip install -r requirements.txt', log)
        self.assertIn('-u server.py --port 4189 --open-browser', log)
        self.log.write_text('', encoding='utf-8')
        log = self.launch('--port', '04200', '--no-browser')
        self.assertNotIn('-m venv', log)
        self.assertNotIn('-m pip', log)
        self.assertIn('-u server.py --port 04200', log)
        self.assertNotIn('--open-browser', log)

    def test_build_preview_and_install_only(self):
        log = self.launch('--build-only')
        self.assertIn('scripts/manage.py check', log)
        self.assertIn('scripts/manage.py build', log)
        self.assertNotIn('server.py', log)
        self.log.write_text('', encoding='utf-8')
        log = self.launch('--preview', '--no-browser')
        self.assertIn('scripts/manage.py check', log)
        self.assertIn('-u server.py --port 4189 --dist', log)
        self.log.write_text('', encoding='utf-8')
        log = self.launch('--install-only')
        self.assertIn('-m pip install', log)
        self.assertNotIn('server.py', log)

    def test_invalid_options_do_not_prepare_environment(self):
        for args in (('--port', '0'), ('--port', '65536'), ('--port', '-1'), ('--port',), ('--unknown',)):
            with self.subTest(args=args):
                self.assertEqual(self.launch(*args, success=False), '')
        self.assertEqual(self.launch('--help'), '')

    def test_failed_dependency_install_leaves_no_stamp_or_server(self):
        self.env['TEST_PIP_EXIT'] = '9'
        log = self.launch(success=False)
        self.assertNotIn('server.py', log)
        self.assertFalse((self.root / '.venv/requirements.sha256').exists())


if __name__ == '__main__':
    unittest.main()
