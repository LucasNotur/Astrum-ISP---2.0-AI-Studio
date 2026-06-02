#!/bin/sh
# Injeta variáveis de ambiente runtime no index.html
# Permite configurar VITE_API_URL sem rebuildar a imagem

set -e

# Substituir placeholder no index.html (se existir)
if [ -n "$RUNTIME_API_URL" ]; then
  sed -i "s|__VITE_API_URL__|$RUNTIME_API_URL|g" /usr/share/nginx/html/index.html
fi

exec "$@"
