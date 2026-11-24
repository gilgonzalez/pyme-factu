# Migraciones

| Migración | Contenido | Estado |
|---|---|---|
| `20261124000000_init` | Tablas, enums, índices y FKs generados por `prisma migrate diff --from-empty` | ✅ |
| `20261124000100_security_rls` | CHECKs e índices parciales, esquema `app` con funciones de contexto, auditoría append-only (triggers), GRANTs por rol, RLS y políticas | ✅ |
| `20261124000200_taxpayer_access_level` | Unifica el cálculo del nivel de acceso a contribuyentes en `app.taxpayer_access_level` (elimina SQL duplicado; mismo comportamiento) | ✅ |

## Procedimiento

1. Editar `schema.prisma`.
2. Generar el SQL: `pnpm --filter @facturalibre/database exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (contra una BD al día) y guardarlo en `prisma/migrations/<timestamp>_<nombre>/migration.sql`.
3. Añadir **en la misma migración** RLS, políticas y GRANTs de cada tabla nueva.
4. `pnpm db:migrate` (crea/actualiza roles y ejecuta `prisma migrate deploy`). Es idempotente.
5. Verificar que no hay deriva: el `migrate diff` contra el esquema debe devolver `-- This is an empty migration.`

Reglas: las migraciones aplicadas son **inmutables** (para corregir, nueva migración). Nunca `prisma migrate reset` ni `db push` fuera de una BD local desechable.

## Roles y orden de arranque

`ensureDatabaseRoles` (en `src/bootstrap.ts`) crea/actualiza `facturalibre_app`, `facturalibre_auth`, `facturalibre_worker` con `LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT` y contraseña (≥ 16 caracteres) **antes** de migrar, porque las migraciones les conceden permisos. El rol que migra es el propietario de las tablas y nunca se usa en ejecución.

## Resultado verificado (24/11/2026)

- BD local (`pnpm db:local`, PostgreSQL 18.x embebido): 3 migraciones aplicadas; segunda ejecución sin cambios; `prisma migrate status` → *Database schema is up to date*; `migrate diff` → vacío.
- Cada ejecución de pruebas crea una BD nueva y aplica las migraciones desde cero.
- Docker Compose (servicio `migrate`): **no ejecutado** (Docker no disponible en el equipo).
