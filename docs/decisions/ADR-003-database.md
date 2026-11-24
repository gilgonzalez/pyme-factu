# ADR-003 — PostgreSQL 18 + Prisma 7 (driver adapter) + roles separados

- **Estado:** Aceptada (24/11/2026)

**Contexto.** El prompt fija PostgreSQL y Prisma. Prisma 7 exige adaptador de driver; la etiqueta `latest` de Prisma apunta a 8.0.0-rc.

**Problema.** Usar Prisma sin que su conexión eluda RLS ni filtre contexto entre peticiones; poder probar contra PostgreSQL real sin Docker.

**Alternativas.** Kysely/Drizzle (más control SQL, fuera del stack pedido); Prisma 8 RC (no estable); Supabase (descartado: no debe ser dependencia obligatoria).

**Decisión.** Prisma 7.10.1 + `@prisma/adapter-pg` sobre `pg`; PostgreSQL 18 (`uuidv7()`). Restricciones que Prisma no modela (CHECK, índices parciales, RLS, triggers, funciones) en migraciones SQL. Tres roles de ejecución sin BYPASSRLS ni propiedad de tablas, creados por `ensureDatabaseRoles` antes de migrar. Pruebas con `embedded-postgres` (binarios oficiales de PostgreSQL) o `TEST_DATABASE_URL`.

**Justificación.** Versión estable; RLS real verificable; pruebas reproducibles en Windows sin Docker.

**Consecuencias.** Las migraciones SQL manuales deben revisarse con cuidado (las aplicadas son inmutables). `embedded-postgres` solo publica versiones *beta*: es dependencia de desarrollo, nunca de producción. Clúster local forzado a UTF-8 (en Windows initdb usaba WIN1252 y la migración fallaba).
