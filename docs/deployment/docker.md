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

**Correo (Mailpit).** El servicio `mailpit` captura todos los correos (no salen a Internet): bandeja en http://localhost:8025. Los recorridos E2E completos se ejecutan contra este stack:

```bash
E2E_BASE_URL=http://localhost:3000 E2E_EXPECT_DATABASE=1 E2E_FULL_STACK=1 pnpm e2e   # 14/14 el 24/11/2026
```

## Imagen (`Dockerfile`, multi-objetivo)

| Objetivo | Contenido | Health check |
|---|---|---|
| `web` | Solo `.next/standalone` (Node 22 Alpine, usuario `node`) | `GET /api/health` |
| `worker` | Árbol compilado completo con `tsx` (imagen grande; ⏳ empaquetarlo en un solo fichero) | `GET :8081/health` |
| `migrate` | Ejecuta `pnpm db:migrate` con el rol propietario y termina | — |

Los servicios web y worker solo reciben las URLs de sus roles (`facturalibre_app`, `facturalibre_worker`); la URL del propietario solo la recibe `migrate`. Puertos publicados solo en `127.0.0.1`.

## Producción (✅ configuración, Fase 7)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

[`docker-compose.prod.yml`](../../docker-compose.prod.yml) fija `FACTURALIBRE_ENV=production`, no publica PostgreSQL y desactiva Mailpit. Además, **se niega a arrancar** si falta alguno de estos datos, que vienen del entorno del orquestador y nunca de un fichero del repositorio:

| Variable | Para qué |
|---|---|
| `APP_BASE_URL` (https) · `AUTH_SECRET` · `SMTP_URL` · `MAIL_FROM` | Acceso, enlaces y correo reales |
| `CERTIFICATE_KEK` (32 bytes en base64) | Cifra los certificados; si se pierde, hay que volver a subirlos. Guardarla fuera de la base de datos y de sus copias |
| `SIF_PRODUCER_NAME` · `SIF_PRODUCER_NIF` · `SIF_ID` · `SIF_VERSION` | Identidad del sistema informático en cada registro (ADR-008) |
| `SIF_DECLARATION_URL` | Declaración responsable **suscrita por el productor** para esa versión (OM art. 15) |

Antes del primer despliegue real:

1. ⛔ **Productor y declaración responsable.** Identificar al productor y suscribir la declaración responsable de la versión.
2. ⛔ **Portal de pruebas de la AEAT.** Probar contra el portal de pruebas externas con `FACTURALIBRE_ENV=test` y un certificado de pruebas, sin la sobrecarga de producción.
3. **HTTPS.** Un proxy inverso termina TLS delante de `web`. Con `FACTURALIBRE_ENV=production` la web envía HSTS y `upgrade-insecure-requests`.
4. **Base de datos.** PostgreSQL gestionado, con copias PITR y pruebas de restauración periódicas.
5. **Migraciones.** Se ejecutan como paso previo y separado (servicio `migrate`, con el rol propietario).

Con `FACTURALIBRE_ENV=production` **el worker remite a la AEAT real**: ese valor solo debe existir en producción.

Para desplegar en Railway, ver [railway.md](railway.md).
