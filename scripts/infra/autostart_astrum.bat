@echo off
setlocal enabledelayedexpansion
title Astrum - Autostart

:: ========================================================
::  autostart_astrum.bat - Versao para inicializacao do Windows
::
::  Igual ao start_astrum.bat mas sem "pause" no final,
::  para rodar automaticamente no logon sem travar janela.
::
::  Instalado via atalho no Startup:
::    C:\Users\lucas\AppData\Roaming\Microsoft\Windows\
::    Start Menu\Programs\Startup\Astrum Autostart.lnk
:: ========================================================

:: Carrega config
call "%~dp0astrum.config.bat"

:: Cria pasta de logs se nao existir
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: Timestamp para o log
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "LOG_DATE=%%a-%%b-%%c"
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "LOG_TIME=%%a-%%b"
set "LOG_FILE=%LOG_DIR%\autostart_%LOG_DATE%_%LOG_TIME%.log"

call :log "=== AUTOSTART ASTRUM - %date% %time% ==="

:: --------------------------------------------------------
::  ETAPA 1: Pre-requisitos
:: --------------------------------------------------------
call :log "[1/7] Verificando pre-requisitos..."

where docker >nul 2>nul || (call :log "ERRO: Docker nao encontrado" & goto :fail_silent)
where node >nul 2>nul || (call :log "ERRO: Node.js nao encontrado" & goto :fail_silent)
where cloudflared >nul 2>nul || (call :log "ERRO: cloudflared nao encontrado" & goto :fail_silent)
call :log "  OK: Docker, Node.js e cloudflared instalados"

:: --------------------------------------------------------
::  ETAPA 2: Docker Desktop
:: --------------------------------------------------------
call :log "[2/7] Verificando Docker Desktop..."

docker info >nul 2>nul
if !errorlevel! equ 0 (
    call :log "  OK: Docker Engine ja esta rodando"
    goto :docker_ready
)

call :log "  Docker Desktop nao esta rodando, iniciando..."
if exist "%DOCKER_DESKTOP_PATH%" (
    start "" "%DOCKER_DESKTOP_PATH%"
) else (
    call :log "ERRO: Docker Desktop nao encontrado em: %DOCKER_DESKTOP_PATH%"
    goto :fail_silent
)

set /a "WAITED=0"
:wait_docker
timeout /t 5 /nobreak >nul
set /a "WAITED+=5"
docker info >nul 2>nul
if !errorlevel! equ 0 (
    call :log "  OK: Docker Engine disponivel (aguardou %WAITED%s)"
    goto :docker_ready
)
if !WAITED! geq %DOCKER_STARTUP_TIMEOUT% (
    call :log "ERRO: Docker nao iniciou em %DOCKER_STARTUP_TIMEOUT%s"
    goto :fail_silent
)
call :log "  ...aguardando Docker Engine (%WAITED%s)..."
goto :wait_docker

:docker_ready

:: --------------------------------------------------------
::  ETAPA 3: Docker Compose
:: --------------------------------------------------------
call :log "[3/7] Subindo containers Docker..."

set "ALL_RUNNING=1"
for %%c in (%EXPECTED_CONTAINERS%) do (
    docker inspect --format "{{.State.Status}}" %%c 2>nul | findstr "running" >nul 2>nul
    if !errorlevel! neq 0 set "ALL_RUNNING=0"
)

if "!ALL_RUNNING!"=="1" (
    call :log "  OK: Containers ja estao rodando"
    goto :containers_ready
)

%COMPOSE_CMD% up -d %DOCKER_SERVICES% >> "%LOG_FILE%" 2>&1
if !errorlevel! neq 0 (
    call :log "ERRO: Falha ao executar docker compose up"
    goto :fail_silent
)

:: --------------------------------------------------------
::  ETAPA 4: Saude dos containers
:: --------------------------------------------------------
call :log "[4/7] Verificando saude dos containers..."

set /a "REDIS_WAIT=0"
:wait_redis_auto
timeout /t 3 /nobreak >nul
set /a "REDIS_WAIT+=3"
for /f "tokens=*" %%h in ('docker inspect --format "{{.State.Health.Status}}" astrum-redis 2^>nul') do (
    if "%%h"=="healthy" goto :redis_healthy_auto
)
if !REDIS_WAIT! geq 90 (
    call :log "WARN: Redis nao ficou saudavel em 90s, continuando..."
    goto :redis_healthy_auto
)
call :log "  ...Redis iniciando (%REDIS_WAIT%s)..."
goto :wait_redis_auto
:redis_healthy_auto

for %%c in (%EXPECTED_CONTAINERS%) do (
    for /f "tokens=*" %%s in ('docker inspect --format "{{.State.Status}}" %%c 2^>nul') do (
        call :log "  Container %%c: %%s"
    )
)

:containers_ready
call :log "  OK: Containers verificados"

:: --------------------------------------------------------
::  ETAPA 5: Backend Node.js
:: --------------------------------------------------------
call :log "[5/7] Iniciando backend Node.js..."

curl -sf %HEALTH_EXPRESS% >nul 2>nul
if !errorlevel! equ 0 (
    call :log "  OK: Backend ja esta rodando"
    goto :backend_ready_auto
)

wscript "%~dp0launch_hidden.vbs" "server" "%~dp0run_backend.bat"

call :log "  Aguardando backend iniciar..."
set /a "BACKEND_WAIT=0"
:wait_backend_auto
timeout /t 5 /nobreak >nul
set /a "BACKEND_WAIT+=5"
curl -sf %HEALTH_EXPRESS% >nul 2>nul
if !errorlevel! equ 0 goto :backend_ok_auto
if !BACKEND_WAIT! geq 120 (
    call :log "WARN: Backend nao respondeu em 120s - verifique manualmente"
    goto :backend_ready_auto
)
call :log "  ...backend iniciando (%BACKEND_WAIT%s)..."
goto :wait_backend_auto

:backend_ok_auto
call :log "  OK: Backend respondeu em %BACKEND_WAIT%s"
:backend_ready_auto

:: --------------------------------------------------------
::  ETAPA 6: Cloudflare Tunnel
:: --------------------------------------------------------
call :log "[6/7] Iniciando Cloudflare Tunnel..."

tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr "cloudflared" >nul 2>nul
if !errorlevel! equ 0 (
    call :log "  OK: Tunnel ja esta ativo"
    goto :tunnel_ready_auto
)

wscript "%~dp0launch_hidden.vbs" "tunnel" "%~dp0run_tunnel.bat"
timeout /t 8 /nobreak >nul

tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr "cloudflared" >nul 2>nul
if !errorlevel! equ 0 (
    call :log "  OK: Tunnel iniciado (astrum-api -> %URL_API%)"
) else (
    call :log "WARN: cloudflared pode nao ter iniciado - verifique manualmente"
)

:tunnel_ready_auto

:: --------------------------------------------------------
::  ETAPA 7: Verificacao final
:: --------------------------------------------------------
call :log "[7/7] Verificacao final..."

set "EXPRESS_OK=0"
set "FASTIFY_OK=0"
curl -sf %HEALTH_EXPRESS% >nul 2>nul && set "EXPRESS_OK=1"
curl -sf %HEALTH_FASTIFY% >nul 2>nul && set "FASTIFY_OK=1"

call :log "  Express :%EXPRESS_PORT% = %EXPRESS_OK%"
call :log "  Fastify :%FASTIFY_PORT% = %FASTIFY_OK%"
call :log "  Frontend: %URL_FRONTEND%"
call :log "  API:      %URL_API%"
call :log "=== AUTOSTART CONCLUIDO - %date% %time% ==="

goto :end

:fail_silent
call :log "=== AUTOSTART FALHOU - %date% %time% ==="
goto :end

:log
echo [%date% %time%] %~1
echo [%date% %time%] %~1 >> "%LOG_FILE%" 2>nul
goto :eof

:end
endlocal
