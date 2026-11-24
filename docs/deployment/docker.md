# Docker

> ✅ **Verificado el 24/11/2026** en Windows 11 con Docker 29.9.3 / Compose v5.7.1: la build de las tres imágenes, `migrate` ("Roles de base de datos verificados. Migraciones aplicadas."), `web` y `worker` en estado *healthy*, `GET /api/health` y `GET :8081/health` → `{"status":"ok","checks":{"database":"ok"}}`. La suite completa (`pnpm test`, 75 tests incluidos los de RLS) pasa contra el PostgreSQL del contenedor, ya que `.env` apunta a `localhost:5432`.
>
> No arranques a la vez `pnpm db:local` y el contenedor `postgres` si usan el mismo puerto.

```bash
pnpm env:init                    # si no existe .env
docker compose up -d --build     # postgres → migrate (una vez) → web + worker
docker compose ps                # web y worker deben quedar "healthy"
curl http://localhost:3000/api/health
docker compose logs migrate      # "Migraciones aplicadas."
```

## Imagen (`Dockerfile`, multi-objetivo)

| Objetivo | Contenido | Health check |
|---|---|---|
| `web` | Solo `.next/standalone` (Node 22 Alpine, usuario `node`) | `GET /api/health` |
| `worker` | Árbol compilado completo con `tsx` (optimizar en Fase 7) | `GET :8081/health` |
| `migrate` | Ejecuta `pnpm db:migrate` con el rol propietario y termina | — |

Los servicios web y worker solo reciben las URLs de sus roles (`facturalibre_app`, `facturalibre_worker`); la URL del propietario solo la recibe `migrate`. Puertos publicados solo en `127.0.0.1`.

## Producción (⏳ Fase 7)

HTTPS obligatorio (proxy inverso), secretos desde el orquestador, PostgreSQL gestionado con copias de seguridad PITR y pruebas de restauración periódicas, `FACTURALIBRE_ENV=production` solo en producción, migraciones como paso previo y separado del despliegue.
