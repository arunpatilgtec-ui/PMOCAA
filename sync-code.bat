@echo off
setlocal enabledelayedexpansion
title PMO Portal - Sync Code from GitHub
cd /d "%~dp0"

echo ============================================================
echo   PMO Portal - Sync codebase from GitHub
echo   This updates CODE ONLY. Your database tables (projects,
echo   users, tasks, etc.) are never dropped or reset by this
echo   script - only additive schema changes (new tables/columns)
echo   are applied, and existing rows are left untouched.
echo ============================================================
echo.

if not exist ".git" (
  echo ERROR: This does not look like the app's git folder.
  echo Expected to find a .git folder next to this .bat file.
  pause
  exit /b 1
)

echo [1/7] Checking for local edits...
for /f %%i in ('git status --porcelain ^| find /c /v ""') do set DIRTY=%%i
if not "!DIRTY!"=="0" (
  echo   Found local changes - stashing them so they are not lost.
  git stash push -u -m "auto-stash before sync %date% %time%"
  if errorlevel 1 (
    echo ERROR: Could not stash local changes. Aborting so nothing is lost.
    pause
    exit /b 1
  )
  echo   Saved to the stash - run "git stash list" later if you need them back.
)
echo.

echo [2/7] Fetching latest code from GitHub...
git fetch origin
if errorlevel 1 (
  echo ERROR: git fetch failed. Check your internet connection.
  pause
  exit /b 1
)
echo.

echo [3/7] Updating local code to match origin/main...
git checkout main
git reset --hard origin/main
if errorlevel 1 (
  echo ERROR: git reset failed.
  pause
  exit /b 1
)
echo.

echo [4/7] Installing/updating dependencies (this can take a few minutes)...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)
echo.

echo [5/7] Regenerating the database client from the current schema...
call npx prisma generate
if errorlevel 1 (
  echo ERROR: prisma generate failed.
  pause
  exit /b 1
)
call node scripts\create-prisma-barrel.js
echo.

echo [6/7] Applying any NEW additive database changes (new tables/columns only)...
echo   If this schema removes or renames something in a way that could lose
echo   data, Prisma will refuse and print a warning instead of doing it -
echo   it will NOT silently delete anything.
call npx prisma db push
if errorlevel 1 (
  echo.
  echo Prisma db push reported a problem - see the message above.
  echo Your existing data has NOT been touched. Fix the issue, then re-run this script.
  pause
  exit /b 1
)
echo.

echo [7/7] Restarting the app...
set "PORT=3000"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo   Stopping previous instance on port %PORT% ^(PID %%p^)...
  taskkill /F /PID %%p >nul 2>&1
)
start "PMO Portal (localhost:%PORT%)" cmd /k "npm run dev -- -p %PORT%"

echo.
echo ============================================================
echo   Done. Code updated to the latest GitHub main.
echo   App restarting at http://localhost:%PORT%
echo   Database tables were left exactly as they were.
echo ============================================================
pause
