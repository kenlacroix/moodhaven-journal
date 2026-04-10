# Build whisper-cli sidecar for Windows x86_64.
# Run this once before `npm run tauri dev` or `npm run tauri build`.
#
# Usage:
#   .\scripts\build-whisper.ps1          # build
#   .\scripts\build-whisper.ps1 -Clean   # remove C:\whisper-tmp and rebuild
#
# Requirements:
#   - CMake:   winget install Kitware.CMake  (or https://cmake.org/download/)
#   - Git:     winget install Git.Git
#   - MSVC:    Visual Studio 2022 Build Tools with "Desktop development with C++"
#              (installer: https://aka.ms/vs/17/release/vs_BuildTools.exe)
#
# After installation, run this script from a "Developer PowerShell for VS 2022"
# prompt, OR from a regular terminal if cmake/cl are on PATH.

param([switch]$Clean)

$ErrorActionPreference = "Stop"

$WhisperDir  = "C:\whisper-tmp"
$BinariesDir = Join-Path $PSScriptRoot "..\src-tauri\binaries"
$Target      = "x86_64-pc-windows-msvc"
$Dest        = Join-Path $BinariesDir "whisper-$Target.exe"

Write-Host "==> Building whisper-cli for $Target" -ForegroundColor Cyan
Write-Host "    Destination: $Dest"

if ($Clean -and (Test-Path $WhisperDir)) {
    Write-Host "==> Cleaning $WhisperDir"
    Remove-Item -Recurse -Force $WhisperDir
}

if (-not (Test-Path (Join-Path $WhisperDir ".git"))) {
    Write-Host "==> Cloning whisper.cpp..."
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp $WhisperDir
} else {
    Write-Host "==> whisper.cpp already cloned (use -Clean to refresh)"
}

Push-Location $WhisperDir

Write-Host "==> Configuring CMake..."
cmake -B build `
    -DCMAKE_BUILD_TYPE=Release `
    -DBUILD_SHARED_LIBS=OFF `
    -DGGML_NATIVE=OFF

Write-Host "==> Compiling whisper-cli..."
cmake --build build --config Release --target whisper-cli -j $env:NUMBER_OF_PROCESSORS

$Built = "build\bin\Release\whisper-cli.exe"
if (-not (Test-Path $Built)) {
    # Some CMake/MSVC versions put it directly in build/bin
    $Built = "build\bin\whisper-cli.exe"
}

Copy-Item $Built $Dest -Force
Pop-Location

$Size = (Get-Item $Dest).Length / 1MB
Write-Host ""
Write-Host "==> Done: $Dest ($([math]::Round($Size,1)) MB)" -ForegroundColor Green
Write-Host ""
Write-Host "    Test run:"
& $Dest --help 2>&1 | Select-Object -First 3 | ForEach-Object { "    $_" }
