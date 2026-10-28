#!/bin/bash
# Compatible with the Bash 3.2 shipped with macOS; Finder starts in another cwd.
set -e
cd -- "$(dirname -- "$0")"

# Finder does not inherit an interactive shell's Homebrew PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

fail() {
    printf '\n%s\n' "$1" >&2
    if [ -t 0 ]; then read -r -p "Press Enter to close..." studio_reply || true; fi
    exit 1
}

studio_port=4189
studio_no_browser=0
studio_install_only=0
studio_build_only=0
studio_preview=0
while [ "$#" -gt 0 ]; do
    case "$1" in
        --port)
            [ "$#" -ge 2 ] || fail "--port requires a number between 1 and 65535."
            studio_port="$2"
            shift 2
            ;;
        --no-browser) studio_no_browser=1; shift ;;
        --install-only) studio_install_only=1; shift ;;
        --build-only) studio_build_only=1; shift ;;
        --preview) studio_preview=1; shift ;;
        --dev) shift ;;
        --help|-h)
            printf '%s\n' 'Usage: ./launch.command [--port PORT] [--no-browser] [--install-only] [--build-only] [--preview] [--dev]'
            exit 0
            ;;
        *) fail "Unknown option: $1. Run ./launch.command --help for usage." ;;
    esac
done
case "$studio_port" in
    ''|*[!0-9]*) fail "Port must be a number between 1 and 65535." ;;
esac
[ "${#studio_port}" -le 5 ] || fail "Port must be between 1 and 65535."
[ "$((10#$studio_port))" -ge 1 ] && [ "$((10#$studio_port))" -le 65535 ] || fail "Port must be between 1 and 65535."

studio_python="$PWD/.venv/bin/python"
studio_version_check='import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'
if [ -e .venv ]; then
    [ -x "$studio_python" ] && "$studio_python" -c "$studio_version_check" 2>/dev/null ||
        fail "The existing .venv is not a usable macOS Python 3.10+ environment. Move it aside and launch again."
else
    studio_base_python=""
    if [ -n "${STUDIO_PYTHON:-}" ]; then
        [ -x "$STUDIO_PYTHON" ] && "$STUDIO_PYTHON" -c "$studio_version_check" 2>/dev/null ||
            fail "STUDIO_PYTHON must point to an executable Python 3.10+ interpreter."
        studio_base_python="$STUDIO_PYTHON"
    else
        while IFS= read -r studio_candidate; do
            [ -x "$studio_candidate" ] || continue
            if "$studio_candidate" -c "$studio_version_check" 2>/dev/null; then
                studio_base_python="$studio_candidate"
                break
            fi
        done < <(type -a -p python3 python3.14 python3.13 python3.12 python3.11 python3.10 2>/dev/null || true)
    fi
    [ -n "$studio_base_python" ] || fail "Python 3.10+ is required. Install Python 3 from python.org or Homebrew, then launch again."
    "$studio_base_python" -m venv .venv || fail "Could not create the project Python environment."
fi

studio_hash=$("$studio_python" -c 'import hashlib, pathlib; print(hashlib.sha256(pathlib.Path("requirements.txt").read_bytes()).hexdigest())') ||
    fail "Could not read requirements.txt."
studio_installed_hash=""
if [ -f .venv/requirements.sha256 ]; then
    studio_installed_hash=$(cat .venv/requirements.sha256)
fi
if [ "$studio_install_only" -eq 1 ] || [ "$studio_hash" != "$studio_installed_hash" ]; then
    "$studio_python" -m pip install -r requirements.txt || fail "Python dependencies could not be installed. Check the network and launch again."
    printf '%s\n' "$studio_hash" > .venv/requirements.sha256
fi
if [ "$studio_install_only" -eq 1 ]; then
    printf '%s\n' 'Python engine and dependencies are ready.'
    exit 0
fi
if [ "$studio_build_only" -eq 1 ] || [ "$studio_preview" -eq 1 ]; then
    "$studio_python" scripts/manage.py check || fail "Project checks failed."
    "$studio_python" scripts/manage.py build || fail "Build failed."
    if [ "$studio_build_only" -eq 1 ]; then exit 0; fi
fi

studio_arguments=(-u server.py --port "$studio_port")
if [ "$studio_preview" -eq 1 ]; then studio_arguments+=(--dist); fi
if [ "$studio_no_browser" -eq 0 ]; then studio_arguments+=(--open-browser); fi
studio_status=0
"$studio_python" "${studio_arguments[@]}" || studio_status=$?
if [ "$studio_status" -ne 0 ] && [ "$studio_status" -ne 130 ] && [ -t 0 ]; then
    read -r -p "Startup failed. Press Enter to close..." studio_reply || true
fi
exit "$studio_status"
