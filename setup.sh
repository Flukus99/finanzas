#!/usr/bin/env bash
# Prepara el proyecto en un equipo nuevo: descarga PocketBase e instala dependencias.
set -euo pipefail
cd "$(dirname "$0")"
PB_VERSION=0.40.6
if [ ! -x backend/pocketbase ]; then
  case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) arch=armv7 ;; esac
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  echo "Descargando PocketBase $PB_VERSION ($os/$arch)…"
  curl -fsSL -o /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os}_${arch}.zip"
  unzip -oq /tmp/pb.zip pocketbase -d backend && rm /tmp/pb.zip
fi
(cd frontend && npm install)
echo "Listo. Arranca con ./start.sh"
