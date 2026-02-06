@echo off
REM Convert Firebase JSON to single line
REM Usage: 1. Place this script in the same folder as your JSON file
REM        2. Run: convert-json.bat
REM        3. Output will be copied to clipboard

REM Find the JSON file
for /r %%f in (*.json) do (
    echo Converting: %%f
    
    REM Use PowerShell to convert to single line
    powershell -Command "Get-Content '%%f' -Raw | ForEach-Object { $_ -replace '\r?\n', '' } | Set-Clipboard; Write-Host 'Converted JSON copied to clipboard!'"
    
    echo.
    echo Done! Your JSON is now in clipboard.
    echo Open Render.com and paste into FIREBASE_SERVICE_ACCOUNT field.
    pause
    goto :end
)

echo No JSON file found in this directory!
pause

:end
