@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: =========================
::  StartLocalhost.bat
::  Spustí Python HTTP server v této složce
::  Volitelně: StartLocalhost.bat [PORT] [SUBDIR]
::     PORT   – číslo portu (výchozí 8000; skript si najde volný když je obsazen)
::     SUBDIR – podsložka, kterou servírovat (např. "public")
:: =========================

:: --- Přepni do složky se skriptem
cd /d "%~dp0"

:: --- Parametry
set "REQ_PORT=%~1"
set "SUBDIR=%~2"

if not "%SUBDIR%"=="" (
  if exist "%SUBDIR%" (
    cd /d "%SUBDIR%"
  ) else (
    echo [WARN] Podslozka "%SUBDIR%" neexistuje. Jedeme z "%cd%".
  )
)

:: --- Najdi Python launcher / interpreter
set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if "%PYCMD%"=="" where python >nul 2>nul && set "PYCMD=python"
if "%PYCMD%"=="" where python3 >nul 2>nul && set "PYCMD=python3"

if "%PYCMD%"=="" (
  echo [ERROR] Python neni nalezen. Nainstaluj Python z https://python.org a zaskrtni "Add to PATH".
  pause
  exit /b 1
)

:: --- Zjisti vychozi port a najdi volny
set "PORT=%REQ_PORT%"
if "%PORT%"=="" set "PORT=8000"

:: funkce: test obsazenosti portu (Windows)
:: Pokud je port obsazen, findstr vrati radek s LISTENING/ESTABLISHED
set "TRIED=0"
:CHECK_PORT
for /f "tokens=1,* delims=:" %%A in ("%PORT%") do set "PORT=%%A"
:: Podival bych se pomoci netstat, ale je to pomale; rychlejsi je Powershell Test-NetConnection,
:: to ale neni vsude. Zkusime netstat:
netstat -ano | findstr /R /C:":%PORT% " >nul 2>nul
if %errorlevel%==0 (
  if not "%REQ_PORT%"=="" (
    echo [ERROR] Port %PORT% je obsazeny. Zadej jiny jako parametr.
    pause
    exit /b 2
  )
  set /a PORT=PORT+1
  set /a TRIED=TRIED+1
  if %TRIED% LSS 20 goto CHECK_PORT
)

:: --- Info
echo.
echo  Slozka: %cd%
echo  Python: %PYCMD%
echo  Port:   %PORT%
echo.
echo  Oteviram http://localhost:%PORT% v prohlizeci...
start "" "http://localhost:%PORT%"

echo.
echo  Spoustim server (ukonci klavesovou zkratkou CTRL+C)...
echo.

:: --- Spust server na localhostu (bezpecnejsi nez bindnout na vsechny adresy)
"%PYCMD%" -m http.server %PORT% --bind 127.0.0.1
set "ERR=%errorlevel%"

echo.
if "%ERR%"=="0" (
  echo Server ukoncen.
) else (
  echo [INFO] Server se ukoncil s navratovym kodem %ERR%.
)
echo Stiskni libovolnou klavesu pro zavreni...
pause >nul
endlocal
