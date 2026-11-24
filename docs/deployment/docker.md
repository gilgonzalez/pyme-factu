# Docker

> ⚠️ **No verificado**: Docker no está instalado en el equipo donde se preparó la Fase 1. `Dockerfile` y `docker-compose.yml` están escritos según la documentación oficial (Next.js standalone, imagen `postgres:18-alpine`) pero ni la build ni el arranque se han ejecutado. Primera tarea al disponer de Docker: ejecutar los comandos de abajo y corregir lo que falle.

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
