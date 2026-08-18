@echo off
setlocal enabledelayedexpansion
title Astrum - Iniciando...
color 0A

:: ========================================================
::  start_astrum.bat - Inicializacao completa do ambiente dev
::
::  Etapas:
::    1. Verifica pre-requisitos (Docker, Node, cloudflared)
::    2. Inicia Docker Desktop se necessario
::    3. Sobe containers (Redis, Qdrant) via compose
::    4. Verifica saude dos containers
::    5. Inicia backend Node.js (Fastify)
::    6. Abre tunnel Cloudflare
::    7. Exibe painel de status final
::
::  Idempotente: pode ser executado varias vezes sem duplicar.
:: ========================================================

:: Carrega config
call "%~dp0astrum.config.bat"

:: Cria pasta de logs se nao existir
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: Timestamp para o log
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "LOG_DATE=%%a-%%b-%%c"
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "LOG_TIME=%%a-%%b"
set "LOG_FILE=%LOG_DIR%\start_%LOG_DATE%_%LOG_TIME%.log"

call :banner
call :log "Inicio: %date% %time%"

:: --------------------------------------------------------
::  ETAPA 1: Pre-requisitos
:: --------------------------------------------------------
call :step "1/7" "Verificando pre-requisitos"

where docker >nul 2>nul || (
    call :error "Docker nao encontrado! Instale o Docker Desktop."
    goto :fail
)
where node >nul 2>nul || (
    call :error "Node.js nao encontrado!"
    goto :fail
)
where cloudflared >nul 2>nul || (
    call :error "cloudflared nao encontrado! Instale com: winget install Cloudflare.cloudflared"
    goto :fail
)
call :ok "Docker, Node.js e cloudflared instalados"

:: --------------------------------------------------------
::  ETAPA 2: Docker Desktop
:: --------------------------------------------------------
call :step "2/7" "Verificando Docker Desktop"

docker info >nul 2>nul
if !errorlevel! equ 0 (
    call :ok "Docker Engine ja esta rodando"
    goto :docker_ready
)

call :log "    Docker Desktop nao esta rodando, iniciando..."
if exist "%DOCKER_DESKTOP_PATH%" (
    start "" "%DOCKER_DESKTOP_PATH%"
) else (
    call :error "Docker Desktop nao encontrado em: %DOCKER_DESKTOP_PATH%"
    call :error "Edite DOCKER_DESKTOP_PATH em astrum.config.bat"
    goto :fail
)

set /a "WAITED=0"
:wait_docker
timeout /t 3 /nobreak >nul
set /a "WAITED+=3"
docker info >nul 2>nul
if !errorlevel! equ 0 (
    call :ok "Docker Engine disponivel (aguardou %WAITED%s)"
    goto :docker_ready
)
if !WAITED! geq %DOCKER_STARTUP_TIMEOUT% (
    call :error "Docker nao iniciou em %DOCKER_STARTUP_TIMEOUT%s"
    goto :fail
)
echo       ...aguardando Docker Engine (%WAITED%s)...
goto :wait_docker

:docker_ready

:: --------------------------------------------------------
::  ETAPA 3: Docker Compose
:: --------------------------------------------------------
call :step "3/7" "Subindo containers Docker"

set "ALL_RUNNING=1"
for %%c in (%EXPECTED_CONTAINERS%) do (
    docker inspect --format "{{.State.Status}}" %%c 2>nul | findstr "running" >nul 2>nul
    if !errorlevel! neq 0 set "ALL_RUNNING=0"
)

if "!ALL_RUNNING!"=="1" (
    call :ok "Containers ja estao rodando"
    goto :containers_ready
)

%COMPOSE_CMD% up -d %DOCKER_SERVICES% >> "%LOG_FILE%" 2>&1
if !errorlevel! neq 0 (
    call :error "Falha ao executar docker compose up"
    call :error "Verifique: %LOG_FILE%"
    goto :fail
)

:: --------------------------------------------------------
::  ETAPA 4: Saude dos containers
:: --------------------------------------------------------
call :step "4/7" "Verificando saude dos containers"

set /a "REDIS_WAIT=0"
:wait_redis
timeout /t 2 /nobreak >nul
set /a "REDIS_WAIT+=2"
for /f "tokens=*" %%h in ('docker inspect --format "{{.State.Health.Status}}" astrum-redis 2^>nul') do (
    if "%%h"=="healthy" goto :redis_healthy
)
if !REDIS_WAIT! geq 60 (
    call :error "Redis nao ficou saudavel em 60s"
    goto :fail
)
echo       ...Redis iniciando (%REDIS_WAIT%s)...
goto :wait_redis
:redis_healthy

set "CONTAINER_ERRORS=0"
for %%c in (%EXPECTED_CONTAINERS%) do (
    for /f "tokens=*" %%s in ('docker inspect --format "{{.State.Status}}" %%c 2^>nul') do (
        if "%%s"=="running" (
            call :container_ok "%%c"
        ) else (
            call :container_fail "%%c" "%%s"
            set /a "CONTAINER_ERRORS+=1"
        )
    )
)

if !CONTAINER_ERRORS! gtr 0 (
    call :error "!CONTAINER_ERRORS! container(s) com problema"
    call :error "Execute: docker compose logs [container]"
    goto :fail
)

:containers_ready
call :ok "Todos os containers saudaveis"

:: --------------------------------------------------------
::  ETAPA 5: Backend Node.js
:: --------------------------------------------------------
call :step "5/7" "Iniciando backend Node.js"

curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 (
    call :ok "Backend ja esta rodando"
    goto :backend_ready
)

wscript "%~dp0launch_hidden.vbs" "server" "%~dp0run_backend.bat"

call :log "    Aguardando backend iniciar..."
set /a "BACKEND_WAIT=0"
:wait_backend
timeout /t 3 /nobreak >nul
set /a "BACKEND_WAIT+=3"
curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 goto :backend_ok
if !BACKEND_WAIT! geq 90 (
    call :error "Backend nao respondeu em 90s"
    call :error "Verifique a janela 'Astrum Server' para erros"
    goto :fail
)
echo       ...backend iniciando (%BACKEND_WAIT%s)...
goto :wait_backend

:backend_ok
:backend_ready

set "BACKEND_OK=0"
curl -sf %HEALTH_BACKEND% >nul 2>nul && set "BACKEND_OK=1"

if "!BACKEND_OK!"=="1" (call :ok "Fastify :%BACKEND_PORT%") else (call :warn "Fastify :%BACKEND_PORT% nao respondeu")

:: --------------------------------------------------------
::  ETAPA 6: Cloudflare Tunnel
:: --------------------------------------------------------
call :step "6/7" "Configurando Cloudflare Tunnel"

tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr "cloudflared" >nul 2>nul
if !errorlevel! equ 0 (
    call :ok "Tunnel Cloudflare ja esta ativo"
    goto :tunnels_ready
)

wscript "%~dp0launch_hidden.vbs" "tunnel" "%~dp0run_tunnel.bat"
timeout /t 4 /nobreak >nul

call :ok "Tunnel iniciado (astrum-api -> localhost:%BACKEND_PORT%)"

:tunnels_ready

:: --------------------------------------------------------
::  ETAPA 7: Painel final
:: --------------------------------------------------------
call :step "7/7" "Verificacao final"

echo.
echo  ===================================
echo    ASTRUM INICIADA COM SUCESSO
echo  ===================================
echo.
echo   Frontend:
echo     %URL_FRONTEND%
echo.
echo   API:
echo     %URL_API%
echo     Local Backend:  http://localhost:%BACKEND_PORT%
echo.
echo   Containers:

for %%c in (%EXPECTED_CONTAINERS%) do (
    for /f "tokens=*" %%s in ('docker inspect --format "{{.State.Status}}" %%c 2^>nul') do (
        if "%%s"=="running" (
            echo     + %%c
        ) else (
            echo     X %%c [%%s]
        )
    )
)

echo.
echo   Backend:
if "!BACKEND_OK!"=="1" (echo     + Fastify :%BACKEND_PORT%) else (echo     ~ Fastify :%BACKEND_PORT% [iniciando])

echo.
echo   Cloudflare:
tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr "cloudflared" >nul 2>nul
if !errorlevel! equ 0 (
    echo     + Tunnel online: %URL_API%
) else (
    echo     X Tunnel offline
)

echo.
echo   Logs: %LOG_DIR%
echo.
echo   Para parar: scripts\infra\stop_astrum.bat
echo   Para status: scripts\infra\status_astrum.bat
echo  ===================================
echo.

call :log "Fim: %date% %time%"
goto :end

:: ========================================================
::  Funcoes auxiliares
:: ========================================================

:banner
echo.
echo  ========================================================
echo       ASTRUM ISP - Inicializacao do Ambiente Dev
echo  ========================================================
echo.
goto :eof

:step
echo  [%~1] %~2...
echo [%date% %time%] [%~1] %~2 >> "%LOG_FILE%" 2>nul
goto :eof

:log
echo %~1
echo [%date% %time%] %~1 >> "%LOG_FILE%" 2>nul
goto :eof

:ok
echo     + %~1
echo [%date% %time%] OK: %~1 >> "%LOG_FILE%" 2>nul
goto :eof

:warn
echo     ~ %~1
echo [%date% %time%] WARN: %~1 >> "%LOG_FILE%" 2>nul
goto :eof

:error
echo     X ERRO: %~1
echo [%date% %time%] ERRO: %~1 >> "%LOG_FILE%" 2>nul
goto :eof

:container_ok
echo       + %~1: running
goto :eof

:container_fail
echo       X %~1: %~2
goto :eof

:fail
echo.
echo  ========================================================
echo    FALHA NA INICIALIZACAO - Verifique os erros acima
echo  ========================================================
echo    Log: %LOG_FILE%
echo.
pause
exit /b 1

:end
endlocal
pause
