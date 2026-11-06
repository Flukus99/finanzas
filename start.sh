#!/usr/bin/env bash
# Compila la app y arranca el servidor en http://127.0.0.1:8090
# Uso: ./start.sh            → solo este PC
#      ./start.sh 0.0.0.0    → también accesible desde otros dispositivos de la red
set -euo pipefail
cd "$(dirname "$0")"
HOST=${1:-127.0.0.1}
(cd frontend && npm run build)
cd backend && exec ./pocketbase serve --http "$HOST:8090"
