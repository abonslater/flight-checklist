@echo off
REM Launch the MSFS 2024 Flight Checklist backend (Express, :3001) and
REM frontend (Vite, :5173) together. Run by double-clicking or from a terminal.

cd /d "%~dp0"

REM Install dependencies on first run (skips if already installed).
if not exist "node_modules\" call npm install || goto :error
if not exist "server\node_modules\" call npm --prefix server install || goto :error
if not exist "client\node_modules\" call npm --prefix client install || goto :error

echo.
echo Starting backend (http://localhost:3001) and frontend (http://localhost:5173)...
echo Press Ctrl+C in this window to stop both.
echo.

call npm run dev
goto :eof

:error
echo.
echo Dependency installation failed. See the messages above.
pause
exit /b 1
