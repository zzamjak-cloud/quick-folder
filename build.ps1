# QuickFolder Widget Build Script
# This script bypasses PowerShell execution policy and builds the app

Write-Host "Building QuickFolder Widget..." -ForegroundColor Cyan

# Set execution policy for current process only
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Run the build
npm run tauri build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "Executable location: src-tauri\target\release\quickfolder-widget.exe" -ForegroundColor Yellow
    Write-Host "Installer location: src-tauri\target\release\bundle\nsis\*.exe" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Build failed with error code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

