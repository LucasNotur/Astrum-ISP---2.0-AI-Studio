@echo off
chcp 65001 >nul 2>nul
title Tunnel API (3001)

echo ========================================================
echo  TUNNEL API — Fastify (porta 3001)
echo ========================================================
echo.
echo  Copie a URL https://xxx.trycloudflare.com que aparecer
echo  e cole no Vercel Dashboard como VITE_API_URL
echo.
echo  Tambem adicione essa URL em ALLOWED_ORIGINS no .env:
echo  ALLOWED_ORIGINS=http://localhost:5173,...,https://xxx.trycloudflare.com
echo.
echo ========================================================
echo.

cloudflared tunnel --url http://localhost:3001
