@echo off
chcp 65001 >nul 2>nul
title Astrum Server
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || exit /b 1

echo Iniciando Express:3000 + Fastify:3001...
echo (Ctrl+C para parar)
echo.
npm run dev
