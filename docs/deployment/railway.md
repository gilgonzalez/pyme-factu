# Railway

> ⏳ **Sin verificar todavía en Railway.** Configuración preparada el 25/11/2026; actualiza esta nota tras el primer despliegue.

Railway sustituye a `docker-compose.prod.yml`: pone HTTPS y dominio (sin proxy inverso propio) y ejecuta cada objetivo del `Dockerfile` como un servicio. Las migraciones **no** las ejecuta Railway sino el workflow [`deploy.yml`](../../.github/workflows/deploy.yml), para que la URL del rol propietario nunca llegue a `web` ni a `worker`.

```
push a main → CI ✅ → deploy.yml: pnpm db:migrate (propietario) → railway up web + worker
```

## 1. Proyecto en Railway

| Servicio | Origen | Ajustes |
|---|---|---|
| `Postgres` | Base de datos de Railway | **PostgreSQL 18 obligatorio** (las migraciones usan `uuidv7()`). Activa el *TCP proxy* público solo para que GitHub Actions ejecute las migraciones |
| `web` | Servicio vacío (**sin** conectar el repositorio) | Config-as-code: `/railway/web.json`. Dominio público |
| `worker` | Servicio vacío (**sin** conectar el repositorio) | Config-as-code: `/railway/worker.json`. Sin dominio público |

Los servicios no se conectan al repositorio: si lo estuvieran, Railway desplegaría cada push **antes** de que se apliquen las migraciones. Los despliega `railway up` desde GitHub Actions.

## 2. Variables de Railway

Variables compartidas del entorno (*Shared Variables*): `APP_DB_PASSWORD`, `AUTH_DB_PASSWORD`, `WORKER_DB_PASSWORD` (≥ 16 caracteres, las **mismas** que los secretos de GitHub) y `CERTIFICATE_KEK` (`openssl rand -base64 32`; guárdala también fuera de Railway: si se pierde, hay que volver a subir los certificados).

**web**

| Variable | Valor |
|---|---|
| `TARGET` | `web` (argumento de build: elige el objetivo del `Dockerfile`) |
| `FACTURALIBRE_ENV` | `test` hasta validar con el portal de pruebas de la AEAT; después `production` |
| `APP_DATABASE_URL` | `postgresql://facturalibre_app:${{shared.APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:5432/${{Postgres.PGDATABASE}}` |
| `AUTH_DATABASE_URL` | `postgresql://facturalibre_auth:${{shared.AUTH_DB_PASSWORD}}@${{Postgres.PGHOST}}:5432/${{Postgres.PGDATABASE}}` |
| `APP_BASE_URL` | `https://<dominio>` |
| `AUTH_SECRET` | ≥ 32 caracteres aleatorios |
| `SMTP_URL` · `MAIL_FROM` | Servidor de correo real (con SPF, DKIM y DMARC en el dominio) |
| `CERTIFICATE_KEK` | `${{shared.CERTIFICATE_KEK}}` |
| `SIF_PRODUCER_NAME` · `SIF_PRODUCER_NIF` · `SIF_VERSION` · `SIF_DECLARATION_URL` | Ver la tabla de producción en [docker.md](docker.md) |

**worker**

| Variable | Valor |
|---|---|
| `TARGET` | `worker` |
| `FACTURALIBRE_ENV` | El mismo que `web` |
| `WORKER_DATABASE_URL` | `postgresql://facturalibre_worker:${{shared.WORKER_DB_PASSWORD}}@${{Postgres.PGHOST}}:5432/${{Postgres.PGDATABASE}}` |
| `CERTIFICATE_KEK` | `${{shared.CERTIFICATE_KEK}}` |

`web` y `worker` usan la red privada (`PGHOST`); ninguno recibe la URL del propietario. El health check del worker escucha en el `PORT` que asigna Railway.

Con `FACTURALIBRE_ENV=production`, `web` **no arranca** si falta un dato obligatorio ([`instrumentation.ts`](../../apps/web/instrumentation.ts)) y `worker` exige `CERTIFICATE_KEK`.

## 3. GitHub

Crea el entorno `production` (Settings → Environments; añade revisores si quieres aprobar cada despliegue) con estos secretos:

| Secreto | Valor |
|---|---|
| `RAILWAY_TOKEN` | Token de **proyecto** de Railway (Project Settings → Tokens) del entorno de producción |
| `DATABASE_URL` | URL del propietario por el TCP proxy público (`postgresql://postgres:…@….proxy.rlwy.net:<puerto>/railway`) |
| `APP_DB_PASSWORD` · `AUTH_DB_PASSWORD` · `WORKER_DB_PASSWORD` | Las mismas que en Railway: `db:migrate` fija estas contraseñas en cada despliegue |

El primer despliegue se lanza a mano (Actions → *Despliegue (Railway)* → *Run workflow*); los siguientes, solos tras cada CI correcto en `main`.

## 4. Copias de seguridad

Las copias de volumen de Railway son instantáneas, no PITR. Añade un `pg_dump` periódico a un almacenamiento externo y prueba la restauración.
