@echo off
:: Wrapper so para o deploy CI/CD - redireciona stdin de NUL explicitamente.
:: Sem isso, o processo herda um handle de stdin quebrado quando lancado de
:: dentro de um step do runner do GitHub Actions (nao acontece no uso normal
:: via start_astrum.bat/autostart_astrum.bat, lancados de uma sessao real) -
:: o tsx watch tenta escutar o stdin e morre com "nao ha suporte para o
:: redirecionamento de entrada", entrando em loop de crash.
cd /d E:\Saas\AstrumISP\apps\api
npm run dev < NUL
