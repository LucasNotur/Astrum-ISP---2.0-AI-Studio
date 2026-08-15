@echo off
setlocal enabledelayedexpansion
title Astrum - Parando...
color 0C

:: ========================================================
::  stop_astrum.bat - Para todo o ambiente dev de forma limpa
::
::  Etapas:
::    1. Fecha tunnel Cloudflare
::    2. Para o backend Node.js
::    3. Para containers Docker (preserva dados)
::
::  Seguro: nao apaga volumes nem dados.
:: ========================================================

call "%~dp0astrum.config.bat"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\stop.log"

echo.
echo  ========================================================
echo       ASTRUM ISP - Parando Ambiente Dev
echo  ========================================================
echo.

:: --------------------------------------------------------
::  ETAPA 1: Cloudflare Tunnel
:: --------------------------------------------------------
echo  [1/3] Fechando Cloudflare Tunnel...

tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr "cloudflared" >nul 2>nul
if !errorlevel! equ 0 (
    taskkill /im cloudflared.exe /f >nul 2>nul
    call :ok "Tunnel encerrado"
) else (
    call :ok "Nenhum tunnel ativo"
)

:: --------------------------------------------------------
::  ETAPA 2: Backend Node.js
:: --------------------------------------------------------
echo  [2/3] Parando backend Node.js...

taskkill /fi "windowtitle eq Astrum Server*" /f >nul 2>nul

set "KILLED=0"
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%EXPRESS_PORT% .*LISTENING"') do (
    taskkill /pid %%p /f >nul 2>nul && set /a "KILLED+=1"
)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%FASTIFY_PORT% .*LISTENING"') do (
    taskkill /pid %%p /f >nul 2>nul && set /a "KILLED+=1"
)

if !KILLED! gtr 0 (
    call :ok "Backend encerrado (!KILLED! processo(s))"
) else (
    call :ok "Backend ja estava parado"
)

:: --------------------------------------------------------
::  ETAPA 3: Docker Compose
:: --------------------------------------------------------
echo  [3/3] Parando containers Docker...

set "HAS_CONTAINERS=0"
for %%c in (%EXPECTED_CONTAINERS%) do (
    docker inspect --format "{{.State.Status}}" %%c 2>nul | findstr "running" >nul 2>nul
    if !errorlevel! equ 0 set "HAS_CONTAINERS=1"
)

if "!HAS_CONTAINERS!"=="1" (
    %COMPOSE_CMD% stop %DOCKER_SERVICES% >> "%LOG_FILE%" 2>&1
    call :ok "Containers parados (dados preservados)"
) else (
    call :ok "Containers ja estavam parados"
)

echo.
echo  ========================================================
echo              ASTRUM PARADA
echo  ========================================================
echo.
echo   Dados preservados nos volumes Docker.
echo   Para apagar tudo: docker compose down -v
echo.
echo   Para reiniciar: scripts\infra\start_astrum.bat
echo  ========================================================
echo.

endlocal
pause
exit /b 0

:: ========================================================

:ok
echo     + %~1
echo [%date% %time%] %~1 >> "%LOG_FILE%" 2>nul
goto :eof
