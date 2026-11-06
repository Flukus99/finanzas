# Finanzas

App personal de finanzas para celular y PC. Funciona sin conexión y sincroniza entre dispositivos.
Todo corre en tu propio equipo: no hay servicios de terceros.

## Funciones

- **Primer uso obligatorio:** cuánto dinero hay en cada cuenta y cuándo/cuánto ingresa (mensual o quincenal).
- **Cada gasto pregunta de qué cuenta sale** y muestra cuánto queda.
- **Fijos:** gastos mensuales (arriendo, tarjetas, suscripciones…), anuales (SOAT, seguros, impuestos…) e ingresos,
  con su fecha, emoji y botón de pagar/recibir.
- **Transferencias** entre cuentas (Banco → Nequi, cajero → Efectivo) sin gasto ni ingreso falso; la comisión sí es gasto.
- **4x1000:** cada cuenta dice si paga, está exenta o exenta hasta un tope mensual (Nequi); se calcula solo en gastos, transferencias y retiros.
- **Tarjetas de crédito:** compras y suscripciones con tarjeta (a N cuotas) quedan como deuda, no salen de la cuenta; extracto estimado por corte y pago, cupo disponible; pagar la tarjeta no es un gasto nuevo (los intereses sí).
- **Deudas:** créditos, tarjetas y préstamos con cuota manual; sus cuotas salen en los gastos fijos mensuales hasta la última.
- **Análisis:** por mes, trimestre, semestre o año: cuánto y en qué se gastó, 4x1000 pagado, metas y en qué mes se ahorró más/menos.
- **Plan de ahorro anual:** cuánto separar cada mes para tener listo cada gasto anual en su fecha.
- **Ahorros:** colchón de emergencia, ahorros para gastos anuales (ligados al gasto) y metas (moto, zapatos…).
  Abonar saca dinero de una cuenta; retirar lo devuelve.

## Cómo está hecha

| Parte | Tecnología | Dónde |
|---|---|---|
| Servidor (base de datos, usuarios, API, tiempo real) | [PocketBase](https://pocketbase.io) | `backend/` |
| Esquema de la base de datos | Migraciones JS | `backend/pb_migrations/` |
| Datos iniciales de cada usuario | Hook JS | `backend/pb_hooks/main.pb.js` |
| Fechas de fijos, pagos y ahorros | TypeScript | `frontend/src/lib/recurring.ts` |
| App (celular y PC) | React + TypeScript + Vite + Tailwind | `frontend/src/` |
| Copia local sin conexión | Dexie (IndexedDB) | `frontend/src/lib/db.ts` |
| Sincronización | Propia | `frontend/src/lib/sync.ts` |
| Instalable como app | vite-plugin-pwa | `frontend/vite.config.ts` |

## Uso

```bash
./setup.sh      # una vez por equipo: descarga PocketBase e instala dependencias
./start.sh      # compila y sirve la app en http://127.0.0.1:8090
./dev.sh        # desarrollo con recarga en vivo en http://127.0.0.1:5173
```

Panel de administración de la base de datos: http://127.0.0.1:8090/_/
(la primera vez: `cd backend && ./pocketbase superuser upsert tu@correo.com contraseña`).

## Cómo funciona la sincronización

1. La app siempre lee y escribe en la base local del dispositivo (por eso funciona sin conexión).
2. Cada cambio queda marcado como pendiente (`_dirty`).
3. Al sincronizar, el dispositivo sube sus pendientes y baja lo que cambió en el servidor
   desde la última vez (`updated >= última sincronización`).
4. Con conexión, el servidor avisa en vivo de los cambios de los otros dispositivos.
5. Los borrados son suaves (`deleted = true`) para que también se propaguen.

Se sincroniza al abrir la app, al volver a ella, al recuperar conexión, tras cada cambio y cada minuto.

## Instalarlo en otro PC (por ejemplo, el de la casa)

Necesitas Linux (o macOS), `git`, `curl`, `unzip` y Node.js 20 o superior.

```bash
git clone https://github.com/Flukus99/finanzas.git
cd finanzas
./setup.sh              # descarga PocketBase e instala dependencias
./install-service.sh    # compila y deja la app corriendo siempre (servicio systemd)
```

La base de datos se crea vacía en `backend/pb_data/` (no está en el repo). Abre http://127.0.0.1:8090
y crea tu cuenta. Para llevar tus datos de un PC a otro, copia la carpeta `backend/pb_data/`
con la app detenida (`systemctl --user stop finanzas`).

Actualizar a una versión nueva del código:

```bash
git pull && ./install-service.sh
```

## Copias de seguridad

```bash
sqlite3 backend/pb_data/data.db ".backup backend/backups/data-$(date +%F).db"
```

`backend/backups/` tampoco se sube al repo.

## Usarlo desde el celular

La instalación como app y el modo sin conexión requieren HTTPS. Lo más fácil es [Tailscale](https://tailscale.com)
(gratis para uso personal): instálalo en el PC y en el celular con la misma cuenta y ejecuta en el PC

```bash
tailscale serve --bg 8090
```

Eso te da una dirección `https://<tu-pc>.<tu-red>.ts.net` que solo tus dispositivos pueden abrir.
