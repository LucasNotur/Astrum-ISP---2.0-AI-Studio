@echo off
setlocal enabledelayedexpansion
title Astrum - LIGAR
color 0A

:: ========================================================
::  ASTRUM-LIGAR.bat - Botao unico: sobe TODA a stack de producao
::
::  Ordem: Docker Desktop -> containers (6) -> backend Fastify
::         -> Cloudflare tunnel -> GHA runner -> auto-heal monitor
::
::  Idempotente: pode rodar varias vezes sem duplicar.
::  Par do ASTRUM-DESLIGAR.bat.
:: ========================================================

call "%~dp0astrum.config.bat"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\ligar.log"

echo.
echo  ========================================================
echo       ASTRUM - LIGANDO A STACK DE PRODUCAO
echo  ========================================================
echo.

:: --------------------------------------------------------
::  1) Docker Desktop
:: --------------------------------------------------------
echo  [1/6] Docker Desktop...
docker info >nul 2>nul
if !errorlevel! equ 0 (
    echo      + Docker Engine ja esta rodando
    goto :docker_ready
)
if not exist "%DOCKER_DESKTOP_PATH%" (
    echo      X Docker Desktop nao encontrado em: %DOCKER_DESKTOP_PATH%
    goto :fail
)
echo      ... iniciando Docker Desktop (pode levar ~40s)
start "" "%DOCKER_DESKTOP_PATH%"
set /a "WAITED=0"
:wait_docker
timeout /t 3 /nobreak >nul
set /a "WAITED+=3"
docker info >nul 2>nul
if !errorlevel! equ 0 ( echo      + Docker Engine disponivel ^(%WAITED%s^) & goto :docker_ready )
if !WAITED! geq %DOCKER_STARTUP_TIMEOUT% ( echo      X Docker nao subiu em %DOCKER_STARTUP_TIMEOUT%s & goto :fail )
echo      ... aguardando Docker (%WAITED%s)
goto :wait_docker
:docker_ready

:: --------------------------------------------------------
::  2) Containers (redis/qdrant via compose + evolution por nome)
:: --------------------------------------------------------
echo  [2/6] Subindo containers...
%COMPOSE_CMD% up -d %DOCKER_SERVICES% >> "%LOG_FILE%" 2>&1
for %%c in (evolution_postgres evolution_redis evolution_api evolution_frontend) do (
    docker start %%c >nul 2>&1 && echo      + %%c || echo      ~ %%c ^(nao encontrado - ok se nao usa WhatsApp local^)
)
:: espera Redis ficar saudavel (o backend depende dele no boot)
set /a "RW=0"
:wait_redis
timeout /t 2 /nobreak >nul
set /a "RW+=2"
for /f "tokens=*" %%h in ('docker inspect --format "{{.State.Health.Status}}" astrum-redis 2^>nul') do if "%%h"=="healthy" goto :redis_ok
if !RW! geq 60 ( echo      ~ Redis nao reportou healthy em 60s, seguindo & goto :redis_ok )
goto :wait_redis
:redis_ok
echo      + redis/qdrant prontos

:: --------------------------------------------------------
::  3) Backend Fastify (:3001) - janela oculta
:: --------------------------------------------------------
echo  [3/6] Backend Fastify...
curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 ( echo      + Backend ja respondia & goto :backend_ok )
wscript "%~dp0launch_hidden.vbs" "server" "%~dp0run_backend.bat"
set /a "BW=0"
:wait_backend
timeout /t 3 /nobreak >nul
set /a "BW+=3"
curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 ( echo      + Backend respondeu ^(%BW%s^) & goto :backend_ok )
if !BW! geq 90 ( echo      X Backend nao respondeu em 90s - veja %LOG_DIR% & goto :fail )
echo      ... backend iniciando (%BW%s)
goto :wait_backend
:backend_ok

:: --------------------------------------------------------
::  4) Cloudflare Tunnel (api.astrumlabs.online -> :3001)
:: --------------------------------------------------------
echo  [4/6] Cloudflare Tunnel...
tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr /i "cloudflared" >nul 2>nul
if !errorlevel! equ 0 (
    echo      + Tunnel ja ativo
) else (
    wscript "%~dp0launch_hidden.vbs" "tunnel" "%~dp0run_tunnel.bat"
    timeout /t 4 /nobreak >nul
    echo      + Tunnel iniciado
)

:: --------------------------------------------------------
::  5) GitHub Actions Runner (deploy CI/CD) - se instalado
:: --------------------------------------------------------
echo  [5/6] GitHub Actions Runner...
if not exist "E:\actions-runner\run.cmd" (
    echo      ~ Runner nao instalado - pulando
) else (
    tasklist /fi "imagename eq Runner.Listener.exe" /nh 2>nul | findstr /i "Runner.Listener" >nul 2>nul
    if !errorlevel! equ 0 (
        echo      + Runner ja ativo
    ) else (
        wscript "%~dp0launch_hidden.vbs" "gha-runner" "%~dp0run_gha_runner.bat"
        echo      + Runner iniciado
    )
)

:: --------------------------------------------------------
::  6) Auto-heal monitor (so enquanto ligado)
:: --------------------------------------------------------
echo  [6/6] Auto-heal monitor...
schtasks /Change /TN "AstrumHealthMonitor" /ENABLE >nul 2>nul
if !errorlevel! equ 0 ( echo      + Monitor de auto-heal ligado ^(reinicia o backend se cair^) ) else ( echo      ~ Nao consegui ligar o monitor ^(sem admin?^) - stack sobe mesmo assim )

echo.
echo  ========================================================
echo       ASTRUM LIGADA
echo  ========================================================
echo    Backend local : http://localhost:%BACKEND_PORT%/api/health
echo    API publica   : %URL_API%
echo    Frontend      : %URL_FRONTEND%
echo.
echo    Para desligar : ASTRUM-DESLIGAR.bat
echo  ========================================================
echo.
echo [%date% %time%] LIGAR concluido >> "%LOG_FILE%" 2>nul
timeout /t 8
goto :end

:fail
echo.
echo  X FALHA AO LIGAR - veja os erros acima e %LOG_DIR%
echo [%date% %time%] LIGAR falhou >> "%LOG_FILE%" 2>nul
pause
exit /b 1

:end
endlocal
exit /b 0
