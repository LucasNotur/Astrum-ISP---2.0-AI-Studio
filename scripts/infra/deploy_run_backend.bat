@echo off
:: Wrapper so para o deploy CI/CD.
::
:: NAO usa "npm run dev" (= "tsx watch") de proposito: o watch mode fica
:: escutando o teclado pra hot-reload, e isso e fundamentalmente instavel
:: rodando sem uma janela de console de verdade por muito tempo - morre
:: sozinho depois de alguns minutos, independente de como foi lancado
:: (testado ao vivo: caiu tanto via wscript quanto via lancamento manual
:: direto). "tsx" sem watch (so roda e fica de pe servindo, sem escutar
:: teclado) ficou de pe >5min em teste isolado, estavel.
::
:: < NUL: redireciona stdin de NUL explicitamente (defensivo, nao doeu).
::
:: NOVO (2026-08-28): stdout/stderr agora vao pra logs/backend-boot.log
:: (append). Antes o processo rodava sem NENHUM log capturado quando
:: lancado via Task Scheduler (schtasks /it) - um boot lento ou travado
:: (ex.: retry de conexao do Redis, erro de import) era completamente
:: invisivel; so dava pra saber "demorou Xs" via deploy.log, nunca "por
:: que". Ver astrum-pipeline-cicd na memoria do Claude Code.
::
:: NOVO (2026-08-28): chama o tsx.cmd direto (caminho absoluto, hoisted
:: na raiz do workspace) em vez de "npx tsx" - poupa a resolucao do npx
:: (spawna o proprio CLI do npm so pra descobrir e re-executar o binario
:: local, uma camada inteira de processo a mais toda vez).
call "%~dp0astrum.config.bat"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
cd /d E:\Saas\AstrumISP\apps\api
echo [%date% %time%] === BOOT === >> "%LOG_DIR%\backend-boot.log"
"%ASTRUM_ROOT%\node_modules\.bin\tsx.cmd" src\server.ts < NUL >> "%LOG_DIR%\backend-boot.log" 2>&1
