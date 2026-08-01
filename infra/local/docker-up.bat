@echo off
chcp 65001 >nul 2>nul
title Astrum — Docker
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || exit /b 1

echo Subindo Redis + Qdrant...
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis qdrant
echo.
echo Aguardando health check...

:wait
timeout /t 2 /nobreak >nul
for /f "tokens=*" %%h in ('docker inspect --format "{{.State.Health.Status}}" astrum-redis 2^>nul') do (
    if "%%h"=="healthy" goto ok
)
goto wait
:ok
echo Redis: healthy   (localhost:6379)
echo Qdrant: running  (localhost:6333)

popd
pause
