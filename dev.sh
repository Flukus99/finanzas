#!/usr/bin/env bash
# Modo desarrollo: los cambios en el código se ven al instante en http://127.0.0.1:5173
set -euo pipefail
cd "$(dirname "$0")"
(cd backend && ./pocketbase serve --http 127.0.0.1:8090) &
trap 'kill $!' EXIT
cd frontend && npm run dev
