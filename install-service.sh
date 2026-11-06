#!/usr/bin/env bash
# Deja la app corriendo siempre en este PC (Linux con systemd):
# compila, crea el servicio de usuario y lo arranca. Se vuelve a iniciar solo al prender el PC.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"
[ -x backend/pocketbase ] || ./setup.sh
(cd frontend && npm run build)
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/finanzas.service <<UNIT
[Unit]
Description=Finanzas (PocketBase + app web)
After=network-online.target

[Service]
WorkingDirectory=$DIR/backend
ExecStart=$DIR/backend/pocketbase serve --http 127.0.0.1:8090
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now finanzas.service
# Para que siga corriendo aunque no hayas iniciado sesión (servidor de la casa):
loginctl enable-linger "$USER" 2>/dev/null || echo "(opcional) ejecuta: sudo loginctl enable-linger $USER"
echo "Listo: http://127.0.0.1:8090  ·  logs: journalctl --user -u finanzas -f"
