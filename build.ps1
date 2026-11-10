# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Windows, without make or a POSIX shell (PowerShell 5.1 or 7):
#   .\build.ps1            build into public\
#   .\build.ps1 check      build, then every check (python; node and playwright when present)
#   .\build.ps1 serve      build, then serve on http://127.0.0.1:8000/
# If scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\build.ps1 check
# Under MSYS2 or Git Bash, `make check` works as on any other system.
param([string]$Task = "build", [string]$Out = "public", [int]$Port = 8000)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$py = $null
foreach ($c in @("py", "python3", "python")) {
  if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break }
}
if (-not $py) { throw "Python 3 is needed: https://www.python.org/downloads/windows/ (or winget install Python.Python.3.13)" }
$pyArgs = @(); if ($py -eq "py") { $pyArgs = @("-3") }

function Invoke-Py([string[]]$a) { & $py @pyArgs @a; if ($LASTEXITCODE) { exit $LASTEXITCODE } }

Invoke-Py @("build.py", "--out", $Out)
$env:SITE_OUT = (Resolve-Path $Out).Path

switch ($Task) {
  "build" { }
  "check" {
    $failed = $false
    & $py @pyArgs -m unittest discover -s tests/py; if ($LASTEXITCODE) { $failed = $true }
    if (Get-Command node -ErrorAction SilentlyContinue) {
      $js = Get-ChildItem tests/js/*.test.mjs | ForEach-Object { $_.FullName }
      node --test @js; if ($LASTEXITCODE) { $failed = $true }
      $br = Get-ChildItem tests/browser/*.test.mjs | ForEach-Object { $_.FullName }
      node --test --test-concurrency=1 @br; if ($LASTEXITCODE) { $failed = $true }
    } else { Write-Warning "node not found: the taxonomy and browser checks did not run"; $failed = $true }
    if ($failed) { exit 1 } else { Write-Host "ALL CHECKS PASSED" }
  }
  "serve" { Invoke-Py @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $Out) }
  default { throw "unknown task '$Task' (build, check, serve)" }
}
