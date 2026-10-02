param([int]$Port = 8873)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    python -m venv (Join-Path $taskRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create the Python environment.' }
}
& $taskPython -c "import importlib.util, sys; sys.exit(0 if all(importlib.util.find_spec(n) for n in ['sympy', 'mpmath']) else 1)"
if ($LASTEXITCODE -ne 0) {
    & $taskPython -m pip install -r (Join-Path $taskRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot install the analysis dependencies.' }
}
Write-Host "Open http://127.0.0.1:$Port in your browser. Press Ctrl+C to stop."
& $taskPython (Join-Path $taskRoot 'server.py') --port $Port
