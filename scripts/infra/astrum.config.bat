@echo off
:: ========================================================
::  astrum.config.bat - Configuracao centralizada
::  Edite APENAS este arquivo para mudar portas, caminhos, etc.
:: ========================================================

:: Diretorio raiz do projeto (resolvido automaticamente: 2 niveis acima)
set "ASTRUM_ROOT=%~dp0..\.."
pushd "%ASTRUM_ROOT%" >nul 2>nul
set "ASTRUM_ROOT=%CD%"
popd >nul

:: Compose files
set "COMPOSE_BASE=%ASTRUM_ROOT%\docker-compose.yml"
set "COMPOSE_DEV=%ASTRUM_ROOT%\docker-compose.dev.yml"
set "COMPOSE_CMD=docker compose -f "%COMPOSE_BASE%" -f "%COMPOSE_DEV%""

:: Servicos Docker para dev local (separados por espaco)
:: Zep: removido (imagem privada + ZEP_POSTGRES_DSN vazio)
:: Evolution: removido (ja roda em container separado "evolution_api" na porta 8080)
set "DOCKER_SERVICES=redis qdrant"

:: Containers esperados (para checagem de saude)
set "EXPECTED_CONTAINERS=astrum-redis astrum-qdrant"

:: Porta do backend (Fastify — unico backend desde a Fase 4 / 2026-08-17;
:: Express raiz aposentado, server.ts + src/routes/* apagados)
set "BACKEND_PORT=3001"

:: Health check URL
set "HEALTH_BACKEND=http://localhost:%BACKEND_PORT%/api/health"

:: Cloudflare Tunnel (aponta pro Fastify — webhooks e /api/v2 no mesmo processo)
set "TUNNEL_API_PORT=%BACKEND_PORT%"

:: Docker Desktop
set "DOCKER_DESKTOP_PATH=C:\Program Files\Docker\Docker\Docker Desktop.exe"
set "DOCKER_STARTUP_TIMEOUT=120"

:: Logs
set "LOG_DIR=%ASTRUM_ROOT%\logs"

:: URLs publicas (informacional)
set "URL_FRONTEND=https://astrumlabs.online"
set "URL_API=https://api.astrumlabs.online"
