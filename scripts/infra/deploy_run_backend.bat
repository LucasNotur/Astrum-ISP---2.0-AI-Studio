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
cd /d E:\Saas\AstrumISP\apps\api
npx tsx src/server.ts < NUL
