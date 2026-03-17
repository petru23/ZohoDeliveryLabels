@echo off
REM setup.bat - Windows automated setup script
REM Double-click this file to run setup

echo.
echo ============================================================
echo       Delivery Label Generator - Automated Setup
echo ============================================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo X Node.js is not installed
    echo.
    echo Please install Node.js first:
    echo   - Download from: https://nodejs.org/
    echo   - Choose LTS version ^(18.x or higher^)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo √ Node.js detected: %NODE_VERSION%
echo.

REM Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo X npm is not installed
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo √ npm detected: v%NPM_VERSION%
echo.

REM Install dependencies
echo Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo X Installation failed
    pause
    exit /b 1
)

echo √ Dependencies installed
echo.

REM Create .env file if it doesn't exist
if not exist .env (
    echo Creating .env configuration file...
    copy .env.example .env >nul
    echo √ .env file created
    echo.
    echo WARNING: Edit .env file with your Zoho credentials
    echo.
    echo Required values:
    echo   - ZOHO_ORGANIZATION_ID ^(from Zoho Books settings^)
    echo   - ZOHO_ACCESS_TOKEN ^(from https://api-console.zoho.com/^)
    echo.
) else (
    echo √ .env file already exists
    echo.
)

REM Create output directory
if not exist output (
    mkdir output
    echo √ Created output directory
) else (
    echo √ Output directory exists
)

echo.
echo ============================================================
echo                   SETUP COMPLETE
echo ============================================================
echo.
echo NEXT STEPS:
echo.
echo 1. Edit .env file with your Zoho credentials:
echo    ^> notepad .env
echo.
echo 2. Test Zoho connection:
echo    ^> npm run verify
echo.
echo 3. Generate test labels:
echo    ^> npm run test-labels
echo.
echo 4. Start the server:
echo    ^> npm start
echo.
echo 5. Open browser:
echo    ^> http://localhost:3000
echo.
echo Need help? See QUICK-START.md
echo.
pause
