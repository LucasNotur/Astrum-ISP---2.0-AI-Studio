@echo off
chcp 65001 >nul 2>nul
title Astrum Backend — Painel de Controle
color 0A

echo.
echo  ========================================================
echo           ASTRUM ISP — Backend Local + Tunnel
echo  ========================================================
echo   Express (legado)   porta 3000
echo   Fastify (v2 API)   porta 3001
echo   Redis              porta 6379
echo   Qdrant             porta 6333
echo   Tunnel API         cloudflared - 3001 (frontend usa)
echo   Tunnel Webhooks    cloudflared - 3000 (WhatsApp usa)
echo  ========================================================
echo.

:: Resolve o diretorio raiz do projeto (2 niveis acima deste .bat)
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || (echo ERRO: Nao encontrei o projeto em %ROOT% & pause & exit /b 1)
set "ROOT=%CD%"

echo [1/5] Verificando pre-requisitos...
where docker >nul 2>nul || (echo    ERRO: Docker nao encontrado! Instale o Docker Desktop. & pause & exit /b 1)
where node >nul 2>nul || (echo    ERRO: Node.js nao encontrado! & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo    ERRO: cloudflared nao encontrado! Instale com: winget install Cloudflare.cloudflared & pause & exit /b 1)

docker info >nul 2>nul || (
    echo    ERRO: Docker Desktop nao esta rodando! Abra o Docker Desktop primeiro.
    pause & exit /b 1
)
echo    OK — Docker, Node.js e cloudflared encontrados.
echo.

echo [2/5] Subindo Docker (Redis + Qdrant)...
docker compose -f "%ROOT%\docker-compose.yml" -f "%ROOT%\docker-compose.dev.yml" up -d redis qdrant
echo    Aguardando Redis ficar saudavel...

:wait_redis
timeout /t 2 /nobreak >nul
for /f "tokens=*" %%h in ('docker inspect --format "{{.State.Health.Status}}" astrum-redis 2^>nul') do (
    if "%%h"=="healthy" goto redis_ok
)
echo       ...Redis ainda iniciando...
goto wait_redis
:redis_ok
echo    OK — Redis e Qdrant rodando.
echo.

echo [3/5] Subindo servidor Node.js (Express:3000 + Fastify:3001)...
start "Astrum Server" cmd /k "cd /d "%ROOT%" && npm run dev"
echo    Aguardando servidor iniciar (pode levar ~10s)...
timeout /t 8 /nobreak >nul

:wait_server
curl -sf http://localhost:3000/api/health >nul 2>nul
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    echo       ...servidor ainda iniciando...
    goto wait_server
)
echo    OK — Express:3000 + Fastify:3001 rodando.
echo.

echo [4/5] Abrindo tunnel Cloudflare para API (porta 3001)...
echo    Este tunnel gera a URL que o frontend Vercel vai usar.
start "Tunnel API (3001)" cmd /k "echo === TUNNEL API — Copie a URL abaixo e cole no Vercel como VITE_API_URL === && echo. && cloudflared tunnel --url http://localhost:3001"
timeout /t 4 /nobreak >nul

echo [5/5] Abrindo tunnel Cloudflare para Webhooks (porta 3000)...
echo    Este tunnel recebe os webhooks do WhatsApp/Evolution.
start "Tunnel Webhooks (3000)" cmd /k "echo === TUNNEL WEBHOOKS — Configure esta URL na Evolution API === && echo. && cloudflared tunnel --url http://localhost:3000"
timeout /t 3 /nobreak >nul

echo.
echo  ========================================================
echo              BACKEND ONLINE!
echo  ========================================================
echo.
echo   3 janelas abriram:
echo.
echo   [Astrum Server]       — Logs do Node.js
echo   [Tunnel API (3001)]   — Copie a URL https://xxx.trycloudflare.com
echo                           e cole no Vercel como VITE_API_URL
echo   [Tunnel Webhooks]     — Configure na Evolution API
echo.
echo   IMPORTANTE: A URL do tunnel muda cada vez que reinicia.
echo   Atualize VITE_API_URL no Vercel apos cada reinicio.
echo.
echo   Para parar tudo: execute PARAR.bat
echo  ========================================================
echo.

popd
pause
