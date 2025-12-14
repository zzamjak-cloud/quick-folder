@echo off
echo Building QuickFolder Widget...
npm run tauri build
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Build completed successfully!
    echo Executable location: src-tauri\target\release\quickfolder-widget.exe
    echo Installer location: src-tauri\target\release\bundle\nsis\*.exe
) else (
    echo.
    echo Build failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

