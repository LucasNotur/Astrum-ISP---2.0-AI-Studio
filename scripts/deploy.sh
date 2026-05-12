#!/bin/bash
echo "Iniciando deploy..."

# 1. Build
npm run build
if [ $? -ne 0 ]; then echo "Build falhou. Abortando."; exit 1; fi

# 2. Rodar testes de regressão
npm run test:regression
if [ $? -ne 0 ]; then echo "Testes falharam. Abortando deploy."; exit 1; fi

# 3. Enviar SIGTERM para processo atual (graceful shutdown)
PID=$(cat /tmp/astrum.pid 2>/dev/null)
if [ ! -z "$PID" ]; then
  kill -SIGTERM $PID
  sleep 5
fi

# 4. Subir nova versão
node dist/server.js &
echo $! > /tmp/astrum.pid

echo "Deploy concluído. PID: $(cat /tmp/astrum.pid)"
