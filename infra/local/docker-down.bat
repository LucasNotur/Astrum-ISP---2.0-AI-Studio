@echo off
chcp 65001 >nul 2>nul
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || exit /b 1

echo Parando Redis + Qdrant...
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop redis qdrant
echo OK — Docker parado (volumes preservados).

popd
pause
