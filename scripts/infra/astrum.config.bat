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

:: Portas do backend
set "EXPRESS_PORT=3000"
set "FASTIFY_PORT=3001"

:: Health check URLs
set "HEALTH_EXPRESS=http://localhost:%EXPRESS_PORT%/api/health"
set "HEALTH_FASTIFY=http://localhost:%FASTIFY_PORT%/api/v2/health"

:: Cloudflare Tunnel
set "TUNNEL_API_PORT=%FASTIFY_PORT%"
set "TUNNEL_WEBHOOK_PORT=%EXPRESS_PORT%"

:: Docker Desktop
set "DOCKER_DESKTOP_PATH=C:\Program Files\Docker\Docker\Docker Desktop.exe"
set "DOCKER_STARTUP_TIMEOUT=120"

:: Logs
set "LOG_DIR=%ASTRUM_ROOT%\logs"

:: URLs publicas (informacional)
set "URL_FRONTEND=https://astrumlabs.online"
set "URL_API=https://api.astrumlabs.online"
